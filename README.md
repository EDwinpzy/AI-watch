# NOVA Watch AI

面向 HarmonyOS 圆形手表的原生 AI 手表应用。设备发布入口是
`api8-watch/`，面向 HUAWEI WATCH 4 `ARC-AL00`（HarmonyOS 3.0 / API 8）。

## 当前实现

- 真机端使用 ArkUI HML/CSS/JS，不使用 WebView。
- 首页参考 Apple Watch complication 与 activity ring 的视觉语言重做，
  内容集中在圆形安全区内。
- 四个主页面：表盘、语音、最近对话、设置；聊天作为圆形子页面呈现。
- 聊天页提供文字输入、麦克风、语音状态、发送状态和错误反馈。
- 语音输入使用手表麦克风采集 16 kHz 单声道 PCM，通过 WebSocket 实时发送；
  识别文字会自动作为用户消息发送。
- AI 回复默认按中文标点分片并自动播报，可在设置页关闭。
- AI 服务连接已经内置，手表端没有 Base URL、API Key 或模型编辑入口。
- 内置模型为 `group/ai-watch`，请求
  `https://magpie-relay.pengzhiyuan0724.workers.dev/v1/chat/completions`。
- 内置中继不提供可用的 ASR/TTS；语音转写使用
  `wss://api.stt.ai/v1/stream`（`whisper-large-v3-turbo`），播报使用
  `https://fanyi.baidu.com/gettts`。
- 声明 `ohos.permission.INTERNET` 与 `ohos.permission.MICROPHONE`，
  并关闭明文 HTTP。

## 安全边界

API Key 按需求硬编码在 HAP 中。客户端密钥可以从安装包或运行时提取，
不能把它当作真正的秘密凭据。若要公开发布，应改为由自有后端托管密钥、
增加认证、限流、配额和撤销机制。

语音输入会把录音发送到第三方识别服务；TTS 会把回复文本交给第三方在线
合成服务。当前 TTS 为无需密钥的公共接口，存在限流、不可用和隐私边界变化
的风险。正式分发应改为自有后端或经隐私评估的可控语音服务。

## 官方入口

```text
api8-watch/entry/src/main/js/HiWearMainAbility/pages/index/index.js
api8-watch/entry/src/main/js/HiWearMainAbility/pages/index/index.hml
api8-watch/entry/src/main/js/HiWearMainAbility/pages/index/index.css
```

`entry/` 是 Stage 预览原型，`android-watch/` 是诊断探针，二者都不是
当前手表发布入口。

## 构建

API 8 旧版 Hvigor 需要 Node 14。首次构建：

```powershell
cd api8-watch
$env:PATH = 'C:\Users\63054\nodejs;' + $env:PATH
& 'C:\Users\63054\nodejs\npm.cmd' ci --no-audit --no-fund
```

详细构建命令、SDK 路径与产物位置见
[`api8-watch/README.md`](api8-watch/README.md)。

## 回归

```powershell
npm run check:source
npm run check:core
npm run check:api8
```

当前结果：三组检查全部通过；`check:source` 64 项结构约束，
`check:core` 14 项断言，`check:api8` 119 项断言。API 8
`LegacyCompileJS`、`LegacyPackageHap` 和 `SignHap` 已通过本地构建。

当前签名 HAP 为 8,189,437 bytes，SHA-256
`686FC0DD9359C330127D4AF9142F82A3A650F1C942A41B411A8F84283B3BD0EB`。

已在 HUAWEI WATCH 4 `ARC-AL00`（`192.168.1.89:5555`）确认安装、466×466
圆屏布局、麦克风权限、16 kHz 采集、WebSocket `ready` 和持续 PCM 发送。
PC 端使用同一 STT.ai 协议已成功转出中文样例；最后修正空 Vosk `is_final`
后的有声完整闭环与扬声器实际出声尚未复测。测试设备实际媒体输出已降为 0，
且未再播放任何测试声音。

## 文档

- [文档索引](docs/README.md)
- [API 8 版本说明](api8-watch/README.md)
- [内置 API 接入](docs/API_INTEGRATION.md)
- [历史实现与验机记录](docs/IMPLEMENTATION_VERIFICATION.md)
- [旧版本地语音服务](docs/AI_SERVICE.md)
