// งบประมาณ ดาว และอัปเกรด (M4) — ฟังก์ชันล้วน ตัวเลขทั้งหมดอยู่ที่นี่ที่เดียว (docs/DECISIONS.md "งบ ดาว อัปเกรด")
// งบที่ได้ไม่ถูกเก็บในเซฟ: คิดใหม่จากคะแนนดีสุดของทุกภารกิจทุกครั้ง (เล่นซ้ำได้งบเฉพาะส่วนที่ดีกว่าเดิม) เซฟเก็บแค่ยอดที่ใช้ไปกับอัปเกรดที่ซื้อแล้ว
// อัปเกรดไม่มีผลกับภารกิจสอน: ใช้กับ "เดินรถอิสระ" ของสถานีและผังที่ผู้เล่นสร้างเท่านั้น (free-play.js รับ speed/grace จากตารางนี้)

export const STAR_BONUS = [0, 20, 50, 100]; // โบนัสสะสมตามจำนวนดาว (ดาวแรก 20, ดาวที่สอง +30, ดาวที่สาม +50)
export const SCORE_PER_UNIT = 10;

// งบรวมที่ผลหนึ่งรอบมีค่า: 0 ดาว (ชน ตกราง รถฝ่าประแจ หรือไม่ผ่าน) ไม่ได้งบ
export function budgetOf({ stars = 0, score = 0 } = {}) {
  const s = Math.max(0, Math.min(3, Math.floor(stars) || 0));
  if (!s) return 0;
  return Math.floor(Math.max(0, score) / SCORE_PER_UNIT) + STAR_BONUS[s];
}
// งบที่จ่ายรอบนี้ = ส่วนที่ดีกว่าผลดีสุดเดิม ผลดีสุดรวมแบบเดียวกับเซฟ (setBest: ดาวกับคะแนนเอาค่ามากสุดแยกกัน) และรอบ 0 ดาวไม่ถูกบันทึก
export const mergeBest = (prev, now) => ({ stars: Math.max(prev.stars || 0, now.stars || 0), score: Math.max(prev.score || 0, now.score || 0) });
export function payout(prev, now) {
  if (!(now.stars > 0)) return 0;
  return Math.max(0, budgetOf(mergeBest(prev, now)) - budgetOf(prev));
}
// งบที่ได้ทั้งเกม: bests = รายการผลดีสุด [{ stars, score }]
export const earnedOf = bests => bests.reduce((a, b) => a + budgetOf(b), 0);

// ขั้นระบบสัญญาณ = ลำดับยุคในชุดภารกิจ (0 ไม่มีอินเตอร์ล็อก ... 3 แผง NX) ราคาของการขึ้นไปขั้นนั้น และผลต่อการเล่น
export const UPGRADES = [
  { level: 0, cost: 0, speed: 1, grace: 1, gain: 'รถวิ่งตามความเร็วปกติ ไม่มีอะไรกันคุณพลาด' },
  { level: 1, cost: 150, speed: 1, grace: 1, gain: 'อินเตอร์ล็อกกันตั้งเส้นทางที่ขัดกัน' },
  { level: 2, cost: 400, speed: 1.15, grace: 1, gain: 'ระบบสับประแจปลายไกลให้ เห็นรถบนแผง รถวิ่งเร็วขึ้น 15%' },
  { level: 3, cost: 900, speed: 1.15, grace: 1.2, gain: 'แตะต้นทางกับปลายทางก็ตั้งทางได้ รอได้นานขึ้น 20% ก่อนเสียคะแนน' },
];
export const upgradeOf = level => UPGRADES[Math.max(0, Math.min(UPGRADES.length - 1, level | 0))];
// ราคาขึ้นจากขั้นที่มี (owned) ไปขั้น to (ขั้นที่เคยซื้อแล้วกลับไปใช้ได้ฟรี)
export function upgradeCost(owned, to) {
  let c = 0;
  for (let l = owned + 1; l <= to && l < UPGRADES.length; l++) c += UPGRADES[l].cost;
  return c;
}

// ราคาชิ้นในตัวแก้ผัง (ชื่อ key ตรงกับ planCount ใน editor.js)
export const PIECE_PRICE = { straight: 5, diagonal: 8, points: 40, platformCells: 30, signals: 15 };
export const REFUND = 0.5; // รื้อชิ้นที่ยืนยันแล้ว คืนครึ่งราคา
// ค่ายืนยันผังใหม่เทียบกับผังที่ยืนยันไว้ (นับชิ้นแต่ละชนิด): ชิ้นที่เพิ่มจ่ายเต็ม ชิ้นที่ลดคืนครึ่ง ผลลบ = ได้คืน
export function layoutCharge(paid, next, price = PIECE_PRICE) {
  let c = 0;
  for (const k in price) {
    const d = (next[k] || 0) - (paid[k] || 0);
    c += d > 0 ? d * price[k] : d * price[k] * REFUND;
  }
  return Math.round(c);
}
