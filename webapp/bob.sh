#!/bin/bash
# ──────────────────────────────────────────────────────────────────────
# Bob Voice 前后端 + ngrok 统一管理脚本
# 用法: ./bob.sh start | stop | status | restart
#
# 本地开发:  前端使用 vite dev (port 3000)，支持 HMR 热更新
# ngrok 穿透: 前端使用 vite preview (port 4173)，构建后的静态文件
#             避免 Vite 8 的 WebSocket token 校验导致白屏
# ──────────────────────────────────────────────────────────────────────

BACKEND_DIR="/Users/yuhouyangguang/bob-voice-backend"
FRONTEND_DIR="/Users/yuhouyangguang/bob-voice-webapp"
PID_DIR="$FRONTEND_DIR/.pids"

BACKEND_PORT=5002
DEV_PORT=3000
PREVIEW_PORT=4173

# 颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${CYAN}[BOB]${NC} $1"; }
ok()   { echo -e "${GREEN}[BOB] ✓${NC} $1"; }
warn() { echo -e "${YELLOW}[BOB] !${NC} $1"; }
err()  { echo -e "${RED}[BOB] ✗${NC} $1"; }

mkdir -p "$PID_DIR"

# ── 检查进程是否存活 ──────────────────────────────────────────────────
is_alive() {
  local pid=$1
  [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null
}

read_pid() {
  local file="$PID_DIR/$1.pid"
  [[ -f "$file" ]] && cat "$file" || echo ""
}

save_pid() {
  echo "$2" > "$PID_DIR/$1.pid"
}

remove_pid() {
  rm -f "$PID_DIR/$1.pid"
}

kill_svc() {
  local svc=$1
  local pid
  pid=$(read_pid "$svc")
  if is_alive "$pid"; then
    kill "$pid" 2>/dev/null
    for _ in $(seq 1 5); do
      is_alive "$pid" || break
      sleep 1
    done
    if is_alive "$pid"; then
      kill -9 "$pid" 2>/dev/null
    fi
    ok "$svc 已停止 (PID $pid)"
  else
    warn "$svc 未在运行"
  fi
  remove_pid "$svc"
}

# ── 启动后端 ──────────────────────────────────────────────────────────
start_backend() {
  local be_pid
  be_pid=$(read_pid backend)
  if is_alive "$be_pid"; then
    warn "后端已在运行 (PID $be_pid)，跳过"
    return
  fi

  log "启动后端 (Flask + SocketIO, port $BACKEND_PORT)..."
  cd "$BACKEND_DIR" || { err "后端目录不存在"; exit 1; }

  PORT=$BACKEND_PORT \
  BOOTSTRAP_ADMIN_USERNAME=admin \
  BOOTSTRAP_ADMIN_PASSWORD=Admin123! \
  nohup python3 run.py > "$PID_DIR/backend.log" 2>&1 &
  save_pid backend $!

  for _ in $(seq 1 15); do
    if curl -s "http://localhost:$BACKEND_PORT/api/v1/health" > /dev/null 2>&1; then
      ok "后端已启动 (PID $!, port $BACKEND_PORT)"
      return
    fi
    sleep 1
  done
  warn "后端未响应健康检查，请查看日志: $PID_DIR/backend.log"
}

# ── 启动前端 (dev) ────────────────────────────────────────────────────
start_frontend_dev() {
  local fe_pid
  fe_pid=$(read_pid frontend)
  if is_alive "$fe_pid"; then
    warn "前端已在运行 (PID $fe_pid)，跳过"
    return
  fi

  log "启动前端 dev (Vite HMR, port $DEV_PORT)..."
  cd "$FRONTEND_DIR" || { err "前端目录不存在"; exit 1; }
  nohup npx vite --host > "$PID_DIR/frontend.log" 2>&1 &
  save_pid frontend $!

  for _ in $(seq 1 10); do
    if curl -s "http://localhost:$DEV_PORT" > /dev/null 2>&1; then
      ok "前端 dev 已启动 (PID $!, port $DEV_PORT)"
      return
    fi
    sleep 1
  done
  warn "前端 dev 启动超时，请查看日志: $PID_DIR/frontend.log"
}

# ── 构建 + 启动前端 (preview，供 ngrok 使用) ─────────────────────────
start_frontend_preview() {
  local fe_pid
  fe_pid=$(read_pid preview)
  if is_alive "$fe_pid"; then
    warn "前端 preview 已在运行 (PID $fe_pid)，跳过"
    return
  fi

  log "构建前端..."
  cd "$FRONTEND_DIR" || { err "前端目录不存在"; exit 1; }
  npx vite build > "$PID_DIR/build.log" 2>&1
  if [[ $? -ne 0 ]]; then
    err "前端构建失败，请查看日志: $PID_DIR/build.log"
    return 1
  fi
  ok "前端构建完成"

  log "启动前端 preview (port $PREVIEW_PORT)..."
  nohup npx vite preview --host > "$PID_DIR/preview.log" 2>&1 &
  save_pid preview $!

  for _ in $(seq 1 10); do
    if curl -s "http://localhost:$PREVIEW_PORT" > /dev/null 2>&1; then
      ok "前端 preview 已启动 (PID $!, port $PREVIEW_PORT)"
      return
    fi
    sleep 1
  done
  warn "前端 preview 启动超时，请查看日志: $PID_DIR/preview.log"
}

# ── 启动 ngrok ────────────────────────────────────────────────────────
start_ngrok() {
  local ng_pid
  ng_pid=$(read_pid ngrok)
  if is_alive "$ng_pid"; then
    warn "ngrok 已在运行 (PID $ng_pid)，跳过"
    return
  fi

  log "启动 ngrok 穿透 (port $PREVIEW_PORT)..."
  nohup ngrok http $PREVIEW_PORT --log=stdout > "$PID_DIR/ngrok.log" 2>&1 &
  save_pid ngrok $!
  sleep 3

  local ngrok_url
  ngrok_url=$(curl -s http://127.0.0.1:4040/api/tunnels 2>/dev/null \
    | python3 -c "import sys,json; tunnels=json.load(sys.stdin).get('tunnels',[]); print(tunnels[0]['public_url'] if tunnels else '')" 2>/dev/null)

  if [[ -n "$ngrok_url" ]]; then
    ok "ngrok 已启动 (PID $!)"
    echo ""
    echo -e "  ${GREEN}═══════════════════════════════════════════════${NC}"
    echo -e "  ${GREEN}  公网地址: ${CYAN}$ngrok_url${NC}"
    echo -e "  ${GREEN}  本地开发: ${CYAN}http://localhost:$DEV_PORT${NC}"
    echo -e "  ${GREEN}  管理面板: ${CYAN}http://127.0.0.1:4040${NC}"
    echo -e "  ${GREEN}═══════════════════════════════════════════════${NC}"
    echo ""
  else
    warn "ngrok 已启动但无法获取公网地址，请访问 http://127.0.0.1:4040 查看"
  fi
}

# ── START ─────────────────────────────────────────────────────────────
do_start() {
  log "启动 Bob Voice 服务..."
  start_backend
  start_frontend_dev
  start_frontend_preview
  start_ngrok
  log "全部服务启动完成"
}

# ── STOP ──────────────────────────────────────────────────────────────
do_stop() {
  log "停止 Bob Voice 服务..."

  for svc in ngrok preview frontend backend; do
    kill_svc "$svc"
  done

  # 清理可能残留的端口占用
  for port in $BACKEND_PORT $DEV_PORT $PREVIEW_PORT; do
    lsof -ti:$port 2>/dev/null | xargs kill 2>/dev/null
  done

  ok "全部服务已停止"
}

# ── STATUS ────────────────────────────────────────────────────────────
do_status() {
  echo ""
  echo -e "${CYAN}  Bob Voice 服务状态${NC}"
  echo "  ─────────────────────────────────────"

  for svc in backend frontend preview ngrok; do
    local pid
    pid=$(read_pid "$svc")
    if is_alive "$pid"; then
      echo -e "  ${GREEN}●${NC} $svc\t\tPID $pid\t运行中"
    else
      echo -e "  ${RED}○${NC} $svc\t\t\t已停止"
    fi
  done

  local ngrok_url
  ngrok_url=$(curl -s http://127.0.0.1:4040/api/tunnels 2>/dev/null \
    | python3 -c "import sys,json; tunnels=json.load(sys.stdin).get('tunnels',[]); print(tunnels[0]['public_url'] if tunnels else '')" 2>/dev/null)
  if [[ -n "$ngrok_url" ]]; then
    echo ""
    echo -e "  公网地址: ${CYAN}$ngrok_url${NC}"
  fi
  echo -e "  本地开发: ${CYAN}http://localhost:$DEV_PORT${NC}"
  echo -e "  管理面板: ${CYAN}http://127.0.0.1:4040${NC}"
  echo ""
}

# ── 主入口 ────────────────────────────────────────────────────────────
case "${1:-}" in
  start)   do_start ;;
  stop)    do_stop ;;
  restart) do_stop; sleep 2; do_start ;;
  status)  do_status ;;
  *)
    echo ""
    echo "用法: $0 {start|stop|restart|status}"
    echo ""
    echo "  start    启动后端 + 前端dev + 前端preview + ngrok"
    echo "  stop     停止全部服务"
    echo "  restart  重启全部服务"
    echo "  status   查看服务状态"
    echo ""
    echo "  本地开发访问 localhost:$DEV_PORT (支持 HMR 热更新)"
    echo "  外部用户通过 ngrok 公网地址访问 (构建后的静态文件)"
    echo ""
    exit 1
    ;;
esac
