# NOVA Watch AI - HarmonyOS API 8 FA

面向 HUAWEI WATCH 4 `ARC-AL00`（HarmonyOS 3.0 / API 8）的原生 FA 工程。

- 原生 ArkUI HML/CSS/JS，不使用 WebView。
- `deviceType: ["wearable"]`，target/compatible API 8。
- 页面包含语音、聊天、历史、录音、转写、摘要、设置和真实服务设置。
- 申请 `ohos.permission.INTERNET` 和 `ohos.permission.MICROPHONE`。
- 使用 `@ohos.multimedia.audio` 采集 16 kHz 单声道 16-bit PCM。
- 使用 `@system.fetch` 发送健康检查、聊天及语音 JSON（Base64 PCM）请求；`@ohos.net.http` 仅保留为二进制 HTTP fallback。
- 使用 `@ohos.multimedia.media` 播放下载的 WAV。
- 服务地址、模型和访问密钥只保存在页面内存。

## 工程格式

DevEco Studio 3.1 的 API 8 FA 工程使用旧版 Hvigor 接口：

- 根工程 `hvigorfile.ts` 导出 `legacyAppTasks`。
- 模块 `hvigorfile.ts` 导出 `legacyHapTasks`。
- 根工程与模块需要 `package.json`。
- `compileSdkVersion` 和 `compatibleSdkVersion` 固定为 `8`。
- API 8 CSS 不支持百分比 `border-radius`，且 `background` 不支持纯色值，
  纯色控件使用 `background-color`。

## 构建

```powershell
$node = 'C:\Users\63054\nodejs\node.exe'
$hvigor = 'D:\MyProjects\AI-watch\api8-watch\node_modules\@ohos\hvigor\bin\hvigor.js'
$env:OHOS_BASE_SDK_HOME = 'C:\Users\63054\AppData\Local\OpenHarmony\Sdk'
$env:HWSDK = 'C:\Users\63054\AppData\Local\Huawei\Sdk'

& $node $hvigor assembleHap -m module `
  -p product=default -p module=entry@default -p buildMode=debug `
  --no-daemon --no-incremental
```

产物：

```text
entry/build/default/outputs/default/entry-default-signed.hap
```

## 最终实机候选

```text
signing/NOVA-Watch-AI-fa-api8-real-voice-final.hap
```

- 大小：678,275 bytes
- SHA-256：`15B54F130501B5AF3B46A6B9007F453BEE3CF89A51EF9CF579F5D9ECE333CA09`
- 已通过 Huawei HAP v2 签名和摘要验签
- 已安装到 HUAWEI WATCH 4，设备回传包与本地文件哈希一致

候选 HAP 及签名材料仅保存在本机，不纳入 Git。

## 安装

使用与开发者 Profile 匹配的 HDC 工具：

```powershell
$hdc = 'C:\Users\63054\AppData\Local\Huawei\Sdk\hmscore\3.0.0_8\toolchains\hdc.exe'
& $hdc -t 192.168.1.89:5555 app install -r `
  'signing\NOVA-Watch-AI-fa-api8-real-voice-final.hap'
```

首次语音会弹出麦克风授权。手表需能访问运行
`scripts/ai_service.py` 的 PC 局域网地址。

## 回归检查

```powershell
npm run check:source
npm run check:core
npm run check:api8
```

当前 API 8 回归为 33 个断言，覆盖会话、录音计时清理、真实服务地址、
PCM 电平/Base64、网络响应解析和页面结构。

