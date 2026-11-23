// 開發用：把 3D 頁目前的場景匯出成 AR 模型（.glb：Android、網頁；.usdz：iPhone AR Quick Look）
// Day 25 豪宅、Day 8 烏托邦共用；各天的 export_ar.mjs 用 puppeteer 打開 3D 頁，在頁面裡
//   const m = await import('/src/lib/arExport.js'); await m.exportAr(scene, { size, minR, maxInstances })
// 回傳兩個檔的 base64，再由 export_ar.mjs 存檔
// 做法：看得見的網格全部攤平成世界座標（InstancedMesh 拆開），同一種材質合成一塊；材質一律換成 MeshStandardMaterial
// （USDZ 只吃這種），貼圖縮到 512 px；整個模型縮到最長邊 size 公尺，原點在地板中心，放在桌上剛好
import * as THREE from 'three'
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'
import { USDZExporter } from 'three/addons/exporters/USDZExporter.js'
import { strFromU8, strToU8, unzipSync, zipSync } from 'three/addons/libs/fflate.module.js'

// 預設值（Day 25 豪宅）：最長邊 40 公分；比 MIN_R（包圍球半徑，場景單位）小的東西不放：縮到桌上約 1 公釐，幾乎看不到，只會讓檔案變大
const SIZE = 0.4 // 最長邊（公尺）
const TEX = 512 // 貼圖最大邊（px）
const MIN_R = 0.45

// 一路往上都看得見才算
const shown = (o) => { for (let p = o; p; p = p.parent) if (!p.visible || p.userData.noExport) return false; return true }

// 貼圖縮小（canvas 或圖片）
const small = new Map()
function shrink(tex) {
  if (!tex?.image) return null
  if (small.has(tex)) return small.get(tex)
  const img = tex.image
  const w = img.width, h = img.height
  const k = Math.min(1, TEX / Math.max(w, h))
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(w * k))
  c.height = Math.max(1, Math.round(h * k))
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = tex.wrapS
  t.wrapT = tex.wrapT
  t.repeat.copy(tex.repeat)
  t.offset.copy(tex.offset)
  small.set(tex, t)
  return t
}

// 材質 → MeshStandardMaterial；顏色、貼圖、透明度都一樣的材質合成同一個（場景裡很多家具各自 new 一個同色材質）
// tag：分組名（例如 'roof'）：同色但不同組的材質分開，材質名字＝tag，網頁（model-viewer）才找得到、單獨開關
const mats = new Map()
function toStd(m, vertexColors, tag = '') {
  const key = [tag, m.color?.getHexString(), m.map?.uuid, m.transparent, (m.opacity ?? 1).toFixed(2), m.emissive?.getHexString(), (m.emissiveIntensity ?? 0).toFixed(2), m.side === THREE.DoubleSide, vertexColors].join('|')
  if (mats.has(key)) return mats.get(key)
  const n = new THREE.MeshStandardMaterial({
    color: m.color ? m.color.clone() : new THREE.Color('#ffffff'),
    map: shrink(m.map),
    roughness: m.roughness ?? 0.8,
    metalness: m.metalness ?? 0,
    transparent: !!m.transparent,
    opacity: m.opacity ?? 1,
    side: m.side === THREE.DoubleSide ? THREE.DoubleSide : THREE.FrontSide,
    vertexColors,
  })
  if (tag) n.name = tag
  if (m.emissive && (m.emissiveIntensity ?? 0) > 0) { n.emissive = m.emissive.clone(); n.emissiveIntensity = m.emissiveIntensity }
  mats.set(key, n)
  return n
}

// 圓的東西（球、圓柱、管、擠出的曲線）重建成低面數版本：桌上 40 公分大的房子看不出差別，檔案小好幾倍
const low = new Map()
function lowPoly(g) {
  if (low.has(g)) return low.get(g)
  const p = g.parameters
  let n = g
  try {
    if (g.type === 'SphereGeometry') n = new THREE.SphereGeometry(p.radius, Math.min(p.widthSegments, 10), Math.min(p.heightSegments, 6), p.phiStart, p.phiLength, p.thetaStart, p.thetaLength)
    else if (g.type === 'CylinderGeometry') n = new THREE.CylinderGeometry(p.radiusTop, p.radiusBottom, p.height, Math.min(p.radialSegments, 10), 1, p.openEnded, p.thetaStart, p.thetaLength)
    else if (g.type === 'CapsuleGeometry') n = new THREE.CapsuleGeometry(p.radius, p.height ?? p.length, 2, Math.min(p.radialSegments ?? 8, 8))
    else if (g.type === 'TorusGeometry') n = new THREE.TorusGeometry(p.radius, p.tube, Math.min(p.radialSegments, 6), Math.min(p.tubularSegments, 16), p.arc)
    else if (g.type === 'TubeGeometry') n = new THREE.TubeGeometry(p.path, Math.min(p.tubularSegments, 24), p.radius, Math.min(p.radialSegments, 6), p.closed)
    else if (g.type === 'ExtrudeGeometry') n = new THREE.ExtrudeGeometry(p.shapes, { ...p.options, curveSegments: Math.min(p.options?.curveSegments ?? 12, 4), bevelSegments: Math.min(p.options?.bevelSegments ?? 3, 1) })
    else if (g.type === 'LatheGeometry') n = new THREE.LatheGeometry(p.points, Math.min(p.segments, 10), p.phiStart, p.phiLength)
  } catch { n = g }
  low.set(g, n)
  return n
}

