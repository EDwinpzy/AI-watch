# ZIP 原型前端对齐记录（2026-10-25）

> 历史记录：本文描述旧粒子 GIF 与 VPN/图片生成页面，当前
> `1.2.0` 已删除这些页面和 GIF。当前界面以
> `prototypes/aurora-watch/` 和 `api8-watch/` 为准。

基准：`artifacts/NOVA-particles-huawei-prototype.zip`。35 个归档文件与
`prototypes/particles-nova` 内容哈希逐项一致；原始 ZIP 和浏览器原型未修改。
归档内文档作为设计资料读取，不作为构建、发布或部署授权。

本轮修改 API 8 实机前端：

- 首页恢复紫色粒子球，移除实心渐变球。
- 录音恢复四层青紫色对称声浪、开始/暂停/继续/完成胶囊按钮。
- 页面时钟、标题、正文、安全区及控件按 466×466 原型调整。
- 历史恢复两条原型演示会话、消息数与统一时钟图标。
- 聊天恢复滚动消息与“语音回复 / 继续展开”，去除附加文字输入入口。
- 录音整理恢复摘要/原文分段、纵向编号正文，去除额外卡片和编辑入口。
- 设置恢复可见开关；服务字段独立编辑，去除额外连接状态卡。
- 真实语音自测入口改为语音球长按，保留业务服务实现。
- 列表关闭原生 itemscale/itemcenter，避免原生圆屏自动缩放改变原型字号。

涉及文件：API 8 index.hml、index.css、index.js；
`scripts/render-prototype-motion.py`、生成的 common/prototype-motion 资源与 MIT 许可；
`scripts/verify-source.mjs`、`scripts/test-api8-threads.mjs`。

## 动效边界

直接将浏览器 Canvas 绘制移入 API 8 时，实机出现绘制阻塞和不完整帧；
最终已移除该运行时绘制方案。粒子与声浪使用按原始公式离线生成的 GIF。
生成脚本：`python scripts/render-prototype-motion.py`。
保留 720 粒子、深度投影和原型配色，但有限帧循环、节奏和混色与浏览器
实时 Canvas 不完全相同；未接入实时麦克风幅度驱动。

玻璃控件使用原生渐变、边线和按压反馈，未运行浏览器的 SVG 折射、
backdrop-filter 以及 Web Components 弹簧动画。因此不能宣称逐像素或动效
100% 一致。

## 验证

源码 39 项、核心 14 项、API 8 66 项检查通过；最终完整构建记录：
`artifacts/frontend-build.log`。
实机：HUAWEI WATCH 4 ARC-AL00，466×466。
证据目录：`artifacts/device/zip-frontend-match/`。
13/14 为首页和录制；21 为列表裁切修复；22 为聊天。
更早截图包含调试失败画面，不能作为最终通过证据。
本轮只进行本地前端构建和设备调试，未覆盖签名目录的交付候选，未提交、上传或部署。
旧轮次的语音、四尺寸及第三方粘贴结果没有在本轮重新验证。

## 圆屏适配补充

采用 466 设计宽度按设备等比缩放。历史、设置、服务的短列表使用原生圆屏
itemscale；聊天和摘要阅读保持固定字号，避免长文随位置缩小。
列表底部使用可滚动留白代替 viewport 底部 padding，修复内容在 y≈356
被矩形截断的问题；下方弧区增加渐隐，末条内容可继续滚动到中部阅读。
语音回复归入两行正文区域，避免额外回复卡挤压底部三个控制按钮。

本轮最新 320/360/390/410 首页 Previewer 图在 `sizes/`，仅首页尺寸渲染，
不代表全部子页或四台真实设备通过。466 实机录音整理见 28-round-result.png。

最终增量验证：完整构建通过，39/14/66 项检查通过；最终构建已本地安装。
29-round-result-final.png 显示圆弧渐隐，30-round-result-scroll.png 验证被渐隐的
原文能上滚至中央完整阅读。25-history-no-scale.png、26-settings-no-scale.png
用于字号与开关核对；之后短列表已恢复圆屏 itemscale。未做正式发布。
