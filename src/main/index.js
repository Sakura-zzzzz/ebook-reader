import { app, BrowserWindow, dialog, ipcMain, nativeTheme, shell } from 'electron'
import { promises as fs } from 'node:fs'
import { basename, join } from 'node:path'

let mainWindow = null

/**
 * 解码 TXT 文件内容。
 * 中文 TXT 常见 GBK/GB18030 编码，直接按 UTF-8 读会乱码，
 * 这里用 Node 内置 TextDecoder 逐个尝试（Electron 自带完整 ICU，支持 gbk/gb18030/utf-16）。
 */
function decodeText (buffer) {
  // 1. 有 BOM 时按 BOM 判定
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(buffer.subarray(3))
  }
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(buffer.subarray(2))
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(buffer.subarray(2))
  }

  // 2. 严格 UTF-8 解码：遇到非法字节序列直接抛错，说明不是 UTF-8
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    // 继续尝试 GB18030
  }

  // 3. GB18030 是 GBK/GB2312 的超集，作为中文文本兜底
  try {
    return new TextDecoder('gb18030').decode(buffer)
  } catch {
    // 环境不支持 gb18030 时退回 UTF-8 宽松解码，保证不崩
    return buffer.toString('utf8')
  }
}

function createWindow () {
  mainWindow = new BrowserWindow({
    width: 1080,
    height: 760,
    minWidth: 720,
    minHeight: 520,
    show: false,
    // 白色主题，避免窗口出现的一瞬间闪黑
    backgroundColor: '#ffffff',
    title: 'TXT电子书阅读器',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // 安全配置：渲染进程不接触 Node，只能通过 preload 暴露的接口通信
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  // 页面准备好后再显示，避免白屏闪烁
  mainWindow.once('ready-to-show', () => mainWindow.show())
  mainWindow.on('closed', () => { mainWindow = null })

  // 阅读器不需要新窗口，统一拦截；外部链接交给系统浏览器
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    // 开发模式：加载 Vite 开发服务器地址
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    // 生产模式：加载构建产物
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

/**
 * 唯一的 IPC 通道：弹出文件选择框，读取 TXT 全文返回渲染进程。
 * 返回值统一为 { status: 'ok' | 'canceled' | 'error', ... }
 */
ipcMain.handle('book:pick-txt', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: '选择 TXT 电子书',
    filters: [
      { name: '文本文件', extensions: ['txt'] },
      { name: '所有文件', extensions: ['*'] }
    ],
    properties: ['openFile']
  })

  if (canceled || filePaths.length === 0) return { status: 'canceled' }

  const filePath = filePaths[0]
  const fileName = basename(filePath)

  // 双保险：即使选了其它后缀，也只接受 txt
  if (!/\.txt$/i.test(fileName)) {
    return { status: 'error', message: '只支持导入 .txt 文本文件' }
  }

  try {
    const buffer = await fs.readFile(filePath)
    const text = decodeText(buffer).replace(/\r\n?/g, '\n')
    return {
      status: 'ok',
      fileName,
      title: fileName.replace(/\.txt$/i, ''),
      content: text
    }
  } catch (error) {
    return { status: 'error', message: `读取文件失败：${error.message}` }
  }
})

app.whenReady().then(() => {
  // MVP 只有白色阅读主题，强制浅色，避免系统深色模式下控件被反色
  nativeTheme.themeSource = 'light'

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  app.quit()
})
