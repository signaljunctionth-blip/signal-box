// กระเป๋างบกลางของทั้งเกม (DECISIONS "งบ ดาว อัปเกรด") อ่าน/เขียนผ่านธงในเซฟ (src/save) จึงไปกับรหัสสำรองเกมด้วย
// งบที่ได้คิดใหม่จากคะแนนดีสุดของทุกภารกิจทุกครั้ง (แก้ตัวเลขในเซฟเพื่อเพิ่มงบไม่ได้) เซฟเก็บแค่:
//   budgetSpent = ยอดที่ใช้ไป, upg:<สถานี> = ขั้นสูงสุดที่ซื้อแล้ว, era:<สถานี> = ขั้นที่เลือกใช้ (ถอยได้ฟรี), layoutPaid = ชิ้นส่วนของผังที่ยืนยันแล้ว
// สถานี 'custom' = ผังที่ผู้เล่นสร้างเอง ไม่มี DOM ทดสอบใน Node ได้
import { earnedOf, upgradeCost, layoutCharge, UPGRADES, planCount, starterPlan, payout, upgradeOf, freePlayPack } from '../sim/index.js';

export { payout, upgradeOf, upgradeCost, freePlayPack, UPGRADES };

const KEYS = ['straight', 'diagonal', 'points', 'platformCells', 'signals'];
const intOr = (v, d) => (Number.isInteger(v) && v >= 0 ? v : d);

// save = src/save, bests() = รายการผลดีสุด [{ stars, score }] ของทุกภารกิจในชุดภารกิจหลัก, starterCounts = ชิ้นส่วนของผังเริ่มต้น (ให้ฟรี)
export function createWallet(save, bests, starterCounts = planCount(starterPlan())) {
  const flag = (k, d) => (save.getFlag ? save.getFlag(k, d) : d);
  const set = (k, v) => (save.setFlag ? save.setFlag(k, v) : false);
  const spent = () => Math.max(0, Number(flag('budgetSpent', 0)) || 0);
  const owned = id => Math.min(UPGRADES.length - 1, intOr(flag(`upg:${id}`, 0), 0));
  const paid = () => {
    const s = flag('layoutPaid', null);
    if (typeof s !== 'string') return { ...starterCounts };
    const n = s.split(',').map(Number);
    return n.length === KEYS.length && n.every(x => Number.isInteger(x) && x >= 0) ? Object.fromEntries(KEYS.map((k, i) => [k, n[i]])) : { ...starterCounts };
  };
  const w = {
    earned: () => earnedOf(bests()),
    spent,
    balance: () => w.earned() - spent(),
    owned,
    selected: id => Math.min(owned(id), intOr(flag(`era:${id}`, owned(id)), owned(id))),
    // ใช้ขั้น level: ขั้นที่ซื้อแล้ว (หรือต่ำกว่า) เลือกได้ฟรี ขั้นที่สูงกว่าต้องจ่าย คืน { ok, cost, reason }
    choose(id, level) {
      if (!Number.isInteger(level) || level < 0 || level >= UPGRADES.length) return { ok: false, cost: 0, reason: 'ไม่มีขั้นนี้' };
      const have = owned(id), cost = upgradeCost(have, level);
      if (cost > w.balance()) return { ok: false, cost, reason: `งบไม่พอ ต้องใช้ ${cost} มีอยู่ ${w.balance()}` };
      if (cost > 0) { set('budgetSpent', spent() + cost); set(`upg:${id}`, level); }
      set(`era:${id}`, level);
      return { ok: true, cost, reason: '' };
    },
    paid,
    // ค่ายืนยันผังที่มีชิ้นส่วน counts (ติดลบ = ได้คืน)
    layoutCharge: counts => layoutCharge(paid(), counts),
    confirmLayout(counts) {
      const c = layoutCharge(paid(), counts);
      if (c > w.balance()) return { ok: false, cost: c, reason: `งบไม่พอ ค่าก่อสร้าง ${c} มีอยู่ ${w.balance()}` };
      set('budgetSpent', Math.max(0, spent() + c));
      set('layoutPaid', KEYS.map(k => counts[k] || 0).join(','));
      return { ok: true, cost: c, reason: '' };
    },
  };
  return w;
}
