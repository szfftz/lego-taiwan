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
            <b>{{ L('Building the house…', '正在蓋房子…') }}</b>
            <small>{{ L('Over 20,000 bricks. Give it a few seconds', '兩萬多塊樂高零件，要等幾秒') }}</small>
          </div>
        </Transition>
      </template>
      <ArView v-else :inset-top="insets.top" :inset-bottom="insets.bottom" />
    </div>

    <header ref="topEl" class="top">
      <h1 class="brand"><span class="studs"><i></i><i></i><i></i><i></i></span>{{ L('LEGO Taiwan', '樂高台灣') }}</h1>
      <nav class="seg" :aria-label="L('Mode', '模式')">
        <button type="button" :class="{ on: mode === '3d' }" @click="setMode('3d')">3D</button>
        <button type="button" :class="{ on: mode === 'ar' }" @click="setMode('ar')">AR</button>
      </nav>
      <button type="button" class="round lang" :aria-label="L('切換成中文', 'Switch to English')" @click="setLang(lang === 'en' ? 'zh' : 'en')">{{ L('中', 'EN') }}</button>
      <button type="button" class="round" :aria-label="L('Info', '資訊')" @click="sheet = 'info'">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M12 11v6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" /><circle cx="12" cy="7" r="1.5" fill="currentColor" /></svg>
      </button>
    </header>

    <!-- 選到（或滑鼠移到）的房間 -->
    <Transition name="fade">
      <div v-if="mode === '3d' && tip && ready" class="room-card" :style="{ bottom: `${insets.bottom + 10}px` }">
        <div><b>{{ tip.name }}</b><span>{{ tip.county }}</span><p>{{ tip.why }}</p></div>
        <!-- 選到房間時：上一間、下一間（照房間列表的順序）、關閉回到原本的視角 -->
        <nav v-if="active" class="rc-nav">
          <button type="button" class="x" :aria-label="L('Close', '關閉')" @click="active = null">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" fill="none" /></svg>
          </button>
          <div>
            <button type="button" class="x" :aria-label="L('Previous room', '上一間')" @click="step(-1)"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M14.5 6l-6 6 6 6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" fill="none" /></svg></button>
            <button type="button" class="x" :aria-label="L('Next room', '下一間')" @click="step(1)"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M9.5 6l6 6-6 6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" fill="none" /></svg></button>
          </div>
        </nav>
      </div>
    </Transition>

    <!-- 第一次進來：怎麼操作（動一下畫面或 6 秒後消失） -->
    <Transition name="fade">
      <p v-if="mode === '3d' && ready && tipOn && !tip" class="gesture" :style="{ bottom: `${insets.bottom + 12}px` }">{{ LOW ? L('Drag to rotate · two fingers to pan and zoom · tap a room', '一指旋轉・兩指平移縮放・點房間看介紹') : L('Left-drag rotate · right-drag pan · scroll zoom · click a room', '左鍵旋轉・右鍵平移・滾輪縮放・點房間看介紹') }}</p>
    </Transition>

    <footer v-show="mode === '3d'" ref="dockEl" class="dock">
      <RoomStrip :rooms="roomsT" :active="active" @select="(id) => (active = id)" />
      <button type="button" class="brick yellow" @click="sheet = 'rooms'">{{ L('Rooms', '房間') }}<small>{{ L('Full list', '列表・介紹') }}</small></button>
      <button type="button" class="brick white" @click="nextView">{{ L('View', '視角') }}<small>{{ VIEWS[view] }}</small></button>
      <button type="button" class="brick white" @click="sheet = 'settings'">{{ L('Settings', '設定') }}<small>{{ L('Walls, roof, night', '牆・屋頂・夜景') }}</small></button>
      <button type="button" class="brick red" @click="setMode('ar')">AR<small>{{ L('On your table', '放在桌上') }}</small></button>
    </footer>

    <!-- 房間 -->
    <BottomSheet :open="sheet === 'rooms'" :label="L('Rooms', '房間')" @close="sheet = null">
      <template #head><h2>{{ L('Rooms', '房間') }}<small>{{ L('Tap to fly there', '點一下飛過去') }}</small></h2><CloseBtn @click="sheet = null" /></template>
      <main class="content">
        <ul class="rooms">
          <li v-for="rm in roomsT" :key="rm.id" :class="{ on: active === rm.id }" @click="select(rm.id); sheet = null">
            <span class="cty">{{ rm.county }}</span><b>{{ rm.name }}</b><small>{{ rm.why }}</small>
          </li>
        </ul>
      </main>
    </BottomSheet>

    <!-- 設定 -->
    <BottomSheet :open="sheet === 'settings'" :label="L('Settings', '設定')" sheet-class="short" @close="sheet = null">
      <template #head><h2>{{ L('Settings', '設定') }}</h2><CloseBtn @click="sheet = null" /></template>
      <main class="content opts">
        <div class="opt"><span>{{ L('View', '視角') }}</span><div class="chips"><button v-for="(v, k) in VIEWS" :key="k" type="button" :class="{ on: view === k }" @click="setView(k)">{{ v }}</button></div></div>
        <div class="opt"><span>{{ L('Walls', '牆') }}</span><div class="chips"><button v-for="(v, k) in WALLS" :key="k" type="button" :class="{ on: walls === k }" @click="walls = k">{{ v }}</button></div></div>
        <div class="opt"><span>{{ L('Roof', '屋頂') }}</span><div class="chips"><button v-for="(v, k) in AUTO" :key="k" type="button" :class="{ on: roof === v[1] }" @click="roof = v[1]">{{ v[0] }}</button></div></div>
        <div class="opt"><span>{{ L('Outer walls', '外牆') }}</span><div class="chips"><button v-for="(v, k) in AUTO" :key="k" type="button" :class="{ on: outer === v[1] }" @click="outer = v[1]">{{ v[0] }}</button></div></div>
        <div class="opt"><span>{{ L('Show', '顯示') }}</span><div class="chips">
          <button type="button" :class="{ on: labels }" @click="labels = !labels">{{ L('Room names', '房名') }}</button>
          <button type="button" :class="{ on: night }" @click="night = !night">{{ L('Night', '夜景') }}</button>
          <button type="button" :class="{ on: court }" @click="court = !court">{{ court ? L('Skylight closed', '中庭天窗關') : L('Skylight open', '中庭天窗開') }}</button>
        </div></div>
        <div class="opt"><span>{{ L('Download', '下載') }}</span><div class="chips">
          <button type="button" @click="scene?.download('lego-taiwan.png')">PNG</button>
          <button type="button" @click="scene?.downloadLdr('lego-taiwan.ldr')">LDR</button>
        </div></div>
        <p class="hint">{{ L('Roof and outer walls on “Auto”: the roof fades as you zoom in, then the outer walls when you get very close. The LDR file opens in BrickLink Studio.', '屋頂、外牆「自動」：鏡頭拉近時屋頂先慢慢消失，拉得很近外牆也消失。LDR 可以用 BrickLink Studio 打開。') }}</p>
      </main>
    </BottomSheet>

    <!-- 資訊：零件表、說明 -->
    <BottomSheet :open="sheet === 'info'" :label="L('Info', '資訊')" @close="sheet = null">
      <template #head>
        <nav class="tabs" role="tablist"><button v-for="(v, k) in TABS" :key="k" type="button" role="tab" :class="{ on: tab === k }" @click="tab = k">{{ v }}</button></nav>
        <CloseBtn @click="sheet = null" />
      </template>
      <main class="content info">
        <template v-if="tab === 'parts'">
          <h3>{{ L('LEGO parts list', '樂高零件表') }}</h3>
          <table v-if="parts" class="parts"><tbody>
            <tr v-for="r in parts.list" :key="r.id"><td>{{ partName(r) }}<small>（{{ r.id }}）</small></td><td>{{ r.n.toLocaleString() }}</td></tr>
            <tr><td>{{ L('Minifigures', '小人') }}</td><td>5</td></tr>
            <tr><td><b>{{ L('Total', '合計') }}</b></td><td><b>{{ (parts.total + 5).toLocaleString() }}</b></td></tr>
          </tbody></table>
          <p v-else class="hint">{{ L('The parts list is counted once the house is built in the 3D view (switch to 3D first).', '零件表在 3D 頁蓋好房子之後才算得出來（先切到 3D）。') }}</p>
          <p class="hint">{{ L('Part numbers are LDraw / LEGO part IDs. Download the LDR file under Settings to open it in BrickLink Studio, price it and render it.', '零件編號是 LDraw／樂高的零件號。「設定」裡下載 LDR，可以用 BrickLink Studio 開，算價錢、做寫實渲染。') }}</p>
          <h3>{{ L('LEGO colours', '樂高標準色') }}<small>{{ L('everything snaps to the nearest one', '所有東西都換成最接近的一色') }}</small></h3>
          <div class="pal"><i v-for="c in LEGO_PAL" :key="c" :style="{ background: c }" :title="c"></i></div>
        </template>
        <template v-else-if="lang === 'en'">
          <h3>Taiwan is a house built of LEGO bricks</h3>
          <p>{{ rooms.length }} counties and cities, {{ rooms.length }} rooms. The rooms are laid out by each county's latitude and longitude, so the floor plan is a map of Taiwan, and every room holds what that county is known for.</p>
          <h3>How to play</h3>
          <ul>
            <li><b>3D</b>: drag with one finger to rotate, two fingers to pan and zoom (desktop: left-drag rotate, right-drag pan, scroll zoom). Tap a room, or pick one from the row of rooms, to fly there.</li>
            <li><b>AR</b>: on a phone, tap “View on your table (AR)” and point the camera at a table. The whole house (about 25 × 19 cm) sits on it, and you can walk around and lean in. Use Safari on iPhone, Chrome on Android.</li>
          </ul>
          <h3>How it is calculated</h3>
          <p class="formula">Studs = length ÷ 0.4 m<br>Wall height = 6 brick courses = 18 plates = 2.88 m</p>
          <ul>
            <li><b>LEGO</b>: 1 stud = 0.4 m, so a 1.7 m minifigure is about 4 studs tall. Everything is rebuilt from real LDraw parts (1×1 to 1×4 bricks, plates and tiles): walls are 1 stud thick in 6 staggered courses, windows are black frames with transparent bricks, floors are tiled and the whole plot sits on 32×32 green baseplates.</li>
            <li><b>Dimensions</b>: drawn like a real house plan (1 grid = 1 m): corridors 2 m wide, interior doors 1 m, furniture at normal sizes (a double bed is 1.6 × 2.1 m).</li>
            <li><b>AR model</b>: the real parts add up to about 4.9 million triangles, too heavy for phone AR, so the AR model is a shell of the brick grid with studs drawn as a texture and no gaps (on a table a stud is only 1 mm).</li>
          </ul>
          <h3>Sources</h3>
          <ul class="src">
            <li v-for="s in SOURCES" :key="s.url">{{ s.en }}: {{ s.org }}<br><a :href="s.url" target="_blank" rel="noopener">{{ s.url }}</a></li>
          </ul>
          <p class="hint">Room names on the AR model follow the language you pick. Furniture names on hover are in Chinese only.</p>
          <p class="hint">LEGO® is a trademark of the LEGO Group, which does not sponsor, authorise or endorse this page.</p>
          <p class="ver">Version v{{ VERSION }} · {{ BUILT }}</p>
        </template>
        <template v-else>
          <h3>台灣是一棟用樂高蓋的房子</h3>
          <p>{{ rooms.length }} 個縣市、{{ rooms.length }} 個房間：房間照縣市的經緯度排，平面圖就是台灣地圖，每間房都放那個縣市的特色。</p>
          <h3>怎麼玩</h3>
          <ul>
            <li><b>3D</b>：一指拖曳旋轉、兩指平移和縮放（電腦：左鍵旋轉、右鍵平移、滾輪縮放）；點房間、或在下面那一排房間選一間飛過去。</li>
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
            <li v-for="s in SOURCES" :key="s.url">{{ s.label }}：{{ s.org }}<br><a :href="s.url" target="_blank" rel="noopener">{{ s.url }}</a></li>
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
import RoomStrip from './components/RoomStrip.vue'
import { ROOMS, HALL } from './lego/layout.js'
import { LEGO_PAL } from './lego/looks.js'
import { SOURCES } from './lego/sources.js'
import { LOW } from './lib/device.js'
import { BRICK, PLATE_PART, TILE } from './lego/ldraw.js'
import { L, lang, setLang, roomText } from './i18n.js'

