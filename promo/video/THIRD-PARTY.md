# 视频工程依赖与许可记录

本文件针对 `promo/video/` 的制作工具与依赖。版本以本次安装的 `package-lock.json` 和安装包内容核对。视频源工程自身在 `package.json` 中为 `UNLICENSED`，本文件没有向该工程新增开源许可。

| 组件 | 本次版本 | 许可与用途 |
| --- | --- | --- |
| Remotion、`@remotion/cli`、`@remotion/media`、`@remotion/transitions` | 4.0.540 | 使用 Remotion License，负责视频合成、预览、媒体读取与渲染；不是 MIT |
| React、React DOM | 19.3.1 | MIT，负责场景组件与页面渲染 |
| FFmpeg | n7.1 | 由 Remotion CLI 使用的本机构建工具，负责预剪、转码与最终编码；本次构建输出含 `--enable-gpl` |

Remotion 安装包 `node_modules/remotion/LICENSE.md` 已逐字复制到 [REMOTION-LICENSE.md](REMOTION-LICENSE.md)，保留原文链接与条件。使用 Remotion 的授权范围以该完整许可为准，不能因为它使用 React，就将其视作 MIT 项目。

React 与 React DOM 安装包保留各自的 MIT 许可。React 许可原文如下：

```text
MIT License

Copyright (c) Meta Platforms, Inc. and affiliates.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

本次 FFmpeg 版本由以下命令实际读取，不将它误记为 Remotion 的版本或原始录屏工具的版本：

```sh
node node_modules/@remotion/cli/remotion-cli.js ffmpeg -version
```

输出为 `ffmpeg version n7.1`，包含 `--enable-gpl`、`--enable-libx264`、`--enable-libx265` 等构建选项。完整依赖条件应按所安装 FFmpeg 构建及其组件许可核对；本项目不把这一构建统一标成 MIT 或仅 LGPL。源工程不附带 `node_modules`、FFmpeg 可执行文件或浏览器二进制，重新安装由锁文件恢复。

原始录制阶段另使用了 Playwright 的 FFmpeg v1011，区别于此处的 Remotion 构建 n7.1；其记录在 `../capture/README.md`。原录制工具不是成片渲染的必要素材，也不纳入视频源工程的运行依赖。

六段预剪 MP4、片头 PNG 来自 RealLoad 真实界面录屏或 WebGL 画布；货物数据为项目合成样本。配乐由 `../audio/generate_music.py` 原创合成，没有第三方音乐、商业音源或人声采样。
