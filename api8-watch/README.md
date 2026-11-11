# NOVA Watch AI - HarmonyOS API 8 FA

面向 HUAWEI WATCH 4 `ARC-AL00`（HarmonyOS 3.0 / API 8）的原生 FA 工程。

## 当前版本

- 包名：`com.aiwatch.watch`
- 版本：`1.2.0` / versionCode 3
- 设备类型：`wearable`
- API：target 8 / compatible 8
- 设计宽度：466
- 应用权限：`ohos.permission.INTERNET`、`ohos.permission.MICROPHONE`
- 传输：HTTPS，`cleartextTraffic: false`

页面包含圆形表盘、Apple Watch complication 风格入口、语音入口、最近对话、
设置和文字/语音聊天。手表端不提供 AI 服务配置页。

## 内置 AI

```text
Base URL: https://magpie-relay.pengzhiyuan0724.workers.dev/v1
Model:    group/ai-watch
Endpoint: POST /v1/chat/completions
```

Base URL、API Key 和模型均写在 `pages/index/index.js` 中。

## 语音链路

```text
AudioCapturer 16 kHz / mono / S16LE
  -> PCM 封装 WAV
  -> POST https://notetakers.vipresearch.ca/stt/v1/transcribe
  -> 自动发送转写文字到 group/ai-watch
  -> 回复按标点分片
  -> 在线 TTS 顺序播放
```

- STT 固定使用 `engine=nemotron&language=zh`，不要求 API Key。
- 每次录音最长 15 秒，短于约 0.4 秒会提示重说。
- 转写在 `@ohos.net.http` 中以 `multipart/form-data` 上传 WAV。
- TTS 使用无需密钥的在线接口，单段控制在 96 个字符以内。
- 设置页可关闭自动播报；会话与开关状态不持久化。
- 录音仅保存在内存中，完成转写后不写入应用文件。

客户端硬编码 API Key 可以被打包产物提取，仅适合个人测试或受控分发。
语音会产生第三方网络传输；正式发布前必须完成隐私、限流和可用性评估。

## API 8 限制

- 不使用百分比 `border-radius`。
- 纯色控件使用 `background-color`，不使用仅含色值的 `background`。
- 不支持带后代组合的 `:active` 选择器。
- 旧版 Hvigor 依赖 Node 14；Node 24 会因 `deasync` 安装失败。

## 构建

首次构建：

```powershell
cd api8-watch
$env:PATH = 'C:\Users\63054\nodejs;' + $env:PATH
& 'C:\Users\63054\nodejs\npm.cmd' ci --no-audit --no-fund
```

编译：

```powershell
$node = 'C:\Users\63054\nodejs\node.exe'
$hvigor = 'node_modules\@ohos\hvigor\bin\hvigor.js'
$env:PATH = 'C:\Users\63054\nodejs;' + $env:PATH
$env:OHOS_BASE_SDK_HOME = 'E:\HarmonyOS-SDK\legacy-sdk\openharmony'
$env:HWSDK = 'E:\HarmonyOS-SDK\legacy-sdk'

& $node $hvigor assembleHap -m module `
  -p product=default -p module=entry@default -p buildMode=debug `
  --no-daemon --no-incremental
```

产物：

```text
entry/build/default/outputs/default/entry-default-signed.hap
```

`node_modules/`、构建产物和 HAP 均不纳入 Git。

## 回归

在仓库根目录执行：

```powershell
npm run check:source
npm run check:core
npm run check:api8
```

- `check:source`：61 项项目结构、权限、固定连接和语音接入检查
- `check:core`：14 项 Stage 核心函数断言
- `check:api8`：118 项 WAV、multipart、权限、ASR、聊天、TTS、导航和圆屏结构断言

本地 HAP 构建已通过 `LegacyCompileJS`、`LegacyPackageHap` 和 `SignHap`。
当前签名 HAP 为 8,126,045 bytes，SHA-256
`AE79ECAE8479BBAF3C2A4FC4F38DAFA1B284A091170F9793967EAA65AC8256C1`。
未完成 HAP 在 HarmonyOS 手表上的安装、
麦克风权限、真实采集、语音接口、TTS 播放、软键盘和实机视觉验证。
