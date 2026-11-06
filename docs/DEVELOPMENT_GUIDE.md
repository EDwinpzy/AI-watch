# 开发指南（Development Guide）

## 1. 本地运行

### 方式 A：直接打开

直接在现代浏览器打开项目根目录的 `index.html`。原型为单文件 HTML，不需要 Node.js、依赖安装或编译步骤。

### 方式 B：静态服务器

在项目根目录运行：

```bash
python -m http.server 8080
```

然后打开 `http://localhost:8080`。这种方式也方便浏览 SVG 资产与文档文件。

## 2. 验收入口

- `index.html`：交互原型
- `asset-gallery.html`：查看品牌标志、语音球、录音球、波形与图标
- `docs/QA_CHECKLIST.md`：交付前检查清单
- `docs/INTERACTION_SPEC.md`：页面行为和手势说明

## 3. 原型代码约定

当前实现采用原生 JavaScript 的集中状态模型：

- 页面模板集中在 `screenBody()`。
- 所有按钮动作通过 `data-action` 委派给 `handleAction()`。
- 页面跳转通过 `navigate()` 和 `back()` 管理。
- 当前屏幕标识放在 `watchContent.dataset.screen`，CSS 以此做页面级样式。
- 圆形视口通过 `watch-case`、`watch-face`、`watch-content` 三层实现。

修改页面时优先复用现有的 `data-screen`、`data-action` 模式，不要给每个控件重复绑定独立监听器。

## 4. 圆屏适配原则

- 不以矩形屏幕的全宽排版直接缩放成圆形。
- 将标题、正文、输入框与主要操作限制在圆屏中心安全区。
- 长列表使用容器内滚动；消息气泡允许自然增高。
- 不要给动态文字设置固定高度并使用 `overflow:hidden`。
- 聊天页应保留常规气泡和输入框，语音动画仅在首页显示。
- 每次调整字号、间距或按钮尺寸后，在 320 / 360 / 390 / 410 px 视口复核。

## 5. 资产使用

- SVG 是源文件，建议保留为设计与开发的主版本。
- 图标以 `currentColor` 着色，可通过父级 `color` 统一主题。
- Token 位于 `assets/tokens.json`；调整主色或动效时长时应同步更新设计文档。
- `previews/` 中的 PNG 是便于浏览和评审的导出图，不替代 SVG 源文件。

## 6. 接入真实 API 前必须完成

1. 建立后端 API 代理；生产密钥只放服务端。
2. 定义会话、聊天、语音、转写与摘要的数据契约。
3. 加入 loading、取消、超时、断网、鉴权失败和限流状态。
4. 明确录音授权、音频保留、转写删除和隐私提示。
5. 通过真实设备验证麦克风权限、输入法、手势和滚动行为。
6. 完成 `API_INTEGRATION.md` 与 `QA_CHECKLIST.md` 中的生产化项目。

## 7. 安全注意事项

当前 API 表单只用于演示字段与格式校验，不发起请求。不要把真实 API Key 粘贴到公开演示环境。正式接入时，不要将密钥写入前端源码、URL、localStorage、sessionStorage 或日志。
