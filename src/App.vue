<template>
  <!-- 樂高台灣：從 K30DayMapChallenge 2026 Day 27 搬出來的手機版（做法同 birth-lottery）。
       整個畫面就是舞台（樂高 3D／AR），上面浮著標題和 3D｜AR 切換，下面浮著操作列；
       房間、設定、資訊（零件表、說明）是從下面拉上來的面板。 -->
  <div class="phone" :style="{ '--top-h': `${insets.top}px` }">
    <div class="stage" @pointerdown="tipOn = false">
      <template v-if="mode === '3d'">
        <Mansion3D ref="scene" look="lego" :labels="labels" :walls="walls" :view="view" :roof="roof" :outer="outer" :court="court" :night="night" :active="active" :hover="hover"
                   :inset-top="insets.top" :inset-bottom="insets.bottom"
                   @hover="(id) => (hover = id)" @select="select" @parts="(p) => (parts = p)" @ready="onReady" />
        <Transition name="fade">
          <div v-if="!ready" class="loading">
            <div class="bricks"><i></i><i></i><i></i></div>
            <b>正在蓋房子…</b>
            <small>兩萬多塊樂高零件，要等幾秒</small>
          </div>
        </Transition>
      </template>
      <ArView v-else :inset-top="insets.top" :inset-bottom="insets.bottom" />
    </div>

    <header ref="topEl" class="top">
      <h1 class="brand"><span class="studs"><i></i><i></i><i></i><i></i></span>樂高台灣</h1>
      <nav class="seg" aria-label="模式">
        <button type="button" :class="{ on: mode === '3d' }" @click="setMode('3d')">3D</button>
        <button type="button" :class="{ on: mode === 'ar' }" @click="setMode('ar')">AR</button>
      </nav>
      <button type="button" class="round" aria-label="資訊" @click="sheet = 'info'">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M12 11v6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" /><circle cx="12" cy="7" r="1.5" fill="currentColor" /></svg>
      </button>
    </header>

    <!-- 選到（或滑鼠移到）的房間 -->
    <Transition name="fade">
      <div v-if="mode === '3d' && tip && ready" class="room-card" :style="{ bottom: `${insets.bottom + 10}px` }">
        <div><b>{{ tip.name }}</b><span>{{ tip.county }}</span><p>{{ tip.why }}</p></div>
        <!-- 選到房間時：上一間、下一間（照房間列表的順序）、關閉回到原本的視角 -->
        <nav v-if="active" class="rc-nav">
          <button type="button" class="x" aria-label="關閉" @click="active = null">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" fill="none" /></svg>
          </button>
          <div>
            <button type="button" class="x" aria-label="上一間" @click="step(-1)"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M14.5 6l-6 6 6 6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" fill="none" /></svg></button>
            <button type="button" class="x" aria-label="下一間" @click="step(1)"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M9.5 6l6 6-6 6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" fill="none" /></svg></button>
          </div>
        </nav>
      </div>
    </Transition>

    <!-- 第一次進來：怎麼操作（動一下畫面或 6 秒後消失） -->
    <Transition name="fade">
      <p v-if="mode === '3d' && ready && tipOn && !tip" class="gesture" :style="{ bottom: `${insets.bottom + 12}px` }">{{ LOW ? '一指旋轉・兩指平移縮放・點房間看介紹' : '左鍵旋轉・右鍵平移・滾輪縮放・點房間看介紹' }}</p>
    </Transition>

    <footer v-show="mode === '3d'" ref="dockEl" class="dock">
      <button type="button" class="brick yellow" @click="sheet = 'rooms'">房間<small>{{ rooms.length }} 個縣市</small></button>
      <button type="button" class="brick white" @click="nextView">視角<small>{{ VIEWS[view] }}</small></button>
      <button type="button" class="brick white" @click="sheet = 'settings'">設定<small>牆・屋頂・夜景</small></button>
      <button type="button" class="brick red" @click="setMode('ar')">AR<small>放在桌上</small></button>
    </footer>

    <!-- 房間 -->
    <BottomSheet :open="sheet === 'rooms'" label="房間" @close="sheet = null">
      <template #head><h2>房間<small>點一下飛過去</small></h2><CloseBtn @click="sheet = null" /></template>
      <main class="content">
        <ul class="rooms">
          <li v-for="rm in rooms" :key="rm.id" :class="{ on: active === rm.id }" @click="select(rm.id); sheet = null">
            <span class="cty">{{ rm.county }}</span><b>{{ rm.name }}</b><small>{{ rm.why }}</small>
          </li>
        </ul>
      </main>
    </BottomSheet>

    <!-- 設定 -->
    <BottomSheet :open="sheet === 'settings'" label="設定" sheet-class="short" @close="sheet = null">
      <template #head><h2>設定</h2><CloseBtn @click="sheet = null" /></template>
      <main class="content opts">
        <div class="opt"><span>視角</span><div class="chips"><button v-for="(v, k) in VIEWS" :key="k" type="button" :class="{ on: view === k }" @click="setView(k)">{{ v }}</button></div></div>
        <div class="opt"><span>牆</span><div class="chips"><button v-for="(v, k) in WALLS" :key="k" type="button" :class="{ on: walls === k }" @click="walls = k">{{ v }}</button></div></div>
        <div class="opt"><span>屋頂</span><div class="chips"><button v-for="(v, k) in AUTO" :key="k" type="button" :class="{ on: roof === v[1] }" @click="roof = v[1]">{{ v[0] }}</button></div></div>
        <div class="opt"><span>外牆</span><div class="chips"><button v-for="(v, k) in AUTO" :key="k" type="button" :class="{ on: outer === v[1] }" @click="outer = v[1]">{{ v[0] }}</button></div></div>
        <div class="opt"><span>顯示</span><div class="chips">
          <button type="button" :class="{ on: labels }" @click="labels = !labels">房名</button>
          <button type="button" :class="{ on: night }" @click="night = !night">夜景</button>
          <button type="button" :class="{ on: court }" @click="court = !court">中庭天窗{{ court ? '關' : '開' }}</button>
        </div></div>
        <div class="opt"><span>下載</span><div class="chips">
          <button type="button" @click="scene?.download('lego-taiwan.png')">PNG</button>
          <button type="button" @click="scene?.downloadLdr('lego-taiwan.ldr')">LDR</button>
        </div></div>
        <p class="hint">屋頂、外牆「自動」：鏡頭拉近時屋頂先慢慢消失，拉得很近外牆也消失。LDR 可以用 BrickLink Studio 打開。</p>
      </main>
    </BottomSheet>

    <!-- 資訊：零件表、說明 -->
    <BottomSheet :open="sheet === 'info'" label="資訊" @close="sheet = null">
      <template #head>
        <nav class="tabs" role="tablist"><button v-for="(v, k) in TABS" :key="k" type="button" role="tab" :class="{ on: tab === k }" @click="tab = k">{{ v }}</button></nav>
        <CloseBtn @click="sheet = null" />
      </template>
      <main class="content info">
        <template v-if="tab === 'parts'">
          <h3>樂高零件表</h3>
          <table v-if="parts" class="parts"><tbody>
            <tr v-for="r in parts.list" :key="r.id"><td>{{ r.name }}<small>（{{ r.id }}）</small></td><td>{{ r.n.toLocaleString() }}</td></tr>
            <tr><td>小人</td><td>5</td></tr>
            <tr><td><b>合計</b></td><td><b>{{ (parts.total + 5).toLocaleString() }}</b></td></tr>
          </tbody></table>
          <p v-else class="hint">零件表在 3D 頁蓋好房子之後才算得出來（先切到 3D）。</p>
          <p class="hint">零件編號是 LDraw／樂高的零件號。「設定」裡下載 LDR，可以用 BrickLink Studio 開，算價錢、做寫實渲染。</p>
          <h3>樂高標準色<small>所有東西都換成最接近的一色</small></h3>
          <div class="pal"><i v-for="c in LEGO_PAL" :key="c" :style="{ background: c }" :title="c"></i></div>
        </template>
        <template v-else>
          <h3>台灣是一棟用樂高蓋的房子</h3>
          <p>{{ rooms.length }} 個縣市、{{ rooms.length }} 個房間：房間照縣市的經緯度排，平面圖就是台灣地圖，每間房都放那個縣市的特色。</p>
          <h3>怎麼玩</h3>
          <ul>
            <li><b>3D</b>：一指拖曳旋轉、兩指平移和縮放（電腦：左鍵旋轉、右鍵平移、滾輪縮放）；點房間、或在「房間」選一間飛過去。</li>
            <li><b>AR</b>：用手機按「在你的桌上看（AR）」，把鏡頭對著桌面，整棟房子（約 25 × 19 公分）就放在桌上，可以繞著看、湊近看房間。iPhone 用 Safari、Android 用 Chrome。</li>
          </ul>
          <h3>計算方法</h3>
          <p class="formula">凸點數 ＝ 長度 ÷ 0.4 m<br>牆高 ＝ 6 層磚 ＝ 18 片薄板 ＝ 2.88 m</p>
          <ul>
            <li><b>樂高</b>：1 個凸點 ＝ 0.4 m，小人 1.7 m 大約 4 個凸點高。每個東西都換成 LDraw 的真實零件（1×1～1×4 的磚、薄板、平滑磚）：牆 1 個凸點厚、錯縫疊 6 層，落地窗是黑框加透明磚；房間地板鋪平滑磚、整塊地鋪 32×32 綠色底板。</li>
            <li><b>尺寸</b>：照真的住宅平面圖畫（1 格 ＝ 1 m）：走廊寬 2 m，室內門 1 m，家具照一般尺寸（雙人床 1.6 × 2.1 m）。</li>
            <li><b>AR 模型</b>：真實零件約 490 萬個三角形，手機 AR 跑不動，所以換成格子外殼，凸點畫成頂面的貼圖、不畫磚縫（縮到桌上凸點只有 1 mm）。</li>
          </ul>
          <h3>資料來源</h3>
          <ul class="src">
            <li v-for="s in SOURCES" :key="s.label">{{ s.label }}：{{ s.org }}<br><a :href="s.url" target="_blank" rel="noopener">{{ s.url }}</a></li>
          </ul>
          <p class="hint">LEGO® 是 LEGO Group 的商標；這個網頁不是 LEGO Group 的產品，也沒有得到它的贊助或授權。</p>
          <p class="ver">版本 v{{ VERSION }}・{{ BUILT }}</p>
        </template>
      </main>
    </BottomSheet>
  </div>
