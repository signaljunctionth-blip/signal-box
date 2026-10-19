// เพลงประกอบ "ห้องสัญญาณยามบ่าย" (โลไฟ เปียโนไฟฟ้า) เวอร์ชันหน้าแผนที่ (โล่ง ช้า) และขณะเล่น (มีจังหวะเบา ๆ ไม่แย่งสมาธิ)
// โน้ตเขียนเป็นเลข MIDI (60 = โด กลาง) ทำนองเขียนทีละห้อง ห้องละ 8 ตัว (โน้ตตัวละ 1/8) 0 = เงียบ
import { musicBox, ePiano, bass, kick, hat, rim } from './synth.js';

// โน้ต 1/8 ในห้อง ณ ช่อง 1/16 (คืน 0 ถ้าไม่ตรงหัวโน้ต)
const at8 = (bars, bar, pos) => (pos % 2 === 0 ? bars[bar % bars.length][pos >> 1] : 0);

// คอร์ดเมเจอร์เซเวนท์ วนทีละ 4 ห้อง
const C_CHORD = [[53, 57, 60, 64], [52, 55, 59, 62], [50, 53, 57, 60], [55, 59, 60, 64]]; // Fmaj7 Em7 Dm7 Cmaj7
const C_ROOT = [41, 40, 38, 36];
const C_MEL = [
  [0, 0, 76, 0, 79, 0, 0, 0], [0, 0, 74, 0, 71, 0, 0, 0],
  [0, 0, 72, 0, 69, 0, 72, 74], [76, 0, 0, 0, 0, 0, 0, 0],
];

function cStep(play) {
  return ({ ctx, out, bar, pos, loop, t, stepDur }) => {
    const ch = C_CHORD[bar % 4];
    if (pos === 0) ch.forEach((m) => ePiano(ctx, out, t, m, stepDur * 10, 0.9));
    if (pos === 7) ch.slice(1).forEach((m) => ePiano(ctx, out, t, m + 12, stepDur * 4, 0.35));
    if (pos === 0 || pos === 10) bass(ctx, out, t, C_ROOT[bar % 4], stepDur * (pos ? 5 : 8), 0.8);
    const m = at8(C_MEL, bar, pos);
    if (m && (!play || loop % 2 === 1)) musicBox(ctx, out, t, m, 0.55);
    if (play) {
      if (pos === 0 || pos === 10) kick(ctx, out, t, 0.6);
      if (pos === 4 || pos === 12) rim(ctx, out, t, 0.6);
      if (pos % 2 === 0) hat(ctx, out, t, pos % 4 === 0 ? 0.7 : 0.45);
    }
  };
}

// เจเลือกแบบ C (2026-10-19) หน้าแผนที่โล่งไม่มีกลอง ขณะเล่นมีกลองเบา ทำนองมาทุกท่อนที่สอง
export const MUSIC = {
  map: { bpm: 70, bars: 4, swing: 0.35, tone: 3800, step: cStep(false) },
  play: { bpm: 76, bars: 4, swing: 0.35, tone: 4200, step: cStep(true) },
};
