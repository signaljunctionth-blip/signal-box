// เซฟเกม: ทุกส่วนของเกมอ่าน/เขียนความคืบหน้าผ่านโมดูลนี้ที่เดียว
// - ที่เก็บ (backend) สลับได้: localStorage บนเว็บ, หน่วยความจำในเทสต์, ที่เก็บของแอปเมื่อห่อเป็นแอป
// - ทุกการแตะที่เก็บห่อ try/catch: เก็บไม่ได้เกมก็ยังเล่นได้ (ความคืบหน้าอยู่แค่ในหน่วยความจำ)
// - มีเลขเวอร์ชัน + ตัวแปลงเซฟเก่า และรหัสสำรองเกมแบบ base64
export const SAVE_VERSION = 2; // 2 = เพิ่ม best: ดาวและคะแนนที่ดีที่สุดต่อ id ภารกิจ (ชุดด่านที่มี id คงที่)
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
  1: d => ({ ...d, v: 2 }), // v1 -> v2: โครงเดิมใช้ต่อได้ best เริ่มว่าง (เติมตอนอ่าน)
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
    const best = {}, src = d.packs[id] && d.packs[id].best;
    if (src && typeof src === 'object' && !Array.isArray(src)) for (const k in src) {
      const b = src[k]; if (!b || typeof b !== 'object') continue;
      best[k] = { stars: Number.isInteger(b.stars) && b.stars > 0 ? Math.min(3, b.stars) : 0, score: Number.isFinite(b.score) && b.score > 0 ? Math.round(b.score) : 0 };
    }
    out.packs[id] = { stars: Array.isArray(stars) ? Array.from(stars, n => (Number.isInteger(n) && n > 0 ? Math.min(3, n) : 0)) : [], best };
  }
  // ธงเล็ก ๆ (เช่น เคยดูกล้องเลื่อนเข้าเส้นทางสอนแล้ว): เก็บเฉพาะค่า true/false ตัวเลข ข้อความสั้น; ไม่มีธง = ไม่เขียน key นี้ลงเซฟ
  if (d.flags && typeof d.flags === 'object' && !Array.isArray(d.flags)) for (const k in d.flags) if (flagOk(d.flags[k])) (out.flags ||= {})[k] = d.flags[k];
  // r = จำนวนครั้งที่ล้างหรือแทนที่เซฟทั้งก้อน (reset / นำเข้ารหัส) ใช้ตัดสินตอนรวมเซฟจากหลายแท็บ; 0 = ไม่เขียน key นี้
  if (Number.isInteger(d.r) && d.r > 0) out.r = d.r;
  return out;
}
const flagOk = v => typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v)) || (typeof v === 'string' && v.length <= 200);

// รวมเซฟ disk (ค่าล่าสุดในที่เก็บ อาจเขียนโดยแท็บอื่น) เข้ากับ mem (ของแท็บนี้) แก้ mem ตรง ๆ
// - ดาวและคะแนนที่ดีที่สุด: เอาค่ามากกว่า  - ธง: รวมกัน ถ้าชื่อซ้ำใช้ของแท็บนี้
// - ถ้าอีกฝั่งถูกล้าง/แทนที่ทั้งก้อนมาใหม่กว่า (r มากกว่า) ใช้ของฝั่งนั้นทั้งหมด ไม่รวม
// ลำดับ key ยึดของ mem ก่อน: เล่นแท็บเดียว (disk ไม่มีอะไรเกิน mem) ผลที่เขียนออกจึงเหมือนเดิมทุกตัวอักษร
function mergeInto(mem, disk) {
  const a = mem.r || 0, b = disk.r || 0;
  if (b > a) return disk;
  if (a > b) return mem;
  for (const id in disk.packs) {
    const from = disk.packs[id], to = (mem.packs[id] ||= { stars: [], best: {} });
    from.stars.forEach((n, i) => { if (n > (to.stars[i] || 0)) to.stars[i] = n; });
    for (const k in from.best) {
      const x = from.best[k], y = to.best[k];
      if (!y) to.best[k] = { ...x };
      else { if (x.stars > y.stars) y.stars = x.stars; if (x.score > y.score) y.score = x.score; }
    }
  }
  if (disk.flags) for (const k in disk.flags) if (!mem.flags || !Object.hasOwn(mem.flags, k)) (mem.flags ||= {})[k] = disk.flags[k];
  return mem;
}

const toB64 = text => { let s = ''; for (const b of new TextEncoder().encode(text)) s += String.fromCharCode(b); return btoa(s); };
const fromB64 = code => new TextDecoder().decode(Uint8Array.from(atob(code), c => c.charCodeAt(0)));

