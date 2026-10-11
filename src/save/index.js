// เซฟเกม: ทุกส่วนของเกมอ่าน/เขียนความคืบหน้าผ่านโมดูลนี้ที่เดียว
// - ที่เก็บ (backend) สลับได้: localStorage บนเว็บ, หน่วยความจำในเทสต์, ที่เก็บของแอปเมื่อห่อเป็นแอป
// - ทุกการแตะที่เก็บห่อ try/catch: เก็บไม่ได้เกมก็ยังเล่นได้ (ความคืบหน้าอยู่แค่ในหน่วยความจำ)
// - มีเลขเวอร์ชัน + ตัวแปลงเซฟเก่า และรหัสสำรองเกมแบบ base64
export const SAVE_VERSION = 1;
export const SAVE_KEY = 'sj-signalbox-save'; // คนละ key กับต้นแบบ v2 ('sj-signalbox-v2') ไม่ชนกัน
const CODE_PREFIX = 'SJ1.';

// backend = { read(): string|null, write(text): boolean } ต้องไม่ throw
export function localBackend(key = SAVE_KEY) {
  return {
    read() { try { return globalThis.localStorage.getItem(key); } catch { return null; } },
    write(text) { try { globalThis.localStorage.setItem(key, text); return true; } catch { return false; } },
  };
}
export function memoryBackend(initial = null) {
  let text = initial;
  return { read: () => text, write: t => { text = t; return true; } };
}

const blank = () => ({ v: SAVE_VERSION, packs: {} });
// ตัวแปลงเซฟเก่า: MIGRATE[n] แปลงรูปแบบเวอร์ชัน n เป็น n + 1
const MIGRATE = {
  0: d => ({ v: 1, packs: { history: { stars: Array.isArray(d.stars) ? d.stars : [] } } }), // รูปแบบของต้นแบบ v2: { stars: [] }
};
// รับข้อมูลอะไรก็ได้ คืนเซฟรูปแบบปัจจุบันเสมอ (ข้อมูลเสีย = เซฟเปล่า)
export function migrate(d) {
  if (d === null || typeof d !== 'object' || Array.isArray(d)) return blank();
  let v = Number.isInteger(d.v) ? d.v : 0;
  if (v > SAVE_VERSION) return blank(); // เซฟจากเกมรุ่นใหม่กว่า อ่านไม่ได้
  while (v < SAVE_VERSION) { d = MIGRATE[v](d); v = d.v; }
  const out = blank();
  if (d.packs && typeof d.packs === 'object') for (const id in d.packs) {
    const stars = d.packs[id] && d.packs[id].stars;
    out.packs[id] = { stars: Array.isArray(stars) ? Array.from(stars, n => (Number.isInteger(n) && n > 0 ? Math.min(3, n) : 0)) : [] };
  }
  return out;
}

const toB64 = text => { let s = ''; for (const b of new TextEncoder().encode(text)) s += String.fromCharCode(b); return btoa(s); };
const fromB64 = code => new TextDecoder().decode(Uint8Array.from(atob(code), c => c.charCodeAt(0)));

export function createSave(backend = localBackend()) {
  let data;
  const load = () => { try { data = migrate(JSON.parse(backend.read() || 'null')); } catch { data = blank(); } };
  const store = () => { try { return backend.write(JSON.stringify(data)) === true; } catch { return false; } };
  const pack = id => (data.packs[id] ||= { stars: [] });
  load();
  return {
    // ดาวที่ดีที่สุดของด่าน i ในชุด packId (0 = ยังไม่ผ่าน)
    getStars: (packId, i) => (data.packs[packId] && data.packs[packId].stars[i]) || 0,
    // บันทึกดาว (เก็บค่าที่ดีที่สุด) คืน true ถ้าเขียนลงที่เก็บสำเร็จ
    setStars(packId, i, n) { const s = pack(packId).stars; s[i] = Math.max(s[i] || 0, n); return store(); },
    hasProgress: packId => !!data.packs[packId] && data.packs[packId].stars.some(n => n > 0),
    data: () => JSON.parse(JSON.stringify(data)),
    reset() { data = blank(); return store(); },
    reload: load,
    // รหัสสำรองเกม: ผู้เล่นคัดลอกไปวางอีกเครื่องได้
    exportCode: () => CODE_PREFIX + toB64(JSON.stringify(data)),
    // คืน true ถ้ารหัสอ่านได้และนำเข้าแล้ว รหัสเสียไม่แตะเซฟเดิม
    importCode(code) {
      try {
        if (typeof code !== 'string' || !code.trim().startsWith(CODE_PREFIX)) return false;
        const d = JSON.parse(fromB64(code.trim().slice(CODE_PREFIX.length)));
        if (d === null || typeof d !== 'object' || !Number.isInteger(d.v) || d.v > SAVE_VERSION) return false;
        data = migrate(d); store(); return true;
      } catch { return false; }
    },
  };
}
