#!/bin/bash
# DeepSeek Harness Web 端（开发版）一键启动脚本
#
# 用法：
#   ./start-web.sh                       编译工作台客户端 → 停旧实例 → 启动 web 端
#   ./start-web.sh start [额外参数...]    同上，额外参数原样传给 dsh web
#   ./start-web.sh stop                  停止 web 端
#   ./start-web.sh restart               重启
#   ./start-web.sh logs                  跟踪日志
#   ./start-web.sh status                查看状态
#
# 说明：
# - 只作用于本目录（deepseek-harness-dev），不触碰 dev-clean-20261123。
# - 编译工作台客户端时直接调用本地 tsdown，不经过 pnpm run，
#   因此不会触发 verify-deps-before-run 的隐式依赖安装。
# - 脚本不含任何安装指令；依赖（tsdown）缺失时直接报错，并提示手动安装。
# - 端口默认 3080：元枢远端 CORS 白名单只放行 http://127.0.0.1:3080，
#   需要自定义时通过 `./start-web.sh start --port 3090` 这类参数覆盖。
# - 桌面端与 web 互斥（都占 3080），启动时自动停桌面端并清理 3080 残留进程。
# - 必须清除外层注入的 NODE_OPTIONS，并使用 .local-tools/node-current（v24.22.3）。
# - 日志：.local-tools/web-dev.log（启动）、.local-tools/build.log（编译）。

set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="$ROOT/.local-tools/web-dev.log"
BUILD_LOG="$ROOT/.local-tools/build.log"
PID_FILE="$ROOT/.local-tools/web-dev.pid"
PATTERN="apps/cli/src/bin.ts web"
CLIENT_PKG="$ROOT/packages/experimental/yuanshu-workbench"
CLIENT_ARTIFACT="$CLIENT_PKG/lib/client.js"
TSDOWN_BIN="$ROOT/node_modules/.bin/tsdown"
TSC_BIN="$ROOT/node_modules/.bin/tsc"

# 定位工作区要求的 Node（v24.22.3）：优先本目录，其次仓库根。
NODE_BIN=""
for _candidate in "$ROOT/.local-tools/node-current/bin" "$ROOT/../.local-tools/node-current/bin"; do
  if [ -x "$_candidate/node" ]; then
    NODE_BIN="$_candidate"
    break
  fi
done

dev_env() {
  if [ -z "$NODE_BIN" ]; then
    echo "错误：未找到 node-current（需要 Node v24.22.3），请检查 .local-tools/node-current。" >&2
    exit 1
  fi
  case ":$PATH:" in
    *":$NODE_BIN:"*) ;;
    *) export PATH="$NODE_BIN:$PATH" ;;
  esac
  unset NODE_OPTIONS ELECTRON_RUN_AS_NODE
  export DSH_CLIENT_COMMIT_HASH=0000000
}

# 工作台宿主打包以 tsc 的输出为输入，先生成宿主代码再打包。
build_workbench() {
  if [ ! -x "$TSC_BIN" ] || [ ! -x "$TSDOWN_BIN" ]; then
    echo "错误：缺少 tsc 或 tsdown（依赖未安装），本脚本不会自动安装。" >&2
    echo "请手动执行：cd $ROOT && corepack pnpm install" >&2
    exit 1
  fi
  echo "编译工作台宿主和客户端 @deepseek-ai/dsh-yuanshu-workbench ……"
  mkdir -p "$(dirname "$BUILD_LOG")"
  if ! ( cd "$CLIENT_PKG" && "$TSC_BIN" -p tsconfig.host.json && "$TSDOWN_BIN" ) >> "$BUILD_LOG" 2>&1; then
    echo "错误：工作台编译失败，最后 20 行日志：" >&2
    tail -20 "$BUILD_LOG" >&2
    echo "完整编译日志：$BUILD_LOG" >&2
    exit 1
  fi
}

# 结束任何占用 3080 监听端口的进程：先 TERM，仍监听则 KILL。
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

# 等待 3080 进入监听状态；超时秒数由参数指定（默认 40）。
wait_port_3080() {
  local seconds="${1:-40}"
  for _ in $(seq 1 "$seconds"); do
    sleep 1
    if lsof -nP -iTCP:3080 -sTCP:LISTEN 2>/dev/null | grep -q LISTEN; then
      return 0
    fi
  done
  return 1
}

# 打印产物时间、监听进程、端口与访问地址。
print_runtime_summary() {
  local listen pid
  echo "—— 运行结果 ——"
  if [ -f "$CLIENT_ARTIFACT" ]; then
    echo "工作台产物：$(stat -f '%Sm' -t '%F %T' "$CLIENT_ARTIFACT")  $CLIENT_ARTIFACT"
  fi
  listen=$(lsof -nP -iTCP:3080 -sTCP:LISTEN 2>/dev/null | tail -1)
  pid=$(echo "$listen" | awk '{print $2}')
  echo "监听进程 pid：${pid:-未监听}"
  echo "监听端口：$(echo "$listen" | awk '{print $1" "$9}')"
  echo "访问地址：http://127.0.0.1:3080/login"
  echo "日志：$LOG_FILE"
}

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

start_web() {
  local web_args="$1"
  dev_env
  build_workbench

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
  echo "启动 web 端（参数：${web_args}）……日志：$LOG_FILE"
  cd "$ROOT"
  nohup env \
    -u NODE_OPTIONS \
    -u ELECTRON_RUN_AS_NODE \
    -u HTTP_PROXY -u HTTPS_PROXY -u http_proxy -u https_proxy \
    DSH_CLIENT_COMMIT_HASH=0000000 \
    npm_config_verify-deps-before-run=false \
    corepack pnpm run start:web -- $web_args > "$LOG_FILE" 2>&1 &
  echo $! > "$PID_FILE"

  # 等待宿主就绪（最多 40 秒）
  if wait_port_3080 40; then
    echo "✓ web 端已就绪"
    print_runtime_summary
    exit 0
  fi
  echo "⚠ 40 秒内 3080 端口未就绪，请查看日志：tail -50 $LOG_FILE"
  exit 1
}

ACTION="${1:-start}"
# 允许省略 start 直接传参数：./start-web.sh --port 3090
case "$ACTION" in
  -*) ACTION="start" ;;
  *) shift 2>/dev/null || true ;;
esac

case "$ACTION" in
  start)
    if [ "$#" -gt 0 ]; then
      start_web "$*"
    else
      start_web "--port 3080 --no-open"
    fi
    ;;
  stop)    stop_web ;;
  restart) stop_web; sleep 1; if [ "$#" -gt 0 ]; then start_web "$*"; else start_web "--port 3080 --no-open"; fi ;;
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
    echo "用法：$0 {start|stop|restart|status|logs} [dsh web 额外参数...]"
    exit 1
    ;;
esac
