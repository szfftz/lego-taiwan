// 匯出樂高台灣的 AR 模型 → src/lego/data/ar/mansion-lego.glb（從 K30DayMapChallenge-2026 Day 27 的 export_ar.mjs 搬來）
// iPhone 的 usdz 不事先匯出：網頁按 AR 時 model-viewer 從畫面上的模型現做（屋頂、外牆、房名照當下的樣子）
// 先開開發伺服器（npm run serve），再跑：npm run export:ar [網址，預設 http://localhost:8086]
// 用 puppeteer 打開 3D 頁（牆全高；屋頂、外牆、房名板放進 glb，材質名字 roof、wall、label），在頁面裡跑 src/dev/arExport.js（最長邊 25 公分）
// 先跑 src/dev/arLego.js：真實零件太重（約 490 萬個三角形），換成格子外殼＋凸點貼圖
// 需要 Chrome（puppeteer-core 不附瀏覽器；環境變數 CHROME 可改路徑）
import puppeteer from 'puppeteer-core'
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
const base = args.find((a) => /^https?:/.test(a)) ?? 'http://localhost:8086'
const OUT = fileURLToPath(new URL('../src/lego/data/ar/', import.meta.url))
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
// 房名板是模型裡的貼圖：中、英文各匯一個（網頁照語言選）
const PAGE = { zh: { file: 'mansion-lego' }, en: { file: 'mansion-lego-en' } }

mkdirSync(OUT, { recursive: true })
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-gl=angle'], protocolTimeout: 300000 })
const only = args.filter((a) => a === 'zh' || a === 'en') // 只匯一種語言：npm run export:ar en
for (const look of only.length ? only : ['zh', 'en']) {
  const { file } = PAGE[look]
  const page = await browser.newPage()
  await page.setViewport({ width: 1400, height: 1000 })
  page.on('pageerror', (e) => console.error('頁面錯誤：', e.message))
  await page.goto(`${base}/?lang=${look}`, { waitUntil: 'domcontentloaded', timeout: 90000 }) // 不等 networkidle：頁面有時一直有請求，等不到
  await page.waitForFunction(() => window.__lego?.scene, { timeout: 90000 })
  await new Promise((r) => setTimeout(r, 3000))
  const res = await page.evaluate(async (lego) => {
    window.__lego.setWalls('full')
    // 屋頂、外牆：材質名字叫 roof、wall（網頁照遠近淡入淡出、可以開關）
    const { roofGroup, outerWalls } = window.__lego
    const outer = new Set(outerWalls())
    const inside = (o, test) => { for (let p = o; p; p = p.parent) if (test(p)) return true; return false }
    const tagOf = (o) => o.userData.arTag || (inside(o, (p) => p === roofGroup) ? 'roof' : inside(o, (p) => outer.has(p)) ? 'wall' : '')
    if (lego) await (await import('/src/dev/arLego.js')).legoArGroup(window.__lego.scene, { tagOf })
    // 房名標籤：做成模型裡的 3D 板子（arLabels.js，材質名字 label），網頁照「房名」開關調透明度
    await (await import('/src/dev/arLabels.js')).arLabelGroup(window.__lego.scene, window.__lego.labelGroup)
    const m = await import('/src/dev/arExport.js')
    return m.exportAr(window.__lego.scene, { size: 0.25, tag: tagOf, usdz: false }) // 最長邊 25 公分；usdz 由網頁按 AR 時現做
  }, true)
  for (const k of ['glb']) {
    const buf = Buffer.from(res[k], 'base64')
    writeFileSync(`${OUT}${file}.${k}`, buf)
    console.log(`${file}.${k}：${(buf.length / 1e6).toFixed(2)} MB`)
  }
  console.log(`${look}：${res.meshes} 塊網格（每種材質一塊），大小 ${res.size.map((v) => (v * 100).toFixed(1)).join(' × ')} 公分（寬 × 高 × 深）`)
  await page.close()
}
await browser.close()
