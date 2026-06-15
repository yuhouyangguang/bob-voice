# BOB Voice Backend

基于 Flask + SQLite 的 BOB Voice 后端，参考：

- `/Users/yuhouyangguang/realtime_asr`
- `/Users/yuhouyangguang/speech-to-text`
- `/Users/yuhouyangguang/Desktop/bob-voice-webapp-PRD.md`

当前实现 DashScope Fun-ASR 文件转写与实时转写，并通过 provider 层隔离识别引擎。业务接口不依赖具体 ASR，后续可替换为内网 `faster-whisper`。

完整接口文档：[docs/API.md](docs/API.md)

接口测试文档：[docs/TEST_PLAN.md](docs/TEST_PLAN.md)

## 已实现

- 本地工号密码登录、JWT Bearer/HttpOnly Cookie、失败锁定
- 音频文件转写：异步任务、状态、进度、失败重试、软删除
- 实时转写：浏览器通过 Socket.IO 上传 16kHz 单声道 PCM
- 文本加工：`.txt`/`.docx` 清洗时间戳和通用说话人标签
- 会议元数据、转写段落编辑、说话人单条/批量修正
- 术语纠正规则和管理员接口
- Markdown、Word、JSON、ZIP 导出
- 督办语句基础提取
- 分片上传与断点状态查询
- 领导档案自动归档、多维全文检索、摘要高亮和历史发言查询

## 启动

```bash
cd /Users/yuhouyangguang/bob-voice-backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env
```

至少修改 `.env` 中的密钥、管理员密码和 `DASHSCOPE_API_KEY`，然后：

```bash
python run.py
```

服务默认监听 `http://localhost:5000`，健康检查为 `GET /health`。

音频时长探测依赖系统 `ffprobe`。当前机器已安装 `ffmpeg`。

## 创建任务

`POST /api/v1/tasks` 使用 `multipart/form-data`：

- `file`: 音频或文本文件
- `meeting_meta`: JSON 字符串

示例：

```json
{
  "source_type": "audio",
  "meeting_type": "forum",
  "topic": "科技金融座谈会",
  "meeting_at": "2026-06-05T14:00:00",
  "location": "总行会议室",
  "participants": [{"name": "张三", "role": "主持人"}],
  "key_speakers": ["张三"],
  "need_supervision_list": true,
  "generate_word": true,
  "language": "zh"
}
```

大文件可先调用：

1. `POST /api/v1/upload/init`
2. `POST /api/v1/upload/chunk`
3. `POST /api/v1/upload/complete`
4. 创建任务时用 `upload_id` 替代 `file`

## 实时转写协议

Socket.IO namespace：`/realtime`

客户端发送：

- `realtime:start`: `{"format":"pcm","sample_rate":16000}`
- `realtime:audio`: 二进制 PCM 帧，建议每帧 100ms，即 3200 bytes
- `realtime:stop`

服务端发送：

- `realtime:ready`
- `realtime:result`: `{"text":"...","is_final":false}`
- `realtime:complete`
- `realtime:error`

JWT 可由同源 HttpOnly Cookie 自动携带，也可在 Socket.IO 握手 `Authorization: Bearer <token>` 中携带。

任务进度 namespace 为 `/tasks`。连接后发送
`task:subscribe`，数据为 `{"task_id": 1}`，监听 `task:progress`。

## 测试

```bash
pytest -q
```

测试使用本地 mock ASR，不访问 DashScope。

## 当前单机版边界

- 任务队列为进程内线程池；生产多实例部署时应替换为 Celery/Redis。
- SQLite 适用于单机和低并发；生产集群应迁移 MySQL/PostgreSQL。
- 督办清单目前是规则提取，未接入大模型语义整理。
- PRD 中的五维说话人识别和声纹注册尚未实现，现阶段支持人工标注。
