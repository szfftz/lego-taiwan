<template>
  <!-- AR：Google model-viewer（打開 AR 頁才載入）。模型是 scripts/export_ar.mjs 從 3D 頁匯出的 mansion-lego.glb：
       真實零件太重，換成格子外殼＋凸點貼圖；屋頂、外牆、房名板的材質名字是 roof、wall、label，這裡照按鈕調透明度。
       iPhone 沒有事先做 usdz：按 AR 時 model-viewer 從畫面上的模型現做（屋頂、外牆、房名照當下的樣子） -->
  <div ref="box" class="ar-box" :style="{ '--ar-top': `${insetTop + 8}px`, '--ar-bottom': `${insetBottom + 18}px` }">
    <p v-if="failed" class="ar-fail">{{ L('The AR viewer failed to load (it needs unpkg.com). Check your connection and reload.', 'AR 元件載不到（要連得到 unpkg.com），請檢查網路後重新整理') }}</p>
    <RoomStrip v-if="xf" class="ar-strip" :rooms="roomsT" :active="active" @select="zoomTo" />
    <p v-if="note" class="ar-note" :class="{ warn: note.warn }">{{ note.text }}</p>
    <div v-if="!LOW && qrSvg" class="qr-card">
      <div class="qr" v-html="qrSvg"></div>
      <p v-if="lang === 'en'">Scan with your phone<br>to put the house on your table</p><p v-else>用手機掃 QR code<br>把房子放在你的桌上</p>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import qrcode from 'qrcode-generator'
import glbZh from '../lego/data/ar/mansion-lego.glb?url'
import glbEn from '../lego/data/ar/mansion-lego-en.glb?url'
import { L, lang, roomText } from '../i18n.js'
import { LOW } from '../lib/device.js'
import RoomStrip from './RoomStrip.vue'
import { ROOMS } from '../lego/layout.js'

defineProps({ insetTop: { type: Number, default: 0 }, insetBottom: { type: Number, default: 0 } })

// 屋頂、外牆、房名：各自的模式
//   自動（屋頂、外牆）：畫面上的 3D 預覽照鏡頭遠近慢慢淡入淡出：鏡頭距離 ÷ 一開始的距離在 fade[0] 以下全透明、fade[1] 以上不透明
//     屋頂 0.55–0.9（拉近一點就淡掉）、外牆 0.25–0.45（要拉得很近才淡掉）
//   按 AR 之後（網頁拿不到手機的位置）：自動＝屋頂沒有、外牆有
// 房名板是模型裡的貼圖，所以中、英文各一個模型檔（scripts/export_ar.mjs 兩個都匯）
const glbOf = () => (lang.value === 'en' ? glbEn : glbZh)
const roomsT = computed(() => ROOMS.map((r) => ({ id: r.id, ...roomText(r) })))
const M3 = () => ({ auto: L('Auto', '自動'), on: L('On', '開'), off: L('Off', '關') })
const PARTS = {
  roof: { label: () => L('Roof', '屋頂'), modes: M3, fade: [0.55, 0.9], inAr: 0 },
  wall: { label: () => L('Walls', '外牆'), modes: M3, fade: [0.25, 0.45], inAr: 1 },
  // 房名板是模型裡立著的板子：拉近看房間時會互相擋住、擋住房間，「自動」拉近就淡掉（按 AR 之後照樣顯示）
  label: { label: () => L('Names', '房名'), modes: M3, fade: [0.45, 0.7], inAr: 1 },
}
const arText = () => L('View on your table (AR)', '在你的桌上看（AR）')
const noteOf = () => (LOW && !mv.canActivateAR ? { warn: true, text: L('This browser cannot open AR. Use Safari on iPhone or Chrome on Android.', '這個瀏覽器開不了 AR：iPhone 請用 Safari、Android 請用 Chrome 打開') } : { text: LOW ? L('Drag to rotate · pinch to zoom', '一指旋轉・兩指縮放') : L('Drag to rotate · scroll to zoom', '拖曳旋轉・滾輪縮放') })
const mode = reactive({ roof: 'auto', wall: 'auto', label: 'auto' })
const box = ref(null), failed = ref(false), qrSvg = ref(''), note = ref(null)
let mv = null

