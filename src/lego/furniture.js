// 台灣豪宅的家具：全部用公尺、同一個比例（牆高 2.8 m），每間房照真的住宅擺，表示那個縣市的特色
// 房間區域座標：x 往東 0→W、z 往南 0→D、y 往上；組件的正面朝南（+z），rot 轉向：FACE.s/e/n/w
// 門口前 1.3 m 會自動清空（家具不擋門）；附屬衛浴、包在裡面的房間（嘉義市）那塊不放東西
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { ROOMS, M, KITCHEN_PASS, ONSEN_OPEN, ROOF_HATCH } from './layout.js'
import { owner } from './plan.js'
import { SML, LALU } from './sml.js'
import { WORLD } from './world.js'

export const S = 1 / M // 1 m 在 3D 世界裡多長
export const FACE = { s: 0, e: Math.PI / 2, n: Math.PI, w: -Math.PI / 2 }
const TOP = 2.75

const cache = new Map()
export function mat(color, o = {}) {
  const k = color + JSON.stringify(o)
  if (!cache.has(k)) cache.set(k, new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...o }))
  return cache.get(k)
}
const GOLD = { metalness: 0.85, roughness: 0.3 }
const GLOW = (c, i = 1.4) => ({ emissive: c, emissiveIntensity: i })
const GLASS = { transparent: true, opacity: 0.35, roughness: 0.05 }
const DARK = '#4a3222', WHITE = '#f6f3ee'

const add = (g, geo, color, o, x, y, z) => {
  const m = new THREE.Mesh(geo, mat(color, o))
  m.position.set(x, y, z)
  m.castShadow = m.receiveShadow = true
  g.add(m)
  return m
}
// 方塊：x、z 是西北角，y 是底；圓柱：x、z 是圓心
const box = (g, x, z, w, d, h, y, color, o) => add(g, new THREE.BoxGeometry(w, h, d), color, o, x + w / 2, y + h / 2, z + d / 2)
const cyl = (g, x, z, r, h, y, color, o, rTop = r, seg = 24) => add(g, new THREE.CylinderGeometry(rTop, r, h, seg), color, o, x, y + h / 2, z)
const ball = (g, x, y, z, r, color, o) => add(g, new THREE.SphereGeometry(r, 20, 14), color, o, x, y, z)
// 一件家具一個群組（清門口、畫 2D 平面圖都以群組為單位）
function grp(g, x, z, rot = 0, kind) {
  const o = new THREE.Group()
  o.position.set(x, 0, z)
  o.rotation.y = rot
  if (kind) o.userData.kind = kind
  g.add(o)
  return o
}

// 物件名稱：滑鼠移到 3D 或 2D 平面圖上的家具時顯示
const nm = (o, name) => { o.userData.name = name; return o }

// 世界地圖（掛牆上）：海是淺藍、陸地米色、經緯線，台灣一個紅點；Natural Earth 110m
let worldTex = null
function worldMap(g, x, z, rot, w, h, y) {
  if (!worldTex && typeof document !== 'undefined') {
    const c = document.createElement('canvas'); c.width = 720; c.height = 360
    const t = c.getContext('2d')
    t.fillStyle = '#bfe1ef'; t.fillRect(0, 0, 720, 360)
    t.strokeStyle = 'rgba(255,255,255,0.7)'; t.lineWidth = 1
    for (let a = 0; a <= 360; a += 30) { t.beginPath(); t.moveTo(a * 2, 0); t.lineTo(a * 2, 360); t.stroke() }
    for (let b = 0; b <= 180; b += 30) { t.beginPath(); t.moveTo(0, b * 2); t.lineTo(720, b * 2); t.stroke() }
    t.fillStyle = '#e9dcb8'; t.strokeStyle = '#a8946a'; t.lineWidth = 0.6
    for (const r of WORLD) { t.beginPath(); for (let i = 0; i < r.length; i += 2) { const px = (r[i] / 2 + 180) * 2, py = (90 - r[i + 1] / 2) * 2; i ? t.lineTo(px, py) : t.moveTo(px, py) } t.closePath(); t.fill(); t.stroke() }
    t.fillStyle = '#d32f2f'; t.beginPath(); t.arc((121 + 180) * 2, (90 - 23.7) * 2, 5, 0, 7); t.fill()
    worldTex = new THREE.CanvasTexture(c); worldTex.colorSpace = THREE.SRGBColorSpace
  }
  const o = nm(grp(g, x, z, rot, 'fixed'), '世界地圖')
  box(o, -w / 2 - 0.04, -0.03, w + 0.08, 0.03, h + 0.08, y - 0.04, '#3e2723')
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), worldTex ? new THREE.MeshStandardMaterial({ map: worldTex, roughness: 0.8 }) : mat('#e9dcb8'))
  m.position.set(0, y + h / 2, 0.005); o.add(m)
  return o
}

// ── 家具（中心在 (x, z)，正面朝 rot） ──
function rug(g, x, z, w, d, color, border = '#c9a227') {
  const o = nm(grp(g, x, z, 0, 'rug'), '地毯')
  box(o, -w / 2, -d / 2, w, d, 0.015, 0, border, { roughness: 1 })
  box(o, -w / 2 + 0.15, -d / 2 + 0.15, w - 0.3, d - 0.3, 0.02, 0, color, { roughness: 1 })
}
function sofa(g, x, z, len, rot = 0, color = '#c9b8a0', pillow = '#7b9eb8') {
  const o = nm(grp(g, x, z, rot), '沙發')
  box(o, -len / 2, -0.45, len, 0.9, 0.42, 0, color)
  box(o, -len / 2, -0.45, len, 0.25, 0.85, 0, color)
  box(o, -len / 2 - 0.15, -0.45, 0.2, 0.9, 0.62, 0, color); box(o, len / 2 - 0.05, -0.45, 0.2, 0.9, 0.62, 0, color)
  for (let k = 0; k < Math.floor(len / 0.8); k++) box(o, -len / 2 + 0.2 + k * 0.8, -0.2, 0.45, 0.12, 0.4, 0.42, k % 2 ? pillow : '#f1e7d6')
  return o
}
function armchair(g, x, z, rot = 0, color = '#b5835a') {
  const o = nm(grp(g, x, z, rot), '單人沙發')
  box(o, -0.42, -0.42, 0.84, 0.84, 0.42, 0, color)
  box(o, -0.42, -0.42, 0.84, 0.2, 0.9, 0, color)
  box(o, -0.5, -0.42, 0.12, 0.84, 0.6, 0, color); box(o, 0.38, -0.42, 0.12, 0.84, 0.6, 0, color)
  return o
}
function coffeeTable(g, x, z, w = 1.2, d = 0.7, color = DARK) {
  const o = nm(grp(g, x, z), '茶几')
  box(o, -w / 2, -d / 2, w, d, 0.05, 0.4, color, { roughness: 0.3 })
  for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(o, a * (w / 2 - 0.08) - 0.03, b * (d / 2 - 0.08) - 0.03, 0.06, 0.06, 0.4, 0, color)
  ball(o, 0.2, 0.5, 0, 0.08, '#c9a227', GOLD)
  return o
}
function sideTable(g, x, z, lampOn = true) {
  const o = nm(grp(g, x, z), '邊几')
  cyl(o, 0, 0, 0.25, 0.55, 0, DARK, { roughness: 0.4 })
  if (lampOn) { cyl(o, 0, 0, 0.04, 0.3, 0.55, '#c9a227', GOLD); cyl(o, 0, 0, 0.18, 0.2, 0.82, '#fff3dc', GLOW('#ffd9a0', 0.8), 0.12) }
  return o
}
function floorLamp(g, x, z) {
  const o = nm(grp(g, x, z), '落地燈')
  cyl(o, 0, 0, 0.16, 0.04, 0, '#c9a227', GOLD); cyl(o, 0, 0, 0.02, 1.55, 0, '#c9a227', GOLD)
  cyl(o, 0, 0, 0.24, 0.3, 1.45, '#fff3dc', GLOW('#ffd9a0', 0.9), 0.16)
  return o
}
function plant(g, x, z, h = 1.4, pot = '#c9a227') {
  const o = nm(grp(g, x, z), '盆栽')
  cyl(o, 0, 0, 0.22, 0.4, 0, pot, pot === '#c9a227' ? GOLD : {}, 0.26)
  cyl(o, 0, 0, 0.03, h * 0.5, 0.4, '#5d4037')
  ball(o, 0, 0.4 + h * 0.55, 0, h * 0.3, '#2f7d32'); ball(o, 0.12, 0.4 + h * 0.35, 0.08, h * 0.22, '#3d9140')
  return o
}
function bookshelf(g, x, z, w = 1.8, rot = 0, h = 2.2) {
  const o = nm(grp(g, x, z, rot), '書櫃')
  box(o, -w / 2, -0.18, w, 0.36, h, 0, DARK)
  const colors = ['#8d2f2f', '#2f4f8d', '#3d6b3d', '#c9a227', '#6a4c93', '#d9822b', '#efe6d8']
  for (let r = 0; r < Math.floor(h / 0.4) - 1; r++) for (let k = 0, x0 = -w / 2 + 0.06; x0 < w / 2 - 0.12; k++) {
    const bw = 0.04 + ((k * 7 + r * 3) % 4) * 0.012
    box(o, x0, 0.12, bw, 0.08, 0.28 - ((k + r) % 3) * 0.04, 0.08 + r * 0.4, colors[(k * 3 + r) % colors.length])
    x0 += bw + 0.008
  }
  return o
}
function wardrobe(g, x, z, w = 1.8, rot = 0, color = '#b08a65') {
  const o = nm(grp(g, x, z, rot), '衣櫃')
  box(o, -w / 2, -0.3, w, 0.6, 2.3, 0, color)
  for (let k = 1; k < Math.round(w / 0.6); k++) box(o, -w / 2 + k * 0.6 - 0.01, 0.3, 0.02, 0.01, 2.1, 0.1, DARK)
  for (let k = 0; k < Math.round(w / 0.6); k++) box(o, -w / 2 + k * 0.6 + 0.5, 0.3, 0.02, 0.03, 0.3, 1.0, '#c9a227', GOLD)
  return o
}
function bed(g, x, z, w = 1.8, rot = 0, blanket = '#5c7aa3', l = 2.1) {
  const o = nm(grp(g, x, z, rot), '床')
  box(o, -w / 2, 0, w, l, 0.35, 0, DARK)
  box(o, -w / 2 + 0.05, 0.05, w - 0.1, l - 0.1, 0.22, 0.35, WHITE)
  box(o, -w / 2 + 0.02, 0.75, w - 0.04, l - 0.8, 0.08, 0.55, blanket)
  for (const s of w > 1.2 ? [-1, 1] : [0]) box(o, s * w / 4 - 0.3, 0.12, 0.6, 0.35, 0.14, 0.57, '#ffffff')
  box(o, -w / 2 - 0.05, -0.08, w + 0.1, 0.1, 1.15, 0, '#6d4c41') // 床頭板
  return o
}
function nightstand(g, x, z, rot = 0) {
  const o = nm(grp(g, x, z, rot), '床頭櫃')
  box(o, -0.25, -0.2, 0.5, 0.4, 0.55, 0, DARK)
  cyl(o, 0, 0, 0.04, 0.25, 0.55, '#c9a227', GOLD); cyl(o, 0, 0, 0.15, 0.18, 0.78, '#fff3dc', GLOW('#ffd9a0', 0.8), 0.1)
  return o
}
function desk(g, x, z, w = 1.4, rot = 0, screen = true) {
  const o = nm(grp(g, x, z, rot), '書桌')
  box(o, -w / 2, -0.35, w, 0.7, 0.04, 0.72, '#6d4c41', { roughness: 0.4 })
  box(o, -w / 2, -0.35, 0.05, 0.7, 0.72, 0, '#4e342e'); box(o, w / 2 - 0.05, -0.35, 0.05, 0.7, 0.72, 0, '#4e342e')
  if (screen) { box(o, -0.3, -0.3, 0.6, 0.04, 0.38, 0.86, '#111', GLOW('#4fc3f7', 0.7)); box(o, -0.03, -0.3, 0.06, 0.06, 0.12, 0.76, '#333') }
  chair(o, 0, 0.6, FACE.n, '#37474f')
  return o
}
function chair(g, x, z, rot = 0, color = '#7a5638') {
  const o = nm(grp(g, x, z, rot), '椅子')
  box(o, -0.22, -0.22, 0.44, 0.44, 0.05, 0.45, color)
  for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(o, a * 0.19 - 0.02, b * 0.19 - 0.02, 0.04, 0.04, 0.45, 0, color)
  box(o, -0.22, -0.24, 0.44, 0.04, 0.5, 0.5, color)
  return o
}
function diningTable(g, x, z, len, wid = 1.1, chairColor = '#8d6e63', perSide = Math.floor(len / 0.65)) {
  const o = nm(grp(g, x, z), '餐桌')
  box(o, -len / 2, -wid / 2, len, wid, 0.05, 0.73, '#5d4037', { roughness: 0.3 })
  for (const a of [-1, 1]) box(o, a * (len / 2 - 0.3) - 0.06, -0.06, 0.12, 0.12, 0.73, 0, '#3e2723')
  const n = perSide
  for (let k = 0; k < n; k++) {
    const cx = -len / 2 + (len / n) * (k + 0.5)
    chair(o, cx, -wid / 2 - 0.3, FACE.s, chairColor); chair(o, cx, wid / 2 + 0.3, FACE.n, chairColor)
  }
  chair(o, -len / 2 - 0.35, 0, FACE.e, chairColor); chair(o, len / 2 + 0.35, 0, FACE.w, chairColor)
  return o
}
function chandelier(g, x, z, r = 0.6) {
  const o = nm(grp(g, x, z, 0, 'hang'), '水晶吊燈')
  r *= 0.6
  cyl(o, 0, 0, 0.012, 0.45, TOP - 0.45, '#c9a227', GOLD)
  add(o, new THREE.TorusGeometry(r, 0.02, 6, 24), '#c9a227', GOLD, 0, TOP - 0.55, 0).rotation.x = Math.PI / 2
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; ball(o, Math.cos(a) * r, TOP - 0.6, Math.sin(a) * r, 0.05, '#fff6d8', GLOW('#ffe9a8', 1.8)) }
  ball(o, 0, TOP - 0.7, 0, 0.09, '#fffbe8', { ...GLOW('#ffe9a8', 1.2), transparent: true, opacity: 0.85 })
  return o
}
function tvUnit(g, x, z, w = 2.2, rot = 0) {
  const o = nm(grp(g, x, z, rot), '電視櫃＋電視')
  box(o, -w / 2, -0.2, w, 0.4, 0.5, 0, '#3e2723')
  box(o, -w * 0.4, -0.05, w * 0.8, 0.05, w * 0.45, 0.6, '#111', GLOW('#1e3a5f', 0.6)) // 螢幕中心約 1.1 m（坐著看的高度）
  return o
}
function counter(g, x, z, len, rot = 0, upper = true) {
  const o = nm(grp(g, x, z, rot), '流理台')
  box(o, -len / 2, -0.32, len, 0.62, 0.88, 0, '#c8a27a')
  box(o, -len / 2 - 0.02, -0.34, len + 0.04, 0.66, 0.04, 0.88, '#2b2b2b', { roughness: 0.15 })
  for (let k = 0; k < Math.round(len / 0.6); k++) box(o, -len / 2 + k * 0.6 + 0.25, 0.3, 0.1, 0.02, 0.02, 0.75, '#c9a227', GOLD)
  box(o, -len / 2, -0.32, len, 0.02, 0.6, 0.92, '#d9e4ea', { roughness: 0.2 }) // 壁磚
  if (upper) box(o, -len / 2, -0.32, len, 0.35, 0.7, 1.55, '#c8a27a')
  return o
}
function stool(g, x, z) {
  const o = nm(grp(g, x, z), '高腳椅')
  cyl(o, 0, 0, 0.03, 0.6, 0, '#9e9e9e', { metalness: 0.6 }); cyl(o, 0, 0, 0.2, 0.06, 0.6, '#c62828') // 中島高腳椅：座面 66 cm
  return o
}
function toilet(g, x, z, rot = 0) {
  const o = nm(grp(g, x, z, rot), '馬桶')
  box(o, -0.2, -0.32, 0.4, 0.18, 0.75, 0, WHITE, { roughness: 0.2 })
  cyl(o, 0, 0.12, 0.2, 0.42, 0, WHITE, { roughness: 0.2 }).scale.z = 1.3 // 橢圓馬桶座，前後約 70 cm
  return o
}
function vanity(g, x, z, w = 1, rot = 0) {
  const o = nm(grp(g, x, z, rot), '洗手台')
  box(o, -w / 2, -0.25, w, 0.5, 0.85, 0, '#6d4c41')
  box(o, -w / 2, -0.25, w, 0.5, 0.04, 0.85, '#f5f5f5', { roughness: 0.15 })
  cyl(o, 0, 0, 0.18, 0.05, 0.87, '#ffffff')
  box(o, -w * 0.4, -0.25, w * 0.8, 0.02, 0.7, 1.15, '#cfe8f3', { metalness: 0.9, roughness: 0.05 }) // 鏡子
  return o
}
function car(g, x, z, rot, color) {
  const o = nm(grp(g, x, z, rot), '汽車')
  box(o, -0.92, -2.3, 1.84, 4.6, 0.75, 0.18, color, { metalness: 0.6, roughness: 0.25 })
  box(o, -0.82, -1.0, 1.64, 2.1, 0.52, 0.93, '#1a2a44', { metalness: 0.4, roughness: 0.1 })
  for (const [a, b] of [[-1, -1.5], [1, -1.5], [-1, 1.5], [1, 1.5]]) { const w = cyl(o, a * 0.92, b, 0.33, 0.24, 0.33, '#212121'); w.rotation.z = Math.PI / 2; w.position.y = 0.33 }
  return o
}
// 公路車（捷安特那種）：兩個輪子、菱形車架、彎把、坐墊；車身沿 x
function bike(g, x, z, rot, color = '#1565c0') {
  const o = nm(grp(g, x, z, rot), '捷安特公路車')
  for (const a of [-0.52, 0.52]) { add(o, new THREE.TorusGeometry(0.33, 0.025, 6, 24), '#212121', {}, a, 0.35, 0); cyl(o, a, 0, 0.03, 0.06, 0.32, '#9e9e9e', { metalness: 0.8 }).rotation.x = Math.PI / 2 }
  const tube = (x0, y0, x1, y1, r = 0.022, c = color) => { const L = Math.hypot(x1 - x0, y1 - y0), m = add(o, new THREE.CylinderGeometry(r, r, L, 8), c, { metalness: 0.5, roughness: 0.3 }, (x0 + x1) / 2, (y0 + y1) / 2, 0); m.rotation.z = Math.atan2(x0 - x1, y1 - y0); return m }
  tube(-0.52, 0.35, -0.05, 0.35); tube(-0.05, 0.35, -0.15, 0.85); tube(-0.15, 0.85, 0.42, 0.85); tube(-0.05, 0.35, 0.42, 0.85); tube(0.42, 0.85, 0.52, 0.35); tube(-0.52, 0.35, -0.15, 0.85) // 後下叉、座管、上管、下管、前叉、後上叉
  tube(0.42, 0.85, 0.4, 0.98, 0.02, '#424242'); box(o, 0.36, -0.2, 0.06, 0.4, 0.03, 0.98, '#212121') // 龍頭、把手
  box(o, -0.27, -0.06, 0.24, 0.12, 0.05, 0.9, '#212121') // 坐墊
  return o
}

// 視聽室銀幕播的「高雄」影片（一直在動的動畫）：夜晚的愛河、85 大樓、輕軌、愛之船、港邊的煙火；Mansion3D 每格呼叫 tickers
export const tickers = []
let filmTex = null
function kaohsiungFilm() {
  if (filmTex || typeof document === 'undefined') return filmTex
  const c = document.createElement('canvas'); c.width = 480; c.height = 270
  const t = c.getContext('2d')
  filmTex = new THREE.CanvasTexture(c); filmTex.colorSpace = THREE.SRGBColorSpace
  const rnd = (i) => ((Math.sin(i * 127.1) * 43758.5453) % 1 + 1) % 1
  const blds = Array.from({ length: 26 }, (_, i) => ({ x: i * 19 - 10, w: 14 + rnd(i) * 10, h: 30 + rnd(i + 50) * 60 }))
  const draw = (s) => {
    const sky = t.createLinearGradient(0, 0, 0, 170); sky.addColorStop(0, '#0b1033'); sky.addColorStop(1, '#5b2a6e'); t.fillStyle = sky; t.fillRect(0, 0, 480, 270)
    for (let i = 0; i < 40; i++) { t.fillStyle = `rgba(255,255,255,${0.3 + 0.5 * Math.abs(Math.sin(s * 2 + i))})`; t.fillRect(rnd(i + 9) * 480, rnd(i + 99) * 90, 1.5, 1.5) }
    // 煙火：每 4 秒在港邊炸一朵
    const fw = (s % 4) / 4, fx = 120 + Math.floor(s / 4) % 3 * 120
    if (fw < 0.6) for (let k = 0; k < 18; k++) { const a = (k / 18) * Math.PI * 2, r = fw * 70; t.fillStyle = `hsla(${(Math.floor(s / 4) * 70 + k * 8) % 360},90%,65%,${1 - fw / 0.6})`; t.beginPath(); t.arc(fx + Math.cos(a) * r, 70 + Math.sin(a) * r, 2, 0, 7); t.fill() }
    // 天際線＋亮著的窗
    for (const [i, b] of blds.entries()) { t.fillStyle = '#141826'; t.fillRect(b.x, 170 - b.h, b.w, b.h); t.fillStyle = '#ffd77a'; for (let y = 170 - b.h + 4; y < 166; y += 7) for (let x = b.x + 2; x < b.x + b.w - 3; x += 5) if (rnd(i * 31 + x * 7 + y) > 0.55) t.fillRect(x, y, 2, 3) }
    // 85 大樓：兩支腳合成一棟、頂上天線，外框亮燈
    t.fillStyle = '#1b2236'; t.fillRect(222, 70, 14, 100); t.fillRect(252, 70, 14, 100); t.fillRect(222, 70, 44, 26); t.fillRect(234, 30, 20, 42); t.fillRect(239, 14, 10, 18); t.fillRect(243, 2, 2, 14)
    t.strokeStyle = `rgba(120,220,255,${0.6 + 0.4 * Math.sin(s * 3)})`; t.lineWidth = 1.5; t.strokeRect(222, 70, 44, 100); t.strokeRect(234, 30, 20, 40)
    // 愛河：倒影一條條晃動
    const river = t.createLinearGradient(0, 170, 0, 270); river.addColorStop(0, '#1a1f4a'); river.addColorStop(1, '#090c22'); t.fillStyle = river; t.fillRect(0, 170, 480, 100)
    for (let i = 0; i < 60; i++) { const x = rnd(i + 300) * 480, y = 175 + rnd(i + 400) * 90; t.fillStyle = i % 3 ? 'rgba(255,215,122,0.5)' : 'rgba(120,220,255,0.5)'; t.fillRect(x + Math.sin(s * 2 + i) * 3, y, 8 + rnd(i) * 10, 1.5) }
    // 輕軌：綠白相間的車廂從左往右開過河堤
    t.fillStyle = '#2a2f3a'; t.fillRect(0, 166, 480, 4)
    const lx = ((s * 70) % 640) - 160
    for (let k = 0; k < 5; k++) { t.fillStyle = k % 2 ? '#eeeeee' : '#4caf50'; t.fillRect(lx + k * 26, 152, 25, 14); t.fillStyle = '#bfe8ff'; t.fillRect(lx + k * 26 + 4, 155, 17, 5) }
    // 愛之船：慢慢往左
    const bx = 480 - ((s * 25) % 560)
    t.fillStyle = '#f5f5f5'; t.beginPath(); t.moveTo(bx, 215); t.lineTo(bx + 60, 215); t.lineTo(bx + 52, 226); t.lineTo(bx + 8, 226); t.fill(); t.fillStyle = '#ff6f91'; t.fillRect(bx + 14, 205, 32, 10)
    t.fillStyle = 'rgba(255,255,255,0.85)'; t.font = 'bold 14px Overpass, "Noto Sans TC", sans-serif'; t.fillText('高雄 KAOHSIUNG', 14, 258)
    filmTex.needsUpdate = true
  }
  draw(0)
  let last = 0
  tickers.push((s) => { if (s - last > 0.08) { last = s; draw(s) } })
  return filmTex
}

// ── 各縣市地標的小模型：擺在桌上、櫃上或展示台上（y 是放的高度） ──
const roof4 = (o, r, h, y, color) => { const m = add(o, new THREE.ConeGeometry(r, h, 4), color, { flatShading: true }, 0, y + h / 2, 0); m.rotation.y = Math.PI / 4; return m }
function mini(g, x, z, kind, y = 0, rot = 0) {
  const o = nm(grp(g, x, z, rot, 'fixed'), { tower: '桃園機場塔台模型', dongmen: '新竹東門城模型', longteng: '龍騰斷橋模型', opera: '台中國家歌劇院模型', chihkan: '台南赤崁樓模型', 85: '高雄 85 大樓模型', chicken: '嘉義噴水雞', tear: '一罐藍眼淚' }[kind] ?? '模型')
  if (kind === 'tower') { // 桃園機場塔台：白色塔身、上面一圈藍色玻璃管制室
    box(o, -0.12, -0.12, 0.24, 0.24, 0.03, y, '#90a4ae')
    cyl(o, 0, 0, 0.06, 0.45, y + 0.03, '#eceff1', {}, 0.04); cyl(o, 0, 0, 0.07, 0.06, y + 0.48, '#cfd8dc', {}, 0.11)
    cyl(o, 0, 0, 0.1, 0.08, y + 0.54, '#4fc3f7', { ...GLOW('#4fc3f7', 0.5), roughness: 0.1 }, 0.12, 12); cyl(o, 0, 0, 0.13, 0.02, y + 0.62, '#eceff1')
    cyl(o, 0, 0, 0.006, 0.14, y + 0.64, '#e53935')
  } else if (kind === 'dongmen') { // 新竹東門城：石砌城門（拱門洞）＋上面紅牆城樓、灰瓦屋頂
    box(o, -0.2, -0.16, 0.4, 0.32, 0.16, y, '#a1887f', { roughness: 1 }); box(o, -0.05, 0.155, 0.1, 0.01, 0.1, y, '#3e2723')
    box(o, -0.13, -0.09, 0.26, 0.18, 0.1, y + 0.16, '#c62828'); roof4(o, 0.24, 0.1, y + 0.26, '#455a64')
  } else if (kind === 'longteng') { // 苗栗龍騰斷橋：一排紅磚橋墩和拱，最後一墩斷掉
    box(o, -0.42, -0.1, 0.84, 0.2, 0.02, y, '#7cb342', { roughness: 1 })
    ;[-0.33, -0.11, 0.11, 0.33].forEach((px, k) => box(o, px - 0.035, -0.045, 0.07, 0.09, k === 3 ? 0.16 : 0.28, y + 0.02, '#b5653d', { roughness: 1 }))
    for (const px of [-0.22, 0]) { add(o, new THREE.TorusGeometry(0.075, 0.022, 6, 12, Math.PI), '#b5653d', { roughness: 1 }, px, y + 0.26, 0); box(o, px - 0.11, -0.05, 0.22, 0.1, 0.03, y + 0.3, '#a0522d') }
  } else if (kind === 'opera') { // 台中國家歌劇院：白色方盒子，正面、側面一個個曲面洞口
    box(o, -0.25, -0.16, 0.5, 0.32, 0.24, y, '#f5f5f5', { roughness: 0.4 }); box(o, -0.24, -0.15, 0.48, 0.3, 0.01, y + 0.24, '#8bc34a')
    for (const [a, b, r] of [[-0.15, 0.08, 0.06], [0.02, 0.15, 0.07], [0.17, 0.07, 0.05], [-0.05, 0.05, 0.04]]) { const c = cyl(o, a, 0, r, 0.02, 0, '#37474f', {}, r, 16); c.rotation.x = Math.PI / 2; c.position.set(a, y + b, 0.155); c.scale.set(1, 1, 1.5) }
    for (const b of [0.07, 0.16]) { const c = cyl(o, 0, 0, 0.05, 0.02, 0, '#37474f', {}, 0.05, 16); c.rotation.z = Math.PI / 2; c.position.set(0.255, y + b, b - 0.1) }
  } else if (kind === 'chihkan') { // 台南赤崁樓：石台基上兩座紅牆、重簷的樓閣
    box(o, -0.2, -0.13, 0.4, 0.26, 0.05, y, '#bcaaa4', { roughness: 1 })
    for (const px of [-0.09, 0.09]) {
      const b = grp(o, px, 0)
      box(b, -0.06, -0.06, 0.12, 0.12, 0.07, y + 0.05, '#b71c1c'); roof4(b, 0.12, 0.04, y + 0.12, '#37474f')
      box(b, -0.04, -0.04, 0.08, 0.08, 0.04, y + 0.15, '#b71c1c'); roof4(b, 0.09, 0.05, y + 0.19, '#37474f')
    }
  } else if (kind === '85') { // 高雄 85 大樓：兩支腳往上合成一棟、中間鏤空，頂上天線
    const C = '#5b7a8c', P = { metalness: 0.5, roughness: 0.3 }
    box(o, -0.13, -0.07, 0.09, 0.14, 0.55, y, C, P); box(o, 0.04, -0.07, 0.09, 0.14, 0.55, y, C, P); box(o, -0.13, -0.07, 0.26, 0.14, 0.12, y + 0.43, C, P)
    box(o, -0.07, -0.06, 0.14, 0.12, 0.32, y + 0.55, C, P); box(o, -0.045, -0.045, 0.09, 0.09, 0.08, y + 0.87, C, P); cyl(o, 0, 0, 0.008, 0.15, y + 0.95, '#cfd8dc', { metalness: 0.8 })
  } else if (kind === 'chicken') { // 嘉義噴水雞：圓環噴水池上一隻雞
    cyl(o, 0, 0, 0.07, 0.03, y, '#90a4ae', {}, 0.07, 16); cyl(o, 0, 0, 0.06, 0.01, y + 0.03, '#4fc3f7'); cyl(o, 0, 0, 0.015, 0.06, y + 0.03, '#90a4ae')
    const b = ball(o, 0, y + 0.12, 0, 0.035, '#fff8e1'); b.scale.set(1.4, 1, 1); ball(o, 0.04, y + 0.165, 0, 0.022, '#fff8e1'); box(o, 0.03, -0.004, 0.02, 0.008, 0.02, y + 0.18, '#d32f2f')
    box(o, -0.07, -0.01, 0.03, 0.02, 0.05, y + 0.12, '#5d4037')
  } else if (kind === 'tear') { // 馬祖藍眼淚：一罐會發藍光的海水
    cyl(o, 0, 0, 0.07, 0.18, y, '#4fc3f7', { ...GLOW('#29b6f6', 1.6), transparent: true, opacity: 0.85 }, 0.06, 16); cyl(o, 0, 0, 0.065, 0.03, y + 0.18, '#5d4037')
  }
  return o
}
// 十分天燈：上寬下窄的四方紙燈籠，裡面亮著
// 上屋頂的樓梯：一段直跑樓梯從南往北爬（每階高約 19 cm、深 25 cm），x 是西緣、z0 是最下面那階的南緣、lz 是頂上平台的北緣；
//   踏板＋鋼側板＋扶手（railX：扶手那一側的 x）；爬到頂是平台
function stairs(g, { x, z0, n, rise, run = 0.25, w = 0.95, lz, railX, tread = '#a1765a', glass = true }) {
  const top = n * rise, zt = z0 - n * run, st = nm(grp(g, 0, 0, 0, 'fixed'), '樓梯')
  for (let k = 0; k < n; k++) box(st, x, z0 - (k + 1) * run, w, run + 0.02, 0.05, (k + 1) * rise - 0.05, tread)
  box(st, x - 0.03, lz, w + 0.06, zt - lz + 0.02, 0.08, top - 0.08, tread) // 頂上的平台
  const len = Math.hypot(n * run, top), ang = Math.atan2(top, n * run), cz = z0 - (n * run) / 2
  const tilt = (o, y) => { o.position.set(railX, y, cz); o.rotation.x = ang } // 往北（-z）爬高
  tilt(box(st, -0.03, -len / 2, 0.06, len, 0.25, -0.125, '#37474f', { metalness: 0.6 }), top / 2) // 側板
  if (glass) tilt(box(st, -0.01, -len / 2, 0.02, len, 0.9, 0, '#cfe8f3', GLASS), top / 2 + 0.6)
  else for (let k = 1; k < n; k += 3) box(st, railX - 0.02, z0 - k * run - 0.02, 0.04, 0.04, 1.0, k * rise, '#37474f', { metalness: 0.6 }) // 欄杆柱
  tilt(box(st, -0.025, -len / 2, 0.05, len, 0.05, 0, '#c9a227', GOLD), top / 2 + 1.07)
  return st
}
// 嘉義餐廳西牆那道（室內，玻璃扶手）：爬到屋頂樓梯口（layout.js 的 ROOF_HATCH）
export const STAIR_RISE = 3.51 // 餐廳地板 → 屋頂露台的木地板
function roofStair(g) {
  const lz = ROOF_HATCH[1] - ROOMS.find((r) => r.kind === 'dining').rect[1]
  return stairs(g, { x: 0.08, z0: 5.7, n: 18, rise: STAIR_RISE / 18, lz, railX: 1.13 })
}
function skyLantern(g, x, y, z, s = 1, color = '#ff7043') {
  const m = add(g, new THREE.CylinderGeometry(0.22 * s, 0.16 * s, 0.5 * s, 4, 1, true), color, { ...GLOW('#ffab40', 0.9), side: THREE.DoubleSide }, x, y, z); m.rotation.y = Math.PI / 4
  ball(g, x, y - 0.18 * s, z, 0.04 * s, '#fff3c4', GLOW('#ffcc66', 2))
  return m
}

