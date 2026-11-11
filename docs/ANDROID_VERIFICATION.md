# 原生 Android 临时验机记录

> 历史记录：此工程只用于诊断探针，不是 HUAWEI WATCH 4 产品入口。

日期：2026-10-24

## 平台边界

本记录只验证手表上的视觉、触控和交互状态机，不作为 HarmonyOS HAP
正式实机验收结论。正式交付仍以 `api8-watch/` 和
`signing/NOVA-Watch-AI-fa-api8-real-voice-final.hap` 为准。

临时验机包使用原生 Android Canvas 绘制，不使用 WebView，也不通过
WebView 加载 HML/CSS/JS。系统 HAP 安装通道因零售设备的
`ohos.permission.INSTALL_BUNDLE` 和安装白名单限制尚未打通。

## 验机包

```text
signing/NOVA-Watch-AI-android-api31-verification.apk
```

| 项目 | 值 |
|---|---|
| 应用包名 | `com.nova.watchai` |
| 版本 | `2.1-verification` / versionCode 3 |
| 最低 API | Android 31 |
| 目标 API | Android 31 |
| 文件大小 | 57,145 bytes |
| SHA-256 | `3DEC7557AB49E5A1A858BF6387F57CD31091E6C7E556A67DD147C598A26BFF33` |
| 签名 | Android Debug，证书摘要 `fc7b5f...eac93e11` |
| WebView 依赖 | 无 |

## 实机环境

- 设备：HUAWEI WATCH 4 `ARC-AL00`
- 屏幕：466×466
- 运行基线：Android 12 / API 31（手表 HarmonyOS 兼容运行时）
- 安装方式：ADB 覆盖安装；安装期间临时停用
  `com.android.packageinstaller` 以绕过零售设备的未知来源确认，
  安装完成后已立即恢复为 enabled。

## 已验证流程

| 流程 | 结果 | 关键证据 |
|---|---|---|
| 冷启动与首页 | 通过 | `02-home-fixed.png` |
| 语音聆听、思考和回答 | 通过 | `06-voice-listening-fixed.png`、`07-voice-speaking-fixed.png` |
| 语音计时、麦克风静音和扬声器关闭 | 通过 | `08-voice-muted.png`、`09-voice-speaker-off.png` |
| 结束语音并回到空闲首页 | 通过 | `10-voice-ended-home.png` |
| 上下滑动分页与循环 | 通过 | `11-record-idle.png`、`33-api-wrap-home.png` |
| 右滑返回 | 通过 | `30-right-swipe-settings.png` |
| 离开语音页时清理计时 | 通过 | `34-voice-before-leave.png`、`35-record-after-voice-leave.png`、`36-home-voice-cleared.png` |
| 录音计时与停止转写 | 通过 | `12-record-active.png`、`13-transcript.png` |
| 转写编辑、保存与总结同步 | 通过 | `14-transcript-editor.png`、`15-transcript-saved.png`、`16-summary.png` |
| 摘要复制反馈 | 通过 | `17-summary-copied.png` |
| 会话写回与重新打开 | 通过 | `40-chat-persist-sent.png`、`41-history-persist-preview.png`、`42-chat-persist-reopened.png` |
| 新建会话、四会话切换与仅清空当前会话 | 通过 | `43-history-four-threads.png`、`44-ai-thread-after-new.png`、`45-new-thread-reopened.png`、`46-clear-new-only.png`、`47-ai-after-clear-only.png` |
| 历史会话和文字聊天 | 通过 | `18-history.png`、`19-chat.png`、`21-chat-sent.png` |
| 清空当前对话 | 通过 | `22-chat-cleared.png` |
| 空消息拦截 | 通过 | `23-chat-empty-blocked.png` |
| 设置页与 API 设置 | 通过 | `24-settings.png`、`25-api.png` |
| API 有效格式保存 | 通过 | `26-api-valid.png` |
| API 错误格式提示 | 通过 | `31-api-invalid-validated.png` |
| 恢复默认配置 | 通过 | `32-api-reset-correct.png` |
| 应用崩溃检查 | 通过 | crash buffer 为空，主日志无 `Process: com.nova.watchai` 崩溃记录 |

截图目录：

```text
artifacts/device/android-verification/
```

## 输入法说明与限制

- 系统输入法为 `com.baidu.input_hwwatch`，`dumpsys input_method` 显示
  `mInputShown=true` 且输入窗口已创建。
- ADB 会注册 Virtual 键盘设备，实机截图中软键盘层被系统抑制；编辑框焦点、
  ADB 文本输入、保存/取消按钮和文本回写均已验证。
- 软键盘在未连接 ADB 的真实用户场景下仍需单独确认。

## 尚未由本验机包证明

- HarmonyOS HAP 在此手表上的安装与运行。
- 真实麦克风、语音识别、TTS、网络 API 和权限失败场景。
- 正式 HAP 的 320/360/390/410 多尺寸布局与生产环境错误处理。
- 软键盘与语音输入在实际佩戴、非调试连接场景下的行为。

因此，本验机包可证明交互原型与原生画布渲染可用，但不能替代正式 HAP
实机验收。
