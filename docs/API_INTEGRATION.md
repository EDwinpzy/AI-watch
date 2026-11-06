# 真实服务接入

当前实机版本已接入真实本地服务，不再是纯演示原型。服务入口：

```text
scripts/ai_service.py
scripts/start-ai-service.ps1
```

详细架构、端点、启动方法和限制见 `docs/AI_SERVICE.md`。

## 手表侧

- `@system.fetch`：健康检查、文本聊天、语音 JSON（Base64 PCM）和 TTS 请求
- `@ohos.net.http`：保留的二进制 HTTP fallback；最终语音实机路径未使用
- `@ohos.multimedia.audio`：真实麦克风采集
- `@ohos.multimedia.media`：TTS WAV 播放
- API Key 仅保存在当前页面内存，不写 URL、日志或持久化存储

## 安全边界

- 服务只监听 PC 活动局域网地址，并使用 allowlist 限制客户端。
- 当前为了 API 8 局域网验证显式允许明文 HTTP；生产必须改为 HTTPS。
- 生产 API Key 应由后端托管，手表端不应持有主密钥。
- 音频、转写和摘要的保存期限与删除策略仍需在生产接入中补齐。

