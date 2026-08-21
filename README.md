# 精臣 Niimbot 标签模板生成器

四宫格标签模板在线生成 + 精臣打印机蓝牙直连打印。手机浏览器、桌面 Chrome / Edge 均可使用。

## 🌐 在线地址（已部署）

**https://jeremyzhu666.github.io/label-maker/**

> 📱 要使用「蓝牙打印」功能：请在 **手机 Chrome / Edge** 或 **桌面 Chrome / Edge 110+** 中打开上面的链接，**必须是 HTTPS**（GitHub Pages 默认就是）。Safari 对 Web Bluetooth 支持有限，建议用 Chrome。

## ✨ 功能

- **四宫格模板**：800 × 600 HD 画布，固定第一行标题 + 自定义第二行内容，一次导出 4 张标签
- **智能 placeholder**：日期类自动给 `YYMMDD`、编号类给 `A01`、名称类给 `Apple`，不用自己填提示
- **左右偏移校准**：打印内容偏左偏右？± 像素直接调
- **两种出图方式**
  1. 🖨 **蓝牙直连打印**：选型号 → 点「连接打印机」→ 选设备 → 打印（支持浓度 / 份数）
  2. 💾 **下载 JPG**：保存图片去任意 App 打印
- **响应式**：手机竖屏单列、桌面双列，输入不打架
- **字体统一**：标题 / 内容 Barlow Condensed + 系统中文字体，英文紧凑中文不违和

## 🖨 支持的精臣打印机（Niimbot）

基于社区开源的 `niimbot-web-bluetooth` BLE 协议（官方未开放 HTTP API，走 Web Bluetooth 浏览器直连）：

- ✅ **B1 Pro**（推荐 / 本项目主力测试机型）
- ✅ **B2 Pro** / **B1**
- ✅ **D110** / **D11_H**
- ✅ **N1** / **M2-H**

标签纸：默认适配 **14 × 50 mm** 四宫格标签（可在页面下拉里切换其它规格）。

## 📖 使用方法

1. 打开 [在线网址](https://jeremyzhu666.github.io/label-maker/)
2. 左侧「标签 1 ~ 标签 4」分别填：
   - 第一行：固定标题（名称 / 编号 / 数量 / 备注）
   - 第二行：要打印的内容
3. 上方选：标签尺寸、打印机型号、浓度、打印份数
4. 预览没问题后二选一：
   - **蓝牙打印**：点「连接打印机」→ 在系统弹窗里选你的 Niimbot 设备 → 「打印」
   - **导出图片**：点「下载 JPG」→ 保存 `label-4x-timestamp.jpg`

## 🧑‍💻 本地开发 / 改代码

```bash
cd 你的项目目录
# 任意静态服务器都行
python3 -m http.server 8000
# 然后访问 http://localhost:8000/
```

修改 `index.html`（或 `template-maker.html`）后刷新即可。Web Bluetooth 只在 HTTPS 环境工作，本地 `localhost` 也可以调试蓝牙。

## 📦 部署方式

就是纯静态页面，上传到 GitHub 仓库根目录 + 开 Pages：

- 主入口文件：`index.html`（GitHub Pages 默认找这个）
- 备份文件名：`template-maker.html`
- Pages 配置：`main` 分支 → `/ (root)` 目录

## 📄 License

MIT — 随便用 / 改。
