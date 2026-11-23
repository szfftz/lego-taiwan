// 台灣豪宅的平面：把 layout.js 的矩形切成小格，算出牆、門、窗、庭園（3D 模型與 2D 平面圖共用同一份，所以兩邊一模一樣）
import { ROOMS, HALLS, HALL, DOORS, HALL_DOOR_AT, KITCHEN_PASS, ONSEN_OPEN, NO_WALL, NO_HALL, EXT_DOORS, OPEN, OPEN_SIDE, GLASS, CLOISTER, SEA } from './layout.js'

export const K = 2 // 每格切成 K×K 小格（矩形的邊都在 0.5 的倍數上）
export const MARGIN = 6 // 庭園從房子外框往外幾公尺
const NO_WINDOW = new Set(['bath', 'cellar', 'theater', 'wc', 'garage', 'server'])
const byId = Object.fromEntries(ROOMS.map((r) => [r.id, r]))
export const owner = (z) => (z?.startsWith('wc:') ? z.slice(3) : z)
export const kindOf = (z) => (z?.startsWith('wc:') ? 'wc' : z === HALL ? 'hall' : byId[z]?.kind)

export function computePlan() {
  // 小格 → 哪一區（房間 id、走廊、附屬衛浴 wc:id）；後畫的蓋掉先畫的（嘉義市包在嘉義縣裡）
  const zone = new Map()
  const fillRect = ([x, y, w, h], z) => {
    for (let i = Math.round(x * K); i < Math.round((x + w) * K); i++) for (let j = Math.round(y * K); j < Math.round((y + h) * K); j++) zone.set(`${i},${j}`, z)
  }
  HALLS.forEach((r) => fillRect(r, HALL))
  ROOMS.forEach((r) => fillRect(r.rect, r.id))
  ROOMS.forEach((r) => r.wc && fillRect(r.wc, `wc:${r.id}`))

  // 牆的每一小段：o＝v（南北向，在 x＝L/K）或 h（東西向，在 y＝L/K），t＝沿線第幾小格；d＝從 zs[0] 往 zs[1] 的方向
  const edges = []
  for (const [key, z] of zone) {
    const [i, j] = key.split(',').map(Number)
    for (const [di, dj, o, L, t] of [[1, 0, 'v', i + 1, j], [-1, 0, 'v', i, j], [0, 1, 'h', j + 1, i], [0, -1, 'h', j, i]]) {
      const nz = zone.get(`${i + di},${j + dj}`)
      const side = di > 0 ? 'e' : di < 0 ? 'w' : dj > 0 ? 's' : 'n'
      if (nz === z || (nz && (di < 0 || dj < 0)) || (!nz && (OPEN.has(z) || OPEN_SIDE[z] === side))) continue // 內牆只算一次；露天的不砌外牆
      edges.push({ o, L, t, zs: [z, nz], d: [di, dj], type: nz ? 'int' : 'ext' })
    }
  }
  // 窗：外牆整面落地窗；浴室、車庫、視聽室、中控室等不開；溫室整面玻璃；中庭面走廊的牆是玻璃迴廊
  for (const e of edges) {
    if (e.type === 'ext' && GLASS.has(e.zs[0])) e.type = 'window'
    else if (e.type === 'ext' && !NO_WINDOW.has(kindOf(e.zs[0]))) e.type = 'window' // 豪宅外牆整面落地窗（框、分割在 3D 那邊畫）
    else if (e.type === 'int' && e.zs.includes(CLOISTER) && e.zs.includes(HALL)) e.type = 'window' // 中庭四周的迴廊：面中庭的牆是落地玻璃
    else if (e.type === 'int' && e.zs.includes('66000') && e.zs.includes(HALL) && e.o === 'h') e.type = 'window' // 書房面迴廊（往中庭）那面也是落地窗
  }
  // 廚房南牆的對外吧台：那一段落地窗往外推開（pass）
  { const kt = ROOMS.find((r) => r.kind === 'kitchen'), [kx, ky] = kt.rect
    for (const e of edges) if (e.type === 'window' && !e.zs[1] && e.zs[0] === kt.id && e.o === 'h' && e.L === (ky + kt.rect[3]) * K && e.t >= (kx + KITCHEN_PASS[0]) * K && e.t < (kx + KITCHEN_PASS[1]) * K) e.type = 'pass' }
  // 溫泉浴室東牆那一段不砌牆（半露天風呂）
  { const on = ROOMS.find((r) => r.kind === 'onsen'), [ox, oy, ow] = on.rect
    for (const e of edges) if (!e.zs[1] && e.zs[0] === on.id && e.o === 'v' && e.L === (ox + ow) * K && e.t >= (oy + ONSEN_OPEN[0]) * K && e.t < (oy + ONSEN_OPEN[1]) * K) e.type = 'open' }
  // 門：在一串牆段的正中間開 width 格寬（同一條線上最長的那串）
  const openings = []
  const openMiddle = (list, type = 'door', width = 1, at = 0.5) => {
    at ??= 0.5
    if (!list.length) return null
    const lines = {}
    for (const e of list) (lines[`${e.o}|${e.L}`] ??= []).push(e)
    const run = Object.values(lines).sort((p, q) => q.length - p.length)[0].sort((p, q) => p.t - q.t)
    const n = Math.min(run.length, width * K), m = at === 'a' ? K / 2 : at === 'b' ? run.length - n - K / 2 : Math.max(0, Math.min(run.length - n, Math.floor(run.length * at - n / 2))) // a／b：靠北（西）端、靠南（東）端，離牆角 0.5 m
    run.slice(m, m + n).forEach((e) => (e.type = type))
    const op = { o: run[m].o, line: run[m].L / K, a0: run[m].t / K, a1: (run[m].t + n) / K, type, zs: run[m].zs, d: run[m].d, wall: [run[0].t / K, (run.at(-1).t + 1) / K] } // wall：門所在那面牆的範圍
    openings.push(op)
    return op
  }
  const between = (a, b) => edges.filter((e) => (e.type === 'int' || e.type === 'window') && e.zs.includes(a) && e.zs.includes(b))
  for (const rm of ROOMS) if (!NO_HALL.has(rm.id)) openMiddle(between(rm.id, HALL), 'door', 1, HALL_DOOR_AT[rm.id])
  for (const [a, b, at] of DOORS) openMiddle(between(a, b), 'door', 1, at)
  for (const [a, b] of NO_WALL) for (const e of between(a, b)) e.type = 'open' // 開放式：整面不砌牆
  for (const rm of ROOMS) if (rm.wc) openMiddle(between(`wc:${rm.id}`, rm.id))
  const extDoor = {}
  for (const [id, side, width, type, at] of EXT_DOORS) {
    const o = side === 'n' || side === 's' ? 'h' : 'v'
    const list = edges.filter((e) => e.zs[0] === id && !e.zs[1] && e.o === o)
    const Ls = list.map((e) => e.L)
    const L = side === 'n' || side === 'w' ? Math.min(...Ls) : Math.max(...Ls)
    const op = { ...openMiddle(list.filter((e) => e.L === L), type, width, at), side }
    extDoor[id] ??= op // 同一間有兩道對外門時（車庫：北邊車庫門、南邊小門），步道、車道接第一道
  }

  // 同一條線上相鄰、同種類的小段接成一整段
  const runMap = new Map()
  for (const e of edges) {
    const k = `${e.o}|${e.L}|${e.type}|${e.zs[1] ? 'i' : 'x'}|${e.zs[1] ? '' : e.d.join(',')}`
    if (!runMap.has(k)) runMap.set(k, [])
    runMap.get(k).push(e.t)
  }
  const runs = []
  for (const [k, ts] of runMap) {
    const [o, Ls, type, side, out] = k.split('|')
    ts.sort((p, q) => p - q)
    for (let s0 = 0; s0 < ts.length;) {
      let s1 = s0
      while (s1 + 1 < ts.length && ts[s1 + 1] === ts[s1] + 1) s1++
      runs.push({ o, line: +Ls / K, a0: ts[s0] / K, a1: (ts[s1] + 1) / K, type, ext: side === 'x', out: out ? out.split(',').map(Number) : null })
      s0 = s1 + 1
    }
  }
  // 牆的內面（貼壁紙、掛畫用）：每一區朝自己那一面的實牆，n＝面朝的方向（沿 x 或 y 的正負）；外牆另記朝外的方向 out（切面模式用）
  const faceMap = new Map()
  for (const e of edges) {
    if (e.type !== 'int' && e.type !== 'ext') continue
    const ax = e.o === 'v' ? e.d[0] : e.d[1]
    for (const [z, n] of [[e.zs[0], -ax], [e.zs[1], ax]]) {
      if (!z) continue
      const k = `${z}|${e.o}|${e.L}|${n}|${e.zs[1] ? 'i' : 'x'}`
      if (!faceMap.has(k)) faceMap.set(k, [])
      faceMap.get(k).push(e.t)
    }
  }
  const faces = []
  for (const [k, ts] of faceMap) {
    const [z, o, Ls, n, side] = k.split('|')
    ts.sort((p, q) => p - q)
    for (let s0 = 0; s0 < ts.length;) {
      let s1 = s0
      while (s1 + 1 < ts.length && ts[s1 + 1] === ts[s1] + 1) s1++
      const ext = side === 'x' // 外牆的朝外方向＝朝內的反方向
      faces.push({ zone: z, o, line: +Ls / K, a0: ts[s0] / K, a1: (ts[s1] + 1) / K, n: +n, ext, out: ext ? (o === 'v' ? [-n, 0] : [0, -n]) : null })
      s0 = s1 + 1
    }
  }

  // ── 庭園 ──
  const keys = [...zone.keys()].map((k) => k.split(',').map(Number))
  let x0 = Math.min(...keys.map((k) => k[0])) / K - MARGIN, x1 = (Math.max(...keys.map((k) => k[0])) + 1) / K + MARGIN
  let z0 = Math.min(...keys.map((k) => k[1])) / K - MARGIN, z1 = (Math.max(...keys.map((k) => k[1])) + 1) / K + MARGIN
  const sea = { x: x0, z: z1, ...SEA } // 南海：圓心在庭園西南角
  const inSea = (x, z, pad = 0) => ((x - sea.x) / (sea.rx + pad)) ** 2 + ((z - sea.z) / (sea.rz + pad)) ** 2 < 1
  const doorMid = (d) => (d.o === 'v' ? [d.line, (d.a0 + d.a1) / 2] : [(d.a0 + d.a1) / 2, d.line])
  // 往北出去的門（大門、車庫門）拉一條步道／車道到樹籬
  const gates = []
  for (const d of Object.values(extDoor)) if (d.side === 'n') gates.push({ x: (d.a0 + d.a1) / 2, z: d.line, hw: (d.a1 - d.a0) / 2, main: d.type === 'entrance', drive: d.type === 'garage' })
  // 踏石小徑是一整張路網：一條主幹沿著房子西邊（離西牆 5 m），從北邊的馬祖運動場一路彎到南邊雲林溫室的西門；
  //   其他地方從主幹分支出去：桃園車道（跑道）路肩、車庫外的屋頂鋼樓梯、新竹縣工作室西門、金門酒窖、澎湖碼頭。全部存成很密的折線
  const walks = []
  const OUT = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] }
  const bez = (P, n) => Array.from({ length: n + 1 }, (_, k) => { const t = k / n, u = 1 - t; return [0, 1].map((c) => u ** 3 * P[0][c] + 3 * u * u * t * P[1][c] + 3 * u * t * t * P[2][c] + t ** 3 * P[3][c]) })
  const catmull = (pts, per = 6) => { const out = []; for (let k = 0; k < pts.length - 1; k++) { const p0 = pts[Math.max(0, k - 1)], p1 = pts[k], p2 = pts[k + 1], p3 = pts[Math.min(pts.length - 1, k + 2)]
    for (let i = 0; i < per; i++) { const t = i / per, t2 = t * t, t3 = t2 * t; out.push([0, 1].map((c) => 0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3))) } }
    out.push(pts.at(-1)); return out }
  const near = (line, [x, z]) => line.reduce((b, q) => (Math.hypot(q[0] - x, q[1] - z) < Math.hypot(b[0] - x, b[1] - z) ? q : b))
  // 分支：從 P（往 dir 走出門）彎到主幹上離它最近的點
  const branch = (P, dir, trunk) => { const Q = near(trunk, P), L = Math.hypot(Q[0] - P[0], Q[1] - P[1]), a = Math.min(L / 3, 3), back = [Math.sign(P[0] - Q[0]), 0]
    walks.push(bez([P, [P[0] + dir[0] * a, P[1] + dir[1] * a], [Q[0] + back[0] * Math.min(L / 3, 4), Q[1]], Q], Math.max(6, Math.round(L / 1.2)))) }
  const rectOf = (id) => byId[id].rect
  const sp = rectOf('09007'), gr = rectOf('68000'), pv = rectOf('10016')
  const spGate = [sp[0] + sp[2], sp[1] + sp[3] / 2] // 運動場東邊入口
  const studio = doorMid(extDoor['10004']), green = doorMid(extDoor['10009']), celDoor = doorMid(extDoor['09020'])
  const TX = Math.min(...ROOMS.filter((r) => !OPEN.has(r.id) && !['cellar'].includes(r.kind) && !GLASS.has(r.id)).map((r) => r.rect[0])) - 5 // 主幹離房子西牆 5 m
  const trunk = catmull([spGate, [spGate[0] + 2, spGate[1] + 3], [TX + 0.5, gr[1] + 1], [TX, studio[1]], [TX, green[1] - 2.5], [green[0] - 1.5, green[1] - 0.3], green])
  walks.push(trunk)
  const drive = extDoor['68000'].side === 'n' ? extDoor['68000'] : Object.values(extDoor).find((d) => d.type === 'garage')
  branch([drive.a0 - 0.8, gr[1] - 3], OUT.w, trunk) // 車道（跑道）西邊的路肩，石頭不鋪在跑道上
  branch([gr[0] - 0.8, gr[1] + 6.9], OUT.s, trunk) // 車庫西牆外屋頂鋼樓梯的最下面
  branch(studio, OUT.w, trunk)
  branch(celDoor, OUT[extDoor['09020'].side], trunk)
  branch([pv[0] + pv[2], pv[1] + pv[3] / 2], OUT.e, trunk) // 澎湖碼頭
  const rnd = (() => { let s = 20261125; return () => ((s = (s * 16807) % 2147483647) / 2147483647) })()
  // 踏石：沿著小徑每 70 cm 一塊（一步的距離），左右稍微錯開；形狀是 4 種不規則的扁平石頭（半徑 1 的多邊形），各自轉個角度、大小不一
  const STONE = Array.from({ length: 4 }, () => Array.from({ length: 7 }, (_, i) => { const a = (i / 7) * Math.PI * 2 + rnd() * 0.5, r = 0.75 + rnd() * 0.3; return [Math.cos(a) * r, Math.sin(a) * r] }))
  const stones = []
  for (const w of walks) {
    let acc = 0.35, n = 0
    for (let k = 1; k < w.length; k++) {
      const [ax, az] = w[k - 1], [bx, bz] = w[k], L = Math.hypot(bx - ax, bz - az), nx = -(bz - az) / L, nz = (bx - ax) / L
      for (; acc < L; acc += 0.7, n++) { const t = acc / L, off = (n % 2 ? 1 : -1) * 0.09, sx = ax + (bx - ax) * t + nx * off, sz = az + (bz - az) * t + nz * off
        if (!stones.some((q) => Math.hypot(q.x - sx, q.z - sz) < 0.6)) stones.push({ x: sx, z: sz, r: 0.26 + rnd() * 0.08, rot: rnd() * Math.PI * 2, k: n % 4 }) } // 分支接到主幹的地方不重疊
      acc -= L
    }
  }
  const inHouse = (x, z, pad) => [[0, 0], [pad, 0], [-pad, 0], [0, pad], [0, -pad]].some(([dx, dz]) => zone.has(`${Math.floor((x + dx) * K)},${Math.floor((z + dz) * K)}`))
  const nearWalk = (x, z, pad) => walks.some((w) => w.slice(1).some(([bx, bz], k) => {
    const [ax, az] = w[k]
    return x > Math.min(ax, bx) - pad && x < Math.max(ax, bx) + pad && z > Math.min(az, bz) - pad && z < Math.max(az, bz) + pad
  }))
  const main = gates.find((g) => g.main)
  const fountain = { x: main.x, z: (main.z + z0) / 2 } // 大門前的空地（不放噴水池，留一片草地）
  const liv = ROOMS.find((r) => r.kind === 'living').rect
  const yehliu = { x: liv[0] + liv[2] / 2, z: liv[1] - 5 } // 野柳雕塑：客廳北邊的庭園（北海岸）
  // 庭園裡的地標擺設：彰化兒童房外的小風車花圃、金門酒窖門口的風獅爺
  const rect = (kind) => ROOMS.find((r) => r.kind === kind).rect
  const kids = rect('kids'), cel = rect('cellar'), pav = rect('pavilion'), pool = rect('pool')
  const art = {
    pinwheel: { x: kids[0] - 3.2, z: kids[1] + kids[3] / 2 + 0.6, r: 2.8 },
    fengshi: { x: cel[0] + cel[2] + 0.7, z: cel[1] + 0.6, r: 1.5 },
    lanyu: { x: pool[0] + pool[2] + 4, z: pool[1] + pool[3] * 0.62, r: 4 }, // 蘭嶼：泳池（屏東、墾丁）東南邊的涼台
  }
  const trees = [], shrubs = []
  // 樹：每 40 m² 試一棵（樹冠半徑 1.5～2.5 m），離房子 3 m、步道 1.5 m 以上
  for (let n = 0; n < ((x1 - x0) * (z1 - z0)) / 40; n++) {
    const px = x0 + 1.5 + rnd() * (x1 - x0 - 3), pz = z0 + 1.5 + rnd() * (z1 - z0 - 3)
    const r = rnd(), s = 0.75 + rnd() * 0.5
    if (inHouse(px, pz, 3) || nearWalk(px, pz, 1.8) || gates.some((g) => Math.abs(px - g.x) < g.hw + 3 && pz < g.z + 1)
      || Math.hypot(px - fountain.x, pz - fountain.z) < 5 || Math.hypot(px - yehliu.x, pz - yehliu.z) < 4.5 || Object.values(art).some((a) => Math.hypot(px - a.x, pz - a.z) < a.r + 1.5) || inSea(px, pz, 4)) continue
    if (r < 0.6) trees.push([px, pz, s])
    else shrubs.push([px, pz, s])
  }
  // 花圃：沿著外牆外面
  const flowers = []
  for (const e of edges) {
    if (e.zs[1] || e.type !== 'ext' || rnd() > 0.4) continue
    const out = e.o === 'v' ? [e.d[0] * 2.2, 0] : [0, e.d[1] * 2.2] // 花圃種在木平台外面
    const [mx, mz] = e.o === 'v' ? [e.L / K, (e.t + 0.5) / K] : [(e.t + 0.5) / K, e.L / K]
    if (gates.some((g) => Math.abs(mx - g.x) < g.hw + 1 && mz <= g.z + 1) || nearWalk(mx + out[0], mz + out[1], 1)) continue
    flowers.push([mx + out[0], mz + out[1]])
  }
  // villa 的木平台：房子外圍一圈 1.6 m 寬（接落地窗），平台邊每 3 m 一盞地燈；庭園小屋、大門口、車道不鋪
  const deck = [], ups = [], DW = 1.6, TE = 0.25
  const annex = ROOMS.filter((r) => ['cellar', 'sports', 'pavilion'].includes(r.kind)).map((r) => r.rect)
  const inAnnex = (x, z) => annex.some(([ax, az, aw, ad]) => x > ax - 0.5 && x < ax + aw + 0.5 && z > az - 0.5 && z < az + ad + 0.5)
  for (const r of runs) {
    if (!r.ext || !r.out || r.type === 'open') continue
    const mx = r.o === 'h' ? (r.a0 + r.a1) / 2 : r.line, mz = r.o === 'h' ? r.line : (r.a0 + r.a1) / 2
    if (inAnnex(mx, mz) || gates.some((q) => r.o === 'h' && r.out[1] < 0 && r.a1 > q.x - q.hw - 0.3 && r.a0 < q.x + q.hw + 0.3)) continue
    const off = TE / 2 + DW / 2, L = r.a1 - r.a0 + 0.02
    const [cx, cz] = r.o === 'h' ? [mx, mz + r.out[1] * off] : [mx + r.out[0] * off, mz]
    const [w, d] = r.o === 'h' ? [L, DW] : [DW, L]
    deck.push([cx - w / 2, cz - d / 2, w, d]) // [x, z, 寬, 深]
    for (let t = r.a0 + 1.5; t < r.a1 - 0.5; t += 3) ups.push(r.o === 'h' ? [t, mz + r.out[1] * (TE / 2 + DW + 0.15)] : [mx + r.out[0] * (TE / 2 + DW + 0.15), t])
  }
  return { zone, edges, runs, faces, openings, extDoor, garden: { x0, x1, z0, z1 }, sea, gates, walks, stones, STONE, fountain, yehliu, art, trees, shrubs, flowers, deck, ups }
}
