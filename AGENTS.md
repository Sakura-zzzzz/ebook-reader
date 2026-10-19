# AGENTS.md 项目规则
## 项目简介
MVP电子书桌面阅读器，Electron+Vue3，仅支持TXT电子书，实现书架、阅读、进度记忆。

## 环境运行
1. node版本使用较新版本
2. 安装依赖：`npm install`
3. 开发启动：`npm run dev`
4. 打包exe：`npm run build`

## 硬性约定
1. 技术栈：Electron + Vue3 + Vite
2. 存储：IndexedDB，不写后端，全部离线本地运行
3. MVP只实现TXT导入，只做白色阅读主题
4. 页面：书架首页、阅读页面；必须实现阅读进度自动保存
5. 代码尽量简洁，注释关键逻辑；不要引入多余的第三方库
6. 不要实现MVP之外的功能，如EPUB、高亮、云同步等

## 交付产物
可运行Electron桌面程序，可打包为Windows exe安装包。
