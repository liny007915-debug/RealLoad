# RealLoad 产品展示片源工程

主合成 `RealLoad-Promo`：1920 × 1080、30 fps、1800 帧、60 秒。画面使用中文主标题和说明，搭配本项目原创背景音乐，无旁白、无人声 TTS。应用版本为 RealLoad Studio 1.27 Beta1。

本目录是视频制作工程，不是 RealLoad 应用运行依赖。应用使用者不需要安装 Remotion。

## Git 源码与完整素材包

Git checkout 仅保留视频源码、锁文件、配置、字幕与制作说明，不携带 MP4、音乐或片头图片。首次渲染前，请从项目 GitHub Release 下载 **`RealLoad-Promo-Source-v1.27-Beta1.zip`**。解压后保持 `promo/` 目录结构，可直接在解压出的 `promo/video/` 中执行下方命令，或把包内 `promo/video/public/` 的八份必需素材复制到 checkout 的同名目录。

完整素材包保留预剪片段、音乐与来源记录；不包含原始 WebM、原始 WAV、浏览器缓存或 `node_modules`。它可直接重新渲染成片，重新剪辑原片仍需另备下文列出的原始素材。

## 安装与预览

在此目录执行命令。Node.js 版本以 [package.json](package.json) 的 `engines.node` 为准，当前为 `^20.19.0 || ^22.13.0 || >=24`。使用随附的锁文件安装：

```sh
npm ci
npm run dev -- --no-open
```

终端会显示 Studio 访问地址。在 Studio 中选择 `RealLoad-Promo` 可查看完整影片，`Scenes` 下的合成用于分段检查。

## 渲染主片

本机长期存活的 Chrome 渲染进程会中断，优先使用随附的分段脚本：

```sh
node render-segmented.mjs
```

脚本按同一个 `RealLoad-Promo` 合成的绝对帧时间线，连续渲染十段 6 秒画面，覆盖 0–1799 帧，再合并一条连续的原创音乐，避免分段音频接缝。合并时将画面从全范围转换为有限范围，并重新编码为 H.264、`yuv420p`、`color_range=tv`（CRF 18、fast），提高播放器兼容性。连续音乐保留 0.72 音量，以 AAC 192 kb/s 编码。

默认输出 `../../release/RealLoad-Studio-v1.27-Beta1-Promo-1080p.mp4`，可用首个参数指定输出文件，例如 `node render-segmented.mjs out/RealLoad-Promo-1080p.mp4`。相对输出路径以本工程目录为基准，缺少的输出目录会自动创建。分段文件、日志与检查记录写入 `out/`；检查记录包含像素格式及色彩范围，复现后应确认 `yuv420p`、`tv`、1800 帧与 60 秒。

该脚本默认使用 macOS 的 `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`。其它安装路径或系统需要通过环境变量 `REALLOAD_RENDER_BROWSER` 指向可用的 Chrome 可执行文件。它已设置 `--concurrency=1`、`--disable-shared-memory-capture` 与 `--gl=swangle`，不会打包或安装浏览器。

标准 Remotion 单次渲染命令仍可用于支持长时间渲染的环境：

```sh
npx remotion render src/index.ts RealLoad-Promo out/RealLoad-Promo-1080p.mp4 --codec=h264 --concurrency=1 --disable-shared-memory-capture
```

**本制作环境必须保留 `--disable-shared-memory-capture`。** 本机原生快速截图通道曾出现关键帧画面拼接异常，切换到常规截图通道后画面正确。该选项用于避免渲染通道问题，并非修改应用录屏内容。

单次渲染命令默认使用 Remotion 管理的 Chrome Headless Shell，首次需要时可先执行 `npx remotion browser ensure`。本机尝试的 Headless Shell 158.0.8127.2 加载合成时超时，因此它不是本次最终导出的浏览器方案。需要复现本机软件 WebGL 通道时可追加 `--gl=swangle`。

已安装的完整 Chrome 仅作为可选覆盖，可追加 `--browser-executable`。例如 macOS：

```sh
npx remotion render src/index.ts RealLoad-Promo out/RealLoad-Promo-1080p.mp4 --codec=h264 --concurrency=1 --disable-shared-memory-capture --browser-executable="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
```

主合成的分辨率、帧率和时长在 [src/Root.tsx](src/Root.tsx) 定义；标题、字幕和时间线在 `src/` 各场景中。主片会烧录这些文字，无需在渲染命令中另行加载 SRT。独立字幕文件是 [../RealLoad-Promo.zh-CN.srt](../RealLoad-Promo.zh-CN.srt)，可供发布平台使用；播放器若再叠加此字幕，可能与已烧录文字重复。