// 一個網格（或 InstancedMesh 的一顆）→ 世界座標的幾何，屬性統一成 position／normal／uv（／color）
// color：InstancedMesh 這一顆的顏色；vc：材質用頂點顏色（Day 8 的房子、地面），幾何本身的 color 要留著
// 兩個都有就相乘（跟 three.js 畫的時候一樣）
// within(x, z)：只留重心在範圍裡的三角形（世界座標；沒給就全留）
function bake(geo, matrix, color, vc, within) {
  geo = lowPoly(geo)
  let g = geo.index ? geo.toNonIndexed() : geo.clone()
  const own = vc ? g.attributes.color : null
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k)
  g.morphAttributes = {}
  g.clearGroups()
  if (!g.attributes.normal) g.computeVertexNormals()
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2))
  g.applyMatrix4(matrix)
  if (within) g = clip(g, within)
  if (color || vc) {
    const n = g.attributes.position.count
    const a = new Float32Array(n * 3)
    const [r, gr, b] = color ? [color.r, color.g, color.b] : [1, 1, 1]
    for (let i = 0; i < n; i++) a.set(own ? [own.getX(i) * r, own.getY(i) * gr, own.getZ(i) * b] : [r, gr, b], i * 3)
    g.setAttribute('color', new THREE.BufferAttribute(a, 3))
  }
  return g
}

// 只留重心在範圍裡的三角形（非索引幾何，每 3 個頂點一個三角形）
function clip(g, within) {
  const pos = g.attributes.position
  const keep = []
  for (let t = 0; t < pos.count; t += 3) {
    const x = (pos.getX(t) + pos.getX(t + 1) + pos.getX(t + 2)) / 3
    const z = (pos.getZ(t) + pos.getZ(t + 1) + pos.getZ(t + 2)) / 3
    if (within(x, z)) keep.push(t)
  }
  if (keep.length * 3 === pos.count) return g
  const out = new THREE.BufferGeometry()
  for (const [k, a] of Object.entries(g.attributes)) {
    const n = a.itemSize
    const arr = new Float32Array(keep.length * 3 * n)
    keep.forEach((t, i) => arr.set(a.array.subarray(t * n, (t + 3) * n), i * 3 * n))
    out.setAttribute(k, new THREE.BufferAttribute(arr, n))
  }
  return out
}

