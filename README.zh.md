# dsh-modal-enhancer

简体中文 · [English](README.md)

这是一个客户端 Cordis 插件，无需修改 **DeepSeek Harness Web GUI** 源码，
即可为所有模态窗口增加接近桌面窗口的操作能力。

## 功能

- **拖动窗口**：按住顶部独立拖动条移动弹窗。
- **八向缩放**：四条边和四个角都可以用鼠标调整窗口大小。
- **固定 / 取消固定**：固定后，点击窗口外部不会关闭弹窗；关闭按钮和
  `Esc` 键仍然可以正常关闭。
- **最大化 / 还原**：将弹窗扩展到接近整个视口，并可恢复最大化前的位置和尺寸。
- **取消遮罩与磨砂**：同时移除暗色遮罩和背景模糊；弹窗会增加一层浅阴影，
  以便继续和页面背景区分。
- **逐窗口状态持久化**：每个弹窗会分别记住位置、宽度、高度、最大化、固定和
  遮罩状态，关闭浏览器后再次打开仍会恢复。
- **总开关**：可在 **设置 → 通用 → 弹窗增强** 中启用或停用整个插件。

插件通过稳定的无障碍属性
`[role="dialog"][aria-modal="true"]` 发现弹窗，不依赖可能变化的 CSS Module
哈希类名。因此设置窗口、创建工作区、模型与智能体预设编辑器、风险确认窗口，
以及其他使用相同约定的 Harness 弹窗都可以被增强。

## 操作说明

| 控件 | 功能 |
| --- | --- |
| 顶部拖动条 | 移动弹窗 |
| 上、下、左、右四条边 | 单独调整宽度或高度 |
| 四个角 | 同时调整宽度和高度 |
| 图钉 | 切换点击窗口外部是否关闭 |
| `⛶` / `❐` | 最大化 / 还原 |
| `◐` / `◌` | 移除 / 恢复视觉遮罩和磨砂 |

缩放热区会略微跨过弹窗边界，便于鼠标抓取。弹窗处于最大化状态时，会暂时禁用
拖动和缩放；还原后即可继续操作。

## 状态持久化

插件按照以下优先级识别“同一个弹窗”：

1. 弹窗显式提供的 `data-dshme-state-key`；
2. `aria-label`；
3. `aria-labelledby` 指向的标题文本；
4. 弹窗内部的第一个标题元素。

状态保存在浏览器 `localStorage` 中，键名前缀为
`dshme.dialog-state.v1:`。如果更换显示器或浏览器视口尺寸发生变化，插件会在
恢复时重新约束窗口位置和大小，确保仍有一部分窗口处于可操作区域。

停用或卸载插件时，当前页面中注入的控件、样式类、事件监听器和行内几何样式
都会被清理；已经保存的窗口状态会保留，方便下次重新启用时继续恢复。

## 安装

可直接使用的单文件插件位于 [dist/plugin.js](dist/plugin.js)。将该文件的完整内容
作为动态 `cordis_define` 插件的 `code.client` 函数体传入即可。文件以
`return { ... }` 开头，是一个完整的 JavaScript 函数体。

本插件不需要修改 Harness 源码，不需要运行 `pnpm install`，也不需要重新构建
Web 应用或重启服务。动态插件和智能体预设两种安装方式请参阅
[docs/install.md](docs/install.md)。

激活后，如果 Harness 界面出现 Client Package 权限确认，请先批准本次运行；
随后打开任意弹窗，确认顶部工具栏和边缘缩放光标已经出现。

## 工作原理

插件会：

1. 通过客户端 `styles` builtin 注入限定在 `.dshme-*` 下的样式；
2. 监听 `document.body`，在 React 挂载弹窗时自动增强；
3. 在不移动 React 所管理节点的前提下，兼容设置窗口等横向双栏布局；
4. 在 `settings.general.item` 插槽中注册总开关；
5. 按弹窗身份分别读取并恢复已经保存的状态。

取消视觉遮罩后，透明遮罩仍会保留点击拦截，从而维持正常的模态语义，并防止
用户误点弹窗背后的页面内容。

## 项目结构

```text
dist/plugin.js                 生成的单文件插件函数体
src/plugin-body.js             权威的自包含源文件
src/enhancer.js                便于阅读的模块化运行时参考
src/settings.js                便于阅读的设置项参考
src/styles.css                 便于阅读的样式参考
scripts/build.js               生成 dist/plugin.js
scripts/layout-check.test.js   布局、缩放、固定与状态恢复回归测试
scripts/syntax-check.js        JavaScript 语法冒烟检查
docs/install.md                详细安装指南
README.md                      英文文档
```

## 开发与验证

需要 Node.js 18 或更高版本。

```sh
npm run build        # 重新生成 dist/plugin.js
npm test             # 运行布局与交互回归测试
npm run test:syntax  # 解析所有源文件和生成的 JavaScript
```

发布修改前应执行以上三个命令，并确保生成的 `dist/plugin.js` 与源代码一起提交。

## 兼容性

- 目标：DeepSeek Harness Web 客户端（`platform: 'web'`）。
- 客户端能力：`ctx`、`React`、`styles` 以及标准浏览器 API。
- 设置插槽：`settings.general.item`（`scope: root`、`kind: list`）。
- 状态存储：仅使用浏览器 `localStorage`，不会将窗口状态发送到服务器。

## 许可证

[MIT](LICENSE)