// ── 房間列表：點一間，預覽的鏡頭對準那一間拉近（拉近後屋頂、外牆在「自動」時會淡掉，看得到裡面） ──
// 房間在模型裡的位置：場景座標（公尺，layout.js 的 rect）× 模型根節點的矩陣（匯出時縮到桌上大小、原點移到地板中心），從 glb 檔頭讀，重新匯出也對得上
const xf = ref(null) // { k, ox, oy, oz }
const active = ref(null)
async function readXf() {
  const buf = await (await fetch(glbOf())).arrayBuffer()
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, new DataView(buf).getUint32(12, true))))
  let nd = json.nodes[json.scenes[json.scene ?? 0].nodes[0]]
  while (nd && !nd.matrix && nd.children?.length === 1) nd = json.nodes[nd.children[0]] // 匯出時外面多包一層
  const m = nd?.matrix
  if (m) xf.value = { k: m[0], ox: m[12], oy: m[13], oz: m[14] }
}
function zoomTo(id) {
  if (!mv || !xf.value) return
  active.value = id
  const rm = ROOMS.find((r) => r.id === id)
  if (!rm) { mv.cameraTarget = 'auto auto auto'; mv.cameraOrbit = '30deg 55deg auto'; return }
  mv.autoRotate = false
  const [x, y, w, h] = rm.rect, { k, ox, oy, oz } = xf.value
  mv.cameraTarget = `${(x + w / 2) * k + ox}m ${1.4 * k + oy}m ${(y + h / 2) * k + oz}m`
  mv.cameraOrbit = `30deg 50deg ${Math.max(0.05, (Math.max(w, h) * 2.2 + 8) * k * 2.2)}m`
}

function apply() {
  if (!mv?.model) return
  mv.__k ??= {}
  for (const [part, P] of Object.entries(PARTS)) {
    const mats = mv.model.materials.filter((m) => m.name === part)
    if (!mats.length) continue
    let k = mode[part] === 'on' ? 1 : mode[part] === 'off' ? 0 : null
    if (k == null) {
      const t = mv.getCameraOrbit().radius / (mv.__r0 || 1)
      k = mv.__inAr ? P.inAr : Math.min(1, Math.max(0, (t - P.fade[0]) / (P.fade[1] - P.fade[0])))
    }
    k = Math.round(k * 50) / 50
    if (mv.__k[part] === k) continue
    mv.__k[part] = k
    for (const m of mats) {
      m.__base ??= [...m.pbrMetallicRoughness.baseColorFactor]
      m.__mode ??= m.getAlphaMode()
      m.setAlphaMode(k < 1 ? 'BLEND' : m.__mode)
      m.pbrMetallicRoughness.setBaseColorFactor([...m.__base.slice(0, 3), m.__base[3] * k])
    }
  }
}
// 畫面右上角的按鈕放在 model-viewer 裡面：Android（WebXR）的 AR 畫面也看得到、按得到
function controlsEl() {
  const wrapEl = Object.assign(document.createElement('div'), { className: 'ar-ctl-wrap' })
  for (const [part, P] of Object.entries(PARTS)) {
    const row = Object.assign(document.createElement('div'), { className: 'ar-ctl' })
    row.appendChild(Object.assign(document.createElement('span'), { textContent: P.label() }))
    for (const [k, label] of Object.entries(P.modes())) {
      const b = Object.assign(document.createElement('button'), { type: 'button', textContent: label, onclick: (e) => { e.stopPropagation(); mode[part] = k } })
      Object.assign(b.dataset, { part, k })
      row.appendChild(b)
    }
    wrapEl.appendChild(row)
  }
  return wrapEl
}
const sync = () => { for (const b of box.value?.querySelectorAll('.ar-ctl button') ?? []) b.classList.toggle('on', mode[b.dataset.part] === b.dataset.k) }
watch(mode, () => { sync(); if (mv) { mv.__k = {}; apply() } })

