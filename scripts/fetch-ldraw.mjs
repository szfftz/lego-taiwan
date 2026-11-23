// 從 LDraw 官方零件庫抓 樂高台灣要用的零件，連同所有子檔（s\、p\、48\ 的 primitive）打包成一個 .mpd
//   node scripts/fetch-ldraw.mjs
// 輸出 src/lego/data/lego-parts.mpd（LDraw 零件 CC BY 4.0）
import { writeFileSync } from 'node:fs'

const BASE = 'https://library.ldraw.org/library/official/'
// 1×1～1×4 的磚、薄板、平滑磚（tile），和單獨的凸點（牆頂、底板用）
export const PARTS = ['3005', '3004', '3622', '3010', '3024', '3023', '3623', '3710', '3070b', '3069b', '63864', '2431', 'stud']
const OUT = 'src/lego/data/lego-parts.mpd'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const files = new Map() // 檔名（小寫、斜線；LDrawLoader 會把子檔路徑的反斜線換成斜線）→ 內容
async function get(name) {
  const key = name.toLowerCase().replace(/\\/g, '/')
  if (files.has(key)) return
  files.set(key, null)
  const path = key
  let text = null
  for (const dir of ['parts/', 'p/']) {
    for (let tries = 0; tries < 6; tries++) { // 伺服器會限流（429）：每次請求間隔 0.5 秒，被擋就等 15 秒再試
      await sleep(500)
      const r = await fetch(BASE + dir + path).catch(() => null)
      if (r?.status === 429 || !r) { await sleep(15000); continue }
      if (r.ok) text = await r.text()
      break
    }
    if (text != null) break
  }
  if (text == null) throw new Error('找不到 ' + name)
  files.set(key, text)
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim().split(/\s+/)
    if (t[0] === '1' && t.length >= 15) await get(t.slice(14).join(' '))
  }
}

for (const p of PARTS) await get(p + '.dat')
// LDrawLoader 找子檔時會把 s/ 開頭的改成 parts/s/、48/ 開頭的改成 p/48/，打包的檔名要跟它一樣
const fileName = (k) => (k.startsWith('s/') ? 'parts/' : k.startsWith('48/') ? 'p/' : '') + k
const out = [...files].map(([k, v]) => `0 FILE ${fileName(k)}\n${v.trim()}\n0 NOFILE\n`).join('')
writeFileSync(OUT, out)
console.log(`${files.size} 個檔，${(out.length / 1024).toFixed(0)} KB → ${OUT}`)