export function createSave(backend = localBackend()) {
  let data;
  const load = () => { try { data = migrate(JSON.parse(backend.read() || 'null')); } catch { data = blank(); } };
  const store = () => { try { return backend.write(JSON.stringify(data)) === true; } catch { return false; } };
  // เรียกก่อนแก้ทุกครั้ง: อ่านค่าล่าสุดจากที่เก็บมารวมก่อน แท็บอื่นที่เขียนไว้ระหว่างนี้จะไม่ถูกเขียนทับหาย
  const sync = () => { try { const text = backend.read(); if (text) data = mergeInto(data, migrate(JSON.parse(text))); } catch { /* อ่านไม่ได้ = ไม่มีอะไรให้รวม */ } };
  const pack = id => (data.packs[id] ||= { stars: [], best: {} });
  // ล้างหรือแทนที่ทั้งก้อน: นับ r เพิ่ม เพื่อให้แท็บอื่นที่ยังถือเซฟเก่าไม่รวมของเก่ากลับเข้ามา
  const replaceAll = next => { sync(); next.r = (data.r || 0) + 1; data = next; return store(); };
  load();
  return {
    // ดาวที่ดีที่สุดของด่าน i ในชุด packId (0 = ยังไม่ผ่าน)
    getStars: (packId, i) => (data.packs[packId] && data.packs[packId].stars[i]) || 0,
    // บันทึกดาว (เก็บค่าที่ดีที่สุด) คืน true ถ้าเขียนลงที่เก็บสำเร็จ
    setStars(packId, i, n) { sync(); const s = pack(packId).stars; s[i] = Math.max(s[i] || 0, n); return store(); },
    hasProgress: packId => !!data.packs[packId] && (data.packs[packId].stars.some(n => n > 0) || Object.values(data.packs[packId].best).some(b => b.stars > 0)),
    // ชุดภารกิจที่ด่านมี id คงที่ (key = levelKey(lv) จาก sim): เก็บดาวและคะแนนที่ดีที่สุดแยกกัน ไม่ผูกกับลำดับในอาร์เรย์
    getBest(packId, key) { const b = data.packs[packId] && data.packs[packId].best[key]; return b ? { ...b } : { stars: 0, score: 0 }; },
    setBest(packId, key, { stars = 0, score = 0 } = {}) {
      sync();
      const all = pack(packId).best, b = all[key] || { stars: 0, score: 0 };
      all[key] = { stars: Math.max(b.stars, Math.min(3, Math.max(0, stars | 0))), score: Math.max(b.score, Math.max(0, Math.round(score) || 0)) };
      return store();
    },
    totalStars(packId) { const p = data.packs[packId]; return p ? p.stars.reduce((a, n) => a + (n || 0), 0) + Object.values(p.best).reduce((a, b) => a + b.stars, 0) : 0; },
    // ธง: getFlag(name, ค่าเริ่มต้น) / setFlag(name, value) value เป็น true/false ตัวเลข หรือข้อความสั้น; null หรือ undefined = ลบธง
    // (เพิ่มแบบไม่ขึ้นเวอร์ชันเซฟ: เซฟ v2 ที่ไม่มี flags อ่านได้เหมือนเดิม)
    getFlag: (name, fallback = false) => (data.flags && Object.hasOwn(data.flags, name) ? data.flags[name] : fallback),
    setFlag(name, value) {
      if (typeof name !== 'string' || !name) return false;
      if (value !== null && value !== undefined && !flagOk(value)) return false;
      sync();
      if (value === null || value === undefined) { if (data.flags) { delete data.flags[name]; if (!Object.keys(data.flags).length) delete data.flags; } return store(); }
      (data.flags ||= {})[name] = value; return store();
    },
    data: () => JSON.parse(JSON.stringify(data)),
    // ล้างทั้งหมด (รวมของแท็บอื่น): หลังจากนี้แท็บอื่นจะเห็นเซฟเปล่าเมื่อเขียนหรือ reload ครั้งถัดไป
    reset() { return replaceAll(blank()); },
    reload: load,
    // รหัสสำรองเกม: ผู้เล่นคัดลอกไปวางอีกเครื่องได้
    exportCode: () => CODE_PREFIX + toB64(JSON.stringify(data)),
    // คืน true ถ้ารหัสอ่านได้และนำเข้าแล้ว รหัสเสียไม่แตะเซฟเดิม
    importCode(code) {
      try {
        if (typeof code !== 'string' || !code.trim().startsWith(CODE_PREFIX)) return false;
        const d = JSON.parse(fromB64(code.trim().slice(CODE_PREFIX.length)));
        if (d === null || typeof d !== 'object' || !Number.isInteger(d.v) || d.v > SAVE_VERSION) return false;
        replaceAll(migrate(d)); return true;
      } catch { return false; }
    },
  };
}
