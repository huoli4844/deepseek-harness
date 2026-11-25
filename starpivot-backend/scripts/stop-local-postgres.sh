#!/bin/sh
set -eu

project_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
exec "$project_dir/.local/postgres/bin/pg_ctl" -D "$project_dir/.local/postgres" -m fast stop
