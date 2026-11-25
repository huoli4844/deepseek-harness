#!/bin/sh
set -eu

project_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
data_dir="$project_dir/.local/postgres"
bin_dir="$data_dir/bin"
if [ ! -x "$bin_dir/postgres" ]; then
  printf '%s\n' '本地 PostgreSQL 二进制文件不存在，请先安装 PostgreSQL 19。' >&2
  exit 1
fi
exec "$bin_dir/pg_ctl" -D "$data_dir" -l "$data_dir/server.log" \
  -o '-h 127.0.0.1 -p 55432 -c listen_addresses=127.0.0.1' start
