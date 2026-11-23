# 樂高台灣 LEGO Taiwan

網頁：https://szfftz.github.io/logo-taiwan/（`npm run deploy` 之後才有）

從 K30DayMapChallenge 2026 Day 27（New tool／Home Sweet Taiwan?）搬出來的手機版，做法同 birth-lottery：台灣是一棟用樂高蓋出來的豪宅，每個縣市一個房間，照經緯度排，平面圖就是台灣地圖。

- RWD：手機直式是從下面拉上來的面板；寬螢幕（≥ 900px）和手機橫式改成右邊的側欄；小手機（≤ 360px）按鈕縮一點；左右瀏海讓出安全區
- 3D 房名標籤不重疊：照優先順序（選到的房間 → 離鏡頭近的）放，疊到的淡出，拉近就會出現
- 房間列表（「房間」按鈕，3D、AR 都有）：點一間就拉近過去，卡片上有上一間／下一間；AR 的「全景」拉回來
- 中／英文（右上角切換；`?lang=en`｜`zh`；預設照瀏覽器語言）：介面、房間名稱和介紹（`src/lego/rooms.en.js`）、3D 標籤、AR 模型的房名板（中、英文各一個 glb，`npm run export:ar` 兩個都匯，`npm run export:ar en` 只匯英文）。滑鼠移到家具上的名稱只有中文
- 手機優先：舞台佔滿整個畫面，上面只有標題（按了是說明）和語言切換；下面一排積木按鈕（3D：房間、視角、設定、AR；AR：房間、全景、3D、在桌上看）；房間、設定、資訊（說明、零件表）是從下面拉上來的面板
- **3D**：每個東西都換成 LDraw 的真實零件（1 個凸點 ＝ 0.4 m）；點房間飛過去；牆（全高／切面／矮牆）、屋頂與外牆（自動／開／關）、房名、夜景、中庭天窗；下載 PNG、LDR（BrickLink Studio 可開）
- **AR**（網址 `#ar`）：Google model-viewer，按「在你的桌上看（AR）」把整棟房子（約 25 × 19 公分）放在桌上；屋頂、外牆、房名可以開關。iPhone 用 Safari（usdz 由 model-viewer 按下去時現做）、Android 用 Chrome。電腦上會顯示 QR code 給手機掃。AR 要 https，請用部署後的網址試
- Vue 3 + Vite + three.js

```bash
npm install
npm run serve      # 開發（http://localhost:8086，同一個 Wi-Fi 的手機開終端機印出的 Network 網址）
npm run build      # 建置到 dist/
npm run deploy     # 建置並推到 gh-pages → https://szfftz.github.io/logo-taiwan/
npm run export:ar  # 重新匯出 AR 模型（先開 npm run serve；要 Chrome）
npm run fetch:ldraw  # 重新抓 LDraw 零件 → src/lego/data/lego-parts.mpd
```

程式：

- `src/lego/`：Day 27 搬來的樂高場景：`Mansion3D.vue`（3D）、`layout.js`／`plan.js`（格局、牆門窗）、`furniture.js`（家具）、`brickify.js`（體素化成磚）、`ldraw.js`（LDraw 零件）、`looks.js`（顏色）
- `src/lego/data/ar/mansion-lego.glb`：AR 模型（`scripts/export_ar.mjs` 匯出；材質名字 `roof`、`wall`、`label` 給網頁開關）
- `src/dev/`：匯出 AR 模型用的（`arLego.js` 格子外殼＋凸點貼圖、`arLabels.js` 房名板、`arExport.js`），只在開發時由 `export_ar.mjs` 載入
- `src/components/ArView.vue`、`BottomSheet.vue`，`src/App.vue`（外殼）

資料來源：LDraw 官方零件庫（CC BY 4.0）、Natural Earth。LEGO® 是 LEGO Group 的商標，這個專案跟 LEGO Group 無關。
