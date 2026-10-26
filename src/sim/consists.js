// ชนิดขบวน (WP11): ขบวนแต่ละชนิดคือรายการตัวรถ ความยาวในตัวจำลอง = ผลรวมความยาวตัวรถ (เมตร) ÷ M_PER_UNIT
// ข้อมูลล้วน ตัววาด 2 มิติและ 3 มิติอ่านรายการตัวรถไปวาดเอง (ตัวจำลองใช้แค่ความยาวรวม)
// ความยาวตัวรถเป็นค่าประมาณแบบเรียบของเกม ไม่ใช่สเปกรถรุ่นใดรุ่นหนึ่ง
export const M_PER_UNIT = 0.25;   // เมตรต่อหน่วยผังตามแนวราง (ตรงกับ KX ของฉาก 3 มิติ)
export const COUPLER = 0.4;       // ระยะข้อต่อระหว่างตัวรถ (เมตร)

// ตัวรถ: ความยาวตัวถัง (เมตร)
export const CARS = {
  dmu: 17.6,     // รถดีเซลราง (มีห้องคนขับในตัว)
  loco: 15.6,    // หัวรถจักรดีเซล
  coach: 19.6,   // ตู้โดยสาร
  wagon: 11.6,   // ตู้สินค้า
};

// ชนิดขบวน: name = ชื่อที่ผู้เล่นเห็น
export const KINDS = {
  railcar:  { name: 'รถดีเซลราง 1 คัน', cars: ['dmu'] },
  railcar2: { name: 'รถดีเซลราง 2 คัน', cars: ['dmu', 'dmu'] },
  railcar3: { name: 'รถดีเซลราง 3 คัน', cars: ['dmu', 'dmu', 'dmu'] },
  local:    { name: 'ขบวนธรรมดา', cars: ['loco', 'coach', 'coach'] },
  express:  { name: 'ขบวนด่วน', cars: ['loco', 'coach', 'coach'] },
  freight:  { name: 'ขบวนสินค้า', cars: ['loco', 'wagon', 'wagon', 'wagon'] },
};
export const DEFAULT_KIND = 'railcar'; // ภารกิจที่ไม่ระบุชนิด = ความยาวเดิมของเกม (72 หน่วย)

// ความยาวของขบวน (หน่วยผัง)
export const kindLen = kind => Math.round(KINDS[kind].cars.reduce((s, c) => s + CARS[c] + COUPLER, 0) / M_PER_UNIT);
