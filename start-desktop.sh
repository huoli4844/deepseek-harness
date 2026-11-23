#!/bin/bash
# DeepSeek Harness 桌面端（开发版）启动脚本
#
# 用法：
#   ./start-desktop.sh          启动（自动停掉 web 端和任何占用 3080 端口的进程）
#   ./start-desktop.sh stop     停止桌面端
#   ./start-desktop.sh restart  重启
#
# 说明：
# - 必须清除 WorkBuddy 注入的 NODE_OPTIONS / ELECTRON_RUN_AS_NODE，
#   否则 pnpm/electron 会挂起或进入 Node 模式。
# - DSH_DESKTOP_WEB_LOGIN=1：使用 web 端同款元枢登录页（宿主固定 3080 端口，
#   远端 CORS 只放行 http://127.0.0.1:3080）。不带该变量则回退原生欢迎页。
# - web 模式与桌面端互斥（都占 3080）：启动时自动停 web 端，
#   并强制结束任何占用 3080 端口的残留进程（先 TERM，必要时 KILL）。
# - --no-sandbox：开发模式下 Chromium 沙箱初始化需要。
# - 日志写入 .local-tools/desktop-dev.log。

set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_BIN="$ROOT/apps/desktop/.desktop-build/development/Harness Dev.app/Contents/MacOS/HarnessDev"
RUNTIME_DIR="$ROOT/apps/desktop/.desktop-build/targets/mac-arm64/runtime/primary-runtime"
LOG_FILE="$ROOT/.local-tools/desktop-dev.log"
PATTERN="desktop-build/development/Harness Dev.app"

is_running() {
  pgrep -f "$PATTERN" > /dev/null 2>&1
}

stop_app() {
  if is_running; then
    pkill -f "$PATTERN" 2>/dev/null
    sleep 3
    echo "已停止桌面端。"
  else
    echo "桌面端未在运行。"
  fi
}

# web 端若在运行会占用 3080 端口，先停掉
stop_web_if_needed() {
  if [ -x "$ROOT/start-web.sh" ] && pgrep -f "apps/cli/src/bin.ts web" > /dev/null 2>&1; then
    echo "检测到 web 端在运行（占用 3080 端口），自动停止……"
    "$ROOT/start-web.sh" stop
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

start_app() {
  if [ ! -x "$APP_BIN" ]; then
    echo "错误：找不到桌面端可执行文件：$APP_BIN" >&2
    echo "请先构建（DSH_CLIENT_COMMIT_HASH=0000000 corepack pnpm run build）" >&2
    exit 1
  fi
  if [ ! -d "$RUNTIME_DIR" ]; then
    echo "错误：找不到运行时目录：$RUNTIME_DIR" >&2
    exit 1
  fi
  stop_web_if_needed
  if is_running; then
    echo "检测到桌面端已在运行，先停止旧实例……"
    stop_app
  fi
  kill_port_3080
  if lsof -nP -iTCP:3080 -sTCP:LISTEN 2>/dev/null | grep -q LISTEN; then
    echo "错误：3080 端口无法释放，无法启动。" >&2
    lsof -nP -iTCP:3080 -sTCP:LISTEN 2>/dev/null
    exit 1
  fi
  mkdir -p "$(dirname "$LOG_FILE")"
  echo "启动桌面端（web 登录模式，宿主端口 3080）……日志：$LOG_FILE"
  nohup env \
    -u ELECTRON_RUN_AS_NODE \
    -u NODE_OPTIONS \
    -u HTTP_PROXY -u HTTPS_PROXY -u http_proxy -u https_proxy \
    DSH_DESKTOP_PRIMARY_RUNTIME_DIR="$RUNTIME_DIR" \
    DSH_DESKTOP_WEB_LOGIN=1 \
    "$APP_BIN" --no-sandbox > "$LOG_FILE" 2>&1 &
  echo $! > "$ROOT/.local-tools/desktop-dev.pid"

  # 等待宿主就绪（最多 40 秒）
  for _ in $(seq 1 40); do
    sleep 1
    if lsof -nP -iTCP:3080 -sTCP:LISTEN 2>/dev/null | grep -q LISTEN; then
      echo "✓ 桌面端已就绪：http://127.0.0.1:3080/login"
      exit 0
    fi
  done
  echo "⚠ 40 秒内 3080 端口未就绪，请查看日志：tail -50 $LOG_FILE"
  exit 1
}

case "${1:-start}" in
  start)   start_app ;;
  stop)    stop_app ;;
  restart) stop_app; sleep 1; start_app ;;
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
