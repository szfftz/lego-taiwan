// 手機、平板（觸控螢幕）：3D 畫面用比較省的設定（解析度、影子），畫面才不會卡
export const LOW = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
