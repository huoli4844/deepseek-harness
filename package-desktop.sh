#!/bin/bash
# 为桌面客户端选择构建目标，实际打包和产物校验由项目现有命令负责。

set -u
set -o pipefail

ROOT="$(cd -- "$(dirname -- "$0")" && pwd)" || exit 1
cd -- "$ROOT" || exit 1

check_option=""
case "$#" in
  0) ;;
  1)
    case "$1" in
      --check) check_option="--check" ;;
      -h|--help)
        printf '%s\n' '用法：./package-desktop.sh [--check]' \
          '通过菜单选择平台。--check 仅检查打包配置和工具。'
        exit 0 ;;
      *) printf '用法：./package-desktop.sh [--check]\n' >&2; exit 2 ;;
    esac ;;
  *) printf '用法：./package-desktop.sh [--check]\n' >&2; exit 2 ;;
esac

printf '%s\n' '桌面客户端打包（本地测试版）' \
  '1. 全部平台' \
  '2. macOS M 系列（arm64）' \
  '3. macOS Intel（x64）' \
  '4. Windows（x64）' \
  '0. 退出'

while true; do
  printf '请选择 [0–4]：'
  if ! IFS= read -r selection; then exit 0; fi
  case "$selection" in
    1) targets=(mac-arm64 mac-x64 win-x64); break ;;
    2) targets=(mac-arm64); break ;;
    3) targets=(mac-x64); break ;;
    4) targets=(win-x64); break ;;
    0) exit 0 ;;
    *) printf '请输入 0 到 4。\n' >&2 ;;
  esac
done

unset NODE_OPTIONS ELECTRON_RUN_AS_NODE ELECTRON_FORCE_IS_PACKAGED
for node_dir in "$ROOT/.local-tools/node-current/bin" "$ROOT/../.local-tools/node-current/bin"; do
  if [ -x "$node_dir/node" ] && [ -x "$node_dir/pnpm" ]; then
    export PATH="$node_dir:$PATH"
    break
  fi
done

if ! host="$(node -p 'process.platform + "-" + process.arch')" ||
   ! default_version="$(node -p 'require("./apps/desktop/package.json").version')"; then
  printf '无法读取构建机平台或桌面应用版本，请检查 Node.js。\n' >&2
  exit 1
fi

printf '安装包版本（回车使用 %s）：' "$default_version"
if ! IFS= read -r build_version; then exit 0; fi
build_version="${build_version:-$default_version}"

package_target() {
  local target="$1" version="$2" check="$3"
  local options=(--build-version "$version")
  if [ -n "$check" ]; then options+=("$check"); fi
  if ! command -v pnpm >/dev/null 2>&1; then
    printf '当前构建机找不到 pnpm，请检查 Node.js 和 pnpm 配置。\n' >&2
    return 1
  fi
  env -u NODE_OPTIONS -u ELECTRON_RUN_AS_NODE -u ELECTRON_FORCE_IS_PACKAGED \
    DSH_CLIENT_COMMIT_HASH=0000000 \
    pnpm run "package:desktop:${target/-/:}:unsigned" "${options[@]}" || return $?
  if [ -z "$check" ]; then
    printf '产物目录：%s/apps/desktop/.desktop-build/targets/%s/unsigned-artifacts/\n' "$PWD" "$target"
  fi
}

package_windows_remote() {
  local ssh_host="${DSH_PACKAGE_WINDOWS_HOST:-}"
  local checkout="${DSH_PACKAGE_WINDOWS_ROOT:-}"
  if [ -z "$ssh_host" ] || [ -z "$checkout" ]; then
    printf '%s\n' 'Windows x64 需要在 Windows 构建机上执行。可在 Windows Git Bash 运行本脚本，或设置 DSH_PACKAGE_WINDOWS_HOST 和 DSH_PACKAGE_WINDOWS_ROOT。' >&2
    return 1
  fi
  printf 'Windows 构建机：%s\n' "$ssh_host"
  # 使用远端 Bash 解析参数，避免路径中的空格被 SSH 默认 shell 拆分。
  {
    printf 'cd -- %q || exit 1\n' "$checkout"
    declare -f package_target
    printf 'package_target win-x64 %q %q\n' "$build_version" "$check_option"
  } | ssh -- "$ssh_host" 'bash -l -s'
}

run_target() {
  local target="$1"
  case "$target:$host" in
    mac-arm64:darwin-arm64|mac-x64:darwin-x64|win-x64:win32-x64)
      package_target "$target" "$build_version" "$check_option" ;;
    mac-x64:darwin-arm64)
      if ! arch -x86_64 /usr/bin/true 2>/dev/null; then
        printf '此 Mac 需要 Rosetta 才能打包 Intel 版。\n' >&2
        return 1
      fi
      package_target "$target" "$build_version" "$check_option" ;;
    win-x64:*) package_windows_remote ;;
    *)
      printf '%s 需要在对应架构的 macOS 构建机上执行。\n' "$target" >&2
      return 1 ;;
  esac
}

exit_status=0
results=()
operation="打包"
if [ -n "$check_option" ]; then operation="检查"; fi
for target in "${targets[@]}"; do
  printf '\n[%s] 开始%s。\n' "$target" "$operation"
  if run_target "$target"; then
    results+=("$target 成功")
  else
    status=$?
    results+=("$target 失败（退出码 ${status}）")
    exit_status=1
  fi
done

printf '\n结果\n'
printf '  %s\n' "${results[@]}"
exit "$exit_status"
