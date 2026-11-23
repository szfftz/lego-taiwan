<template>
  <!-- 從下面拉上來的面板（資訊、地圖、彩球盒共用）：點外面、按 ✕、拉著上面那條往下拖超過 80px 都會收起來
       head 插槽放標題列（抓手下面那一排），預設插槽放內容 -->
  <Transition name="fade"><div v-if="open" class="scrim" :class="scrimClass" @click="emit('close')"></div></Transition>
  <Transition name="sheet">
    <aside v-if="open" class="sheet" :class="sheetClass" role="dialog" :aria-label="label" :style="dragY ? { transform: `translateY(${dragY}px)`, transition: 'none' } : null">
      <div class="sheet-head" @pointerdown="start" @pointermove="move" @pointerup="end" @pointercancel="end">
        <i class="grip"></i>
        <div class="sh-row"><slot name="head" /></div>
      </div>
      <slot />
    </aside>
  </Transition>
</template>

<script setup>
import { ref } from 'vue'

defineProps({
  open: { type: Boolean, default: false },
  label: { type: String, default: '' },
  sheetClass: { type: String, default: '' },
  scrimClass: { type: String, default: '' },
})
const emit = defineEmits(['close'])

// 往下拖：拖的距離跟著手指；放開時超過 80px 就收起來（按到按鈕不算拖）
const CLOSE_AT = 80
const SIDE = matchMedia('(min-width: 900px), (orientation: landscape) and (max-height: 520px)')
const dragY = ref(0)
let y0 = null
function start(e) {
  if (e.target.closest('button') || SIDE.matches) return // 側欄（寬螢幕、手機橫式，見 style.css 的 RWD）不用往下拖
  y0 = e.clientY
  e.currentTarget.setPointerCapture(e.pointerId)
}
function move(e) { if (y0 != null) dragY.value = Math.max(0, e.clientY - y0) }
function end() {
  if (y0 == null) return
  if (dragY.value > CLOSE_AT) emit('close')
  y0 = null
  dragY.value = 0
}
</script>
