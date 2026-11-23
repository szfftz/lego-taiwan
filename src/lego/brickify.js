// 樂高電影風：把家具、庭園「真的用樂高蓋出來」
//   每個物件體素化成 1 個凸點見方（0.4 m）× 1 片薄板高（0.16 m）的小格；格子顏色換成樂高標準色；
//   同一層、同顏色、相鄰的格子合併成 1×N 的磚（每 3 片高一層錯縫），換成 LDraw 的真實零件；地毯、木平台是平滑的 tile（沒凸點）
//   形狀判斷：方塊、圓柱、圓錐、球用公式（轉了角度也對）；其他（環、管子、合併過的幾何）在表面撒點
import * as THREE from 'three'
import { BRICK, PLATE_PART, TILE } from './ldraw.js'

export const PITCH = 0.4, PLATE = PITCH * 0.4

// objs：要換成樂高的物件（群組或 mesh）；y0：地板高度（格子從這裡往上排）；colorOf(material) → { hex, trans, glow }
// parts：ldraw.js 的 loadParts() 載好的零件幾何
// block：已經被牆佔走的格子（"ix,iy,iz" → { dir, line }：牆沿哪一軸、牆線在哪），家具不放進去，貼著牆的往房間那邊挪一格
export function brickify(objs, { y0, colorOf, parts, tile = () => false, block }) {
  const cells = new Map() // "ix,iy,iz" → { vol, key, tile }
  const inv = new THREE.Matrix4(), mw = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Vector3(), bb = new THREE.Box3()
  const mats = new Map() // key → { hex, trans, glow }
  const put = (ix, iy, iz, vol, key, isTile) => {
    if (iy < 0) return
    let k = `${ix},${iy},${iz}`
    const w = block?.get(k)
    if (w) { // 被牆佔走：往物件那一邊（物件中心在牆線的哪一邊）挪一格，掛在牆上的銀幕、吸音板才不會不見
      const s = (w.dir === 'x' ? bb.min.z + bb.max.z : bb.min.x + bb.max.x) / 2 >= w.line ? 1 : -1
      if (w.dir === 'x') iz += s; else ix += s
      k = `${ix},${iy},${iz}`
      if (block.has(k)) return
    }
    const c = cells.get(k)
    if (!c || vol < c.vol) cells.set(k, { vol, key, tile: isTile })
  }
  const one = (mesh, matrix, isTile) => {
    const m = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
    if (!m || m.visible === false) return
    const col = colorOf(m)
    if (!col) return
    const key = `${col.hex}|${col.trans ?? ''}|${col.glow ?? ''}`
    mats.set(key, col)
    const geo = mesh.geometry
    if (!geo.boundingBox) geo.computeBoundingBox()
    const gb = geo.boundingBox, size = gb.getSize(new THREE.Vector3()), ctr = gb.getCenter(new THREE.Vector3())
    const vol = Math.max(size.x, 0.02) * Math.max(size.y, 0.02) * Math.max(size.z, 0.02)
    bb.copy(gb).applyMatrix4(matrix)
    inv.copy(matrix).invert()
    const t = geo.type, P = geo.parameters ?? {}
    let test = null
    if (t === 'BoxGeometry') {
      const hx = Math.max(size.x / 2, PITCH / 2), hy = Math.max(size.y / 2, PLATE / 2), hz = Math.max(size.z / 2, PITCH / 2)
      test = (v) => Math.abs(v.x - ctr.x) <= hx && Math.abs(v.y - ctr.y) <= hy && Math.abs(v.z - ctr.z) <= hz
    } else if (t === 'CylinderGeometry' || t === 'ConeGeometry') {
      const rt = t === 'ConeGeometry' ? 0 : P.radiusTop, rb = t === 'ConeGeometry' ? P.radius : P.radiusBottom, h = P.height, hy = Math.max(h / 2, PLATE / 2)
      test = (v) => {
        const dy = v.y - ctr.y
        if (Math.abs(dy) > hy) return false
        const r = rb + (rt - rb) * (Math.min(Math.max(dy / h + 0.5, 0), 1))
        return Math.hypot(v.x - ctr.x, v.z - ctr.z) <= Math.max(r, PITCH / 2)
      }
    } else if (t === 'SphereGeometry' || t === 'OctahedronGeometry' || t === 'IcosahedronGeometry' || t === 'DodecahedronGeometry' || t === 'CapsuleGeometry') {
      const rx = Math.max(size.x / 2, PITCH / 2), ry = Math.max(size.y / 2, PLATE / 2), rz = Math.max(size.z / 2, PITCH / 2)
      test = (v) => ((v.x - ctr.x) / rx) ** 2 + ((v.y - ctr.y) / ry) ** 2 + ((v.z - ctr.z) / rz) ** 2 <= 1
    } else if (mesh.userData.polyWorld) { // 日月潭：照湖岸線
      const poly = mesh.userData.polyWorld
      const inPoly = (x, z) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, zi] = poly[i], [xj, zj] = poly[j]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c } return c }
      let n = 0
      for (let ix = Math.floor(bb.min.x / PITCH); ix <= Math.floor(bb.max.x / PITCH); ix++) for (let iz = Math.floor(bb.min.z / PITCH); iz <= Math.floor(bb.max.z / PITCH); iz++) {
        if (!inPoly((ix + 0.5) * PITCH, (iz + 0.5) * PITCH)) continue
        for (let iy = Math.floor((bb.min.y - y0) / PLATE); iy <= Math.max(Math.floor((bb.max.y - y0 - 0.01) / PLATE), 0); iy++) { put(ix, iy, iz, vol, key, isTile); n++ }
      }
      return
    }
    let n = 0
    if (test) {
      const pad = PITCH * 0.5
      for (let ix = Math.floor((bb.min.x - pad) / PITCH); ix <= Math.floor((bb.max.x + pad) / PITCH); ix++)
        for (let iz = Math.floor((bb.min.z - pad) / PITCH); iz <= Math.floor((bb.max.z + pad) / PITCH); iz++)
          for (let iy = Math.floor((bb.min.y - y0 - PLATE / 2) / PLATE); iy <= Math.floor((bb.max.y - y0 + PLATE / 2) / PLATE); iy++) {
            p.set((ix + 0.5) * PITCH, y0 + (iy + 0.5) * PLATE, (iz + 0.5) * PITCH).applyMatrix4(inv)
            if (test(p)) { put(ix, iy, iz, vol, key, isTile); n++ }
          }
    } else { // 表面撒點
      const pos = geo.attributes.position, idx = geo.index, a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3()
      const tri = idx ? idx.count / 3 : pos.count / 3
      for (let f = 0; f < tri; f++) {
        const [i0, i1, i2] = idx ? [idx.getX(f * 3), idx.getX(f * 3 + 1), idx.getX(f * 3 + 2)] : [f * 3, f * 3 + 1, f * 3 + 2]
        a.fromBufferAttribute(pos, i0).applyMatrix4(matrix); b.fromBufferAttribute(pos, i1).applyMatrix4(matrix); c.fromBufferAttribute(pos, i2).applyMatrix4(matrix)
        const n1 = Math.ceil(a.distanceTo(b) / (PLATE * 0.8)) + 1, n2 = Math.ceil(a.distanceTo(c) / (PLATE * 0.8)) + 1
        for (let u = 0; u <= n1; u++) for (let w = 0; w <= n2; w++) {
          const s = u / n1, r = w / n2
          if (s + r > 1) continue
          q.copy(a).addScaledVector(b.clone().sub(a), s).addScaledVector(c.clone().sub(a), r)
          put(Math.floor(q.x / PITCH), Math.floor((q.y - y0) / PLATE), Math.floor(q.z / PITCH), vol, key, isTile); n++
        }
      }
    }
    if (!n) { // 太細、太小：至少放中心那一格
      bb.getCenter(q)
      for (let iy = Math.floor((bb.min.y - y0) / PLATE); iy <= Math.floor((bb.max.y - y0) / PLATE); iy++) put(Math.floor(q.x / PITCH), iy, Math.floor(q.z / PITCH), vol, key, isTile)
    }
  }
  for (const o of objs) {
    o.updateMatrixWorld(true)
    o.traverse((m) => {
      if (!m.isMesh || m.userData.noBrick) return
      const isTile = tile(m)
      if (m.isInstancedMesh) for (let i = 0; i < m.count; i++) { m.getMatrixAt(i, mw); one(m, mw.premultiply(m.matrixWorld), isTile) }
      else one(m, m.matrixWorld, isTile)
    })
  }

  return buildBricks(cells, mats, { y0, parts })
}

