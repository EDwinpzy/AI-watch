# 手表 API 接入

正式手表包含两个页面：

- `pages/index/index`：经典 Aurora 界面，接入 PC 本地 Whisper/Codex 服务。
- `pages/round/index`：Apple Watch 圆环界面，接入内置 Magpie、STT.ai
  和可选 TTS。

两个页面通过 API 8 `@ohos.router` 双向切换。

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

## 经典页静音约束

- 语音模式和文字模式都只显示 `finalText` / `speechText`。
- `audioUrl` 不参与 UI 状态。
- 不发送 `/api/tts`。
- 不请求 `/api/audio/*.wav`。
- 不导入媒体播放模块。

以上约束适用于经典页。圆环页为兼容早期语音播报能力而保留媒体播放器，
但自动播报默认关闭，必须由用户手动开启。

## 旧链路

手表默认使用内置 OpenAI Compatible 模型，不再显示 `Codex` / `Ollama`
后端切换。旧 `POST /api/voice` 仅作为服务端兼容接口保留；手表读取
`transcript` 和 `reply` 并显示为文字，忽略兼容返回的音频地址。

经典页的 `POST /api/asr` 使用 JSON 请求：

```json
{
  "pcmBase64": "<16 kHz mono S16LE PCM>",
  "sampleRate": 16000
}
```

服务端仍兼容旧的原生 `application/octet-stream` PCM 请求。手表优先使用
JSON/base64，避免 API 8 上直接发送 `ArrayBuffer` 时回调不返回。

## 圆环页链路

- 聊天：`POST http://<PC-LAN-IP>:8787/v1/chat/completions`，由 PC 服务转发到
  `http://127.0.0.1:3425/v1` 的 `workbuddy/deepseek-v4.1-flash`
- Codex：`POST /api/codex/voice`、`POST /api/codex/task`、状态轮询与取消
- STT：`wss://api.stt.ai/v1/stream`，16 kHz、单声道、S16LE PCM
- TTS：`https://fanyi.baidu.com/gettts`，默认关闭

Magpie 上游地址、模型和 API Key 只写入 PC 本地
`.secrets/built-in-service.json`。HAP 只接收局域网中继地址、模型名称和
独立客户端令牌，生成文件为
`api8-watch/entry/src/main/js/HiWearMainAbility/built-in-config.js`；
该文件由 `scripts/prepare-built-in-config.ps1` 创建并被 Git 忽略。
两套界面都不显示服务地址、密钥或字段编辑入口。
经典页默认发送 `max_tokens=128`、`temperature=0.2` 和
`reasoning_effort=none`，以控制首字等待时间。

## 错误反馈

- 内置模型不可用：检查局域网中继是否启动。
- 401：令牌无效。
- 409：已有任务执行。
- 后端不可用：数秒内进入失败状态。
- 任务失败/取消：显示简短原因，不打印完整命令输出。

## 安全要求

- 服务端 allowlist 必须包含手表 IP。
- Codex 仓库只能来自服务端配置。
- 第一版只读，不允许手表指定写模式。
- 公网使用前必须改为 HTTPS、短期凭据和反向代理限流。
