// ดึง LAYOUTS / ERAS / LEVELS ออกจาก prototype/index.html (ไฟล์อ้างอิงที่ห้ามแก้) เพื่อใช้เทียบกับข้อมูล JSON
// ไม่ใช้เบราว์เซอร์: ตัดช่วงโค้ดข้อมูลออกมารันใน Function เปล่า ๆ
const fs = require('fs');
const path = require('path');

function prototypeData({ rawSched = false } = {}) {
  const html = fs.readFileSync(path.resolve(__dirname, '../../prototype/index.html'), 'utf8');
  const a = html.indexOf('function prep(E)');
  const b = html.indexOf('/* ================= ความคืบหน้า');
  if (a < 0 || b < 0) throw new Error('หาโค้ดข้อมูลในต้นแบบไม่เจอ (prototype/index.html ถูกแก้หรือเปล่า)');
  let code = html.slice(a, b);
  // rawSched: เก็บตารางขบวนเป็น { pattern, gap, start } แทนรายการที่คำนวณแล้ว (ใช้ตอนสร้างไฟล์ JSON)
  if (rawSched) code = code.replace(/const sched = .*\n/, 'const sched = (pattern, gap, start = 1) => ({ pattern, gap, start });\n');
  return new Function(`${code}\nreturn { LAYOUTS, ERAS, LEVELS };`)();
}
module.exports = { prototypeData };