</template>

<script setup>
import { computed, h, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import Mansion3D from './lego/Mansion3D.vue'
import ArView from './components/ArView.vue'
import BottomSheet from './components/BottomSheet.vue'
import { ROOMS, HALL } from './lego/layout.js'
import { LEGO_PAL } from './lego/looks.js'
import { SOURCES } from './lego/sources.js'
import { LOW } from './lib/device.js'

const VERSION = __APP_VERSION__, BUILT = __APP_BUILT__
const CloseBtn = () => h('button', { type: 'button', class: 'x', 'aria-label': '關閉' }, [
  h('svg', { viewBox: '0 0 24 24', width: 18, height: 18, 'aria-hidden': 'true' }, [h('path', { d: 'M6 6l12 12M18 6L6 18', stroke: 'currentColor', 'stroke-width': 2.4, 'stroke-linecap': 'round', fill: 'none' })]),
])

// ── 模式跟著網址走：#ar＝AR（電腦上的 QR code 就是這個網址），其他＝3D ──
const mode = ref(location.hash === '#ar' ? 'ar' : '3d')
const ready = ref(false) // 3D：房子蓋好了
function setMode(m) {
  if (mode.value === m) return
  if (m === '3d') ready.value = false
  mode.value = m
  active.value = hover.value = sheet.value = null
  history.replaceState(null, '', m === 'ar' ? '#ar' : location.pathname + location.search)
}
const onKey = (e) => {
  if (e.key === 'Escape') { if (sheet.value) sheet.value = null; else active.value = null }
  else if (active.value && !sheet.value && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) step(e.key === 'ArrowLeft' ? -1 : 1)
}
const onHash = () => setMode(location.hash === '#ar' ? 'ar' : '3d')

// ── 3D 的設定 ──
const VIEWS = { overview: '全景', top: '俯視', north: '北部', south: '南部' }
const WALLS = { full: '全高', cut: '切面', low: '矮牆' }
const AUTO = [['自動', 'auto'], ['開', true], ['關', false]]
const TABS = { about: '說明', parts: '零件表' }
const view = ref('overview'), walls = ref('full'), labels = ref(true), roof = ref('auto'), outer = ref('auto'), court = ref(false), night = ref(false)
const hover = ref(null), active = ref(null), parts = ref(null), scene = ref(null)
const sheet = ref(null), tab = ref('about')

const rooms = ROOMS
const byId = Object.fromEntries(rooms.map((r) => [r.id, r]))
byId[HALL] = { county: '走廊', name: '紅地毯走廊', why: '北邊東西向、中間南北向（中央山脈），中庭四周是玻璃迴廊' }
const tip = computed(() => byId[active.value ?? hover.value] ?? null)
const select = (id) => (active.value = active.value === id ? null : id)
function step(d) { const i = rooms.findIndex((r) => r.id === active.value); active.value = rooms[(i + d + rooms.length) % rooms.length].id }
// 操作提示：房子蓋好後顯示，動一下畫面或 6 秒後消失（每次開網頁只出現一次）
const tipOn = ref(false)
let tipShown = false
function onReady() { ready.value = true; if (!tipShown) { tipShown = tipOn.value = true; setTimeout(() => (tipOn.value = false), 6000) } }
function setView(k) { view.value = k; active.value = null }
function nextView() { const ks = Object.keys(VIEWS); setView(ks[(ks.indexOf(view.value) + 1) % ks.length]) }

// ── 版面：舞台蓋滿整個畫面；上面標題列、下面操作列擋住的高度（px），3D 把畫面中心放在中間看得到的那一塊 ──
const topEl = ref(null), dockEl = ref(null)
const insets = reactive({ top: 0, bottom: 0 })
function measure() {
  insets.top = Math.round(topEl.value?.getBoundingClientRect().bottom ?? 0)
  const d = dockEl.value?.getBoundingClientRect()
  insets.bottom = d?.height ? Math.round(window.innerHeight - d.top) : 0
}
let ro
onMounted(() => {
  ro = new ResizeObserver(measure)
  ro.observe(topEl.value); ro.observe(dockEl.value); ro.observe(document.documentElement)
  measure()
  window.addEventListener('hashchange', onHash)
  window.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => { ro?.disconnect(); window.removeEventListener('hashchange', onHash); window.removeEventListener('keydown', onKey) })
</script>
