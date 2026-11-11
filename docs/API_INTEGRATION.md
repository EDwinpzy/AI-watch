# 内置 AI 接入

API 8 手表端使用固定的 Magpie Relay 连接，不再提供用户可编辑的服务配置。

## 固定配置

| 项目 | 值 |
|---|---|
| Base URL | `https://magpie-relay.pengzhiyuan0724.workers.dev/v1` |
| Model | `group/ai-watch` |
| Endpoint | `POST /v1/chat/completions` |
| 传输 | HTTPS |
| 响应模式 | 非流式 JSON |

访问密钥写在 `api8-watch/entry/src/main/js/HiWearMainAbility/pages/index/index.js`
并随 HAP 分发。它不会显示在界面、写入 URL、持久化或以明文形式记录到日志。
但这不改变客户端密钥可被提取的事实。

## 语音配置

| 能力 | 端点 | 协议 |
|---|---|---|
| STT | `wss://api.stt.ai/v1/stream` | 连接后发送 `{"language":"zh","model":"whisper-large-v3-turbo"}`，再发送 16 kHz、单声道、S16LE 原始 PCM 二进制帧 |
| TTS | `https://fanyi.baidu.com/gettts` | `lan=zh&spd=5&source=web&text=<分片文本>` |

STT 服务先返回：

```json
{"status":"ready"}
```

结束时发送 `{"action":"stop"}`。随后可能收到 Vosk partial，以及 Whisper 的
非流式结果：

```json
{"text":"今天天气怎么样","partial":"...","is_final":false,"source":"whisper","language":"zh"}
```

服务端可能在停止后先发送空的 Vosk `is_final`。客户端必须忽略空文本 final，
继续等待非空 Whisper `text`；最后一个非空文字稳定 1.6 秒后作为最终转写，
最长等待 12 秒。空文本、超时、异常关闭、额度限制和网络失败会转为简短提示。

手表端使用 API 8 `@ohos.net.webSocket` 的 `ArrayBuffer` 发送能力，不封装
WAV，也不使用 HTTP multipart。WebSocket 收到 `ready` 后才启动麦克风，避免
录音数据早于会话就绪而丢失。单次录音上限 15 秒，短于约 0.4 秒会提示重说。

AI 回复会先移除 Markdown 标记，再按中文标点切成不超过 96 字符的分片。
每个分片生成一个 HTTPS TTS URL，由 `media.AudioPlayer` 顺序播放。
第三段尚未结束前不会提前创建后续播放器；用户再次点按麦克风会中断播报。

STT/TTS 均无需 API Key，但都是第三方公共服务。STT.ai 的匿名免费额度可能
调整；TTS 地址不是正式 SLA 接口。若 STT 不可达，手表会停留在失败提示；
若 TTS 返回非音频内容，客户端会停止播报并保留文字回复。

当前测试 Wi-Fi 下，手表直连 Magpie 和 STT.ai 会超时，需将设备系统
`http_proxy` 指向同网段 PC 代理后才能访问。该代理地址不在 HAP 中硬编码，
也不属于正式部署方案。

## 请求

```json
{
  "model": "group/ai-watch",
  "messages": [
    { "role": "system", "content": "你是 NOVA 手表 AI 助手..." },
    { "role": "user", "content": "帮我安排今天的三件事" }
  ],
  "max_tokens": 512,
  "stream": false
}
```

- 请求包含内置 system prompt 和最近 12 条会话消息。
- `max_tokens` 使用 512。过小的预算可能被推理 token 消耗，导致正文为空。
- Authorization 使用 `Bearer <embedded-key>`。

## 响应

```json
{
  "model": "group/ai-watch",
  "choices": [
    {
      "message": {
        "role": "assistant",
        "content": "先完成最重要的一件事..."
      }
    }
  ]
}
```

客户端兼容字符串和内容数组两种 `message.content` 形式。空正文、401/403、
429、超时和一般网络失败会替换为简短的用户提示，不展示原始请求体或密钥。

## 中继能力边界

实测中继提供：

- `GET /v1/models`
- `POST /v1/chat/completions`

不可用：

- `/v1/audio/transcriptions`
- `/v1/audio/speech`
- `/v1/audio/translations`
- `/v1/health`
- 通过 chat completions 发送 `input_audio`

因此设备端不从 Magpie Relay 调用 ASR/TTS；语音链路使用上表的独立服务。

## 安全建议

- 个人测试以外的分发应改为自有后端代理。
- 服务端保管上游密钥，客户端只持有短期、可撤销的会话凭据。
- 增加认证、限流、配额、滥用检测和密钥轮换。
- 不记录完整对话内容；需要诊断时只记录状态码、耗时和匿名请求 ID。
- 语音功能上线前补充录音用途提示、第三方处理说明、删除策略和合规评估。