// ── 每種房間：(g, W, D, ctx)；W、D 是房間東西、南北長（m） ──
export const ROOMS3D = {
  // 基隆：大門口（3 × 3.7 m 的玄關）。紅地毯、鞋櫃、穿鞋椅、傘架（雨都）、小燈塔擺飾、水晶燈
  gate(g, W, D) {
    rug(g, W / 2, D / 2, Math.min(2, W - 0.8), D - 0.6, '#8c2f39')
    const sb = nm(grp(g, W - 0.2, 0.9, FACE.w), '玄關鞋櫃'); box(sb, -0.6, -0.18, 1.2, 0.36, 1.0, 0, '#5d4037'); box(sb, -0.6, -0.18, 1.2, 0.36, 0.03, 1.0, '#c9a227', GOLD)
    const bench = nm(grp(g, W - 0.25, D - 0.9, FACE.w), '穿鞋椅'); box(bench, -0.55, -0.2, 1.1, 0.4, 0.45, 0, '#6d4c41'); box(bench, -0.5, -0.18, 1, 0.36, 0.06, 0.45, '#8c2f39')
    // 雨都的傘架：大門旁一座黃銅傘架插五支傘，地上一把撐開晾乾的傘
    const u = nm(grp(g, 0.85, 0.45), '黃銅傘架')
    cyl(u, 0, 0, 0.2, 0.6, 0, '#b08d57', { metalness: 0.7, roughness: 0.3 }, 0.18, 20); cyl(u, 0, 0, 0.21, 0.03, 0.58, '#c9a227', GOLD, 0.21, 20)
    ;['#e53935', '#1e88e5', '#fdd835', '#43a047', '#212121'].forEach((c, k) => { const a = k * 1.26, rx = Math.cos(a) * 0.09, rz = Math.sin(a) * 0.09; const sh = cyl(u, rx, rz, 0.012, 0.95, 0.05, '#5d4037'); sh.rotation.set(rz * 1.2, 0, -rx * 1.2); add(u, new THREE.ConeGeometry(0.06, 0.45, 8), c, {}, rx * 1.4, 0.75, rz * 1.4); add(u, new THREE.TorusGeometry(0.04, 0.01, 6, 10, Math.PI), '#5d4037', {}, rx * 1.9, 1.05, rz * 1.9) })
    const ou = nm(grp(g, 1.0, D - 1.0, 0.5), '晾乾的傘'); add(ou, new THREE.ConeGeometry(0.5, 0.25, 8, 1, true), '#1e88e5', { side: THREE.DoubleSide }, 0, 0.35, 0).rotation.x = 1.2; ball(ou, 0, 0.02, 0, 0.03, '#5d4037') // 撐開晾著的傘
    const lh = nm(grp(g, 0.3, 0.3), '基隆小燈塔'); cyl(lh, 0, 0, 0.16, 0.2, 0, '#8d8d8d'); cyl(lh, 0, 0, 0.1, 0.6, 0.2, '#fafafa', {}, 0.07); cyl(lh, 0, 0, 0.08, 0.12, 0.8, '#fff3c4', GLOW('#ffd54f', 1.6)); add(lh, new THREE.ConeGeometry(0.1, 0.12, 12), '#c62828', {}, 0, 0.98, 0)
    chandelier(g, W / 2, D / 2, 0.6)
  },
  // 臺北：客廳（台北面積小，4.5 × 5 m）。北牆電視櫃、面北的三人沙發、單椅、茶几、邊几、台北 101 擺飾、水晶燈
  living(g, W, D) {
    // 一個大沙發區：南牆（實牆）電視櫃＋石材主牆，U 型沙發（北邊三人座背對落地窗、兩側各一張）＋兩張單椅，大茶几，頭上一盞大水晶燈；
    // 東邊：平台鋼琴（靠北邊落地窗）、展示櫃；西北角落地燈、西南角盆栽；101 擺飾在展示櫃旁
    const cx = W * 0.42, cz = D * 0.48
    const sw = nm(grp(g, cx, D - 0.09, 0, 'fixed'), '電視主牆（石材）'); box(sw, -1.8, 0, 3.6, 0.06, 2.75, 0, '#6e6a64', { roughness: 0.5 }); for (let i = 0; i < 6; i++) box(sw, -1.8, -0.005, 3.6, 0.005, 0.01, 0.45 * (i + 1), '#8a857d')
    tvUnit(g, cx, D - 0.25, 2.4, FACE.n)
    rug(g, cx, cz, 4.6, 3.6, '#7b2d26')
    sofa(g, cx, cz - 1.6, 3.0, FACE.s, '#d9cbb3')
    sofa(g, cx - 2.1, cz - 0.1, 2.2, FACE.e, '#d9cbb3'); sofa(g, cx + 2.1, cz - 0.1, 2.2, FACE.w, '#d9cbb3')
    armchair(g, cx - 1.0, cz + 1.3, FACE.n, '#b5835a'); armchair(g, cx + 1.0, cz + 1.3, FACE.n, '#b5835a')
    coffeeTable(g, cx, cz - 0.1, 1.4, 0.8)
    sideTable(g, cx - 2.1, cz - 1.6); sideTable(g, cx + 2.1, cz - 1.6)
    chandelier(g, cx, cz, 1.0)
    floorLamp(g, 0.4, 0.5); plant(g, 1.5, D - 0.45, 1.4) // 西南角是通走廊的門
    if (W >= 7.5) {
      const pi = nm(grp(g, W - 1.2, 1.3, FACE.n), '平台鋼琴'); box(pi, -0.75, -0.75, 1.5, 1.5, 0.25, 0.75, '#111', { roughness: 0.15 }) // 平台鋼琴
      for (const [px, pz] of [[-0.6, -0.6], [0.6, -0.6], [0, 0.6]]) cyl(pi, px, pz, 0.05, 0.75, 0, '#111'); box(pi, -0.35, 0.8, 0.7, 0.35, 0.48, 0, '#111')
      const vc = nm(grp(g, W - 1.6, D - 0.25, FACE.n), '展示櫃'); // 展示櫃靠南牆（東邊跟大門口打通）
      box(vc, -0.8, -0.2, 1.6, 0.4, 1.9, 0, '#3e2723'); box(vc, -0.75, 0.2, 1.5, 0.02, 1.7, 0.1, '#cfe8f3', { transparent: true, opacity: 0.4 }) // 展示櫃
      for (let i = 0; i < 4; i++) ball(vc, -0.5 + i * 0.33, 1.0 + (i % 2) * 0.5, 0, 0.09, ['#c9a227', '#5d7a8c', '#e57373', '#efe6d8'][i])
    }
    // 台北 101 模型（1.3 m 高，放在展示台上）：裙樓、往上開的八節「竹節」、頂樓和塔尖
    const t = nm(grp(g, W - 0.5, D - 3.0), '台北 101 模型'); box(t, -0.3, -0.3, 0.6, 0.6, 0.5, 0, '#3e2723'); box(t, -0.31, -0.31, 0.62, 0.62, 0.03, 0.5, '#c9a227', GOLD)
    const G1 = { metalness: 0.55, roughness: 0.2 }
    box(t, -0.17, -0.17, 0.34, 0.34, 0.12, 0.53, '#6f97a8', G1); cyl(t, 0, 0, 0.1, 0.18, 0.65, '#6f97a8', G1, 0.08, 4).rotation.y = Math.PI / 4
    for (let k = 0; k < 8; k++) { const m = cyl(t, 0, 0, 0.085, 0.09, 0.83 + k * 0.09, '#7fa3b5', G1, 0.115, 4); m.rotation.y = Math.PI / 4; box(t, -0.08, -0.08, 0.16, 0.16, 0.005, 0.83 + k * 0.09, '#c9a227', GOLD) }
    cyl(t, 0, 0, 0.07, 0.1, 1.55, '#7fa3b5', G1, 0.05, 4).rotation.y = Math.PI / 4; cyl(t, 0, 0, 0.012, 0.25, 1.65, '#cfd8dc', { metalness: 0.8 })
  },
  // 新北：主臥室（10 × 6.5 m，西北角門通走廊、東牆門通溫泉浴室）。
  //   北牆：木格柵床頭主牆＋兩盞壁燈、King size 大床、兩邊床頭櫃和吊燈、床尾凳；床尾電視櫃；南牆一整排衣櫃＋穿衣鏡；
  //   西牆：五斗櫃、化妝台；東邊起居角：兩張單椅、邊几、貴妃椅、書櫃；十分天燈造型的落地燈、天花板飄著三盞天燈
  master(g, W, D) {
    const bx = W / 2
    const hw = nm(grp(g, bx, 0.03, 0, 'fixed'), '木格柵床頭主牆'); box(hw, -2.3, 0, 4.6, 0.05, TOP - 0.05, 0, '#8a6a4e'); for (let k = 0; k < 15; k++) box(hw, -2.25 + k * 0.32, 0.05, 0.12, 0.04, TOP - 0.15, 0.05, '#6d4c41') // 木格柵床頭主牆
    for (const s2 of [-1, 1]) { box(hw, s2 * 1.9 - 0.08, 0.09, 0.16, 0.08, 0.22, 1.5, '#fff3dc', GLOW('#ffd9a0', 1.2)) } // 壁燈
    rug(g, bx, 2.4, 4.0, 3.4, '#c9b79c')
    bed(g, bx, 0.25, 2.0, FACE.s, '#3f5f8f', 2.2)
    nightstand(g, bx - 1.45, 0.45); nightstand(g, bx + 1.45, 0.45)
    const pl = nm(grp(g, bx, 0.45, 0, 'hang'), '床頭吊燈'); for (const s2 of [-1, 1]) { cyl(pl, s2 * 1.45, 0, 0.004, 1.0, TOP - 1.0, '#212121'); ball(pl, s2 * 1.45, TOP - 1.08, 0, 0.11, '#fff3dc', GLOW('#ffd9a0', 1.4)) } // 床頭吊燈
    const bn = nm(grp(g, bx, 2.85), '床尾椅'); box(bn, -0.8, -0.22, 1.6, 0.44, 0.45, 0, '#c9a227', GOLD); box(bn, -0.78, -0.2, 1.56, 0.4, 0.06, 0.45, '#3f5f8f')
    if (D >= 6.5) tvUnit(g, bx, 4.4, 1.8, FACE.n)
    chandelier(g, bx, 2.4, 0.7)
    for (let k = 0; k < Math.min(4, Math.floor((W - 1.2) / 2)); k++) wardrobe(g, 1.6 + k * 2.0, D - 0.35, 1.9, FACE.n)
    if (D >= 10) { // 大套房：南邊 3.4 m 隔成一間更衣間：到天花板的隔間牆、中間一道霧面玻璃拉門（拉開一半）；
      //   西牆開放式吊衣桿掛滿衣服、南牆整排衣櫃、中間玻璃面首飾中島、圓凳、東牆鞋櫃、天花板一盞吊燈
      const cz = D - 3.45, pt = nm(grp(g, 0, 0, 0, 'fixed'), '更衣間隔牆＋霧面玻璃拉門'), dw = [W / 2 - 0.6, W / 2 + 0.6]
      for (const [a, b] of [[0, dw[0]], [dw[1], W]]) box(pt, a, cz - 0.05, b - a, 0.1, TOP, 0, '#e8e1d6')
      box(pt, dw[0], cz - 0.05, dw[1] - dw[0], 0.1, TOP - 2.15, 2.15, '#e8e1d6') // 門楣
      box(pt, dw[0] - 0.55, cz - 0.13, 0.65, 0.04, 2.1, 0, '#e3edf2', { transparent: true, opacity: 0.6, roughness: 0.4 }); box(pt, dw[0] - 0.55, cz - 0.14, 0.65, 0.05, 0.03, 2.1, '#8a6a4e') // 霧面玻璃拉門（拉開一半）
      const rk = nm(grp(g, 0.35, cz + 1.5, FACE.e, 'fixed'), '開放式吊衣桿'); box(rk, -1.2, -0.02, 2.4, 0.04, 0.04, 1.75, '#c9a227', GOLD)
      for (let k = 0; k < 14; k++) box(rk, -1.1 + k * 0.165, -0.25, 0.04, 0.5, 0.75 + (k % 3) * 0.15, 1.75 - 0.75 - (k % 3) * 0.15, ['#3f5f8f', '#fafafa', '#c62828', '#212121', '#8d6e63', '#f8bbd0', '#90a4ae'][k % 7]) // 掛著的衣服
      const cl = nm(grp(g, W / 2, cz + 1.5, 0, 'hang'), '更衣間吊燈'); cyl(cl, 0, 0, 0.004, 0.4, TOP - 0.4, '#212121'); cyl(cl, 0, 0, 0.3, 0.06, TOP - 0.46, '#fff3dc', GLOW('#ffd9a0', 1.4))
      const il = nm(grp(g, W / 2, cz + 1.5, 0, 'fixed'), '首飾中島'); box(il, -0.9, -0.35, 1.8, 0.7, 0.88, 0, '#6d4c41'); box(il, -0.92, -0.37, 1.84, 0.74, 0.04, 0.88, '#cfe8f3', GLASS)
      for (let k = 0; k < 5; k++) ball(il, -0.6 + k * 0.3, 0.92, 0, 0.04, k % 2 ? '#c9a227' : '#e0e0e0', GOLD)
      const pf = nm(grp(g, W / 2 + 1.5, cz + 1.5), '圓凳'); cyl(pf, 0, 0, 0.25, 0.42, 0, '#f8bbd0')
      const sh = nm(grp(g, W - 0.2, cz + 1.4, FACE.w), '鞋櫃'); box(sh, -0.8, -0.15, 1.6, 0.3, 1.8, 0, '#e6dccb'); for (let r = 0; r < 5; r++) for (let k = 0; k < 4; k++) box(sh, -0.7 + k * 0.38, -0.1, 0.28, 0.2, 0.1, 0.15 + r * 0.35, ['#212121', '#8d6e63', '#c62828', '#fafafa'][(r + k) % 4])
    }
    const mr = nm(grp(g, D >= 10 ? W - 0.1 : 0.1, D >= 10 ? D - 3.2 + 2.3 : D - 1.3, D >= 10 ? FACE.w : FACE.e), '穿衣鏡'); // 穿衣鏡（大套房放在更衣間東牆）
    box(mr, -0.35, -0.03, 0.7, 0.04, 1.8, 0.1, '#c9a227', GOLD); box(mr, -0.3, 0.01, 0.6, 0.01, 1.7, 0.15, '#cfe8f3', { metalness: 0.9, roughness: 0.05 }) // 穿衣鏡
    const ch = nm(grp(g, 0.3, 2.45, FACE.e), '五斗櫃'); box(ch, -0.6, -0.25, 1.2, 0.5, 1.1, 0, '#6d4c41'); for (let r = 0; r < 4; r++) box(ch, -0.55, 0.25, 1.1, 0.01, 0.2, 0.1 + r * 0.25, '#5d4037'); ball(ch, 0.3, 1.25, 0, 0.12, '#f8bbd0') // 五斗櫃＋一瓶花
    vanity(g, 0.3, D * 0.6 + 0.2, 1.2, FACE.e); chair(g, 0.95, D * 0.6 + 0.2, FACE.w, '#e6dccb')
    const sx = W - 2.3, sz = Math.min(D * 0.5, 4.8)
    rug(g, sx, sz, 2.8, 2.2, '#8da0b6')
    armchair(g, sx - 0.75, sz, FACE.e, '#e6dccb'); armchair(g, sx + 0.75, sz, FACE.w, '#e6dccb'); sideTable(g, sx, sz, false)
    const cl = nm(grp(g, W - 0.55, sz + 1.6, FACE.w), '貴妃椅'); box(cl, -0.9, -0.3, 1.8, 0.6, 0.4, 0, '#e6dccb'); const bk = box(cl, -0.9, -0.3, 0.5, 0.6, 0.35, 0.4, '#e6dccb'); bk.rotation.z = 0.3; box(cl, 0.2, -0.25, 0.4, 0.3, 0.1, 0.4, '#3f5f8f') // 貴妃椅
    bookshelf(g, sx + 0.8, 0.2, 1.4, FACE.s, 1.8) // 不碰到床頭主牆
    // 十分天燈：起居角一支天燈造型的落地燈，天花板飄著三盞天燈
    const fl = nm(grp(g, sx + 1.3, sz - 1.3), '十分天燈落地燈'); cyl(fl, 0, 0, 0.16, 0.04, 0, '#3e2723'); cyl(fl, 0, 0, 0.015, 1.3, 0, '#3e2723'); skyLantern(fl, 0, 1.55, 0, 1.1, '#ef5350')
    const sl = nm(grp(g, sx, sz, 0, 'hang'), '天花板的天燈'); for (const [a, b, h, c] of [[-0.6, -0.3, 0.55, '#ff7043'], [0.4, -0.5, 0.75, '#ffca28'], [0.1, 0.5, 0.95, '#ef5350']]) { cyl(sl, a, b, 0.004, h - 0.25, TOP - h + 0.25, '#bdbdbd'); skyLantern(sl, a, TOP - h, b, 0.9, c) }
    plant(g, W - 0.5, 0.5, 1.5)
  },
  // 宜蘭：溫泉浴室（礁溪）。大石砌湯池冒蒸氣、檜木桶湯、沖洗區、竹子、石燈籠
  onsen(g, W, D) {
    // 礁溪溫泉的私人湯屋（7 × 8 m），照日本溫泉的動線分乾濕：
    //   西南角是乾的脫衣所（主臥室、收藏房兩道門都進到這裡）：脫衣籠架、洗面台、長椅、咖啡牛奶冰箱；
    //   玻璃隔間＋掛「ゆ」暖簾的拉門進到濕區：北牆一排洗い場（先洗身體）→ 檜木圓桶湯 → 岩石湯池跨在東牆上，一半在屋裡、一半在竹籬圍起來的露天庭院；
    //   東南角檜木三溫暖、冷水池、休息長凳
    // 湯池跨在東牆上（那段牆不砌）：一半在屋裡、一半在外面竹籬圍起來的露天庭院
    const R = Math.min(W, D) * 0.27, pz = (ONSEN_OPEN[0] + ONSEN_OPEN[1]) / 2, px = W
    const dk = nm(grp(g, px, pz, 0, 'rug'), '檜木平台'); box(dk, -R - 0.6, -R - 0.35, 2 * R + 1.2, 2 * R + 0.95, 0.04, 0, '#c9a06a') // 檜木平台
    const p = nm(grp(g, px, pz), '半露天岩石湯池（中間是龜山島）')
    cyl(p, 0, 0, R, 0.55, 0, '#6d6d6d', { roughness: 0.95 }, R, 14)
    cyl(p, 0, 0, R - 0.3, 0.05, 0.52, '#7fd1c8', { roughness: 0.05, transparent: true, opacity: 0.9 })
    for (let k = 0; k < 10; k++) ball(p, Math.cos(k * 2.3) * R * 0.45, 0.9 + (k % 4) * 0.3, Math.sin(k * 1.7) * R * 0.45, 0.2 + (k % 3) * 0.08, '#ffffff', { transparent: true, opacity: 0.3, roughness: 1 }) // 熱氣
    for (let k = 0; k < 9; k++) ball(p, Math.cos(k * 0.7) * R, 0.55, Math.sin(k * 0.7) * R, 0.22 + (k % 3) * 0.06, '#7a7a7a', { roughness: 1 })
    const gs = add(p, new THREE.SphereGeometry(0.3, 12, 8), '#5f7350', { roughness: 1, flatShading: true }, R * 0.25, 0.55, R * 0.2); gs.scale.set(1.6, 0.6, 0.9) // 池子中間的龜山島（龜背＋龜頭）
    ball(p, R * 0.25 + 0.55, 0.62, R * 0.2, 0.12, '#5f7350', { roughness: 1, flatShading: true })
    const sp = nm(grp(p, -R * 0.75, -R * 0.75, -0.8), '竹筒引水'); cyl(sp, 0, 0, 0.05, 1.0, 0, '#7cb342'); const tube = cyl(sp, 0, 0.2, 0.04, 0.6, 0.95, '#8bc34a'); tube.rotation.x = 1.2 // 竹筒引水
    // 檜木圓桶湯
    const tb = nm(grp(g, 3.7, 1.7), '檜木圓桶湯'); cyl(tb, 0, 0, 0.62, 0.7, 0, '#d9b98c', {}, 0.6, 20); for (const y of [0.15, 0.55]) cyl(tb, 0, 0, 0.635, 0.05, y, '#5d4037', { metalness: 0.4 }, 0.635, 20); cyl(tb, 0, 0, 0.54, 0.04, 0.62, '#a8e0e8', { transparent: true, opacity: 0.85 })
    // 露天庭院：竹籬（東、北、南三面）、兩張檜木躺椅＋小邊桌、楓樹、石燈籠、鋪石地
    const yd = nm(grp(g, W, pz, 0, 'rug'), '露天庭院鋪石地'); box(yd, 0.1, -2.6, 3.0, 5.2, 0.03, 0, '#9e9a90', { roughness: 1 })
    const fn = nm(grp(g, W, pz, 0, 'fixed'), '竹籬')
    for (const [x0, z0, x1, z1] of [[3.1, -2.6, 3.1, 2.6], [0.15, -2.6, 3.1, -2.6], [0.15, 2.6, 3.1, 2.6]]) {
      const L = Math.hypot(x1 - x0, z1 - z0), n = Math.round(L / 0.09)
      for (let k = 0; k <= n; k++) cyl(fn, x0 + ((x1 - x0) * k) / n, z0 + ((z1 - z0) * k) / n, 0.04, 1.9 + (k % 3) * 0.04, 0, k % 2 ? '#a1a65a' : '#8d9a4a') // 竹籬
      for (const y of [0.5, 1.4]) { const rl = box(fn, 0, 0, 0.04, 0.04, 0.04, y, '#5d4037'); rl.scale.set(x1 === x0 ? 1 : L / 0.04, 1, x1 === x0 ? L / 0.04 : 1); rl.position.set((x0 + x1) / 2, y, (z0 + z1) / 2 + (x1 === x0 ? 0 : 0.05)) }
    }
    const so = nm(grp(fn, 2.5, -1.2), '鹿威し'); box(so, -0.2, -0.2, 0.4, 0.4, 0.25, 0, '#757575'); const bm = cyl(so, 0, 0, 0.04, 0.7, 0.3, '#9ccc65'); bm.rotation.z = 1.1 // 鹿威し
    for (let k = 0; k < 4; k++) { const b = nm(grp(fn, 2.8, -0.6 + k * 0.25), '竹子'); cyl(b, 0, 0, 0.04, 2.4, 0, '#7cb342'); ball(b, 0, 2.3, 0, 0.2, '#558b2f') } // 竹子
    const mp = nm(grp(fn, 2.6, 0.9), '楓樹'); cyl(mp, 0, 0, 0.07, 1.4, 0, '#5d4037'); for (const [a, b, r] of [[0, 1.8, 0.55], [0.35, 1.6, 0.4], [-0.3, 1.55, 0.4]]) ball(mp, a, b, 0, r, '#d84315', { roughness: 0.9 }) // 楓樹
    const ol = nm(grp(fn, 2.6, -2.1), '石燈籠'); cyl(ol, 0, 0, 0.2, 0.25, 0, '#9e9e9e'); box(ol, -0.16, -0.16, 0.32, 0.32, 0.3, 0.45, '#bdbdbd'); ball(ol, 0, 0.6, 0, 0.08, '#fff3c4', GLOW('#ffcc66')); add(ol, new THREE.ConeGeometry(0.3, 0.2, 4), '#9e9e9e', {}, 0, 0.85, 0)
    for (const z of [pz + 2.15]) { const lo = nm(grp(g, W + 1.95, z, FACE.w), '檜木躺椅'); box(lo, -0.3, -0.9, 0.6, 1.8, 0.3, 0, '#c9a06a'); const bk = box(lo, -0.3, 0.45, 0.6, 0.5, 0.06, 0.3, '#c9a06a'); bk.rotation.x = -0.6; box(lo, -0.25, -0.6, 0.5, 0.5, 0.08, 0.3, '#ffffff') }
    const st = nm(grp(g, W + 0.75, pz + 2.2), '小邊桌'); cyl(st, 0, 0, 0.2, 0.45, 0, '#8d6e63'); cyl(st, 0.05, 0, 0.05, 0.08, 0.45, '#fafafa')
    // 乾濕分離：脫衣所（x 0～DX、z DZ～D）四周一圈到天花板的玻璃隔間，北面中間一道拉門、掛藍色「ゆ」暖簾
    const DX = 4.2, DZ = 3.9, dr = [2.3, 3.3]
    const pt = nm(grp(g, 0, 0, 0, 'fixed'), '乾濕分離玻璃隔間＋拉門'), GL = '#cfe8f3', FR = '#5d4037'
    for (const [a, b] of [[0, dr[0]], [dr[1], DX]]) { box(pt, a, DZ - 0.03, b - a, 0.06, 2.6, 0, GL, GLASS); box(pt, a, DZ - 0.04, b - a, 0.08, 0.06, 2.6, FR) }
    box(pt, DX - 0.03, DZ, 0.06, D - DZ, 2.6, 0, GL, GLASS); box(pt, DX - 0.04, DZ, 0.08, D - DZ, 0.06, 2.6, FR)
    for (const x of [0.05, dr[0], dr[1], DX - 0.04]) box(pt, x - 0.03, DZ - 0.04, 0.06, 0.08, 2.66, 0, FR) // 直框
    box(pt, dr[0], DZ - 0.04, dr[1] - dr[0], 0.08, 0.3, 2.36, FR) // 拉門上框
    const nr = nm(grp(g, (dr[0] + dr[1]) / 2, DZ, 0, 'hang'), '「ゆ」暖簾') // 暖簾：兩片藍布，中間白色的「ゆ」
    for (const sx of [-0.25, 0.25]) box(nr, sx - 0.24, -0.02, 0.48, 0.02, 0.85, 1.5, '#1a3c6e', { side: THREE.DoubleSide })
    cyl(nr, 0, 0, 0.12, 0.04, 1.95, '#fafafa').rotation.x = Math.PI / 2
    // 脫衣所：瓷磚換成竹蓆地，西牆脫衣籠架（9 格藤籃）、南牆洗面台（鏡子、吹風機）、中間長椅、咖啡牛奶冰箱、體重計
    rug(g, DX / 2, (DZ + D) / 2, DX - 0.3, D - DZ - 0.3, '#d7c49e', '#8d6e63')
    const ks = nm(grp(g, 0.3, 6.3, FACE.e), '脫衣籠架'); box(ks, -0.7, -0.22, 1.4, 0.44, 1.6, 0, '#c9a06a')
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) box(ks, -0.62 + c * 0.44, -0.15, 0.38, 0.32, 0.22, 0.25 + r * 0.48, '#a1887f') // 藤籃
    const vn = nm(grp(g, 2.9, D - 0.3, FACE.n), '洗面台（吹風機）'); box(vn, -0.85, -0.25, 1.7, 0.5, 0.85, 0, '#c9a06a'); box(vn, -0.85, -0.25, 1.7, 0.5, 0.04, 0.85, '#f5f5f5')
    for (const x of [-0.42, 0.42]) { cyl(vn, x, 0, 0.16, 0.05, 0.85, '#fafafa', {}, 0.12); box(vn, x - 0.3, -0.27, 0.6, 0.02, 0.8, 1.15, GL, { metalness: 0.9, roughness: 0.05 }); box(vn, x + 0.2, -0.1, 0.08, 0.2, 0.15, 0.89, '#212121') } // 洗手台、鏡子、吹風機
    const bn = nm(grp(g, 2.5, 5.5), '長椅'); box(bn, -0.65, -0.2, 1.3, 0.4, 0.42, 0, '#c9a06a')
    const mk = nm(grp(g, 3.75, 4.35, FACE.w), '咖啡牛奶冰箱'); box(mk, -0.3, -0.25, 0.6, 0.5, 1.4, 0, '#eceff1'); box(mk, -0.26, 0.25, 0.52, 0.02, 0.9, 0.4, GL, GLASS)
    for (let k = 0; k < 6; k++) cyl(mk, -0.18 + (k % 3) * 0.18, 0.05, 0.04, 0.13, 0.5 + Math.floor(k / 3) * 0.35, '#a1887f') // 咖啡牛奶
    box(g, 3.4, 6.5, 0.35, 0.3, 0.05, 0, '#9e9e9e') // 體重計
    // 濕區北牆：三個洗い場（小板凳、木桶、鏡子、蓮蓬頭），先洗身體再泡湯
    for (let k = 0; k < 3; k++) {
      const s2 = nm(grp(g, 0.6 + k * 0.9, 0.35, FACE.s), '洗い場（坐著淋浴洗身體）')
      box(s2, -0.2, -0.15, 0.4, 0.3, 0.25, 0, '#d9b98c'); cyl(s2, 0.3, 0.05, 0.14, 0.2, 0, '#d9b98c', {}, 0.16) // 板凳、木桶
      box(s2, -0.3, -0.27, 0.6, 0.02, 0.7, 0.8, GL, { metalness: 0.9, roughness: 0.05 }) // 鏡子
      cyl(s2, 0.3, -0.22, 0.05, 0.03, 1.9, '#cfd8dc', { metalness: 0.9 }); box(s2, -0.3, -0.27, 0.6, 0.12, 0.04, 0.6, '#9e9e9e') // 蓮蓬頭、置物台
    }
    // 濕區東南：檜木三溫暖（玻璃門、兩階座椅）、冷水池、休息長凳
    const sa = nm(grp(g, W - 1.05, D - 0.95), '檜木三溫暖'); box(sa, -1, -0.9, 2, 1.8, 2.2, 0, '#d9b98c'); box(sa, -0.95, -0.92, 0.6, 0.04, 1.9, 0, '#9fd3f0', { transparent: true, opacity: 0.45 }); box(sa, 0.2, -0.91, 0.6, 0.02, 0.3, 1.5, '#5d4037')
    const cp = nm(grp(g, 4.95, 5.0), '冷水池'); box(cp, -0.4, -0.55, 0.8, 1.1, 0.6, 0, '#9e9e9e'); box(cp, -0.32, -0.45, 0.64, 0.9, 0.05, 0.56, '#4fc3f7', { transparent: true, opacity: 0.85 })
    const bc = nm(grp(g, W - 0.35, 4.9, FACE.w), '休息長凳'); box(bc, -0.7, -0.2, 1.4, 0.4, 0.42, 0, '#c9a06a')
    // 踏石步道（暖簾 → 湯池）、天花板紙燈籠
    for (let k = 0; k < 3; k++) { const ss = nm(grp(g, 3.2 + k * 0.5, 3.3 - k * 0.3, 0, 'rug'), '踏石'); cyl(ss, 0, 0, 0.2, 0.03, 0, '#9e9e9e', { roughness: 1 }, 0.2, 8) }
    for (const [x, z] of [[W - 1.2, pz], [2.1, 1.7], [2.1, 5.9]]) { const lt = nm(grp(g, x, z, 0, 'hang'), '紙燈籠'); cyl(lt, 0, 0, 0.005, 0.5, TOP - 0.5, '#5d4037'); cyl(lt, 0, 0, 0.18, 0.4, TOP - 0.9, '#fff3dc', GLOW('#ffd9a0', 0.9), 0.18, 12) }
  },
  // 桃園：車庫。兩台車、行李推車（出國從這裡出發）、工作台、機場塔台模型、兩台捷安特公路車；南牆一道小門通庭園
  garage(g, W, D) {
    // 兩台車並排（各 1.84 m 寬，中間留 0.7 m 開車門）
    const cz = Math.min(D / 2, 3.1) + 0.2
    car(g, 2.4, cz, FACE.n, '#c62828') // 駕駛座那側離工作台 0.7 m、兩台車中間 0.75 m 開車門
    if (W >= 5.6) car(g, 5.0, cz, FACE.n, '#eceff1')
    const tr = nm(grp(g, W - 0.9, D - 0.55), '行李推車'); box(tr, -0.4, -0.6, 0.8, 1.2, 0.06, 0.2, '#9e9e9e', { metalness: 0.7 }); box(tr, -0.4, -0.62, 0.8, 0.04, 1.1, 0.2, '#9e9e9e', { metalness: 0.7 })
    box(tr, -0.32, -0.5, 0.64, 0.8, 0.45, 0.26, '#ffb300'); box(tr, -0.28, -0.45, 0.56, 0.6, 0.38, 0.71, '#26a69a')
    box(g, W - 2.6, D - 0.6, 0.45, 0.3, 0.7, 0, '#5c6bc0'); box(g, W - 2.0, D - 0.65, 0.45, 0.3, 0.6, 0, '#ef5350')
    const wb = nm(grp(g, 0.35, D * 0.4, FACE.e), '工作台'); box(wb, -1, -0.3, 2, 0.6, 0.9, 0, '#8d6e63'); box(wb, -1, -0.32, 2, 0.04, 1.2, 1.0, '#bcaaa4')
    for (let k = 0; k < 6; k++) box(wb, -0.85 + k * 0.32, -0.28, 0.06, 0.04, 0.3, 1.4, '#455a64', { metalness: 0.6 })
    mini(g, 0.4, D * 0.4 + 0.65, 'tower', 0.9) // 工作台上的桃園機場塔台模型
    bike(g, 3.75, D - 0.3, 0, '#1565c0'); bike(g, 4.15, D - 0.75, 0, '#eceff1') // 南牆邊兩台捷安特公路車（藍、白），南邊的門在西段，不擋
    const sh = nm(grp(g, W - 0.25, 3.4, FACE.w), '置物鐵架'); box(sh, -0.9, -0.2, 1.8, 0.4, 2, 0, '#78909c', { metalness: 0.4 }); for (let r = 0; r < 3; r++) for (let k = 0; k < 3; k++) box(sh, -0.8 + k * 0.55, -0.15, 0.45, 0.3, 0.3, 0.2 + r * 0.6, ['#ef6c00', '#1565c0', '#2e7d32'][(r + k) % 3])
  },
  // 新竹縣：工作室（竹科工程師）。北牆三螢幕工作桌＋電子工作台，中間 maker 桌，南牆零件櫃、3D 印表機、雷射切割機、機櫃，東牆白板、晶圓展示
  studio(g, W, D) {
    const glow = (c, i = 0.8) => GLOW(c, i)
    // 北牆：三螢幕的長工作桌、兩張人體工學椅、主機
    const dk = nm(grp(g, 3.0, 0.42), '三螢幕工作桌'); box(dk, -1.6, -0.38, 3.2, 0.76, 0.04, 0.74, '#eceff1', { roughness: 0.3 })
    for (const a of [-1.55, 1.5]) box(dk, a, -0.36, 0.05, 0.72, 0.74, 0, '#90a4ae')
    for (const a of [-1.1, 0, 1.1]) { box(dk, a - 0.3, -0.3, 0.6, 0.04, 0.36, 0.88, '#111', glow('#4fc3f7')); box(dk, a - 0.03, -0.28, 0.06, 0.06, 0.14, 0.78, '#455a64'); box(dk, a - 0.22, -0.02, 0.44, 0.15, 0.02, 0.78, '#263238') }
    box(dk, 1.15, -0.3, 0.22, 0.48, 0.5, 0, '#263238', glow('#7c4dff', 0.4)) // 主機
    for (const x of [2.4, 3.6]) chair(g, x, 1.25, FACE.n, '#37474f')
    // 東北：電子工作台（示波器、電源供應器、烙鐵），上面牆上世界地圖；東牆洞洞板
    const eb = nm(grp(g, W - 2.0, 0.42), '電子工作台'); box(eb, -1, -0.38, 2, 0.76, 0.04, 0.9, '#8d6e63'); for (const a of [-0.95, 0.9]) box(eb, a, -0.36, 0.05, 0.72, 0.9, 0, '#5d4037')
    box(eb, -0.8, -0.3, 0.42, 0.3, 0.26, 0.94, '#37474f'); box(eb, -0.75, -0.01, 0.3, 0.02, 0.18, 0.98, '#111', glow('#76ff03', 0.6)); box(eb, -0.25, -0.3, 0.32, 0.25, 0.18, 0.94, '#263238', glow('#ffab00', 0.4)); box(eb, 0.3, -0.15, 0.4, 0.3, 0.02, 0.94, '#2e7d32') // 示波器、電源、PCB
    cyl(eb, 0.75, -0.1, 0.06, 0.12, 0.94, '#c62828')
    worldMap(g, W - 2.0, 0.1, FACE.s, 2.0, 1.1, 1.3) // 北牆（機房那面實牆）掛一大張世界地圖，台灣標紅點
    const pb = nm(grp(g, W - 0.1, 1.4, FACE.w), '洞洞板工具牆'); box(pb, -0.9, 0, 1.8, 0.03, 0.9, 1.3, '#d7ccc8'); for (let i = 0; i < 8; i++) box(pb, -0.75 + i * 0.21, 0.03, 0.04, 0.03, 0.28, 1.6 + (i % 3) * 0.15, ['#546e7a', '#e53935', '#fdd835'][i % 3], { metalness: 0.4 })
    stool(g, W - 2.0, 1.2)
    // 中間：大型 maker 桌（機械手臂、空拍機、筆電）
    const mk = nm(grp(g, W / 2 + 0.4, D / 2), 'Maker 大桌'); box(mk, -1.3, -0.55, 2.6, 1.1, 0.05, 0.9, '#fafafa', { roughness: 0.3 }); for (const [a, b2] of [[-1.25, -0.5], [1.2, -0.5], [-1.25, 0.45], [1.2, 0.45]]) box(mk, a, b2, 0.05, 0.05, 0.9, 0, '#90a4ae')
    cyl(mk, -0.8, 0, 0.12, 0.1, 0.95, '#ff6f00'); const arm = box(mk, -0.84, -0.04, 0.08, 0.08, 0.45, 1.05, '#ff8f00'); arm.rotation.z = 0.4; box(mk, -0.62, -0.05, 0.3, 0.1, 0.08, 1.45, '#ff8f00') // 機械手臂
    box(mk, 0.05, -0.12, 0.24, 0.24, 0.06, 0.95, '#37474f'); for (const [a, b2] of [[-0.05, -0.22], [0.39, -0.22], [-0.05, 0.22], [0.39, 0.22]]) cyl(mk, a, b2, 0.1, 0.01, 1.0, '#b0bec5') // 空拍機
    box(mk, 0.6, -0.2, 0.36, 0.25, 0.02, 0.95, '#b0bec5'); box(mk, 0.6, -0.22, 0.36, 0.02, 0.24, 0.96, '#111', glow('#4fc3f7', 0.6)) // 筆電
    for (const x of [W / 2 - 0.2, W / 2 + 1.0]) stool(g, x, D / 2 + 0.9)
    // 南牆：零件盒層架、兩台 3D 印表機、雷射切割機、伺服器機櫃
    const rk = nm(grp(g, 0.95, D - 0.4, FACE.n), '機櫃'); box(rk, -0.3, -0.35, 0.6, 0.7, 1.9, 0, '#263238', { metalness: 0.6, roughness: 0.35 }) // 機櫃靠南牆（西邊是落地窗）
    for (let r = 0; r < 7; r++) box(rk, -0.25, 0.35, 0.5, 0.02, 0.05, 0.2 + r * 0.24, r % 2 ? '#00e676' : '#29b6f6', GLOW(r % 2 ? '#00e676' : '#29b6f6'))
    const bins = nm(grp(g, 2.55, D - 0.25, FACE.n), '零件收納櫃'); box(bins, -1.1, -0.2, 2.2, 0.4, 1.8, 0, '#cfd8dc', { metalness: 0.3 })
    for (let r = 0; r < 4; r++) for (let i = 0; i < 6; i++) box(bins, -1.0 + i * 0.35, 0.18, 0.3, 0.04, 0.3, 0.1 + r * 0.44, ['#e53935', '#1e88e5', '#fdd835', '#43a047'][(i + r) % 4])
    for (const x of [4.3, 5.15]) { const pr = nm(grp(g, x, D - 0.35), '3D 印表機'); box(pr, -0.35, -0.3, 0.7, 0.6, 0.75, 0, '#eceff1'); box(pr, -0.28, -0.25, 0.56, 0.5, 0.5, 0.75, '#ff7043', { transparent: true, opacity: 0.6 }); box(pr, -0.08, -0.08, 0.16, 0.16, 0.12, 0.76, '#29b6f6') }
    const lc = nm(grp(g, 6.6, D - 0.45), '雷射切割機'); box(lc, -0.65, -0.4, 1.3, 0.8, 0.85, 0, '#37474f'); box(lc, -0.6, -0.35, 1.2, 0.7, 0.12, 0.85, '#ff7043', { transparent: true, opacity: 0.7 }) // 雷射切割機
    // 南牆白板；東南角晶圓展示（12 吋晶圓在發光的展示座上）
    const wbd = nm(grp(g, 4.75, D - 0.1, FACE.n, 'fixed'), '白板'); box(wbd, -0.8, -0.02, 1.6, 0.02, 0.9, 1.45, '#fafafa'); for (let i = 0; i < 4; i++) box(wbd, -0.6 + i * 0.35, 0.01, 0.25, 0.005, 0.02, 1.75 + (i % 2) * 0.25, '#1565c0') // 白板（南牆，3D 印表機上面）
    const wf = nm(grp(g, W - 0.5, D - 0.6), '晶圓展示'); box(wf, -0.25, -0.25, 0.5, 0.5, 1.0, 0, '#263238'); cyl(wf, 0, 0, 0.15, 0.02, 1.02, '#cfd8dc', { metalness: 0.95, roughness: 0.12 }); box(wf, -0.24, -0.24, 0.48, 0.48, 0.4, 1.0, '#e1f5fe', { transparent: true, opacity: 0.3 })
    plant(g, 0.4, 0.4, 1.2)
  },
  // 臺中：書房，像中友百貨的誠品書店：書櫃從上面看是一道道圓弧，北邊一道 2.3 m 高的大弧形書牆，
  //   前面一道 1.3 m 高、兩面都能拿書的弧形矮書櫃，兩道弧中間是彎彎的走道；南邊靠落地窗是閱讀區
  study(g, W, D) {
    const colors = ['#8d2f2f', '#2f4f8d', '#3d6b3d', '#c9a227', '#6a4c93', '#d9822b', '#efe6d8', '#37474f']
    const cx = W / 2, cz = D * 1.5 // 圓心在房間南邊外面，書櫃往北彎
    // 弧形書櫃：背板＋每層層板，書一本一本立在層板上（同顏色的書合成一個 mesh，2D 平面圖不畫書）
    const arcShelf = (R, h, both) => {
      const o = nm(grp(g, 0, 0, 0, 'fixed'), '弧形書櫃（像中友誠品）')
      const lim = Math.min(Math.asin(Math.min((W / 2 - 0.4) / R, 1)), Math.acos(Math.min((cz - (D - 0.9)) / R, 1)))
      const N = Math.ceil((2 * lim * R) / 0.45), dA = (2 * lim) / N, chord = 2 * R * Math.sin(dA / 2) + 0.01
      const rows = Math.floor(h / 0.38), books = colors.map(() => []), mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0)
      const put = (t, r, w, hh, y, d, color) => { const m = add(o, new THREE.BoxGeometry(w, hh, d), color, { roughness: 0.5 }, cx + r * Math.sin(t), y + hh / 2, cz - r * Math.cos(t)); m.rotation.y = -t; return m }
      for (let i = 0; i < N; i++) {
        const t = -lim + (i + 0.5) * dA
        put(t, R, chord, h, 0, 0.05, '#8a5a3b') // 背板
        for (const side of both ? [-1, 1] : [1]) for (let r = 0; r <= rows; r++) {
          put(t, R - side * 0.18, chord, 0.03, r * 0.38 + (r === rows ? h - rows * 0.38 - 0.03 : 0), 0.32, '#b07a4f') // 層板
          if (r === rows) continue
          let u = -chord / 2 + 0.02, k = 0
          while (u < chord / 2 - 0.06) { // 一本一本的書：寬 3～6 cm、高 22～32 cm，偶爾斜靠
            const bw = 0.03 + ((i * 7 + r * 3 + k * 5) % 4) * 0.01, bh = 0.22 + ((i + r * 2 + k * 3) % 5) * 0.025
            const along = u + bw / 2, rr = R - side * 0.15, tt = t + along / R
            q.setFromAxisAngle(up, -tt)
            mtx.compose(new THREE.Vector3(cx + rr * Math.sin(tt), r * 0.38 + 0.03 + bh / 2, cz - rr * Math.cos(tt)), q, new THREE.Vector3(1, 1, 1))
            books[(i * 3 + r * 5 + k * 7 + (side > 0 ? 0 : 1)) % colors.length].push(new THREE.BoxGeometry(bw, bh, 0.2).applyMatrix4(mtx))
            u += bw + 0.004; k++
          }
        }
        if (i === 0 || i === N - 1) put(t + (i ? 1 : -1) * dA / 2, R, 0.04, h, 0, both ? 0.45 : 0.4, '#8a5a3b') // 兩端側板
      }
      books.forEach((list, c) => { if (!list.length) return; const m = add(o, mergeGeometries(list), colors[c], { roughness: 0.6 }, 0, 0, 0); m.userData.noPlan = true })
    }
    arcShelf(D * 1.5 - 0.6, 2.3, false) // 北邊大弧形書牆（書朝南）
    arcShelf(D * 1.5 - 2.3, 1.3, true) // 中間弧形矮書櫃（兩面）
    // 南邊靠落地窗（西南角有門）：西邊閱讀角（單人沙發＋一疊書的小圓桌＋立燈），中間沙發＋茶几（台中國家歌劇院模型），東邊面窗的書桌（綠檯燈）
    armchair(g, 1.5, D - 0.9, FACE.e, '#7b2d26'); floorLamp(g, 0.55, D - 0.4)
    const st = nm(grp(g, 0.75, D - 1.6), '一疊書'); cyl(st, 0, 0, 0.3, 0.04, 0.55, '#4e342e'); cyl(st, 0, 0, 0.04, 0.55, 0, '#3e2723'); for (let k = 0; k < 3; k++) box(st, -0.12 + k * 0.02, -0.08, 0.24, 0.17, 0.04, 0.59 + k * 0.04, colors[k]) // 一疊書
    const sx = cx + 0.6 // 沙發往東，避開門
    rug(g, sx, D - 1.35, 3.4, 2.3, '#7b2d26')
    sofa(g, sx, D - 0.55, 2.4, FACE.n, '#7b2d26', '#c9a227')
    const ct = coffeeTable(g, sx, D - 1.9, 1.2, 0.6); mini(ct, -0.25, 0, 'opera', 0.45) // 茶几上的台中國家歌劇院模型
    desk(g, W - 1.6, D - 0.45, 1.4, FACE.n, false)
    const bl = nm(grp(g, W - 1.6 - 0.45, D - 0.6), '綠檯燈'); cyl(bl, 0, 0, 0.07, 0.03, 0.76, '#c9a227', GOLD); cyl(bl, 0, 0, 0.012, 0.3, 0.76, '#c9a227', GOLD); box(bl, -0.18, -0.06, 0.36, 0.12, 0.08, 1.04, '#1b5e20', GLOW('#a5d6a7', 0.4)) // 銀行家綠檯燈
    const ob = nm(grp(g, W - 1.6 + 0.15, D - 0.5), '打開的書'); box(ob, -0.17, -0.12, 0.16, 0.24, 0.02, 0.76, '#f5ecd7'); box(ob, 0.01, -0.12, 0.16, 0.24, 0.02, 0.76, '#f5ecd7')
    plant(g, 0.35, 0.35, 1.1); plant(g, W - 0.35, 0.35, 1.1)
  },
  // 苗栗：客房（附衛浴）。雙人床、床頭櫃、書桌、衣櫃、行李架、閱讀椅
  guest(g, W, D, ctx) {
    // 附屬衛浴在靠走廊的東北角：床、床頭櫃放在它西邊那一段北牆
    const x0 = ctx.wc && ctx.wc[0] < W / 2 ? ctx.wc[0] + ctx.wc[2] : 0, x1 = ctx.wc && ctx.wc[0] >= W / 2 ? ctx.wc[0] : W
    const bx = (x0 + x1) / 2
    rug(g, bx, 2.6, 3.2, 3, '#a5b7a0')
    bed(g, bx, 0.25, 1.6, FACE.s, '#7cb342')
    nightstand(g, bx - 1.25, 0.45); nightstand(g, bx + 1.25, 0.45)
    desk(g, W - 1.0, D - 0.6, 1.4, FACE.n, false); mini(g, W - 1.0, D - 0.45, 'longteng', 0.76) // 書桌上的龍騰斷橋模型
    wardrobe(g, x0 + 1.2, D - 0.35, 1.8, FACE.n)
    const lr = nm(grp(g, 0.4, 3.0, FACE.e), '行李架'); box(lr, -0.4, -0.25, 0.8, 0.5, 0.5, 0, '#6d4c41'); box(lr, -0.35, -0.2, 0.7, 0.4, 0.35, 0.5, '#ffb300')
    armchair(g, W - 2.6, D - 0.9, FACE.n, '#a5b7a0'); floorLamp(g, W - 3.4, D - 0.4) // 閱讀椅放書桌旁，落地燈在椅子旁邊
    plant(g, 0.45, 0.45, 1.2)
  },
  // 花蓮：健身房。北牆攀岩牆（太魯閣）＋軟墊、東牆跑步機、啞鈴架、臥推、瑜伽區、飛輪、鏡牆
  gym(g, W, D) {
    const cw = grp(g, W / 2, 0.25)
    const wall = box(cw, -W / 2 + 0.3, -0.25, W - 0.6, 0.3, 2.7, 0, '#8d6e63', { roughness: 0.95 }); wall.rotation.x = 0.08
    const hc = ['#e53935', '#fdd835', '#1e88e5', '#43a047', '#8e24aa']
    for (let k = 0; k < Math.floor(W * 5); k++) ball(cw, -W / 2 + 0.5 + ((k * 0.73) % (W - 1)), 0.3 + ((k * 0.37) % 2.3), 0.08, 0.06, hc[k % 5])
    box(g, 0.4, 0.6, W - 0.8, 1.4, 0.3, 0, '#1565c0')
    for (let k = 0; k < 3; k++) {
      const t = grp(g, W - 0.9, 3.5 + k * 1.3, FACE.e)
      box(t, -0.4, -0.9, 0.8, 1.8, 0.2, 0, '#212121'); box(t, -0.4, 0.7, 0.05, 0.2, 1.2, 0.2, '#424242'); box(t, 0.35, 0.7, 0.05, 0.2, 1.2, 0.2, '#424242'); box(t, -0.35, 0.75, 0.7, 0.2, 0.1, 1.3, '#424242')
    }
    const rk = grp(g, W / 2, D - 0.35, FACE.n); box(rk, -1, -0.25, 2, 0.5, 0.8, 0, '#37474f', { metalness: 0.5 })
    for (let k = 0; k < 8; k++) for (const a of [-0.1, 0.1]) cyl(rk, -0.85 + k * 0.24, a, 0.06, 0.1, 0.85, '#212121').rotation.x = Math.PI / 2
    const bp = grp(g, W / 2, D * 0.55); box(bp, -0.15, -0.6, 0.3, 1.2, 0.45, 0, '#212121'); cyl(bp, 0, -0.5, 0.02, 1.7, 1.0, '#9e9e9e', { metalness: 0.8 }).rotation.z = Math.PI / 2
    for (const a of [-0.7, 0.7]) { const p = cyl(bp, a, -0.5, 0.22, 0.05, 1.0, '#212121'); p.rotation.z = Math.PI / 2; p.position.set(a, 1.0, -0.5) }
    for (let k = 0; k < 3; k++) { const m = grp(g, 1.0, D * 0.4 + k * 0.9, 0, 'rug'); box(m, -0.3, -0.9, 0.6, 1.8, 0.02, 0, ['#8e24aa', '#00897b', '#f4511e'][k]) }
    const bk = grp(g, 1.0, D - 1.2, FACE.e); box(bk, -0.3, -0.5, 0.6, 1, 0.1, 0, '#212121'); box(bk, -0.05, -0.1, 0.1, 0.1, 0.9, 0.1, '#e53935'); box(bk, -0.15, -0.2, 0.3, 0.25, 0.08, 1.0, '#212121'); cyl(bk, 0, 0.35, 0.22, 0.08, 0.4, '#9e9e9e').rotation.x = Math.PI / 2
    const wc = grp(g, W - 0.4, D - 0.5); cyl(wc, 0, 0, 0.18, 1.0, 0, '#eceff1'); cyl(wc, 0, 0, 0.15, 0.4, 1.0, '#81d4fa', { transparent: true, opacity: 0.7 })
  },
  // 臺東：遊戲室（娛樂空間）。北段 KTV：大螢幕、點歌機、麥克風架、小舞台、迪斯可球、L 型沙發；
  //   中段桌遊：圓桌、四張椅子、桌上棋盤和骰子、桌遊櫃；南段電玩：三台大型機台、電視遊樂器、懶骨頭、手足球台
  game(g, W, D) {
    // KTV
    const kx = W / 2 - 0.4 // 東北角留給通收藏房的門
    const st = nm(grp(g, kx, 0.9), 'KTV 舞台'); box(st, -1.8, -0.9, 3.6, 1.8, 0.2, 0, '#311b92')
    const tv = nm(grp(g, kx, 0.08, FACE.s), 'KTV 大電視'); box(tv, -1.5, -0.04, 3, 0.06, 1.7, 0.6, '#111', GLOW('#e040fb', 0.6))
    for (const sx of [-1, 1]) box(tv, sx * 1.85 - 0.2, 0, 0.4, 0.4, 1.4, 0, '#212121')
    const mic = nm(grp(g, kx, 1.9), '麥克風架'); cyl(mic, 0, 0, 0.15, 0.03, 0.2, '#424242'); cyl(mic, 0, 0, 0.012, 1.3, 0.2, '#9e9e9e', { metalness: 0.8 }); ball(mic, 0, 1.55, 0, 0.04, '#212121')
    const km = nm(grp(g, W - 0.6, 1.4, FACE.w), '點歌機'); box(km, -0.3, -0.2, 0.6, 0.4, 1.0, 0, '#37474f'); box(km, -0.22, -0.21, 0.44, 0.02, 0.3, 0.6, '#111', GLOW('#00e5ff', 0.8))
    // 台東熱氣球：桌遊區上面吊三顆熱氣球（球皮、吊籃）
    const hb = nm(grp(g, W / 2, D * 0.5, 0, 'hang'), '熱氣球')
    for (const [a, b, c1, c2] of [[-1.9, -0.6, '#e53935', '#fdd835'], [1.9, -0.2, '#1e88e5', '#fafafa'], [0.3, 1.7, '#43a047', '#ff7043']]) {
      ball(hb, a, TOP - 0.6, b, 0.3, c1); add(hb, new THREE.SphereGeometry(0.302, 16, 6, 0, Math.PI * 2, Math.PI * 0.35, Math.PI * 0.15), c2, {}, a, TOP - 0.6, b)
      add(hb, new THREE.ConeGeometry(0.2, 0.25, 12), c1, {}, a, TOP - 0.92, b).rotation.x = Math.PI; box(hb, a - 0.06, b - 0.06, 0.12, 0.12, 0.1, TOP - 1.22, '#8d6e63'); cyl(hb, a, b, 0.004, 0.3, TOP - 0.3, '#bdbdbd')
    }
    const db = nm(grp(g, W / 2, 2.5, 0, 'hang'), '熱氣球'); cyl(db, 0, 0, 0.01, 0.3, TOP - 0.3, '#9e9e9e'); ball(db, 0, TOP - 0.5, 0, 0.22, '#e0e0e0', { metalness: 1, roughness: 0.1 })
    sofa(g, W / 2, 4.3, 3, FACE.n, '#7c4dff', '#ff4081'); coffeeTable(g, W / 2, 3.3, 1.2, 0.5)
    // 桌遊
    const cz = D * 0.5
    const gt = nm(grp(g, W / 2, cz), '桌遊桌'); cyl(gt, 0, 0, 0.75, 0.05, 0.74, '#6d4c41'); cyl(gt, 0, 0, 0.08, 0.74, 0, '#4e342e')
    box(gt, -0.3, -0.3, 0.6, 0.6, 0.02, 0.79, '#fff8e1'); for (let k = 0; k < 6; k++) cyl(gt, -0.2 + (k % 3) * 0.2, -0.15 + Math.floor(k / 3) * 0.3, 0.035, 0.06, 0.81, ['#e53935', '#1e88e5', '#fdd835', '#43a047', '#8e24aa', '#fb8c00'][k])
    for (const r of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) chair(gt, Math.sin(r) * 1.0, Math.cos(r) * 1.0, r + Math.PI, '#8d6e63')
    const sh = nm(grp(g, 0.3, cz, FACE.e), '桌遊櫃'); box(sh, -1, -0.2, 2, 0.4, 1.8, 0, '#5d4037')
    for (let r = 0; r < 4; r++) for (let k = 0; k < 6; k++) box(sh, -0.9 + k * 0.3, -0.15, 0.26, 0.3, 0.32, 0.1 + r * 0.42, ['#e53935', '#1e88e5', '#fdd835', '#43a047', '#8e24aa', '#fb8c00', '#26c6da'][(k + r * 2) % 7])
    // 電玩：大型機台三台（靠西牆）、電視遊樂器＋懶骨頭、手足球台
    for (let k = 0; k < 3; k++) {
      const ar = nm(grp(g, 0.45, D - 4.8 + k * 1.0, FACE.e), '大型電玩機台'); box(ar, -0.35, -0.35, 0.7, 0.7, 1.75, 0, ['#d32f2f', '#1565c0', '#ffb300'][k])
      box(ar, -0.28, 0.3, 0.56, 0.06, 0.45, 1.05, '#111', GLOW(['#76ff03', '#ff4081', '#00e5ff'][k], 0.9)); box(ar, -0.3, 0.3, 0.6, 0.25, 0.06, 0.85, '#212121')
    }
    tvUnit(g, W - 1.3, D - 3.2, 2, FACE.w) // 東邊是落地窗：電視櫃離窗 1 m 擺（背後看得到庭園）
    for (const [dz, c] of [[-0.7, '#ff7043'], [0.7, '#29b6f6']]) { const bb = nm(grp(g, W - 3.0, D - 3.2 + dz), '懶骨頭'); ball(bb, 0, 0.3, 0, 0.42, c, { roughness: 0.9 }).scale.y = 0.7 }
    const fb = nm(grp(g, W / 2, D - 1.2), '手足球台'); box(fb, -0.7, -0.4, 1.4, 0.8, 0.9, 0, '#1565c0'); box(fb, -0.65, -0.35, 1.3, 0.7, 0.02, 0.9, '#43a047')
    for (let k = 0; k < 4; k++) cyl(fb, -0.45 + k * 0.3, 0, 0.012, 1.0, 0.75, '#bdbdbd', { metalness: 0.8 }).rotation.x = Math.PI / 2
  },
  // 花蓮：收藏房（小博物館）。北段：花東線鐵道模型台；西牆一整排玻璃展示櫃（太魯閣大理石、礦石、蝴蝶標本）；
  //   中段：阿美族區（豐年祭服飾的假人、陶壺、木雕柱、織布掛毯）；南段：紀念品牆＋小櫃台；中間一排長椅；天花板軌道投射燈
  museum(g, W, D) {
    // 鐵道模型台：綠色山景桌、橢圓軌道、太魯閣號（白身紅條）、小山、小隧道
    const tx = W / 2 + 0.3, tz = 2.9, tw = W - 2.6, td = 3 // 北邊留 1.4 m 給溫泉浴室進來的門
    const tb = nm(grp(g, tx, tz), '花東線鐵道模型台'); box(tb, -tw / 2, -td / 2, tw, td, 0.85, 0, '#5d4037'); box(tb, -tw / 2, -td / 2, tw, td, 0.05, 0.85, '#7cb342', { roughness: 1 })
    const ring = new THREE.CatmullRomCurve3([[-tw / 2 + 0.4, -td / 2 + 0.4], [tw / 2 - 0.4, -td / 2 + 0.4], [tw / 2 - 0.4, td / 2 - 0.4], [-tw / 2 + 0.4, td / 2 - 0.4]].map(([x, z]) => new THREE.Vector3(x, 0.92, z)), true, 'catmullrom', 0.15)
    add(tb, new THREE.TubeGeometry(ring, 160, 0.03, 6, true), '#6d4c41', {}, 0, 0, 0).castShadow = false
    for (let k = 0; k < 6; k++) {
      const t = 0.1 + k * 0.022, p0 = ring.getPointAt(t), p1 = ring.getPointAt(t + 0.005)
      const c = nm(grp(tb, p0.x, p0.z, -Math.atan2(p1.z - p0.z, p1.x - p0.x) + Math.PI / 2), '模型小火車')
      box(c, -0.07, -0.13, 0.14, 0.26, 0.12, 0.92, '#fafafa'); box(c, -0.072, -0.13, 0.144, 0.26, 0.025, 0.97, '#d32f2f')
    }
    for (const [mx, mz, r, h] of [[-0.6, 0, 0.6, 0.7], [0.4, 0.1, 0.45, 0.5], [1.2, -0.2, 0.35, 0.4]]) add(tb, new THREE.ConeGeometry(r, h, 7), '#689f38', { flatShading: true }, mx, 0.9 + h / 2, mz)
    box(tb, tw / 2 - 1.2, -0.25, 0.5, 0.5, 0.25, 0.9, '#9e9e9e') // 小車站
    // 西牆展示櫃：每 1.6 m 一座，底櫃＋玻璃罩，裡面輪流放大理石、礦石、蝴蝶標本
    const cases = Math.floor((D - 6.5) / 1.6)
    for (let i = 0; i < cases; i++) {
      const c = nm(grp(g, 0.4, 5 + i * 1.6, FACE.e), '展示櫃')
      box(c, -0.65, -0.3, 1.3, 0.6, 0.9, 0, '#3e2723'); box(c, -0.62, -0.28, 1.24, 0.56, 0.6, 0.9, '#cfe8f3', { transparent: true, opacity: 0.25, roughness: 0.05 })
      if (i % 3 === 0) { box(c, -0.4, -0.1, 0.35, 0.25, 0.22, 0.9, '#f5f5f0', { roughness: 0.3 }); box(c, 0.1, -0.1, 0.3, 0.2, 0.18, 0.9, '#e8e3d8', { roughness: 0.3 }) } // 太魯閣大理石
      else if (i % 3 === 1) { for (let k = 0; k < 5; k++) add(c, new THREE.OctahedronGeometry(0.07 + (k % 2) * 0.03), ['#7e57c2', '#26a69a', '#ffca28', '#ef5350', '#8d6e63'][k], { flatShading: true }, -0.45 + k * 0.22, 1.0, 0) } // 礦石
      else { box(c, -0.5, 0.05, 1.0, 0.02, 0.45, 1.0, '#fff8e1'); for (let k = 0; k < 6; k++) box(c, -0.42 + (k % 3) * 0.3, 0.03, 0.16, 0.01, 0.1, 1.12 + Math.floor(k / 3) * 0.18, ['#1e88e5', '#ffb300', '#e53935', '#43a047', '#8e24aa', '#00acc1'][k]) } // 蝴蝶標本框
    }
    // 阿美族區：豐年祭服飾（紅白黑、黃色帽羽）的假人兩座、陶壺三個、木雕柱、織布掛毯（立架）
    const az = D * 0.62
    for (const [i, x] of [W / 2 - 0.8, W / 2 + 0.8].entries()) {
      const m = nm(grp(g, x, az, FACE.w), '阿美族服飾'); cyl(m, 0, 0, 0.25, 0.08, 0, '#5d4037')
      box(m, -0.15, -0.1, 0.3, 0.2, 0.8, 0.08, '#d32f2f'); box(m, -0.2, -0.13, 0.4, 0.26, 0.55, 0.88, i ? '#d32f2f' : '#fafafa'); box(m, -0.21, -0.14, 0.42, 0.28, 0.08, 1.1, '#212121')
      ball(m, 0, 1.6, 0, 0.12, '#d7b98e'); for (let k = 0; k < 5; k++) box(m, -0.12 + k * 0.06, -0.01, 0.03, 0.02, 0.35, 1.68, ['#fdd835', '#d32f2f', '#fafafa', '#fdd835', '#1e88e5'][k]) // 羽冠
    }
    for (let k = 0; k < 3; k++) { const pt = nm(grp(g, 1.3 + k * 0.6, az + 1.3), '阿美族陶壺'); ball(pt, 0, 0.3, 0, 0.26, '#8d5a3b'); cyl(pt, 0, 0, 0.1, 0.18, 0.5, '#8d5a3b') }
    const tp = nm(grp(g, W - 1.0, az - 0.6), '木雕柱'); for (let k = 0; k < 6; k++) cyl(tp, 0, 0, 0.22, 0.35, k * 0.35, ['#6d4c41', '#d32f2f', '#5d4037', '#fafafa', '#6d4c41', '#212121'][k], {}, 0.2) // 木雕柱
    const tap = nm(grp(g, W / 2, az + 1.6, FACE.n), '阿美族織布'); box(tap, -0.8, -0.03, 1.6, 0.06, 1.3, 0.6, '#c62828'); for (let k = 0; k < 6; k++) box(tap, -0.8, -0.05, 1.6, 0.01, 0.06, 0.75 + k * 0.2, k % 2 ? '#fdd835' : '#212121'); for (const a of [-0.82, 0.78]) box(tap, a, -0.05, 0.04, 0.1, 2, 0, '#5d4037')
    // 飛機模型：華航 747（白身、藍條、尾翼梅花粉紅）、IDF 經國號戰機（灰色），各放在一座展示台上
    const model = (x, z, kind) => {
      const o = nm(grp(g, x, z, kind === 'jet' ? -0.5 : 0.5), kind === '747' ? '華航 747 模型' : 'IDF 經國號戰機模型')
      box(o, -0.3, -0.3, 0.6, 0.6, 0.85, 0, '#3e2723'); cyl(o, 0, 0, 0.02, 0.35, 0.85, '#9e9e9e', GOLD)
      const y = 1.25, big = kind === '747', L = big ? 1.5 : 0.3, r = big ? 0.085 : 0.025, // 都是約 1:48：747 長 1.5 m、IDF 長 0.3 m
      body = big ? '#fafafa' : '#8a9499'
      const f = cyl(o, 0, 0, r, L, -L / 2, body); f.rotation.z = Math.PI / 2; f.position.set(0, y, 0) // 機身沿 x
      const nose = add(o, new THREE.SphereGeometry(r, 16, 10), body, {}, L / 2, y, 0); nose.scale.set(big ? 1.8 : 3.2, 1, 1)
      const tail = add(o, new THREE.ConeGeometry(r, big ? 0.3 : 0.15, 16), body, {}, -L / 2 - (big ? 0.15 : 0.075), y, 0); tail.rotation.z = Math.PI / 2
      if (big) { const hump = add(o, new THREE.SphereGeometry(0.07, 16, 10), body, {}, L / 2 - 0.25, y + 0.06, 0); hump.scale.set(4, 1, 1); box(o, -L / 2, -r - 0.002, L, 0.004, 0.025, y - 0.01, '#1565c0'); box(o, -L / 2, r - 0.002, L, 0.004, 0.025, y - 0.01, '#1565c0') } // 747 的駝峰、藍色腰線
      const wing = (px, py, span, chord, sweep, s2, color, th = 0.018) => { const m = add(o, new THREE.BoxGeometry(chord, th, span).translate(0, 0, (s2 * span) / 2), color, {}, px, py, 0); m.rotation.y = -s2 * sweep; return m } // 翼根在機身，往外後掠
      for (const s2 of [-1, 1]) {
        wing(big ? 0.1 : -0.05, y - 0.03, big ? 0.72 : 0.34, big ? 0.26 : 0.32, big ? 0.6 : 0.8, s2, body) // 主翼
        wing(-L / 2 + 0.02, y, big ? 0.25 : 0.14, 0.12, 0.55, s2, body, 0.014) // 水平尾翼
        if (big) for (const d of [0.22, 0.45]) { const e = cyl(o, 0, 0, 0.03, 0.13, 0, '#cfd8dc'); e.rotation.z = Math.PI / 2; e.position.set(0.12 - d * 0.6, y - 0.09, s2 * d) } // 四具發動機
      }
      const fin = add(o, new THREE.BoxGeometry(big ? 0.26 : 0.2, big ? 0.3 : 0.18, 0.015).translate(0, (big ? 0.3 : 0.18) / 2, 0), big ? '#e57399' : '#6e787d', {}, -L / 2 + 0.05, y + r * 0.5, 0); fin.rotation.z = 0.45 // 垂直尾翼（華航梅花粉紅）
      if (!big) { for (const s2 of [-1, 1]) box(o, 0.05, s2 * 0.06 - 0.02, 0.2, 0.04, 0.05, y - 0.06, '#5f696e'); ball(o, L / 2 - 0.15, y + 0.045, 0, 0.045, '#4fc3f7', { roughness: 0.1 }) } // 進氣口、座艙罩
    }
    model(W - 1.5, 5.3, '747'); model(W - 1.5, 11.6, 'jet')
    // 紀念品牆（南牆）＋小櫃台
    const sw = nm(grp(g, W / 2 - 0.6, D - 0.3, FACE.n), '紀念品櫃'); box(sw, -2.2, -0.2, 4.4, 0.4, 2.2, 0, '#8d6e63') // 東南角留給通遊戲室的門
    for (let r = 0; r < 4; r++) for (let k = 0; k < 10; k++) box(sw, -2.1 + k * 0.43, -0.15, 0.3, 0.2, 0.22, 0.3 + r * 0.5, ['#ef5350', '#ffca28', '#42a5f5', '#66bb6a', '#ab47bc', '#ff7043', '#fafafa'][(k + r * 3) % 7])
    const ct = nm(grp(g, W / 2 + 0.7, D - 1.6), '紀念品展示桌'); box(ct, -0.9, -0.3, 1.8, 0.6, 1.0, 0, '#5d4037'); box(ct, -0.92, -0.32, 1.84, 0.64, 0.04, 1.0, '#efebe9')
    // 中間長椅、天花板投射燈
    for (const z of [D * 0.42, D * 0.82]) { const b2 = nm(grp(g, W / 2 + 0.5, z), '長椅'); box(b2, -0.9, -0.22, 1.8, 0.44, 0.08, 0.42, '#a1887f'); for (const a of [-0.8, 0.7]) box(b2, a, -0.2, 0.1, 0.4, 0.42, 0, '#5d4037') }
    const tr = nm(grp(g, W / 2, 0, 0, 'hang'), '投射燈軌道'); box(tr, -0.03, 0.5, 0.06, D - 1, 0.04, TOP - 0.05, '#212121')
    for (let z = 1.5; z < D - 0.5; z += 2) { cyl(tr, 0, z, 0.06, 0.15, TOP - 0.25, '#212121'); ball(tr, 0, TOP - 0.28, z, 0.05, '#fff3c4', GLOW('#ffe9a8', 1.8)) }
  },
  // 新竹市：機房（中控室）。小房間：北牆、東牆一排伺服器機櫃，南邊一張監控桌＋螢幕，西南角 UPS
  server(g, W, D) {
    const rack = (x, z, rot) => {
      const r = nm(grp(g, x, z, rot), '伺服器機櫃'); box(r, -0.3, -0.5, 0.6, 1, 2.1, 0, '#263238', { metalness: 0.6, roughness: 0.35 })
      for (let i = 0; i < 9; i++) box(r, -0.26, 0.5, 0.52, 0.02, 0.05, 0.2 + i * 0.2, i % 3 ? '#29b6f6' : '#00e676', GLOW(i % 3 ? '#29b6f6' : '#00e676'))
    }
    for (let i = 0; i < Math.floor((W - 0.2) / 0.62); i++) rack(0.4 + i * 0.62, 0.55, FACE.s)
    const d = nm(grp(g, W / 2, D - 0.4, FACE.n), '監控桌'); box(d, -0.7, -0.3, 1.4, 0.6, 0.75, 0, '#eceff1')
    for (const a of [-0.35, 0.35]) box(d, a - 0.28, 0.22, 0.56, 0.03, 0.36, 0.8, '#111', GLOW(a < 0 ? '#26c6da' : '#66bb6a', 0.7))
    chair(g, W / 2, D - 1.1, FACE.s, '#37474f')
    const up = nm(grp(g, 0.35, D - 0.4), 'UPS 不斷電系統'); box(up, -0.25, -0.25, 0.5, 0.5, 1.0, 0, '#37474f')
    mini(g, 0.35, D - 0.4, 'dongmen', 1.0) // UPS 上的新竹東門城模型
  },
  // 臺中：中控室（台中火力發電廠、中部科學園區）。北牆一排伺服器機櫃（深一點的房間再加一排）、東牆備用柴油發電機、西牆配電盤＋UPS、南邊控制台面對監控螢幕牆
  control(g, W, D) {
    const rack = (x, z, rot) => {
      const r = grp(g, x, z, rot); box(r, -0.3, -0.5, 0.6, 1, 2.1, 0, '#263238', { metalness: 0.6, roughness: 0.35 })
      for (let i = 0; i < 9; i++) box(r, -0.26, 0.5, 0.52, 0.02, 0.05, 0.2 + i * 0.2, i % 3 ? '#29b6f6' : '#00e676', GLOW(i % 3 ? '#29b6f6' : '#00e676'))
    }
    const genW = 1.3 // 發電機佔東牆的寬度
    const n = Math.floor((W - genW - 1.4) / 0.62)
    for (let i = 0; i < n; i++) rack(1.2 + i * 0.62, 0.55, FACE.s)
    if (D >= 5.5) for (let i = 0; i < n; i++) rack(1.2 + i * 0.62, 2.6, FACE.n)
    // 備用發電機（柴油）：沿東牆擺，排氣管往上接到天花板
    const ge = nm(grp(g, W - 0.7, Math.min(D - 1.2, 1.6), FACE.w), '備用發電機'); box(ge, -1.0, -0.55, 2.0, 1.1, 1.3, 0, '#fbc02d', { metalness: 0.4, roughness: 0.4 })
    box(ge, -1.05, -0.6, 2.1, 1.2, 0.12, 0, '#424242'); for (let i = 0; i < 5; i++) box(ge, -0.8 + i * 0.35, 0.56, 0.2, 0.02, 0.8, 0.25, '#333')
    cyl(ge, 0.6, 0, 0.1, TOP - 1.3, 1.3, '#9e9e9e', { metalness: 0.8 }); ball(ge, -0.5, 1.45, 0.3, 0.08, '#e53935', GLOW('#ff1744', 0.8))
    // 配電盤、UPS：西牆
    const pb = nm(grp(g, 0.18, 1.0, FACE.e), '配電盤'); box(pb, -0.6, -0.15, 1.2, 0.3, 1.9, 0, '#cfd8dc', { metalness: 0.5 }); for (let i = 0; i < 6; i++) ball(pb, -0.5 + i * 0.2, 1.5, 0.16, 0.04, i % 2 ? '#43a047' : '#e53935', GLOW(i % 2 ? '#43a047' : '#e53935'))
    const up = nm(grp(g, 0.35, D - 0.6, FACE.e), 'UPS 不斷電系統'); box(up, -0.35, -0.3, 0.7, 0.6, 1.1, 0, '#37474f')
    // 控制台：南邊三段桌面朝北看伺服器，螢幕牆掛在南牆
    const cx = (W - genW) / 2 + 0.3, cz = D - 1.4
    for (let i = -1; i <= 1; i++) { const d = grp(g, cx + i * 1.0, cz, FACE.n + i * 0.2); box(d, -0.5, -0.35, 1, 0.7, 0.75, 0, '#eceff1'); box(d, -0.35, -0.3, 0.7, 0.04, 0.4, 0.8, '#111', GLOW('#4fc3f7', 0.8)) }
    for (const i of [-0.5, 0.5]) chair(g, cx + i * 1.0, cz - 0.75, FACE.s, '#37474f')
    const vw = grp(g, cx, D - 0.05, FACE.n); for (let r = 0; r < 2; r++) for (let c = -1; c <= 1; c++) box(vw, c * 0.85 - 0.4, -0.03, 0.8, 0.03, 0.45, 1.2 + r * 0.5, '#0d1b2a', GLOW(['#26c6da', '#66bb6a', '#ffa726'][(r + c + 3) % 3], 0.5))
  },
  // 彰化：兒童房（附衛浴，兩個小孩）。上下鋪＋溜滑梯、八卦山大佛擺飾、兩張書桌、繪本架、玩具櫃；
  //   遊戲毯上一組扇形車庫的玩具火車（彰化扇形車庫：轉車台＋一格格車庫）、積木、木馬、帳篷、懶骨頭；天花板星星吊飾、身高尺
  kids(g, W, D, ctx) {
    // 附屬衛浴在靠走廊的東北角時，北牆那一段只到衛浴的西牆（x1）
    const x0 = ctx.wc && ctx.wc[0] < W / 2 ? ctx.wc[0] + ctx.wc[2] : 0, x1 = ctx.wc && ctx.wc[0] >= W / 2 ? ctx.wc[0] : W
    const bk = nm(grp(g, x0 + 1.2, 0.2, FACE.s), '上下鋪（附溜滑梯）')
    for (const y of [0, 1.3]) { box(bk, -0.5, 0, 1, 2, 0.15, 0.3 + y, '#fff8e1'); box(bk, -0.48, 0.6, 0.96, 1.35, 0.06, 0.45 + y, y ? '#f48fb1' : '#64b5f6') }
    for (const [a, b] of [[-0.52, 0], [0.47, 0], [-0.52, 1.95], [0.47, 1.95]]) box(bk, a, b, 0.05, 0.05, 2.1, 0, '#ffb74d')
    for (let k = 0; k < 4; k++) box(bk, 0.5, 1.2, 0.03, 0.4, 0.04, 0.4 + k * 0.4, '#ffb74d')
    for (const [dx, w, h] of [[0, 0.5, 0.04], [-0.25, 0.03, 0.14], [0.25, 0.03, 0.14]]) { const sd = add(bk, new THREE.BoxGeometry(w, h, 2.0), '#ff7043', {}, -0.3 + dx, 0.85 + h / 2, 2.66); sd.rotation.x = 0.85 } // 上鋪的溜滑梯（往南滑下來）
    const bd = nm(grp(g, x1 < W ? x1 - 1.8 : W - 1.0, 1.1), '八卦山大佛擺飾') // 衛浴門在它東邊，留出門口
    box(bd, -0.35, -0.3, 0.7, 0.6, 0.6, 0, '#8d6e63') // 矮櫃上放一座 60 cm 的大佛擺飾
    cyl(bd, 0, 0, 0.2, 0.1, 0.6, '#8d8d8d'); ball(bd, 0, 0.86, 0, 0.18, '#78909c', { metalness: 0.2 }); ball(bd, 0, 1.1, 0, 0.1, '#78909c', { metalness: 0.2 })
    for (const d of [desk(g, W - 1.0, D - 0.6, 1.2, FACE.n), desk(g, W - 2.35, D - 0.6, 1.2, FACE.n, false)]) d.scale.y = 0.8 // 兒童書桌：桌面 60 cm、椅面 36 cm
    const ts = nm(grp(g, x0 + 0.9, D - 0.3, FACE.n), '玩具櫃'); box(ts, -0.7, -0.2, 1.4, 0.4, 0.9, 0, '#fff8e1'); ['#e53935', '#fdd835', '#1e88e5', '#43a047'].forEach((c, k) => box(ts, -0.6 + k * 0.32, -0.15, 0.25, 0.3, 0.25, 0.9, c))
    const bs = nm(grp(g, 0.22, 3.95, FACE.e), '繪本架'); box(bs, -0.6, -0.15, 1.2, 0.3, 0.7, 0, '#ffe0b2'); for (let k = 0; k < 9; k++) box(bs, -0.55 + k * 0.12, -0.05, 0.1, 0.02, 0.25, 0.4 + (k % 2) * 0.02, ['#e57373', '#64b5f6', '#81c784', '#ffd54f', '#ba68c8'][k % 5]) // 繪本架（封面朝外）
    const rx = x0 + (W - x0) / 2 - 0.3, rz = D * 0.52
    rug(g, rx, rz, 2.6, 2.4, '#ffe082', '#ff8a65')
    // 彰化扇形車庫的玩具：半圓轉車台、放射狀軌道、一格格紅磚車庫、小火車
    const rh = nm(grp(g, rx - 0.3, rz - 0.3, 0, 'fixed'), '彰化扇形車庫玩具火車')
    cyl(rh, 0, 0, 0.28, 0.03, 0.02, '#9e9e9e'); box(rh, -0.25, -0.03, 0.5, 0.06, 0.02, 0.05, '#5d4037')
    for (let k = 0; k < 6; k++) {
      const a = Math.PI * (0.1 + k * 0.16), c = nm(grp(rh, Math.cos(a) * 0.55, -Math.sin(a) * 0.55, Math.PI / 2 - a), '玩具車庫')
      box(c, -0.09, -0.15, 0.18, 0.3, 0.16, 0.02, '#b5653d'); box(c, -0.1, -0.16, 0.2, 0.32, 0.03, 0.18, '#5d4037'); box(c, -0.02, -0.4, 0.04, 0.25, 0.01, 0.02, '#795548')
      if (k % 2 === 0) box(c, -0.05, -0.12, 0.1, 0.22, 0.09, 0.03, ['#212121', '#1565c0', '#c62828'][k / 2])
    }
    const bl = nm(grp(g, rx + 0.7, rz + 0.6), '積木'); ['#e53935', '#fdd835', '#1e88e5', '#43a047', '#ff7043'].forEach((c, k) => box(bl, -0.5 + k * 0.22, -0.1 + (k % 2) * 0.25, 0.18, 0.18, 0.18, 0.02 + (k === 2 ? 0.18 : 0), c))
    const rhs = nm(grp(g, W - 1.3, D * 0.62, FACE.w), '木馬'); for (const s2 of [-1, 1]) { const r2 = add(rhs, new THREE.TorusGeometry(0.45, 0.025, 6, 16, Math.PI / 2), '#8d6e63', {}, s2 * 0.12, 0.45, 0); r2.rotation.set(0, Math.PI / 2, Math.PI * 1.25) }
    box(rhs, -0.15, -0.35, 0.3, 0.7, 0.25, 0.45, '#ffcc80'); ball(rhs, 0, 0.85, 0.35, 0.13, '#ffcc80'); box(rhs, -0.03, 0.28, 0.06, 0.1, 0.25, 0.7, '#6d4c41') // 木馬
    const tp = nm(grp(g, 1.0, D - 1.9), '帳篷'); add(tp, new THREE.ConeGeometry(0.7, 1.6, 6), '#fff3e0', {}, 0, 0.8, 0); add(tp, new THREE.ConeGeometry(0.72, 0.4, 6), '#4fc3f7', {}, 0, 1.4, 0)
    ball(g, W - 2.4, 0.27, D * 0.62, 0.38, '#ab47bc', { roughness: 0.9 }).scale.y = 0.7 // 懶骨頭（ball 的參數是 x, y, z）
    ball(g, x0 + 1.2, 0.95, 1.6, 0.18, '#a1887f') // 泰迪熊
    const hc = nm(grp(g, W - 0.05, x1 < W ? 5.0 : 1.4, FACE.w, 'fixed'), '身高尺'); box(hc, -0.12, -0.01, 0.24, 0.01, 1.6, 0.2, '#fff176'); for (let k = 0; k < 8; k++) box(hc, -0.12, -0.012, 0.1, 0.005, 0.01, 0.3 + k * 0.2, '#e65100') // 身高尺
    const mb = nm(grp(g, rx, rz, 0, 'hang'), '星星吊飾'); cyl(mb, 0, 0, 0.004, 0.5, TOP - 0.5, '#bdbdbd'); add(mb, new THREE.TorusGeometry(0.35, 0.01, 4, 20), '#bdbdbd', {}, 0, TOP - 0.5, 0).rotation.x = Math.PI / 2
    for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; add(mb, new THREE.OctahedronGeometry(0.07), k % 2 ? '#fff176' : '#90caf9', GLOW(k % 2 ? '#ffeb3b' : '#64b5f6', 0.6), Math.cos(a) * 0.35, TOP - 0.75 - (k % 3) * 0.08, Math.sin(a) * 0.35) } // 星星吊飾
  },
  // 雲林：溫室菜園（往西凸出房子外面，三面玻璃＋玻璃屋頂）。北邊番茄藤架菜圃、盆栽工作台；南邊葉菜菜圃；
  //   中間走道接兩邊的門，走道上一座紅色鋼桁架拱門（西螺大橋），還有育苗架、水耕塔、手推車、西瓜，四個角落果樹盆、天花板吊盆
  greenhouse(g, W, D) {
    const bed = (x, z, len, crops) => {
      const b2 = nm(grp(g, x, z + 0.5), '架高菜圃'); box(b2, -len / 2, -0.5, len, 1, 0.5, 0, '#6d4c41'); box(b2, -len / 2 + 0.05, -0.45, len - 0.1, 0.9, 0.05, 0.47, '#4e342e', { roughness: 1 })
      for (let i = 0; i < Math.floor(len / 0.4); i++) for (const r of [-0.22, 0.22]) ball(b2, -len / 2 + 0.22 + i * 0.4, 0.62, r, 0.15, crops[(i * 2 + (r > 0 ? 1 : 0)) % crops.length])
      return b2
    }
    // 北邊：番茄菜圃＋後面的藤架（綠葉、紅番茄）
    const tl = Math.min(5.2, W - 4.4), tx = 1.2 + tl / 2
    const tm = bed(tx, 0.25, tl, ['#66bb6a', '#4caf50'])
    for (let k = 0; k <= Math.round(tl / 1.2); k++) box(tm, -tl / 2 + 0.1 + k * ((tl - 0.2) / Math.round(tl / 1.2)) - 0.02, -0.42, 0.04, 0.04, 1.4, 0.5, '#8d6e63')
    box(tm, -tl / 2 + 0.1, -0.42, tl - 0.2, 0.04, 0.04, 1.85, '#8d6e63')
    for (let k = 0; k < Math.floor(tl / 0.3); k++) { const ux = -tl / 2 + 0.2 + k * 0.3; ball(tm, ux, 0.9 + (k % 3) * 0.3, -0.38, 0.17, '#388e3c'); ball(tm, ux + 0.08, 0.8 + ((k + 1) % 3) * 0.3, -0.25, 0.05, '#e53935') }
    // 盆栽工作台（北牆）：小盆栽、澆水壺
    const pb = nm(grp(g, tx + tl / 2 + 1.3, 0.35), '盆栽工作台'); box(pb, -0.9, -0.3, 1.8, 0.6, 0.85, 0, '#a1887f'); box(pb, -0.9, -0.3, 1.8, 0.6, 0.04, 0.85, '#6d4c41')
    for (let k = 0; k < 5; k++) { cyl(pb, -0.7 + k * 0.28, 0, 0.08, 0.12, 0.89, '#d84315', {}, 0.1); ball(pb, -0.7 + k * 0.28, 1.08, 0, 0.09, '#81c784') }
    cyl(pb, 0.75, 0.05, 0.1, 0.22, 0.89, '#43a047'); const sp = cyl(pb, 0.6, 0.05, 0.015, 0.25, 1.0, '#43a047'); sp.rotation.z = 1.0 // 澆水壺
    // 南邊：葉菜菜圃（高麗菜、紫高麗、萵苣、紅蘿蔔葉）
    bed(W / 2, D - 1.25, W - 2.4, ['#aed581', '#7e57c2', '#c5e1a5', '#558b2f', '#9ccc65'])
    // 西螺大橋：走道上一座紅色鋼桁架拱門，上面爬著藤蔓
    const hz = D / 2 - 1.4, RED = '#c62828', ST = { metalness: 0.4, roughness: 0.5 }
    const tr = nm(grp(g, Math.min(3.2, W * 0.32), D / 2, 0, 'fixed'), '西螺大橋拱門')
    for (const s2 of [-1, 1]) {
      const zz = s2 * hz - 0.03
      for (const x of [-0.9, -0.3, 0.3, 0.9]) box(tr, x - 0.04, zz - 0.01, 0.08, 0.08, x === -0.9 || x === 0.9 ? 2.25 : 1.05, x === -0.9 || x === 0.9 ? 0 : 1.2, RED, ST)
      for (const y of [1.2, 2.2]) box(tr, -0.94, zz - 0.01, 1.88, 0.08, 0.06, y, RED, ST)
      for (let k = 0; k < 3; k++) { const d = add(tr, new THREE.BoxGeometry(0.04, Math.hypot(0.6, 1.0), 0.04), RED, ST, -0.6 + k * 0.6, 1.7, zz + 0.03); d.rotation.z = (k % 2 ? 1 : -1) * Math.atan2(0.6, 1.0) }
    }
    for (const x of [-0.9, -0.3, 0.3, 0.9]) box(tr, x - 0.03, -hz, 0.06, 2 * hz, 0.06, 2.22, RED, ST) // 上面的橫樑
    for (let k = 0; k < 14; k++) ball(tr, -0.9 + (k % 7) * 0.3, 2.3, (k < 7 ? -1 : 1) * hz * (0.3 + (k % 3) * 0.3), 0.13, k % 4 ? '#43a047' : '#7cb342')
    // 走道上：育苗架（三層苗盤）、兩座水耕塔、手推車、西瓜
    const nr = nm(grp(g, W * 0.52, 1.75), '育苗架'); for (let k = 0; k < 3; k++) { box(nr, -0.7, -0.22, 1.4, 0.44, 0.03, 0.4 + k * 0.45, '#b0bec5', { metalness: 0.5 }); for (let i = 0; i < 6; i++) ball(nr, -0.58 + i * 0.23, 0.47 + k * 0.45, 0, 0.06, '#9ccc65') }
    for (const z of [-0.2, 0.2]) for (const x of [-0.68, 0.68]) box(nr, x, z, 0.03, 0.03, 1.4, 0, '#90a4ae')
    for (const z of [1.9, D - 1.9]) { const ht = nm(grp(g, W - 2.6, z), '水耕塔'); cyl(ht, 0, 0, 0.25, 0.25, 0, '#eceff1'); cyl(ht, 0, 0, 0.1, 1.6, 0.25, '#fafafa'); for (let k = 0; k < 12; k++) ball(ht, Math.cos(k * 1.9) * 0.12, 0.45 + k * 0.11, Math.sin(k * 1.9) * 0.12, 0.08, k % 3 ? '#8bc34a' : '#c5e1a5') }
    const wb = nm(grp(g, W * 0.55, D - 1.85, 0.4), '手推車'); box(wb, -0.35, -0.25, 0.7, 0.5, 0.25, 0.3, '#2e7d32', { metalness: 0.3 }); box(wb, -0.3, -0.2, 0.6, 0.4, 0.05, 0.52, '#4e342e'); const wh = cyl(wb, 0.45, 0, 0.15, 0.06, 0, '#212121'); wh.rotation.x = Math.PI / 2; wh.position.set(0.45, 0.15, 0); for (const z of [-0.2, 0.2]) box(wb, -0.75, z - 0.02, 0.45, 0.04, 0.04, 0.45, '#8d6e63')
    for (const [x, z, r] of [[1.5, D - 1.8, 0.2], [1.9, D - 1.65, 0.17], [1.3, 1.75, 0.16]]) { const m = ball(g, x, r * 0.8, z, r, '#2e7d32'); m.scale.set(1.25, 0.85, 1) } // 西瓜
    for (const [x, z] of [[0.6, 0.6], [W - 0.6, 0.6], [0.6, D - 0.6], [W - 0.6, D - 0.6]]) { const t = nm(grp(g, x, z), '大盆栽'); cyl(t, 0, 0, 0.25, 0.4, 0, '#a1887f'); cyl(t, 0, 0, 0.04, 0.6, 0.4, '#5d4037'); ball(t, 0, 1.25, 0, 0.4, '#43a047'); for (let f = 0; f < 5; f++) ball(t, Math.cos(f) * 0.32, 1.15 + (f % 2) * 0.15, Math.sin(f) * 0.32, 0.06, '#ffb300') }
    const hp = nm(grp(g, 0, 0, 0, 'hang'), '天花板吊盆') // 天花板吊盆
    for (const [x, z] of [[W * 0.5, D / 2 - 0.8], [W * 0.72, D / 2 + 0.8], [W * 0.88, D / 2 - 0.8]]) { cyl(hp, x, z, 0.005, 0.7, TOP - 0.7, '#5d4037'); cyl(hp, x, z, 0.16, 0.18, TOP - 0.88, '#8d6e63', {}, 0.2); ball(hp, x, TOP - 0.95, z, 0.2, '#66bb6a') }
  },
  // 南投：中庭（露天）。日月潭（拉魯島）、假山「玉山」（疊石、山頂積雪、登山步道）、一排櫻花樹（武陵、霧社的櫻花）、長椅、石燈籠
  court(g, W, D) {
    // 日月潭在北、玉山在南（照真的地理：玉山在日月潭的東南邊）
    // 日月潭（可愛版）：OpenStreetMap 真的湖岸線（sml.js）抽稀再磨圓，保留日潭、月潭的輪廓；
    //   粉嫩的藍綠色湖水、白色圓潤湖岸、放大的拉魯島（小樹＋白色小涼亭）、慈恩塔、湖上一艘小船、幾片荷葉
    const lx = W * 0.55, lz = D * 0.32, sx = Math.min(W * 0.2, D * 0.16), sz = sx // 日月潭縮小一點，中庭留多一點草地
    let pts = SML.filter((_, i) => i % 5 === 0) // 抽得更稀、磨更圓：胖胖的日潭、彎彎的月潭
    for (let it = 0; it < 4; it++) pts = pts.flatMap(([x0, z0], i) => { const [x1, z1] = pts[(i + 1) % pts.length]; return [[0.75 * x0 + 0.25 * x1, 0.75 * z0 + 0.25 * z1], [0.25 * x0 + 0.75 * x1, 0.25 * z0 + 0.75 * z1]] }) // Chaikin 磨圓
    const lakeShape = (grow) => new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x * (sx + grow), -(z * (sz + grow)))))
    for (const [grow, col, h, o] of [[0.36, '#fff6ee', 0.2, { roughness: 0.5 }], [0, '#6fdcef', 0.22, { roughness: 0.05, transparent: true, opacity: 0.95 }]]) {
      const m = new THREE.Mesh(new THREE.ExtrudeGeometry(lakeShape(grow), { depth: h, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 3 }).rotateX(-Math.PI / 2), mat(col, o))
      m.position.set(lx, 0, lz); m.receiveShadow = true; m.userData.kind = 'fixed'
      m.userData.poly = pts.map(([x, z]) => [lx + x * (sx + grow), lz + z * (sz + grow)]) // 2D 平面圖照這個形狀畫
      g.add(m)
    }
    // 拉魯島：放大一點才看得到，草地小丘＋一棵圓樹＋白色小涼亭
    const isl = nm(grp(g, lx + LALU[0] * sx, lz + LALU[1] * sz, 0, 'fixed'), '拉魯島')
    add(isl, new THREE.SphereGeometry(0.32, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), '#8bd36b', {}, 0, 0.15, 0)
    cyl(isl, 0.1, 0.05, 0.03, 0.3, 0.3, '#8d6e63'); ball(isl, 0.1, 0.62, 0.05, 0.16, '#4caf50')
    for (const [a2, b2] of [[-0.12, -0.12], [-0.12, 0.04], [0.02, -0.12]]) cyl(isl, a2, b2, 0.015, 0.22, 0.32, '#ffffff')
    add(isl, new THREE.ConeGeometry(0.16, 0.12, 6), '#e57373', {}, -0.06, 0.6, -0.05)
    // 慈恩塔：湖南岸小山上一座八角小塔（白身紅頂，一層層變小）
    const tw = nm(grp(g, lx + 0.15 * sx, lz + 1.12 * sz, 0, 'fixed'), '慈恩塔')
    add(tw, new THREE.SphereGeometry(0.45, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), '#7cc576', {}, 0, 0, 0)
    for (let k = 0; k < 5; k++) { cyl(tw, 0, 0, 0.13 - k * 0.018, 0.16, 0.4 + k * 0.2, '#fffaf0', {}, 0.12 - k * 0.018, 8); add(tw, new THREE.ConeGeometry(0.19 - k * 0.022, 0.06, 8), '#d84343', {}, 0, 0.59 + k * 0.2, 0) }
    add(tw, new THREE.ConeGeometry(0.05, 0.18, 8), '#c9a227', GOLD, 0, 1.5, 0)
    // 小船（水社碼頭出發）：白船身、紅篷
    const bt = nm(grp(g, lx + 0.35 * sx, lz + 0.3 * sz, 0.6, 'fixed'), '小船')
    box(bt, -0.2, -0.08, 0.4, 0.16, 0.08, 0.17, '#ffffff'); box(bt, -0.08, -0.07, 0.16, 0.14, 0.08, 0.25, '#e57373')
    const pier = nm(grp(g, lx + 0.62 * sx, lz + 0.05 * sz, 0, 'fixed'), '碼頭'); box(pier, 0, -0.12, 0.6, 0.24, 0.05, 0.2, '#c49a6c') // 碼頭（水社）
    // 荷葉＋粉紅小花
    for (const [px, pz] of [[-0.55, 0.45], [-0.35, 0.6], [0.45, -0.35], [0.3, -0.55], [-0.75, -0.3]]) {
      const lp = nm(grp(g, lx + px * sx, lz + pz * sz, 0, 'fixed'), '荷葉'); cyl(lp, 0, 0, 0.18, 0.015, 0.23, '#7bd26b'); ball(lp, 0.06, 0.28, 0.03, 0.06, '#ff9fc4'); ball(lp, 0.06, 0.32, 0.03, 0.035, '#fff59d')
    }
    // 小黃鴨三隻（一大兩小排成一列）
    for (const [i, [px, pz, k]] of [[0.1, 0.55, 1], [0.0, 0.68, 0.7], [-0.08, 0.8, 0.7]].entries()) {
      const dk = nm(grp(g, lx + px * sx, lz + pz * sz, -0.4, 'fixed'), '小黃鴨'); const r = 0.1 * k
      ball(dk, 0, 0.26 + r * 0.6, 0, r, '#ffe14d'); ball(dk, 0, 0.26 + r * 1.6, -r * 0.6, r * 0.65, '#ffe14d'); add(dk, new THREE.ConeGeometry(r * 0.3, r * 0.5, 8), '#ff8a3d', {}, 0, 0.26 + r * 1.55, -r * 1.25).rotation.x = -Math.PI / 2
      for (const e of [-1, 1]) ball(dk, e * r * 0.3, 0.26 + r * 1.75, -r * 1.05, r * 0.1, '#222')
      void i
    }
    // 湖邊一圈小花叢（粉紅、白、黃）
    for (let i = 0; i < pts.length; i += Math.ceil(pts.length / 14)) {
      const [px, pz] = pts[i], f = nm(grp(g, lx + px * (sx + 0.55), lz + pz * (sz + 0.55), 0, 'fixed'), '花叢')
      for (let k = 0; k < 3; k++) ball(f, Math.cos(k * 2.1) * 0.08, 0.12, Math.sin(k * 2.1) * 0.08, 0.07, ['#ff9fc4', '#ffffff', '#ffe14d'][(i + k) % 3])
    }
    // 假山：一堆不規則的石頭疊成山，主峰 2.6 m，頂上一點白雪，旁邊一條踏石登山步道
    const mt = nm(grp(g, W * 0.4, D * 0.72, 0, 'fixed'), '假山玉山')
    const rocks = [[0, 0, 1.6, 1.2], [0.9, 0.4, 1.0, 0.9], [-0.9, 0.5, 1.1, 0.8], [0.3, -0.8, 0.9, 0.7], [-0.4, 0.9, 0.8, 0.6], [0.1, 0.1, 1.1, 2.0], [0.2, 0, 0.6, 2.6]]
    rocks.forEach(([x, z, r, h], i) => { const c = add(mt, new THREE.ConeGeometry(r, h, 7), ['#7d8077', '#8a8c82', '#6f7269', '#94968c'][i % 4], { roughness: 1, flatShading: true }, x, h / 2, z); c.rotation.y = i * 0.9 })
    add(mt, new THREE.ConeGeometry(0.28, 0.42, 7), '#ffffff', { roughness: 0.9, flatShading: true }, 0.2, 2.42, 0)
    for (let i = 0; i < 7; i++) { const a = -1.2 + i * 0.45; cyl(mt, Math.cos(a) * (1.9 - i * 0.18), Math.sin(a) * (1.9 - i * 0.18), 0.16, 0.06, 0.06 + i * 0.22, '#d8cfbf') }
    for (let i = 0; i < 5; i++) { const b2 = nm(grp(mt, -1.6 + i * 0.4, 1.3 - (i % 2) * 0.3), '小松樹'); cyl(b2, 0, 0, 0.03, 0.4, 0, '#5d4037'); add(b2, new THREE.ConeGeometry(0.25, 0.6, 8), '#2e5e2a', {}, 0, 0.6, 0) } // 山腳的小松樹
    // 櫻花樹：南邊、西邊各一排，樹幹深色、樹冠粉紅（花瓣落在草地上）
    const sakura = (x, z, s2 = 1) => {
      const o = nm(grp(g, x, z), '櫻花樹')
      const t = cyl(o, 0, 0, 0.1 * s2, 1.6 * s2, 0, '#4e342e', {}, 0.07 * s2); t.rotation.z = 0.08
      for (const [dx, dy, dz, r] of [[0, 2.0, 0, 0.8], [0.5, 1.8, 0.2, 0.55], [-0.5, 1.85, -0.1, 0.6], [0.1, 2.3, 0.4, 0.5]]) ball(o, dx * s2, dy * s2, dz * s2, r * s2, '#f8bbd0', { roughness: 0.9 })
      for (let i = 0; i < 6; i++) { const pt = box(o, Math.cos(i) * 0.9 - 0.04, Math.sin(i * 1.7) * 0.9 - 0.04, 0.08, 0.08, 0.01, 0.01, '#f48fb1'); pt.rotation.y = i }
    }
    for (let x = W * 0.66; x < W - 0.9; x += 1.9) sakura(x, D - 1.1, 0.85 + ((x * 7) % 3) * 0.06) // 南排櫻花種在玉山的東邊
    for (let z = 1.2; z < D * 0.42; z += 2.2) sakura(1.0, z, 0.8) // 西排櫻花種在日月潭西邊
    for (const [x, z] of [[W * 0.55, D * 0.56], [W * 0.82, D * 0.62]]) { const b2 = nm(grp(g, x, z), '櫻花樹'); box(b2, -0.8, -0.22, 1.6, 0.44, 0.06, 0.42, '#a1887f'); for (const a of [-0.7, 0.6]) box(b2, a, -0.2, 0.1, 0.4, 0.42, 0, '#5d4037') }
    const la = nm(grp(g, W * 0.12, D * 0.38), '石燈籠'); cyl(la, 0, 0, 0.22, 0.3, 0, '#9e9e9e'); box(la, -0.18, -0.18, 0.36, 0.36, 0.3, 0.45, '#bdbdbd'); ball(la, 0, 0.6, 0, 0.08, '#fff3c4', GLOW('#ffcc66')); add(la, new THREE.ConeGeometry(0.32, 0.22, 4), '#9e9e9e', {}, 0, 0.86, 0)
  },
  // 嘉義縣：餐廳。8 人餐桌，阿里山小火車在桌上繞圈送雞肉飯；兩盞水晶燈、餐具櫃、展示櫃；南邊跟廚房打通
  dining(g, W, D, ctx) {
    // 化妝室隔在東北角時，餐桌放在它南邊那一塊，餐具櫃靠北牆西半邊
    const e = ctx.enclave, top = e ? e[1] + e[3] : 0
    const cx = W / 2 - 0.2, cz = top + (D - top) * 0.5, L = Math.min(W - 3.4, 2.8) // 8 人座：兩邊各 3、兩頭各 1
    rug(g, cx, cz, L + 1.8, Math.min(3, (D - top) - 0.3), '#7b2d26')
    diningTable(g, cx, cz, L, 1.1, '#8d6e63', 3)
    const tr = nm(grp(g, cx, cz), '阿里山小火車（送雞肉飯）')
    const ring = new THREE.CatmullRomCurve3([[-L / 2 + 0.3, -0.3], [L / 2 - 0.3, -0.3], [L / 2 - 0.3, 0.3], [-L / 2 + 0.3, 0.3]].map(([x, z]) => new THREE.Vector3(x, 0.8, z)), true, 'catmullrom', 0.1)
    add(tr, new THREE.TubeGeometry(ring, 120, 0.012, 5, true), '#5d4037', {}, 0, 0, 0).castShadow = false
    for (let k = 0; k < 6; k++) {
      const t = 0.03 + k * 0.025, p0 = ring.getPointAt(t), p1 = ring.getPointAt(t + 0.005)
      const c = box(tr, -0.09, -0.05, 0.18, 0.1, 0.09, 0, k ? '#c62828' : '#212121'); c.position.set(p0.x, 0.83, p0.z); c.rotation.y = -Math.atan2(p1.z - p0.z, p1.x - p0.x)
      if (k) cyl(tr, p0.x, p0.z, 0.05, 0.04, 0.88, '#ffffff')
    }
    for (let k = 0; k < 6; k++) cyl(tr, -L / 2 + 0.5 + k * ((L - 1) / 5), 0, 0.12, 0.03, 0.78, '#fafafa')
    chandelier(g, cx - L / 4, cz, 0.5); chandelier(g, cx + L / 4, cz, 0.5)
    const sbx = e ? (1.4 + e[0]) / 2 : W / 2 // 餐具櫃：北牆，樓梯和化妝室中間
    const sb = nm(grp(g, sbx, 0.3, FACE.s), '餐具櫃'); box(sb, -1.2, -0.25, 2.4, 0.5, 0.9, 0, '#5d4037'); cyl(sb, -0.7, 0, 0.12, 0.4, 0.9, '#efe6d8'); cyl(sb, 0.7, 0, 0.12, 0.4, 0.9, '#5d7a8c')
    const c = nm(grp(g, e ? e[0] + e[2] / 2 : W - 1.2, top + 0.3, FACE.s), '展示櫃'); box(c, -0.7, -0.22, 1.4, 0.44, 2.1, 0, '#4e342e'); // 展示櫃靠化妝室的南牆（東邊對走廊、南邊對廚房都打通，西牆是樓梯）
    for (let r = 0; r < 4; r++) for (let k = 0; k < 3; k++) cyl(c, -0.45 + k * 0.45, 0.05, 0.12, 0.02, 0.4 + r * 0.42, '#fafafa')
    roofStair(g)
  },
  // 嘉義市：化妝室（2.2 × 2.3 m）。馬桶、洗手台、毛巾架、小盆栽
  bath(g, W, D) {
    // 門在東牆（走廊），洗手台靠北牆、馬桶靠西牆、毛巾架在南牆
    vanity(g, 0.65, 0.28, 0.9, FACE.s); mini(g, 1.0, 0.25, 'chicken', 0.89) // 洗手台上的嘉義噴水雞
    toilet(g, 0.4, D - 0.55, FACE.e)
    plant(g, W - 0.35, 0.35, 0.8) // 東北角一盆綠植
    const tw = nm(grp(g, 1.6, D - 0.05, FACE.n), '毛巾架'); box(tw, -0.25, -0.03, 0.5, 0.06, 0.03, 1.2, '#c9a227', GOLD); box(tw, -0.2, -0.02, 0.4, 0.04, 0.45, 0.75, '#ffffff')
  },
  // 附屬衛浴（乾濕分離）：乾區馬桶、洗手台；濕區浴缸＋淋浴，中間玻璃隔間
  wc(g, W, D) {
    // 乾濕分離（門在南牆西段）：西半是乾區（馬桶、洗手台、毛巾架），東半 1 m 是濕區（浴缸＋淋浴），中間一道到 2 m 高的玻璃隔間＋玻璃門、地上一道止水條
    const wx = W - 1.0
    toilet(g, 0.45, 0.3, FACE.s)
    vanity(g, wx - 0.45, 0.28, 0.7, FACE.s)
    const tw = nm(grp(g, 0.05, D - 0.6, FACE.e), '毛巾架'); box(tw, -0.25, -0.03, 0.5, 0.06, 0.03, 1.2, '#c9a227', GOLD); box(tw, -0.2, -0.02, 0.4, 0.04, 0.45, 0.75, '#ffffff') // 毛巾架
    const wet = nm(grp(g, wx, 0, 0, 'fixed'), '淋浴間＋浴缸（濕區）')
    box(wet, 0.02, 0, W - wx - 0.02, D, 0.02, 0, '#78909c', { roughness: 0.8 }) // 濕區地磚（深一點、比較粗）
    box(wet, -0.02, 0, 0.04, D, 0.05, 0, '#9e9e9e') // 止水條
    box(wet, -0.015, 0, 0.03, D, 2.0, 0.05, '#9fd3f0', GLASS); box(wet, -0.025, 0, 0.05, D, 0.04, 2.05, '#90a4ae', { metalness: 0.8 }) // 玻璃隔間＋上框
    box(wet, -0.05, D - 0.75, 0.03, 0.03, 0.3, 1.0, '#cfd8dc', { metalness: 0.9 }) // 玻璃門把
    box(wet, 0.08, 0.05, W - wx - 0.13, 1.5, 0.55, 0, WHITE, { roughness: 0.2 }); box(wet, 0.15, 0.12, W - wx - 0.27, 1.36, 0.03, 0.5, '#a8e0e8', { transparent: true, opacity: 0.85 }) // 浴缸
    cyl(wet, (W - wx) / 2, D - 0.5, 0.15, 0.02, 2.1, '#cfd8dc', { metalness: 0.9 }); box(wet, W - wx - 0.06, D - 0.6, 0.04, 0.2, 0.3, 1.0, '#cfd8dc', { metalness: 0.9 }) // 頂噴花灑、龍頭
    box(wet, W - wx - 0.12, D - 1.25, 0.1, 0.4, 0.3, 1.2, '#efebe9') // 壁龕（沐浴乳）
  },
  // 臺南：廚房（開放式，北邊跟嘉義餐廳打通）。照一般豪宅開放式廚房：
  //   東牆（實牆）：北段儲藏高櫃＋爐台（四口爐、壁掛抽油煙機、牛肉湯鍋），南段雙門冰箱、烤箱蒸爐櫃；南牆西段落地窗下的水槽流理台（洗碗機、大同電鍋）；
  //   中間一座 3.6 m 中島當廚房和餐廳的分界（備料水槽、北側四張高腳椅、三盞吊燈、赤崁樓模型）；
  //   南牆東段是朝泳池的對外吧台：落地窗那段往外推開，裡面一段吧台（咖啡機、果汁機、杯子），外面木平台上一條吧台板＋三張高腳椅
  kitchen(g, W, D) {
    const tall = (z, w, kind) => {
      const o = nm(grp(g, 0.33, z, FACE.e), kind === 'fridge' ? '雙門冰箱' : kind === 'oven' ? '烤箱蒸爐櫃' : '儲藏高櫃')
      box(o, -w / 2, -0.32, w, 0.64, 2.3, 0, kind === 'fridge' ? '#cfd8dc' : '#c8a27a', kind === 'fridge' ? { metalness: 0.6, roughness: 0.25 } : {})
      if (kind === 'fridge') box(o, -0.01, 0.32, 0.02, 0.02, 2.0, 0.1, '#455a64')
      else if (kind === 'oven') for (const y of [0.85, 1.45]) box(o, -0.3, 0.32, 0.6, 0.02, 0.45, y, '#111', GLOW('#ff8a50', 0.3))
      else for (const x of [-w / 4, w / 4]) box(o, x - 0.01, 0.32, 0.02, 0.02, 0.5, 1.0, '#c9a227', GOLD)
    }
    // 東邊對西部走廊整面打通，高櫃靠西牆（後門北邊；北端留給餐廳樓梯的出口）：雙門冰箱、烤箱蒸爐櫃
    tall(1.4, 0.95, 'fridge'); tall(2.33, 0.9, 'oven')
    // 南牆（落地窗）：水槽、洗碗機、大同電鍋，沒有吊櫃
    const [p0, p1] = KITCHEN_PASS, x0 = 1.15, sl = p0 - 0.15 - x0, sc = x0 + sl / 2
    counter(g, sc, D - 0.32, sl, FACE.n, false)
    const sk = nm(grp(g, sc, D - 0.32, FACE.n, 'fixed'), '水槽')
    box(sk, -0.45, -0.2, 0.9, 0.45, 0.02, 0.91, '#b0bec5', { metalness: 0.8, roughness: 0.2 }); cyl(sk, 0, -0.25, 0.02, 0.32, 0.92, '#cfd8dc', { metalness: 0.9 })
    const ec = nm(grp(g, sc + 1.3, D - 0.32, FACE.n, 'fixed'), '大同電鍋'); cyl(ec, 0, 0, 0.15, 0.22, 0.92, '#eceff1'); cyl(ec, 0, 0, 0.12, 0.05, 1.14, '#c62828') // 大同電鍋
    const bd = nm(grp(g, sc - 1.6, D - 0.32, FACE.n, 'fixed'), '砧板'); box(bd, -0.25, -0.15, 0.5, 0.32, 0.03, 0.92, '#c8a27a'); for (const [x, c] of [[0.45, '#ffcc80'], [0.6, '#e57373'], [0.52, '#aed581']]) ball(bd, x - 0.5, 1.0, 0, 0.08, c)
    // 中島 3.6 × 1.3 m：廚房和餐廳的分界，高腳椅在北側（餐廳那邊）
    const ix = W / 2 - 0.4, iz = 2.0, is = nm(grp(g, ix, iz), '中島（爐台、赤崁樓模型）')
    box(is, -1.8, -0.65, 3.6, 1.3, 0.9, 0, '#2f4d6b'); box(is, -1.85, -0.7, 3.7, 1.4, 0.05, 0.9, '#f5f5f5', { roughness: 0.15 })
    box(is, -1.0, -0.5, 0.5, 0.4, 0.02, 0.94, '#b0bec5', { metalness: 0.8 }); box(is, -0.35, -0.5, 0.6, 0.4, 0.03, 0.95, '#c8a27a') // 備料水槽、砧板
    for (const [a, c] of [[0.45, '#ffcc80'], [0.6, '#e57373'], [0.53, '#aed581']]) ball(is, a, 1.03, -0.3, 0.09, c)
    // 爐台在中島東端（媽媽站南側煮），上面吊一座島型抽油煙機
    for (const [a, b] of [[1.15, 0], [1.55, 0], [1.15, 0.35], [1.55, 0.35]]) cyl(is, a, b, 0.1, 0.02, 0.92, '#212121', GLOW('#bf360c', 0.5))
    cyl(is, 1.15, 0, 0.16, 0.25, 0.94, '#90a4ae', { metalness: 0.8 }) // 牛肉湯鍋
    const hd = nm(grp(g, ix + 1.35, iz + 0.17, 0, 'hang'), '島型抽油煙機'); box(hd, -0.45, -0.3, 0.9, 0.6, 0.15, 1.8, '#9e9e9e', { metalness: 0.8 }); box(hd, -0.15, -0.15, 0.3, 0.3, TOP - 1.95, 1.95, '#9e9e9e', { metalness: 0.8 })
    mini(is, -1.55, 0.25, 'chihkan', 0.95) // 中島西端的台南赤崁樓模型
    for (let k = 0; k < 4; k++) stool(g, ix - 1.35 + k * 0.9, iz - 1.05)
    for (let k = -1; k <= 0; k++) { const l = nm(grp(g, ix + k * 1.1, iz, 0, 'hang'), '吊燈'); cyl(l, 0, 0, 0.005, TOP - 1.95, 1.95, '#212121'); cyl(l, 0, 0, 0.16, 0.18, 1.8, '#c9a227', GOLD, 0.05); ball(l, 0, 1.78, 0, 0.06, '#fff6d8', GLOW('#ffe9a8', 1.8)) }
    // 南牆東段：朝泳池的對外吧台（裡面一段吧台：咖啡機、果汁機、杯子；外面木平台上一條吧台板＋三張高腳椅，游完泳直接點飲料）
    const pl = Math.min(p1, W - 0.7) - p0, px = p0 + pl / 2
    const bar = counter(g, px, D - 0.32, pl, FACE.n, false)
    box(bar, -0.5, -0.2, 0.4, 0.35, 0.4, 0.92, '#212121', { metalness: 0.5 }); cyl(bar, -0.75, 0, 0.08, 0.35, 0.92, '#e1f5fe', { transparent: true, opacity: 0.7 }, 0.06)
    for (let i = 0; i < 4; i++) cyl(bar, 0.1 + i * 0.16, 0, 0.04, 0.1, 0.92, ['#fafafa', '#c62828', '#fafafa', '#1565c0'][i]) // 咖啡機、果汁機、杯子
    const ob = nm(grp(g, px, D + 0.4, 0, 'fixed'), '對外吧台'); box(ob, -pl / 2, -0.2, pl, 0.4, 0.05, 1.05, '#8a5a3b'); for (const a of [-pl / 2 + 0.1, pl / 2 - 0.16]) box(ob, a, -0.12, 0.06, 0.06, 1.05, 0, '#5d4037')
    for (let k = 0; k < 3; k++) { const os = nm(grp(g, px - 0.75 + k * 0.75, D + 0.95, 0, 'fixed'), '吧台高腳椅'); cyl(os, 0, 0, 0.03, 0.72, 0, '#424242', { metalness: 0.6 }); cyl(os, 0, 0, 0.2, 0.06, 0.72, '#8a5a3b') }
  },
  // 高雄：視聽室。短邊的牆是大銀幕（16:9，頂到天花板下 30 cm），一排一排階梯式電影躺椅面向銀幕；爆米花機、吸音牆、喇叭、吉他（流行音樂中心）
  theater(g, W, D) {
    const long = D >= W, L = long ? D : W, S = long ? W : D // 沿 L 排座位，銀幕在 L 的起點那面牆
    const at = (a, b) => (long ? [b, a] : [a, b]) // (沿長邊, 沿短邊) → (x, z)
    const face = long ? FACE.n : FACE.w, toScreen = long ? FACE.s : FACE.e
    const sh = Math.min(TOP - 0.3 - 0.5, (S - 1.8) * 9 / 16), sw = sh * 16 / 9
    const sc = nm(grp(g, ...at(0.15, S / 2), toScreen), '大銀幕（播高雄動畫）')
    box(sc, -sw / 2 - 0.08, -0.06, sw + 0.16, 0.04, sh + 0.16, 0.42, '#111'); box(sc, -sw / 2, -0.03, sw, 0.03, sh, 0.5, '#eef4ff', GLOW('#bcd4ff', 0.5))
    const film = kaohsiungFilm(); if (film) { const m = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), new THREE.MeshBasicMaterial({ map: film })); m.position.set(0, 0.5 + sh / 2, 0.003); m.userData.noPlan = true; m.userData.noBrick = true; sc.add(m) } // 銀幕播高雄的影片（樂高頁不蓋，銀幕是發光的白磚）
    for (const s2 of [-1, 1]) box(sc, s2 * (sw / 2 + 0.45) - 0.2, 0, 0.4, 0.4, 1.2, 0, '#212121')
    const gt = nm(grp(g, ...at(0.6, 0.6)), '吉他'); cyl(gt, 0, 0, 0.18, 0.06, 0, '#e65100'); box(gt, -0.02, -0.02, 0.04, 0.04, 0.6, 0.06, '#3e2723')
    const seats = Math.max(2, Math.floor((S - 1.6) / 0.9)), rows = Math.max(1, Math.floor((L - 3.6) / 1.5))
    for (let r = 0; r < rows; r++) {
      const a = 3.0 + r * 1.5, h = r * 0.2
      if (h) { const pl = nm(grp(g, ...at(a + 0.1, S / 2)), '階梯平台'); box(pl, ...(long ? [-S / 2 + 0.3, -0.75, S - 0.6, 1.5] : [-0.75, -S / 2 + 0.3, 1.5, S - 0.6]), h, 0, '#4a148c') }
      for (let k = 0; k < seats; k++) {
        const c = nm(grp(g, ...at(a, (S - seats * 0.9) / 2 + 0.45 + k * 0.9), face), '電影躺椅')
        box(c, -0.38, -0.45, 0.76, 0.9, 0.45, h, '#b71c1c'); box(c, -0.38, -0.45, 0.76, 0.2, 0.95, h, '#b71c1c') // 椅背在後面（離銀幕遠的那邊）
        box(c, -0.44, -0.45, 0.08, 0.9, 0.62, h, '#7f0000'); box(c, 0.36, -0.45, 0.08, 0.9, 0.62, h, '#7f0000')
      }
    }
    for (let k = 0; k < Math.floor((L - 2.5) / 2); k++) for (const side of [0.03, S - 0.09]) { const p2 = nm(grp(g, ...at(1.5 + k * 2, side)), '吸音牆板'); box(p2, ...(long ? [0, -0.6, 0.06, 1.2] : [-0.6, 0, 1.2, 0.06]), 1.6, 0.5, k % 2 ? '#6a1b9a' : '#4527a0') }
    const ef = nm(grp(g, ...at(L - 0.5, S / 2 + 0.6)), '85 大樓模型'); box(ef, -0.25, -0.25, 0.5, 0.5, 0.7, 0, '#212121'); mini(ef, 0, 0, '85', 0.7) // 後面角落的高雄 85 大樓模型
    const pc = nm(grp(g, ...at(L - 0.5, 2.2)), '爆米花機'); box(pc, -0.25, -0.25, 0.5, 0.5, 0.9, 0, '#c62828'); box(pc, -0.23, -0.23, 0.46, 0.46, 0.5, 0.9, '#fff59d', { transparent: true, opacity: 0.6, emissive: '#ffcc33', emissiveIntensity: 0.4 }); box(pc, -0.25, -0.25, 0.5, 0.5, 0.1, 1.4, '#c62828')
  },
  // 臺東：和室。床の間（掛軸、插花、床柱）、矮桌＋坐墊＋茶具、囲爐裏、鋪好的被褥、簞笥、行燈、熱氣球紙燈籠；東邊障子＋緣側
  // 和室共用：東邊外牆前一排障子、外面的緣側（木走廊）
  tatamiCommon(g, W, D) {
    const ew = 1.3
    const en = grp(g, W - ew / 2, D / 2, 0, 'rug'); box(en, -ew / 2, -D / 2, ew, D, 0.12, 0, '#a47148', { roughness: 0.5 })
    const n = Math.max(2, Math.round(D / 1.8))
    for (let k = 0; k < n; k++) {
      const p = grp(g, W - ew - 0.03, (k + 0.5) * (D / n), FACE.w, 'fixed'), w = D / n - 0.04, h = 2.2
      box(p, -w / 2, -0.02, w, 0.03, h, 0.05, '#fbf6ea', { transparent: true, opacity: 0.85, emissive: '#fff4dc', emissiveIntensity: 0.25 })
      for (let r = 0; r <= 6; r++) box(p, -w / 2, 0, w, 0.04, 0.025, 0.05 + (r * h) / 6, '#5d4037')
      for (let c = 0; c <= 4; c++) box(p, -w / 2 + (c * w) / 4 - 0.012, 0, 0.025, 0.04, h, 0.05, '#5d4037')
    }
  },
  tatami(g, W, D) {
    const ew = 1.3 // 緣側寬
    ROOMS3D.tatamiCommon(g, W, D)
    const tk = grp(g, 2.2, 0.2); box(tk, -1.8, 0, 3.6, 0.9, 0.18, 0, '#3e2723', { roughness: 0.4 })
    box(tk, -0.35, 0.02, 0.7, 0.03, 1.3, 0.75, '#f3ead6'); box(tk, -0.4, 0.01, 0.8, 0.05, 0.04, 2.05, '#3e2723'); box(tk, -0.4, 0.01, 0.8, 0.05, 0.04, 0.72, '#3e2723')
    for (let k = 0; k < 3; k++) box(tk, -0.15 + k * 0.12, 0.05, 0.04, 0.01, 0.6 - k * 0.15, 1.15 + k * 0.1, '#212121')
    cyl(tk, 1.1, 0.45, 0.14, 0.35, 0.18, '#5d7a8c', { roughness: 0.2 }, 0.1)
    for (const [rx, rz, c] of [[0.4, 0.2, '#f48fb1'], [-0.4, 0.4, '#ffffff'], [0.1, -0.4, '#f06292']]) { const s = cyl(tk, 1.1, 0.45, 0.012, 0.7, 0.5, '#4e6b3a'); s.rotation.set(rz, 0, rx); ball(tk, 1.1 + Math.sin(rx) * 0.6, 1.15, 0.45 - Math.sin(rz) * 0.6, 0.09, c) }
    cyl(g, 4.2, 0.35, 0.09, TOP, 0, '#a1887f') // 床柱
    const cx = (W - ew) / 2, cz = D * 0.32
    const tb = grp(g, cx, cz); cyl(tb, 0, 0, 0.6, 0.05, 0.32, '#4e342e', { roughness: 0.3 }); cyl(tb, 0, 0, 0.1, 0.32, 0, '#3e2723')
    ball(tb, 0, 0.45, 0, 0.1, '#3e5b4a'); for (let k = 0; k < 4; k++) cyl(tb, Math.cos(k * 1.57 + 0.6) * 0.35, Math.sin(k * 1.57 + 0.6) * 0.35, 0.04, 0.07, 0.37, '#efebe9')
    for (const [dx, dz] of [[-0.95, 0], [0.95, 0], [0, -0.95], [0, 0.95]]) { const c = grp(g, cx + dx, cz + dz, 0, 'rug'); box(c, -0.3, -0.3, 0.6, 0.6, 0.08, 0, '#7b2d26') }
    const ir = grp(g, cx, D * 0.6); box(ir, -0.6, -0.6, 1.2, 1.2, 0.08, 0, '#5d4037'); box(ir, -0.45, -0.45, 0.9, 0.9, 0.09, 0, '#8d8d8d', { roughness: 1 })
    cyl(ir, 0, 0, 0.012, TOP - 0.7, 0.7, '#3e2723'); ball(ir, 0, 0.55, 0, 0.18, '#263238', { metalness: 0.6, roughness: 0.4 }); ball(ir, 0, 0.12, 0, 0.1, '#ff7043', GLOW('#ff5722'))
    for (const [dx, dz] of [[-0.95, 0], [0.95, 0], [0, 0.95]]) { const c = grp(g, cx + dx, D * 0.6 + dz, 0, 'rug'); box(c, -0.3, -0.3, 0.6, 0.6, 0.08, 0, '#283a5e') }
    for (const dx of [-0.6, 0.6]) { const f = grp(g, cx + dx, D * 0.86, 0, 'rug'); box(f, -0.45, -1, 0.9, 2, 0.1, 0, '#fafafa'); box(f, -0.43, -0.4, 0.86, 1.3, 0.06, 0.1, '#5c7aa3'); box(f, -0.25, -0.95, 0.5, 0.3, 0.1, 0.1, '#ffffff') }
    const ts = grp(g, 0.3, D * 0.82, FACE.e); box(ts, -0.6, -0.25, 1.2, 0.5, 1.1, 0, '#8d5a3b', { roughness: 0.5 }); for (let r = 0; r < 3; r++) for (const a of [-0.3, 0.3]) box(ts, a - 0.05, 0.25, 0.1, 0.02, 0.03, 0.25 + r * 0.35, '#212121')
    cyl(ts, 0, 0, 0.12, 0.1, 1.1, '#5d7a8c'); ball(ts, 0, 1.35, 0, 0.18, '#2e7d32')
    const an = grp(g, 0.5, D * 0.45); box(an, -0.18, -0.18, 0.36, 0.36, 0.75, 0, '#fff3dc', GLOW('#ffd9a0', 0.8))
    const bl = grp(g, cx, cz, 0, 'hang'); cyl(bl, 0, 0, 0.008, 0.6, TOP - 0.6, '#5d4037'); ball(bl, 0, TOP - 0.95, 0, 0.35, '#ff8a50', GLOW('#ff9e64', 0.6)); cyl(bl, 0, 0, 0.12, 0.14, TOP - 1.45, '#a1887f', {}, 0.15)
  },
  // 屏東：泳池（露天）。東邊一塊兒童戲水區（地上噴泉、噴水鯨鯊、香菇噴泉、倒水桶、溜滑梯淺池）；往南拉長的 3 × 10 m 長池、水道線、入水階梯、東側一排躺椅與陽傘、椰子樹、池畔小吧台
  pool(g, W, D) {
    const pw = Math.min(5, W * 0.36), px = 1.2, pz = 1.5, pd = D - 3
    box(g, px - 0.3, pz - 0.3, pw + 0.6, pd + 0.6, 0.12, 0, '#f5f5f5', { roughness: 0.4 })
    box(g, px, pz, pw, pd, 0.05, 0.1, '#1fb5d1', { roughness: 0.05, transparent: true, opacity: 0.9 })
    for (let k = 1; k < 3; k++) box(g, px + (k * pw) / 3 - 0.04, pz + 0.5, 0.08, pd - 1, 0.01, 0.16, '#0d6e8a')
    for (let k = 0; k < 3; k++) box(g, px + pw / 2 - 0.8, pz - 0.3 - k * 0.3, 1.6, 0.3, 0.1 - k * 0.03, 0, '#eeeeee')
    const lx = px + pw + 1.3
    for (let k = 0; k < Math.floor((pd - 0.5) / 2); k++) {
      const z = pz + 0.8 + k * 2
      const o = nm(grp(g, lx, z, FACE.w), '躺椅')
      box(o, -0.32, -0.95, 0.64, 1.9, 0.3, 0, '#fafafa'); const b2 = box(o, -0.32, 0.5, 0.64, 0.5, 0.05, 0.38, '#fafafa'); b2.rotation.x = -0.6
      box(o, -0.3, -0.9, 0.6, 1.4, 0.06, 0.3, '#ff8a65')
      if (k % 2) { const u = nm(grp(g, lx + 0.7, z), '遮陽傘'); cyl(u, 0, 0, 0.025, 2.2, 0, '#eeeeee'); add(u, new THREE.ConeGeometry(1.1, 0.45, 10), k % 4 === 1 ? '#ff7043' : '#fafafa', {}, 0, 2.3, 0) }
    }
    const palm = (x, z) => { const o = nm(grp(g, x, z), '椰子樹'); const t = cyl(o, 0, 0, 0.14, 4, 0, '#8d6e63', {}, 0.1); t.rotation.z = 0.06; for (let k = 0; k < 7; k++) { const f = box(o, -0.1, 0, 0.2, 1.6, 0.04, 0, '#388e3c'); f.position.set(0.2, 4, 0); f.rotation.set(-0.55, (k * Math.PI * 2) / 7, 0) } }
    palm(W - 2.4, 0.9); palm(W - 0.9, D - 0.9); palm(0.8, D - 0.8)
    const sr = nm(grp(g, px + pw / 2, D - 0.65, 0, 'fixed'), '墾丁船帆石'); cyl(sr, 0, 0, 0.55, 0.15, 0, '#8d8070', { roughness: 1, flatShading: true }, 0.45, 9) // 墾丁船帆石：池子南邊一塊立起來的帆形大石頭
    const sail = add(sr, new THREE.SphereGeometry(0.5, 12, 10), '#7d6e5d', { roughness: 1, flatShading: true }, 0, 0.8, 0); sail.scale.set(0.9, 1.5, 0.55); sail.rotation.z = 0.25
    const ring = add(g, new THREE.TorusGeometry(0.35, 0.12, 8, 20), '#ff4081', {}, px + pw * 0.4, 0.2, pz + pd * 0.6); ring.rotation.x = Math.PI / 2
    // 兒童戲水區（池子東邊）：軟墊地、地上噴泉、會噴水的鯨鯊（屏東海生館）、香菇噴泉、倒水桶、小溜滑梯滑進圓形淺池
    const kx = Math.min(W - 2.3, lx + 3.4), kz = pz + pd * 0.42, WTR = { transparent: true, opacity: 0.55, roughness: 0.05 }
    rug(g, kx, kz, 3.8, 5.4, '#4fc3f7', '#ffca28')
    const kp = nm(grp(g, kx, kz, 0, 'fixed'), '兒童戲水區')
    for (const [a, b, c] of [[-1.1, -1.8, '#ff7043'], [0.9, -1.5, '#ab47bc'], [-0.8, 0.2, '#66bb6a'], [1.1, 0.6, '#ffee58']]) cyl(kp, a, b, 0.35, 0.025, 0, c)
    for (let k = 0; k < 9; k++) { const a = -1.2 + (k % 3) * 1.2, b = -2.0 + Math.floor(k / 3) * 1.0; cyl(kp, a, b, 0.05, 0.03, 0.02, '#eceff1', { metalness: 0.7 }); cyl(kp, a, b, 0.03, 0.5 + (k % 2) * 0.4, 0.05, '#b3e5fc', WTR, 0.015) } // 地上噴泉
    // 鯨鯊：深藍灰色身體、白點、尾鰭、背鰭，嘴巴噴一道水柱
    const ws = nm(grp(kp, -0.6, 1.3, 0.4), '會噴水的鯨鯊')
    const body = ball(ws, 0, 0.55, 0, 0.5, '#455a64'); body.scale.set(2.0, 0.8, 0.9); ball(ws, 0.1, 0.42, 0, 0.42, '#eceff1').scale.set(1.9, 0.5, 0.85)
    for (let k = 0; k < 10; k++) ball(ws, -0.7 + (k % 5) * 0.32, 0.82 + (k % 2) * 0.04, (Math.floor(k / 5) ? 0.22 : -0.22), 0.04, '#fafafa')
    add(ws, new THREE.ConeGeometry(0.35, 0.6, 4), '#455a64', {}, -1.25, 0.6, 0).rotation.z = Math.PI / 2; add(ws, new THREE.ConeGeometry(0.15, 0.35, 4), '#455a64', {}, -0.1, 1.05, 0)
    const jet = new THREE.CatmullRomCurve3([[0.95, 0.65], [1.4, 1.3], [1.9, 1.1], [2.2, 0.1]].map(([x, y]) => new THREE.Vector3(x, y, 0))); add(ws, new THREE.TubeGeometry(jet, 24, 0.04, 6), '#b3e5fc', WTR, 0, 0, 0) // 水柱
    // 香菇噴泉：水從傘邊流下來
    const ms = nm(grp(kp, 1.1, -0.6), '香菇噴泉'); cyl(ms, 0, 0, 0.08, 1.6, 0, '#ff7043'); add(ms, new THREE.SphereGeometry(0.7, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), '#ef5350', {}, 0, 1.55, 0).scale.set(1, 0.45, 1)
    cyl(ms, 0, 0, 0.7, 1.55, 0, '#b3e5fc', { ...WTR, side: THREE.DoubleSide, opacity: 0.3 }, 0.7, 20).material.depthWrite = false
    for (let k = 0; k < 8; k++) ball(ms, Math.cos(k) * 0.72, 1.6, Math.sin(k) * 0.72, 0.06, '#fafafa')
    // 倒水桶：兩根柱子上一個會翻倒的黃色大水桶
    const bk = nm(grp(kp, -1.2, -0.9), '倒水桶'); for (const s2 of [-1, 1]) cyl(bk, s2 * 0.45, 0, 0.05, 2.2, 0, '#1e88e5'); box(bk, -0.5, -0.04, 1.0, 0.08, 0.08, 2.15, '#1e88e5')
    const bu = cyl(bk, 0, 0, 0.28, 0.45, 0, '#fdd835', {}, 0.32); bu.position.y = 1.85; bu.rotation.z = 0.5
    // 小溜滑梯滑進圓形淺池（30 cm 深）
    const wp = nm(grp(kp, 0.6, 2.1), '圓形淺池'); cyl(wp, 0, 0, 0.95, 0.3, 0, '#eceff1', {}, 0.95, 24); cyl(wp, 0, 0, 0.85, 0.02, 0.28, '#4dd0e1', { transparent: true, opacity: 0.85, roughness: 0.05 }, 0.85, 24)
    const sl = nm(grp(kp, 1.4, 1.0), '小溜滑梯'); box(sl, -0.35, -0.35, 0.7, 0.7, 0.9, 0, '#ffca28'); const ch = box(sl, -0.25, 0, 0.5, 1.2, 0.05, 0.6, '#ff7043'); ch.rotation.x = 0.55; ch.position.set(0, 0.55, 0.75)
    ball(g, px + pw * 0.6, 0.25, pz + pd * 0.3, 0.18, '#ffeb3b')
    // 東西對調：大池在東、兒童戲水區在西（靠西部走廊的盡頭）
    for (const c of g.children) { c.position.x = W - c.position.x; c.rotation.y = -c.rotation.y; c.scale.x *= -1 }
  },
  // 澎湖：出海的小碼頭（露天，9 × 8 m，在庭園西南角的南海岸邊）。峇里島風的平台；柚木平台上一座茅草尖頂的 bale（架高的大臥榻、白色抱枕、白紗簾），
  //   兩棵雞蛋花、兩棵椰子樹中間一張吊床、火把；棧橋伸進海裡繫著漁船
  pavilion(g, W, D) {
    rug(g, W / 2, D / 2, W - 0.1, D - 0.1, '#a47148', '#8a5a3b') // 柚木平台
    // bale：四根深色木柱、架高 45 cm 的大臥榻、陡的茅草尖頂
    const bl = nm(grp(g, 2.2, 2.3, 0, 'fixed'), '峇里島 bale 大臥榻'), H = 2.3
    for (const [a, b] of [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]]) cyl(bl, a, b, 0.1, H, 0, '#3e2723')
    box(bl, -1.55, -1.55, 3.1, 3.1, 0.45, 0, '#5d4037'); box(bl, -1.4, -1.4, 2.8, 2.8, 0.18, 0.45, '#fafafa') // 臥榻＋白床墊
    for (const [a, b, c] of [[-1.0, -1.15, '#fafafa'], [-0.3, -1.15, '#f5e6c8'], [0.4, -1.15, '#fafafa'], [1.05, -1.15, '#c9a227']]) box(bl, a - 0.3, b, 0.6, 0.25, 0.4, 0.63, c) // 靠枕
    box(bl, -0.35, 0.1, 0.7, 0.5, 0.2, 0.63, '#6d4c41'); for (const k of [-0.15, 0.15]) ball(bl, k, 0.92, 0.35, 0.09, '#8d6e63') // 小木桌上兩顆椰子
    const rf = add(bl, new THREE.ConeGeometry(2.6, 1.9, 4), '#b89b5e', { roughness: 1, flatShading: true }, 0, H + 0.95, 0); rf.rotation.y = Math.PI / 4 // 茅草屋頂
    add(bl, new THREE.ConeGeometry(2.62, 0.25, 4, 1, true), '#8d7440', { roughness: 1, side: THREE.DoubleSide }, 0, H + 0.1, 0).rotation.y = Math.PI / 4
    for (const [a, b] of [[-1.5, 1.5], [1.5, 1.5]]) { const c = box(bl, -0.2, -0.02, 0.4, 0.04, H - 0.1, 0, '#ffffff', { transparent: true, opacity: 0.55, side: THREE.DoubleSide }); c.position.set(a, (H - 0.1) / 2, b); c.rotation.y = a < 0 ? 0.6 : -0.6 } // 綁起來的白紗簾
    // 雞蛋花樹：彎彎的灰色樹幹、綠葉、白黃色的花
    for (const [x, z] of [[0.6, D - 0.8], [W - 0.6, D - 0.6]]) { const fr = nm(grp(g, x, z), '雞蛋花樹'); const t = cyl(fr, 0, 0, 0.09, 1.6, 0, '#9e9e9e', {}, 0.06); t.rotation.z = 0.15
      for (const [a, b, c] of [[0.2, 1.8, 0.1], [-0.35, 1.65, -0.25], [0.1, 1.7, -0.4], [-0.1, 2.0, 0.3]]) { ball(fr, a, b, c, 0.38, '#689f38'); for (let k = 0; k < 4; k++) ball(fr, a + Math.cos(k * 1.6) * 0.33, b + 0.15, c + Math.sin(k * 1.6) * 0.33, 0.06, k % 2 ? '#fff8e1' : '#ffe082') } }
    // 兩棵椰子樹中間一張吊床
    const palm = (x, z, lean) => { const o = nm(grp(g, x, z), '椰子樹'); const t = cyl(o, 0, 0, 0.13, 4.2, 0, '#8d6e63', {}, 0.09); t.rotation.z = lean; for (let k = 0; k < 8; k++) { const f = box(o, -0.1, 0, 0.2, 1.7, 0.04, 0, '#388e3c'); f.position.set(-Math.sin(lean) * 4.1, 4.1, 0); f.rotation.set(-0.55, (k * Math.PI * 2) / 8, 0) } }
    palm(2.4, D - 0.5, 0.08); palm(5.6, D - 0.5, -0.08)
    const hm = new THREE.CatmullRomCurve3([[2.5, 1.3], [4.0, 0.65], [5.5, 1.3]].map(([x, y]) => new THREE.Vector3(x, y, D - 0.5)))
    const hg = nm(grp(g, 0, 0, 0, 'fixed'), '吊床'); add(hg, new THREE.TubeGeometry(hm, 24, 0.035, 6), '#8d6e63', {}, 0, 0, 0) // 吊床的繩子
    const hmk = add(hg, new THREE.BoxGeometry(1.9, 0.04, 0.8), '#ffccbc', {}, 4.0, 0.75, D - 0.5); hmk.scale.y = 1 // 布面（兩端接到繩子）
    // 火把（晚上會亮）
    // 棧橋：從平台南邊中間往南伸進海裡 10 m（木板、兩排木樁、繫船柱、盡頭一盞燈），旁邊繫著一艘澎湖的藍白漁船
    const jt = nm(grp(g, W / 2, D, 0, 'fixed'), '棧橋'), JL = 10
    box(jt, -0.8, 0, 1.6, JL, 0.08, 0.35, '#a47148'); for (let k = 0; k * 0.3 < JL; k++) box(jt, -0.8, k * 0.3, 1.6, 0.02, 0.005, 0.43, '#7a5236')
    for (let k = 0; k <= JL / 2; k++) for (const s2 of [-1, 1]) cyl(jt, s2 * 0.75, k * 2, 0.08, 0.8, -0.3, '#5d4037')
    for (const s2 of [-1, 1]) cyl(jt, s2 * 0.65, JL - 0.4, 0.07, 0.3, 0.43, '#37474f', { metalness: 0.5 }) // 繫船柱
    cyl(jt, 0.65, JL - 0.1, 0.04, 1.8, 0.43, '#37474f'); ball(jt, 0.65, 2.3, JL - 0.1, 0.12, '#fff3c4', GLOW('#ffd54f', 1.4))
    const bt = nm(grp(jt, 2.0, JL - 3.2), '澎湖漁船') // 漁船（6 m）：藍色船身、白色上緣、小駕駛艙、船頭一面旗
    const hull = ball(bt, 0, 0.3, 0, 0.6, '#1565c0'); hull.scale.set(1.1, 0.75, 5.0); box(bt, -0.62, -2.6, 1.24, 5.2, 0.12, 0.62, '#fafafa')
    box(bt, -0.45, 0.2, 0.9, 1.3, 0.9, 0.7, '#fafafa'); box(bt, -0.46, 0.18, 0.92, 0.04, 0.35, 1.15, '#90caf9', GLASS)
    cyl(bt, 0, -2.3, 0.025, 1.4, 0.7, '#5d4037'); box(bt, 0, -2.3, 0.02, 0.4, 0.3, 1.75, '#e53935')
    cyl(jt, 0.8, JL - 3.6, 0.01, 1.3, 0.45, '#d7ccc8').rotation.z = Math.PI / 2.3 // 纜繩
    for (const [x, z] of [[0.3, 0.3], [W - 0.3, D / 2 + 0.6], [0.3, D / 2 + 1.2], [4.6, 0.3]]) { const tk = nm(grp(g, x, z), '火把'); cyl(tk, 0, 0, 0.03, 1.4, 0, '#5d4037'); cyl(tk, 0, 0, 0.07, 0.18, 1.4, '#8d6e63'); add(tk, new THREE.ConeGeometry(0.06, 0.2, 8), '#ffab40', GLOW('#ff6d00', 1.8), 0, 1.68, 0) }
  },
  // 金門：酒窖。高粱酒架、橡木桶、品酒桌
  cellar(g, W, D) {
    const r = nm(grp(g, W / 2, 0.3, FACE.s), '高粱酒架'); box(r, -W / 2 + 0.4, -0.25, W - 0.8, 0.5, 2.2, 0, '#4e342e')
    for (let row = 0; row < 4; row++) for (let k = 0; k < Math.floor((W - 1) / 0.3); k++) { cyl(r, -W / 2 + 0.65 + k * 0.3, 0.1, 0.04, 0.28, 0.1 + row * 0.52, '#fafafa', { roughness: 0.2 }, 0.035); cyl(r, -W / 2 + 0.65 + k * 0.3, 0.1, 0.015, 0.08, 0.4 + row * 0.52, '#c62828') }
    for (let k = 0; k < Math.floor((W - 0.3) / 1.0); k++) { const b = nm(grp(g, 0.65 + k * 1.0, D - 0.5), '橡木桶'); const c = cyl(b, 0, 0, 0.4, 0.8, 0, '#8d6e63', {}, 0.4, 16); c.rotation.x = Math.PI / 2; c.position.y = 0.4 }
    const t = nm(grp(g, W / 2, D * 0.45), '品酒桌'); cyl(t, 0, 0, 0.5, 0.05, 0.9, '#3e2723'); cyl(t, 0, 0, 0.08, 0.9, 0, '#3e2723'); for (let k = 0; k < 3; k++) cyl(t, Math.cos(k * 2) * 0.25, Math.sin(k * 2) * 0.25, 0.03, 0.08, 0.95, '#ffffff', GLASS)
  },
  // 連江：運動場（露天，24 × 32 m），照標準尺寸：西邊網球場（雙打 10.97 × 23.77 m、網高中間 0.914 m），
  //   東邊北段羽球場（6.1 × 13.4 m、網高 1.55 m）、南段籃球半場（籃框 3.05 m、禁區 4.9 × 5.8 m）；中間放迷彩貨櫃器材室、長椅、球架
  //   四周 3 m 鐵絲網（東邊留入口）、四根照明燈、外圍一圈發光的藍眼淚
  sports(g, W, D) {
    const ln = nm(grp(g, 0, 0, 0, 'rug'), '場線（會發光的藍眼淚）'), WH = ['#fafafa', {}], TEAR = ['#7fdcff', GLOW('#29b6f6', 1.2)]
    const line = (x0, z0, w, d, c = WH) => box(ln, x0, z0, w, d, 0.012, 0.035, ...c)
    const frame = (x0, z0, w, d, c) => { line(x0, z0, w, 0.05, c); line(x0, z0 + d - 0.05, w, 0.05, c); line(x0, z0, 0.05, d, c); line(x0 + w - 0.05, z0, 0.05, d, c) }
    const TX = 15.5 // 網球區寬
    rug(g, TX / 2, D / 2, TX - 0.1, D - 0.1, '#3d7a5a', '#3d7a5a'); rug(g, (TX + W) / 2, D / 2, W - TX - 0.1, D - 0.1, '#8e3b2f', '#8e3b2f')
    frame(0.1, 0.1, W - 0.2, D - 0.2, TEAR)
    // 網球場
    const cw = 10.97, cl = 23.77, cx0 = (TX - cw) / 2, cz0 = (D - cl) / 2, nz = D / 2
    rug(g, TX / 2, nz, cw, cl, '#2f6f8f', '#2f6f8f')
    frame(cx0, cz0, cw, cl); line(cx0 + 1.37, cz0, 0.05, cl); line(cx0 + cw - 1.42, cz0, 0.05, cl) // 雙打、單打邊線
    for (const s2 of [-1, 1]) line(cx0 + 1.37, nz + s2 * 6.4 - 0.025, cw - 2.74, 0.05) // 發球線
    line(TX / 2 - 0.025, nz - 6.4, 0.05, 12.8)
    const tn = nm(grp(g, TX / 2, nz, 0, 'fixed'), '網球網'); for (const s2 of [-1, 1]) cyl(tn, s2 * (cw / 2 + 0.914), 0, 0.04, 1.07, 0, '#37474f', { metalness: 0.5 })
    box(tn, -cw / 2 - 0.9, -0.01, cw + 1.8, 0.02, 0.9, 0.08, '#263238', { transparent: true, opacity: 0.55 }); box(tn, -cw / 2 - 0.9, -0.02, cw + 1.8, 0.04, 0.06, 0.95, '#fafafa')
    for (const [x, z] of [[4, 6], [10.5, 22], [12, 9]]) ball(g, x, 0.07, z, 0.034, '#d4e157')
    // 羽球場（東邊北段）
    const bw = 6.1, bl = 13.4, bx0 = TX + (W - TX - bw) / 2, bz0 = 0.8, bn = bz0 + bl / 2
    frame(bx0, bz0, bw, bl); line(bx0 + 0.46, bz0, 0.05, bl); line(bx0 + bw - 0.51, bz0, 0.05, bl)
    for (const s2 of [-1, 1]) { line(bx0, bn + s2 * 1.98 - 0.025, bw, 0.05); line(bx0, bn + s2 * (bl / 2 - 0.76) - 0.025, bw, 0.05) }
    line(bx0 + bw / 2 - 0.025, bz0, 0.05, bl / 2 - 1.98); line(bx0 + bw / 2 - 0.025, bn + 1.98, 0.05, bl / 2 - 1.98)
    const bnet = nm(grp(g, bx0 + bw / 2, bn, 0, 'fixed'), '羽球網'); for (const s2 of [-1, 1]) cyl(bnet, s2 * bw / 2, 0, 0.03, 1.55, 0, '#37474f', { metalness: 0.5 })
    box(bnet, -bw / 2, -0.01, bw, 0.02, 0.76, 0.79, '#263238', { transparent: true, opacity: 0.5 }); box(bnet, -bw / 2, -0.02, bw, 0.04, 0.05, 1.53, '#fafafa')
    for (const [x, z] of [[bx0 + 1.5, bn - 3], [bx0 + 4.2, bn + 2.2]]) { const sc = add(g, new THREE.ConeGeometry(0.035, 0.08, 10), '#fafafa', {}, x, 0.07, z); sc.rotation.x = 0.6 } // 羽毛球
    // 籃球半場（東邊南段，籃框朝北）
    const hx = (TX + W) / 2, base = D - 0.2, kw = 4.9
    frame(TX + 0.2, 17, W - TX - 0.4, base - 17); frame(hx - kw / 2, base - 5.8, kw, 5.8)
    const fc = add(ln, new THREE.TorusGeometry(1.8, 0.025, 4, 32, Math.PI), ...WH, hx, 0.04, base - 5.8); fc.rotation.set(Math.PI / 2, 0, Math.PI)
    const arc = add(ln, new THREE.TorusGeometry(3.7, 0.025, 4, 48, Math.PI), ...WH, hx, 0.04, base - 1.575); arc.rotation.set(Math.PI / 2, 0, Math.PI)
    const hp = nm(grp(g, hx, base + 0.05, FACE.n, 'fixed'), '籃球架'); cyl(hp, 0, 0, 0.09, 3.6, 0, '#37474f', { metalness: 0.5 })
    box(hp, -0.08, 0, 0.16, 1.2, 0.12, 3.3, '#37474f'); box(hp, -0.9, 1.2, 1.8, 0.04, 1.05, 2.9, '#e1f5fe', GLASS); box(hp, -0.3, 1.18, 0.6, 0.02, 0.45, 3.05, '#fafafa')
    add(hp, new THREE.TorusGeometry(0.23, 0.015, 6, 20), '#ff5722', {}, 0, 3.05, 1.575).rotation.x = Math.PI / 2
    add(hp, new THREE.CylinderGeometry(0.23, 0.14, 0.4, 12, 1, true), '#fafafa', { wireframe: true }, 0, 2.85, 1.575)
    for (const [x, z] of [[hx - 1.5, base - 4], [hx + 2.2, base - 7]]) ball(g, x, 0.12, z, 0.12, '#e65100')
    // 中間：迷彩貨櫃器材室（6 m 小貨櫃）、長椅（上面一罐藍眼淚）、球架
    const ct = nm(grp(g, TX + 2.3, 15.6, 0, 'fixed'), '迷彩貨櫃器材室'); box(ct, -1.5, -1.2, 3, 2.4, 2.6, 0, '#5b6b3c') // 10 呎貨櫃
    for (const [a, b, c, w2] of [[-1.52, -0.8, '#3e4a2a', 1.2], [-0.5, 0.2, '#8a7a4f', 1], [0.6, -0.3, '#3e4a2a', 0.9], [-1.2, 0.7, '#8a7a4f', 0.8]]) box(ct, a, -1.22, w2, 2.44, 0.7, 0.3 + Math.abs(b) * 1.5, c) // 迷彩塊
    const bc = nm(grp(g, TX + 5.3, 14.6, FACE.s), '長椅'); box(bc, -0.8, -0.2, 1.6, 0.4, 0.45, 0, '#8d6e63'); mini(bc, 0.5, 0, 'tear', 0.45)
    const rk = nm(grp(g, W - 1.3, 14.6, FACE.s), '球架'); box(rk, -0.4, -0.2, 0.8, 0.4, 0.5, 0, '#455a64', { metalness: 0.5 }); for (let k = 0; k < 3; k++) ball(rk, -0.25 + k * 0.25, 0.62, 0, 0.12, '#e65100')
    // 鐵絲網（3 m 高，半透明）＋照明燈
    const fn = nm(grp(g, 0, 0, 0, 'fixed'), '鐵絲網'), FN = ['#2e4a3a', { transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }]
    const gate = [D / 2 - 0.8, D / 2 + 0.8] // 東邊入口（接往桃園車道的石頭步道）
    for (const [x0, z0, w, d] of [[0, 0, W, 0], [0, D, W, 0], [0, 0, 0, D], [W, 0, 0, gate[0]], [W, gate[1], 0, D - gate[1]]]) {
      box(fn, x0 - 0.01, z0 - 0.01, w + 0.02, d + 0.02, 3, 0, ...FN).castShadow = false
      const n = Math.round(Math.max(w, d) / 3); for (let k = 0; k <= n; k++) cyl(fn, x0 + (w * k) / n, z0 + (d * k) / n, 0.04, 3, 0, '#37474f', { metalness: 0.5 })
    }
    for (const [x, z] of [[0.3, 0.3], [W - 0.3, 0.3], [0.3, D - 0.3], [W - 0.3, D - 0.3]]) { const fl = nm(grp(g, x, z, 0, 'fixed'), '照明燈'); cyl(fl, 0, 0, 0.08, 7, 0, '#607d8b', { metalness: 0.5 }); box(fl, -0.5, -0.15, 1.0, 0.3, 0.4, 6.9, '#fff8e1', GLOW('#fff3c4', 1.2)) }
  },
}