## 最小可复现素材

常规渲染只读取已准备好的 `public/` 素材：

| 文件 | 内容 |
| --- | --- |
| `orbit.mp4` | 完整柜体与混合货物 |
| `movement.mp4` | 实际坐标编辑与位置变化 |
| `specifications.mp4` | 更新待装模板、保留旧件规格 |
| `shell.mp4` | 柜体透明度与开门角度 |
| `views.mp4` | 共用坐标的不同视图 |
| `unloading.mp4` | 实际卸出顺序与动画 |
| `music.m4a` | 原创 60 秒轻电子配乐 |
| `hero.png` | 实际 WebGL 画布导出的片头图 |

保留上述文件以及 `src/`、工程配置、`package.json` 和 `package-lock.json` 即可重新渲染。无需原始 WebM 录屏、原始 WAV、应用服务器或用户浏览器存档。`public/music.wav` 若仍存在，是制作中间文件，当前合成使用 `music.m4a`。

## 原片重新剪辑

[prepare-media.mjs](prepare-media.mjs) 只用于原始素材仍在本机时重新生成预剪片段：

```sh
node prepare-media.mjs
```

它需要 `../capture/` 下六段原始 WebM 和 `hero-clean.png`，以及 `../audio/realload-product-60s.wav`。缺少这些原片时不应运行此步骤，直接使用现成的 `public/` 即可。脚本会覆盖相应预剪片段、`music.m4a`、`hero.png`，并写入 `media-production.json`；重新剪辑后须重新核对关键帧与完整成片。

原录制记录见 `../capture/capture-manifest.json`；最终来源、裁剪起点、时长和哈希以制作随附的 `media-production.json` 为准。原始录屏为 1600 × 900、25 fps，主片排版为 1920 × 1080、30 fps。

## 时间线与变速

| 成片时间 | 场景 | 使用素材与相对原录屏的播放速度 |
| --- | --- | --- |
| 00–06 秒 | 片头 | `hero.png`，后期轻微镜头运动 |
| 06–14 秒 | 每种货物，都有模样。 | `orbit.mp4`，0.92× |
| 14–23 秒 | 摆放，直接上手。 | `movement.mp4`，0.70× |
| 23–34 秒 | 模板更新，旧件照旧。 | `specifications.mp4`，0.70× |
| 34–43 秒 | 柜内柜外，都看清。 | 前 5 秒 `shell.mp4` 1.76×；后 4 秒 `views.mp4` 2.45× |
| 43–53 秒 | 装卸，按顺序预演。 | `unloading.mp4`，1.10×；应用录制时已设置 2× 预演 |
| 53–60 秒 | 片尾 | 产品信息、测试版与适用边界 |

变速只调整视频的呈现节奏，不能作为应用实际计算耗时或现场装卸工时的依据。音乐在主合成内以 0.72 音量播放。原始配乐的生成方式与测量结果见 [../audio/README.md](../audio/README.md)。

## 内容与边界

- 录屏来自未篡改的真实应用界面，后期只进行裁剪、变速、画面排版、标题与说明叠加。没有以动画伪造按钮、参数变化或装卸成功状态。
- 货物来自 `examples/v127-beta-mixed-specs.json`，18 件、16 类包装，全部是合成测试参数。柜体是参数化结构示意，不是厂家实测数字孪生。
- 坐标调整镜头展示实际 XYZ 表单操作。规格片段展示更新模板后旧件保留原规格；不能把此片段解读为所有物流字段永远不更新。
- 本次装卸录屏使用已验证混合货单的严格直线路径。界面还提供智能绕行，但影片不证明任意遮挡均可解，也不表示叉车、吊具或现场作业已验证。
- 片尾 488 项核心测试与 148 项浏览器案例对应 2026 年 11 月 3 日该测试版的既定验收范围，不代表全部货物、全部设备或全部平台可靠性保证。浏览器验收环境为 Chrome 软件 WebGL2 与模拟触屏；Safari、实体手机、真实 Windows 环境尚未完成实机验收。
- 这是 Beta 试用展示。几何与路径预演不能替代实际尺寸、承压、绑扎、防滚、设备可达性和运输安全的专业核验。JSON 分享表示导出文件后由接收者在本机导入，不是云端同步。

## 许可

本视频源工程沿用 `package.json` 中的 `UNLICENSED`，没有新增开源许可。原创音乐和应用画面不含外部音乐采样。Remotion 使用其独立许可，不是 MIT；完整安装包许可保留在 [REMOTION-LICENSE.md](REMOTION-LICENSE.md)。React、React DOM、FFmpeg 与工具说明见 [THIRD-PARTY.md](THIRD-PARTY.md)。
