# 前端架构

## 1. 入口边界

| 路径 | 角色 | 是否发布 |
|---|---|---|
| `api8-watch/` | HarmonyOS API 8 手表正式 FA 工程 | 是 |
| `prototypes/aurora-watch/` | 466×466 Web 视觉与交互原型 | 否 |
| `entry/` | ArkUI 预览工程 | 否 |
| `android-watch/` | Android 诊断探针 | 否 |
| `prototypes/particles-nova/` | 历史粒子视觉研究 | 否 |

## 2. 正式手表页面

主页面由 `pageIndex` 控制：

```text
0 首页
1 录音摘要
2 最近任务
3 设置
```

子页面由 `subPage` 控制：

```text
voice   语音对话
answer  语音回答
task    Codex 任务状态
result  任务结果
chat    文字对话
api     服务配置
field   字段编辑
```

所有页面集中在 API 8 `index.hml` / `index.css` / `index.js`，
没有 WebView。

## 3. 状态

主要状态：

```text
clockText / dateText
pageIndex / mainVisible / subPage
voiceMode / voiceState / voiceTranscriptText
recordRunning / recordSeconds / recordHasProgress
codexTaskId / codexStatus / codexStage / codexMessage
taskHistory / threads / currentThreadId
apiBaseUrl / codexToken / codexRepoId
```

服务地址与令牌只保存在当前页面内存。页面重建后需重新输入。

## 4. 生命周期

- `onInit` 初始化时钟、波形和计时器。
- `onHide` 停止 Codex 轮询。
- `onShow` 在任务页恢复轮询。
- `onDestroy` 清理时钟、录音、语音和网络资源。
- 轮询间隔 `1500 ms`，完成/失败/取消后停止。

## 5. 手势

- 主页面上下滑切换。
- 子页左滑逐级返回。
- 字段编辑左滑先关闭编辑层。
- 列表滚动优先，滚到端点后才把手势交给菜单。
- 不显示返回、关闭或取消导航按钮。

## 6. 静音设计

前端不存在媒体播放依赖。声音设置是固定只读状态，不是开关。回答通过
文字显示，任务状态通过文字和触感反馈表达。

## 7. Web 原型

`prototypes/aurora-watch/` 为纯 HTML/CSS/JS：

- `index.html`：桌面评审外壳与圆屏容器。
- `app.js`：11 屏模板、状态、手势和导航。
- `styles.css`：表壳、玻璃表面、安全区与动效。
- `assets/` / `vendor/`：当前实际使用的本地资源。

它只用于视觉评审，不直接打包进 HAP。

## 8. 构建与检查

```powershell
npm run check:source
npm run check:core
npm run check:api8
node --check prototypes/aurora-watch/app.js
```

API 8 HAP 构建命令见 `api8-watch/README.md`。