// 大房間切成約 11 m 一塊：第一塊放主家具（ROOMS3D），其他塊放這裡的延伸家具，k＝第幾塊
const EXTRA = {
  garage(g, W, D) { car(g, W / 2 - 1.4, D / 2, FACE.n, '#1565c0'); car(g, W / 2 + 1.4, D / 2, FACE.n, '#212121'); const sh = grp(g, W - 0.3, D / 2, FACE.w); box(sh, -1.5, -0.2, 3, 0.4, 2, 0, '#78909c', { metalness: 0.4 }); for (let k = 0; k < 6; k++) box(sh, -1.4 + k * 0.48, -0.15, 0.4, 0.3, 0.35, 0.3 + (k % 3) * 0.6, ['#ef6c00', '#1565c0', '#2e7d32'][k % 3]) },
  master(g, W, D, ctx, k) {
    if (k % 2) { // 更衣間：兩排衣櫃、中島、穿衣鏡
      for (let i = 0; i < Math.floor((W - 1) / 2); i++) { wardrobe(g, 1.4 + i * 2, 0.35, 1.9, FACE.s, '#e6dccb'); wardrobe(g, 1.4 + i * 2, D - 0.35, 1.9, FACE.n, '#e6dccb') }
      const is = grp(g, W / 2, D / 2); box(is, -1.2, -0.5, 2.4, 1, 0.9, 0, '#8d6e63'); box(is, -1.25, -0.55, 2.5, 1.1, 0.04, 0.9, '#f5f5f5', { roughness: 0.15 })
      const mr = grp(g, 0.2, D / 2, FACE.e); box(mr, -0.5, -0.03, 1, 0.06, 1.9, 0.1, '#cfe8f3', { metalness: 0.9, roughness: 0.05 })
      armchair(g, W - 1.2, D / 2, FACE.w, '#e6dccb')
    } else { // 起居角：沙發、單椅、電視、書桌
      rug(g, W / 2, D / 2, 4, 3.4, '#8da0b6')
      sofa(g, W / 2, D / 2 + 1.2, 2.4, FACE.n, '#e6dccb', '#3f5f8f'); armchair(g, W / 2 - 1.8, D / 2 - 0.3, FACE.e, '#e6dccb'); armchair(g, W / 2 + 1.8, D / 2 - 0.3, FACE.w, '#e6dccb')
      coffeeTable(g, W / 2, D / 2, 1.1, 0.6); tvUnit(g, W / 2, 0.3, 2, FACE.s); desk(g, W - 1.2, D - 0.6, 1.4, FACE.n); floorLamp(g, 0.6, D - 0.6); plant(g, W - 0.6, 0.6, 1.4)
    }
  },
  guest(g, W, D) { rug(g, W / 2, D / 2, 3.6, 3, '#a5b7a0'); sofa(g, W / 2, D / 2 + 1, 2.2, FACE.n, '#a5b7a0'); armchair(g, W / 2 + 1.7, D / 2 - 0.5, FACE.w); coffeeTable(g, W / 2, D / 2 - 0.2); desk(g, W - 1.0, 0.5, 1.4, FACE.s); bookshelf(g, 0.2, D / 2, 1.8, FACE.e); plant(g, 0.6, D - 0.6, 1.3) },
  study(g, W, D) {
    for (let r = 0; r < Math.floor((D - 3) / 2.2); r++) for (const f of [FACE.s, FACE.n]) bookshelf(g, W * 0.3, 1.5 + r * 2.2 + (f ? 0.2 : -0.2), W * 0.45, f, 2.3)
    const t = grp(g, W * 0.78, D / 2); box(t, -0.6, -1.2, 1.2, 2.4, 0.05, 0.74, '#4e342e'); for (const s2 of [-1, 1]) for (const z of [-0.7, 0, 0.7]) chair(t, s2 * 0.85, z, s2 > 0 ? FACE.w : FACE.e)
    armchair(g, W - 1, 1, FACE.w, '#7b2d26'); floorLamp(g, W - 0.5, 0.4); plant(g, W - 0.6, D - 0.6, 1.3)
  },
  control(g, W, D) { ROOMS3D.control(g, W, D) },
  family(g, W, D, ctx, k) {
    if (k % 2) { // 遊戲間：撞球桌、手足球台、射飛鏢
      const pt = grp(g, W / 2, D / 2); box(pt, -1.3, -0.7, 2.6, 1.4, 0.15, 0.7, '#1b5e20'); box(pt, -1.4, -0.8, 2.8, 1.6, 0.1, 0.65, '#4e342e'); for (const [a, b] of [[-1.2, -0.6], [1.1, -0.6], [-1.2, 0.5], [1.1, 0.5]]) box(pt, a, b, 0.12, 0.12, 0.65, 0, '#3e2723')
      for (let i = 0; i < 6; i++) ball(pt, -0.5 + i * 0.18, 0.88, (i % 2) * 0.12, 0.03, ['#ffeb3b', '#1565c0', '#c62828', '#6a1b9a', '#ef6c00', '#fafafa'][i])
      const fb = grp(g, W / 2, D - 1.2); box(fb, -0.7, -0.4, 1.4, 0.8, 0.9, 0, '#1565c0'); box(fb, -0.65, -0.35, 1.3, 0.7, 0.02, 0.9, '#43a047')
      const dt = grp(g, 0.2, D / 2, FACE.e); cyl(dt, 0, 0.03, 0.23, 0.03, 1.5, '#212121').rotation.x = Math.PI / 2
      sofa(g, W - 0.6, D / 2, 2.2, FACE.w, '#d8c3a5', '#c62828'); plant(g, 0.6, 0.6, 1.3)
    } else {
      rug(g, W / 2, D / 2, 4.4, 3.6, '#5c6bc0'); tvUnit(g, W / 2, 0.3, 2.4, FACE.s); sofa(g, W / 2, D / 2 + 1.3, 3, FACE.n, '#d8c3a5', '#c62828'); armchair(g, W / 2 - 2, D / 2, FACE.e)
      coffeeTable(g, W / 2, D / 2); bookshelf(g, W - 0.2, D / 2, 2, FACE.w); floorLamp(g, 0.6, D - 0.6); plant(g, W - 0.6, D - 0.6, 1.3)
    }
  },
  kids(g, W, D) {
    const sl = grp(g, 1.5, 1.5); box(sl, -0.5, -0.5, 1, 1, 1.2, 0, '#ffb74d'); const r = box(sl, -0.4, 0.5, 0.8, 2, 0.08, 0.6, '#4fc3f7'); r.rotation.x = 0.55
    const bp = grp(g, W - 1.6, 1.6); box(bp, -1, -1, 2, 2, 0.4, 0, '#fff8e1'); for (let i = 0; i < 30; i++) ball(bp, -0.8 + (i % 6) * 0.32, 0.42, -0.8 + Math.floor(i / 6) * 0.38, 0.13, ['#e53935', '#fdd835', '#1e88e5', '#43a047'][i % 4])
    rug(g, W / 2, D / 2, 3, 3, '#ffe082', '#ff8a65'); const tb = grp(g, W / 2, D / 2); cyl(tb, 0, 0, 0.5, 0.04, 0.5, '#fff8e1'); for (let i = 0; i < 4; i++) { const c = grp(tb, Math.cos(i * 1.57) * 0.75, Math.sin(i * 1.57) * 0.75); cyl(c, 0, 0, 0.2, 0.3, 0, ['#e53935', '#fdd835', '#1e88e5', '#43a047'][i]) }
    const ts = grp(g, W / 2, D - 0.3, FACE.n); box(ts, -1.2, -0.2, 2.4, 0.4, 1.0, 0, '#fff8e1'); ['#e53935', '#fdd835', '#1e88e5', '#43a047', '#ab47bc'].forEach((c, i) => box(ts, -1.1 + i * 0.45, -0.15, 0.35, 0.3, 0.3, 1.0, c))
  },
  greenhouse: (g, W, D, ctx) => ROOMS3D.greenhouse(g, W, D, ctx),
  dining(g, W, D, ctx, k) {
    if (k % 2) { // 宴會：兩張圓桌
      for (const [x, z] of [[W * 0.3, D / 2], [W * 0.7, D / 2]]) { const t = grp(g, x, z); cyl(t, 0, 0, 0.9, 0.05, 0.73, '#5d4037'); cyl(t, 0, 0, 0.12, 0.73, 0, '#3e2723'); for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; chair(t, Math.cos(a) * 1.3, Math.sin(a) * 1.3, Math.PI / 2 - a + Math.PI, '#8d6e63') } }
      chandelier(g, W * 0.3, D / 2); chandelier(g, W * 0.7, D / 2)
    } else { // 交誼：沙發、酒車、展示櫃
      rug(g, W / 2, D / 2, 3.6, 3, '#7b2d26'); sofa(g, W / 2, D / 2 + 1, 2.4, FACE.n, '#e6dccb', '#7b2d26'); armchair(g, W / 2 - 1.8, D / 2 - 0.4, FACE.e, '#e6dccb'); armchair(g, W / 2 + 1.8, D / 2 - 0.4, FACE.w, '#e6dccb'); coffeeTable(g, W / 2, D / 2 - 0.2)
      const c = grp(g, W / 2, 0.3, FACE.s); box(c, -1.2, -0.22, 2.4, 0.44, 2.1, 0, '#4e342e'); for (let r = 0; r < 4; r++) for (let i = 0; i < 5; i++) cyl(c, -0.9 + i * 0.45, 0.05, 0.12, 0.02, 0.4 + r * 0.42, '#fafafa')
      plant(g, 0.6, D - 0.6, 1.4); plant(g, W - 0.6, D - 0.6, 1.4)
    }
  },
  kitchen(g, W, D, ctx, k) {
    if (k % 3 === 1) { // 食物儲藏室：層架、酒櫃、第二台冰箱
      for (let r = 0; r < Math.floor((W - 1) / 2); r++) { // 開放式層架：四根柱子、四層板、罐頭與食材
        const sh = grp(g, 1.2 + r * 2, D / 2), L = Math.min((D * 2) / 3, 5)
        for (const [a, b] of [[-0.22, -L / 2], [0.18, -L / 2], [-0.22, L / 2 - 0.04], [0.18, L / 2 - 0.04]]) box(sh, a, b, 0.04, 0.04, 2, 0, '#8d6e63')
        for (let lv = 0; lv < 4; lv++) box(sh, -0.25, -L / 2, 0.5, L, 0.03, 0.3 + lv * 0.5, '#bcaaa4')
        for (let i = 0; i < 16; i++) { const z = -L / 2 + 0.25 + (i % 8) * ((L - 0.5) / 7), lv = Math.floor(i / 8); i % 3 ? cyl(sh, 0, z, 0.08, 0.2, 0.33 + lv * 1.0, ['#ef6c00', '#fdd835', '#c62828'][i % 3]) : box(sh, -0.15, z - 0.12, 0.3, 0.24, 0.25, 0.83 + lv * 0.5, ['#8d6e63', '#43a047'][lv]) }
      }
      const wf = grp(g, W - 0.4, 1, FACE.w); box(wf, -0.35, -0.35, 0.7, 0.7, 1.8, 0, '#263238', { metalness: 0.5 }); box(wf, -0.3, 0.34, 0.6, 0.02, 1.6, 0.1, '#7b2d26', GLASS)
    } else if (k % 3 === 2) { // 早餐角：圓桌、咖啡吧、香草盆
      const bt = grp(g, W / 2, D / 2); cyl(bt, 0, 0, 0.6, 0.04, 0.73, '#efe6d8'); cyl(bt, 0, 0, 0.05, 0.73, 0, DARK); for (const r of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) chair(bt, Math.sin(r) * 0.8, Math.cos(r) * 0.8, r + Math.PI, '#8d6e63')
      counter(g, W / 2, 0.35, Math.min(W - 2, 4), FACE.s); const cm = grp(g, W / 2 - 1, 0.35); box(cm, -0.2, -0.2, 0.4, 0.35, 0.4, 0.92, '#212121', { metalness: 0.5 })
      for (let i = 0; i < 4; i++) plant(g, 0.6, 1 + i * 0.8, 0.6, '#a1887f')
    } else { // 烘焙區：第二座中島、烤箱牆
      const is = grp(g, W / 2, D / 2); box(is, -1.5, -0.55, 3, 1.1, 0.9, 0, '#2f4d6b'); box(is, -1.55, -0.6, 3.1, 1.2, 0.05, 0.9, '#f5f5f5', { roughness: 0.15 })
      const ov = grp(g, W - 0.35, D / 2, FACE.w); box(ov, -1, -0.32, 2, 0.64, 2.2, 0, '#c8a27a'); for (const y of [0.9, 1.5]) box(ov, -0.35, 0.3, 0.7, 0.03, 0.45, y, '#111', GLOW('#ff8a50', 0.3))
      for (let i = 0; i < 3; i++) stool(g, W / 2 - 0.9 + i * 0.9, D / 2 + 0.95)
    }
  },
  onsen(g, W, D, ctx, k) {
    if (k % 2) { // 三溫暖（檜木箱）＋冷水池
      const sa = grp(g, W * 0.3, D / 2); box(sa, -1.5, -1.2, 3, 2.4, 2.2, 0, '#d9b98c'); box(sa, -1.4, 0.4, 2.8, 0.6, 0.45, 0, '#c49a6c'); box(sa, -0.5, -1.22, 1, 0.04, 1.9, 0, '#9fd3f0', GLASS)
      const cp = grp(g, W * 0.72, D / 2); box(cp, -0.9, -0.9, 1.8, 1.8, 0.6, 0, '#9e9e9e'); box(cp, -0.8, -0.8, 1.6, 1.6, 0.05, 0.56, '#4fc3f7', { transparent: true, opacity: 0.85 })
    } else { // 露天風呂感的岩石池＋躺椅
      const p = grp(g, W / 2, D / 2); cyl(p, 0, 0, Math.min(W, D) * 0.28, 0.5, 0, '#6d6d6d', { roughness: 0.95 }, Math.min(W, D) * 0.28, 12); cyl(p, 0, 0, Math.min(W, D) * 0.24, 0.05, 0.48, '#7fd1c8', { transparent: true, opacity: 0.9 })
      for (let i = 0; i < 2; i++) { const l = grp(g, W - 1, 1.5 + i * 1.3, FACE.w); box(l, -0.35, -0.9, 0.7, 1.8, 0.35, 0, '#d9b98c') }
    }
    for (let i = 0; i < 4; i++) { const b = grp(g, 0.4, 1 + i * 0.4); cyl(b, 0, 0, 0.04, 2.4, 0, '#7cb342'); ball(b, 0, 2.3, 0, 0.2, '#558b2f') }
  },
  gym(g, W, D, ctx, k) {
    const v = k % 3
    if (v === 1) { // 有氧區：一排跑步機、飛輪
      for (let i = 0; i < Math.floor((D - 1) / 1.3); i++) { const t = grp(g, W - 0.9, 1 + i * 1.3, FACE.e); box(t, -0.4, -0.9, 0.8, 1.8, 0.2, 0, '#212121'); box(t, -0.35, 0.75, 0.7, 0.2, 0.1, 1.3, '#424242'); box(t, -0.4, 0.7, 0.05, 0.2, 1.2, 0.2, '#424242'); box(t, 0.35, 0.7, 0.05, 0.2, 1.2, 0.2, '#424242') }
      for (let i = 0; i < Math.floor((D - 1) / 1.4); i++) { const b = grp(g, W - 3, 1 + i * 1.4, FACE.e); box(b, -0.3, -0.5, 0.6, 1, 0.1, 0, '#212121'); box(b, -0.05, -0.1, 0.1, 0.1, 0.9, 0.1, '#e53935'); box(b, -0.15, -0.2, 0.3, 0.25, 0.08, 1.0, '#212121') }
    } else if (v === 2) { // 重訓區：深蹲架、臥推、啞鈴
      for (const z of [D * 0.3, D * 0.7]) { const r = grp(g, W / 2, z); for (const a of [-1, 1]) box(r, a * 0.9 - 0.05, -0.05, 0.1, 0.1, 2.3, 0, '#37474f', { metalness: 0.6 }); cyl(r, 0, 0, 0.02, 2, 1.4, '#9e9e9e', { metalness: 0.8 }).rotation.z = Math.PI / 2; box(r, -0.15, -0.6, 0.3, 1.2, 0.45, 0, '#212121') }
      const rk = grp(g, 0.35, D / 2, FACE.e); box(rk, -1.5, -0.25, 3, 0.5, 0.8, 0, '#37474f', { metalness: 0.5 }); for (let i = 0; i < 10; i++) cyl(rk, -1.35 + i * 0.3, 0, 0.07, 0.12, 0.85, '#212121').rotation.x = Math.PI / 2
    } else { // 瑜伽、拳擊：瑜伽墊、沙包、鏡牆
      for (let i = 0; i < 6; i++) { const m = grp(g, 1 + (i % 3) * 1.1, D / 2 - 1 + Math.floor(i / 3) * 2.2, 0, 'rug'); box(m, -0.3, -0.9, 0.6, 1.8, 0.02, 0, ['#8e24aa', '#00897b', '#f4511e'][i % 3]) }
      for (const z of [D * 0.3, D * 0.7]) { const bg = grp(g, W - 1.5, z); cyl(bg, 0, 0, 0.18, 1.1, 0.7, '#b71c1c'); cyl(bg, 0, 0, 0.01, 0.95, 1.8, '#9e9e9e') }
    }
    const mr = grp(g, W / 2, 0.1); box(mr, -W / 3, -0.02, (W * 2) / 3, 0.04, 1.8, 0.2, '#cfe8f3', { metalness: 0.9, roughness: 0.05 })
  },
  tatami(g, W, D, ctx, k) {
    const ew = 1.3
    // 跟北邊那一間隔一排襖（拉門），中間留通道
    const fw = W - ew
    for (const [a, b] of [[0, fw * 0.38], [fw * 0.62, fw]]) { const f = grp(g, (a + b) / 2, 0.05); box(f, -(b - a) / 2, -0.03, b - a, 0.06, 2.2, 0, '#efe6cf'); box(f, -(b - a) / 2, -0.04, b - a, 0.08, 0.08, 2.2, '#5d4037') }
    ROOMS3D.tatamiCommon(g, W, D)
    const cx = fw / 2, cz = D / 2
    if (k % 3 === 1) { // 囲爐裏
      const ir = grp(g, cx, cz); box(ir, -0.6, -0.6, 1.2, 1.2, 0.08, 0, '#5d4037'); box(ir, -0.45, -0.45, 0.9, 0.9, 0.09, 0, '#8d8d8d', { roughness: 1 })
      cyl(ir, 0, 0, 0.012, TOP - 0.7, 0.7, '#3e2723'); ball(ir, 0, 0.55, 0, 0.18, '#263238', { metalness: 0.6, roughness: 0.4 }); ball(ir, 0, 0.12, 0, 0.1, '#ff7043', GLOW('#ff5722'))
      for (const [dx, dz] of [[-0.95, 0], [0.95, 0], [0, -0.95], [0, 0.95]]) { const c = grp(g, cx + dx, cz + dz, 0, 'rug'); box(c, -0.3, -0.3, 0.6, 0.6, 0.08, 0, '#283a5e') }
    } else if (k % 3 === 2) { // 鋪好的被褥、簞笥
      for (const dx of [-0.6, 0.6]) { const f = grp(g, cx + dx, cz, 0, 'rug'); box(f, -0.45, -1, 0.9, 2, 0.1, 0, '#fafafa'); box(f, -0.43, -0.4, 0.86, 1.3, 0.06, 0.1, '#5c7aa3'); box(f, -0.25, -0.95, 0.5, 0.3, 0.1, 0.1, '#ffffff') }
      const ts = grp(g, 0.3, cz, FACE.e); box(ts, -0.6, -0.25, 1.2, 0.5, 1.1, 0, '#8d5a3b', { roughness: 0.5 }); cyl(ts, 0, 0, 0.12, 0.1, 1.1, '#5d7a8c'); ball(ts, 0, 1.35, 0, 0.18, '#2e7d32')
    } else { // 茶室：風爐、茶釜、茶道具
      const fu = grp(g, cx, cz); cyl(fu, 0, 0, 0.22, 0.25, 0, '#3e2723'); ball(fu, 0, 0.38, 0, 0.17, '#263238', { metalness: 0.6 }); cyl(fu, 0.5, 0.2, 0.06, 0.08, 0, '#5d7a3a'); cyl(fu, 0.65, -0.1, 0.05, 0.1, 0, '#efebe9')
      for (const [dx, dz] of [[-0.9, 0], [0, 0.9]]) { const c = grp(g, cx + dx, cz + dz, 0, 'rug'); box(c, -0.3, -0.3, 0.6, 0.6, 0.08, 0, '#7b2d26') }
      const an = grp(g, 0.5, 0.6); box(an, -0.18, -0.18, 0.36, 0.36, 0.75, 0, '#fff3dc', GLOW('#ffd9a0', 0.8))
    }
  },
}
const SINGLE = new Set(['game', 'museum', 'theater', 'pool', 'living', 'gate', 'studio', 'bath', 'pavilion', 'cellar', 'sports', 'court'])
const MAIN_LAST = new Set(['kitchen']) // 主家具靠南牆的房間：主家具放在最南邊那一塊
const CHUNK = 11 // m

