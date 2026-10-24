// กระเป๋างบกลางของทั้งเกม (DECISIONS "งบ ดาว อัปเกรด") อ่าน/เขียนผ่านธงในเซฟ (src/save) จึงไปกับรหัสสำรองเกมด้วย
// งบที่ได้คิดใหม่จากคะแนนดีสุดของทุกภารกิจทุกครั้ง (แก้ตัวเลขในเซฟเพื่อเพิ่มงบไม่ได้) เซฟเก็บแค่:
//   budgetSpent = ยอดที่ใช้ไป, upg:<สถานี> = ขั้นสูงสุดที่ซื้อแล้ว, era:<สถานี> = ขั้นที่เลือกใช้ (ถอยได้ฟรี), layoutPaid = ชิ้นส่วนของผังที่ยืนยันแล้ว
// สถานี 'custom' = ผังที่ผู้เล่นสร้างเอง ไม่มี DOM ทดสอบใน Node ได้
import { earnedOf, upgradeCost, layoutCharge, UPGRADES, planCount, starterPlan, payout, upgradeOf, freePlayPack } from '../sim/index.js';

export { payout, upgradeOf, upgradeCost, freePlayPack, UPGRADES };

const KEYS = ['straight', 'diagonal', 'points', 'platformCells', 'signals'];
const intOr = (v, d) => (Number.isInteger(v) && v >= 0 ? v : d);

// save = src/save, bests() = รายการผลดีสุด [{ stars, score }] ของทุกภารกิจในทุกชุดอาชีพ, starterCounts = ชิ้นส่วนของผังเริ่มต้น (ให้ฟรี)
// baseOf(สถานี) = ขั้นอัปเกรด (ดัชนี UPGRADES) ที่สถานีมีอยู่แล้วตั้งแต่ต้น: สถานีของชุดที่ eras เริ่มที่ยุคสูงกว่า (เช่น สายอีสานเริ่มที่ไฟสี)
//   ขั้นต่ำกว่านั้นไม่มีให้เลือก และไม่ต้องจ่ายค่าขั้นนั้น
export function createWallet(save, bests, starterCounts = planCount(starterPlan()), baseOf = () => 0) {
  const flag = (k, d) => (save.getFlag ? save.getFlag(k, d) : d);
  const set = (k, v) => (save.setFlag ? save.setFlag(k, v) : false);
  const spent = () => Math.max(0, Number(flag('budgetSpent', 0)) || 0);
  const base = id => Math.min(UPGRADES.length - 1, intOr(baseOf(id), 0));
  const owned = id => Math.max(base(id), Math.min(UPGRADES.length - 1, intOr(flag(`upg:${id}`, 0), 0)));
  const paid = () => {
    const s = flag('layoutPaid', null);
    if (typeof s !== 'string') return { ...starterCounts };
    const n = s.split(',').map(Number);
    return n.length === KEYS.length && n.every(x => Number.isInteger(x) && x >= 0) ? Object.fromEntries(KEYS.map((k, i) => [k, n[i]])) : { ...starterCounts };
  };
  const extra = c => Object.fromEntries(KEYS.map(k => [k, Math.max(0, (c[k] || 0) - (starterCounts[k] || 0))]));
  const w = {
    earned: () => earnedOf(bests()),
    spent,
    balance: () => Math.max(0, w.earned() - spent()), // เซฟที่ถูกแก้ยอดใช้ไปเกินงบ: แสดง 0 ไม่ติดลบ
    owned, base,
    selected: id => Math.max(base(id), Math.min(owned(id), intOr(flag(`era:${id}`, owned(id)), owned(id)))),
    // ใช้ขั้น level: ขั้นที่ซื้อแล้ว (หรือต่ำกว่า) เลือกได้ฟรี ขั้นที่สูงกว่าต้องจ่าย คืน { ok, cost, reason }
    choose(id, level) {
      if (!Number.isInteger(level) || level < base(id) || level >= UPGRADES.length) return { ok: false, cost: 0, reason: 'ไม่มีขั้นนี้' };
      const have = owned(id), cost = upgradeCost(have, level);
      if (cost > w.balance()) return { ok: false, cost, reason: `งบไม่พอ ต้องใช้ ${cost} มีอยู่ ${w.balance()}` };
      if (cost > 0) { set('budgetSpent', spent() + cost); set(`upg:${id}`, level); }
      set(`era:${id}`, level);
      return { ok: true, cost, reason: '' };
    },
    paid,
    // ค่ายืนยันผังที่มีชิ้นส่วน counts (ติดลบ = ได้คืน) ชิ้นเท่าที่ผังเริ่มต้นมีให้ฟรีทั้งตอนวางและตอนรื้อ คิดเฉพาะส่วนที่เกิน
    layoutCharge: counts => layoutCharge(extra(paid()), extra(counts)),
    confirmLayout(counts) {
      const c = layoutCharge(extra(paid()), extra(counts));
      if (c > w.balance()) return { ok: false, cost: c, reason: `งบไม่พอ ค่าก่อสร้าง ${c} มีอยู่ ${w.balance()}` };
      set('budgetSpent', Math.max(0, spent() + c));
      set('layoutPaid', KEYS.map(k => counts[k] || 0).join(','));
      return { ok: true, cost: c, reason: '' };
    },
    // สถิติดีสุดของเดินรถอิสระต่อสถานีต่อขั้น (ให้เห็นผลของอัปเกรด ไม่ให้งบ ไม่นับดาว) คืน { best, isNew }
    freeRecord(id, level, score) {
      const k = `free:${id}:${level}`, best = Math.max(0, Number(flag(k, 0)) || 0), s = Math.max(0, Math.round(score) || 0);
      if (s > best) { set(k, s); return { best: s, isNew: true }; }
      return { best, isNew: false };
    },
  };
  return w;
}