const VERSION = __APP_VERSION__, BUILT = __APP_BUILT__
const CloseBtn = () => h('button', { type: 'button', class: 'x', 'aria-label': L('Close', '關閉') }, [
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
const VIEWS = computed(() => ({ overview: L('Overview', '全景'), top: L('Top', '俯視'), north: L('North', '北部'), south: L('South', '南部') }))
const WALLS = computed(() => ({ full: L('Full', '全高'), cut: L('Cutaway', '切面'), low: L('Low', '矮牆') }))
const AUTO = computed(() => [[L('Auto', '自動'), 'auto'], [L('On', '開'), true], [L('Off', '關'), false]])
const TABS = computed(() => ({ about: L('About', '說明'), parts: L('Parts', '零件表') }))
// 零件名稱：中文在 ldraw.js 的 PART_NAME（Mansion3D 傳上來的 r.name），英文照零件號拼
const partName = (r) => { if (lang.value !== 'en') return r.name; for (const [list, n] of [[BRICK, 'Brick'], [PLATE_PART, 'Plate'], [TILE, 'Tile']]) { const i = list.indexOf(r.id); if (i >= 0) return `${n} 1×${i + 1}` } return r.id === '3811' ? 'Baseplate 32×32' : r.id }
const view = ref('overview'), walls = ref('full'), labels = ref(true), roof = ref('auto'), outer = ref('auto'), court = ref(false), night = ref(false)
const hover = ref(null), active = ref(null), parts = ref(null), scene = ref(null)
const sheet = ref(null), tab = ref('about')

const rooms = ROOMS
const byId = Object.fromEntries(rooms.map((r) => [r.id, r]))
byId[HALL] = { id: HALL, county: '走廊', name: '紅地毯走廊', why: '北邊東西向、中間南北向（中央山脈），中庭四周是玻璃迴廊' }
// 現在這個語言的房間（列表、卡片用）
const roomsT = computed(() => rooms.map((r) => ({ id: r.id, ...roomText(r) })))
const tip = computed(() => { const r = byId[active.value ?? hover.value]; return r ? roomText(r) : null })
const select = (id) => (active.value = active.value === id ? null : id)
function step(d) { const i = rooms.findIndex((r) => r.id === active.value); active.value = rooms[(i + d + rooms.length) % rooms.length].id }
// 操作提示：房子蓋好後顯示，動一下畫面或 6 秒後消失（每次開網頁只出現一次）
const tipOn = ref(false)
let tipShown = false
function onReady() { ready.value = true; if (!tipShown) { tipShown = tipOn.value = true; setTimeout(() => (tipOn.value = false), 6000) } }
function setView(k) { view.value = k; active.value = null }
function nextView() { const ks = Object.keys(VIEWS.value); setView(ks[(ks.indexOf(view.value) + 1) % ks.length]) }

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