const loadScript = (src, attrs = {}) => new Promise((resolve, reject) => {
  if (document.querySelector(`script[src="${src}"]`)) return resolve()
  document.head.appendChild(Object.assign(document.createElement('script'), { src, ...attrs, onload: resolve, onerror: reject }))
})
// 從 AR 回來（iPhone 的 AR 是系統另外開的畫面，網頁收不到「結束」）：回到照鏡頭遠近
const back = () => { if (mv && document.visibilityState === 'visible' && mv.__inAr && !mv.__xr) { mv.__inAr = false; mv.__k = {}; apply() } }

onMounted(async () => {
  try {
    const q = qrcode(0, 'M')
    q.addData(`${location.origin}${location.pathname}#ar`)
    q.make()
    qrSvg.value = q.createSvgTag({ cellSize: 4, margin: 2, scalable: true })
  } catch { /* 做不出 QR code：不顯示 */ }
  try { await loadScript('https://unpkg.com/@google/model-viewer@3.5.0/dist/model-viewer.min.js', { type: 'module' }) } catch { failed.value = true; return }
  if (!box.value) return // 載入時已經離開這頁
  mv = document.createElement('model-viewer')
  for (const [k, v] of Object.entries({ src: glbOf(), alt: L('LEGO Taiwan: a house of Taiwan built of LEGO bricks', '樂高台灣：用樂高蓋的台灣豪宅'), ar: '', 'ar-modes': 'webxr scene-viewer quick-look', 'ar-scale': 'auto', 'min-camera-orbit': 'auto auto 0.03m', 'camera-controls': '', 'touch-action': 'none', 'auto-rotate': '', 'shadow-intensity': '1', 'camera-orbit': '30deg 55deg auto', exposure: '1.1' })) mv.setAttribute(k, v)
  mv.addEventListener('load', () => {
    mv.__k = {}; mv.__r0 = mv.getCameraOrbit().radius; apply()
    readXf().catch(() => {}) // 讀不到：不顯示房間列表
    // 手機上開不了 AR（例如 LINE、Facebook 的內建瀏覽器）：說一聲，3D 預覽照樣可以轉
    note.value = noteOf()
  })
  mv.addEventListener('ar-status', (e) => {
    const s = e.detail.status
    mv.__xr = s === 'session-started' || s === 'object-placed'
    mv.__inAr = mv.__xr
    mv.__k = {}; apply()
  })
  mv.addEventListener('camera-change', apply)
  mv.appendChild(controlsEl())
  const btn = Object.assign(document.createElement('button'), { slot: 'ar-button', className: 'ar-btn', textContent: arText() })
  // 按下去那一刻先換成 AR 的樣子（自動＝沒屋頂、有外牆）：iPhone 接著就照畫面上的模型做 usdz
  btn.addEventListener('click', () => { mv.__inAr = true; mv.__k = {}; apply() })
  mv.appendChild(btn)
  box.value.appendChild(mv)
  sync()
  document.addEventListener('visibilitychange', back)
})
// 換語言：換模型檔（房名板的字）、按鈕和說明的字；鏡頭留在原地
watch(lang, () => {
  if (!mv) return
  mv.setAttribute('src', glbOf())
  mv.querySelector('.ar-ctl-wrap')?.remove()
  mv.appendChild(controlsEl()); sync()
  mv.querySelector('.ar-btn').textContent = arText()
  if (note.value) note.value = noteOf()
})
onBeforeUnmount(() => { document.removeEventListener('visibilitychange', back); mv?.remove(); mv = null })
</script>