// 格子合併成磚、換成 LDraw 零件
//   cells："ix,iy,iz" → { key, tile, dir }（dir 'z'：沿 z 排的牆，磚轉 90°；其他沿 x）；mats：key → { hex, trans, glow }
//   每一層、每一排把同色相鄰的格子併起來，最長 4 格（1×4 磚）；每 3 層一個磚層，奇數磚層錯開 2 格
//   回傳 placed：每個零件的位置，下載 .ldr 用；draw false：只算零件、不畫（房間地板只放進 .ldr）
export function buildBricks(cells, mats, { y0, parts, draw = true }) {
  const rows = new Map()
  for (const [k, c] of cells) {
    const [ix, iy, iz] = k.split(',').map(Number), z = c.dir === 'z', rk = `${z ? 'z' : 'x'},${iy},${z ? ix : iz}`
    ;(rows.get(rk) ?? rows.set(rk, []).get(rk)).push([z ? iz : ix, c])
  }
  const bricks = [] // piece：{ ax, a0, len, iy, b, h, key, tile }（ax 沿哪一軸、a0 起點、b 另一軸的格）
  const pieces = new Map() // `${ax},${a0},${len},${iy},${b}` → piece（往上疊成 3 片高的磚）
  const sortedRows = [...rows.entries()].map(([rk, list]) => { const [ax, iy, b] = rk.split(','); return [ax, +iy, +b, list.sort((p, q) => p[0] - q[0])] }).sort((p, q) => p[1] - q[1])
  for (const [ax, iy, b, list] of sortedRows) {
    const off = Math.floor(iy / 3) % 2 ? 2 : 0
    let s = 0
    while (s < list.length) {
      let e = s
      while (e + 1 < list.length && list[e + 1][0] === list[e][0] + 1 && list[e + 1][1].key === list[s][1].key && list[e + 1][1].tile === list[s][1].tile && e - s < 3 && (list[e + 1][0] + off) % 4 !== 0) e++
      const a0 = list[s][0], len = e - s + 1, c = list[s][1]
      const below = pieces.get(`${ax},${a0},${len},${iy - 1},${b}`)
      if (below && below.key === c.key && below.h < 3 && iy % 3 !== 0 && !c.tile) { below.h++; pieces.set(`${ax},${a0},${len},${iy},${b}`, below) }
      else { const pc = { ax, a0, len, iy, b, h: 1, key: c.key, tile: c.tile }; pieces.set(`${ax},${a0},${len},${iy},${b}`, pc); bricks.push(pc) }
      s = e + 1
    }
  }
  // 凸點：上面沒有格子的那一格（tile 不加）
  let studs = 0
  for (const [k, c] of cells) {
    const [ix, iy, iz] = k.split(',').map(Number)
    if (!c.tile && !cells.has(`${ix},${iy + 1},${iz}`)) studs++
  }

  // 畫：LDraw 的真實零件（ldraw.js）——3 片高＝磚、1 片高＝薄板（地毯、木平台是平滑磚）、2 片高＝兩片薄板疊起來
  //   零件本身就有凸點，被上面蓋住的凸點藏在上面那塊的空心底部裡；每種顏色 × 每種零件一個 InstancedMesh；磚之間留 1.5 cm 縫
  const placed = [] // { id, key, col, x, y, z, rot, len }：零件頂面中心（公尺）；col：顏色 { hex, trans }；rot：沿 z 排的轉 90°
  for (const b of bricks) {
    const at = (b.a0 + b.len / 2) * PITCH, side = (b.b + 0.5) * PITCH, rot = b.ax === 'z'
    const add = (id, top) => placed.push({ id, key: b.key, col: mats.get(b.key), x: rot ? side : at, y: y0 + top * PLATE, z: rot ? at : side, rot, len: b.len })
    if (b.h === 3) add(BRICK[b.len - 1], b.iy + 3)
    else if (b.tile) add(TILE[b.len - 1], b.iy + 1)
    else for (let k = 0; k < b.h; k++) add(PLATE_PART[b.len - 1], b.iy + k + 1)
  }
  const group = new THREE.Group()
  group.userData.lego = true
  const o = new THREE.Object3D(), G = 0.015
  if (draw) for (const [key, col] of mats) {
    const material = new THREE.MeshStandardMaterial({ color: col.hex, roughness: 0.25, metalness: 0, transparent: !!col.trans, opacity: col.trans || 1, emissive: col.glow ? col.hex : '#000000', emissiveIntensity: col.glow ?? 0, depthWrite: !col.trans })
    const byPart = new Map()
    for (const it of placed) if (it.key === key) (byPart.get(it.id) ?? byPart.set(it.id, []).get(it.id)).push(it)
    for (const [id, its] of byPart) {
      const im = new THREE.InstancedMesh(parts.get(id), material, its.length)
      its.forEach((it, i) => {
        o.position.set(it.x, it.y, it.z) // 原點在零件頂面
        o.rotation.y = it.rot ? Math.PI / 2 : 0
        o.scale.set(1 - G / (it.len * PITCH), 1, 1 - G / PITCH)
        o.updateMatrix(); im.setMatrixAt(i, o.matrix)
      })
      im.castShadow = !col.trans; im.receiveShadow = true
      group.add(im)
    }
  }
  return { group, bricks: placed.length, studs, placed, cells }
}
