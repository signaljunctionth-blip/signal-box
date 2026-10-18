// เวทีแนวนอนเดียวทุกจอ: ถือเครื่องแนวตั้งเมื่อไร หมุนทั้งเวที 90° ด้วย transform ชั้นเดียวที่ราก
// ทุกหน้าจอวางของในพิกัดเวที (กว้าง w สูง h, w >= h เสมอ) และแปลงจุดแตะด้วย toStage() ที่เดียว
// ส่วนคำนวณ (stageLayout, clientToStage, stageToClient) เป็นฟังก์ชันล้วน ทดสอบใน Node ได้

// vw, vh = ขนาดหน้าต่างจริง คืนขนาดเวทีและบอกว่าต้องหมุนไหม
// หมุนเมื่อจอสูงกว่ากว้าง และเป็นจอสัมผัส (coarse) หรือกว้างไม่เกิน 600 px เท่านั้น หน้าต่างคอมที่ย่อแคบจึงไม่ตะแคง
export const ROTATE_MAX_W = 600;
export function stageLayout(vw, vh, coarse = true) {
  const rotated = vh > vw && (coarse || vw <= ROTATE_MAX_W);
  return rotated ? { rotated, w: vh, h: vw, vw, vh } : { rotated, w: vw, h: vh, vw, vh };
}
// เวทีหมุนตามเข็ม 90° รอบมุมซ้ายบน แล้วเลื่อนไปขวาเท่าความกว้างจอ: จุดเวที (x, y) อยู่ที่จอ (vw - y, x)
export function clientToStage(layout, cx, cy) {
  return layout.rotated ? { x: cy, y: layout.vw - cx } : { x: cx, y: cy };
}
export function stageToClient(layout, x, y) {
  return layout.rotated ? { x: layout.vw - y, y: x } : { x, y };
}

export function createStage(el, win = window) {
  const coarse = win.matchMedia ? win.matchMedia('(pointer: coarse)') : { matches: true };
  let layout = stageLayout(win.innerWidth, win.innerHeight, coarse.matches);
  const subs = new Set();
  const apply = () => {
    layout = stageLayout(win.innerWidth, win.innerHeight, coarse.matches);
    el.style.width = layout.w + 'px';
    el.style.height = layout.h + 'px';
    el.style.transform = layout.rotated ? `translateX(${layout.vw}px) rotate(90deg)` : '';
    el.classList.toggle('rot', layout.rotated);
    // ขอบปลอดภัยและขนาดเวทีส่งให้ CSS ผ่านตัวแปร (ค่า env() สลับด้านใน style.css เมื่อมี .rot)
    el.style.setProperty('--stage-w', layout.w + 'px');
    el.style.setProperty('--stage-h', layout.h + 'px');
    // หน้าต่างอาจถูกเลื่อนเองเมื่อโฟกัสของที่อยู่นอกจอ: ดึงกลับเสมอ
    el.scrollTop = 0; el.scrollLeft = 0;
    for (const fn of subs) fn(layout);
  };
  apply();
  win.addEventListener('resize', apply);
  win.addEventListener('orientationchange', apply);
  if (coarse.addEventListener) coarse.addEventListener('change', apply);
  if (win.visualViewport) win.visualViewport.addEventListener('resize', apply);
  el.addEventListener('scroll', () => { el.scrollTop = 0; el.scrollLeft = 0; });

  return {
    el,
    get layout() { return layout; },
    // จุดบนจอจริง (clientX, clientY ของ event) -> จุดในพิกัดเวที
    toStage: (cx, cy) => clientToStage(layout, cx, cy),
    toClient: (x, y) => stageToClient(layout, x, y),
    // ขอบของ element ในพิกัดเวที (ใช้แทน getBoundingClientRect ซึ่งคืนค่าหลังหมุน)
    rectOf(node) {
      const r = node.getBoundingClientRect();
      const a = clientToStage(layout, r.left, r.top), b = clientToStage(layout, r.right, r.bottom);
      const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
      return { x, y, w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
    },
    onResize(fn) { subs.add(fn); return () => subs.delete(fn); },
    refresh: apply,
  };
}

// เต็มจอ: พยายามล็อกแนวนอนด้วย ถูกปฏิเสธก็ไม่เป็นไร (เวทีหมุนเองอยู่แล้ว) คืน true ถ้าเข้าเต็มจอได้
export const canFullscreen = (doc = document) => !!(doc.fullscreenEnabled && doc.documentElement.requestFullscreen);
export async function toggleFullscreen(doc = document) {
  try {
    if (doc.fullscreenElement) { await doc.exitFullscreen(); return false; }
    await doc.documentElement.requestFullscreen({ navigationUI: 'hide' });
  } catch { return false; }
  try { await globalThis.screen.orientation.lock('landscape'); } catch { /* เบราว์เซอร์ไม่ยอมล็อก ใช้การหมุนเวทีแทน */ }
  return true;
}
