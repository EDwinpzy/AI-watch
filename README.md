# NOVA Watch AI

面向 HarmonyOS 圆形手表的语音优先 AI 交互原型。工程包含原生 ArkUI
Stage 预览、API 8 原生 FA 实机版本，以及一个 PC 本地真实语音服务。

## 当前状态

2026-10-25 已完成 API 8 HAP 在 HUAWEI WATCH 4 `ARC-AL00` 上的实机验证。
最终候选：

```text
signing/NOVA-Watch-AI-fa-api8-real-voice-final.hap
```

- 大小：678,275 bytes
- SHA-256：`15B54F130501B5AF3B46A6B9007F453BEE3CF89A51EF9CF579F5D9ECE333CA09`
- 包名：`com.aiwatch.watch`
- 设备类型：`wearable`
- API：target 8 / compatible 8
- 签名：Huawei HAP v2，摘要校验通过
- 设备回传包与本地候选 SHA-256 一致

本轮已在手表上验证真实麦克风采集、运行时麦克风授权、真实
Whisper 转写、Ollama 模型回答、真实 TTS WAV 播放和 HTTP JSON
收发。语音识别、模型和 TTS 运行在 PC 本地服务中，手表 HAP 负责采集、
发送、显示和播放。

## 已实现

- 首页语音球、真实麦克风输入电平、聆听/识别/回答状态和计时
- 麦克风运行时授权、16 kHz / 单声道 / 16-bit PCM 采集
- “真实语音自测”闭环：TTS 问题 → 手表扬声器 → 麦克风 → ASR → 模型 → TTS
- 真实文本聊天请求 Ollama，回答写回对应会话
- 对话历史、新建会话、会话切换和仅清空当前会话
- 录音计时、演示转写、文本编辑与规则摘要
- 转写和摘要复制到 HarmonyOS 系统剪贴板，并提示结果
- 服务地址、模型和可选访问密钥校验；密钥只保存在当前内存会话
- 中间版本起的录音离开页计时清理修复
- 屏幕中部右滑返回，以及上下滑动分页
- 320×320、360×360、390×390、410×410 Previewer 圆屏渲染
- 466×466 实机 Voice/Recording/Transcript/Summary/Chat/Service 页面

## 运行真实本地服务

在 PC 上启动：

```powershell
powershell -ExecutionPolicy Bypass -File scripts\start-ai-service.ps1
```

默认服务地址为 `http://<PC局域网IP>:8787`，脚本会打印实际地址。
手表 API 设置中填入该地址，模型默认 `translategemma:4b`。服务只允许
脚本指定的手表 IP 访问，且当前 HAP 通过明文 HTTP 访问局域网服务。

依赖：Ollama（模型 `translategemma:4b`）、Python `openai-whisper`、
`torch`、Windows 中文 SAPI 语音。详细接口和验证结果见
`docs/AI_SERVICE.md`。

## 原型边界

- ASR、模型推理和 TTS 都在 PC 上运行；HAP 本身不包含端侧 ASR 或 TTS
  引擎。
- 默认是本地或局域网服务，不是生产云端服务；要把服务暴露到公网，必须
  增加认证、TLS、限流和密钥托管。
- HAP 的 HarmonyOS pasteboard 与 Android ClipboardManager 未互通；独立
  Android 探针实测为空。正式跨运行时粘贴需要额外桥接。
- 屏幕最边缘右滑会进入系统手势边界；屏幕中部右滑由应用处理。
- 其他屏幕尺寸已通过 DevEco Previewer 渲染，不等于其他物理手表实机通过。

## 入口

```text
entry/src/main/ets/entryability/EntryAbility.ets
entry/src/main/ets/pages/Index.ets
api8-watch/entry/src/main/js/HiWearMainAbility/pages/index/index.js
scripts/ai_service.py
scripts/start-ai-service.ps1
```

设计规格位于 `docs/`，原始视觉资产位于
`entry/src/main/resources/rawfile/`。API 8 实机构建、签名和安装说明见
`api8-watch/README.md`。

## 文档

- [文档索引](docs/README.md)
- [实现与实机验证记录](docs/IMPLEMENTATION_VERIFICATION.md)
- [本地真实语音服务](docs/AI_SERVICE.md)
- [QA 与验收清单](docs/QA_CHECKLIST.md)

## 验证

```bash
npm run check:source
npm run check:core
npm run check:api8
```

最终实机证据：

```text
artifacts/device/formal-hap/real-voice-final-20261025-133900/
```

圆屏尺寸证据：

```text
artifacts/device/previewer-sizes-current/
```

候选 HAP 及签名材料仅保存在本机 `signing/`，不纳入 Git。
