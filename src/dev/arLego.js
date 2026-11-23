// 樂高頁的 AR 模型（開發用；export_ar.mjs 在頁面裡呼叫）
//   樂高頁每塊磚都是 LDraw 的真實零件，整個場景約 490 萬個三角形，手機 AR 跑不動。
//   AR 版改成：每塊零件換回它佔的格子（1 凸點 0.4 m × 1 片薄板 0.16 m），同一個材質的格子合成一個外殼，
//   只留看得到的面（貼著別的格子的面拿掉），同一平面相鄰的面再合成大長方形。
//   凸點（約 4 萬顆，做成幾何要 70 萬個三角形）改成頂面的貼圖：每格一個圓、右下有影子。
//   縮到桌上 40 公分大，凸點只有 1.6 mm、磚縫（1.5 cm → 0.06 mm）本來就看不到，所以不畫縫。
//   其他東西（小人、地板、草地…）照原本的 src/lib/arExport.js 處理
import * as THREE from 'three'
import { loadParts, BRICK, PLATE_PART, TILE } from '../lego/ldraw.js'
import { PITCH, PLATE } from '../lego/brickify.js'

// 零件 → [長度（凸點）, 高度（薄板）, 有沒有凸點]
const SHAPE = new Map([
  ...BRICK.map((id, i) => [id, [i + 1, 3, true]]),
  ...PLATE_PART.map((id, i) => [id, [i + 1, 1, true]]),
  ...TILE.map((id, i) => [id, [i + 1, 1, false]]),
])
const SC = [PITCH, PLATE, PITCH] // 一格的大小（x、y、z）

// 凸點貼圖：一格 128 px，白底（乘上材質顏色＝原色）；凸點直徑 12 LDU ＝ 0.6 格，右下一圈影子、邊緣一圈淡灰
let studTex = null
function studTexture() {
  if (studTex) return studTex
  const S = 128, c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d'), r = S * 0.3
  g.fillStyle = '#ffffff'
  g.fillRect(0, 0, S, S)
  g.filter = 'blur(3px)'
  g.fillStyle = '#9a9a9a'
  g.beginPath(); g.arc(S / 2 + 7, S / 2 + 7, r, 0, Math.PI * 2); g.fill()
  g.filter = 'none'
  const grad = g.createLinearGradient(S / 2 - r, S / 2 - r, S / 2 + r, S / 2 + r) // 左上亮、右下稍暗
  grad.addColorStop(0, '#ffffff'); grad.addColorStop(1, '#e4e4e4')
  g.fillStyle = grad
  g.beginPath(); g.arc(S / 2, S / 2, r, 0, Math.PI * 2); g.fill()
  g.strokeStyle = '#c4c4c4'; g.lineWidth = 3
  g.stroke()
  studTex = new THREE.CanvasTexture(c)
  studTex.colorSpace = THREE.SRGBColorSpace
  studTex.wrapS = studTex.wrapT = THREE.RepeatWrapping
  return studTex
}
const studMats = new Map()
const studMat = (m) => studMats.get(m) ?? studMats.set(m, Object.assign(m.clone(), { map: studTexture() })).get(m)

