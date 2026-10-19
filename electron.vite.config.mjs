import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'

// electron-vite 的三段构建：main（主进程）/ preload（预加载）/ renderer（Vue 页面）
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    // 打包后页面通过 file:// 加载，必须用相对路径，否则资源 404
    base: './',
    plugins: [vue()]
  }
})
