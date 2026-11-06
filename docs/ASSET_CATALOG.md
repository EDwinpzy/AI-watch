# 美术资产清单

所有资产为本项目独立绘制的 SVG 矢量源文件，可在 Figma、Illustrator、Sketch 或代码项目中继续编辑。

## 品牌
- `assets/brand/nova-mark.svg`：NOVA 圆球品牌标志，256×256。

## 核心插画
- `assets/illustrations/voice-orb.svg`：蓝色玻璃语音球，320×320。
- `assets/illustrations/recording-orb.svg`：红色录音/停止按钮，180×180。
- `assets/illustrations/voice-pulse.svg`：环形脉冲与粒子，360×360。
- `assets/illustrations/waveform.svg`：静态语音波形，480×88。

## 图标
所有图标均为 24×24 viewBox，使用 `currentColor`，可通过 CSS 控制颜色：

- `mic.svg`：麦克风
- `chat.svg`：文字聊天
- `record.svg` / `stop.svg`：录音与停止
- `transcript.svg`：转写文本
- `summary.svg`：摘要
- `history.svg`：历史记录
- `settings.svg`：设置
- `api.svg`：API 配置
- `send.svg`：发送
- `copy.svg`：复制
- `play.svg`：播放
- `volume.svg`：扬声器
- `back.svg`：返回
- `chevron.svg`：前进/列表入口
- `check.svg`：成功/选中
- `close.svg`：关闭
- `spark.svg`：AI/智能能力

## 颜色与使用
- 色彩 Token：`assets/tokens.json`
- 在线/离线资产预览：`asset-gallery.html`
- 建议 SVG 作为源文件保留；如接入原生手表应用，可按目标平台规范导出 PNG/PDF/SwiftUI Shape。