// scene：樂高頁的場景；y0：房子地板（零件格子從這裡往上排，Mansion3D.vue 的 BASE）
// tagOf(o)：零件屬於哪一組（例：外牆 'wall'），同一組的面合在一起，網格 userData.arTag 記下來（匯出時材質名字用這個）
// 把畫零件的 InstancedMesh 標成不匯出（userData.noExport），換成一個 AR 用的群組加進場景；回傳這個群組
export async function legoArGroup(scene, { y0 = 0.12, tagOf = () => '' } = {}) {
  const parts = await loadParts()
  const idOf = new Map([...parts].map(([id, g]) => [g, id]))
  const shown = (o) => { for (let p = o; p; p = p.parent) if (!p.visible || p.userData.noExport) return false; return true }
  scene.updateMatrixWorld(true)

  const cells = new Map() // "ix,iy,iz" → { mat, trans, stud, tag }
  const loose = [] // addStuds 的凸點（草地底板、家具頂面）：[x, y, z, 材質]
  const used = []
  const m4 = new THREE.Matrix4(), pos = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(), ax = new THREE.Vector3(), col = new THREE.Color()
  const colored = new Map() // 有 instanceColor 的凸點：材質換成那個顏色
  scene.traverse((o) => {
    if (!o.isInstancedMesh || !shown(o)) return
    const id = idOf.get(o.geometry)
    if (!id) return
    used.push(o)
    const mat = o.material, trans = !!mat.transparent, tag = tagOf(o) || ''
    for (let i = 0; i < o.count; i++) {
      o.getMatrixAt(i, m4)
      m4.premultiply(o.matrixWorld).decompose(pos, q, s)
      if (id === 'stud') {
        let m = mat
        if (o.instanceColor) { o.getColorAt(i, col); const k = `${mat.uuid}|${col.getHexString()}`; m = colored.get(k) ?? colored.set(k, Object.assign(mat.clone(), { color: col.clone() })).get(k) }
        loose.push([pos.x, pos.y, pos.z, m])
        continue
      }
      const [len, h, stud] = SHAPE.get(id)
      ax.set(1, 0, 0).applyQuaternion(q)
      const alongZ = Math.abs(ax.z) > 0.5
      const top = Math.round((pos.y - y0) / PLATE)
      const a0 = Math.round(((alongZ ? pos.z : pos.x) - (len * PITCH) / 2) / PITCH), b = Math.floor((alongZ ? pos.x : pos.z) / PITCH)
      for (let k = 0; k < len; k++) for (let iy = top - h; iy < top; iy++) {
        const ix = alongZ ? b : a0 + k, iz = alongZ ? a0 + k : b
        cells.set(`${ix},${iy},${iz}`, { mat, trans, stud: stud && iy === top - 1, tag })
      }
    }
  })
  for (const o of used) o.userData.noExport = true

  // 面分組：同材質、同原點的面放一起，之後每個平面貪婪合併
  //   sheets：key → { mat, origin：格子 (0,0,0) 的世界座標, uv：要不要凸點貼圖, slices："軸,正負,平面" → Set("u,v") }
  const sheets = new Map()
  const addFace = (mat, origin, uv, a, sg, plane, cu, cv, tag = '') => {
    const key = `${mat.uuid}|${origin.join(',')}|${uv}|${tag}`
    const sh = sheets.get(key) ?? sheets.set(key, { mat: uv ? studMat(mat) : mat, origin, uv, tag, slices: new Map() }).get(key)
    const sk = `${a},${sg},${plane}`
    ;(sh.slices.get(sk) ?? sh.slices.set(sk, new Set()).get(sk)).add(`${cu},${cv}`)
  }
  // 零件的格子：看得到的面＝旁邊沒有格子，或旁邊是透明的（透明的格子貼著透明的也拿掉）；零件最上層露出來的頂面貼凸點
  const DIRS = [[0, 1], [0, -1], [1, 1], [1, -1], [2, 1], [2, -1]]
  const O = [0, y0, 0]
  for (const [k, c] of cells) {
    const p = k.split(',').map(Number)
    for (const [a, sg] of DIRS) {
      const n = [...p]; n[a] += sg
      const nb = cells.get(n.join(','))
      if (nb && (!nb.trans || c.trans)) continue
      const [u, v] = [0, 1, 2].filter((i) => i !== a)
      addFace(c.mat, O, c.stud && a === 1 && sg > 0, a, sg, p[a] + (sg > 0 ? 1 : 0), p[u], p[v], c.tag)
    }
  }
  // 草地、家具頂面的凸點：凸點底面上方 4 mm 貼一片有凸點貼圖的方塊（一格一片，再合併）；凸點不一定對齊 0.4 m 的格線，原點照它自己的
  for (const [x, y, z, mat] of loose) {
    const r = (v) => Math.round(v * 1000) / 1000
    const ox = r((((x - PITCH / 2) % PITCH) + PITCH) % PITCH), oz = r((((z - PITCH / 2) % PITCH) + PITCH) % PITCH)
    addFace(mat, [ox, r(y + 0.004), oz], true, 1, 1, 0, Math.round((x - PITCH / 2 - ox) / PITCH), Math.round((z - PITCH / 2 - oz) / PITCH))
  }

  const group = new THREE.Group()
  group.name = 'lego-ar'
  for (const { mat, origin, uv, tag, slices } of sheets.values()) {
    const P = [], N = [], T = []
    for (const [sk, set] of slices) {
      const [a, sg, plane] = sk.split(',').map(Number)
      const [u, v] = [0, 1, 2].filter((i) => i !== a)
      // 貪婪合併：每次從最小的 (u, v) 開始，先往 v 延伸，再整條往 u 延伸
      const list = [...set].map((t) => t.split(',').map(Number)).sort((p, q) => p[0] - q[0] || p[1] - q[1])
      for (const [u0, v0] of list) {
        if (!set.has(`${u0},${v0}`)) continue
        let v1 = v0
        while (set.has(`${u0},${v1 + 1}`)) v1++
        let u1 = u0
        for (;;) { let ok = true; for (let vv = v0; vv <= v1; vv++) if (!set.has(`${u1 + 1},${vv}`)) { ok = false; break } if (!ok) break; u1++ }
        for (let uu = u0; uu <= u1; uu++) for (let vv = v0; vv <= v1; vv++) set.delete(`${uu},${vv}`)
        const corner = (cu, cv) => { const w = [0, 0, 0]; w[a] = plane; w[u] = cu; w[v] = cv; return w }
        const c00 = corner(u0, v0), c10 = corner(u1 + 1, v0), c11 = corner(u1 + 1, v1 + 1), c01 = corner(u0, v1 + 1)
        // 朝外：(u, v, a) 是右手系時 u×v 朝 +a
        const quad = ((u + 1) % 3 === v) === sg > 0 ? [c00, c10, c11, c00, c11, c01] : [c00, c11, c10, c00, c01, c11]
        const nrm = [0, 0, 0]; nrm[a] = sg
        for (const w of quad) {
          P.push(origin[0] + w[0] * SC[0], origin[1] + w[1] * SC[1], origin[2] + w[2] * SC[2])
          N.push(...nrm)
          T.push(w[0], w[2]) // 凸點貼圖：一格重複一次（只有頂面用到，頂面的 u、v 就是 x、z）
        }
      }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3))
    g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3))
    if (uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(T, 2))
    const mesh = new THREE.Mesh(g, mat)
    mesh.userData.arTag = tag
    group.add(mesh)
  }
  scene.add(group)
  return group
}
