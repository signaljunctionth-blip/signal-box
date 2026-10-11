// ทางออกเดียวของตัวจำลองไปหา UI: g.onEvent({ type, ... }) ตัวจำลองไม่เรียก UI ตรง
//   { type: 'msg',   text, kind }                     kind = '' | 'good' | 'bad'
//   { type: 'score', delta, score, reason, train }    คะแนนก้อน (ค่าปรับรอนานไม่ส่ง ให้อ่าน g.score)
//   { type: 'fail',  title, why, lesson }
//   { type: 'win',   score, max, ratio, stars }
import { T } from './messages.js';

export function emit(g, ev) { if (g.onEvent) g.onEvent(ev, g); }

// คืน false เสมอ เพื่อให้คำสั่งเขียน `return msg(...)` เมื่อปฏิเสธได้
export function msg(g, text, kind = '') { emit(g, { type: 'msg', text, kind }); return false; }

export function addScore(g, delta, reason, train) {
  g.score += delta;
  emit(g, { type: 'score', delta, score: g.score, reason, train: train.id });
}

export function fail(g, title, why) {
  if (g.state !== 'play') return;
  g.state = 'fail';
  const lesson = g.era.interlock ? (g.lv.maxWait ? T.lessonMaxWait() : T.lessonInterlock()) : g.era.lesson;
  g.result = { title, why, lesson };
  emit(g, { type: 'fail', ...g.result });
}

export function win(g) {
  g.state = 'win';
  const score = Math.max(0, Math.round(g.score)), ratio = score / g.max, stars = ratio >= .8 ? 3 : ratio >= .55 ? 2 : 1;
  g.result = { score, max: g.max, ratio, stars };
  emit(g, { type: 'win', ...g.result });
}
