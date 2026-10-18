// ตัวห่อเซฟของโหมดอาชีพ: หน้าจออ่าน/เขียนดาว "ต่อ id ภารกิจ" ผ่านอินเตอร์เฟซเล็ก ๆ นี้เท่านั้น (ไม่แตะ localStorage ตรง ๆ)
// ใช้ getBest/setBest ของ src/save (เซฟรุ่น 2: เก็บดาวและคะแนนที่ดีที่สุดต่อ id ภารกิจ) ถ้า API เปลี่ยน แก้แค่ไฟล์นี้
export function createCareerSave(save, packId) {
  return {
    packId,
    // ดาวที่ดีที่สุดของภารกิจ (0 = ยังไม่ผ่าน)
    stars: id => save.getBest(packId, id).stars,
    score: id => save.getBest(packId, id).score,
    // บันทึกผล (src/save เก็บค่าที่ดีที่สุดแยกดาวกับคะแนน) คืน false ถ้าเขียนลงที่เก็บไม่ได้
    setStars: (id, stars, score = 0) => save.setBest(packId, id, { stars, score }),
  };
}
