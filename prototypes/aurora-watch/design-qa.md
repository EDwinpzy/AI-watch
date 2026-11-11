# Aurora Watch Design QA

更新日期：2026-11-12

## 对比基准

用户参考图裁切后的 466 × 466 圆屏内容：

```text
artifacts/design/aurora-watch-20261111/ref466/
 ├─ home.png
 ├─ voice.png
 ├─ record.png
 ├─ result.png
 ├─ service.png
 └─ models.png
```

当前实现截图：

```text
artifacts/design/aurora-watch-20261111/new-screens/
 ├─ home.png
 ├─ voice.png
 ├─ answer.png
 ├─ record.png
 ├─ running.png
 ├─ result.png
 ├─ history.png
 ├─ chat.png
 ├─ settings.png
 ├─ service.png
 └─ field.png
```

11 屏联系表：

```text
artifacts/design/aurora-watch-20261111/new-contact-sheet.png
```

`artifacts/` 只保存在本机，不纳入 Git。

## 视口与截图

- CSS 设计坐标：466 × 466。
- 截图：466 × 466，device scale factor 1。
- 截取节点：`#screen` 圆屏应用面。
- 捕获模式：`?capture=1&freeze=1&screen=<id>`。
- 参考图设备表耳、表冠和背景不纳入应用内容对比。

## 视觉检查

### 首页

- 透明底能量球保持中心高亮，边缘没有方形黑底。
- ChatGPT 字标、双胶囊入口和上下留白接近参考图。
- 入口高度、图标和文字层级在圆屏安全区内。

### 语音

- 三层语音环、中心麦克风和“按住说话”保持单焦点。
- 顶部状态胶囊与底部两个入口不挤压主球。
- 页面不显示返回/关闭按钮。

### 录音

- 58 条错峰波形形成中间高、两侧低的声浪。
- 圆形录音环、计时和状态文字对齐参考图。
- 暂停、标记、结束三枚操作在底部弧线以内。

### 结果

- 摘要/转写胶囊、两枚状态标签和三条编号内容层级清晰。
- 底部复制/继续追问不遮挡正文，长内容可滚动。

### 设置与服务

- 列表行统一使用玻璃底、图标盒、标题/副标题和右侧状态。
- 服务配置无横向溢出，保存按钮固定可见。
- “手表声音”显示为固定静音行，不提供可切换开关。

### 聊天

- 用户/助手气泡层级正确。
- 底栏从 61 px 内收到 88 px，并上移到 `bottom: 38px`；
  输入框与发送按钮完整位于圆屏内。
- 修复前发送按钮被圆弧裁成“叶子”形，修复后无裁切。

## 手势检查

- 子页左滑逐级返回，避开 HUAWEI WATCH 4 的系统级右滑返回手势。
- 字段编辑左滑关闭编辑层。
- 主页面上下滑切换。
- 页面内返回、关闭、取消类导航按钮数量为 0。
- 列表内部滚动优先，避免滑动列表时误切主页面。

## 资源与控制台

- 11 屏全部加载完成。
- HTTP 失败资源：0。
- 页面脚本错误：0。
- 浏览器控制台 error：0。
- 删除未引用资源：`imagegen-sample.png`、`travel-thumb.png`。
- 修复缺失图标：`speaker.svg` → 现有 `speaker-high.svg`。

## Findings

- 无未解决的 P0 / P1 / P2。
- [P3] 参考图是产品渲染图，包含表壳、表冠和真实环境光；Web 原型只复刻
  圆屏应用面。
- [P3] 服务页的模型名称使用 `DeepSeek V4.1 Flash` 短标签，避免 466 px
  圆屏横向溢出；完整模型 ID 由实际服务配置决定。
- [P3] 字段编辑截图使用空默认值，主要用于检查圆屏输入框与保存按钮布局；
  实际交互会在打开时带入当前字段值。

## 结论

当前 11 屏视觉基线通过。浏览器截图不等于 API 8 真机结果；真机截图和
实际触控仍以 `api8-watch/` 的设备验收记录为准。
