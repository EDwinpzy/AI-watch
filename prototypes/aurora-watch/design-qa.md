# Aurora Watch Design QA

## Comparison Target

源视觉：

- `artifacts/design/aurora-watch-20261111/source/home-reference.webp`
- `artifacts/design/aurora-watch-20261111/source/record-reference.webp`
- `artifacts/design/aurora-watch-20261111/source/vpn-reference.webp`
- `artifacts/design/aurora-watch-20261111/source/summary-reference.webp`
- `artifacts/design/aurora-watch-20261111/source/screen-board-reference.png`

实现证据：

- 21 屏联系表：`artifacts/design/aurora-watch-20261111/implementation-contact-sheet.png`
- 全屏：`artifacts/design/aurora-watch-20261111/screens/01-home.png` 至
  `21-nodes.png`
- 同视口对比：`artifacts/design/aurora-watch-20261111/comparisons/compare-home.png`、
  `compare-record.png`、`compare-vpn.png`、`compare-summary.png`
- 细节对比：`comparisons/focus-summary-meta.png`、`comparisons/focus-vpn-node.png`
- 手势复查联系表：
  `artifacts/design/aurora-watch-20261111/gesture-review/gesture-review-contact-sheet.png`
- 手势复查原图：`gesture-review/00-home.png`、`02-listening.png`、
  `03-answer.png`、`04-actions.png`、`05-history.png`、`12-recording.png`、
  `19b-provider-editor.png`、`21-nodes.png`、`21-nodes-swipe-preview.png`

这些截图是本机验收证据；`artifacts/` 不纳入 Git。

## Viewport And Normalization

- CSS 视口：桌面舞台 466 × 540；圆屏应用面 466 × 466。
- 手势复查使用 `capture-mode` 的 466 × 466 应用面，截图为 466 × 466，
  密度 1:1，无缩放；历史全屏证据仍按 466 × 540 裁切。
- 源图：512 × 512，含表壳与金属边框。对照时裁取圆屏内容
  `(27, 27) – (485, 485)`，即 458 × 458，再等宽缩放到 466 × 466。
- 状态：默认首页；录音页、实时转写、摘要、生成中和完成态分别截取。
- 源图中的设备表耳、表冠、阴影不属于应用内容，未计入实现差异。

## Full-View Comparison

已打开源图与实现截图，并在同一张对比图中检查首页、录音入口、VPN 和
摘要页。21 屏整体联系表用于检查跨页面层级、圆屏安全区、底栏和内容密度。

五项必查表面：

- 字体：系统圆体无衬线栈，中文正文和微型状态的层级一致；摘要页字号
  已提升到更接近源图的可读范围。品牌字标使用 NOVA 代替 ChatGPT，
  是面向 AI-watch 产品的有意适配。
- 间距：标题、标签栏、内容区和底部操作均避开圆弧；列表底部采用内部
  滚动，不再压住固定按钮。
- 色彩：深黑玻璃底、青色高光、绿色成功态和红色录音停止态对应源图；
  边界和阴影保持低对比。
- 图像：主页能量球、旅行图和生成图像都使用参考图裁出的真实位图；
  图标使用 Phosphor，品牌标志使用 Simple Icons 原始文件。
- 文案：中文任务文案、模型状态、VPN 状态和录音结果保持一致；演示数据
  没有伪装成真实 API 返回。

重点关注区域：摘要双状态标签与两枚元信息、VPN 节点卡和右侧延迟状态。

## Gesture Review

- 使用 DevTools 指针事件实际执行右滑：节点 → VPN、API 配置 → 模型切换、
  快捷操作 → 回答、回答 → 首页；首页右滑保持不动。
- 从首页进入模型、从设置进入推荐提问后，右滑均回到实际来源页，
  而非固定写死的上级页。
- 字段编辑浮层右滑后回到 API 配置页；保存按钮仍可提交并回显新值。
- 21 个页面逐一扫描，返回、关闭、取消类按钮数量为 0；历史页右上角
  的 `+` 是“新建对话”业务动作，不属于导航控件。
- 滑动过程有轻微右移与降透明反馈，越过约 56 px 后触发返回。

## Findings

- 无未解决的 P0 / P1 / P2 视觉或可用性问题。
- [P3] 源图的 VPN 能量环更亮、更宽；实现采用更克制的亮度，避免在纯黑
  浏览器外框上过曝。
- [P3] 第三方接口的密钥与默认项位于内部滚动区；保存按钮固定可见，
  符合小圆屏优先保留主操作的选择。
- [P3] 浏览器可能在 466 × 466 应用面之外显示翻译提示条；该提示条不属于
  原型页面，已从验收截图中裁除。

## Comparison History

1. 初次截图发现 VPN 节点卡与两个主按钮重叠，接口配置内容进入保存按钮
   下方，录音首页球体与卡片互相挤压，摘要第三点被底部渐隐遮住。
2. 调整 VPN 主球、状态、节点卡和操作组的纵向顺序；接口滚动区在保存
   按钮上方结束；录音页收紧球体、卡片和底部提示；摘要重排字号、间距
   和渐隐范围。
3. 第二轮回看发现推荐提问底部卡片、历史新建按钮和模型列表最后一卡
   贴近圆弧；缩窄对应内容区，并去掉模型页重复的底部入口。
4. 最终截图确认：无遮挡、无横向溢出，所有主要按钮位于可点击圆弧区域；
   摘要双枚元信息保持单行，第三项完整可见。
5. 手势复查发现标题旁的返回按钮和两处关闭/取消控件会重复占用圆屏
   边缘空间；已全部移除，改为右滑逐级返回，并复核聆听、回答、快捷操作、
   录音、历史、节点和字段编辑浮层。

## Interactions Tested

- 首页开始语音、停止聆听、回答复制、快捷操作、反馈
- 录音开始、暂停、继续、结束、实时转写、生成摘要、查看原文、再录一段
- 摘要/转写标签、复制、继续追问
- 模型切换、官方/第三方切换、字段编辑、连接测试、保存
- VPN 断开/连接、打开节点列表、选择节点并回显
- 图片生成等待态与结果页、保存提示、设置项循环切换
- 表盘右滑逐级返回、首页右滑锁定、动态来源页返回、编辑浮层右滑关闭
- 键盘 `←` / `Esc` 逐级返回、`→` 浏览下一屏

## Console And Assets

- 浏览器控制台：0 个 error，0 个 warning。
- 466 × 466 捕获模式截图检查通过，无返回/关闭/取消按钮残留。
- 最终页面截图中的图片资源均加载完成。
- `node --check prototypes\aurora-watch\app.js` 通过。
- 项目结构审计：0 error，0 warning。

## Follow-Up Polish

- 若走向真实 HAP，需要另做手表真机、麦克风、网络、TTS 与圆屏触控验收。
- 公开发布前需复核 OpenAI、Anthropic、Gemini 品牌标志的商标使用边界。

final result: passed
