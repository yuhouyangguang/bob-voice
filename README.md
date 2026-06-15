# Bob Voice

语音转写应用，整合为单一仓库，一条命令 Docker 部署。

仓库地址：<https://github.com/yuhouyangguang/bob-voice>

```bash
git clone https://github.com/yuhouyangguang/bob-voice.git
cd bob-voice
cp .env.example .env   # 填写密钥与 DashScope API Key
./deploy.sh start
```

## 目录结构

```
bob-voice/
├── backend/            Flask + SocketIO 后端（DashScope ASR），容器内监听 5000
├── webapp/             React + Vite 前端，构建后由 nginx 托管 80，反代 /api 与 /socket.io 到后端
├── docker-compose.yml  编排两个服务（构建上下文为 ./backend、./webapp）
├── deploy.sh           一键部署脚本
├── .env.example        配置模板（复制为 .env 后填写）
└── .gitignore
```

## 架构

```
浏览器 ──▶ frontend (nginx:80) ──┬─ 静态资源 (SPA)
                                 ├─ /api/       ─▶ backend:5000
                                 └─ /socket.io/ ─▶ backend:5000 (WebSocket)
                                                      │
                                                      └─ 数据持久化卷 bob-data:/data
                                                         (SQLite + storage)
```

只有前端对外暴露端口（默认 80，可用 `APP_PORT` 改）；后端仅在 compose 内部网络可达。

## 部署

```bash
cp .env.example .env   # 首次：填写 SECRET_KEY / JWT_SECRET_KEY / DASHSCOPE_API_KEY 等
vim .env

./deploy.sh start      # 构建并启动
./deploy.sh logs       # 看日志
./deploy.sh status     # 看状态
./deploy.sh stop       # 停止（数据保留在 bob-data 卷）
```

或直接用 compose：

```bash
docker compose up -d --build
```

启动后访问 `http://<服务器>:${APP_PORT:-80}`，首次启动按 `.env` 中的 `BOOTSTRAP_ADMIN_*` 自动创建管理员，登录后请尽快改密。

## 数据与备份

后端的 SQLite 与上传文件落在命名卷 `bob-data`（容器内 `/data`），`docker compose down` 不会删除。备份：

```bash
docker run --rm -v bob-voice_bob-data:/data -v "$PWD":/backup alpine \
  tar czf /backup/bob-data-backup.tar.gz -C /data .
```
