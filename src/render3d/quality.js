// ระดับคุณภาพของฉาก 3 มิติ (docs/ART-3D.md ข้อ 5) และตัวคุมเฟรมเรต — ฟังก์ชันล้วน ทดสอบใน Node ได้
export const TIERS = [
  { id: 'high', name: 'สูง', ratio: 2, shadow: 2048, shadowEvery: 1, tufts: 1600, near: 170, far: 190, bushes: 70, fasteners: true, mask: 512 },
  { id: 'mid', name: 'กลาง', ratio: 1.5, shadow: 1024, shadowEvery: 2, tufts: 700, near: 110, far: 110, bushes: 45, fasteners: false, mask: 384 },
  { id: 'low', name: 'ประหยัด', ratio: 1, shadow: 0, shadowEvery: 0, tufts: 0, near: 60, far: 50, bushes: 20, fasteners: false, mask: 256 },
];
export const tierOf = id => TIERS.find(t => t.id === id) || TIERS[1];
const KEY = 'sj.view3d';

// เริ่มที่กลางบนจอสัมผัส สูงบนจอกว้างที่ใช้เมาส์ ผู้เล่นเลือกเองแล้วใช้ค่านั้น
export function initialTier({ coarse, w, saved }) {
  if (saved && TIERS.some(t => t.id === saved)) return saved;
  return !coarse && w >= 1000 ? 'high' : 'mid';
}

// วัดเวลาเฟรมเฉลี่ยทุก 2 วินาที ถ้าเกิน 33 มิลลิวินาทีให้ลดหนึ่งระดับ (ไม่ปรับขึ้นเองเพื่อไม่ให้ภาพกระพริบ)
// frame(dt) คืน id ระดับใหม่, 'too-slow' เมื่อระดับประหยัดยังช้า (ครั้งเดียว), หรือ null
export function createGovernor(start, { budget = 1 / 30 + 0.003, window = 2 } = {}) {
  let i = TIERS.findIndex(t => t.id === start), sum = 0, n = 0, warned = false;
  if (i < 0) i = 1;
  return {
    get tier() { return TIERS[i].id; },
    set tier(id) { const k = TIERS.findIndex(t => t.id === id); if (k >= 0) { i = k; sum = 0; n = 0; } },
    reset() { sum = 0; n = 0; },
    frame(dt) {
      if (!(dt > 0) || dt > 0.5) return null;         // แท็บถูกพักหรือเฟรมแรก ไม่นับ
      sum += dt; n++;
      if (sum < window) return null;
      const avg = sum / n; sum = 0; n = 0;
      if (avg <= budget) return null;
      if (i < TIERS.length - 1) { i++; return TIERS[i].id; }
      if (!warned) { warned = true; return 'too-slow'; }
      return null;
    },
  };
}

// ค่าที่ผู้เล่นเลือก ({ on: เปิด 3 มิติไหม, tier }) ห่อ try/catch ทุกครั้ง
// อ่าน globalThis.localStorage ภายใน try เพราะเบราว์เซอร์ที่บล็อกที่เก็บข้อมูลจะ throw ตั้งแต่ตอนอ่านตัวแปรนี้
export function readPref(store) {
  try { const v = JSON.parse((store || globalThis.localStorage).getItem(KEY)); return v && typeof v === 'object' ? v : null; } catch { return null; }
}
export function writePref(store, v) {
  try { (store || globalThis.localStorage).setItem(KEY, JSON.stringify(v)); return true; } catch { return false; }
}
