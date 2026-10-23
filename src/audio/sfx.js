// เสียงประกอบ สร้างจากโค้ดทั้งหมด
import { clunk, click, blip, bell, musicBox, shaker } from './synth.js';

export const SFX = {
  // คันโยกสับประแจ: ดึงคันโยก (กึก) แล้วกลอนล็อกเข้าที่ (แกร๊ก)
  lever(ctx, out, t) { clunk(ctx, out, t); click(ctx, out, t + 0.09, 0.8); },
  // เสาเปลี่ยนท่า: ปิ๊วขึ้น = ทางเปิด
  signalClear(ctx, out, t) { blip(ctx, out, t, 520, 780); },
  signalStop(ctx, out, t) { blip(ctx, out, t, 700, 440); },
  // กระดิ่งสถานี: ติ๊ง-ติ๊ง
  bell(ctx, out, t) { bell(ctx, out, t, 1320, 0.9); bell(ctx, out, t + 0.32, 1320, 0.9); },
  // ขบวนวิ่ง: ตึก-ตัก 2 รอบ เร่งขึ้นเล็กน้อย
  trainRun(ctx, out, t) {
    [0, 0.09, 0.42, 0.5, 0.8, 0.87].forEach((d, i) => shaker(ctx, out, t + d, i % 2 ? 1 : 0.6));
  },
  // ขบวนเข้าจอด: เสียงลมเบรกฟู่สั้น + ตึก-ตักช้าลง
  trainStop(ctx, out, t) {
    [0, 0.12, 0.6, 0.75].forEach((d, i) => shaker(ctx, out, t + d, i % 2 ? 0.8 : 0.5));
    blip(ctx, out, t + 1.0, 900, 700, 0.35, 0.5);
  },
  // ระบบไม่ยอม (อินเตอร์ล็อกปฏิเสธ): ตุ๊บ-ตุ๊บ ต่ำ ๆ นุ่ม ๆ ไม่ดุ
  deny(ctx, out, t) { blip(ctx, out, t, 330, 300, 0.09, 0.8); blip(ctx, out, t + 0.13, 300, 260, 0.12, 0.8); },
  win(ctx, out, t) { [72, 76, 79, 84].forEach((m, i) => musicBox(ctx, out, t + i * 0.11, m, 1.1)); },
  lose(ctx, out, t) { blip(ctx, out, t, 520, 470, 0.25); blip(ctx, out, t + 0.28, 440, 330, 0.45); },
};
