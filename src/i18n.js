// 中／英文：lang 是現在的語言；L(英文, 中文) 回傳現在這個語言的字（放在 template 或 computed 裡，切換語言會自己更新）
//   一開始：網址 ?lang=en｜zh → 上次選的（localStorage）→ 瀏覽器語言（中文以外都給英文）
import { ref, watchEffect } from 'vue'
import { ROOMS_EN, WHO_EN } from './lego/rooms.en.js'

const pick = () => {
  const q = new URLSearchParams(location.search).get('lang')
  if (q === 'en' || q === 'zh') return q
  try { const s = localStorage.getItem('lang'); if (s === 'en' || s === 'zh') return s } catch { /* 無痕模式 */ }
  return /^zh/i.test(navigator.language ?? '') ? 'zh' : 'en'
}
export const lang = ref(pick())
export const L = (en, zh) => (lang.value === 'en' ? en : zh)
export function setLang(l) {
  lang.value = l
  try { localStorage.setItem('lang', l) } catch { /* 存不了就算了 */ }
}
watchEffect(() => {
  document.documentElement.lang = lang.value === 'en' ? 'en' : 'zh-Hant-TW'
  document.title = L('LEGO Taiwan', '樂高台灣 LEGO Taiwan')
})

// 房間（layout.js 的 { id, county, name, why }，或走廊）→ 現在這個語言的 { county, name, why }
export function roomText(rm) {
  const en = lang.value === 'en' && ROOMS_EN[rm.id]
  return en ? { county: en[0], name: en[1], why: en[2] } : { county: rm.county, name: rm.name, why: rm.why }
}
export const whoText = (who) => (lang.value === 'en' ? WHO_EN[who] ?? who : who)
