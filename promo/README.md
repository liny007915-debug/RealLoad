# RealLoad Studio 1.27 Beta1 宣传素材

主题：**装得下，也看得清。** 主片为 1920 × 1080、30 fps、60 秒，中文主字幕与原创音乐，无旁白。

画面主体来自当前应用的真实界面录制，展示混合包装、坐标编辑、旧件独立规格、完整柜体透明度、四视图与逐件卸出。录制使用独立浏览器环境和合成测试货单，不读取用户的浏览器存档。

## 目录

| 路径 | 用途 |
| --- | --- |
| `video/` | Remotion 视频源工程与已预剪的 `public/` 素材 |
| `RealLoad-Promo.zh-CN.srt` | 与七段主标题对应的中文字幕 |
| `audio/` | 原创 60 秒配乐 WAV、生成脚本与音频测量记录 |
| `capture/` | 原始真实界面录屏、截图和录制来源记录；常规渲染不依赖原片 |
| `宣传片文案.md` | 早期制作文案与事实边界；最终镜头时长以视频源工程和下表为准 |

`github-stage/` 是另外准备的发布暂存目录，不参与视频渲染。

## 从 Git 源码获取媒体素材

Git checkout 不包含体积较大的录屏片段、音乐和片头图片。请从项目 GitHub Release 下载 **`RealLoad-Promo-Source-v1.27-Beta1.zip`**，解压后保留 `promo/` 目录结构，直接使用其中的 `promo/video/` 工程；也可仅将包内 `promo/video/public/` 的八份必需文件复制到 checkout 对应目录，再执行下面的命令。

该 ZIP 包含重新渲染所需的预剪 MP4、`music.m4a`、`hero.png` 和制作说明。包内 `capture/` 仅带录制清单与说明，不包含原始 WebM 或录制工具；`audio/` 带原创配乐生成脚本与测量记录，不包含原始 WAV。原始录屏和音频均不是常规渲染依赖。

## 复现主片

在 `promo/video/` 中执行：

```sh
npm ci
npm run dev -- --no-open
```

主合成为 `RealLoad-Promo`。Node.js 版本按该目录 `package.json` 的 `engines` 选择。本机优先采用分段导出：

```sh
node render-segmented.mjs
```

脚本沿相同时间线连续渲染十段 6 秒画面，完整覆盖 1800 帧，再合并同一首连续配乐，避免音频分段接缝。合并时转换为有限色彩范围，编码为 H.264 / YUV420P；连续音乐为 0.72 音量、AAC 192 kb/s。默认使用 macOS Chrome，可通过 `REALLOAD_RENDER_BROWSER` 指定可执行文件路径；默认成片位于根目录 `release/`，首个参数可改输出路径，缺少的输出目录会自动创建。标准单次渲染命令也保留：

```sh
npx remotion render src/index.ts RealLoad-Promo out/RealLoad-Promo-1080p.mp4 --codec=h264 --concurrency=1 --disable-shared-memory-capture
```

本机快速截图通道曾出现画面拼接异常，常规截图正确，因此复现命令必须保留 `--disable-shared-memory-capture`。完整 Chrome 长时间渲染曾中断，Headless Shell 158.0.8127.2 加载根合成也曾超时，因此本机改用上述分段方案。单次渲染可通过 `--browser-executable` 覆盖浏览器，首次获取默认浏览器可运行 `npx remotion browser ensure`。完整操作、依赖版本、变速与许可见 [video/README.md](video/README.md)。

已准备的六段 MP4、`music.m4a` 和 `hero.png` 足以渲染，不需要原始 capture 或 WAV。`video/prepare-media.mjs` 仅在原始素材齐全、需要重新裁剪时使用。

## 烧录标题与独立字幕

以下标题与说明对应当前 `video/src/` 实际烧录内容；SRT 沿用同一时间段，不将原片准备过程写入字幕。

| 时间 | 主标题 | 对应说明 |
| --- | --- | --- |
| 00–06 秒 | 装得下。也看得清。 | 装载规划，放到眼前。 |
| 06–14 秒 | 每种货物，都有模样。 | 16 类包装，包含不规则货物。 |
| 14–23 秒 | 摆放，直接上手。 | 自由拖动，也能用 XYZ 精确调整。 |
| 23–34 秒 | 模板更新，旧件照旧。 | 新规格，从下一件开始。 |
| 34–43 秒 | 柜内柜外，都看清。 | 完整柜体 · 可调透明度 · 四视图 · 图像全屏 |
| 43–53 秒 | 装卸，按顺序预演。 | 尝试计算路径，让每一步都有顺序。 |
| 53–60 秒 | 装得下，也看得清。 | RealLoad Studio 1.27 Beta1 测试版 |

主片已烧录标题与说明。SRT 用于发布平台的可选字幕轨，不需要再次烧录到已带文字的主片，否则可能重复显示。片尾还显示本地运行、JSON 分享、20 个指南主题，以及该版本通过的 488 项核心测试和 148 项浏览器案例。

## 来源和使用边界

录制来源为 RealLoad Studio 1.27 Beta1，测试货单为 `examples/v127-beta-mixed-specs.json`，18 件、16 类包装，均为合成演示数据。原始录制记录见 `capture/capture-manifest.json`；预剪素材来源、裁剪点与哈希以视频工程随附的 `video/media-production.json` 为准。

未篡改录屏中的应用 UI 或成功状态；成片使用裁剪、变速、排版和标题叠加。坐标镜头展示实际表单操作，装卸镜头来自已验证货单的严格直线预演。变速不表示软件计算耗时或现实作业速度，也不证明任意遮挡均可绕行。

测试数字对应 2026 年 11 月 3 日的既定验收案例。Chrome 软件 WebGL2 与模拟触屏的通过结果不能替代 Safari、实体手机、真实 Windows 和现场设备验收。影片是 Beta 试用展示，不宣称已完成正式上架或运输作业认证。柜体结构与包装外观为示意，几何与路径预演仍需配合实测尺寸及专业运输安全核验。

音乐为本项目原创合成，不含外部采样。视频源工程保持 `UNLICENSED`，没有新增开源授权。Remotion 的独立许可与其它构建依赖记录见 [video/THIRD-PARTY.md](video/THIRD-PARTY.md)。
