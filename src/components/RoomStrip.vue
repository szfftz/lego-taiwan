<template>
  <!-- 所有房間排成一排（可以左右滑）：點一間就拉近過去，再點一次或點「全景」回來；3D、AR 共用。選到的那一間會自己捲到看得到的地方 -->
  <nav ref="el" class="strip" aria-label="所有房間">
    <button type="button" class="all" :class="{ on: !active }" @click="emit('select', null)">全景</button>
    <button v-for="rm in rooms" :key="rm.id" type="button" :data-id="rm.id" :class="{ on: active === rm.id }" :aria-pressed="active === rm.id" @click="emit('select', active === rm.id ? null : rm.id)">
      <b>{{ rm.name }}</b><small>{{ rm.county }}</small>
    </button>
  </nav>
</template>

<script setup>
import { nextTick, ref, watch } from 'vue'
const props = defineProps({ rooms: { type: Array, required: true }, active: { type: String, default: null } })
const emit = defineEmits(['select'])
const el = ref(null)
watch(() => props.active, async (id) => {
  await nextTick()
  const b = id ? el.value?.querySelector(`[data-id="${id}"]`) : el.value?.firstElementChild
  b?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
})
</script>