// 房間家具：回傳放好位置、縮放好的群組（3D 直接加進場景；2D 平面圖拿每件家具的外框）
//   openings：plan.js 的門；門口前 1.3 m（門寬左右各多 0.2 m）有家具就拿掉
const byId = Object.fromEntries(ROOMS.map((r) => [r.id, r]))
export function furnish(rm, openings, BASE = 0) {
  const [rx, ry, rw, rh] = rm.rect
  const W = rw * M, D = rh * M
  const loc = ([x, y, w, h]) => [(x - rx) * M, (y - ry) * M, w * M, h * M]
  const ctx = { wc: rm.wc && loc(rm.wc), enclave: null }
  // 這間房的門（房間座標）：o＝h 在南北牆、v 在東西牆；a0～a1 是門的範圍、line 是牆的位置
  const doors = openings.filter((d) => d.zs.some((z) => owner(z) === rm.id)).map((d) => ({ o: d.o, a0: (d.a0 - (d.o === 'h' ? rx : ry)) * M, a1: (d.a1 - (d.o === 'h' ? rx : ry)) * M, line: (d.line - (d.o === 'h' ? ry : rx)) * M }))
  for (const r of ROOMS) if (r !== rm && r.rect[0] >= rx && r.rect[1] >= ry && r.rect[0] + r.rect[2] <= rx + rw && r.rect[1] + r.rect[3] <= ry + rh) ctx.enclave = loc(r.rect)
  const g = new THREE.Group()
  const nx = SINGLE.has(rm.kind) ? 1 : Math.max(1, Math.round(W / CHUNK)), nz = SINGLE.has(rm.kind) ? 1 : Math.max(1, Math.round(D / CHUNK))
  const cut = (r, x0, z0, cw, cd) => { if (!r) return null; const a = Math.max(r[0], x0), b = Math.max(r[1], z0), c = Math.min(r[0] + r[2], x0 + cw), d = Math.min(r[1] + r[3], z0 + cd); return c > a && d > b ? [a - x0, b - z0, c - a, d - b] : null }
  // 主家具放在沒有附屬衛浴的那一塊
  const blocks = []
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) blocks.push([i, j])
  const free = blocks.map(([i, j]) => !cut(ctx.wc, (i * W) / nx, (j * D) / nz, W / nx, D / nz) && !cut(ctx.enclave, (i * W) / nx, (j * D) / nz, W / nx, D / nz))
  const mainAt = MAIN_LAST.has(rm.kind) ? free.lastIndexOf(true) : free.indexOf(true)
  blocks.forEach(([i, j], n) => {
    const x0 = (i * W) / nx, z0 = (j * D) / nz, cw = W / nx, cd = D / nz
    const cg = new THREE.Group()
    const k = n === mainAt ? 0 : n < mainAt ? n + 1 : n
    const fn = k === 0 || !EXTRA[rm.kind] ? ROOMS3D[rm.kind] : EXTRA[rm.kind]
    fn?.(cg, cw, cd, { wc: cut(ctx.wc, x0, z0, cw, cd), enclave: cut(ctx.enclave, x0, z0, cw, cd), doors }, k)
    for (const c of [...cg.children]) { c.position.x += x0; c.position.z += z0; g.add(c) }
  })
  // 門口淨空
  const clear = []
  for (const d of openings) {
    if (!d.zs.some((z) => owner(z) === rm.id)) continue
    const a0 = (d.a0 - (d.o === 'h' ? rx : ry)) * M - 0.1, a1 = (d.a1 - (d.o === 'h' ? rx : ry)) * M + 0.1
    const c = (d.line - (d.o === 'h' ? ry : rx)) * M
    clear.push(d.o === 'h' ? [a0, c - 1.0, a1, c + 1.0] : [c - 1.0, a0, c + 1.0, a1]) // 門前 1 m 淨空
  }
  // 附屬衛浴、包在裡面的房間：那塊不放主房間的家具
  for (const r of [ctx.wc, ctx.enclave]) if (r) clear.push([r[0], r[1], r[0] + r[2], r[1] + r[3]])
  // 擋到門的家具：先往旁邊推（四個方向找最短、推完不出房間、不撞到別的家具），推不開才拿掉
  const box3 = new THREE.Box3()
  const hit = (bx, r) => bx[2] > r[0] && bx[0] < r[2] && bx[3] > r[1] && bx[1] < r[3]
  const boxOf = (c) => { box3.setFromObject(c); return [box3.min.x, box3.min.z, box3.max.x, box3.max.z] }
  const bumped = (g.userData.bumped = []) // 被門口推開、拿掉的家具（檢查用）
  const movable = g.children.filter((c) => !['hang', 'rug', 'fixed'].includes(c.userData.kind))
  const kept = movable.map(boxOf)
  movable.forEach((c, i) => {
    const bx = kept[i]
    if (!clear.some((r) => hit(bx, r))) return
    const others = kept.filter((o, j) => j !== i && o && !hit(bx, o))
    let best = null
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (let t = 0.1; t <= 3; t += 0.1) {
      const nb = [bx[0] + dx * t, bx[1] + dz * t, bx[2] + dx * t, bx[3] + dz * t]
      if (nb[0] < 0.02 || nb[1] < 0.02 || nb[2] > W - 0.02 || nb[3] > D - 0.02) break
      if (clear.some((r) => hit(nb, r)) || others.some((o) => hit(nb, o))) continue
      if (!best || t < best[2]) best = [dx, dz, t]
      break
    }
    if (best) { c.position.x += best[0] * best[2]; c.position.z += best[1] * best[2]; kept[i] = boxOf(c) }
    else { g.remove(c); kept[i] = null }
    bumped.push({ room: rm.name, how: best ? 'moved ' + best[2].toFixed(1) : 'removed', box: bx.map((v) => +v.toFixed(2)), col: c.getObjectByProperty('isMesh', true)?.material.color.getHexString() })
  })
  g.scale.setScalar(S)
  g.position.set(rx, BASE, ry)
  const out = [g]
  if (rm.wc) { // 附屬衛浴自己一組
    const wg = new THREE.Group()
    ROOMS3D.wc(wg, rm.wc[2] * M, rm.wc[3] * M, {})
    wg.scale.setScalar(S)
    wg.position.set(rm.wc[0], BASE, rm.wc[1])
    out.push(wg)
  }
  return out
}

