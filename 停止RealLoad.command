#!/bin/zsh
cd "${0:A:h}" || exit 1
if command -v node >/dev/null 2>&1 && [[ -f ./launcher.mjs ]]; then
  node ./launcher.mjs --stop
else
  printf '无法核对服务归属，未停止任何进程。请使用启动服务的终端手动退出。\n'
fi
read '?按回车关闭窗口…'
