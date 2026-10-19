# TXT 电子书阅读器（MVP）

Electron + Vue3 + electron-vite 实现的桌面 TXT 阅读器，完全离线，数据存在本机 IndexedDB。

## 功能

- 导入本地 `.txt` 文件（只支持 TXT）
- 书架页：书籍列表 + 阅读进度
- 阅读页：按屏幕实测分页、上一页 / 下一页、字号放大缩小
- 阅读进度自动保存，下次打开自动回到上次位置

## 环境要求

Node.js 20 或更高版本。

## 命令

```bash
npm install          # 安装依赖
npm run dev          # 开发模式（Vite + Electron）
npm run build        # 打包 Windows exe 安装包，产物在 release/
npm run build:dir    # 只生成免安装目录（调试打包问题时用）
```

如果 Electron 二进制下载过慢，先设置镜像：

```bash
# PowerShell
$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
npm install
```

## 目录结构

```
src/
├── main/index.js            Electron 主进程：创建窗口、读取本地 TXT、编码探测
├── preload/index.js         预加载脚本：contextBridge 暴露唯一 IPC 接口
└── renderer/
    ├── index.html
    └── src/
        ├── main.js          Vue 入口
        ├── App.vue          书架 / 阅读两页切换
        ├── style.css        白底黑字全局样式
        ├── db.js            IndexedDB 封装（books / texts / settings）
        ├── paginate.js      DOM 实测分页算法
        └── views/
            ├── ShelfView.vue   书架页
            └── ReaderView.vue  阅读页
```

## 数据说明

所有数据保存在本机 IndexedDB（数据库名 `ebook-reader`），不做云同步，卸载或清理浏览器数据会导致数据丢失。

- `books`：书籍元信息（书名、进度、阅读时间）
- `texts`：书籍正文全文
- `settings`：阅读器设置（当前只有字号）

## 打包产物

`npm run build` 会在 `release/` 目录生成 `ebook-reader-1.0.0-setup.exe`，双击按向导安装即可。默认使用 Electron 自带图标，如需自定义图标，在项目根目录建 `build/icon.ico`（256x256）并在 `electron-builder.yml` 的 `win` 下加 `icon: build/icon.ico`。