// 模擬市民風的小人（身高約 1.7 m）：pose＝stand 站、sit 坐（椅面 0.45 m 高）、swim 游泳（只露出頭和肩膀）
//   (x, z) 是腳底中心、rot 是面朝的方向（FACE），y 是站或坐的那個平面高度
export function person(x, z, rot = 0, pose = 'stand', { shirt = '#e57373', pants = '#37474f', hair = '#3e2723', skin = '#f1c6a5', y = 0 } = {}) {
  const g = grp(new THREE.Group(), x, z, rot)
  g.position.y = y
  const parent = g.parent
  parent.remove(g)
  if (pose === 'swim') {
    ball(g, 0, 0.05, 0, 0.11, skin)
    box(g, -0.2, -0.07, 0.4, 0.14, 0.08, -0.08, shirt) // 肩膀在水面
    ball(g, 0, 0.11, 0.02, 0.1, hair)
    return g
  }
  const hip = pose === 'sit' ? 0.45 : 0.85
  if (pose === 'sit') {
    for (const s of [-0.09, 0.09]) { box(g, s - 0.06, 0, 0.12, 0.45, 0.13, hip - 0.13, pants); box(g, s - 0.06, 0.38, 0.12, 0.12, hip - 0.13, 0, pants) } // 大腿往前、小腿垂下
  } else { // 站著：腿、手臂各掛在髖、肩膀的轉軸上（走路時前後擺）
    g.userData.legs = [-0.09, 0.09].map((s) => { const l = grp(g, s, 0); l.position.y = hip; box(l, -0.06, -0.07, 0.12, 0.14, hip, -hip, pants); return l })
  }
  box(g, -0.19, -0.11, 0.38, 0.22, 0.58, hip, shirt) // 身體
  if (pose === 'sit') for (const s of [-1, 1]) box(g, s * 0.25 - 0.05, -0.05, 0.1, 0.1, 0.55, hip + 0.02, shirt) // 手臂
  else g.userData.arms = [-1, 1].map((s) => { const a = grp(g, s * 0.25, 0); a.position.y = hip + 0.57; box(a, -0.05, -0.05, 0.1, 0.1, 0.55, -0.55, shirt); ball(a, 0, -0.58, 0, 0.05, skin); return a })
  ball(g, 0, hip + 0.74, 0, 0.12, skin) // 頭
  ball(g, 0, hip + 0.79, -0.02, 0.11, hair) // 頭髮
  return g
}

