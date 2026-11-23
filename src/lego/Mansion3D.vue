<template>
  <!-- 台灣豪宅 3D（模擬市民風）：plan.js 算好的牆、門、窗，furniture.js 的家具；每間房不同壁紙，選到的房間頭上有綠色鑽石 -->
  <div ref="wrap" class="mansion" @pointermove="onMove" @pointerleave="emit('hover', null); tipName = ''" @click="onClick">
    <div v-if="tipName" class="obj-tip" :style="{ left: tipXY[0] + 'px', top: tipXY[1] + 'px' }">{{ tipName }}</div>
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as THREE from 'three'
import { MapControls } from 'three/addons/controls/MapControls.js'
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { ROOMS, HALLS, HALL, M, GLASS, ROOF_HATCH } from './layout.js'
import { computePlan, K, owner, kindOf } from './plan.js'
import { furnish, mat, person, minifig, yehliu, gardenArt, tesla, tickers, FACE, STAIR_RISE } from './furniture.js'
import { brickify, buildBricks } from './brickify.js'
import { loadParts, toLdr, PART_NAME } from './ldraw.js'
import { WALLPAPER, WAINSCOT, LEGO_PAL, MC_PAL, FLOOR } from './looks.js'
import { LOW } from '../lib/device.js'
import { lang, roomText, whoText } from '../i18n.js'

const props = defineProps({
  labels: { type: Boolean, default: true },
  walls: { type: String, default: 'cut' }, // cut：切面（模擬市民：靠鏡頭這邊的牆放低）｜full：全高｜low：全部放低
  view: { type: String, default: 'overview' },
  active: { type: String, default: null },
  hover: { type: String, default: null },
  outer: { type: [Boolean, String], default: 'auto' }, // 外牆：true 開、false 關、'auto' 看鏡頭遠近慢慢淡入淡出（WALL_FADE，拉得很近才拿掉）
  roof: { type: [Boolean, String], default: 'auto' }, // 屋頂（平屋頂、深出簷、屋頂花園）：true 開、false 關、'auto' 看鏡頭遠近慢慢淡入淡出（ROOF_FADE）
  night: { type: Boolean, default: false }, // 夜景
  court: { type: Boolean, default: false }, // 中庭的電動玻璃天窗：true＝關上
  look: { type: String, default: 'lego' },
  insetTop: { type: Number, default: 0 }, // 上面、下面被操作列擋住幾 px：畫面中心挪到看得到的那一塊正中間
  insetBottom: { type: Number, default: 0 }, // 畫風：sims 模擬市民｜lego 樂高｜mc 當個創世神
})
// 標籤的字跟著語言（i18n.js）：房名、縣市、人物
function relabel(o) { const t = roomText(o.userData.rm); o.element.innerHTML = `<b>${t.name}</b><span>${t.county}</span>` }
watch(lang, () => {
  for (const o of labelGroup.children) if (o.userData.rm) relabel(o)
  for (const w of walkers) if (w.tag) w.tag.element.textContent = whoText(w.who)
  tipName.value = ''
})
const emit = defineEmits(['hover', 'select', 'parts', 'ready'])

const WALL_H = 2.8 / M // 牆高 2.8 m
const U = WALL_H / 1.2 // 牆上裝飾的尺寸跟著牆高
const HEAD = 0.3 / M // 落地窗上面的窗楣 30 cm
const STONE = 0.7 / M // 外牆下段的石材勒腳 70 cm
const BASE = 0.12 // 基座厚度
const T_EXT = 0.25, T_INT = 0.12 // 外牆 25 cm、隔間牆 12 cm
// 每種房間的地板材質在 looks.js 的 FLOOR（2D 插畫平面圖也用）
// 壁紙、護牆板的顏色在 looks.js（圖例也用）
const ART = new Set(['museum', 'living', 'master', 'gate', 'study', 'guest', 'kids', 'family', 'dining', 'hall', 'onsen'])

const plan = computePlan()
const wrap = ref(null)
let renderer, labeler, scene, camera, controls, ro, raf = 0
let composer = null, tiltH, tiltV // 後製（目前不用：樂高頁的移軸景深會讓畫面霧霧的，拿掉了）
const labelGroup = new THREE.Group()
// 牆分組：內牆一組、外牆依朝外方向分四組；切面模式時，朝鏡頭的那幾組放低
const buckets = {}
const bucketOf = (out) => {
  const key = out ? out.join(',') : 'int'
  return (buckets[key] ??= { key, out, group: new THREE.Group(), art: new THREE.Group(), geo: {}, panels: {} })
}
const hangs = [] // 吊燈：只在全高時顯示
let placeArt = () => {} // 掛畫（家具擺好後）
let car = null // 車道上的特斯拉 { x, z, mesh, obj：現在畫的那個（樂高頁是積木群組）, base：obj 停好時的 position.z, driver：樂高頁車裡的小人 }
const furnGroups = [], gardenObjs = [] // 家具、庭園（樂高頁換成真的樂高磚）
const floors = [] // 每個房間（和走廊）的地板 mesh（滑鼠點選用）
const roomInfo = {} // id → { cx, cz, size }
const fly = { on: false, pos: new THREE.Vector3(), target: new THREE.Vector3() }
let plumbob, hemi, sun
const roofGroup = new THREE.Group(), nightGroup = new THREE.Group()
// 屋頂、外牆的「自動」：照鏡頭離對準點的距離慢慢淡入淡出（[全透明, 不透明] 公尺；中間照比例）
//   屋頂 80–160 m：全景 270 m、俯視 240 m 有屋頂；北部、南部 55 m 沒有
//   外牆 20–45 m：要拉得很近才拿掉外牆（看得到房間裡面），北部、南部 55 m 還有
const ROOF_FADE = [80, 160], WALL_FADE = [20, 45]
let roofOn = false, roofK = -1, wallK = -1 // roofOn：屋頂一半以上看得到（屋頂上的人才畫）；roofK、wallK：現在的不透明度（0–1）
// 材質先複製一份（樂高、創世神頁 applyLook 換上的材質跟別的東西共用，不能一起變透明）；換過材質（applyLook）就重新複製
const fadeBase = new WeakMap() // 複製出來的材質 → [原本的 opacity, transparent, depthWrite]
function fadeOf(mode, range) {
  if (mode !== 'auto') return mode ? 1 : 0
  if (!camera || !controls) return 1
  const d = camera.position.distanceTo(controls.target)
  return Math.min(1, Math.max(0, (d - range[0]) / (range[1] - range[0])))
}
function fade(obj, k) {
  obj.traverse((o) => {
    if (!o.isMesh) return
    const own = (m) => { if (fadeBase.has(m)) return m; const c = m.clone(); fadeBase.set(c, [m.opacity, m.transparent, m.depthWrite]); return c }
    o.material = Array.isArray(o.material) ? o.material.map(own) : own(o.material)
    for (const m of [o.material].flat()) {
      const [op, tr, dw] = fadeBase.get(m)
      m.opacity = op * k
      m.visible = k > 0.01
      const t = tr || k < 1
      if (m.transparent !== t) { m.transparent = t; m.needsUpdate = true }
      m.depthWrite = k < 1 ? false : dw
    }
  })
}
// 外牆：朝外的四組牆（bucketOf 有 out 的），含壁紙板、掛畫、樂高頁的磚（全高、矮牆兩組）
const outerWalls = () => Object.values(buckets).filter((b) => b.out).flatMap((b) => [b.group, b.art, ...(b.lego ? [b.lego.full, b.lego.low] : [])])
function updateRoof() {
  const k = fadeOf(props.roof, ROOF_FADE)
  roofOn = k >= 0.5
  roofGroup.visible = k > 0.01
  if (k !== roofK) { roofK = k; fade(roofGroup, k) }
  const w = fadeOf(props.outer, WALL_FADE)
  if (w !== wallK) { wallK = w; for (const g of outerWalls()) fade(g, w) }
}
const glowMats = [] // 夜裡要更亮的燈（所有自發光的材質）
let waterMats = []

