// AR 模型的房名標籤（開發用；export_ar.mjs 在頁面裡呼叫）：做成模型裡的 3D 板子，AR 裡（包括 iPhone Quick Look）也看得到
//   樣式跟網頁 3D 頁的標籤一樣：白底 90%、綠框 #3ddc5a、房名 #1d3b4f、縣市 #5b6b75
//   板子立在每間房的標籤位置（牆頂上方），面向 AR 頁一開始的鏡頭方向（model-viewer camera-orbit 30deg 55deg），雙面
//   每塊板子 userData.arTag = 'label'：匯出時材質名字叫 label，網頁照「房名」開關調透明度
import * as THREE from 'three'

const H = 3.6 // 板子高（場景公尺；縮到桌上約 9 mm）
const PX = 64 // 每公尺幾 px（貼圖）
const FONT = '"Noto Sans CJK TC", "Noto Sans TC", "PingFang TC", sans-serif'

export function arLabelGroup(scene, labelGroup) {
  const group = new THREE.Group()
  group.name = 'ar-labels'
  for (const o of labelGroup.children) {
    if (!o.userData.id) continue
    const name = o.element.querySelector('b')?.textContent ?? '', county = o.element.querySelector('span')?.textContent ?? ''
    const c = document.createElement('canvas'), g = c.getContext('2d')
    const hp = H * PX, f1 = hp * 0.42, f2 = hp * 0.26
    g.font = `700 ${f1}px ${FONT}`
    const w1 = g.measureText(name).width
    g.font = `400 ${f2}px ${FONT}`
    const wp = Math.ceil(Math.max(w1, g.measureText(county).width) + hp * 0.5)
    c.width = wp; c.height = Math.ceil(hp)
    const bw = hp * 0.06, r = hp * 0.28
    g.beginPath(); g.roundRect(bw / 2, bw / 2, wp - bw, hp - bw, r)
    g.fillStyle = 'rgba(255, 255, 255, 0.92)'; g.fill()
    g.lineWidth = bw; g.strokeStyle = '#3ddc5a'; g.stroke()
    g.textAlign = 'center'; g.textBaseline = 'middle'
    g.fillStyle = '#1d3b4f'; g.font = `700 ${f1}px ${FONT}`; g.fillText(name, wp / 2, hp * 0.4)
    g.fillStyle = '#5b6b75'; g.font = `400 ${f2}px ${FONT}`; g.fillText(county, wp / 2, hp * 0.75)
    const tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.SRGBColorSpace
    const m = new THREE.Mesh(new THREE.PlaneGeometry(wp / PX, H), new THREE.MeshStandardMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, roughness: 1 }))
    const p = o.getWorldPosition(new THREE.Vector3())
    m.position.set(p.x, p.y + H / 2, p.z)
    m.rotation.set(-THREE.MathUtils.degToRad(35), THREE.MathUtils.degToRad(30), 0, 'YXZ') // 面向一開始的鏡頭：方位 30°、仰角 35°
    m.userData.arTag = 'label'
    group.add(m)
  }
  scene.add(group)
  return group
}