// 樂高小人（照真的 minifig 比例放大到 1.7 m）：黃色圓柱頭＋頭頂凸點、笑臉、頭髮、梯形身體、斜斜的手臂、C 型黃色手、
//   腰部、兩條方方的腿；sit 時腿從腰往前折 90°；swim 只露出頭和肩膀
export function minifig(rot = 0, pose = 'stand', { shirt = '#c91a09', pants = '#0055bf', hair = '#582a12' } = {}) {
  const g = new THREE.Group()
  g.rotation.y = rot
  const YEL = '#f2cd37', P = { roughness: 0.28 }
  const legH = 0.56, hipH = 0.1, torsoH = 0.56, hipY = pose === 'sit' ? 0.45 : legH
  if (pose === 'swim') {
    cyl(g, 0, 0, 0.2, 0.36, -0.05, YEL, P); cyl(g, 0, 0, 0.09, 0.06, 0.31, YEL, P)
    add(g, new THREE.SphereGeometry(0.22, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), hair, P, 0, 0.2, 0.01)
    box(g, -0.32, -0.17, 0.64, 0.34, 0.1, -0.12, '#36aebf', P)
    return g
  }
  // 腿
  for (const s of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(s * 0.165, hipY, 0); g.add(leg); (g.userData.legs ??= []).push(leg)
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.31, legH, 0.34), mat(pants, P)); m.position.set(0, -legH / 2, 0); m.castShadow = true; leg.add(m)
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.31, 0.1, 0.42), mat(pants, P)); foot.position.set(0, -legH + 0.05, 0.04); leg.add(foot)
    if (pose === 'sit') leg.rotation.x = -Math.PI / 2 // 往前（+z）折
  }
  // 腰
  box(g, -0.33, -0.17, 0.66, 0.34, hipH, hipY, pants, P)
  // 身體：上窄下寬的梯形（四邊形柱，轉 45°）
  const ty = hipY + hipH
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.25 * Math.SQRT2, 0.33 * Math.SQRT2, torsoH, 4, 1), mat(shirt, P))
  torso.rotation.y = Math.PI / 4; torso.scale.set(1, 1, 0.55); torso.position.set(0, ty + torsoH / 2, 0); torso.castShadow = true; g.add(torso)
  // 手臂＋C 型手
  for (const s of [-1, 1]) {
    const arm = new THREE.Group(); arm.position.set(s * 0.3, ty + torsoH - 0.08, 0); arm.rotation.z = s * 0.18; arm.rotation.x = pose === 'sit' ? -0.5 : -0.15; g.add(arm); (g.userData.arms ??= []).push(arm)
    const a = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.42, 12), mat(shirt, P)); a.position.set(0, -0.2, 0); a.castShadow = true; arm.add(a)
    const h = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.035, 8, 16, Math.PI * 1.5), mat(YEL, P)); h.position.set(0, -0.47, 0.04); h.rotation.set(Math.PI / 2, 0, Math.PI / 4); arm.add(h)
  }
  // 脖子、頭、頭頂凸點、笑臉、頭髮
  const hy = ty + torsoH
  cyl(g, 0, 0, 0.09, 0.05, hy, YEL, P)
  cyl(g, 0, 0, 0.2, 0.36, hy + 0.05, YEL, P)
  for (const s of [-1, 1]) ball(g, s * 0.07, hy + 0.27, 0.19, 0.025, '#05131d')
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.012, 6, 16, Math.PI), mat('#05131d')); mouth.position.set(0, hy + 0.19, 0.195); mouth.rotation.z = Math.PI; g.add(mouth)
  add(g, new THREE.SphereGeometry(0.225, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), hair, P, 0, hy + 0.3, -0.01).scale.set(1, 0.75, 1)
  box(g, -0.21, -0.215, 0.42, 0.14, 0.26, hy + 0.12, hair, P) // 後腦的頭髮
  return g
}

