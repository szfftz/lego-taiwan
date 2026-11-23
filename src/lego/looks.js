// 3D 模型的顏色：Mansion3D.vue 畫、index.vue 的圖例列出來，兩邊用同一份

// 每種房間（layout.js 的 kind）的地板材質：3D 照這個貼材質，2D 插畫平面圖照這個上色；沒列到的是木地板
export const FLOOR = { bath: 'tile', wc: 'tile', onsen: 'stone', kitchen: 'tile', pool: 'deck', garage: 'concrete', theater: 'carpetDark', studio: 'tile', gate: 'marble', court: 'grass',
  greenhouse: 'soil', pavilion: 'deck', tatami: 'tatami', sports: 'concrete', cellar: 'stone', gym: 'wood', museum: 'marble', game: 'carpetDark', living: 'herringbone', master: 'herringbone', dining: 'marble', family: 'wood', hall: 'hall' }

// 壁紙（模擬市民那樣每間房不同顏色）、下半截護牆板；key 是房間種類（layout.js 的 kind），沒列到的不貼
export const WALLPAPER = { control: '#cfd8dc', server: '#cfd8dc', living: '#f3e2c0', master: '#d6e0ee', gate: '#efe5cf', study: '#3f5d4c', guest: '#e2eed6', kids: '#ffdbe7', family: '#fde3bd', dining: '#f0d3cb',
  kitchen: '#f5f3ea', studio: '#dcecf5', onsen: '#e7dcc6', gym: '#dfe7ee', museum: '#efe8dc', game: '#1f2a44', theater: '#2c1e3d', tatami: '#efe2c4', garage: '#d9d9d6', bath: '#d8efec', wc: '#d8efec',
  cellar: '#a98f78', hall: '#f2e6cc' }
export const WAINSCOT = { living: '#6d4c41', master: '#8899b0', dining: '#5d4037', study: '#4e342e', gate: '#cbbfa6', family: '#8d6e63', hall: '#5d4037', guest: '#9fb39a', kids: '#ffffff' }

// 畫風的調色盤：樂高頁、當個創世神頁的每個顏色都換成這裡面最接近的一色
export const LEGO_PAL = ['#f4f4f4', '#a0a5a9', '#6c6e68', '#1b2a34', '#05131d', '#c91a09', '#720e0f', '#0055bf', '#5a93db', '#f2cd37', '#fe8a18', '#237841', '#4b9f4a', '#bbe90b',
  '#e4cd9e', '#958a73', '#582a12', '#a95500', '#ff698f', '#fecccf', '#c870a0', '#36aebf', '#aee9ef', '#73dca1', '#d67572', '#9ba19d', '#fcfcfc', '#d09168', '#aa7d55'] // 最後兩個：nougat、medium nougat（木頭、砂岩；沒有的話木平台會被換成粉紅）
export const MC_PAL = ['#e9ecec', '#8e8e86', '#3e4447', '#141519', '#a12722', '#35399d', '#3c44aa', '#f8c527', '#f07613', '#5e7c16', '#70b919', '#158991', '#3aafd9', '#792aac', '#ed8dac', '#724728',
  '#7d7d7d', '#5d9c3b', '#866043', '#a2834f', '#6b5132', '#dbd3a0', '#3f76e4', '#3e7a2b', '#c4b394', '#b0a891', '#f9fffe', '#a0a0a0']
