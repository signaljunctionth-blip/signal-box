// รหัสแชร์ผัง (GDD ข้อ 11): ข้อมูลผังทั้งหมดอยู่ในข้อความเอง ไม่มีเซิร์ฟเวอร์ ใส่ในลิงก์เป็น #share=<รหัส>
// รูปแบบ SJ1.<ขนาด>.<ราง>.<เสา>.<ทางจอด>.<ชื่อ>.<ตรวจสอบ> ทุกส่วนเป็นตัวอักษรที่ใช้ในลิงก์ได้ตรง ๆ
//   ขนาด = cols rows (ฐาน 36 ตัวละหลัก) + upDir, ราง = i j d (d: u ขึ้น / s ตรง / d ลง), เสา = i j E|W, ทางจอด = i j d no
//   ชื่อ = UTF-8 แบบ base64url, ตรวจสอบ = FNV-1a 32 บิตของทุกส่วนก่อนหน้า (รหัสที่ถูกแก้หรือคัดลอกขาดจะถูกปฏิเสธ)
// decodeShare ไม่ throw ไม่ว่าจะได้ข้อความอะไรมา ผังที่ถอดได้ต้องผ่าน buildPlan (editor.js) ก่อนเล่นเสมอ
import { normalizePlan, MAX_COLS, MAX_ROWS } from './editor.js';

const PREFIX = 'SJ1';
const MAX_LEN = 6000;
const D = { '-1': 'u', 0: 's', 1: 'd' }, UD = { u: -1, s: 0, d: 1 };
const b36 = n => n.toString(36);
const un36 = c => (/^[0-9a-z]$/.test(c) ? parseInt(c, 36) : NaN);

function fnv(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(36).padStart(7, '0');
}
function toB64url(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64url(s) {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
}

// plan -> รหัส (plan ต้องผ่าน normalizePlan ได้ ไม่งั้นคืน null)
export function encodePlan(input) {
  const { plan } = normalizePlan(input);
  if (!plan || plan.cols > MAX_COLS || plan.rows > MAX_ROWS) return null;
  const parts = [
    PREFIX,
    b36(plan.cols) + b36(plan.rows) + plan.upDir,
    plan.segs.map(([i, j, d]) => b36(i) + b36(j) + D[d]).join(''),
    plan.signals.map(([i, j, dir]) => b36(i) + b36(j) + dir).join(''),
    plan.plats.map(([i, j, d, no]) => b36(i) + b36(j) + D[d] + b36(no)).join(''),
    plan.name ? toB64url(plan.name) : '',
  ];
  const body = parts.join('.');
  return `${body}.${fnv(body)}`;
}

// ลิงก์สำหรับส่งเพื่อน base = ที่อยู่หน้าเกม (ไม่รวม #)
export const shareLink = (plan, base) => { const c = encodePlan(plan); return c ? `${String(base).split('#')[0]}#share=${c}` : null; };

// รับรหัสหรือทั้งลิงก์ (ผู้เล่นวางมาทั้งข้อความก็ได้) คืน { ok, plan, errors }
export function decodeShare(text) {
  try {
    if (typeof text !== 'string') return fail('ไม่ใช่ข้อความ');
    if (text.length > MAX_LEN * 2) return fail('ข้อความยาวเกินไป');
    const m = text.match(/SJ\d+\.[0-9A-Za-z._-]*/);
    if (!m) return fail('ไม่พบรหัสผังในข้อความ (รหัสขึ้นต้นด้วย SJ1.)');
    const code = m[0];
    if (code.length > MAX_LEN) return fail('รหัสยาวเกินไป');
    const parts = code.split('.');
    if (parts[0] !== PREFIX) return fail(`รหัสรุ่น ${parts[0]} ยังไม่รองรับ ลองอัปเดตเกม`);
    if (parts.length !== 7) return fail('รหัสไม่ครบ อาจคัดลอกมาไม่หมด');
    const body = parts.slice(0, 6).join('.');
    if (fnv(body) !== parts[6]) return fail('รหัสเสียหรือถูกแก้ (ตรวจสอบไม่ผ่าน) ขอรหัสใหม่จากเจ้าของผัง');
    const [, size, segs, sigs, plats, name] = parts;
    if (!/^[0-9a-z]{2}[EW]$/.test(size)) return fail('ส่วนขนาดผังผิดรูปแบบ');
    const chunk = (s, n, re) => { if (s.length % n || !re.test(s)) return null; const out = []; for (let i = 0; i < s.length; i += n) out.push(s.slice(i, i + n)); return out; };
    const S = chunk(segs, 3, /^([0-9a-z]{2}[usd])*$/), G = chunk(sigs, 3, /^([0-9a-z]{2}[EW])*$/), Q = chunk(plats, 4, /^([0-9a-z]{2}[usd][0-9a-z])*$/);
    if (!S || !G || !Q) return fail('ส่วนรางหรือเสาผิดรูปแบบ');
    const raw = {
      v: 1, cols: un36(size[0]), rows: un36(size[1]), upDir: size[2], name: name ? fromB64url(name) : '',
      segs: S.map(c => [un36(c[0]), un36(c[1]), UD[c[2]]]),
      signals: G.map(c => [un36(c[0]), un36(c[1]), c[2]]),
      plats: Q.map(c => [un36(c[0]), un36(c[1]), UD[c[2]], un36(c[3])]),
    };
    const { plan, errors } = normalizePlan(raw);
    if (!plan) return { ok: false, plan: null, errors };
    if (errors.length) return { ok: false, plan: null, errors: ['รหัสมีข้อมูลที่ผิด', ...errors] };
    return { ok: true, plan, errors: [] };
  } catch (e) {
    return fail('อ่านรหัสไม่ได้');
  }
}
const fail = why => ({ ok: false, plan: null, errors: [`รหัสผัง: ${why}`] });
