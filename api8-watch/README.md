# NOVA Watch AI - HarmonyOS API 8 FA

HUAWEI WATCH 4 `ARC-AL00`（HarmonyOS 3.0 / API 8）正式设备工程。

## 当前实现

- 原生 ArkUI HML/CSS/JS，不使用 WebView。
- `deviceType: ["wearable"]`，target/compatible API 8。
- 版本 `1.2.1 / versionCode 4`，包名 `com.aiwatch.watch`。
- 4 个主页面：首页、录音摘要、最近任务、设置。
- 7 个子页面：语音、回答、任务、结果、文字聊天、服务配置、字段编辑。
- 默认语音后端为 `codex`，同时保留 Ollama 即时链路。
- Codex 任务使用 `/api/codex/voice`、`/api/codex/task`、状态轮询与取消。
- 健康检查、Codex 异步请求和旧 Ollama 链路统一使用 `@ohos.net.http`。
- 创建任务使用 HTTP `200`，规避 API 8 `net.http` 对 `202` 的连接异常误判。
- PC 服务默认使用 Whisper `small`、简体中文提示词和启动预热。
- `X-Nova-Token` 只保存在当前页面内存。
- 无 `@ohos.multimedia.media`、无 AudioPlayer、无 WAV 下载和播放路径。

## 静音约束

手表声音是产品级固定关闭项，不提供开关：

```text
手表声音：始终静音 · 不影响睡眠
```

录音、转写、任务完成和错误反馈全部使用文字/触觉状态，不播放任何声音。
服务端 Codex 任务也不再生成音频，返回的 `audioUrl` 恒为空字符串。

## 权限

- `ohos.permission.INTERNET`
- `ohos.permission.MICROPHONE`

麦克风在首次使用时运行时授权。明文 HTTP 仍由
`entry/src/main/config.json` 的 `cleartextTraffic` 支持，只用于可信局域网。

## 构建

使用 API 8 SDK、Node 14 和工程内 Hvigor：

```powershell
$sdkBase='C:\Users\63054\AppData\Local\Packages\OpenAI.Codex_2p2nqsd0c76g0\LocalCache\Local'
$env:OHOS_BASE_SDK_HOME="$sdkBase\OpenHarmony\Sdk"
$env:HWSDK="$sdkBase\Huawei\Sdk"
$node='C:\Users\63054\nodejs\node.exe'
$hvigor=Join-Path (Resolve-Path '.').Path 'node_modules\@ohos\hvigor\bin\hvigor.js'

& $node $hvigor clean --no-daemon
& $node $hvigor assembleHap -m module `
  -p product=default -p module=entry@default -p buildMode=debug `
  --no-daemon --no-incremental
```

产物：

```text
entry/build/default/outputs/default/entry-default-signed.hap
```

## 安装

```powershell
$hdc='C:\Users\63054\AppData\Local\Packages\OpenAI.Codex_2p2nqsd0c76g0\LocalCache\Local\Huawei\Sdk\hmscore\3.0.0_8\toolchains\hdc.exe'
& $hdc -t 192.168.1.89:5555 app install -r `
  'entry\build\default\outputs\default\entry-default-signed.hap'

& $hdc -t 192.168.1.89:5555 shell aa start `
  -a com.aiwatch.watch.HiWearMainAbility -b com.aiwatch.watch
```

## 回归检查

在仓库根目录运行：

```powershell
npm run check:source
npm run check:core
npm run check:api8
```

API 8 检查当前为 104 项，包含：

- 无媒体播放导入、无播放路径、无 WAV。
- 无可见返回/关闭按钮，使用左滑逐级返回、主页面上下切页。
- 默认 Codex、1.5 秒轮询、离页停止轮询、取消接口和令牌头。
- JSON 请求使用 `@ohos.net.http`，创建任务使用 `200` 并拒绝非 2xx。
- 设置页固定静音文案和聊天/录音任务状态。

候选 HAP 与签名材料只保存在本机 `signing/`，不纳入 Git。

发布候选构建：

```powershell
powershell -ExecutionPolicy Bypass -File scripts\build-release.ps1
```

脚本要求干净工作区，依次运行源码、前端核心、API 8、Python 单元测试和
原型语法检查，再做 release 干净构建、HAP 内音频/GIF 检查与
`hapsigntoolv2` 签名校验。产物和 SHA-256 写入本机 `signing/`。

## 静音构建校验

2026-11-12 的 v1.2.0 历史静音构建（保留追溯）：

```text
文件：signing/NOVA-Watch-AI-fa-api8-codex-silent-v1.2.0.hap
大小：1,182,320 bytes
SHA-256：72060AC3B444043C883903D0EBEAC5A2D74A0678A1D8121820E58DC51A10C48F
签名：hapsigntoolv2 verify success
包内容：44 entries；WAV / MP3 / OGG / AAC / M4A / GIF 均为 0
```

该记录只证明本机候选包和当前源码。当前 `build-profile.json5` 使用本机可安装
签名证书，不等同于 AppGallery 正式发布证书；上架前必须替换为正式证书并重新
执行完整门禁。
