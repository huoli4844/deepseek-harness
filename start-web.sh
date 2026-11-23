#!/bin/bash
# DeepSeek Harness Web 端（开发版）启动脚本
#
# 用法：
#   ./start-web.sh          启动（自动停掉桌面端和任何占用 3080 端口的进程）
#   ./start-web.sh stop     停止 web 端
#   ./start-web.sh restart  重启
#   ./start-web.sh logs     跟踪日志
#   ./start-web.sh status   查看状态
#
# 说明：
# - 端口固定 3080：元枢远端 CORS 白名单只放行 http://127.0.0.1:3080，
#   且仓库根目录 .env（YUANSHU_MCP_TARGET=remote）依赖同源会话。
#   注意：web 模式与桌面端互斥（都占 3080），启动时自动停桌面端，
#   并强制结束任何占用 3080 端口的残留进程（先 TERM，必要时 KILL）。
# - 必须清除 WorkBuddy 注入的 NODE_OPTIONS，否则 pnpm 会挂起。
# - .env 由 app-boot 从仓库根目录自动加载（本脚本 cd 到仓库根运行）。
# - 日志写入 .local-tools/web-dev.log。

set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="$ROOT/.local-tools/web-dev.log"
PID_FILE="$ROOT/.local-tools/web-dev.pid"
PATTERN="apps/cli/src/bin.ts web"

is_running() {
  pgrep -f "$PATTERN" > /dev/null 2>&1
}

stop_web() {
  if is_running; then
    pkill -f "$PATTERN" 2>/dev/null
    sleep 2
    echo "已停止 web 端。"
  else
    echo "web 端未在运行。"
  fi
}

# 桌面端若在运行会占用 3080 端口，先停掉
stop_desktop_if_needed() {
  if [ -x "$ROOT/start-desktop.sh" ] && pgrep -f "desktop-build/development/Harness Dev.app" > /dev/null 2>&1; then
    echo "检测到桌面端在运行（占用 3080 端口），自动停止……"
    "$ROOT/start-desktop.sh" stop
    sleep 1
  fi
}

# 兜底：结束任何仍占用 3080 端口的进程（先 TERM，仍监听则 KILL）
kill_port_3080() {
  local pids
  pids=$(lsof -tiTCP:3080 -sTCP:LISTEN 2>/dev/null | sort -u)
  if [ -n "$pids" ]; then
    echo "3080 端口仍被占用（pid：$(echo "$pids" | tr '\n' ' ')），正在结束……"
    kill $pids 2>/dev/null
    sleep 2
    pids=$(lsof -tiTCP:3080 -sTCP:LISTEN 2>/dev/null | sort -u)
    if [ -n "$pids" ]; then
      echo "进程未退出，强制结束（kill -9）……"
      kill -9 $pids 2>/dev/null
      sleep 1
    fi
  fi
}

start_web() {
  stop_desktop_if_needed
  if is_running; then
    echo "web 端已在运行，先停止旧实例……"
    stop_web
  fi
  kill_port_3080
  if lsof -nP -iTCP:3080 -sTCP:LISTEN 2>/dev/null | grep -q LISTEN; then
    echo "错误：3080 端口无法释放，无法启动。" >&2
    lsof -nP -iTCP:3080 -sTCP:LISTEN 2>/dev/null
    exit 1
  fi
  mkdir -p "$(dirname "$LOG_FILE")"
  echo "启动 web 端（端口 3080）……日志：$LOG_FILE"
  cd "$ROOT"
  nohup env \
    -u NODE_OPTIONS \
    -u ELECTRON_RUN_AS_NODE \
    -u HTTP_PROXY -u HTTPS_PROXY -u http_proxy -u https_proxy \
    DSH_CLIENT_COMMIT_HASH=0000000 \
    corepack pnpm run start:web -- --port 3080 --no-open > "$LOG_FILE" 2>&1 &
  echo $! > "$PID_FILE"

  # 等待宿主就绪（最多 40 秒）
  for _ in $(seq 1 40); do
    sleep 1
    if lsof -nP -iTCP:3080 -sTCP:LISTEN 2>/dev/null | grep -q LISTEN; then
      echo "✓ web 端已就绪：http://127.0.0.1:3080/login"
      exit 0
    fi
  done
  echo "⚠ 40 秒内 3080 端口未就绪，请查看日志：tail -50 $LOG_FILE"
  exit 1
}

case "${1:-start}" in
  start)   start_web ;;
  stop)    stop_web ;;
  restart) stop_web; sleep 1; start_web ;;
  logs)    tail -f "$LOG_FILE" ;;
  status)
    if is_running; then
      echo "运行中（pid $(pgrep -f "$PATTERN" | head -1)）"
      lsof -nP -iTCP:3080 -sTCP:LISTEN 2>/dev/null | tail -1
    else
      echo "未运行。"
    fi
    ;;
  *)
    echo "用法：$0 {start|stop|restart|status|logs}"
    exit 1
    ;;
esac
