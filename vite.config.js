import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { readFileSync } from 'node:fs'

// 版本號（package.json 的 version）＋建置日期：顯示在「說明」最下面，看得出手機上跑的是不是最新版
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url)))
const built = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Taipei' }).slice(0, 16)

// base './'：放到 GitHub Pages 子路徑（/lego-taiwan/）也讀得到
// host：同一個 Wi-Fi 的手機可以直接開（終端機會印出 Network 網址；AR 要 https，手機上試 AR 請用部署後的網址）
export default defineConfig({
  base: './',
  plugins: [vue()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version), __APP_BUILT__: JSON.stringify(built) },
  // three.js、Vue 各自一包：平行下載，而且改 app 程式之後這兩包不用重新下載（瀏覽器有快取）
  build: { rollupOptions: { output: { manualChunks: { three: ['three'], vue: ['vue'] } } } },
  server: { port: 8086, strictPort: true, host: true, open: true },
})
