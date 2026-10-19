```
# TECH_DESIGN.md 电子书阅读器 MVP 技术设计文档
## 1. 技术栈选型
- 桌面框架：Electron
- 前端框架：Vue3 + Vite
- UI：原生CSS，不引入Element、AntD等大型组件库，保持轻量化
- 本地持久化存储：IndexedDB，用来存储书籍元信息、书籍文本、阅读页码进度
- 语言：JavaScript
- 打包工具：electron-builder，输出Windows .exe安装包

## 2. 项目完整目录结构
```

ebook-reader/
├── package.json          # 项目依赖、脚本配置
├── main.js               # Electron 主进程（管理窗口、文件选择）
├── preload.js            # 预加载脚本，主进程和渲染进程安全通信桥
├── index.html            # 入口 HTML
├── src/
│   ├── App.vue
│   ├── main.js           # Vue 入口
│   ├── components/
│   │   ├── BookShelf.vue   # 书架页面组件
│   │   ├── Reader.vue      # 阅读页面组件
│   │   └── SettingPanel.vue # 字号设置面板
│   ├── store/
│   │   └── db.js           # IndexedDB 封装：增删书籍、读写阅读进度
│   └── views/
│       ├── ShelfView.vue   # 书架首页
│       └── ReaderView.vue  # 电子书阅读页
├── PRD.md
├── TECH_DESIGN.md
└── AGENTS.md

```

## 3. 模块职责详细说明
### 3.1 Electron 主进程 main.js
1. 创建Electron浏览器窗口，加载Vue页面
2. 提供打开本地文件对话框，选择`.txt`文件读取文本内容
3. 通过ipc通信，把读取到的文本传递给前端渲染进程
4. 窗口关闭、生命周期管理

### 3.2 preload.js 预加载脚本
作为安全通信中间层，**仅暴露必要接口**：
- 读取本地txt文件接口
- 窗口最小化/关闭接口
禁止直接开放node全部API给渲染进程，保证Electron安全规范。

### 3.3 IndexedDB 模块 src/store/db.js
数据库表设计：
1. books表
    - id：唯一ID
    - title：书名（从文件名提取）
    - content：完整txt文本
    - lastPage：上次阅读页码
    - createTime：导入时间
功能：
- addBook：新增导入的书籍
- getBookList：读取全部书籍列表（书架展示）
- getBookById：读取单本书籍全文
- updateProgress：更新阅读页码（翻页自动保存）

### 3.4 前端页面模块
1. 书架页面 ShelfView.vue
    - 展示所有已导入书籍卡片：书名、阅读进度
    - “导入书籍”按钮，触发主进程文件选择窗口
    - 点击书籍卡片，跳转到阅读页面
2. 阅读页面 ReaderView.vue
    - 文本分页渲染
    - 上一页 / 下一页按钮
    - 字号调节（增大/减小）
    - 每次翻页自动调用db模块保存当前页码
    - 打开书籍时，自动读取lastPage，跳转到上次阅读位置

### 3.5 TXT文本分页逻辑
- 固定每页容纳字符数量，对全文content做字符串切割分页
- 只处理纯文本，忽略富文本，MVP**不解析EPUB**

## 4. 脚本命令
在package.json中配置scripts：
```json
"scripts": {
  "dev": "vite && electron .",
  "build": "vite build && electron-builder --win"
}
```

- `npm run dev`：开发模式，启动 Vite + Electron 窗口
- `npm run build`：打包，生成 Windows exe 安装包

## 5. 约束与边界（重要，给 AI 看）

1. MVP 只支持导入 TXT，**不支持 EPUB/PDF/MOBI**
2. 只做白底黑字阅读主题，不做深色模式
3. 数据只保存在本机 IndexedDB，**无云同步、无登录**
4. 不实现高亮、笔记、书签、全文搜索，这些放到后续迭代
5. 代码尽量精简，关键逻辑加注释，不引入无关第三方库
6. 阅读进度**自动保存**，切换书籍、关闭程序都会记录当前页码