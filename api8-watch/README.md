# NOVA Watch AI - HarmonyOS API 8 FA

HUAWEI WATCH 4 `ARC-AL00`（HarmonyOS 3.0 / API 8）正式设备工程。

## 当前实现

- 原生 ArkUI HML/CSS/JS，不使用 WebView。
- `deviceType: ["wearable"]`，target/compatible API 8。
- 版本 `1.2.2 / versionCode 5`，包名 `com.aiwatch.watch`。
- 两个注册页面：`pages/index/index` 经典 Aurora 界面、
  `pages/round/index` Apple Watch 圆环界面。
- 设置页可双向切换界面，不覆盖或删除另一套实现。
- 两套界面均为 4 个主页面：首页、录音摘要、最近、设置。
- 经典 Aurora 不绘制应用内时间/日期/信号/电池状态区；首页只保留
  两个主入口，其他页面按一屏一主任务收敛。
- 圆环页子页面：语音回答、Codex 任务、摘要结果、文字聊天。
- 设置页仅保留静音状态、触感反馈和界面切换，不显示服务配置或后端切换。
- 文字、语音和录音摘要默认使用内置 OpenAI Compatible 模型。
- 手表通过局域网 `/v1/chat/completions` 访问 PC 中继，中继再转发到
  `http://127.0.0.1:3425/v1`；默认模型为
  `workbuddy/deepseek-v4.1-flash`。通过 `/api/asr` 调用 Whisper；经典页
  以上传 JSON `pcmBase64` 为主，服务端兼容原始 PCM。Magpie API Key 不进入 HAP。
- 经典页前台时，右下实体键实际映射为 `KEYCODE_SOS`（265）；shell activity
  同时兼容 `KEYCODE_BUTTON_9` / F26（196），并转为
  `com.aiwatch.watch.action.START_VOICE`：第一次按下开始语音，第二次按下
  结束并提交。
- PC 服务默认使用 Whisper `small`、简体中文提示词和启动预热。
- 经典页无 `@ohos.multimedia.media`、无 AudioPlayer、无 WAV 下载和播放路径。
- 圆环页保留内置模型、STT 兼容代码和可选 TTS；TTS 默认关闭。

## 静音约束

经典界面中的手表声音固定关闭：

```text
手表声音：始终静音 · 不影响睡眠
```

录音、转写、任务完成和错误反馈全部使用文字/触觉状态，不播放任何声音。
服务端 Codex 任务也不再生成音频，返回的 `audioUrl` 恒为空字符串。圆环页
保留手动开启的 TTS，但默认关闭；日常佩戴和睡眠场景应保持关闭。

## 权限

- `ohos.permission.INTERNET`
- `ohos.permission.MICROPHONE`

麦克风在首次使用时运行时授权。明文 HTTP 仍由
`entry/src/main/config.json` 的 `cleartextTraffic` 支持，只用于可信局域网。

## 构建

使用 API 8 SDK、Node 14 和工程内 Hvigor：

```powershell
powershell -ExecutionPolicy Bypass -File scripts\prepare-built-in-config.ps1

$signing='signing\build-profile.signing.json5'
powershell -ExecutionPolicy Bypass -File scripts\setup-local-build.ps1 `
  -SigningConfigPath $signing

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

`prepare-built-in-config.ps1` 读取已被 Git 忽略的
`.secrets/built-in-service.json`。必填字段为 `apiKey`、`baseUrl` 和 `model`；
手表使用 `clientBaseUrl` 和 `clientToken`，因此 Magpie API Key 不会写入 HAP。
`codexBaseUrl`、`codexToken` 和 `codexRepoId` 仅用于保留的服务端兼容路径。
生成文件为
`api8-watch/entry/src/main/js/HiWearMainAbility/built-in-config.js`，同样被忽略。
干净检出不能在没有本地密钥时完成 HAP 构建，但源码和页面模拟测试仍可运行。

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

API 8 检查当前包含经典页 149 项、圆环页 226 项，覆盖：

- 无媒体播放导入、无播放路径、无 WAV。
- 两套页面注册、双向路由、内置服务和无跟踪密钥。
- 无可见返回/关闭按钮，使用左滑逐级返回、主页面上下切页；系统返回
  在主页被拦截，应用内手势不会退出应用，只有右上实体键可以退出。
- 默认内置模型、OpenAI Compatible 请求头、录音摘要和本地转写链路。
- JSON 请求使用 `@ohos.net.http`，创建任务使用 `200` 并拒绝非 2xx。
- 长录音 PCM 使用可让出 JS 线程的分块 Base64 编码，避免 60 秒录音提交时卡死。
- 设置页固定静音文案和聊天/录音任务状态。
- 经典页无应用内状态栏、双主入口、低密度页面和放大后的触控尺寸。
- 圆环页录音暂停/继续/标记、任务重开轮询、结果转写编辑、复制和继续追问。

签名后真机验收以当前 HAP 的构建输出为准。

候选 HAP 与签名材料只保存在本机 `signing/`，不纳入 Git。
`build-profile.json5` 也由 `build-profile.example.json5` 生成为本机忽略文件；
不要把签名路径或口令写回仓库模板。

发布候选构建：

```powershell
powershell -ExecutionPolicy Bypass -File scripts\build-release.ps1
```

脚本要求干净工作区，依次运行源码、前端核心、API 8、Python 单元测试和
原型语法检查，再做 release 干净构建、HAP 内音频/GIF 检查与
`hapsigntoolv2` 签名校验。产物和 SHA-256 写入本机 `signing/`。

## v1.2.1 发布候选构建

2026-11-12 从干净提交 `d6117ba` 使用 Node 14 生成并通过签名校验：

```text
文件：signing/NOVA-Watch-AI-fa-api8-v1.2.1-release.hap
大小：1,201,796 bytes
SHA-256：25B09E4423E9009B952AF9B1ECF2607FF32B7A7FD142F69A3103B39B4D1F73D9
签名：hapsigntoolv2 verify success
包内容：44 entries；WAV / MP3 / OGG / AAC / M4A / GIF 均为 0
```

该候选包已安装到 HUAWEI WATCH 4，真机完成 60 秒录音自动结束、异步任务创建、
超过 60 秒的轮询、结果与转写页、复制、继续追问、任务历史、401、并发冲突、
取消、后端离线提示、Ollama/Codex 模式切换和手势返回验收；手表全程静音。

## 静音构建校验（v1.2.0 历史记录）

2026-11-12 的 v1.2.0 历史静音构建（保留追溯）：

```text
文件：signing/NOVA-Watch-AI-fa-api8-codex-silent-v1.2.0.hap
大小：1,182,320 bytes
SHA-256：72060AC3B444043C883903D0EBEAC5A2D74A0678A1D8121820E58DC51A10C48F
签名：hapsigntoolv2 verify success
包内容：44 entries；WAV / MP3 / OGG / AAC / M4A / GIF 均为 0
```

该记录只证明本机候选包和当前源码。本机生成的 `build-profile.json5` 使用
可安装调试签名证书，不等同于 AppGallery 正式发布证书；上架前必须替换为
正式证书并重新执行完整门禁。
