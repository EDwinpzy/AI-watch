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
2 最近
3 设置
```

首页只保留两个主入口：开始对话、录音摘要。文字对话统一从
“最近 → 新建对话”进入，不再作为首页第三个入口。

子页面由 `subPage` 控制：

```text
voice   语音对话
answer  语音回答
task    Codex 任务状态
result  任务结果
chat    文字对话
```

经典 Aurora 页面集中在 API 8 `pages/index/index.*`。Apple Watch 圆环界面
独立位于 `pages/round/index.*`，通过 `@ohos.router` 从设置页双向切换。
两套页面都没有 WebView，也不会在切换时删除另一套实现。圆环页已补齐
60 秒录音摘要、Codex 任务轮询、任务历史、结果转写编辑和语音回答页。
经典 Aurora 不绘制应用内时间/日期/信号/电池状态区，主页面按
“一屏一主任务”收敛，只保留核心信息和操作。

## 3. 状态

主要状态：

```text
pageIndex / mainVisible / subPage
voiceMode / voiceState / voiceTranscriptText
recordRunning / recordSeconds / recordHasProgress
codexTaskId / codexStatus / codexStage / codexMessage
taskHistory / threads / currentThreadId
builtInConfig / model state
圆环表盘：clockText / dateText
```

模型地址、模型名称和局域网客户端令牌在构建时注入；两套界面都不显示服务配置
或字段编辑入口。上游模型密钥只保存在 PC 本地，不进入 HAP。

## 4. 生命周期

- `onInit` 初始化波形和计时器；圆环表盘单独维护自己的时间。
- `onHide` 停止 Codex 轮询。
- `onShow` 在任务页恢复轮询。
- `onDestroy` 清理录音、语音和网络资源。
- 轮询间隔 `1500 ms`，完成/失败/取消后停止。

## 5. 手势

- 主页面上下滑切换。
- 子页左滑逐级返回。
- 列表滚动优先，滚到端点后才把手势交给菜单。
- 不显示返回、关闭或取消导航按钮。

## 6. 静音设计

经典 Aurora 页不存在媒体播放依赖，声音设置是固定只读状态。圆环页保留
可选 TTS，但 `voiceOutputEnabled` 默认关闭；回答始终先以文字显示。

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
