# PC 服务与 Codex 任务桥

`scripts/ai_service.py` 是 NOVA Watch AI 的 PC 本地服务。
`scripts/codex_bridge.py` 负责把语音/文字问题转换为只读异步 Codex 任务。

## 架构

```text
watch PCM (16 kHz / mono / s16le)
  -> POST /api/codex/voice
  -> Whisper small 转写（简体中文提示词）
  -> CodexTaskManager
  -> codex exec --json --ephemeral --sandbox read-only
  -> Magpie http://127.0.0.1:3425/v1
  -> 1.5 秒轮询状态
  -> 文字结果，无音频
```

同一时间只允许一个任务。仓库由服务端 allowlist 决定，手表不能传任意路径。

## 启动

```powershell
powershell -ExecutionPolicy Bypass -File scripts\start-ai-service.ps1 `
  -AllowClient 192.168.1.89 `
  -CodexRepo D:\MyProjects\AI-watch
```

脚本会：

- 绑定当前活动局域网 IPv4，默认端口 `8787`。
- 允许手表 IP、回环地址和本机服务 IP。
- 生成 28 位访问令牌并打印服务地址。
- 启动时预热 Whisper，首个语音请求不再承担模型加载时间。
- 固定 Codex 模型与 Magpie 后端。

默认 ASR：

```text
openai-whisper small
```

转写固定 `language=zh`，关闭上文条件，并注入
`以下是普通话的句子，请使用简体中文。` 提示词。默认 ASR 预热可以用
`--no-warmup-asr` 关闭。

默认 Codex 模型：

```text
commandcode-plan/deepseek/deepseek-v4.1-flash
```

默认后端：

```text
http://127.0.0.1:3425/v1
```

## 端点

| 方法 | 路径 | 鉴权 | 作用 |
|---|---|---|---|
| GET | `/health` | 客户端 allowlist | 服务、ASR、TTS 兼容状态与 Codex 健康 |
| POST | `/api/codex/voice` | Token | Base64 PCM → 转写 → 创建任务 |
| POST | `/api/codex/task` | Token | 文字 prompt → 创建任务 |
| GET | `/api/codex/task/{id}` | Token | 轮询状态、阶段、结果和耗时 |
| POST | `/api/codex/task/{id}/cancel` | Token | 标记取消并结束子进程树 |
| POST | `/api/chat` | 客户端 allowlist | 旧 Ollama 文本链路 |
| POST | `/api/asr` | 客户端 allowlist | 旧原始 PCM 转写链路 |
| POST | `/api/voice` | 客户端 allowlist | 旧 ASR + Ollama + TTS 兼容链路 |
| POST | `/api/tts` | 客户端 allowlist | 旧兼容 TTS 端点 |

两个 Codex 创建接口返回 HTTP `200`；API 8 的 `@ohos.net.http` 会把 `202`
误报为连接异常。任务仍通过 `taskId` 和后续轮询异步执行。

当前 API 8 手表不会调用 `/api/tts`、`/api/audio/*`，也不会播放
`/api/voice` 返回的音频。新 Codex 任务的 `audioUrl` 固定为空。

## 请求与响应

创建语音任务：

```json
{
  "pcmBase64": "...",
  "sampleRate": 16000,
  "repoId": "watch",
  "mode": "readonly"
}
```

返回：

```json
{
  "ok": true,
  "taskId": "...",
  "transcript": "...",
  "status": "queued"
}
```

任务轮询返回：

```json
{
  "ok": true,
  "taskId": "...",
  "status": "running",
  "stage": "正在检查仓库",
  "message": "读取文件与运行只读命令",
  "transcript": "...",
  "finalText": "",
  "speechText": "",
  "audioUrl": "",
  "elapsedMs": 32000,
  "error": ""
}
```

`speechText` 仅用于 120 字以内的文字摘要，不是播放指令。

## 状态机

```text
queued -> running -> succeeded
                  -> failed
                  -> cancelled
```

阶段示例：

- 正在连接
- 正在分析
- 正在检查仓库
- 正在调用工具
- 正在整理
- 完成 / 失败 / 已停止

## 超时与取消

- 单任务默认超时 600 秒。
- 后端 TCP 探测默认 2 秒；Magpie 不可用时快速失败。
- 取消通过 `taskkill /PID <pid> /T /F` 结束 Windows 进程树。
- 超时和取消后不会遗留本任务子进程。
- 单任务锁在完成、失败或取消后释放。

## 日志

任务目录：

```text
artifacts/codex-watch/tasks/<taskId>/
 └─ events.jsonl
```

日志只记录阶段、字符数、PID、返回码和耗时，不记录完整 prompt、令牌、
命令输出或敏感环境变量。仓库根目录 `artifacts/` 已忽略。

## 安全边界

- 第一版固定 `--sandbox read-only`。
- 仓库路径来自服务端 allowlist。
- Codex 路由需要 `X-Nova-Token` 或 Bearer Token。
- 不暴露 `codex app-server` 到局域网。
- 明文 HTTP 仅用于可信局域网。
- 第二版写模式必须使用独立 worktree，并加入变更审查与回滚。

## 测试

```powershell
python -m unittest -v scripts.test_codex_bridge
python scripts/test_codex_bridge.py --long
```

单元测试覆盖：

- JSONL 解析与 120 字文字摘要。
- 日志脱敏。
- 单任务并发限制。
- 仓库白名单与只读模式。
- 取消后子进程树停止。
- 后端不可用时 5 秒内失败。
- Token 鉴权与旧 `/api/voice` 回归。

长轮询回归验证任务超过 60 秒后仍可正常轮询。

真实服务端到端回归：

```powershell
python scripts\test_release_e2e.py `
  --base-url http://192.168.1.129:8787 `
  --token <token> `
  --voice-pcm artifacts\release-v1.2.1\e2e\voice-input-16k.pcm
```

覆盖健康检查、鉴权、文字任务、超过 60 秒仍可轮询、并发 `409`、
取消、真实 PCM 语音识别和静音返回。脚本默认写入
`artifacts/release-v1.2.1/e2e/release-e2e.json`。

2026-11-12 的 v1.2.1 本机验证结果：

```text
真实只读读取：20.76 秒，正确读取仓库内容
六文档长任务：76.29 秒，超过 60 秒仍可查询
8787 设备服务真实只读任务：99.58 秒
并发保护：409
取消：cancelled，2.23 秒停止，子进程已退出
语音创建：2.72 秒
识别：检查当前仓库,默认语音后端是什么?用一句话回答。
返回：audioUrl 为空，无 TTS 音频文件
```

该记录证明当前本机服务和 Magpie 链路，不替代真机麦克风与网络验收。