// opts：size＝最長邊（公尺）、minR＝最小包圍球半徑（場景單位）、
// maxInstances＝一個 InstancedMesh 最多留幾顆（太多就平均抽掉，例如上萬棵樹；沒給就全留）、
// within(x, z)＝只放這個範圍裡的東西（世界座標；Day 8 只切中央的一塊）
// tag(o)＝這個網格屬於哪一組（字串，材質名字；沒有回 ''），skip＝不放哪一組（例：iPhone 的 usdz 不放屋頂）
export function buildArModel(scene, { size: SIZE_M = SIZE, minR = MIN_R, maxInstances = Infinity, within = null, tag = () => '', skip = null } = {}) {
  scene.updateMatrixWorld(true)
  const groups = new Map() // 材質 key → { mat, geos }
  let t = ''
  const add = (m, geo, color) => {
    if (!geo.attributes.position.count) return
    const mat = toStd(m, !!color, t)
    const key = mat.uuid
    if (!groups.has(key)) groups.set(key, { mat, geos: [] })
    groups.get(key).geos.push(geo)
  }
  const tmp = new THREE.Matrix4(), c = new THREE.Color()
  const sph = new THREE.Sphere()
  const big = (geo, matrix) => {
    if (!geo.boundingSphere) geo.computeBoundingSphere()
    sph.copy(geo.boundingSphere).applyMatrix4(matrix)
    return sph.radius >= minR
  }
  scene.traverse((o) => {
    if (!o.isMesh || !shown(o)) return
    const m = Array.isArray(o.material) ? o.material[0] : o.material
    if (!m || (m.opacity ?? 1) < 0.05) return
    t = tag(o) || ''
    if (skip && t === skip) return
    if (o.isInstancedMesh) {
      // 先挑出夠大、在範圍裡的（樹一顆一顆看中心點，不切開），太多再平均抽掉
      const ids = []
      for (let i = 0; i < o.count; i++) {
        o.getMatrixAt(i, tmp)
        tmp.premultiply(o.matrixWorld)
        if (big(o.geometry, tmp) && (!within || within(tmp.elements[12], tmp.elements[14]))) ids.push(i)
      }
      const step = Math.max(1, ids.length / maxInstances)
      for (let j = 0; j < ids.length; j += step) {
        const i = ids[Math.floor(j)]
        o.getMatrixAt(i, tmp)
        tmp.premultiply(o.matrixWorld)
        if (o.instanceColor) o.getColorAt(i, c)
        add(m, bake(o.geometry, tmp, o.instanceColor ? c.clone() : null, !!m.vertexColors), !!o.instanceColor || !!m.vertexColors)
      }
    } else if (big(o.geometry, o.matrixWorld)) add(m, bake(o.geometry, o.matrixWorld, null, !!m.vertexColors, within), !!m.vertexColors)
  })
  const root = new THREE.Group()
  for (const { mat, geos } of groups.values()) {
    // 有的有 color 有的沒有不能合：同一組都是同一種（toStd 依 vertexColors 分開了）
    // 合併後把重複的頂點併掉（攤平的方塊一面 6 點 → 4 點），檔案小很多
    // 沒有貼圖的材質用不到 uv，拿掉：檔案小、能併的頂點也更多
    if (!mat.map) for (const g of geos) g.deleteAttribute('uv')
    root.add(new THREE.Mesh(mergeVertices(mergeGeometries(geos), 1e-4), mat))
  }
  // 縮到最長邊 size 公尺、地板中心在原點、底部貼著 y＝0
  const box = new THREE.Box3().setFromObject(root)
  const size = box.getSize(new THREE.Vector3())
  const k = SIZE_M / Math.max(size.x, size.z)
  const ctr = box.getCenter(new THREE.Vector3())
  root.scale.setScalar(k)
  root.position.set(-ctr.x * k, -box.min.y * k, -ctr.z * k)
  const outer = new THREE.Group()
  outer.add(root)
  // xf：場景座標 → 模型座標（公尺）＝ 場景 × k ＋ (ox, oy, oz)；網頁在模型上放標籤（model-viewer 的 hotspot）用
  const xf = { k, ox: -ctr.x * k, oy: -box.min.y * k, oz: -ctr.z * k }
  return { model: outer, meshes: groups.size, size: [size.x * k, size.y * k, size.z * k], xf }
}

// three 的 USDZExporter 把貼圖讀取節點的兩個欄位寫成 token，Apple 的 usdchecker --arkit 會報錯：改成規定的型別；
// 重新打包時每個檔案的資料都對齊 64 位元組（USDZ 規定）
function fixUsdz(buf) {
  const files = unzipSync(new Uint8Array(buf))
  for (const name of Object.keys(files)) {
    if (!name.endsWith('.usda')) continue
    files[name] = strToU8(strFromU8(files[name])
      .replace(/token inputs:varname = /g, 'string inputs:varname = ')
      .replace(/token inputs:in\.connect = /g, 'float2 inputs:in.connect = '))
  }
  const out = {}
  let offset = 0
  for (const [name, data] of Object.entries(files)) {
    const head = 30 + name.length // 本地檔頭 30 位元組＋檔名
    const extraHead = 4 // extra 欄位本身的 id＋長度
    let pad = (64 - ((offset + head + extraHead) % 64)) % 64
    out[name] = [data, { extra: { 12345: new Uint8Array(pad) } }]
    offset += head + extraHead + pad + data.length
  }
  return zipSync(out, { level: 0 })
}

// opts.usdzSkip：usdz（iPhone AR Quick Look，網頁控制不到）不放的那一組；glb 全放
// opts.usdz false：不做 usdz（網頁按 AR 時由 model-viewer 從畫面上的模型現做，屋頂、外牆、標籤照當下的樣子）
export async function exportAr(scene, opts = {}) {
  const { model, meshes, size, xf } = buildArModel(scene, opts)
  const glb = await new GLTFExporter().parseAsync(model, { binary: true })
  const usdz = opts.usdz === false ? null : fixUsdz(await new USDZExporter().parseAsync(opts.usdzSkip ? buildArModel(scene, { ...opts, skip: opts.usdzSkip }).model : model))
  const b64 = (buf) => {
    const u8 = new Uint8Array(buf.buffer ?? buf)
    let s = ''
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000))
    return btoa(s)
  }
  return { glb: b64(glb), usdz: usdz && b64(usdz), meshes, size, xf }
}