// ── 畫風：樂高、當個創世神 ──
// 樂高：顏色換成樂高的標準色、亮面塑膠；牆壁畫出 1×4 磚的縫（錯縫）；牆頂、草地底板上有凸點
// 當個創世神：顏色換成方塊的顏色；球、圓柱、圓錐都變成方塊（樹變成方塊樹）；表面是 16×16 像素的方塊紋理，每 1 m 一塊方塊
// 調色盤 LEGO_PAL、MC_PAL 在 looks.js（圖例也用）
const LEGO_PITCH = 0.4 // 一個凸點 0.4 m（小人 1.7 m ≒ 4 個凸點高）；1×4 磚長 1.6 m、高 0.48 m
let legoParts = null // LDraw 的真實零件幾何（ldraw.js）：樂高頁掛載時先載好
let legoPlaced = [] // 樂高頁每個零件的位置、顏色（下載 .ldr、零件表）
let deckMesh = null // villa 的木平台（樂高頁換成平滑磚）
const gateRoads = [] // 大門步道、車道（樂高頁換成平滑磚：5 cm 厚不到一片薄板，體素化會整條不見）
function nearestColor(c, pal) {
  let best = pal[0], bd = Infinity
  for (const h of pal) { const p = new THREE.Color(h), d = (p.r - c.r) ** 2 + (p.g - c.g) ** 2 + (p.b - c.b) ** 2; if (d < bd) { bd = d; best = h } }
  return new THREE.Color(best)
}
function avgColor(tex) { // 貼圖的平均顏色（換掉貼圖時用）
  const img = tex.image, c = document.createElement('canvas'); c.width = c.height = 1
  const x = c.getContext('2d'); x.drawImage(img, 0, 0, 1, 1); const d = x.getImageData(0, 0, 1, 1).data
  return new THREE.Color(`rgb(${d[0]},${d[1]},${d[2]})`)
}
// 在材質的 shader 裡加世界座標，片段著色器依座標改顏色（磚縫或像素）
function inject(m, kind) {
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;\nvarying vec3 vNW;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        vec4 wp4 = vec4(transformed, 1.0); vec3 nw = objectNormal;
        #ifdef USE_INSTANCING
          wp4 = instanceMatrix * wp4; nw = mat3(instanceMatrix) * nw;
        #endif
        vWP = (modelMatrix * wp4).xyz; vNW = normalize(mat3(modelMatrix) * nw);`)
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;\nvarying vec3 vNW;\nfloat h3(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }')
      .replace('#include <color_fragment>', kind === 'brick' ? `#include <color_fragment>
        if (abs(vNW.y) < 0.5) {
          float row = floor(vWP.y / 0.48);
          float along = abs(vNW.x) > 0.5 ? vWP.z : vWP.x;
          float fy = fract(vWP.y / 0.48), fx = fract((along + mod(row, 2.0) * 0.8) / 1.6);
          if (fy < 0.07 || fx < 0.022) diffuseColor.rgb *= 0.55; else if (fy > 0.9) diffuseColor.rgb *= 1.08; // 磚縫、磚上緣一點高光
        }` : `#include <color_fragment>
        vec3 bp = floor(vWP + 0.0001);
        vec3 px = floor(vWP * 16.0 + 0.0001);
        diffuseColor.rgb *= (0.8 + 0.3 * h3(px)) * (0.93 + 0.12 * h3(bp));`)
  }
  m.needsUpdate = true
}
function applyLook(look) {
  const pal = look === 'lego' ? LEGO_PAL : MC_PAL
  const done = new Map()
  if (look === 'lego') legoBuild()
  const wallMeshes = new Set()
  for (const b of Object.values(buckets)) b.group.traverse((o) => o.isMesh && wallMeshes.add(o))
  const convert = (m, brick) => {
    const key = m.uuid + (brick ? 'b' : '')
    if (done.has(key)) return done.get(key)
    const base = m.map ? avgColor(m.map).multiply(m.color) : m.color.clone()
    if (look === 'lego' && m.color?.getHexString() === 'f1c6a5') return done.set(key, new THREE.MeshStandardMaterial({ color: '#f2cd37', roughness: 0.28 })).get(key) // 小人的臉：樂高黃
    const n = new THREE.MeshStandardMaterial({
      color: m.userData.look?.[look] ? new THREE.Color(m.userData.look[look]) : nearestColor(base, pal), transparent: m.transparent, opacity: m.opacity, depthWrite: m.depthWrite,
      emissive: m.emissive ?? new THREE.Color(0), emissiveIntensity: m.emissiveIntensity ?? 0,
      roughness: look === 'lego' ? 0.28 : 0.95, metalness: 0, flatShading: look === 'mc',
    })
    if (m.transparent && m.opacity < 0.6) { n.color.set(look === 'lego' ? '#aee9ef' : '#c0e4f7'); n.opacity = look === 'lego' ? 0.45 : 0.35 } // 透明磚／玻璃方塊
    n.userData = { ...m.userData }
    if (look === 'mc') inject(n, 'pixel')
    else if (brick) inject(n, 'brick')
    done.set(key, n)
    return n
  }
  const ROUND = new Set(['SphereGeometry', 'CylinderGeometry', 'ConeGeometry', 'CapsuleGeometry', 'OctahedronGeometry'])
  const BALL = new Set(['SphereGeometry', 'CapsuleGeometry'])
  scene.traverse((o) => {
    if (!o.isMesh || o === plumbob) return
    for (let q = o.parent; q; q = q.parent) if (q.userData.lego) return // 樂高小人本來就是樂高色，不用換
    if (o.geometry.type === 'PlaneGeometry' && o.geometry.parameters?.width > 500) return // 海
    const brick = wallMeshes.has(o)
    o.material = Array.isArray(o.material) ? o.material.map((m) => convert(m, brick)) : convert(o.material, brick)
    if (look === 'lego' && BALL.has(o.geometry.type)) { // 樂高沒有球：球變成圓磚（圓柱）
      o.geometry.computeBoundingBox()
      const bb = o.geometry.boundingBox, sz = bb.getSize(new THREE.Vector3()), c = bb.getCenter(new THREE.Vector3())
      o.geometry = new THREE.CylinderGeometry(Math.max(sz.x, sz.z) / 2, Math.max(sz.x, sz.z) / 2, sz.y * 0.9, 16).translate(c.x, c.y, c.z)
    }
    if (look === 'mc' && ROUND.has(o.geometry.type)) { // 圓的東西變成方塊
      o.geometry.computeBoundingBox()
      const bb = o.geometry.boundingBox, s = bb.getSize(new THREE.Vector3()), c = bb.getCenter(new THREE.Vector3())
      o.geometry = new THREE.BoxGeometry(s.x, s.y, s.z).translate(c.x, c.y, c.z)
    }
  })
  for (const m of floors) { m.userData.id && (m.material.emissive = new THREE.Color('#ffd54f')) } // 選房間時還是會亮
  if (look === 'lego') addStuds()
  scanGlow()
  scene.background.set(look === 'lego' ? '#bfe3f7' : '#7fb2ff')
}
// 樂高電影風：家具、庭園、門廊、吊燈都換成真的樂高磚（brickify.js），原本的圓滑模型拿掉
function legoBuild() {
  const colorOf = (m) => {
    if (m.transparent && m.opacity < 0.6) return { hex: '#aee9ef', trans: 0.45 } // 玻璃 → 透明磚
    const base = m.map ? avgColor(m.map).multiply(m.color) : m.color.clone()
    const hex = m.userData.look?.lego ?? '#' + nearestColor(base, LEGO_PAL).getHexString()
    const glow = m.emissive && m.emissive.getHex() && m.emissiveIntensity > 0.3 ? 0.9 : 0
    return { hex, trans: m.transparent ? 0.78 : 0, glow } // 水 → 透明藍磚
  }
  const tile = (m) => { for (let q = m; q; q = q.parent) if (q.userData.kind === 'rug' || q.userData.tile) return true; return false }
  for (const g of furnGroups) g.traverse((m) => { // 日月潭的湖岸線換成世界座標
    if (!m.userData.poly) return
    g.updateMatrixWorld(true)
    const v = new THREE.Vector3()
    m.userData.polyWorld = m.userData.poly.map(([x, z]) => { v.set(x, 0, z).applyMatrix4(g.matrixWorld); return [v.x, v.z] })
  })
  const hangSet = new Set(hangs)
  for (const h of hangs) h.parent.remove(h)
  const walls = legoWalls()
  const deck = legoDeck(walls.block)
  const roads = legoGates(walls.block, deck.cells)
  const carL = legoCar()
  if (car) { const i = gardenObjs.indexOf(car.mesh); if (i >= 0) gardenObjs.splice(i, 1) }
  const main = brickify([...furnGroups, ...gardenObjs], { y0: BASE, colorOf, tile, parts: legoParts, block: walls.block })
  const lamps = brickify([...hangSet], { y0: BASE, colorOf, tile, parts: legoParts, block: walls.block })
  for (const o of [...furnGroups, ...gardenObjs]) if (!o.userData.noBrick) scene.remove(o)
  scene.add(main.group, lamps.group)
  hangs.length = 0
  hangs.push(lamps.group)
  lamps.group.visible = props.walls === 'full'
  // 下載 .ldr、零件表：牆、家具、庭園、吊燈＋房間地板的平滑磚＋綠色底板（地板、底板網頁上不另外畫，用原本的地板、草地）
  const cells = new Set([...walls.block.keys(), ...main.cells.keys(), ...deck.cells.keys(), ...roads.cells.keys()].filter((k) => k.split(',')[1] === '0'))
  legoPlaced = [...walls.placed, ...deck.placed, ...roads.placed, ...carL.placed, ...main.placed, ...lamps.placed, ...legoFloor(cells), ...legoBaseplates()]
  const count = {}
  for (const p of legoPlaced) count[p.id] = (count[p.id] ?? 0) + 1
  const order = Object.keys(PART_NAME) // 磚、薄板、平滑磚、底板，各 1×1～1×4
  emit('parts', { list: Object.entries(count).sort(([a], [b]) => order.indexOf(a) - order.indexOf(b)).map(([id, n]) => ({ id, name: PART_NAME[id] ?? id, n })), total: legoPlaced.length })
}
// 樂高牆：每段牆換成 1 個凸點厚的磚牆（對齊凸點格；18 片薄板＝6 層磚，高 2.88 m）
//   實牆：外牆白色、最下面 2 層石材色（勒腳）；內牆是磚格中心落在哪一間就用那間的壁紙色（沒有壁紙的白色）
//   門：只砌門楣；落地窗、室內玻璃：最下一片黑框，上面透明磚、每 3 個凸點一支黑色直框，頂上 2 片牆楣；廚房吧台：窗台以下和牆楣
//   切面模式：每組牆另外蓋一份只有 1 層磚高的矮牆，切換顯示（不壓扁，凸點才不會變形）；壁紙板、掛畫、壁燈拿掉（會埋在 40 cm 厚的磚牆裡）
const WALL_N = 18
function legoWalls() {
  const P = LEGO_PITCH, lego = (h) => '#' + nearestColor(new THREE.Color(h), LEGO_PAL).getHexString()
  const mats = new Map([['glass', { hex: '#aee9ef', trans: 0.45 }]])
  const col = (hex) => { if (!mats.has(hex)) mats.set(hex, { hex }); return hex }
  const WHITE = col('#f4f4f4'), STONE_C = col(lego('#7d746a')), FRAME = col(lego('#2e3134')), GOLD = col(lego('#c9a227'))
  const zoneAt = (x, z) => plan.zone.get(`${Math.floor(x * K)},${Math.floor(z * K)}`)
  const solid = (r) => r.type === 'int' || r.type === 'ext'
  const per = new Map() // 牆的群組 → 磚格
  const block = new Map() // 所有牆佔走的格子 → { dir, line }（同一格只蓋一次：實牆先蓋，牆角歸先到的那段）
  for (const r of [...plan.runs].filter((r) => r.type !== 'open').sort((a, b) => solid(b) - solid(a))) {
    const bk = bucketOf(r.out), cells = per.get(bk) ?? per.set(bk, new Map()).get(bk)
    const dir = r.o === 'h' ? 'x' : 'z', across = Math.floor(r.line / P)
    for (let i = Math.ceil(r.a0 / P - 0.5); (i + 0.5) * P <= r.a1; i++) { // 格子中心落在這段牆上的
      const [ix, iz] = dir === 'x' ? [i, across] : [across, i]
      const wall = r.ext ? WHITE : col(lego(WALLPAPER[kindOf(zoneAt((ix + 0.5) * P, (iz + 0.5) * P))] ?? '#f4f4f4'))
      const set = (y0, y1, key) => {
        for (let iy = y0; iy < y1; iy++) { const k = `${ix},${iy},${iz}`; if (!block.has(k)) { cells.set(k, { key, dir }); block.set(k, { dir, line: r.line }) } }
      }
      const at = (f) => Math.round((WALL_H * f) / (P * 0.4)) // 牆高的幾成 → 第幾片薄板
      if (solid(r)) { if (r.ext) set(0, 6, STONE_C); set(0, WALL_N, wall) }
      else if (r.type === 'door' || r.type === 'garage') set(at(r.type === 'garage' ? 0.75 : 0.8), WALL_N, wall)
      else if (r.type === 'entrance') set(at(0.8), WALL_N, GOLD)
      else if (r.type === 'pass') { set(0, 6, wall); set(WALL_N - 2, WALL_N, wall) }
      else { set(0, 1, FRAME); set(1, WALL_N - 2, i % 3 ? 'glass' : FRAME); set(WALL_N - 2, WALL_N, wall) }
    }
  }
  const placed = []
  for (const [bk, cells] of per) {
    const low = new Map([...cells].filter(([k]) => +k.split(',')[1] < 3))
    const full = buildBricks(cells, mats, { y0: BASE, parts: legoParts }), short = buildBricks(low, mats, { y0: BASE, parts: legoParts })
    bk.group.clear(); bk.art.clear() // 原本的牆、壁紙板、掛畫
    bk.lego = { full: full.group, low: short.group }
    scene.add(full.group, short.group)
    placed.push(...full.placed)
  }
  wallKey = '' // 讓 setWalls 重新決定哪組牆放低
  return { block, placed }
}
// 木平台：照 plan.deck 的範圍鋪一層平滑磚（格子中心落在平台上的），顏色是木紋貼圖的平均色換成最接近的樂高色；原本的平台拿掉
function legoDeck(block) {
  const P = LEGO_PITCH, m = deckMesh.material, hex = '#' + nearestColor(avgColor(m.map).multiply(m.color), LEGO_PAL).getHexString()
  const cells = new Map()
  for (const [x, z, w, d] of plan.deck)
    for (let ix = Math.ceil(x / P - 0.5); (ix + 0.5) * P <= x + w; ix++) for (let iz = Math.ceil(z / P - 0.5); (iz + 0.5) * P <= z + d; iz++)
      if (!block.has(`${ix},0,${iz}`)) cells.set(`${ix},0,${iz}`, { key: hex, tile: true })
  const r = buildBricks(cells, new Map([[hex, { hex }]]), { y0: BASE, parts: legoParts })
  scene.remove(deckMesh)
  scene.add(r.group)
  return r
}
// 大門步道、車道：照原本的範圍鋪一層平滑磚（跟木平台同一層）；步道是碎石色，
//   車道照跑道畫：深灰柏油、兩側白邊線（最外一排）、中間白色虛線（3 個凸點亮、3 個空）；原本的薄板拿掉
function legoGates(block, taken) {
  const P = LEGO_PITCH, lego = (h) => '#' + nearestColor(new THREE.Color(h), LEGO_PAL).getHexString()
  const GRAVEL = lego('#ddd0b5'), ASPHALT = lego('#3b3f43'), LINE = lego('#f5f5f5')
  const cells = new Map(), mats = new Map([GRAVEL, ASPHALT, LINE].map((h) => [h, { hex: h }]))
  for (const { mesh, x, z, w, d, drive } of gateRoads) {
    const i0 = Math.ceil(x / P - 0.5), i1 = Math.floor((x + w) / P - 0.5), mid = (i0 + i1) / 2
    for (let ix = i0; ix <= i1; ix++) for (let iz = Math.ceil(z / P - 0.5); (iz + 0.5) * P <= z + d; iz++) {
      const k = `${ix},0,${iz}`
      if (block.has(k) || taken.has(k)) continue
      const hex = !drive ? GRAVEL : ix === i0 || ix === i1 || (Math.abs(ix - mid) < 0.6 && iz % 6 < 3) ? LINE : ASPHALT
      cells.set(k, { key: hex, tile: true })
    }
    scene.remove(mesh)
  }
  const r = buildBricks(cells, mats, { y0: BASE, parts: legoParts })
  scene.add(r.group)
  return r
}
// 特斯拉的樂高版：自動體素化只剩一團黑白，改成一格一格排好的積木車（使用者：裡面要可以坐一個人、四周是玻璃）
//   照樂高小人比例：14 凸點長、車身 6 凸點寬（加兩側輪子 8）、13 片高；車艙中空，四周和車頂都是透明玻璃，駕駛座坐一個小人
//   u：車尾→車頭（0～13，車頭朝 +z 南邊的車庫）；v：寬（0、7 是輪子，1～6 車身；v 大＝東＝面向車頭的左邊＝駕駛座）；h：第幾片薄板（0＝貼著車道平滑磚上面）
function legoCar() {
  if (!car) return { placed: [] }
  const P = LEGO_PITCH
  const WHITE = '#f4f4f4', BLACK = '#1b2a34', RED = '#c91a09', GREY = '#a0a5a9', LIGHT = 'light', GLASS = 'glass'
  const mats = new Map([[WHITE, { hex: WHITE }], [BLACK, { hex: BLACK }], [RED, { hex: RED, glow: 0.6 }], [GREY, { hex: GREY }], [LIGHT, { hex: '#fdf6c8', trans: 0.75, glow: 0.8 }], [GLASS, { hex: '#aee9ef', trans: 0.3 }]]) // 玻璃比房子的窗再透一點，才看得到駕駛
  const ix0 = Math.round(car.x / P) - 4, iz0 = Math.round(car.z / P) - 7
  const cells = new Map()
  const put = (u, v, h, key) => cells.set(`${ix0 + v},${h + 1},${iz0 + u}`, { key, dir: 'z' })
  const UL = 13, wheel = (u) => u === 2 || u === 3 || u === 10 || u === 11
  const C0 = 3, C1 = 9 // 車艙（玻璃）從 u 3 到 9；前面引擎蓋、後面行李箱
  for (let u = 0; u <= UL; u++) for (let v = 0; v <= 7; v++) {
    if (v === 0 || v === 7) { if (wheel(u)) for (let h = 0; h < 3; h++) put(u, v, h, h === 1 ? GREY : BLACK); continue } // 輪子（中間一片灰色輪框）
    const edge = v === 1 || v === 6 || u === 0 || u === UL
    if (u >= 1 && u <= UL - 1) put(u, v, 0, BLACK) // 底盤
    put(u, v, 1, WHITE); put(u, v, 2, WHITE) // 車身下半、車艙地板
    const cabin = u >= C0 && u <= C1
    for (let h = 3; h <= 4; h++) if (!cabin || edge || u === C0 || u === C1) // 腰線以下：引擎蓋、行李箱實心；車艙只有外圈
      put(u, v, h, h === 4 && u === 0 ? RED : h === 4 && u === UL && (v === 1 || v === 6) ? LIGHT : WHITE) // 車尾整排紅燈、車頭兩顆前燈
    // 車艙玻璃：前後各往裡斜一格（擋風玻璃、斜背後窗），兩側一路到頂，車頂一整片玻璃
    if (!cabin) continue
    for (let h = 5; h <= 11; h++) {
      const f = h >= 9 ? C1 - 1 : C1, r = h >= 9 ? C0 + 1 : C0 // 上半段前後各縮一格
      if (u < r || u > f) continue
      if (v === 1 || v === 6 || u === r || u === f) put(u, v, h, GLASS)
    }
    if (u >= C0 + 1 && u <= C1 - 1) put(u, v, 12, GLASS) // 玻璃車頂
  }
  // 車裡：兩張黑色座椅（坐墊＋椅背）、儀表板、方向盤
  for (const v of [2, 3, 4, 5]) {
    put(6, v, 3, BLACK); put(5, v, 3, BLACK); put(5, v, 4, BLACK); put(5, v, 5, BLACK); put(5, v, 6, BLACK)
    put(C1 - 1, v, 3, BLACK); put(C1 - 1, v, 4, BLACK) // 儀表板
  }
  put(C1 - 2, 4, 5, BLACK); put(C1 - 2, 5, 5, BLACK) // 方向盤
  const r = buildBricks(cells, mats, { y0: BASE, parts: legoParts })
  // 駕駛：坐在左前座（v 4～5），臉朝車頭
  const seatTop = BASE + 5 * P * 0.4 // 坐墊（h 3）頂面：一片薄板＝0.4 凸點
  const fig = minifig(0, 'sit', { shirt: '#0055bf', pants: '#1b2a34', hair: '#582a12' })
  fig.position.set((ix0 + 5) * P, seatTop - 0.45, (iz0 + 6.4) * P)
  r.group.add(fig)
  fig.visible = false // 爸爸上車才出現（dadStep）
  scene.remove(car.mesh)
  scene.add(r.group)
  Object.assign(car, { obj: r.group, base: 0, driver: fig })
  return r
}
// 房間地板（只放進 .ldr）：地板上沒有牆、家具的格子鋪一層平滑磚，顏色跟網頁上的地板一樣
function legoFloor(taken) {
  const P = LEGO_PITCH, cells = new Map(), mats = new Map()
  const colorOf = new Map(floors.map(({ material: m, userData }) => [userData.zone, '#' + nearestColor(m.map ? avgColor(m.map).multiply(m.color) : m.color.clone(), LEGO_PAL).getHexString()]))
  for (const [key, z] of plan.zone) {
    const [i, j] = key.split(',').map(Number)
    for (let ix = Math.floor(i / K / P); ix * P < (i + 1) / K; ix++) for (let iz = Math.floor(j / K / P); iz * P < (j + 1) / K; iz++) {
      const cx = (ix + 0.5) * P, cz = (iz + 0.5) * P, k = `${ix},0,${iz}`
      if (Math.floor(cx * K) !== i || Math.floor(cz * K) !== j || taken.has(k) || !colorOf.has(z)) continue // 格子中心落在這一小格
      const hex = colorOf.get(z)
      if (!mats.has(hex)) mats.set(hex, { hex })
      cells.set(k, { key: hex, tile: true })
    }
  }
  return buildBricks(cells, mats, { y0: BASE, parts: legoParts, draw: false }).placed
}
// 綠色 32×32 底板（只放進 .ldr）：鋪滿整塊地，頂面在房子地板的高度，房子、家具直接扣在上面
function legoBaseplates() {
  const S = 32 * LEGO_PITCH, { x0, x1, z0, z1 } = plan.garden, list = []
  const sx = Math.floor(x0 / LEGO_PITCH) * LEGO_PITCH, sz = Math.floor(z0 / LEGO_PITCH) * LEGO_PITCH
  for (let x = sx; x < x1; x += S) for (let z = sz; z < z1; z += S) list.push({ id: '3811', col: { hex: '#4b9f4a' }, x: x + S / 2, y: BASE, z: z + S / 2, rot: false })
  return list
}
function downloadLdr(name) {
  const blob = new Blob([toLdr(legoPlaced, { title: 'LEGO Taiwan (Home Sweet Taiwan?)', y0: BASE })], { type: 'text/plain' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  URL.revokeObjectURL(a.href)
}
// 樂高凸點：草地底板、家具頂面（牆是真的磚，凸點在零件上）；一個凸點 0.4 m，顏色跟底下那塊一樣
function addStuds() {
  const pts = [] // [x, y, z, color]
  const c3 = (h) => new THREE.Color(h)
  // 草地底板（房子外面）
  const { x0, x1, z0, z1 } = plan.garden
  const zoneAt = (x, z) => plan.zone.get(`${Math.floor(x * K)},${Math.floor(z * K)}`)
  for (let x = x0 + 0.2; x < x1; x += LEGO_PITCH) for (let z = z0 + 0.2; z < z1; z += LEGO_PITCH) if (!zoneAt(x, z)) pts.push([x, z, 0.115, c3('#4b9f4a')])
  // 房間地板不放凸點：樂高的室內地板通常鋪平滑的磚（tile）
  // 家具頂面：不透明的方塊、頂面至少 0.35 m 見方、高度在牆以下
  const skip = new Set()
  for (const b of Object.values(buckets)) b.group.traverse((o) => skip.add(o))
  roofGroup.traverse((o) => skip.add(o))
  floors.forEach((m) => skip.add(m))
  const bb = new THREE.Box3()
  scene.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || skip.has(o) || o.geometry.type !== 'BoxGeometry') return
    const m = Array.isArray(o.material) ? o.material[0] : o.material
    if (m.transparent) return
    bb.setFromObject(o)
    const sx = bb.max.x - bb.min.x, sz = bb.max.z - bb.min.z
    if (sx < 0.35 || sz < 0.35 || sx * sz > 40 || bb.max.y > BASE + WALL_H - 0.1 || bb.max.y < BASE + 0.05) return
    for (let x = bb.min.x + 0.2; x < bb.max.x - 0.1; x += LEGO_PITCH) for (let z = bb.min.z + 0.2; z < bb.max.z - 0.1; z += LEGO_PITCH) pts.push([x, z, bb.max.y + 0.035, m.color])
  })
  // 用 InstancedMesh 畫 LDraw 的凸點（stud.dat，每顆有自己的顏色）
  // 上面的 y 是舊的圓柱中心（高 0.07），LDraw 凸點的原點在底面，所以往下 0.035
  const geo = legoParts.get('stud')
  const groups = {}
  for (const p of pts) (groups[p[4] ?? 'scene'] ??= []).push(p)
  const o = new THREE.Object3D()
  for (const [key, list] of Object.entries(groups)) {
    const im = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.28 }), list.length)
    list.forEach(([x, z, y, col], i) => { o.position.set(x, y - 0.035, z); o.updateMatrix(); im.setMatrixAt(i, o.matrix); im.setColorAt(i, col) })
    im.castShadow = false; im.receiveShadow = true
    ;(key === 'scene' ? scene : buckets[key]?.group ?? scene).add(im)
  }
}

// 浴室上面的天窗 [x, z, 寬, 深]：附屬衛浴、嘉義市化妝室、溫泉浴室（檜木桶湯上面）
const SKY = [...ROOMS.filter((r) => r.wc).map((r) => [r.wc[0] + 0.6, r.wc[1] + 0.6, r.wc[2] - 1.2, r.wc[3] - 1.2]),
  ...ROOMS.filter((r) => r.kind === 'bath').map(({ rect: [x, z, w, d] }) => [x + 0.6, z + 0.6, w - 1.2, d - 1.2]),
  ...ROOMS.filter((r) => r.kind === 'onsen').map(({ rect: [x, z, w, d] }) => [x + 1.0, z + d - 4.0, 2.4, 2.2])]
// ── 屋頂：現代 villa 的平屋頂。白色屋面、深古銅色薄簷；照縣市海拔分三層高低（平原 0、丘陵 0.4、山地 0.8 m），
//   西部走廊上一整條玻璃天窗；台北是屋頂露台（木平台、格柵棚架、躺椅），雲林、嘉義是屋頂花園，台南、高雄排太陽能板
const ROOF_TIER = { '10015': 2, '10014': 2, '10002': 1, '10004': 1, '10005': 1, '64000': 1, '66000': 1, '10010': 1, '67000': 1, '65000': 1 } // 其他 0
// 挖了洞的板（屋頂板、露台木地板）：照洞的東西兩邊切成直條，每條再扣掉蓋在上面的洞
function holed(list, x0, z0, x1, z1, holes, y, h) {
  const xs = [...new Set([x0, x1, ...holes.flatMap(([hx, , hw]) => [hx, hx + hw])])].filter((v) => v >= x0 && v <= x1).sort((a, b) => a - b)
  for (let i = 0; i < xs.length - 1; i++) {
    const xa = xs[i], xb = xs[i + 1]
    let c = z0
    for (const [, hz, , hd] of holes.filter(([hx, , hw]) => hx <= xa && hx + hw >= xb).sort((a, b) => a[1] - b[1])) {
      if (hz > c) { const g = new THREE.BoxGeometry(xb - xa, h, hz - c); g.translate((xa + xb) / 2, y, (c + hz) / 2); list.push(g) }
      c = Math.max(c, hz + hd)
    }
    if (c < z1) { const g = new THREE.BoxGeometry(xb - xa, h, z1 - c); g.translate((xa + xb) / 2, y, (c + z1) / 2); list.push(g) }
  }
}
function buildRoof() {
  const top = BASE + WALL_H
  const slab = [], fascia = [], green = [], skyl = [], frame = []
  const bx = (list, w, h, d, x, y, z) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); list.push(g) }
  const roofY = {}
  for (const r of ROOMS) {
    if (['pool', 'pavilion', 'court', 'cellar', 'sports'].includes(r.kind)) continue
    const [x, z, w, d] = r.rect, up = (ROOF_TIER[r.id] ?? 0) * 0.4, cx = x + w / 2, cz = z + d / 2
    roofY[r.id] = top + up + 0.25
    if (up) { bx(fascia, w + 0.02, up, 0.12, cx, top + up / 2, z); bx(fascia, w + 0.02, up, 0.12, cx, top + up / 2, z + d); bx(fascia, 0.12, up, d, x, top + up / 2, cz); bx(fascia, 0.12, up, d, x + w, top + up / 2, cz) }
    if (GLASS.has(r.id)) { // 溫室：玻璃人字屋頂（細鋁框，每 1.2 m 一支椽）
      const rise = 1.2, half = d / 2, slope = Math.hypot(half, rise), ang = Math.atan2(rise, half)
      for (const s2 of [-1, 1]) {
        const gl = new THREE.BoxGeometry(w + 0.1, 0.03, slope).rotateX(s2 * ang).translate(cx, top + up + rise / 2, cz + (s2 * half) / 2); skyl.push(gl)
        for (let t = x; t <= x + w + 0.01; t += w / Math.round(w / 1.2)) frame.push(new THREE.BoxGeometry(0.05, 0.06, slope).rotateX(s2 * ang).translate(t, top + up + rise / 2 + 0.03, cz + (s2 * half) / 2))
      }
      bx(frame, w + 0.1, 0.08, 0.08, cx, top + up + rise, cz) // 屋脊
      for (const zz of [z, z + d]) bx(frame, w + 0.1, 0.08, 0.08, cx, top + up, zz)
      continue
    }
    // 屋頂板；浴室上面開天窗（屋頂板挖一個洞、放一片有框的玻璃）
    // 屋頂板；浴室上面開天窗（屋頂板挖洞、放一片有框的玻璃），嘉義餐廳上面挖樓梯口
    const holes = [...SKY, ROOF_HATCH].filter(([hx, hz, hw, hd]) => hx >= x && hz >= z && hx + hw <= x + w && hz + hd <= z + d)
    holed(slab, x - 0.25, z - 0.25, x + w + 0.25, z + d + 0.25, holes, top + up + 0.1, 0.2)
    for (const [hx, hz, hw, hd] of holes.filter((h) => h !== ROOF_HATCH)) {
      for (const [fw, fd, fx, fz] of [[hw + 0.12, 0.06, hx + hw / 2, hz], [hw + 0.12, 0.06, hx + hw / 2, hz + hd], [0.06, hd, hx, hz + hd / 2], [0.06, hd, hx + hw, hz + hd / 2]]) bx(frame, fw, 0.22, fd, fx, top + up + 0.3, fz)
      bx(skyl, hw, 0.03, hd, hx + hw / 2, top + up + 0.38, hz + hd / 2)
    }
    bx(fascia, w + 0.52, 0.06, d + 0.52, cx, top + up + 0.03, cz) // 薄簷：下緣一圈深色
    if (['65000', '66000'].includes(r.id)) { // 綠屋頂（新北主臥室、台中書房：景天草皮＋一圈碎石邊）
      bx(fascia, w - 0.4, 0.06, d - 0.4, cx, top + up + 0.23, cz)
      bx(green, w - 0.8, 0.08, d - 0.8, cx, top + up + 0.25, cz)
    }
    if (r.id === '10004') { // 新竹縣工作室：鋸齒狀屋頂（像竹科廠房），朝北的玻璃引進柔和的天光
      const n = Math.floor(d / 2.2), dz = d / n, H = 0.8, ang = Math.atan2(H, dz), y = top + up + 0.2
      for (let k = 0; k < n; k++) {
        const z0 = z + k * dz
        bx(skyl, w - 0.3, H, 0.04, cx, y + H / 2, z0 + 0.05)
        const sp = new THREE.BoxGeometry(w - 0.3, 0.06, Math.hypot(H, dz)).rotateX(ang).translate(cx, y + H / 2, z0 + dz / 2); slab.push(sp)
      }
    }
  }
  // 走廊屋頂＋西部走廊的玻璃天窗（細鋁框，每 2 m 一支橫料）
  for (const [x, z, w, d] of HALLS) bx(slab, w + 0.5, 0.2, d + 0.5, x + w / 2, top + 0.1, z + d / 2)
  { const [x, z, w, d] = HALLS[0]
    bx(skyl, w - 0.5, 0.06, d - 0.6, x + w / 2, top + 0.24, z + d / 2)
    for (let t = z + 0.3; t <= z + d - 0.3; t += 2) bx(frame, w - 0.4, 0.08, 0.06, x + w / 2, top + 0.26, t)
    for (const sx of [x + 0.25, x + w - 0.25]) bx(frame, 0.06, 0.08, d - 0.5, sx, top + 0.26, z + d / 2) }
  const mk = (list, m, shadow = true) => { if (!list.length) return; const o = new THREE.Mesh(mergeGeometries(list), m); o.castShadow = shadow; o.receiveShadow = true; roofGroup.add(o) }
  mk(slab, mat('#f4f2ed', { roughness: 0.75 })); mk(fascia, mat('#4a3b2e', { roughness: 0.5, metalness: 0.3 })); mk(green, mat('#7bb661', { roughness: 1 }))
  mk(skyl, mat('#a9d3ea', { transparent: true, opacity: 0.55, roughness: 0.05 }), false); mk(frame, mat('#2e3134', { metalness: 0.6 }))
  const put = (geo, m, x, y, z, ry = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.y = ry; o.castShadow = o.receiveShadow = true; roofGroup.add(o); return o }
  const wood = mat('#a47148', { roughness: 0.6 })
  // 台北：屋頂露台（木平台、格柵棚架、兩張躺椅、盆栽）
  { const r = ROOMS.find((q) => q.id === '63000'), [x, z, w, d] = r.rect, y = roofY['63000'], cx = x + w / 2, cz = z + d / 2
    put(new THREE.BoxGeometry(w - 0.3, 0.06, d - 0.6), wood, cx - 0.1, y + 0.03, cz) // 木平台鋪到西邊，接空中步道
    for (const [px, pz] of [[cx - 2.5, cz - 1.8], [cx + 2.5, cz - 1.8], [cx - 2.5, cz + 1.8], [cx + 2.5, cz + 1.8]]) put(new THREE.BoxGeometry(0.15, 2.4, 0.15), mat('#3a2f27'), px, y + 1.2, pz)
    for (let k = 0; k < 9; k++) put(new THREE.BoxGeometry(5.3, 0.06, 0.08), mat('#3a2f27'), cx, y + 2.42, cz - 1.9 + k * 0.475)
    for (const dx of [-1, 1]) { const l = put(new THREE.BoxGeometry(0.7, 0.3, 1.9), mat('#fafafa'), cx + dx * 0.9, y + 0.21, cz + 0.2) ; void l }
    for (const [px, pz] of [[x + 0.9, z + 0.9], [x + w - 0.9, z + 0.9], [x + 0.9, z + d - 0.9], [x + w - 0.9, z + d - 0.9]]) { put(new THREE.BoxGeometry(0.6, 0.5, 0.6), mat('#d9d3c7'), px, y + 0.25, pz); put(new THREE.SphereGeometry(0.38, 12, 8), mat('#3f8f3a'), px, y + 0.8, pz) } }
  const rail = (x0, z0, x1, z1, y, glass = true) => { // 欄杆：玻璃板＋金色扶手，或鋼管
    const L = Math.hypot(x1 - x0, z1 - z0), ry = -Math.atan2(z1 - z0, x1 - x0)
    if (glass) put(new THREE.BoxGeometry(L, 1.0, 0.02), mat('#cfe8f3', { transparent: true, opacity: 0.35, roughness: 0.05 }), (x0 + x1) / 2, y + 0.52, (z0 + z1) / 2, ry).castShadow = false
    else for (const hy of [0.5, 1.0]) put(new THREE.BoxGeometry(L, 0.04, 0.04), mat('#78909c', { metalness: 0.6 }), (x0 + x1) / 2, y + hy, (z0 + z1) / 2, ry)
    put(new THREE.BoxGeometry(L + 0.05, 0.05, 0.06), glass ? mat('#c9a227', { metalness: 0.85, roughness: 0.3 }) : mat('#78909c', { metalness: 0.6 }), (x0 + x1) / 2, y + 1.05, (z0 + z1) / 2, ry)
    const n = Math.max(1, Math.round(L / 1.5))
    for (let k = 0; k <= n; k++) put(new THREE.BoxGeometry(0.05, 1.05, 0.05), mat('#78909c', { metalness: 0.6 }), x0 + ((x1 - x0) * k) / n, y + 0.52, z0 + ((z1 - z0) * k) / n)
  }
  // 嘉義＋台南：阿里山觀景露台（餐廳、廚房屋頂連成 8 × 10.5 m）。餐廳西牆的樓梯爬上來，出口是一間玻璃樓梯間；木地板、玻璃欄杆、
  //   格柵棚架下一張 6 人戶外餐桌（棚架掛一串燈泡）、東邊烤肉台（雞肉飯配烤肉）、躺椅、往東看阿里山日出的望遠鏡；
  //   南半（廚房上面）：阿里山高山茶園、一棵櫻花、圍著火盆的戶外沙發；化妝室天窗四周圍一圈玻璃
  { const r = ROOMS.find((q) => q.id === '10010'), [x, z, w] = r.rect, d = 10.5, yd = BASE + STAIR_RISE
    const [hx, hz, hw, hd] = ROOF_HATCH, sk = SKY.filter(([sx, sz, sw, sd]) => sx >= x && sz >= z && sx + sw <= x + w && sz + sd <= z + d)
    const deckG = []; holed(deckG, x + 0.1, z + 0.1, x + w - 0.1, z + d - 0.1, [...sk, ROOF_HATCH], yd - 0.03, 0.06)
    const dk = new THREE.Mesh(mergeGeometries(deckG), wood); dk.receiveShadow = true; roofGroup.add(dk)
    for (const [sx, sz, sw, sd] of sk) { rail(sx - 0.15, sz - 0.15, sx + sw + 0.15, sz - 0.15, yd); rail(sx - 0.15, sz + sd + 0.15, sx + sw + 0.15, sz + sd + 0.15, yd); rail(sx - 0.15, sz - 0.15, sx - 0.15, sz + sd + 0.15, yd) }
    const ph = { x0: hx - 0.15, x1: hx + hw + 0.3, z0: hz - 0.2, z1: hz + hd + 0.2 } // 樓梯間
    rail(x - 0.1, ph.z1, x - 0.1, z + d + 0.1, yd); rail(x - 0.1, z + d + 0.1, x + w + 0.1, z + d + 0.1, yd); rail(x + w + 0.1, z - 0.1, x + w + 0.1, z + 2.3, yd); rail(x + w + 0.1, z + 3.7, x + w + 0.1, z + d + 0.1, yd); rail(ph.x1, z - 0.1, x + w + 0.1, z - 0.1, yd) // 東邊留口接空中步道
    { const H = 2.4, white = mat('#f4f2ed', { roughness: 0.75 }), dark = mat('#2e3134', { metalness: 0.6 }), gl = mat('#a9d3ea', { transparent: true, opacity: 0.45, roughness: 0.05 })
      const pw = ph.x1 - ph.x0, pd = ph.z1 - ph.z0, door = [hz, hz + 1.0] // 東面北端開門（樓梯頂的平台）
      put(new THREE.BoxGeometry(0.15, H, pd), white, ph.x0, yd + H / 2, (ph.z0 + ph.z1) / 2); put(new THREE.BoxGeometry(pw, H, 0.15), white, (ph.x0 + ph.x1) / 2, yd + H / 2, ph.z0); put(new THREE.BoxGeometry(pw, H, 0.15), white, (ph.x0 + ph.x1) / 2, yd + H / 2, ph.z1)
      put(new THREE.BoxGeometry(0.04, H - 0.1, ph.z1 - door[1]), gl, ph.x1, yd + (H - 0.1) / 2, (door[1] + ph.z1) / 2).castShadow = false
      for (const zz of [door[0] - 0.05, door[1], (door[1] + ph.z1) / 2, ph.z1]) put(new THREE.BoxGeometry(0.08, H, 0.08), dark, ph.x1, yd + H / 2, zz)
      put(new THREE.BoxGeometry(0.08, 0.3, door[1] - ph.z0), dark, ph.x1, yd + H - 0.15, (ph.z0 + door[1]) / 2)
      put(new THREE.BoxGeometry(pw + 0.4, 0.15, pd + 0.4), white, (ph.x0 + ph.x1) / 2, yd + H + 0.07, (ph.z0 + ph.z1) / 2); put(new THREE.BoxGeometry(pw + 0.42, 0.05, pd + 0.42), mat('#4a3b2e', { metalness: 0.3 }), (ph.x0 + ph.x1) / 2, yd + H, (ph.z0 + ph.z1) / 2) }
    // 格柵棚架＋餐桌＋一串燈泡
    const tx = x + 4.6, tz = z + 4.6, beam = mat('#3a2f27')
    for (const [px, pz] of [[-1.7, -1.5], [1.7, -1.5], [-1.7, 1.5], [1.7, 1.5]]) put(new THREE.BoxGeometry(0.12, 2.4, 0.12), beam, tx + px, yd + 1.2, tz + pz)
    for (const pz of [-1.5, 1.5]) put(new THREE.BoxGeometry(3.6, 0.1, 0.1), beam, tx, yd + 2.42, tz + pz)
    for (let k = 0; k < 8; k++) put(new THREE.BoxGeometry(0.06, 0.06, 3.2), beam, tx - 1.6 + k * 0.457, yd + 2.5, tz)
    for (const pz of [-1.5, 1.5]) for (let k = 0; k < 9; k++) put(new THREE.SphereGeometry(0.05, 8, 6), mat('#fff3c4', { emissive: '#ffcc66', emissiveIntensity: 1.6 }), tx - 1.6 + k * 0.4, yd + 2.3 - Math.sin((k / 8) * Math.PI) * 0.2, tz + pz)
    put(new THREE.BoxGeometry(2.2, 0.05, 0.9), wood, tx, yd + 0.74, tz); for (const [a, b] of [[-0.95, -0.35], [0.95, -0.35], [-0.95, 0.35], [0.95, 0.35]]) put(new THREE.BoxGeometry(0.05, 0.72, 0.05), beam, tx + a, yd + 0.36, tz + b)
    for (const s2 of [-1, 1]) for (let k = -1; k <= 1; k++) { put(new THREE.BoxGeometry(0.42, 0.05, 0.42), mat('#eceff1'), tx + k * 0.7, yd + 0.45, tz + s2 * 0.75); put(new THREE.BoxGeometry(0.42, 0.45, 0.04), mat('#eceff1'), tx + k * 0.7, yd + 0.7, tz + s2 * 0.95) }
    for (let k = 0; k < 3; k++) put(new THREE.CylinderGeometry(0.12, 0.12, 0.03, 16), mat('#fafafa'), tx - 0.6 + k * 0.6, yd + 0.78, tz) // 雞肉飯
    // 烤肉台（東邊，棚架南邊）：石材檯面、炭火、小煙囪、水槽
    { const bx0 = x + w - 0.6, bz = z + 6.6
      put(new THREE.BoxGeometry(0.6, 0.9, 3.0), mat('#8d8d8d', { roughness: 0.9 }), bx0, yd + 0.45, bz + 1.4)
      put(new THREE.BoxGeometry(0.5, 0.06, 1.0), mat('#212121', { metalness: 0.6 }), bx0, yd + 0.93, bz + 1.0)
      for (let k = 0; k < 6; k++) put(new THREE.BoxGeometry(0.08, 0.03, 0.12), mat('#ff7043', { emissive: '#ff3d00', emissiveIntensity: 1.2 }), bx0 - 0.1 + (k % 2) * 0.2, yd + 0.97, bz + 0.6 + k * 0.16)
      put(new THREE.CylinderGeometry(0.1, 0.1, 1.4, 12), mat('#616161', { metalness: 0.6 }), bx0 + 0.15, yd + 1.6, bz + 0.3)
      put(new THREE.BoxGeometry(0.4, 0.2, 0.5), mat('#b0bec5', { metalness: 0.8 }), bx0, yd + 0.85, bz + 2.3) }
    // 南半：阿里山高山茶園（五排圓圓的茶樹）、櫻花、火盆＋戶外沙發
    for (let i = 0; i < 3; i++) { put(new THREE.BoxGeometry(2.4, 0.35, 0.5), mat('#d9d3c7'), x + 1.8, yd + 0.18, z + 7.4 + i * 1.1); for (let k = 0; k < 5; k++) put(new THREE.SphereGeometry(0.28, 10, 8), mat('#4e7d3a', { roughness: 1 }), x + 0.9 + k * 0.45, yd + 0.5, z + 7.4 + i * 1.1).scale.set(1, 0.7, 1) }
    { const sx = x + 1.0, sz = z + 5.6; put(new THREE.CylinderGeometry(0.4, 0.4, 0.5, 12), mat('#d9d3c7'), sx, yd + 0.25, sz); put(new THREE.CylinderGeometry(0.08, 0.12, 1.6, 8), mat('#5d4037'), sx, yd + 1.2, sz)
      for (const [a, b, rr] of [[0, 2.1, 0.7], [0.45, 1.9, 0.5], [-0.4, 1.95, 0.5]]) put(new THREE.SphereGeometry(rr, 12, 10), mat('#f8bbd0', { roughness: 0.9 }), sx + a, yd + b, sz) } // 阿里山櫻花
    { const fx = x + 5.0, fz = z + 8.6
      put(new THREE.CylinderGeometry(0.45, 0.35, 0.4, 16), mat('#455a64', { metalness: 0.5 }), fx, yd + 0.2, fz)
      for (let k = 0; k < 5; k++) put(new THREE.ConeGeometry(0.12, 0.35, 6), mat('#ffab40', { emissive: '#ff6d00', emissiveIntensity: 1.5 }), fx + Math.cos(k * 1.3) * 0.18, yd + 0.55, fz + Math.sin(k * 1.3) * 0.18)
      for (const [a, b, ry] of [[0, -1.5, 0], [0, 1.5, Math.PI], [-1.5, 0, Math.PI / 2]]) { const sf = put(new THREE.BoxGeometry(2.0, 0.42, 0.8), mat('#eeeeee'), fx + a, yd + 0.21, fz + b, ry); void sf; put(new THREE.BoxGeometry(2.0, 0.4, 0.15), mat('#eeeeee'), fx + a * 1.27, yd + 0.55, fz + b * 1.27, ry) } }
    // 躺椅、望遠鏡（往東看阿里山日出）、檜木盆栽
    for (const k of [0, 1]) { const lx = x + 2.4 + k * 0.9; put(new THREE.BoxGeometry(0.65, 0.25, 1.4), mat('#fafafa'), lx, yd + 0.2, z + 1.6); const bk = put(new THREE.BoxGeometry(0.65, 0.06, 0.6), mat('#fafafa'), lx, yd + 0.5, z + 0.75); bk.rotation.x = 0.7 }
    { const ox = x + 6.7, oz = z + 4.2
      for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI * 2, lg = put(new THREE.CylinderGeometry(0.02, 0.02, 1.2, 6), mat('#37474f'), ox + Math.cos(a) * 0.2, yd + 0.58, oz + Math.sin(a) * 0.2); lg.rotation.set(Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3) }
      const tl = put(new THREE.CylinderGeometry(0.07, 0.09, 0.9, 12), mat('#fafafa', { metalness: 0.3 }), ox + 0.1, yd + 1.25, oz); tl.rotation.z = -1.1 }
    for (const [px, pz] of [[x + w - 0.6, z + d - 0.5], [x + 0.6, z + 5.0]]) { put(new THREE.BoxGeometry(0.7, 0.5, 0.7), mat('#d9d3c7'), px, yd + 0.25, pz); put(new THREE.ConeGeometry(0.4, 1.6, 10), mat('#2e5d32'), px, yd + 1.3, pz) } }
  // 桃園車庫：看飛機露台（西牆外的鋼樓梯上來）：木地板、鋼管欄杆、兩階看台朝北對著跑道車道、投幣望遠鏡、風向袋
  { const r = ROOMS.find((q) => q.id === '68000'), [x, z, w, d] = r.rect, yd = roofY['68000'] + 0.06, steel = mat('#78909c', { metalness: 0.6 })
    put(new THREE.BoxGeometry(w - 0.2, 0.06, d - 0.2), wood, x + w / 2, yd - 0.03, z + d / 2)
    rail(x - 0.1, z - 0.1, x + w + 0.1, z - 0.1, yd, false); rail(x + w + 0.1, z - 0.1, x + w + 0.1, z + 3, yd, false); rail(x + w + 0.1, z + 4.6, x + w + 0.1, z + d + 0.1, yd, false); // 東邊留口接空中步道
    rail(x - 0.1, z + d + 0.1, x + w + 0.1, z + d + 0.1, yd, false)
    rail(x - 0.1, z - 0.1, x - 0.1, z + 1.3, yd, false); rail(x - 0.1, z + 2.5, x - 0.1, z + d + 0.1, yd, false) // 西邊留樓梯口
    for (let k = 0; k < 2; k++) put(new THREE.BoxGeometry(4, 0.42 + k * 0.4, 0.6), wood, x + 4.2, yd + (0.42 + k * 0.4) / 2, z + 2.0 + k * 0.6)
    { const bx0 = x + 1.6, bz = z + 0.6; put(new THREE.CylinderGeometry(0.05, 0.08, 1.1, 8), steel, bx0, yd + 0.55, bz); const bn = put(new THREE.BoxGeometry(0.4, 0.2, 0.35), mat('#1565c0'), bx0, yd + 1.2, bz); bn.rotation.x = -0.2 } // 投幣望遠鏡
    { const wx = x + w - 0.5, wz = z + 0.5; put(new THREE.CylinderGeometry(0.03, 0.03, 3, 8), steel, wx, yd + 1.5, wz)
      for (let k = 0; k < 4; k++) { const c = put(new THREE.CylinderGeometry(0.2 - k * 0.03, 0.17 - k * 0.03, 0.3, 12, 1, true), mat(k % 2 ? '#fafafa' : '#ff6d00', { side: THREE.DoubleSide }), wx - 0.25 - k * 0.3, yd + 2.85, wz); c.rotation.z = Math.PI / 2 } } } // 風向袋
  // 空中步道：沿著西部走廊的屋頂（架在玻璃天窗上的鋼格柵走道，1.4 m 寬、兩邊欄杆），北端接桃園車庫的看飛機露台、台北客廳的屋頂露台，
  //   南端爬兩階接嘉義的阿里山觀景露台；屋頂上的設施全部走得到
  { const [hx, , hw] = HALLS[0], w0 = hx + 0.3, w1 = hx + hw - 0.3, yw = roofY['68000'] + 0.06, dn = ROOMS.find((q) => q.id === '10010'), z1 = dn.rect[1] + 3.7, ys = BASE + STAIR_RISE
    const grate = mat('#78909c', { metalness: 0.6, roughness: 0.4, transparent: true, opacity: 0.85 }), steel = mat('#546e7a', { metalness: 0.6 })
    const zEnd = z1 - 1.0 // 平的走道到這裡，再兩階爬上嘉義露台
    put(new THREE.BoxGeometry(w1 - w0, 0.05, zEnd - 0.3), grate, (w0 + w1) / 2, yw - 0.025, (0.3 + zEnd) / 2).castShadow = false
    for (let t = 0.6; t < zEnd; t += 0.5) put(new THREE.BoxGeometry(w1 - w0, 0.01, 0.03), steel, (w0 + w1) / 2, yw + 0.005, t)
    for (let t = 1.5; t < zEnd; t += 3) for (const sx of [w0 + 0.05, w1 - 0.05]) put(new THREE.BoxGeometry(0.06, yw - (BASE + WALL_H + 0.2), 0.06), steel, sx, (yw + BASE + WALL_H + 0.2) / 2, t)
    for (let k = 0; k < 2; k++) put(new THREE.BoxGeometry(w1 - w0, 0.05, 0.5), grate, (w0 + w1) / 2, yw + (k + 1) * (ys - yw) / 2 - 0.025, zEnd + 0.25 + k * 0.5)
    put(new THREE.BoxGeometry(w1 - w0 + 0.6, 0.05, z1 - (zEnd + 1.0) + 1.4), grate, (w0 + w1) / 2 - 0.3, ys - 0.025, (zEnd + 1.0 + z1 + 0.4) / 2 - 0.2)
    const liv = ROOMS.find((q) => q.id === '63000').rect, gar = ROOMS.find((q) => q.id === '68000').rect
    // 欄杆：西邊在車庫露台（z 3～4.6）、嘉義露台的接口斷開；東邊在台北露台（客廳北半）斷開
    rail(w0, gar[1] + gar[3] + 0.1, w0, zEnd + 1.0, yw, false); rail(w0, 0.3, w0, gar[1] + 3, yw, false); rail(w0, gar[1] + 4.6, w0, gar[1] + gar[3] + 0.1, yw, false)
    rail(w1, liv[1] + liv[3] - 0.5, w1, z1 + 0.2, yw, false); rail(w0, 0.3, w1, 0.3, yw, false)
    rail(liv[0], liv[1] + 0.25, liv[0] + liv[2] - 0.2, liv[1] + 0.25, yw); rail(liv[0] + liv[2] - 0.2, liv[1] + 0.25, liv[0] + liv[2] - 0.2, liv[1] + liv[3] - 0.25, yw); rail(liv[0], liv[1] + liv[3] - 0.25, liv[0] + liv[2] - 0.2, liv[1] + liv[3] - 0.25, yw) } // 台北露台三面玻璃欄杆
  // 新竹市機房：屋頂的空調室外機、不鏽鋼水塔（台灣屋頂的標準配備）
  { const r = ROOMS.find((q) => q.id === '10018'), [x, z, w, d] = r.rect, y = roofY['10018']
    for (let k = 0; k < 3; k++) { put(new THREE.BoxGeometry(0.9, 0.8, 0.4), mat('#eceff1'), x + 0.7 + k * 1.05, y + 0.4, z + d - 0.5); put(new THREE.CylinderGeometry(0.28, 0.28, 0.02, 16), mat('#455a64'), x + 0.7 + k * 1.05, y + 0.4, z + d - 0.29).rotation.x = Math.PI / 2 }
    for (const [a, b] of [[-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4]]) put(new THREE.BoxGeometry(0.06, 0.8, 0.06), mat('#607d8b', { metalness: 0.5 }), x + 2 + a, y + 0.4, z + 1.3 + b)
    put(new THREE.CylinderGeometry(0.6, 0.6, 1.3, 20), mat('#cfd8dc', { metalness: 0.9, roughness: 0.25 }), x + 2, y + 1.45, z + 1.3); put(new THREE.SphereGeometry(0.6, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat('#cfd8dc', { metalness: 0.9, roughness: 0.25 }), x + 2, y + 2.1, z + 1.3) }
  // 高雄：太陽能板（整齊兩排、朝南微斜）
  for (const id of ['64000']) { const r = ROOMS.find((q) => q.id === id), [x, z, w, d] = r.rect, y = roofY[id]
    for (let i = 0; i < Math.floor((w - 1.4) / 1.1); i++) for (let j = 0; j < Math.floor((d - 1.4) / 1.9); j++) put(new THREE.BoxGeometry(1, 0.04, 1.6), mat('#1c2c4c', { metalness: 0.5, roughness: 0.2 }), x + 1.2 + i * 1.1, y + 0.3, z + 1.5 + j * 1.9).rotation.x = -0.2 }
  scene.add(roofGroup)
}

// ── 人：幾個模擬市民風的小人，看得出房子的尺度 ──
// 家裡的五個人，在房子裡走來走去（世界座標的路線，走到兩端停一下再走回來）：爸爸、媽媽、兒子、兩位傭人
const WALKERS = [
  { who: '爸爸', drive: true, shirt: '#1565c0', pants: '#37474f', hair: '#212121', path: [[13, 4.6], [11, 6.5], [9, 6.5], [9, 8.5], [11, 8.5], [17.5, 10.5], [21, 10.5], [22.6, 11.6]] }, // 客廳 → 走廊 → 主臥室 → 溫泉
  { who: '媽媽', shirt: '#e57373', pants: '#5d4037', hair: '#4e342e', path: [[5.0, 44.6], [9, 44.6], [9, 39], [7, 39], [6.3, 40.0]] }, // 中島爐台 → 走廊 → 餐廳
  { who: '兒子', shirt: '#ffb300', pants: '#1e88e5', hair: '#3e2723', kid: true, path: [[5.6, 25.8], [7, 23.5], [9, 23.5], [9, 41.8], [1.4, 41.8], [0.55, 41.7], [0.55, 41.2, 0], [0.55, 36.7, STAIR_RISE], [0.55, 36.3, STAIR_RISE], [2.3, 36.3, STAIR_RISE], [2.6, 38.0, STAIR_RISE]] }, // 兒童房 → 走廊 → 餐廳的樓梯 → 屋頂露台
  { who: '傭人', shirt: '#fafafa', pants: '#263238', hair: '#212121', path: [[9, 1.6], [9, 45.2]] }, // 掃整條西部走廊
  { who: '傭人', shirt: '#fafafa', pants: '#263238', hair: '#6d4c41', path: [[3.45, 36.4], [1.45, 37.5], [1.45, 44.6], [3.5, 44.9]] }, // 餐廳餐具櫃 → 廚房水槽
]
const walkers = []
let lastT = 0
// 樂高頁的人：minifig；衣服換成最接近的樂高色，褲子、頭髮輪流換
let legoN = 0
function legoPerson(rot, pose, shirt) {
  const k = legoN++
  const o = new THREE.Group()
  o.add(minifig(rot, pose, { shirt: '#' + nearestColor(new THREE.Color(shirt), LEGO_PAL).getHexString(), pants: ['#0055bf', '#1b2a34', '#958a73', '#237841'][k % 4], hair: ['#582a12', '#05131d', '#a95500', '#f2cd37'][k % 4] }))
  o.userData.lego = true
  return o
}
// 南投中庭：可以開合的電動玻璃天窗。兩側鋁軌，五片玻璃板；打開時往北疊在一起，關上時一片一片往南拉開蓋住整個中庭
const courtPanels = []
function buildCourtRoof() {
  courtPanels.length = 0
  const r = ROOMS.find((q) => q.kind === 'court'), [x, z, w, d] = r.rect, y = BASE + WALL_H + 0.3, N = 5, pd = d / N
  const rail = mat('#2e3134', { metalness: 0.6, roughness: 0.4 }), glass = mat('#a9d3ea', { transparent: true, opacity: 0.45, roughness: 0.05 })
  for (const rx of [x - 0.05, x + w + 0.05]) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, d + 0.3), rail); m.position.set(rx, y, z + d / 2); scene.add(m) }
  for (let k = 0; k < N; k++) {
    const p = new THREE.Group()
    const gl = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, 0.03, pd + 0.08), glass); p.add(gl)
    for (const [fw, fd, fx, fz] of [[w + 0.14, 0.05, 0, -pd / 2 - 0.04], [w + 0.14, 0.05, 0, pd / 2 + 0.04], [0.05, pd + 0.1, -w / 2 - 0.05, 0], [0.05, pd + 0.1, w / 2 + 0.05, 0]]) { const f = new THREE.Mesh(new THREE.BoxGeometry(fw, 0.06, fd), rail); f.position.set(fx, 0, fz); p.add(f) }
    p.position.set(x + w / 2, y + 0.08 + k * 0.07, z + pd / 2)
    scene.add(p)
    courtPanels.push({ p, open: z + pd / 2, shut: z + pd / 2 + k * pd })
  }
}
function moveCourtRoof() {
  for (const c of courtPanels) c.p.position.z += ((props.court ? c.shut : c.open) - c.p.position.z) * 0.06
}
function buildPeople() {
  walkers.length = 0
  for (const w of WALKERS) {
    const p = props.look === 'lego' ? legoPerson(FACE.s, 'stand', w.shirt) : person(0, 0, FACE.s, 'stand', { shirt: w.shirt, pants: w.pants, hair: w.hair })
    p.scale.setScalar((w.kid ? 0.72 : 1) / M)
    p.userData.name = w.who
    const el = document.createElement('div'); el.className = 'd25-label who'; el.textContent = whoText(w.who) // 頭上顯示是誰
    const tag = new CSS2DObject(el); tag.position.set(0, 2.05, 0); tag.visible = props.labels; p.add(tag)
    const fig = p.userData.legs ? p : p.children.find((c) => c.userData.legs) ?? p
    p.traverse((o) => { if (o.isMesh) o.castShadow = true })
    scene.add(p)
    const path = w.path.map(([x, z, y]) => [x, z, y ?? 0]) // 第三個數是腳底離地板多高（爬樓梯）
    for (let k = 1; k < path.length; k++) if (w.path[k][2] === undefined) path[k][2] = path[k - 1][2]
    const seg = path.slice(1).map((q, k) => Math.hypot(q[0] - path[k][0], q[1] - path[k][1], q[2] - path[k][2])), len = seg.reduce((a, b) => a + b, 0)
    walkers.push({ who: w.who, p, fig, tag, path, seg, len, t: Math.random() * len * 2, kid: w.kid, plan: w.drive && car ? dadPlan(path) : null })
  }
}
// 走路：速度 0.9 m/s，到兩端各停 3 秒；面朝走的方向，身體上下晃
function walk(dt) {
  for (const w of walkers) {
    if (w.plan) { dadStep(w, dt); continue }
    const cyc = w.len * 2 + 6 * 0.9
    w.t = (w.t + dt * 0.9) % cyc
    let d = w.t, pause = false
    if (d < w.len) {} else if (d < w.len + 2.7) { d = w.len; pause = true } else if (d < w.len * 2 + 2.7) d = w.len * 2 + 2.7 - d; else { d = 0; pause = true }
    const back = w.t > w.len && w.t < w.len * 2 + 2.7
    let k = 0; while (k < w.seg.length - 1 && d > w.seg[k]) { d -= w.seg[k]; k++ }
    const [ax, az, ay] = w.path[k], [bx, bz, by] = w.path[k + 1], f = Math.min(1, d / (w.seg[k] || 1)), y = ay + (by - ay) * f
    // 腳步：每走 0.6 m 跨一步，腿前後擺、手反方向擺；停下來時站直
    const sw = pause ? 0 : Math.sin(w.t * Math.PI / 0.6) * 0.45, { legs = [], arms = [] } = w.fig.userData
    legs.forEach((l, i) => (l.rotation.x = i ? -sw : sw)); arms.forEach((a, i) => (a.rotation.x = (i ? sw : -sw) * 0.8))
    w.p.position.set(ax + (bx - ax) * f, BASE + y + (pause ? 0 : Math.abs(Math.cos(w.t * Math.PI / 0.6)) * 0.02), az + (bz - az) * f)
    w.p.visible = roofOn || y < WALL_H // 沒蓋屋頂時，上了屋頂的人先不畫
    if (!pause) w.p.rotation.y = Math.atan2((bx - ax) * (back ? -1 : 1), (bz - az) * (back ? -1 : 1))
  }
}

// 爸爸開車（使用者：車子裡是爸爸，可以下車走來走去、再上車把車開走、再回來）：一圈的流程
//   家裡的路線走去再走回客廳 → 走到車庫、出車庫門到車子駕駛座那邊 → 上車 → 倒車沿車道往北開出大門（出了庭園就不畫）
//   → 在外面待一下 → 往南開回來停好 → 下車 → 走回客廳，再從頭
const WALK_V = 0.9, CAR_V = 3.2 // 走路、開車的平均速度（m/s）
const lineOf = (path) => { const seg = path.slice(1).map((q, k) => Math.hypot(q[0] - path[k][0], q[1] - path[k][1], q[2] - path[k][2])); return { path, seg, len: seg.reduce((a, b) => a + b, 0) } }
function pathAt({ path, seg }, d) { // 路線上走了 d 公尺的位置、面向
  let k = 0; while (k < seg.length - 1 && d > seg[k]) { d -= seg[k]; k++ }
  const [ax, az, ay] = path[k], [bx, bz, by] = path[k + 1], f = Math.min(1, Math.max(0, d / (seg[k] || 1)))
  return { x: ax + (bx - ax) * f, z: az + (bz - az) * f, y: ay + (by - ay) * f, rot: Math.atan2(bx - ax, bz - az) }
}
function dadPlan(house) {
  const door = [car.x + 2.1, car.z + 0.4, 0] // 駕駛座（東側）車門外
  const toCar = lineOf([house[0], [11, 6.5, 0], [9, 6.5, 0], [9, 1, 0], [8, 1, 0], [6.2, 1, 0], [6.2, -1, 0], [door[0], -2, 0], door]) // 客廳 → 走廊 → 車庫側門 → 車庫門 → 車門
  const fromCar = lineOf([...toCar.path].reverse())
  const H = lineOf(house), Hb = lineOf([...house].reverse())
  const away = plan.garden.z0 - 4 - car.z // 開出去：車子中心開到庭園北邊外 4 m
  const ease = (f) => f * f * (3 - 2 * f)
  const steps = [
    { s: H.len / WALK_V, walk: H }, { s: 3 }, { s: Hb.len / WALK_V, walk: Hb }, { s: 2 },
    { s: toCar.len / WALK_V, walk: toCar }, { s: 1, inCar: true }, // 開車門、坐進去
    { s: Math.abs(away) / CAR_V * 1.4, inCar: true, dz: (f) => away * ease(f) }, // 倒車開出去（車頭還是朝南）
    { s: 8, inCar: true, dz: () => away, gone: true }, // 在外面
    { s: Math.abs(away) / CAR_V * 1.4, inCar: true, dz: (f) => away * (1 - ease(f)) }, // 開回來停好
    { s: 1.5, inCar: true }, { s: 1, atDoor: true }, // 熄火、下車
    { s: fromCar.len / WALK_V, walk: fromCar }, { s: 2 },
  ]
  return { steps, cyc: steps.reduce((a, q) => a + q.s, 0), door }
}
function dadStep(w, dt) {
  const { steps, cyc, door } = w.plan
  w.t = (w.t + dt) % cyc
  let t = w.t, k = 0
  while (k < steps.length - 1 && t > steps[k].s) { t -= steps[k].s; k++ }
  const st = steps[k], f = Math.min(1, t / st.s), { legs = [], arms = [] } = w.fig.userData
  const dz = st.dz ? st.dz(f) : 0
  car.obj.position.z = car.base + dz
  car.obj.visible = !st.gone && car.z + dz > plan.garden.z0 - 1.5 // 出了庭園（樹籬外）就不畫
  if (car.driver) car.driver.visible = !!st.inCar
  w.p.visible = !st.inCar
  let walking = false
  if (st.walk) {
    const q = pathAt(st.walk, f * st.walk.len)
    w.p.position.set(q.x, BASE + q.y + Math.abs(Math.cos(t * WALK_V * Math.PI / 0.6)) * 0.02, q.z); w.p.rotation.y = q.rot; walking = true
  } else if (st.inCar) w.p.position.set(car.x + 0.6, BASE + 0.6, car.z + dz) // 人藏起來，頭上的名牌跟著車走
  else if (st.atDoor) { w.p.position.set(door[0], BASE, door[1]); w.p.rotation.y = Math.PI } // 下車站在車門邊（其他停下來的時候站在原地）
  const sw = walking ? Math.sin(t * WALK_V * Math.PI / 0.6) * 0.45 : 0
  legs.forEach((l, i) => (l.rotation.x = i ? -sw : sw)); arms.forEach((a, i) => (a.rotation.x = (i ? sw : -sw) * 0.8))
  w.tag.visible = props.labels && (!st.inCar || car.obj.visible) // 車開出庭園時名牌也收起來
}

// ── 夜景：天色變暗、太陽換成月光；每個房間天花板一盞暖色燈；自發光的燈、泳池、日月潭更亮 ──
function scanGlow() {
  glowMats.length = 0; waterMats = []
  scene.traverse((o) => {
    if (!o.isMesh) return
    for (const m of [].concat(o.material)) {
      if (m.emissiveIntensity > 0 && !glowMats.includes(m) && m.emissive?.getHex()) glowMats.push(m)
      const c = m.color?.getHexString()
      if ((c === '1fb5d1' || c === '2a8fc8' || c === '4fb3d9') && !waterMats.includes(m)) waterMats.push(m)
    }
  })
  for (const m of glowMats) m.userData.dayGlow ??= m.emissiveIntensity
}
function collectNight() {
  scanGlow()
  for (const r of [...ROOMS.filter((q) => !['pool', 'pavilion', 'court', 'sports'].includes(q.kind)), ...HALLS.map((h) => ({ rect: h }))]) {
    const [x, z, w, d] = r.rect
    const n = Math.max(1, Math.round((w * d) / 30))
    for (let i = 0; i < n; i++) {
      const L = new THREE.PointLight('#ffcf8a', 6, Math.max(w, d) + 3, 1.6)
      L.position.set(x + (w * (i + 0.5)) / n, BASE + WALL_H - 0.3, z + d / 2)
      nightGroup.add(L)
    }
  }
  scene.add(nightGroup)
}
function setNight(on) {
  const sky = on ? '#0b1630' : '#9fd6ef'
  scene.background.set(sky); scene.fog.color.set(sky)
  hemi.intensity = on ? 0.25 : 1.9
  hemi.color.set(on ? '#7f95c8' : '#f2f7ff')
  sun.intensity = on ? 0.35 : 2.8
  sun.color.set(on ? '#9fb4ff' : props.look === 'lego' ? '#ffe2b8' : '#fff4e0') // 樂高電影：暖色陽光
  nightGroup.visible = on
  for (const m of glowMats) m.emissiveIntensity = on ? m.userData.dayGlow * 2.2 : m.userData.dayGlow
  for (const m of waterMats) { m.emissive.set(on ? '#1a9fd0' : '#000000'); m.emissiveIntensity = on ? 0.8 : 0 }
  renderer.toneMappingExposure = on ? 1.35 : props.look === 'lego' ? 1.25 : 1.15
}

// ── 材質：畫在 canvas 上當貼圖，每格重複一次 ──
function texture(kind) {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const x = c.getContext('2d')
  const r = (() => { let s = kind.length * 9973; return () => ((s = (s * 16807) % 2147483647) / 2147483647) })()
  const fill = (col) => { x.fillStyle = col; x.fillRect(0, 0, 256, 256) }
  const noise = (h, s, l, n = 900, a = 0.7) => { for (let k = 0; k < n; k++) { x.fillStyle = `hsla(${h}, ${s}%, ${l + (r() - 0.5) * 16}%, ${a})`; x.fillRect(r() * 256, r() * 256, 3 + r() * 5, 3 + r() * 5) } }
  if (kind === 'wood' || kind === 'deck') {
    fill(kind === 'wood' ? '#b98a5e' : '#c49a6c')
    for (let k = 0; k < 10; k++) { x.fillStyle = `hsl(30, ${38 + r() * 12}%, ${44 + r() * 12}%)`; x.fillRect(0, k * 25.6 + 1, 256, 24); x.fillStyle = 'rgba(0,0,0,.3)'; x.fillRect((k * 97) % 256, k * 25.6, 2, 25.6) }
  } else if (kind === 'marble') {
    fill('#f3efe8')
    x.strokeStyle = 'rgba(120,110,100,.3)'
    for (let k = 0; k < 7; k++) { x.lineWidth = 0.6 + r() * 1.4; x.beginPath(); x.moveTo(r() * 256, 0); x.bezierCurveTo(r() * 256, 90, r() * 256, 170, r() * 256, 256); x.stroke() }
    x.strokeStyle = 'rgba(201,162,39,.55)'; x.lineWidth = 2; x.strokeRect(0, 0, 128, 128); x.strokeRect(128, 128, 128, 128)
  } else if (kind === 'tile') {
    fill('#e4ebee'); x.strokeStyle = '#a8b8c0'; x.lineWidth = 3
    for (let k = 0; k <= 256; k += 64) { x.beginPath(); x.moveTo(k, 0); x.lineTo(k, 256); x.moveTo(0, k); x.lineTo(256, k); x.stroke() }
  } else if (kind === 'hall') {
    // 走廊：大理石地板中間一條紅地毯（貼圖的 u 方向＝橫過走廊）
    fill('#f1ede6'); x.fillStyle = '#8c2233'; x.fillRect(48, 0, 160, 256); x.fillStyle = 'rgba(201,162,39,.8)'; x.fillRect(56, 0, 6, 256); x.fillRect(194, 0, 6, 256)
  } else if (kind === 'carpetDark') {
    fill('#3b2a4d'); noise(270, 25, 22, 600, 0.5)
  } else if (kind === 'lawn') {
    fill('#73c050'); x.fillStyle = 'rgba(255,255,255,.07)'; x.fillRect(0, 0, 128, 256); noise(100, 50, 42, 500, 0.4)
  } else if (kind === 'herringbone') {
    // 人字拼木地板：一條條 45° 斜放的木條，左右交錯
    fill('#9c6b45')
    for (let row = -2; row < 10; row++) for (let col = 0; col < 8; col++) {
      x.save(); x.translate(col * 32 + 16, row * 32 + (col % 2) * 16); x.rotate(col % 2 ? -Math.PI / 4 : Math.PI / 4)
      x.fillStyle = `hsl(28, ${38 + r() * 12}%, ${40 + r() * 14}%)`; x.fillRect(-22, -5, 44, 10); x.strokeStyle = 'rgba(0,0,0,.35)'; x.lineWidth = 1; x.strokeRect(-22, -5, 44, 10); x.restore()
    }
  } else if (kind === 'tatami') {
    // 疊：左邊一張直的、右邊兩張半疊；疊緣深綠
    fill('#cfc57e')
    x.strokeStyle = 'rgba(110,100,40,.28)'
    for (let k = 0; k < 256; k += 4) { x.beginPath(); x.moveTo(k, 0); x.lineTo(k, 256); x.stroke() }
    x.fillStyle = '#2f4a24'; x.fillRect(0, 0, 8, 256); x.fillRect(120, 0, 8, 256); x.fillRect(128, 0, 128, 6); x.fillRect(128, 125, 128, 6); x.fillRect(248, 0, 8, 256)
  } else {
    const base = { grass: [105, 50, 42], soil: [25, 40, 32], concrete: [0, 0, 70], stone: [30, 8, 46] }[kind] ?? [0, 0, 60]
    fill(`hsl(${base[0]}, ${base[1]}%, ${base[2]}%)`); noise(...base)
    if (kind === 'stone') { x.strokeStyle = 'rgba(0,0,0,.3)'; x.lineWidth = 2; for (let k = 0; k < 6; k++) x.strokeRect(r() * 200, r() * 200, 40 + r() * 60, 30 + r() * 50) }
  }
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}
// 掛畫：玉山、燈塔與海、色塊、油桐花、夕陽、水墨
// 每間房一幅、不重複的台灣主題畫
const PAINTING = { living: '101', master: 'sunset', gate: 'keelung', dining: 'train', guest: 'tung', kids: 'buddha', museum: 'ink', onsen: 'turtle', family: 'lantern' }
const HALL_ART = ['yushan', 'mondrian'] // 西部走廊兩幅
function paintingTex(k) {
  const c = document.createElement('canvas')
  c.width = 160; c.height = 120
  const x = c.getContext('2d')
  const grad = (a, b) => { const g = x.createLinearGradient(0, 0, 0, 120); g.addColorStop(0, a); g.addColorStop(1, b); x.fillStyle = g; x.fillRect(0, 0, 160, 120) }
  const hill = (pts, col) => { x.fillStyle = col; x.beginPath(); x.moveTo(0, 120); pts.forEach(([a, b]) => x.lineTo(a, b)); x.lineTo(160, 120); x.fill() }
  const rect = (col, a, b, w, h) => { x.fillStyle = col; x.fillRect(a, b, w, h) }
  if (k === 'yushan') { grad('#7fb8e6', '#e8f2fa'); hill([[0, 90], [50, 40], [80, 25], [110, 50], [160, 80]], '#5b7a5a'); hill([[70, 34], [80, 25], [90, 34]], '#ffffff'); hill([[0, 105], [60, 85], [160, 100]], '#3e5f3e') } // 玉山
  else if (k === 'keelung') { grad('#9fd0f0', '#2a7ab0'); rect('#2a7ab0', 0, 80, 160, 40); rect('#f5f5f5', 112, 40, 12, 45); rect('#c62828', 110, 34, 16, 8); rect('#8d6e63', 95, 82, 45, 10) } // 基隆港燈塔
  else if (k === 'mondrian') { rect('#f7f3e8', 0, 0, 160, 120); [['#d32f2f', 0, 0, 70, 60], ['#1565c0', 100, 70, 60, 50], ['#fbc02d', 0, 90, 40, 30], ['#212121', 70, 0, 6, 120], ['#212121', 0, 60, 160, 6], ['#212121', 96, 60, 6, 60]].forEach((r) => rect(...r)) }
  else if (k === 'tung') { rect('#2f5d3a', 0, 0, 160, 120); for (let n = 0; n < 40; n++) { x.fillStyle = n % 5 ? '#ffffff' : '#ffd54f'; x.beginPath(); x.arc(((n * 53) % 150) + 5, ((n * 37) % 110) + 5, 5, 0, 7); x.fill() } } // 苗栗油桐花
  else if (k === 'sunset') { grad('#ff8a65', '#ffd180'); x.fillStyle = '#ffeb3b'; x.beginPath(); x.arc(80, 70, 22, 0, 7); x.fill(); rect('#5d4037', 0, 85, 160, 35) } // 淡水夕陽
  else if (k === 'ink') { rect('#f2eee3', 0, 0, 160, 120); hill([[0, 80], [40, 35], [70, 70], [100, 30], [140, 65], [160, 55]], 'rgba(60,60,60,.55)'); hill([[0, 100], [60, 75], [120, 95], [160, 85]], 'rgba(30,30,30,.7)'); rect('#c62828', 140, 10, 10, 10) } // 太魯閣水墨
  else if (k === '101') { grad('#4f8fd6', '#cfe6f7'); hill([[0, 100], [40, 80], [90, 95], [160, 78]], '#5d8a5a'); for (let i = 0; i < 8; i++) rect('#5f8f86', 72 + i * 0.6, 92 - i * 9, 16 - i * 1.2, 9); rect('#5f8f86', 79, 10, 2, 12); for (const [a, h] of [[20, 25], [35, 18], [110, 22], [128, 30]]) rect('#9aa7b0', a, 100 - h, 12, h) } // 台北 101
  else if (k === 'train') { rect('#1f5130', 0, 0, 160, 120); for (let i = 0; i < 9; i++) hill([[i * 18, 75], [i * 18 + 9, 25 + (i % 3) * 8], [i * 18 + 18, 75]], '#2e7d32'); rect('#6d4c41', 0, 95, 160, 4); for (let i = 0; i < 3; i++) { rect('#c62828', 20 + i * 42, 72, 38, 22); rect('#fff3e0', 24 + i * 42, 76, 30, 7) } } // 阿里山小火車
  else if (k === 'buddha') { grad('#ffe0b2', '#90caf9'); hill([[0, 100], [60, 88], [160, 98]], '#689f38'); x.fillStyle = '#5d5d5d'; x.beginPath(); x.ellipse(80, 75, 30, 26, 0, 0, 7); x.fill(); x.beginPath(); x.arc(80, 40, 14, 0, 7); x.fill(); rect('#5d5d5d', 76, 22, 8, 8) } // 八卦山大佛
  else if (k === 'turtle') { grad('#bde3f5', '#5aa9d6'); rect('#3a87c0', 0, 78, 160, 42); hill([[30, 80], [60, 62], [85, 50], [100, 58], [120, 72], [135, 80]], '#4e6b44'); rect('#3a87c0', 0, 80, 160, 2) } // 龜山島
  else { rect('#0f1e3d', 0, 0, 160, 120); for (let n = 0; n < 14; n++) { const a = (n * 47) % 150 + 5, b = (n * 29) % 90 + 10; rect('#ffb74d', a, b, 8, 10); rect('#fff3c4', a + 2, b + 2, 4, 6) } } // 平溪天燈
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

// ── 房子：牆、壁紙、地板、家具 ──
function buildHouse() {
  const geo = { base: [] }
  const seg = (list, o, line, a0, a1, y0, y1, th) => {
    const L = a1 - a0, h = y1 - y0
    const g = o === 'h' ? new THREE.BoxGeometry(L + th, h, th) : new THREE.BoxGeometry(th, h, L + th)
    g.translate(o === 'h' ? (a0 + a1) / 2 : line, BASE + y0 + h / 2, o === 'h' ? line : (a0 + a1) / 2)
    list.push(g)
  }
  for (const r of plan.runs) {
    const { o, line, a0, a1, type, ext } = r
    if (type === 'open') continue // 開放式（廚房、餐廳）：不砌牆
    const bg = bucketOf(r.out).geo
    for (const k of ['ext', 'int', 'glass', 'gold', 'cap', 'stone', 'frame']) bg[k] ??= []
    if (ext && type === 'ext' && r.out) { // 外牆外側下段貼石材（villa 的勒腳）
      const off = (r.out[0] + r.out[1]) * (T_EXT / 2 + 0.02)
      seg(bg.stone, o, line + off, a0, a1, 0, STONE, 0.04)
    }
    const th = ext ? T_EXT : T_INT, body = ext ? bg.ext : bg.int
    if (type === 'int' || type === 'ext') seg(body, o, line, a0, a1, 0, WALL_H, th)
    else if (type === 'door' || type === 'garage') seg(body, o, line, a0, a1, WALL_H * (type === 'garage' ? 0.75 : 0.8), WALL_H, th) // 門楣
    else if (type === 'entrance') seg(bg.gold, o, line, a0, a1, WALL_H * 0.8, WALL_H, th)
    else if (type === 'pass') { // 廚房對外吧台：窗台下是牆，上面一扇往外推開的上懸窗
      seg(body, o, line, a0, a1, 0, 0.95, th); seg(body, o, line, a0, a1, WALL_H - HEAD, WALL_H, th)
      const hg = WALL_H - HEAD - 0.95, p = new THREE.Group(), L2 = a1 - a0
      p.position.set(o === 'h' ? (a0 + a1) / 2 : line, BASE + WALL_H - HEAD, o === 'h' ? line : (a0 + a1) / 2)
      const sash = new THREE.Mesh(new THREE.BoxGeometry(o === 'h' ? L2 : 0.03, hg, o === 'h' ? 0.03 : L2), mat('#b9dcef', { transparent: true, opacity: 0.45, roughness: 0.05 }))
      const fr = new THREE.Mesh(new THREE.BoxGeometry(o === 'h' ? L2 : 0.07, 0.06, o === 'h' ? 0.07 : L2), mat('#2e3134', { metalness: 0.6 }))
      sash.position.y = -hg / 2; fr.position.y = -hg; p.add(sash, fr)
      if (o === 'v') p.rotation.z = r.out[0] * 0.9; else p.rotation.x = -r.out[1] * 0.9
      scene.add(p)
    }
    else if (ext) { // 落地窗：整面玻璃，深色鋁框；上下框 6 cm、每 1.2 m 一支直框、天花板下 30 cm 牆楣
      seg(body, o, line, a0, a1, WALL_H - HEAD, WALL_H, th)
      seg(bg.glass, o, line, a0, a1, 0.06, WALL_H - HEAD - 0.06, 0.03)
      seg(bg.frame, o, line, a0, a1, 0, 0.06, 0.08)
      seg(bg.frame, o, line, a0, a1, WALL_H - HEAD - 0.06, WALL_H - HEAD, 0.08)
      const n = Math.max(1, Math.round((a1 - a0) / 1.2))
      for (let k = 0; k <= n; k++) { const t = a0 + ((a1 - a0) * k) / n; seg(bg.frame, o, line, t - 0.025, t + 0.025, 0.06, WALL_H - HEAD - 0.06, 0.08) }
    } else { // 室內玻璃（中庭迴廊）：一樣的框
      seg(body, o, line, a0, a1, WALL_H - HEAD, WALL_H, th)
      seg(bg.glass, o, line, a0, a1, 0.06, WALL_H - HEAD - 0.06, 0.03)
      seg(bg.frame, o, line, a0, a1, 0, 0.06, 0.06)
      const n = Math.max(1, Math.round((a1 - a0) / 1.2))
      for (let k = 0; k <= n; k++) { const t = a0 + ((a1 - a0) * k) / n; seg(bg.frame, o, line, t - 0.02, t + 0.02, 0.06, WALL_H - HEAD - 0.06, 0.06) }
    }
    // 牆頂：外牆鑲金邊、內牆深色（模擬市民的牆頂）
    seg(ext ? bg.gold : bg.cap, o, line, a0, a1, WALL_H, WALL_H + 0.025, th + 0.02)
  }
  for (const [x, y, w, h] of [...HALLS, ...ROOMS.filter((r) => !['pool', 'pavilion', 'sports'].includes(r.kind)).map((r) => r.rect)]) {
    const g = new THREE.BoxGeometry(w + 0.1, BASE, h + 0.1)
    g.translate(x + w / 2, BASE / 2, y + h / 2)
    geo.base.push(g)
  }
  const M = {
    ext: mat('#f7f4ee', { roughness: 0.75 }), stone: mat('#7d746a', { roughness: 0.95 }), int: mat('#fbf8f2', { roughness: 0.9 }),
    glass: new THREE.MeshPhysicalMaterial({ color: '#b9dcef', roughness: 0.02, metalness: 0.2, transparent: true, opacity: 0.42, depthWrite: false }),
    frame: mat('#2e3134', { metalness: 0.6, roughness: 0.35 }),
    gold: mat('#c9a227', { metalness: 0.85, roughness: 0.3 }), cap: mat('#4a4440', { roughness: 0.7 }), base: mat('#ece8e0', { roughness: 0.35 }),
  }
  const base = new THREE.Mesh(mergeGeometries(geo.base), M.base)
  base.receiveShadow = true
  scene.add(base)
  buildDecor()
  for (const b of Object.values(buckets)) {
    for (const [k, list] of Object.entries(b.geo)) {
      if (!list.length) continue
      const m = new THREE.Mesh(mergeGeometries(list), M[k])
      m.castShadow = k !== 'glass'
      m.receiveShadow = true
      b.group.add(m)
    }
    for (const [color, list] of Object.entries(b.panels)) {
      const m = new THREE.Mesh(mergeGeometries(list), mat(color, { roughness: 0.85 }))
      m.receiveShadow = true
      b.group.add(m)
    }
    scene.add(b.group, b.art)
  }

  // 地板：每個區一個 mesh，貼圖照世界座標；走廊的紅地毯沿著走廊方向
  const squares = {}
  for (const [key, z] of plan.zone) (squares[z] ??= []).push(key.split(',').map(Number))
  const tex = {}
  const hallOf = (cx, cz) => HALLS.find(([hx, hy, hw, hh]) => cx > hx && cx < hx + hw && cz > hy && cz < hy + hh)
  for (const [z, list] of Object.entries(squares)) {
    const kind = FLOOR[kindOf(z)] ?? 'wood'
    tex[kind] ??= texture(kind)
    const geos = list.map(([i, j]) => {
      const g = new THREE.PlaneGeometry(1 / K, 1 / K).rotateX(-Math.PI / 2)
      g.translate((i + 0.5) / K, BASE + 0.006, (j + 0.5) / K)
      const uv = g.attributes.uv, pos = g.attributes.position
      const h = z === HALL && hallOf((i + 0.5) / K, (j + 0.5) / K)
      for (let n = 0; n < uv.count; n++) {
        const px = pos.getX(n), pz = pos.getZ(n)
        if (h && h[3] > h[2]) uv.setXY(n, (px - h[0]) / h[2], pz)       // 南北向走廊：u 橫過走廊
        else if (h) uv.setXY(n, (pz - h[1]) / h[3], px)                 // 東西向走廊
        else uv.setXY(n, px, -pz)
      }
      return g
    })
    const m = new THREE.Mesh(mergeGeometries(geos), new THREE.MeshStandardMaterial({ map: tex[kind], roughness: kind === 'marble' ? 0.25 : 0.85, emissive: '#ffd54f', emissiveIntensity: 0 }))
    m.receiveShadow = true
    m.userData.id = owner(z) // 附屬衛浴算在它的房間
    m.userData.zone = z
    floors.push(m)
    scene.add(m)
  }

  // 家具、房名
  for (const rm of ROOMS) {
    for (const g of furnish(rm, plan.openings, BASE)) {
      scene.add(g)
      furnGroups.push(g)
      hangs.push(...g.children.filter((c) => c.userData.kind === 'hang'))
    }
    const [x, y, w, h] = rm.rect
    roomInfo[rm.id] = { cx: x + w / 2, cz: y + h / 2, size: Math.max(w, h, 3) }
    const el = document.createElement('div')
    el.className = 'd25-label'
    const o = new CSS2DObject(el)
    o.userData.rm = rm
    o.position.set(x + w / 2, BASE + WALL_H + 0.5, y + h / 2)
    o.userData.id = rm.id
    labelGroup.add(o)
    relabel(o)
  }
  placeArt()
  // 大門：門廊（四根白石柱撐起平頂雨遮、金色飾邊）、三階大理石台階、胡桃木雙開大門（金門把）、兩側壁燈、門口一對造型樹盆栽
  const gate = plan.gates.find((q) => q.main)
  const n0 = scene.children.length
  buildEntrance(gate, M)
  // 模擬市民的綠色鑽石：選到的房間頭上轉
  plumbob = new THREE.Mesh(new THREE.OctahedronGeometry(0.7, 0), new THREE.MeshStandardMaterial({ color: '#3ddc5a', emissive: '#22c445', emissiveIntensity: 0.6, roughness: 0.2, transparent: true, opacity: 0.92 }))
  plumbob.scale.y = 1.7
  plumbob.visible = false
  scene.add(labelGroup, plumbob)
  buildGarden()
  gardenObjs.push(...scene.children.slice(n0).filter((o) => o !== labelGroup && o !== plumbob))
  buildRoof()
  buildCourtRoof()
  buildPeople()
  collectNight()
}

function buildEntrance(gate, M) {
  const g = new THREE.Group(), z = gate.z // 門所在的外牆線（y），門外往北是 -z 方向
  const put = (geo, m, x, y, zz) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, zz); o.castShadow = o.receiveShadow = true; g.add(o); return o }
  const marble = mat('#f4f1ea', { roughness: 0.25 }), stone = mat('#ece6da', { roughness: 0.6 }), wood = mat('#4a2c1a', { roughness: 0.35 })
  const CW = 5, CD = 3.2 // 門廊寬、深（m）
  // 三階台階＋門廊平台
  for (let k = 0; k < 3; k++) put(new THREE.BoxGeometry(CW + 1.2 - k * 0.4, 0.05 + k * 0.05, CD + 0.9 - k * 0.3), marble, gate.x, (0.05 + k * 0.05) / 2, z - (CD + 0.9 - k * 0.3) / 2)
  // 四根柱子（柱礎、柱身、柱頭）
  const colH = WALL_H + 0.25
  for (const sx of [-1, 1]) for (const sz of [0.55, CD - 0.3]) {
    const x = gate.x + sx * (CW / 2 - 0.3), zz = z - sz
    put(new THREE.BoxGeometry(0.5, 0.15, 0.5), stone, x, BASE + 0.08, zz)
    put(new THREE.CylinderGeometry(0.17, 0.2, colH - 0.35, 20), stone, x, BASE + 0.15 + (colH - 0.35) / 2, zz)
    put(new THREE.BoxGeometry(0.46, 0.2, 0.46), stone, x, BASE + colH - 0.1, zz)
  }
  // 平頂雨遮（厚 30 cm、下緣金色飾條），比外牆高一點
  put(new THREE.BoxGeometry(CW + 0.4, 0.3, CD + 0.3), mat('#f7f4ee', { roughness: 0.6 }), gate.x, BASE + colH + 0.15, z - (CD + 0.3) / 2 + 0.15)
  put(new THREE.BoxGeometry(CW + 0.44, 0.05, CD + 0.34), M.gold, gate.x, BASE + colH + 0.02, z - (CD + 0.3) / 2 + 0.15)
  put(new THREE.CylinderGeometry(0.35, 0.35, 0.04, 20), mat('#fff6d8', { emissive: '#ffe1a0', emissiveIntensity: 1.6 }), gate.x, BASE + colH - 0.02, z - CD / 2) // 雨遮下的崁燈
  // 雙開大門：兩扇各 0.8 m 寬、2.4 m 高的胡桃木門，半開；金色長門把；上面一片氣窗
  const dw = gate.hw, dh = Math.min(2.4, WALL_H - 0.35)
  for (const s of [-1, 1]) {
    const leaf = new THREE.Group()
    const p = new THREE.Mesh(new THREE.BoxGeometry(dw, dh, 0.07), wood); p.position.set(-s * dw / 2, dh / 2, 0); p.castShadow = true; leaf.add(p)
    for (const y of [0.55, 1.5]) { const pn = new THREE.Mesh(new THREE.BoxGeometry(dw - 0.2, 0.7, 0.02), mat('#5d3a24', { roughness: 0.35 })); pn.position.set(-s * dw / 2, y, -0.045); leaf.add(pn) }
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.8, 0.04), M.gold); h.position.set(-s * (dw - 0.12), 1.1, -0.06); leaf.add(h)
    leaf.position.set(gate.x + s * dw, BASE, z)
    leaf.rotation.y = s * 0.55 // 往屋內推開
    g.add(leaf)
  }
  put(new THREE.BoxGeometry(dw * 2, WALL_H - dh - 0.05, 0.04), mat('#b9dcef', { transparent: true, opacity: 0.5, roughness: 0.05 }), gate.x, BASE + dh + (WALL_H - dh) / 2, z)
  // 門兩側：深色石材主牆（外牆貼一片 1.4 m 寬的板岩）、霧面玻璃側窗、金色門牌
  const slate = mat('#4a4744', { roughness: 0.55 }), frost = mat('#e8f1f5', { transparent: true, opacity: 0.75, roughness: 0.3 })
  for (const s of [-1, 1]) {
    put(new THREE.BoxGeometry(1.4, WALL_H, 0.06), slate, gate.x + s * (dw + 0.95), BASE + WALL_H / 2, z - 0.16)
    for (let k = 1; k < 7; k++) put(new THREE.BoxGeometry(1.4, 0.01, 0.065), mat('#3a3735'), gate.x + s * (dw + 0.95), BASE + k * 0.4, z - 0.16)
    put(new THREE.BoxGeometry(0.3, dh, 0.04), frost, gate.x + s * (dw + 0.17), BASE + dh / 2, z - 0.05)
  }
  const plaque = put(new THREE.BoxGeometry(0.5, 0.3, 0.03), M.gold, gate.x + dw + 0.95, BASE + 1.6, z - 0.2); void plaque
  // 雨遮下三盞吊燈、台階上一條紅地毯、台階兩側的花台、柱子前的地燈
  for (const dx of [-1.2, 0, 1.2]) { put(new THREE.CylinderGeometry(0.006, 0.006, 0.45, 4), mat('#2e3134'), gate.x + dx, BASE + colH - 0.22, z - CD / 2); put(new THREE.SphereGeometry(0.14, 14, 10), mat('#fff3c4', { emissive: '#ffd27a', emissiveIntensity: 1.5 }), gate.x + dx, BASE + colH - 0.5, z - CD / 2) }
  put(new THREE.BoxGeometry(1.4, 0.02, CD + 0.9), mat('#8c2f39', { roughness: 1 }), gate.x, 0.17, z - (CD + 0.9) / 2)
  for (const s of [-1, 1]) {
    put(new THREE.BoxGeometry(0.5, 0.4, CD), stone, gate.x + s * (CW / 2 + 0.85), 0.2, z - CD / 2 - 0.2)
    for (let k = 0; k < 6; k++) put(new THREE.SphereGeometry(0.13, 10, 8), mat(['#e91e63', '#fdd835', '#ffffff', '#ab47bc', '#ff7043', '#ffffff'][k]), gate.x + s * (CW / 2 + 0.85), 0.47, z - 0.4 - k * (CD - 0.4) / 5)
    for (const sz of [0.55, CD - 0.3]) put(new THREE.CylinderGeometry(0.08, 0.08, 0.06, 12), mat('#fff8e0', { emissive: '#ffe9b0', emissiveIntensity: 1.5 }), gate.x + s * (CW / 2 - 0.3), 0.19, z - sz - 0.45)
    for (const yy of [BASE + 0.2, BASE + colH - 0.25]) for (const sz of [0.55, CD - 0.3]) put(new THREE.CylinderGeometry(0.205, 0.205, 0.05, 20), M.gold, gate.x + s * (CW / 2 - 0.3), yy, z - sz) // 柱子上下金環
  }
  // 門兩側壁燈、造型樹盆栽
  for (const s of [-1, 1]) {
    put(new THREE.BoxGeometry(0.16, 0.35, 0.16), mat('#fff3c4', { emissive: '#ffd27a', emissiveIntensity: 1.4 }), gate.x + s * (dw + 0.35), BASE + 1.9, z - 0.15)
    const tx = gate.x + s * (CW / 2 + 0.1), tz = z - CD - 0.6
    put(new THREE.CylinderGeometry(0.35, 0.28, 0.6, 16), mat('#2e3134', { metalness: 0.4, roughness: 0.4 }), tx, 0.3, tz)
    put(new THREE.CylinderGeometry(0.04, 0.05, 0.5, 8), mat('#5d4037'), tx, 0.85, tz)
    put(new THREE.SphereGeometry(0.42, 16, 12), mat('#2f6b2f', { roughness: 0.9 }), tx, 1.45, tz)
  }
  scene.add(g)
}

// 壁紙、踢腳板、護牆板、掛畫、走廊壁燈：貼在每一區朝內的那面牆上
function buildDecor() {
  const panel = (f, y0, y1, off, color, depth = 0.006) => {
    const L = f.a1 - f.a0, h = y1 - y0, d = (f.ext ? T_EXT : T_INT) / 2 + off
    const g = f.o === 'h' ? new THREE.BoxGeometry(L, h, depth) : new THREE.BoxGeometry(depth, h, L)
    const mid = (f.a0 + f.a1) / 2
    g.translate(f.o === 'h' ? mid : f.line + f.n * d, BASE + y0 + h / 2, f.o === 'h' ? f.line + f.n * d : mid)
    ;(bucketOf(f.out).panels[color] ??= []).push(g)
  }
  const art = (k) => new THREE.MeshStandardMaterial({ map: paintingTex(k), roughness: 0.8 })
  const frameM = mat('#c9a227', { metalness: 0.85, roughness: 0.3 })
  const hang = (f, t, w, h, y, name) => {
    const d = (f.ext ? T_EXT : T_INT) / 2
    const o = new THREE.Group()
    const cv = new THREE.Mesh(new THREE.PlaneGeometry(w, h), art(name))
    cv.position.z = 0.011
    o.add(new THREE.Mesh(new THREE.BoxGeometry(w + 0.05, h + 0.05, 0.02), frameM), cv)
    o.position.set(f.o === 'h' ? t : f.line + f.n * (d + 0.012), BASE + y, f.o === 'h' ? f.line + f.n * (d + 0.012) : t)
    o.rotation.y = f.o === 'h' ? (f.n > 0 ? 0 : Math.PI) : (f.n > 0 ? Math.PI / 2 : -Math.PI / 2)
    bucketOf(f.out).art.add(o)
  }
  const sconce = (f, t) => {
    const d = (f.ext ? T_EXT : T_INT) / 2 + 0.03
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), mat('#fff6d8', { emissive: '#ffe1a0', emissiveIntensity: 1.8 }))
    s.position.set(f.o === 'h' ? t : f.line + f.n * d, BASE + 0.85 * U, f.o === 'h' ? f.line + f.n * d : t)
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.08, 0.03), frameM)
    b.position.copy(s.position).setY(BASE + 0.79 * U)
    bucketOf(f.out).art.add(s, b)
  }
  for (const f of plan.faces) {
    const kind = kindOf(f.zone)
    if (!WALLPAPER[kind]) continue
    const L = f.a1 - f.a0
    panel(f, 0.03, WALL_H, 0.003, WALLPAPER[kind])
    panel(f, 0, 0.1, 0.008, '#3e2a1e', 0.012) // 踢腳板 10 cm
    if (WAINSCOT[kind]) { panel(f, 0.04, 0.38 * U, 0.006, WAINSCOT[kind], 0.008); panel(f, 0.38 * U, 0.38 * U + 0.015, 0.011, '#c9a227', 0.012) }
    if (kind === 'hall') for (let t = f.a0 + 1.25; t < f.a1 - 0.8; t += 5) sconce(f, t) // 走廊每 5 m 一盞壁燈
  }
  // 畫：每間房只掛一幅（掛在最長的那面實牆中間），每幅都不一樣；走廊掛兩幅
  const best = {}
  for (const f of plan.faces) {
    const kind = kindOf(f.zone), L = f.a1 - f.a0
    if (!ART.has(kind) || L < 1.6) continue
    const key = kind === 'hall' ? 'hall' : owner(f.zone)
    ;(best[key] ??= []).push(f)
  }
  placeArt = () => { // 家具擺好之後才掛：找一面牆前面 0.7 m 內沒有高家具擋住的位置
    const bb = new THREE.Box3(), tall = []
    for (const g of furnGroups) for (const c of g.children) { if (['rug', 'hang'].includes(c.userData.kind)) continue; bb.setFromObject(c); if (bb.max.y > BASE + 1.2) tall.push(bb.clone()) }
    const w = 0.55 * U, free = (f, t) => !tall.some((b) => {
      const [lo, hi, a0, a1] = f.o === 'h' ? [b.min.z, b.max.z, b.min.x, b.max.x] : [b.min.x, b.max.x, b.min.z, b.max.z]
      return a1 > t - w / 2 - 0.15 && a0 < t + w / 2 + 0.15 && hi > Math.min(f.line, f.line + f.n * 0.7) && lo < Math.max(f.line, f.line + f.n * 0.7)
    })
    for (const [key, list] of Object.entries(best)) {
      list.sort((a, b) => b.a1 - b.a0 - (a.a1 - a.a0))
      const names = key === 'hall' ? [...HALL_ART] : [PAINTING[kindOf(key)]].filter(Boolean)
      for (const f of list) {
        if (!names.length) break
        const mid = (f.a0 + f.a1) / 2, half = (f.a1 - f.a0) / 2 - w / 2 - 0.1
        for (let d = key === 'hall' ? 1.25 : 0; d <= half; d += 0.25) {
          const t = [mid + d, mid - d].find((q) => free(f, q))
          if (t !== undefined) { hang(f, t, w, 0.4 * U, 0.72 * U, names.shift()); break }
        }
      }
    }
  }
}

// ── 庭園（單位都是公尺）：草地（模擬市民的 1 m 建造格線）、1.2 m 高的樹籬、步道、車道、野柳雕塑、離島小屋的踏石步道、南海的池子、樹 ──
// 車道畫成桃園機場的跑道：深色柏油、兩側白邊線、中間白色虛線、跑道頭的斑馬鍵、跑道編號 05L
function runwayMat(w, l) {
  const c = document.createElement('canvas'), px = 64, H = Math.round(px * l), W = Math.round(px * w)
  c.width = W; c.height = H
  const t = c.getContext('2d')
  t.fillStyle = '#3b3f43'; t.fillRect(0, 0, W, H)
  t.fillStyle = '#f5f5f5'
  t.fillRect(px * 0.15, 0, px * 0.12, H); t.fillRect(W - px * 0.27, 0, px * 0.12, H) // 邊線
  const key = px * 1.6 // 跑道頭（房子那端＝畫布下緣）的斑馬鍵
  for (let k = 0; k < 8; k++) { const bw = (W - px * 0.9) / 16; t.fillRect(px * 0.45 + k * 2 * bw + (k >= 4 ? bw : 0), H - px * 0.4 - key, bw, key) }
  t.save(); t.translate(W / 2, H - px * 2.9); t.font = `bold ${px * 1.0}px Overpass, Arial`; t.textAlign = 'center'; t.textBaseline = 'middle'; t.fillText('05L', 0, 0); t.restore()
  for (let y = H - px * 3.8; y > px * 0.3; y -= px * 1.4) t.fillRect(W / 2 - px * 0.05, y - px * 0.8, px * 0.1, px * 0.8) // 中線虛線
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8
  return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 })
}

function buildGarden() {
  const { x0, x1, z0, z1 } = plan.garden
  const lawnTex = texture('lawn')
  lawnTex.repeat.set((x1 - x0) / 4, (z1 - z0) / 4)
  const lawn = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.08, z1 - z0), new THREE.MeshStandardMaterial({ map: lawnTex, roughness: 0.95 }))
  lawn.material.userData.look = { lego: '#4b9f4a', mc: '#5d9c3b' } // 樂高綠底板、草方塊
  lawn.position.set((x0 + x1) / 2, 0.04, (z0 + z1) / 2)
  lawn.receiveShadow = true
  lawn.userData.noBrick = true
  scene.add(lawn)
  const pts = []
  for (let x = Math.ceil(x0); x <= x1; x++) pts.push(x, 0.085, z0, x, 0.085, z1)
  for (let z = Math.ceil(z0); z <= z1; z++) pts.push(x0, 0.085, z, x1, 0.085, z)
  const gridG = new THREE.BufferGeometry()
  gridG.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
  scene.add(new THREE.LineSegments(gridG, new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.07 })))

  // 樹籬：四邊，北邊在步道、車道那裡留門
  const hedge = []
  const hb = (cx, cz, w, d) => { const g = new THREE.BoxGeometry(w, 1.2, d); g.translate(cx, 0.6, cz); hedge.push(g) }
  const gaps = plan.gates.map((q) => [q.x - q.hw - 0.6, q.x + q.hw + 0.6]).sort((p, q) => p[0] - q[0])
  let from = x0
  for (const [g0, g1] of gaps) { hb((from + g0) / 2, z0, g0 - from, 0.6); from = g1 }
  hb((from + x1) / 2, z0, x1 - from, 0.6)
  const sea = plan.sea // 南邊、西邊的樹籬在海邊斷掉
  hb((x0 + sea.rx + 2 + x1) / 2, z1, x1 - x0 - sea.rx - 2, 0.6); hb(x0, (z0 + z1 - sea.rz - 2) / 2, 0.6, z1 - z0 - sea.rz - 2); hb(x1, (z0 + z1) / 2, 0.6, z1 - z0)
  const hm = new THREE.Mesh(mergeGeometries(hedge), mat('#2f6a2a', { roughness: 1 }))
  hm.castShadow = hm.receiveShadow = true
  scene.add(hm)

  // 步道（碎石）、車道（柏油）；樹籬門口兩根 2 m 門柱
  const gold = mat('#c9a227', { metalness: 0.85, roughness: 0.3 })
  for (const q of plan.gates) {
    const RW = q.hw * 2 + 0.6, RL = q.z - z0
    const road = new THREE.Mesh(new THREE.BoxGeometry(RW, 0.05, RL), q.drive ? runwayMat(RW, RL) : mat('#ddd0b5', { roughness: 1 }))
    if (q.drive) for (let t = 0.6; t < RL - 0.3; t += 1.5) for (const s of [-1, 1]) { // 跑道邊燈：兩側一排小燈（靠房子那端是綠色的跑道頭燈）
      const lt = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.12, 8), mat(t > RL - 1.6 ? '#9cff9c' : '#fff8e0', { emissive: t > RL - 1.6 ? '#33ff66' : '#ffe9b0', emissiveIntensity: 1.5 }))
      lt.position.set(q.x + s * (RW / 2 + 0.15), 0.12, z0 + t); scene.add(lt)
    }
    road.position.set(q.x, 0.1, (q.z + z0) / 2)
    road.receiveShadow = true
    road.userData.tile = true
    road.userData.noBrick = true // 樂高頁另外照範圍鋪平滑磚（legoGates）
    gateRoads.push({ mesh: road, x: q.x - RW / 2, z: z0, w: RW, d: RL, drive: q.drive })
    scene.add(road)
    if (q.drive) { const m = tesla(q.x, q.z - 4.2, 0.125, Math.PI / 2); car = { x: q.x, z: q.z - 4.2, mesh: m, obj: m, base: m.position.z, driver: null }; scene.add(m) } // 車道上停一台特斯拉：靠車庫那頭、車頭朝車庫（南）
    for (const s of [-1, 1]) {
      const pier = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2, 0.5), mat('#f1e7d3'))
      pier.position.set(q.x + s * (q.hw + 0.6), 1, z0)
      pier.castShadow = true
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), gold)
      cap.position.set(q.x + s * (q.hw + 0.6), 2.15, z0)
      scene.add(pier, cap)
    }
  }
  // villa 的木平台：房子外圍一圈 1.6 m 寬的戶外木平台（接落地窗），平台邊每 3 m 一盞地燈；庭園小屋不鋪
  const deck = plan.deck.map(([x, z, w, d]) => new THREE.BoxGeometry(w, 0.12, d).translate(x + w / 2, 0.1, z + d / 2)), ups = plan.ups
  const deckTex = texture('deck')
  const dm = new THREE.Mesh(mergeGeometries(deck), new THREE.MeshStandardMaterial({ map: deckTex, roughness: 0.7 }))
  dm.receiveShadow = true
  dm.userData.tile = true
  dm.userData.noBrick = true // 樂高頁另外照 plan.deck 鋪平滑磚（legoDeck；12 cm 厚不到一片薄板，體素化會整片不見）
  deckMesh = dm
  scene.add(dm)
  inst(new THREE.SphereGeometry(0.07, 10, 8), mat('#fff3c4', { emissive: '#ffd27a', emissiveIntensity: 2 }), ups, (o, [x, z]) => o.position.set(x, 0.12, z))

  // 大門步道兩邊每 6 m 一盞 3 m 高的路燈
  const gate = plan.gates.find((q) => q.main)
  for (let z = gate.z - 2; z > z0 + 1; z -= 6) for (const s of [-1, 1]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 3, 8), mat('#212121'))
    pole.position.set(gate.x + s * (gate.hw + 0.7), 1.5, z)
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 8), mat('#fff3c4', { emissive: '#ffd27a', emissiveIntensity: 1.6 }))
    bulb.position.set(gate.x + s * (gate.hw + 0.7), 3.1, z)
    pole.castShadow = true
    scene.add(pole, bulb)
  }
  // 客廳北邊（北海岸）：野柳的雕塑（女王頭、蕈狀岩）
  scene.add(yehliu(plan.yehliu.x, plan.yehliu.z))
  // 彰化外的小風車、金門的風獅爺、蘭嶼的涼台、車庫外的鋼樓梯
  scene.add(gardenArt(plan.art))
  // 離島小屋的小徑：彎彎的一排踏石（4 種不規則的扁平石頭，灰、米、灰褐色），石頭邊一圈碎石
  { const COL = ['#a8a39a', '#bdb6a8', '#948b7e', '#c9c1b0', '#8f8a82'].map((c) => new THREE.Color(c))
    plan.STONE.forEach((poly, k) => {
      const list = plan.stones.filter((t) => t.k === k)
      if (!list.length) return
      const sh = new THREE.Shape(poly.map(([a, b]) => new THREE.Vector2(a, b)))
      const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.08, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.03, bevelSegments: 2 }).rotateX(-Math.PI / 2)
      const m = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true }), list.length), o = new THREE.Object3D()
      list.forEach((t, n) => { o.position.set(t.x, 0.08, t.z); o.rotation.set(0, t.rot, 0); o.scale.set(t.r, 1, t.r); o.updateMatrix(); m.setMatrixAt(n, o.matrix); m.setColorAt(n, COL[(n * 3 + k) % COL.length]) })
      m.castShadow = m.receiveShadow = true; scene.add(m)
    }) }
  // 南海：庭園西南角的四分之一橢圓，外面一圈沙灘、淺水是淡藍、深一點的海是藍色
  { const sea = plan.sea
    const quarter = (rx, rz) => { const sh = new THREE.Shape(); sh.moveTo(0, 0); for (let k = 0; k <= 48; k++) { const a = (k / 48) * Math.PI / 2; sh.lineTo(Math.cos(a) * rx, Math.sin(a) * rz) } sh.lineTo(0, 0); const g = new THREE.ShapeGeometry(sh); g.rotateX(-Math.PI / 2); return g }
    for (const [pad, c, y, o] of [[2.2, '#e8d9a8', 0.09, {}], [0, '#7fd3e6', 0.1, { roughness: 0.1, transparent: true, opacity: 0.95 }], [-5, '#2a8fc8', 0.11, { roughness: 0.08, transparent: true, opacity: 0.95 }]]) {
      const m = new THREE.Mesh(quarter(sea.rx + pad, sea.rz + pad), mat(c, { roughness: 1, ...o })); m.position.set(sea.x, y, sea.z); m.receiveShadow = true; m.userData.noBrick = true; scene.add(m)
    }
  }
  // 樹：樹幹 2.5 m、樹冠半徑 1.8 m（乘上每棵的大小 s）；灌木半徑 0.6 m；花圃
  inst(new THREE.CylinderGeometry(0.15, 0.22, 2.6, 8), mat('#6d4c41'), plan.trees, (o, [x, z, s]) => { o.position.set(x, 1.3 * s, z); o.scale.setScalar(s) })
  inst(new THREE.ConeGeometry(1.6, 4.5, 10), mat('#2f7d32'), plan.trees.filter((t, n) => n % 3 === 0), (o, [x, z, s]) => { o.position.set(x, 4.4 * s, z); o.scale.setScalar(s) })
  inst(new THREE.SphereGeometry(1.8, 14, 10), mat('#46a743'), plan.trees.filter((t, n) => n % 3 !== 0), (o, [x, z, s]) => { o.position.set(x, 3.8 * s, z); o.scale.setScalar(s) })
  inst(new THREE.SphereGeometry(0.6, 12, 8), mat('#5cbf4f'), plan.shrubs, (o, [x, z, s]) => { o.position.set(x, 0.45 * s, z); o.scale.setScalar(s) })
  ;['#ff4f8b', '#ffe14d', '#ff8a3d', '#b46cff', '#ffffff'].forEach((c, n) => inst(new THREE.SphereGeometry(0.1, 8, 6), mat(c),
    plan.flowers.flatMap(([x, z]) => [[x + ((n * 37) % 7) * 0.1 - 0.3, z + ((n * 53) % 5) * 0.1 - 0.2], [x + ((n * 11) % 5) * 0.12 - 0.25, z - ((n * 29) % 7) * 0.08 + 0.2]]),
    (o, [x, z]) => o.position.set(x, 0.3, z)))
}
function inst(geo, material, list, set) {
  if (!list.length) return
  const m = new THREE.InstancedMesh(geo, material, list.length)
  const o = new THREE.Object3D()
  list.forEach((it, n) => { set(o, it); o.updateMatrix(); m.setMatrixAt(n, o.matrix) })
  m.castShadow = m.receiveShadow = true
  scene.add(m)
}

// ── 視角：模擬市民那樣斜 45° 往下看（窄視角，接近等角投影） ──
const iso = (tx, tz, d) => ({ pos: [tx + d * 0.55, d * 0.8, tz + d * 0.55], target: [tx, 0, tz] })
const VIEWS = {
  // 全景、俯視：對準整塊地（含庭園、離島）的中心，IG 框（4:5）正中間就是整塊地的中心
  overview: iso((plan.garden.x0 + plan.garden.x1) / 2, (plan.garden.z0 + plan.garden.z1) / 2, 270),
  top: { pos: [(plan.garden.x0 + plan.garden.x1) / 2, 240, (plan.garden.z0 + plan.garden.z1) / 2 + 0.2], target: [(plan.garden.x0 + plan.garden.x1) / 2, 0, (plan.garden.z0 + plan.garden.z1) / 2] },
  north: iso(14, 9, 55),
  south: iso(14, 42, 55),
}
// 全景、俯視：照畫面寬高比拉遠（整塊地約 76 × 58 m，設計時是橫的畫面）
const fitK = () => (camera ? Math.max(1, 1.05 / camera.aspect) : 1)
let lastFit = 0, userMoved = false
function viewOf(key) {
  const v = VIEWS[key] ?? VIEWS.overview
  if (key !== 'overview' && key !== 'top') return v
  const k = fitK()
  return { pos: v.pos.map((p, i) => v.target[i] + (p - v.target[i]) * k), target: v.target }
}
function flyTo(pos, target) {
  fly.pos.set(...pos)
  fly.target.set(...target)
  fly.on = true
}
function flyRoom(id) {
  const r = roomInfo[id]
  if (!r) return
  const v = iso(r.cx, r.cz, r.size * 2.2 + 8)
  flyTo(v.pos, v.target)
}

// ── 滑鼠：點到哪個房間的地板 ──
const ray = new THREE.Raycaster(), ptr = new THREE.Vector2()
function pick(ev) {
  const r = wrap.value.getBoundingClientRect()
  ptr.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1)
  ray.setFromCamera(ptr, camera)
  return ray.intersectObjects(floors, false)[0]?.object.userData.id ?? null
}
let downAt = null
// 滑鼠底下的物件名稱：射線打到的第一個看得到的東西，往上找最近一個有名字的群組（家具、模型、人）；打到牆、玻璃、地板就不顯示
const tipName = ref(''), tipXY = ref([0, 0])
let tipQueued = null
function objectName(ev) {
  const hits = ray.intersectObjects(scene.children, true)
  for (const h of hits) {
    let o = h.object, vis = true
    for (let q = o; q; q = q.parent) if (!q.visible) { vis = false; break }
    if (!vis || o.isLine || o.isLineSegments || o.isPoints || o.isCSS2DObject) continue
    const m = Array.isArray(o.material) ? o.material[0] : o.material
    let name = null
    for (let q = o; q && !name; q = q.parent) name = q.userData?.name
    if (!name && m?.transparent && m.opacity < 0.6) continue // 沒名字的玻璃讓射線穿過去
    return name ?? ''
  }
  return ''
}
function onMove(ev) {
  if (!camera || ev.pointerType === 'touch') return // 觸控沒有「滑過」：拖曳時不要一路亮過去
  emit('hover', pick(ev))
  const r = wrap.value.getBoundingClientRect()
  tipXY.value = [ev.clientX - r.left + 14, ev.clientY - r.top + 12]
  if (tipQueued) return
  tipQueued = requestAnimationFrame(() => { tipQueued = null; tipName.value = lang.value === 'zh' ? objectName(ev) : '' })
}
function onClick(ev) {
  if (downAt && Math.hypot(ev.clientX - downAt[0], ev.clientY - downAt[1]) > 4) return // 拖曳不算點
  const id = pick(ev)
  if (id) emit('select', id)
}
function highlight() {
  for (const m of floors) m.material.emissiveIntensity = m.userData.id === props.active ? 0.3 : m.userData.id === props.hover ? 0.15 : 0
  for (const o of labelGroup.children) o.element.classList.toggle('on', !!o.userData.id && (o.userData.id === props.active || o.userData.id === props.hover))
  const r = roomInfo[props.active]
  plumbob.visible = !!r
  if (r) plumbob.position.set(r.cx, BASE + WALL_H + 2.2, r.cz)
}
// 牆：全高、切面（模擬市民：內牆跟朝鏡頭的外牆放低到 15%，背面的外牆留著）、全部放低；放低的牆上掛畫收起來
let wallKey = ''
function setWalls(mode) {
  const cx = camera.position.x - controls.target.x, cz = camera.position.z - controls.target.z
  const key = `${mode}|${Math.sign(Math.round(cx * 10))}|${Math.sign(Math.round(cz * 10))}`
  if (key === wallKey) return
  wallKey = key
  for (const b of Object.values(buckets)) {
    const low = mode === 'low' || (mode === 'cut' && (!b.out || b.out[0] * cx + b.out[1] * cz > 0))
    if (b.lego) { b.lego.full.visible = !low; b.lego.low.visible = low; continue } // 樂高牆：換成矮牆那一組
    b.group.scale.y = low ? 0.15 : 1
    b.group.position.y = low ? BASE * 0.85 : 0
    b.art.visible = !low
  }
  for (const h of hangs) h.visible = mode === 'full'
}

function resize() {
  const w = wrap.value.clientWidth, h = wrap.value.clientHeight
  renderer.setSize(w, h)
  labeler.setSize(w, h)
  if (composer) { composer.setSize(w, h); tiltH.uniforms.h.value = 2.2 / w; tiltV.uniforms.v.value = 2.2 / h }
  camera.aspect = w / h
  // 畫面中心挪到上下操作列中間看得到的那一塊
  camera.setViewOffset(w, h, 0, (props.insetBottom - props.insetTop) / 2, w, h)
  // 直的畫面（手機）比較窄：全景、俯視拉遠一點，整塊地才放得進去
  const k = fitK()
  if (k !== lastFit && !userMoved && VIEWS[props.view]) { lastFit = k; const v = viewOf(props.view); camera.position.set(...v.pos); controls.target.set(...v.target) }
  camera.updateProjectionMatrix()
}
// 標籤不要疊在一起：每 6 格檢查一次，照優先順序（選到／滑到的房間 → 房名，離鏡頭近的先 → 人物）一個個放，
//   跟已經放好的重疊就藏起來（淡出）；被上面標題列、下面操作列擋住的也藏
let tick = 0
function declutter() {
  if (!labeler || !wrap.value) return
  const W = wrap.value.clientWidth, H = wrap.value.clientHeight, PAD = 3
  const els = [...labeler.domElement.children].filter((el) => el.style.display !== 'none')
  const rank = (el) => (el.classList.contains('on') ? 2e6 : el.classList.contains('who') ? 0 : 1e6) + (+el.style.zIndex || 0)
  const placed = []
  for (const el of els.sort((a, b) => rank(b) - rank(a))) {
    const r = el.getBoundingClientRect(), b = wrap.value.getBoundingClientRect()
    const x0 = r.left - b.left - PAD, x1 = r.right - b.left + PAD, y0 = r.top - b.top - PAD, y1 = r.bottom - b.top + PAD
    const on = el.classList.contains('on')
    const hid = !on && (y0 < props.insetTop || y1 > H - props.insetBottom || x1 < 0 || x0 > W || placed.some((q) => x0 < q[1] && x1 > q[0] && y0 < q[3] && y1 > q[2]))
    el.classList.toggle('hid', hid)
    if (!hid) placed.push([x0, x1, y0, y1])
  }
}
function frame() {
  raf = requestAnimationFrame(frame)
  for (const f of tickers) f(performance.now() / 1000) // 會動的東西（視聽室的影片）
  moveCourtRoof()
  { const now = performance.now() / 1000; walk(Math.min(0.1, now - (lastT || now))); lastT = now }
  if (fly.on) {
    camera.position.lerp(fly.pos, 0.08)
    controls.target.lerp(fly.target, 0.08)
    if (camera.position.distanceTo(fly.pos) < 0.05) { // 到了就對齊，不然俯視會差一點點角度
      camera.position.copy(fly.pos)
      controls.target.copy(fly.target)
      fly.on = false
    }
  }
  if (plumbob.visible) plumbob.rotation.y += 0.03
  setWalls(props.walls)
  controls.update()
  updateRoof()
  composer ? composer.render() : renderer.render(scene, camera)
  labeler.render(scene, camera)
  if (++tick % 6 === 0) declutter()
}

onMounted(async () => {
  if (props.look === 'lego') legoParts = await loadParts()
  await new Promise((r) => setTimeout(r, 50)) // 先讓載入畫面畫出來：下面蓋房子要算好幾秒，中間畫面不會動
  if (!wrap.value) return // 載零件時已經離開這頁
  renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, logarithmicDepthBuffer: true }) // 房子很大，遠處地板跟基座會打架
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, LOW ? 1.5 : 2)) // 手機省一點（樂高頁約 490 萬個三角形）
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.15
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  wrap.value.appendChild(renderer.domElement)
  labeler = new CSS2DRenderer()
  labeler.domElement.className = 'd25-labels'
  wrap.value.appendChild(labeler.domElement)
  labeler.domElement.addEventListener('pointerdown', (ev) => (downAt = [ev.clientX, ev.clientY]))

  scene = new THREE.Scene()
  scene.background = new THREE.Color('#9fd6ef')
  scene.fog = new THREE.Fog('#9fd6ef', 500, 1400)
  // 海：房子蓋在海上
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#3d9bd1', roughness: 0.35, metalness: 0.1 }))
  sea.position.set(6, -0.02, 30)
  sea.receiveShadow = true
  sea.userData.noExport = true // AR 模型不要海
  scene.add(sea)
  hemi = new THREE.HemisphereLight('#f2f7ff', '#5b5040', 1.9)
  scene.add(hemi)
  sun = new THREE.DirectionalLight('#fff4e0', 2.8)
  sun.position.set(6 + 45, 100, 30 + 28)
  sun.target.position.set(6, 0, 30)
  sun.castShadow = true
  sun.shadow.mapSize.set(LOW ? 2048 : 4096, LOW ? 2048 : 4096)
  Object.assign(sun.shadow.camera, { left: -85, right: 85, top: 85, bottom: -85, near: 1, far: 350 })
  sun.shadow.bias = -0.0004
  sun.shadow.normalBias = 0.02
  scene.add(sun, sun.target)

  camera = new THREE.PerspectiveCamera(24, 1, 0.1, 3000)
  controls = new MapControls(camera, labeler.domElement)
  controls.enableDamping = true
  controls.maxPolarAngle = Math.PI * 0.45
  controls.minDistance = 2
  controls.maxDistance = 800
  controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }
  controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }
  controls.addEventListener('start', () => { fly.on = false; userMoved = true })
  camera.aspect = wrap.value.clientWidth / Math.max(1, wrap.value.clientHeight)
  const v = viewOf(props.view); lastFit = fitK()
  camera.position.set(...v.pos)
  controls.target.set(...v.target)

  buildHouse()
  labelGroup.visible = props.labels
  setWalls(props.walls)
  highlight()
  updateRoof()
  if (props.look !== 'sims') applyLook(props.look)
  roofK = wallK = -1; updateRoof() // applyLook 換了屋頂、外牆的材質：重新複製、套上透明度
  setNight(props.night)
  // 開發用：src/lib/arExport.js 從這個場景匯出 AR 模型（.glb／.usdz），正式網站不會有
  if (import.meta.env.DEV) window.__lego = { scene, setWalls, roofGroup, outerWalls, labelGroup }
  ro = new ResizeObserver(resize)
  ro.observe(wrap.value)
  resize()
  frame()
  emit('ready')
})

watch(() => props.labels, (v) => { labelGroup.visible = v; for (const w of walkers) w.tag.visible = v })
watch(() => [props.roof, props.outer], updateRoof)
watch(() => props.night, setNight)
watch(() => props.walls, setWalls)
watch(() => props.view, (v) => { if (VIEWS[v]) { const t = viewOf(v); flyTo(t.pos, t.target) } })
watch(() => [props.insetTop, props.insetBottom], () => renderer && resize())
watch(() => props.active, (id) => {
  if (id) flyRoom(id)
  else if (VIEWS[props.view]) { const t = viewOf(props.view); flyTo(t.pos, t.target) }
  highlight()
})
watch(() => props.hover, highlight)

// 下載：目前畫面存 PNG（標籤是 HTML，不會進圖）
function download(name) {
  composer ? composer.render() : renderer.render(scene, camera)
  const a = document.createElement('a')
  a.href = renderer.domElement.toDataURL('image/png')
  a.download = name
  a.click()
}
defineExpose({ download, downloadLdr })

onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  ro?.disconnect()
  controls?.dispose()
  renderer?.dispose()
  renderer?.domElement.remove()
  labeler?.domElement.remove()
})
</script>

<style scoped>
.mansion { position: absolute; inset: 0; background: #9fd6ef; overflow: hidden; isolation: isolate; touch-action: none; }
.obj-tip { position: absolute; z-index: 5; pointer-events: none; padding: 3px 8px; border-radius: 6px; background: rgba(20, 30, 40, 0.88); color: #fff; font-size: 12px; white-space: nowrap; }
.mansion :deep(canvas) { display: block; }
.mansion :deep(.d25-labels) { position: absolute; inset: 0; z-index: 1; overflow: hidden; isolation: isolate; }
:global(.d25-label) { display: flex; flex-direction: column; align-items: center; pointer-events: none; padding: 2px 8px; border-radius: 10px;
  background: rgba(255, 255, 255, 0.9); color: #1d3b4f; font-size: 12px; line-height: 1.3; white-space: nowrap; border: 2px solid #3ddc5a; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25); }
:global(.d25-label) { font-weight: 700; transition: opacity 0.18s; }
:global(.d25-label.hid) { opacity: 0; }
:global(.d25-label span) { font-weight: 400; font-size: 10px; color: #5b6b75; }
:global(.d25-label.who) { padding: 1px 6px; font-size: 11px; border-color: #ff9800; background: #fff8e1; }
:global(.d25-label.on) { background: #3ddc5a; color: #0f2a14; }
:global(.d25-label.on span) { color: #1d4a24; }
</style>
