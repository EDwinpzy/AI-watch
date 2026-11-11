# 手表 API 接入

正式手表入口：`api8-watch/entry/src/main/js/HiWearMainAbility/pages/index/index.js`。

## 网络层

- `@ohos.net.http`：健康检查、Codex 异步任务创建/轮询/取消和旧 Ollama 链路。
- `@ohos.multimedia.audio`：16 kHz / 单声道 / s16le PCM 采集。
- 不存在 `@ohos.multimedia.media`、AudioPlayer 或 WAV 播放代码。

API 8 的 `@ohos.net.http` 会把 HTTP `202` 报告为连接异常，即使响应体已完整返回。
因此异步任务创建接口统一返回 HTTP `200`，异步状态由响应中的 `taskId` 和 `status`
表达；不要再使用 `@system.fetch` 的 60 秒响应窗口。

## 请求头

Codex 路由：

```text
Content-Type: application/json
X-Nova-Token: <当前页面内存中的令牌>
```

服务端也接受：

```text
Authorization: Bearer <token>
```

令牌不写入 URL、持久化存储或日志。

## 语音任务

```text
POST /api/codex/voice
```

```json
{
  "pcmBase64": "<PCM>",
  "sampleRate": 16000,
  "repoId": "watch",
  "mode": "readonly"
}
```

创建成功后立即进入任务页。手表每 1.5 秒请求
`GET /api/codex/task/{taskId}`，然后根据 `stage` 和 `message` 更新：

```text
正在连接 → 正在分析 → 正在检查仓库 → 正在整理 → 完成
```

离开任务页或结果页时停止轮询；PC 上的任务继续执行。重新进入可查看最近任务。

## 文字任务

```text
POST /api/codex/task
```

```json
{
  "prompt": "检查当前仓库结构",
  "transcript": "检查当前仓库结构",
  "repoId": "watch",
  "mode": "readonly"
}
```

## 取消

```text
POST /api/codex/task/{taskId}/cancel
```

业务按钮显示“停止任务”，不是导航控件的返回/关闭按钮。

## 静音约束

- 语音模式和文字模式都只显示 `finalText` / `speechText`。
- `audioUrl` 不参与 UI 状态。
- 不发送 `/api/tts`。
- 不请求 `/api/audio/*.wav`。
- 不导入媒体播放模块。

## 旧链路

设置页仍可在 `Codex` 与 `Ollama` 间切换。Ollama 模式复用旧
`POST /api/voice`；手表读取 `transcript` 和 `reply` 并显示为文字，
忽略服务端兼容返回的音频地址。

## 错误反馈

- 未填令牌：本地直接提示。
- 401：令牌无效。
- 409：已有任务执行。
- 后端不可用：数秒内进入失败状态。
- 任务失败/取消：显示简短原因，不打印完整命令输出。

## 安全要求

- 服务端 allowlist 必须包含手表 IP。
- Codex 仓库只能来自服务端配置。
- 第一版只读，不允许手表指定写模式。
- 公网使用前必须改为 HTTPS、短期凭据和反向代理限流。
