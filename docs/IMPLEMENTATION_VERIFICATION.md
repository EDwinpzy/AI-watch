# NOVA Watch AI 实现与实机验证记录

更新日期：2026-10-25

## 当前结论

原生 API 8 FA 候选已在 HUAWEI WATCH 4 `ARC-AL00` 上完成安装、权限授权、
真实麦克风采集、真实 ASR、真实 Ollama 回答、真实 TTS WAV 播放、
文本模型请求和主要交互回归。

最终候选：

```text
signing/NOVA-Watch-AI-fa-api8-real-voice-final.hap
```

| 项目 | 值 |
|---|---|
| 包名 | `com.aiwatch.watch` |
| 版本 | 1.0.0 / versionCode 1 |
| 设备类型 | `wearable` |
| API | target 8 / compatible 8 |
| 大小 | 678,275 bytes |
| SHA-256 | `15B54F130501B5AF3B46A6B9007F453BEE3CF89A51EF9CF579F5D9ECE333CA09` |
| 签名 | HAP v2，digest true，Verify success |
| 设备安装 | `hdc app install -r` 成功 |
| 设备回传哈希 | 与上述 SHA-256 完全一致 |

## 自动检查

| 检查 | 结果 |
|---|---|
| `npm run check:source` | 通过，8 个页面、8 个主要构建器、15 个资源引用和 39 项结构/安全/API 8 约束 |
| `npm run check:core` | 通过，14 个核心行为断言 |
| `npm run check:api8` | 通过，33 个会话、计时、服务地址、PCM、Base64、网络响应和页面结构断言 |
| API 8 `LegacyBuildJS` | 通过，HML/CSS/JS 编译成功 |
| API 8 `LegacyPackageHap` | 通过 |
| API 8 `SignHap` | 通过 |
| `pack.info` | `wearable`、target 8、compatible 8 |
| Huawei `hapsigntoolv2.jar verify` | 通过，摘要算法 SHA-256 |
| 崩溃检查 | 最终运行无 AI Watch crash/fatal 记录 |
| Python 服务编译 | 通过 |

源码警告仅剩 `swiper` 的 `cachedsize` 自定义属性，不阻断构建。

## 权限与真实服务配置

HAP 声明并要求：

- `ohos.permission.INTERNET`
- `ohos.permission.MICROPHONE`，运行时请求并显示中文原因

`config.json` 同时声明：

```json
"network": {
  "cleartextTraffic": true
}
```

这是 API 8 `@system.fetch` 访问局域网 HTTP 服务所必需的配置。

## 真实语音闭环

手表端使用：

- `@ohos.multimedia.audio` 的 `AudioCapturer`
- 16 kHz、单声道、S16LE、RAW PCM
- 运行时麦克风授权
- 真实输入电平显示
- 15 秒录音窗口
- `@ohos.multimedia.media` 播放服务返回的 WAV

PC 端使用：

- `openai-whisper`（`base`，CUDA）
- Ollama `translategemma:4b`
- Windows SAPI 中文语音生成 WAV
- `scripts/ai_service.py` 的 allowlist 校验和 HTTP 服务

最终包实机证据：

- 麦克风已连接并显示真实输入电平：`01-real-mic-ready.png`
- 手表扬声器播放自测问题后，麦克风采集到 217,600 bytes PCM
- Whisper 转写包含“請用一句話介紹人工智能”
- Ollama 返回真实回答：“我是一個能理解和生成文字的人工智能。”
- 服务生成 203,020 bytes TTS WAV
- 手表发起 `GET /api/audio/...wav`，说明真实音频播放路径已启动
- 最终界面显示“正在回答 · 真实模型”及识别/回答文本：
  `02-real-voice-answer.png`

一次冷启动完整流水线约 29 秒，已热身后曾达到约 1.7 秒。延迟主要由模型
加载、Whisper 首次加载和模型推理决定。

## 真实文本模型请求

最终包在聊天页发送 `i`，HAP 发起 `POST /api/chat`，服务记录：

```text
model_done model=translategemma:4b prompt=i
reply=你好！有什么我可以帮你的吗？
```

界面显示真实回复：

```text
04-real-chat-model.png
```

服务端对应事件：

```text
05-chat-service-tail.jsonl
```

## 剪贴板验证

HAP 的“复制转写”按钮已显示“转写已复制”，证明 OHOS `@ohos.pasteboard`
写入成功。为验证第三方消费者，构建并安装了独立的 Android 应用
`com.nova.clipboardprobe`，在前台读取 Android ClipboardManager。

实测结果：

```text
EMPTY: no Android clipboard item
```

结论：HAP 的 HarmonyOS pasteboard 与 Android Compatibility Runtime 的
Android ClipboardManager 是隔离的。当前无法宣称 HAP 内容可粘贴到
Android 第三方应用；要支持该跨运行时路径，需要额外桥接。

证据：

```text
06-clipboard-copy-toast.png
07-android-clipboard-probe.png
07-android-clipboard-probe.xml
```

## 圆屏尺寸

使用 DevEco API 8 wearable Previewer 对最终构建重新渲染：

| 尺寸 | 结果 | 文件 |
|---|---|---|
| 320×320 | 通过 | `previewer-sizes-current/nova-home-320x320.jpg` |
| 360×360 | 通过 | `previewer-sizes-current/nova-home-360x360.jpg` |
| 390×390 | 通过 | `previewer-sizes-current/nova-home-390x390.jpg` |
| 410×410 | 通过 | `previewer-sizes-current/nova-home-410x410.jpg` |

合成图：

```text
artifacts/device/previewer-sizes-current/contact-sheet.jpg
```

这是 Previewer 圆屏渲染证据，不等同于四台不同物理手表的实机验收。

## 边缘手势

最终包实测：

- 屏幕中部右滑：聊天页返回历史页，应用保持前台。
- 从屏幕最左边缘右滑：由系统手势边界接管；从历史页起滑时系统返回上一
  个前台应用，HAP 不保持前台。
- 因此应用内右滑只保证中部手势；最边缘行为由设备系统决定。

证据：

```text
08-edge-before-chat.png
09-edge-after-chat.png
09-edge-foreground.txt
10-edge-history-after.png
10-edge-history-foreground.txt
```

## 证据目录

```text
artifacts/device/formal-hap/real-voice-final-20261025-133900/
artifacts/device/previewer-sizes-current/
artifacts/ai-service/runtime-20261025/
```

目录内包含最终 HAP、设备回传 HAP、签名材料、实机截图/XML、服务事件日志
和最终响应音频。

## 仍未证明

- HAP 的 `@system.fetch` 存在约 60 秒响应窗口；模型重载/排队超时会产生
  `fetch 200`，服务端可能稍后才完成。已增加模型预热和 `keep_alive=30m`，
  但生产应改为异步任务轮询或长读取超时传输。
- 未统计真人长句、不同口音、嘈杂环境下的 ASR 准确率。
- TTS 使用 PC Windows SAPI，不是手表端原生 TTS 引擎。
- 生产环境仍需 HTTPS、后端托管密钥、鉴权、限流和音频隐私策略。
- HAP 到 Android ClipboardManager 的跨运行时粘贴未打通。
- 屏幕尺寸为 Previewer 验证；只有 466×466 HUAWEI WATCH 4 是物理实机。
