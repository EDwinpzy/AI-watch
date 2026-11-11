# 真实语音与模型服务

> 历史原型：本文的 PC 本地语音服务只对应旧版 Stage/API 8 验证工程。
> 当前手表发布入口使用固定 Magpie Relay 聊天、第三方 STT 与在线 TTS，
> 不再调用本文的 `/api/voice` 或 `/api/tts`。

`scripts/ai_service.py` 是 NOVA Watch AI 的本地验证后端，运行在 PC 上，
手表 API 8 HAP 通过局域网 HTTP 调用它。

## 架构

```text
HAP AudioCapturer (s16le/16000/mono)
   -> POST /api/voice (JSON, base64 PCM)
   -> Whisper CUDA/CPU 转写
   -> Ollama /api/generate
   -> Windows SAPI zh-CN 合成 WAV
   -> HAP media.AudioPlayer 播放
```

文本聊天走 `POST /api/chat`；`/health` 用于真实连接测试。服务端不会
接受 allowlist 之外的客户端，HAP 的服务地址必须在设置页中配置。

## 启动

```powershell
powershell -ExecutionPolicy Bypass -File scripts\start-ai-service.ps1 `
  -AllowClient 192.168.1.89
```

服务会绑定当前活动以太网/局域网 IPv4，端口默认 `8787`，并打印实际地址。
当前环境对应：

```text
http://192.168.1.129:8787
```

## 端点

| 方法 | 路径 | 作用 |
|---|---|---|
| GET | `/health` | 服务、模型、ASR 和 TTS 状态 |
| POST | `/api/chat` | `{prompt, model?}`，真实 Ollama 对话 |
| POST | `/api/asr` | 原始 s16le/16000/mono PCM，返回转写 |
| POST | `/api/tts` | `{text}`，返回音频 URL |
| POST | `/api/voice` | JSON `{pcmBase64, model?, sampleRate}`，完整语音闭环 |
| GET | `/api/audio/<id>.wav` | 下载服务生成的 WAV |

## 实机结果

最终 HAP 的“真实语音自测”已跑通：

- 手表采集 217,600 bytes PCM。
- Whisper 返回可读的中文转写。
- Ollama 返回真实中文回答。
- SAPI 生成 203,020 bytes WAV。
- 手表请求到 TTS WAV，并进入回答状态。
- 服务日志在 `artifacts/ai-service/runtime-20261025/`。

文本聊天也已通过手表 POST `/api/chat` 收到 Ollama 回复。

## 已知边界

- Whisper 首次加载会明显增加延迟；当前实机一次完整流水线在已热身时约
  1.7 秒，模型首次加载/冷启动时可达到约 29 秒。
- HAP 使用明文 HTTP 访问局域网服务；`config.json` 已显式开启
  `cleartextTraffic`。生产环境必须改为 HTTPS、服务端鉴权和密钥托管。
- 当前服务只针对本机验证，不自动暴露公网，也不保存用户音频到外部服务。
  音频和日志保存在本机 `artifacts/ai-service/runtime-20261025/`，需要按
  隐私要求清理。
- 语音测试使用手表扬声器播放问题音频作为可重复输入，采集链路是真实的；
  尚未使用真人长句、不同口音和嘈杂环境做统计性评测。
- HAP 的 `@system.fetch` 实测存在约 60 秒响应窗口。模型重载/排队超过该窗口时，
  界面会显示 `fetch 200`，即使服务端稍后完成。服务已增加模型预热和
  `keep_alive=30m`；生产实现应改为异步任务 + 状态轮询，或使用支持更长读取超时的
  传输层。
