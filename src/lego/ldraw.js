// 樂高頁的真實零件形狀：LDraw 官方零件庫（CC BY 4.0，scripts/fetch-ldraw.mjs 抓下來打包成 data/lego-parts.mpd）
//   LDraw 單位：1 個凸點 20 LDU、磚高 24、薄板高 8；這裡 1 個凸點 0.4 m → 1 LDU ＝ 0.02 m
//   LDraw 的 y 朝下，轉成 y 朝上；原點在零件頂面中心（凸點從 y＝0 往上凸 0.08 m），1×N 的零件沿 x 排
import * as THREE from 'three'
import { LDrawLoader } from 'three/addons/loaders/LDrawLoader.js'
import { LDrawConditionalLineMaterial } from 'three/addons/materials/LDrawConditionalLineMaterial.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import LIB from './data/lego-parts.mpd?raw'

export const LDU = 0.02
// 1×1～1×4（index ＝ 長度 − 1）
export const BRICK = ['3005', '3004', '3622', '3010'], PLATE_PART = ['3024', '3023', '3623', '3710'], TILE = ['3070b', '3069b', '63864', '2431']
const ALL = [...BRICK, ...PLATE_PART, ...TILE, 'stud']
const COLOURS = '0 !COLOUR Main_Colour CODE 16 VALUE #FFFFFF EDGE #000000\n0 !COLOUR Edge_Colour CODE 24 VALUE #000000 EDGE #000000\n'

const FLIP = new THREE.Matrix4().makeRotationX(Math.PI).premultiply(new THREE.Matrix4().makeScale(LDU, LDU, LDU))
let cache = null
// 零件名 → BufferGeometry（只留面，不要 LDraw 的黑色輪廓線）
export function loadParts() {
  return (cache ??= Promise.all(ALL.map((id) => new Promise((ok, fail) => {
    new LDrawLoader().setConditionalLineMaterial(LDrawConditionalLineMaterial).parse(`0 FILE main.ldr\n${COLOURS}1 16 0 0 0 1 0 0 0 1 0 0 0 1 ${id}.dat\n0 NOFILE\n${LIB}`, (group) => {
      group.updateMatrixWorld(true)
      const geos = []
      group.traverse((o) => {
        if (!o.isMesh) return
        const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()
        for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k)
        g.clearGroups()
        geos.push(g.applyMatrix4(o.matrixWorld).applyMatrix4(FLIP))
      })
      ok([id, mergeGeometries(geos)])
    }, fail)
  }))).then((list) => new Map(list)))
}

// 零件表上的名字
export const PART_NAME = Object.fromEntries([
  ...BRICK.map((id, i) => [id, `磚 1×${i + 1}`]), ...PLATE_PART.map((id, i) => [id, `薄板 1×${i + 1}`]), ...TILE.map((id, i) => [id, `平滑磚 1×${i + 1}`]),
  ['3811', '底板 32×32'],
])

// looks.js 的樂高標準色 → LDraw 色號（Stud.io、LDraw 軟體開檔用）；不在表上的找最接近的一色
const CODE = { '#f4f4f4': 15, '#fcfcfc': 15, '#a0a5a9': 71, '#6c6e68': 72, '#1b2a34': 0, '#05131d': 0, '#c91a09': 4, '#720e0f': 320, '#0055bf': 1, '#5a93db': 73,
  '#f2cd37': 14, '#fe8a18': 25, '#237841': 2, '#4b9f4a': 10, '#bbe90b': 27, '#e4cd9e': 19, '#958a73': 28, '#582a12': 70, '#a95500': 484, '#ff698f': 353,
  '#fecccf': 77, '#c870a0': 5, '#36aebf': 322, '#aee9ef': 323, '#73dca1': 74, '#d67572': 335, '#9ba19d': 7, '#d09168': 92, '#aa7d55': 84 }
export function ldrawCode({ hex, trans }) {
  if (trans) return trans < 0.6 ? 47 : 43 // 玻璃 → 透明（Trans-Clear）；水 → 透明淺藍（Trans-Light Blue）
  if (CODE[hex] != null) return CODE[hex]
  const c = new THREE.Color(hex)
  let best = 15, bd = Infinity
  for (const [h, code] of Object.entries(CODE)) { const p = new THREE.Color(h), d = (p.r - c.r) ** 2 + (p.g - c.g) ** 2 + (p.b - c.b) ** 2; if (d < bd) { bd = d; best = code } }
  return best
}

// 零件清單 → .ldr 文字：placed 是 brickify.js 的 { id, col, x, y, z, rot }（公尺、零件頂面中心；col：{ hex, trans }）
//   y0（公尺）是 LDraw 的 y＝0；LDraw 的 y、z 跟這裡相反（繞 x 轉 180°）
export function toLdr(placed, { title, y0 }) {
  const f = (v) => +v.toFixed(2)
  const lines = [`0 ${title}`, '0 Name: day27-lego.ldr', '0 Author: #30DayMapChallenge 2026 Day 27', '0 LDraw parts: CC BY 4.0 (ldraw.org)', '']
  for (const p of placed) {
    const rot = p.rot ? '0 0 1 0 1 0 -1 0 0' : '1 0 0 0 1 0 0 0 1'
    lines.push(`1 ${ldrawCode(p.col)} ${f(p.x / LDU)} ${f(-(p.y - y0) / LDU)} ${f(-p.z / LDU)} ${rot} ${p.id}.dat`)
  }
  return lines.join('\r\n') + '\r\n'
}
