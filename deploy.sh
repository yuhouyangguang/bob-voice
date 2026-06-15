#!/bin/bash
# ──────────────────────────────────────────────────────────────────────
# Bob Voice 一键部署脚本
# 用法: ./deploy.sh [start|stop|restart|logs|status]
# ──────────────────────────────────────────────────────────────────────

set -e
cd "$(dirname "$0")"

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m'

log() { echo -e "${CYAN}[BOB]${NC} $1"; }
ok()  { echo -e "${GREEN}[BOB] ✓${NC} $1"; }
err() { echo -e "${RED}[BOB] ✗${NC} $1"; }

# 检查 .env 是否存在
check_env() {
  if [[ ! -f .env ]]; then
    err ".env 文件不存在！"
    log "请先复制并编辑配置文件："
    echo "  cp .env.example .env"
    echo "  vim .env"
    exit 1
  fi
}

case "${1:-start}" in
  start)
    check_env
    log "构建并启动 Bob Voice..."
    docker compose up -d --build
    echo ""
    ok "部署完成！"
    APP_PORT=$(grep -E "^APP_PORT=" .env 2>/dev/null | cut -d= -f2 || echo "80")
    echo -e "  访问地址: ${CYAN}http://$(hostname -f 2>/dev/null || echo 'localhost'):${APP_PORT:-80}${NC}"
    echo ""
    ;;
  stop)
    log "停止 Bob Voice..."
    docker compose down
    ok "已停止"
    ;;
  restart)
    check_env
    log "重启 Bob Voice..."
    docker compose down
    docker compose up -d --build
    ok "重启完成"
    ;;
  logs)
    docker compose logs -f --tail=100
    ;;
  status)
    docker compose ps
    ;;
  *)
    echo ""
    echo "用法: $0 {start|stop|restart|logs|status}"
    echo ""
    echo "  start    构建镜像并启动服务"
    echo "  stop     停止所有服务"
    echo "  restart  重新构建并重启"
    echo "  logs     查看实时日志"
    echo "  status   查看服务状态"
    echo ""
    exit 1
    ;;
esac
