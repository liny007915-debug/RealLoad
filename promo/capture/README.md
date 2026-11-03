# RealLoad 真实界面录制素材

全部来自当前项目的实际 WebGL2 界面，使用独立无痕 Chrome 上下文录制。没有使用或读取用户浏览器存档，没有修改应用源码。仅导入 `examples/v127-beta-mixed-specs.json`，这是原创合成回归样本，并非厂家参数，也不构成装运安全认证。

规格：1600 × 900，25 fps，WebM / VP8，无音轨。6 段最终录制均无页面 JavaScript 异常；完整装卸段通过实际界面设置 2× 播放，18 件装入和 18 件卸出均达到完成状态。早先本机 Chrome 录制中断的素材已被成功重录替换。

原片包含准备过程，剪辑请使用 `capture-manifest.json` 的 `recommendedTrim`；其中 `marks` 还记录切换视图、透明度和装卸动画的时间点。时间点从页面建立时的录制时钟计算，可有少量首帧偏移，建议起点已提取为同名 `-trim-start.jpg` 供确认。原片时长和视频规格已用 ffprobe 验证。

| 素材 | 原片秒数 | 建议起点 | 建议终点 | 建议时长 |
|---|---:|---:|---:|---:|
| 01-fullscreen-orbit.webm | 11.920 | 2.751 | 10.358 | 7.607 |
| 02-precise-cargo-edit.webm | 10.720 | 2.761 | 8.958 | 6.197 |
| 03-shell-opacity-and-doors.webm | 13.400 | 2.968 | 11.720 | 8.752 |
| 04-shared-coordinate-four-views.webm | 13.840 | 2.442 | 12.244 | 9.802 |
| 05-ordered-load-and-unload.webm | 27.040 | 3.098 | 26.740 | 23.642 |
| 06-independent-physical-specifications.webm | 12.880 | 4.533 | 12.218 | 7.685 |

`hero-clean.png` 直接导出实际 WebGL canvas 像素，完整柜体、双开门与混合货物，没有工具栏或 DOM 标注覆盖，适合片头。`cover-fullscreen-mixed-cargo.png` 与 `clean-fullscreen-container.png` 则保留极简退出控件，属于屏幕原样截图。

其它关键 PNG：`precise-position-editor.png`、`transparent-body-open-doors.png`、`four-shared-coordinate-views.png`、`load-sequence-complete.png`、`unload-motion-and-sequence.png`、`old-physical-specs-retained.png`、`selected-original-physical-cargo.png`。

`capture.mjs` 为可重复录制脚本，`CAPTURE_CASE` 可筛选片段，`CAPTURE_CASE=hero HERO_ONLY=1` 只补录纯画布封面。现有 4266 服务可用时只读取该服务；不可用时启动自己的随机端口并在结束后清理。所有录制浏览器已关闭，没有停止已有的 4202 或 4266 服务。

开发录制工具：当前宿主已有 Playwright，以及下载自 Playwright 官方分发的 FFmpeg v1011 mac-arm64。工具文件保留在 `browser-cache/`，其 LGPL 许可随包提供；`.gitignore` 已排除该目录及临时原始文件目录，最终 GitHub 提交不应包含这些工具二进制。录制没有引入新的应用依赖。
