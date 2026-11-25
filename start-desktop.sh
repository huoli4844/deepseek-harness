#!/bin/bash
# DeepSeek Harness 桌面端（开发版）一键启动脚本
#
# 用法：
#   ./start-desktop.sh          编译工作台客户端 → 停旧实例 → 启动桌面端
#   ./start-desktop.sh stop     停止桌面端
#   ./start-desktop.sh restart  重启（同 start）
#   ./start-desktop.sh logs     跟踪日志
#   ./start-desktop.sh status   查看状态
#
# 说明：
# - 只作用于本目录（deepseek-harness-dev），不触碰 dev-clean-20261123。
# - 编译工作台客户端时直接调用本地 tsdown，不经过 pnpm run，
#   因此不会触发 verify-deps-before-run 的隐式依赖安装。
# - 脚本不含任何安装指令；依赖（tsx / tsdown / electron）缺失时直接报错，
#   并提示手动安装。
# - 端口固定 3080：元枢远端 CORS 白名单只放行 http://127.0.0.1:3080。
#   web 模式与桌面端互斥（都占 3080），启动时会自动停掉 web 端。
# - 必须清除外层注入的 NODE_OPTIONS / ELECTRON_RUN_AS_NODE，并使用
#   .local-tools/node-current（v24.22.3），否则 pnpm / electron 会挂起。
# - DSH_DESKTOP_WEB_LOGIN=1：使用 web 端同款元枢登录页。
# - 日志：.local-tools/desktop-dev.log（启动）、.local-tools/build.log（编译）。

set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="$ROOT/.local-tools/desktop-dev.log"
BUILD_LOG="$ROOT/.local-tools/build.log"
PID_FILE="$ROOT/.local-tools/desktop-dev.pid"
PATTERN="desktop-build/development/Harness Dev.app"
CLIENT_PKG="$ROOT/packages/experimental/client-yuanshu-workbench"
CLIENT_ARTIFACT="$CLIENT_PKG/lib/client.js"
TSDOWN_BIN="$ROOT/node_modules/.bin/tsdown"

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
  # 宿主 IDE 会注入 ELECTRON_FORCE_IS_PACKAGED=true，会让 dev 模式误判为已打包，
  # 进而读取不存在的 dsh/desktop-runtime.json 并退出；开发启动必须清掉它。
  unset ELECTRON_FORCE_IS_PACKAGED
  export DSH_CLIENT_COMMIT_HASH=0000000
}

# 编译工作台客户端：直接调用 tsdown，绕开 pnpm 的依赖校验与隐式安装。
build_client() {
  if [ ! -x "$TSDOWN_BIN" ]; then
    echo "错误：缺少打包器 tsdown（依赖未安装），本脚本不会自动安装。" >&2
    echo "请手动执行：cd $ROOT && corepack pnpm install" >&2
    exit 1
  fi
  echo "编译工作台客户端 @deepseek-ai/dsh-client-yuanshu-workbench ……"
  mkdir -p "$(dirname "$BUILD_LOG")"
  if ! ( cd "$CLIENT_PKG" && env -u NODE_OPTIONS DSH_CLIENT_COMMIT_HASH=0000000 "$TSDOWN_BIN" ) >> "$BUILD_LOG" 2>&1; then
    echo "错误：工作台客户端编译失败，最后 20 行日志：" >&2
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

start_app() {
  dev_env
  build_client

  if [ ! -x "$ROOT/node_modules/.bin/tsx" ]; then
    echo "错误：缺少 tsx（依赖未安装），本脚本不会自动安装。" >&2
    echo "请手动执行：cd $ROOT && corepack pnpm install" >&2
    exit 1
  fi
  # electron 的 index.js 在缺少 dist/ 时会自行联网下载（表现为长时间“卡住”），
  # 这里提前拦截并提示手动安装；只解析包路径，不 require 入口文件。
  local electron_dir electron_ver
  electron_dir=$(cd "$ROOT/apps/desktop" && node -p "require('path').dirname(require.resolve('electron/package.json'))" 2>/dev/null)
  if [ -n "$electron_dir" ] && [ ! -d "$electron_dir/dist" ]; then
    electron_ver=$(node -p "require('$electron_dir/package.json').version" 2>/dev/null)
    echo "错误：桌面端依赖的 Electron 二进制缺失（${electron_ver:-未知版本} 的 dist/ 为空），本脚本不会自动下载安装。" >&2
    echo "请手动执行：cd $ROOT && corepack pnpm rebuild electron" >&2
    echo "（需联网下载约 130MB；在此之前可先用 web 版：./start-web.sh）" >&2
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
  echo "启动桌面端（源码模式，web 登录 + 宿主端口 3080）……日志：$LOG_FILE"
  cd "$ROOT"
  nohup env \
    -u ELECTRON_RUN_AS_NODE \
    -u ELECTRON_FORCE_IS_PACKAGED \
    -u NODE_OPTIONS \
    -u HTTP_PROXY -u HTTPS_PROXY -u http_proxy -u https_proxy \
    DSH_DESKTOP_WEB_LOGIN=1 \
    DSH_DESKTOP_OPEN_DEVTOOLS=0 \
    DSH_CLIENT_COMMIT_HASH=0000000 \
    npm_config_verify-deps-before-run=false \
    corepack pnpm run start:desktop > "$LOG_FILE" 2>&1 &
  echo $! > "$PID_FILE"

  # 等待宿主就绪（最多 40 秒）
  if wait_port_3080 40; then
    echo "✓ 桌面端已就绪"
    print_runtime_summary
    exit 0
  fi
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
