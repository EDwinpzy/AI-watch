# 前端架构说明

## 1. 当前实现

当前原型以单文件 HTML 实现：HTML 模板、CSS 设计系统和原生 JavaScript 状态逻辑内嵌在 `index.html`，无第三方依赖，无构建步骤。适合快速评审、交互走查和设计验证，不建议直接作为正式生产应用的长期架构。

## 2. 主要结构

- `app-shell`：桌面预览的顶部、页面导航、手表舞台、右侧说明面板。
- `watch-case` / `watch-face`：表壳、表圈和圆形视口。
- `watch-content`：当前屏幕渲染目标，按 `data-screen` 状态选择模板。
- `screenBody()`：根据页面 ID 生成页面 HTML。
- `render()`：更新导航、当前页、右侧状态和计时器。
- `handleAction()`：统一处理按钮动作。
- `navigate()` / `back()`：管理页面切换与返回栈。
- `state`：保存页面状态、聊天线程、音色、API 表单值、录音计时和语音交互状态。

## 3. 状态模型（简化）

```js
{
  screen: 'home',
  stack: [],
  homeVoiceActive: false,
  callState: 'listening',
  chatThreads: [],
  activeThread: 'ai',
  chatMessages: [],
  recordText: '',
  summaryItems: [],
  apiBaseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  apiModel: 'gpt-4o-mini'
}
```

该对象只存在当前页面内存。刷新后恢复初始演示数据。

## 4. 定时器生命周期

- 录音计时器只在 `recording` 页面运行。
- 首页语音计时器只在 `homeVoiceActive === true` 且当前页为首页时运行。
- 阶段转换定时器在结束语音、重置状态或切换页面时清理。
- 扩展功能时，推荐将计时器管理封装为独立控制器，并在卸载/导航时统一释放。

## 5. 建议的生产化拆分

建议迁移为 Vite + TypeScript（或团队现有栈），目录可拆为：

- `src/app/`：路由、状态管理
- `src/components/watch/`：表圈、圆屏安全区、手势控制
- `src/features/voice/`：语音会话状态机
- `src/features/chat/`：消息列表、输入、历史会话
- `src/features/recording/`：录音、转写、摘要
- `src/features/settings/`：API 配置
- `src/services/`：后端 API 客户端
- `src/styles/tokens.css`：设计 Token
- `public/assets/`：SVG 美术资产

## 6. 安全边界

前端不得持有生产 API Key。真实调用应经过自有后端，使用服务端环境变量和短时会话凭据。日志不得输出密钥、音频或敏感转写全文。
