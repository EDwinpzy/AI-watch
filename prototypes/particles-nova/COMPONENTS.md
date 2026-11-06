# 组件使用记录

指定来源：Harmony OS 可穿戴设备，皮卡啾⚡️，Pixso Community。
https://pixso.cn/community/file/S4sfYgulF2b2GMb0VX9GPQ

本轮通过浏览器查看资源总览及组件画布。可见 Navigation dot、Title、Progress Indicators、List、Divider、Picker 等区域，未取得设计源文件或准确尺寸变量。

| 原型部分 | 参照资源 | 本轮实现 |
| --- | --- | --- |
| 标题栏 | Title | 黑底、居中白色标题 |
| 会话和设置列表 | List | 黑底列表、分隔、次级灰字 |
| 页面指示 | Navigation dot | 首页底部点状指示；目前为静态装饰 |
| 语音主视觉 | VoiceOrbs Particles Orb | 用户明确选定，保留紫蓝粒子和状态切换 |
| 按钮、表单 | 华为穿戴整体视觉 | 暂用黑灰底、蓝色操作按钮实现，尚未核对对应组件源文件 |
| 文字聊天气泡 | 业务专用 | 原型新增内容，非已验证组件库实例 |

本地 HTML/CSS 不是 Pixso 原生实例。后续若取得导出的组件文件，需要进一步替换图标、精确校准字号/间距与组件状态，不能宣称完全复用了组件库。

粒子球改编说明与 MIT 许可位于 README.md、vendor/VOICEORBS-LICENSE.txt；Pixso 来源的署名及 CC BY 4.0 链接已加入预览页。

Apple Watch 按钮参考修订：依据 https://developer.apple.com/design/human-interface-guidelines/buttons 的 watchOS 部分，采用内容内胶囊形按钮、同排等高、单一主色强调、按压状态；独立 HTML/CSS 实现，未导入 Apple 官方 UI Kit、SF 字体或符号。官方资源许可 https://developer.apple.com/support/downloads/terms/apple-design-resources/Apple-Design-Resources-License-20230621-English.pdf 限定 Apple 平台，不作为本华为原型素材来源。浏览器录制/暂停点击复测通过。

## 实际复用的开源控件（2026-10-25）

1. IshiakiZ/liquid-glass-web v1.2.0，MIT。https://github.com/IshiakiZ/liquid-glass-web
   本地文件 vendor/liquid-glass-web/liquid-glass.css、liquid-glass.js、LICENSE。
   录音按钮、主要动作和语音控制使用 glass/glass-button、data-glass-interactive，经 LiquidGlass.register 注册，使用库自带材质与按压弹性。圆屏尺寸及配色见 reused-controls.css。
2. gentpan/liquidglass v1.0.0，MIT。https://github.com/gentpan/liquidglass ，演示 https://liquidglass.dev/
   本地文件 vendor/liquidglass/components.js、liquid-glass.js、LICENSE。
   合并结果页实际使用 lg-segmented 原生自定义元素，复用 SVG 光学渲染和滑动弹簧。切换时只更换正文，不重建分段控件。
3. reused-controls.js 为本地连接层；两套库源码保持下载内容，独立保存各自 LICENSE。运行时从本地加载，不依赖第三方 CDN。

验证：JS 语法通过；浏览器开始录音→完成→摘要/原文双向切换通过；控制台错误记录为空。此结论限浏览器原型，未证明原生 WATCH 4 兼容性或动画性能。
