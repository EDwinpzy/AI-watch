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

| 能力 | 端点 | 参数 |
|---|---|---|
| STT | `POST https://notetakers.vipresearch.ca/stt/v1/transcribe` | `file` WAV、`engine=nemotron`、`language=zh` |
| TTS | `GET https://translate.google.com/translate_tts` | `client=tw-ob`、`tl=zh-CN`、`q=<分片文本>` |

STT 返回结构：

```json
{
  "success": true,
  "text": "今天天气怎么样？",
  "engine": "nemotron",
  "language": "zh"
}
```

手表端先采集 16 kHz、单声道、S16LE PCM，再补 44 字节 WAV 头。请求体由
客户端手工拼接 `multipart/form-data`，通过 API 8 `@ohos.net.http` 的
`ArrayBuffer` 请求体上传。录音为空、过短、超时、非 2xx、`success: false`
或空转写都会转为简短错误提示。

AI 回复会先移除 Markdown 标记，再按中文标点切成不超过 96 字符的分片。
每个分片生成一个 HTTPS TTS URL，由 `media.AudioPlayer` 顺序播放。
第三段尚未结束前不会提前创建后续播放器；用户再次点按麦克风会中断播报。

STT/TTS 均无需 API Key，但都是第三方公共服务，存在限流、延迟、网络可达性
和隐私边界变化的风险。当前 TTS 地址不是正式 SLA 接口；若返回非音频内容，
客户端会停止播报并保留文字回复。

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
