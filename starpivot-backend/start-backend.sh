#!/bin/sh
set -eu

project_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
config_path=${DSH_BACKEND_CONFIG:-$project_dir/config/local.json}
pid_file=$project_dir/.local/starpivot-backend.pid

if ! command -v go >/dev/null 2>&1; then
  printf '%s\n' '未找到 Go 工具链，请安装 Go 1.26 或更新版本。' >&2
  exit 1
fi

if [ ! -f "$config_path" ]; then
  printf '后台配置文件不存在：%s\n' "$config_path" >&2
  printf '%s\n' '请复制 config/local.example.json 并填写数据库连接和网关密钥。' >&2
  exit 1
fi

cd "$project_dir"
mkdir -p "$project_dir/.local"
binary_path=$project_dir/.local/starpivot-backend
printf '%s\n' '正在编译后台服务。'
go build -o "$binary_path" ./cmd/starpivot-backend

is_backend_process() {
  process_command=$(ps -p "$1" -o command= 2>/dev/null || true)
  case "$process_command" in
    *"$binary_path"*|*starpivot-backend*) return 0 ;;
    *) return 1 ;;
  esac
}

stop_process() {
  process_id=$1
  if ! is_backend_process "$process_id"; then
    return 0
  fi
  if ! kill -0 "$process_id" 2>/dev/null; then
    return 0
  fi
  printf '正在停止已有后台进程（PID %s）\n' "$process_id"
  kill -TERM "$process_id" 2>/dev/null || true
  attempt=0
  while kill -0 "$process_id" 2>/dev/null && [ "$attempt" -lt 50 ]; do
    attempt=$((attempt + 1))
    sleep 0.1
  done
  if kill -0 "$process_id" 2>/dev/null; then
    printf '后台进程未在规定时间退出，正在强制停止（PID %s）\n' "$process_id" >&2
    kill -KILL "$process_id" 2>/dev/null || true
  fi
}

if [ -f "$pid_file" ]; then
  old_pid=$(sed -n '1p' "$pid_file")
  case "$old_pid" in
    ''|*[!0-9]*) rm -f "$pid_file" ;;
    *)
      if [ "$old_pid" -ne "$$" ]; then
        stop_process "$old_pid"
      fi
      rm -f "$pid_file"
      ;;
  esac
fi

if command -v lsof >/dev/null 2>&1; then
  listen_address=$(sed -n 's/.*"address"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$config_path" | sed -n '1p')
  listen_port=${listen_address##*:}
  case "$listen_port" in
    ''|*[!0-9]*) ;;
    *)
      for occupied_pid in $(lsof -tiTCP:"$listen_port" -sTCP:LISTEN 2>/dev/null || true); do
        if [ "$occupied_pid" -ne "$$" ]; then
          stop_process "$occupied_pid"
        fi
      done
      ;;
  esac
fi

printf '正在启动元枢 DeepSeek Harness 后台，配置文件：%s\n' "$config_path"
"$binary_path" &
service_pid=$!
printf '%s\n' "$service_pid" > "$pid_file"

cleanup() {
  trap - INT TERM EXIT
  if kill -0 "$service_pid" 2>/dev/null; then
    kill -TERM "$service_pid" 2>/dev/null || true
  fi
  current_pid=$(sed -n '1p' "$pid_file" 2>/dev/null || true)
  if [ "$current_pid" = "$service_pid" ]; then
    rm -f "$pid_file"
  fi
}

trap cleanup INT TERM EXIT
wait "$service_pid"
