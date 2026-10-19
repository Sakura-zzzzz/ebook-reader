import { contextBridge, ipcRenderer } from 'electron'

/**
 * 只向渲染进程暴露一个方法：让主进程弹出文件框并读取 TXT。
 * 不暴露任何 Node API，渲染进程拿不到 fs / path 等能力。
 */
const api = {
  pickTxtFile: () => ipcRenderer.invoke('book:pick-txt')
}

contextBridge.exposeInMainWorld('ebookAPI', Object.freeze(api))