// 北海岸野柳的雕塑（客廳北邊的庭園）：女王頭（細脖子、往後梳的頭）、幾顆蕈狀岩、砂岩平台；3D 和 2D 平面圖共用
export function yehliu(x, z) {
  const g = new THREE.Group(); g.position.set(x, 0.08, z)
  const SAND = '#c8a678', CAP = '#9c7a52', o = { roughness: 1, flatShading: true }
  const base = cyl(g, 0, 0, 2.2, 0.25, 0, '#d8c09a', o, 2.0, 9); base.scale.set(1.3, 1, 0.9) // 砂岩平台
  const q = nm(grp(g, -0.6, 0, 0.3), '女王頭')
  cyl(q, 0, 0, 0.45, 0.5, 0.25, SAND, o, 0.3, 10); cyl(q, 0, 0, 0.3, 0.9, 0.75, SAND, o, 0.18, 10) // 女王頭的脖子（越往上越細）
  const head = add(q, new THREE.SphereGeometry(0.42, 14, 10), SAND, o, 0.25, 2.0, 0); head.scale.set(1.9, 1.0, 0.8); head.rotation.z = 0.45 // 頭往後仰、拉長（女王的側臉）
  const bun = add(q, new THREE.SphereGeometry(0.26, 12, 8), CAP, o, -0.35, 2.4, 0); bun.scale.set(1.2, 0.8, 0.8) // 髮髻
  add(q, new THREE.ConeGeometry(0.12, 0.3, 8), SAND, o, 0.92, 1.72, 0).rotation.z = -Math.PI / 2 // 下巴
  for (const [mx, mz, s] of [[1.1, 0.5, 1], [1.5, -0.6, 0.75], [0.3, -1.0, 0.6], [-1.7, 0.6, 0.55]]) { // 蕈狀岩：細柄＋扁扁的岩帽
    const m = nm(grp(g, mx, mz), '蕈狀岩'); cyl(m, 0, 0, 0.18 * s, 0.6 * s, 0.25, SAND, o, 0.13 * s, 8)
    const cap = add(m, new THREE.SphereGeometry(0.42 * s, 12, 8), CAP, o, 0, 0.25 + 0.75 * s, 0); cap.scale.set(1, 0.55, 1)
  }
  return g
}

