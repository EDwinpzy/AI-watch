# NOVA Watch AI

面向 HarmonyOS API 8 圆形手表的双界面 AI 助手。正式设备入口是
`api8-watch/`，保留经典 Aurora 界面和 Apple Watch 风格圆环界面。
两套界面共享 PC 本地服务：Whisper 负责语音转写，OpenAI Compatible
模型路由负责文字与录音摘要。模型地址、名称和凭据在构建时注入，手表不显示
任何服务配置界面。

当前版本：`1.2.2 / versionCode 5`。

## 当前能力

- 首页能量球与“开始对话 / 录音摘要”双入口。
- 经典 Aurora 不绘制应用内时间/日期/信号/电池状态区，按钮和正文按
  466 px 圆屏放大，每页只保留一个主任务。
- 设置页可在经典 Aurora 与 Apple Watch 圆环界面之间双向切换。
- 圆环页具备语音输入、60 秒录音摘要、任务历史、结果页、转写编辑和继续追问。
- 默认语音与文字对话：录音 → 本机 Whisper 转写 → 内置模型即时回答。
- 录音摘要：本机转写后由内置模型整理为 3–4 条摘要。
- Whisper `small` 中文识别、简体中文提示词和启动预热。
- 本地模型中继使用 `workbuddy/deepseek-v4.1-flash`，关闭推理并限制输出
  长度；客户端令牌校验、上游超时和错误回传保留。
- Codex 异步任务与只读沙箱仍保留在服务端，但不再出现在手表设置界面。
- 默认全程静音；圆环界面的 TTS 默认关闭，不会自动播放测试音。

已移除 VPN、图片生成、模型市场、推荐提问和旧粒子 GIF 等未使用能力。

## 架构

```text
HUAWEI WATCH 4 (API 8)
  ├─ POST /api/asr
  └─ POST /v1/chat/completions
              │ 局域网 HTTP
scripts/ai_service.py
  ├─ Whisper small
  ├─ OpenAI Compatible relay
  │    └─ http://127.0.0.1:3425/v1
  │         └─ workbuddy/deepseek-v4.1-flash
  └─ scripts/codex_bridge.py（兼容保留）
       └─ codex exec --json --ephemeral --sandbox read-only
```

模型密钥只保存在本机 `.secrets/`，HAP 只携带局域网客户端令牌。Codex 任务
状态为 `queued → running → succeeded | failed | cancelled`。

## 本地服务

本机服务会从 `.secrets/built-in-service.json` 读取 Magpie Base URL、API Key
和模型名，并监听当前局域网 IPv4。PowerShell：

```powershell
powershell -ExecutionPolicy Bypass -File scripts\start-ai-service.ps1 `
  -AllowClient 192.168.1.89 `
  -CodexRepo D:\MyProjects\AI-watch
```

脚本会绑定当前局域网 IPv4、校验客户端来源并打印服务地址。默认 ASR 为
Whisper `small`，服务启动时预热，并使用简体中文提示词。

## 入口

```text
api8-watch/                                    正式手表 HAP
prototypes/aurora-watch/                       466×466 Web 交互原型
scripts/ai_service.py                          PC HTTP 服务
scripts/codex_bridge.py                        异步 Codex 任务桥
scripts/test_release_e2e.py                    真实服务端到端回归
scripts/build-release.ps1                      检查、构建和签名校验
prototypes/aurora-watch/index.html             浏览器视觉评审入口
```

`entry/` 是 ArkUI 预览工程，`android-watch/` 是诊断探针，
`prototypes/particles-nova/` 是历史视觉研究；三者都不是设备发布入口。

## 验证

```powershell
npm run check:source
npm run check:core
npm run check:api8
python -m unittest -v scripts.test_codex_bridge
node --check prototypes/aurora-watch/app.js
```

`check:api8` 同时覆盖经典页和圆环页；当前为经典页 144 项、圆环页
220 项断言。

长轮询回归：

```powershell
python scripts/test_codex_bridge.py --long
```

运行真实服务回归（需要已启动的本地服务）：

```powershell
python scripts\test_release_e2e.py `
  --base-url http://192.168.1.129:8787 `
  --token <token> `
  --voice-pcm artifacts\release-v1.2.1\e2e\voice-input-16k.pcm
```

API 8 HAP 构建方法见 [api8-watch/README.md](api8-watch/README.md)。
正式候选包使用 `scripts\build-release.ps1`，它会先跑回归、再做干净
release 构建、包内容静音检查和 HAP 签名校验。

## 安全与发布边界

- 服务默认只监听局域网，并用客户端 allowlist 限制来源。
- 模型中继要求 HAP 内置的局域网客户端令牌；Magpie API Key 不进入 HAP。
- Codex 路由要求 `X-Nova-Token` 或 Bearer Token。
- 第一版仅 `read-only`，写模式必须使用独立 worktree。
- HAP、签名材料、音频、任务日志和本地服务日志不纳入 Git。
- Magpie 密钥只保存在本机 `.secrets/built-in-service.json`；HAP 使用本地
  中继地址和独立客户端令牌。
- 本地生成的
  `api8-watch/entry/src/main/js/HiWearMainAbility/built-in-config.js`
  已忽略，严禁提交。
- `api8-watch/build-profile.json5` 是忽略的本机文件，只保存生成后的签名配置；
  仓库仅跟踪无凭据模板，避免证书路径和口令再次入库。
- 明文 HTTP 只用于可信局域网验证；公网部署必须增加 HTTPS、限流和密钥托管。
- 当前本机签名证书只生成可安装 HAP，不等同于 AppGallery 正式发布证书。

## 文档

- [文档索引](docs/README.md)
- [前端架构](docs/FRONTEND_ARCHITECTURE.md)
- [产品与页面范围](docs/PRODUCT_SPEC.md)
- [交互规格](docs/INTERACTION_SPEC.md)
- [PC 服务与 Codex 任务桥](docs/AI_SERVICE.md)
- [手表 API 接入](docs/API_INTEGRATION.md)
- [QA 清单](docs/QA_CHECKLIST.md)
- [v1.2.1 发布说明](docs/RELEASE_NOTES_v1.2.1.md)
- [Aurora Watch 原型](prototypes/aurora-watch/README.md)
