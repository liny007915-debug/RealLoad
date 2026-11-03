#!/bin/zsh
# RealLoad Studio 1.27 Beta 1 — Mac 一键启动
set -u
cd "${0:A:h}" || exit 1
printf '\nRealLoad Studio 1.27 Beta 1 正在启动…\n\n'
if ! command -v node >/dev/null 2>&1; then
  printf '未找到 Node.js。请安装 Node.js 20 或更新版本。\n官网：https://nodejs.org/\n'
  read '?按回车关闭窗口…'
  exit 1
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null)"
if [[ -z "$NODE_MAJOR" ]] || (( NODE_MAJOR < 20 )); then
  printf '需要 Node.js 20 或更新版本。请从 https://nodejs.org/ 更新后重试。\n'
  read '?按回车关闭窗口…'
  exit 1
fi
if [[ ! -f ./launcher.mjs || ! -f ./server.mjs || ! -f ./index.html ]]; then
  printf '项目文件不完整。请先完整解压 ZIP 后再运行。\n'
  read '?按回车关闭窗口…'
  exit 1
fi
node ./launcher.mjs
RESULT=$?
if (( RESULT != 0 )); then
  read '?按回车关闭窗口…'
fi
exit "$RESULT"