// 庭園裡的地標擺設（3D 和 2D 平面圖共用）：彰化兒童房外插一片小風車、金門酒窖門口的風獅爺
export function gardenArt(art) {
  const out = new THREE.Group()
  { // 小風車：三排插在花圃裡，四片彩色扇葉，朝西（面向庭園）
    const { x, z } = art.pinwheel, o = nm(grp(out, x, z, 0, 'fixed'), '小風車花圃'); o.position.y = 0.08
    box(o, -0.6, -2.2, 1.2, 4.4, 0.1, 0, '#6d4c41', { roughness: 1 })
    const C = ['#e53935', '#fdd835', '#1e88e5', '#43a047', '#ff7043', '#ab47bc']
    for (let r = 0; r < 2; r++) for (let k = 0; k < 7; k++) {
      const p = nm(grp(o, -0.3 + r * 0.6, -1.9 + k * 0.63 + r * 0.3, -Math.PI / 2 + (k % 3 - 1) * 0.3), '小風車')
      const h = 0.6 + ((k + r) % 3) * 0.12
      cyl(p, 0, 0, 0.01, h, 0.1, '#eeeeee')
      for (let b = 0; b < 4; b++) { const bl = add(p, new THREE.BoxGeometry(0.16, 0.07, 0.005).translate(0.08, 0.035, 0), C[(k + r * 2 + b) % C.length], { side: THREE.DoubleSide }, 0, 0.1 + h, 0.02); bl.rotation.z = b * Math.PI / 2 + k }
      ball(p, 0, 0.1 + h, 0.025, 0.015, '#fafafa')
    }
  }
  { // 風獅爺：石座上站著的獅子，披紅披風，面向酒窖的門口（朝東）
    const { x, z } = art.fengshi, o = nm(grp(out, x, z, FACE.e, 'fixed'), '風獅爺'), S2 = '#bfa58a', P = { roughness: 1 }
    box(o, -0.3, -0.3, 0.6, 0.6, 0.35, 0, '#9e9e9e', P)
    cyl(o, 0, 0, 0.17, 0.55, 0.35, S2, P, 0.15, 12); for (const s2 of [-1, 1]) cyl(o, s2 * 0.08, 0.02, 0.06, 0.25, 0.35, S2, P)
    const cape = add(o, new THREE.CylinderGeometry(0.17, 0.26, 0.5, 12, 1, true, Math.PI * 0.6, Math.PI * 0.8), '#c62828', { side: THREE.DoubleSide }, 0, 0.62, 0); void cape
    ball(o, 0, 1.08, 0.02, 0.2, S2, P); add(o, new THREE.TorusGeometry(0.19, 0.06, 6, 14), '#8d6e63', P, 0, 1.08, -0.02) // 頭、鬃毛
    for (const s2 of [-1, 1]) { ball(o, s2 * 0.07, 1.14, 0.18, 0.035, '#fafafa'); ball(o, s2 * 0.07, 1.14, 0.205, 0.015, '#212121'); cyl(o, s2 * 0.15, 0.08, 0.04, 0.3, 0.65, S2, P) } // 眼睛、前腳（抱胸）
    box(o, -0.08, 0.16, 0.16, 0.06, 0.06, 0.96, '#c62828') // 張開的嘴
  }
  { // 蘭嶼：泳池東南邊一座達悟族的涼台（架高的木平台、茅草屋頂、爬梯），旁邊沙地上一艘拼板舟（紅白黑三色、船頭船尾翹起）、曬飛魚的木架
    const { x, z } = art.lanyu, o = nm(grp(out, x, z, 0, 'fixed'), '蘭嶼涼台'); o.position.y = 0.08
    box(o, -2.2, -2.4, 4.4, 4.8, 0.03, 0, '#e6d3a3', { roughness: 1 }) // 沙地
    for (const [a, b] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) cyl(o, a, b, 0.08, 2.3, 0, '#6d4c41')
    box(o, -1.35, -1.35, 2.7, 2.7, 0.1, 1.0, '#a1887f') // 架高 1 m 的木平台
    const rf = add(o, new THREE.ConeGeometry(2.2, 0.8, 4), '#8d7b5a', { roughness: 1, flatShading: true }, 0, 2.6, 0); rf.rotation.y = Math.PI / 4 // 茅草屋頂
    for (let k = 0; k < 4; k++) box(o, 1.4, 1.0 - k * 0.08 - 0.4, 0.5, 0.05, 0.04, 0.2 + k * 0.25, '#5d4037') // 爬梯
    const bt = nm(grp(o, -0.3, 2.2 + 0.4, 0.15), '拼板舟') // 拼板舟（3.6 m）
    const hull = ball(bt, 0, 0.35, 0, 0.5, '#fafafa'); hull.scale.set(3.4, 0.7, 0.75)
    for (const s2 of [-1, 1]) { const tip = add(bt, new THREE.ConeGeometry(0.12, 0.9, 6), '#fafafa', {}, s2 * 1.75, 0.75, 0); tip.rotation.z = -s2 * 0.5; ball(bt, s2 * 1.95, 1.15, 0, 0.07, '#212121') } // 翹起的船頭船尾
    for (const s2 of [-1, 1]) { box(bt, -1.4, s2 * 0.37 - 0.01, 2.8, 0.02, 0.07, 0.42, '#c62828'); for (let k = 0; k < 6; k++) box(bt, -1.1 + k * 0.44, s2 * 0.375 - 0.01, 0.12, 0.02, 0.12, 0.28, '#212121') } // 紅色帶、黑色三角紋
    const fr = nm(grp(o, 1.5, -2.0), '曬飛魚架'); for (const a of [-0.8, 0.8]) cyl(fr, a, 0, 0.04, 1.5, 0, '#6d4c41'); box(fr, -0.9, -0.02, 1.8, 0.04, 0.04, 1.45, '#6d4c41')
    for (let k = 0; k < 6; k++) { const f = ball(fr, -0.7 + k * 0.28, 1.25, 0, 0.06, '#90a4ae', { metalness: 0.4 }); f.scale.set(0.6, 2.2, 0.4) } // 曬飛魚
  }
  { // 桃園車庫西牆外：一道鋼樓梯上屋頂的看飛機露台（機房、車庫這一角）；樓梯從南邊的庭園往北爬
    const [gx, gz] = ROOMS.find((r) => r.kind === 'garage').rect, o = nm(grp(out, gx, gz), '上屋頂的鋼樓梯'); o.position.y = 0.12
    stairs(o, { x: -1.3, z0: 6.6, n: 16, rise: 3.11 / 16, run: 0.26, w: 0.95, lz: 1.3, railX: -1.38, tread: '#78909c', glass: false })
  }
  return out
}

// 車道上停的特斯拉（使用者：車道上要停一台特斯拉）：Model 3 的比例（長 4.72、寬 1.85、高 1.44 m、軸距 2.875 m、輪徑 0.68 m），
// 珍珠白車身、整片深色玻璃車艙（玻璃車頂）、跑車式斜背、細長頭燈、橫貫車尾的紅色尾燈、黑色輪胎配灰色空力輪框
// 自己的座標：車頭朝 +x、寬朝 z、地面 y＝0；heading＝車頭方向（弧度，0＝東、π/2＝南）
export function tesla(x, z, y = 0, heading = 0) {
  const g = new THREE.Group(); g.name = '特斯拉'
  g.position.set(x, y, z); g.rotation.y = -heading
  const L = 2.36, WB = 1.4375, R = 0.34, W = 1.82
  // 車身側面輪廓（到腰線），底邊在兩個輪拱挖半圓
  const s = new THREE.Shape()
  s.moveTo(-L, 0.5); s.lineTo(-L + 0.06, 0.3)
  for (const cx of [-WB, WB]) { s.lineTo(cx - 0.42, 0.3); s.absarc(cx, R, 0.42, Math.PI - 0.1, 0.1, true) }
  s.lineTo(L - 0.1, 0.3); s.quadraticCurveTo(L + 0.02, 0.36, L, 0.55) // 前保桿
  s.quadraticCurveTo(L - 0.05, 0.72, L - 0.35, 0.78) // 鼻頭（沒有水箱罩）
  s.lineTo(0.95, 0.96) // 引擎蓋
  s.lineTo(-1.75, 1.0); s.quadraticCurveTo(-2.2, 1.0, -2.3, 0.92) // 車尾小鴨尾
  s.quadraticCurveTo(-L - 0.02, 0.8, -L, 0.5)
  const PEARL = { metalness: 0.35, roughness: 0.22 }
  const bodyG = new THREE.ExtrudeGeometry(s, { depth: W - 0.12, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 4, curveSegments: 10 })
  bodyG.translate(0, 0, -(W - 0.12) / 2)
  const body = new THREE.Mesh(bodyG, mat('#f1f1ee', PEARL)); body.castShadow = body.receiveShadow = true
  // 車艙：擋風玻璃、玻璃車頂、斜背後窗一整片深色玻璃
  const c = new THREE.Shape()
  c.moveTo(1.0, 0.95); c.quadraticCurveTo(0.35, 1.3, -0.05, 1.42)
  c.quadraticCurveTo(-0.6, 1.47, -1.0, 1.4); c.quadraticCurveTo(-1.6, 1.22, -2.0, 1.0); c.lineTo(1.0, 0.95)
  const cabG = new THREE.ExtrudeGeometry(c, { depth: W - 0.42, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelSegments: 4, curveSegments: 10 })
  cabG.translate(0, 0, -(W - 0.42) / 2)
  const cab = new THREE.Mesh(cabG, mat('#1b2229', { metalness: 0.6, roughness: 0.08 })); cab.castShadow = true
  g.add(body, cab)
  const box = (w, h, d, px, py, pz, color, o) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, o)); m.position.set(px, py, pz); g.add(m); return m }
  for (const sz of [-1, 1]) {
    box(0.08, 0.05, 0.42, L - 0.22, 0.73, sz * 0.62, '#eaf6ff', { emissive: '#dff1ff', emissiveIntensity: 1.2 }).rotation.z = -0.35 // 細長頭燈
    box(0.2, 0.09, 0.07, 0.75, 1.02, sz * (W / 2 + 0.06), '#1b2229') // 後照鏡
  }
  box(0.04, 0.06, W - 0.2, -L - 0.02, 0.86, 0, '#c62828', { emissive: '#ff2a2a', emissiveIntensity: 0.9 }) // 橫貫車尾的尾燈
  // 輪子：黑色輪胎＋灰色空力輪框（外側一片圓盤）
  const tire = new THREE.CylinderGeometry(R, R, 0.24, 24).rotateX(Math.PI / 2), rim = new THREE.CylinderGeometry(0.25, 0.25, 0.02, 24).rotateX(Math.PI / 2)
  for (const cx of [-WB, WB]) for (const sz of [-1, 1]) {
    const t = new THREE.Mesh(tire, mat('#151515', { roughness: 0.9 })); t.position.set(cx, R, sz * 0.8); t.castShadow = true
    const r = new THREE.Mesh(rim, mat('#9ea4a8', { metalness: 0.7, roughness: 0.35 })); r.position.set(cx, R, sz * 0.925)
    g.add(t, r)
  }
  return g
}
