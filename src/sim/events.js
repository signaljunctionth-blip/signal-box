// ทางออกเดียวของตัวจำลองไปหา UI: g.onEvent({ type, ... }) ตัวจำลองไม่เรียก UI ตรง
//   { type: 'msg',   text, kind }                     kind = '' | 'good' | 'bad'
//   { type: 'score', delta, score, reason, train }    คะแนนก้อน (ค่าปรับรอนานไม่ส่ง ให้อ่าน g.score)
//   { type: 'fail',  title, why, lesson, code }    code = HEAD_ON | REAR_END | SIDE | HEAD_ON_BLOCK | RUN_THROUGH | DERAIL_UNDER | DEADLOCK | MAX_WAIT
//   { type: 'train', what, train }                    what = 'spawn' | 'arrive' | 'reverse' | 'exit'
//   { type: 'stall', seconds }                        ไม่มีขบวนขยับนานผิดปกติ (ไม่ใช่การแพ้) ให้ UI ขึ้นคำใบ้หรือปุ่มเริ่มใหม่
//   { type: 'block', portal, state, dir, train, token, ask } สถานะตอนทางเดี่ยวของขาเปลี่ยน (token/ask เฉพาะด่านที่มีห่วง ดู blockState)
//   msg ที่เป็นการปฏิเสธมี code ด้วย: POINT_NOT_SET | OVERLAP_POINT_NOT_SET | POINT_LOCKED | POINT_OCCUPIED | ROUTE_CONFLICT | OVERLAP_HELD | TRACK_OCCUPIED | BLOCK_NOT_FREE | TOKEN_NEEDED | TOKEN_IN_USE | APPROACH_LOCKED
//   { type: 'win',   score, max, ratio, stars }
import { T } from './messages.js';

export function emit(g, ev) { if (g.onEvent) g.onEvent(ev, g); }

// คืน false เสมอ เพื่อให้คำสั่งเขียน `return msg(...)` เมื่อปฏิเสธได้
// code = รหัสเหตุผลเมื่อระบบปฏิเสธ (เช่น 'ROUTE_CONFLICT') ให้เทสต์และบทสอนแยกกรณีได้
export function msg(g, text, kind = '', code = null) { g.lastCode = code; emit(g, code ? { type: 'msg', text, kind, code } : { type: 'msg', text, kind }); return false; }

export function addScore(g, delta, reason, train) {
  g.score += delta;
  emit(g, { type: 'score', delta, score: g.score, reason, train: train.id });
}

export function fail(g, title, why, code = 'FAIL') {
  if (g.state !== 'play') return;
  g.state = 'fail';
  const lesson = code === 'DEADLOCK' ? (g.era.interlock ? T.lessonDeadlock() : T.lessonStuck()) : g.era.interlock ? (g.lv.maxWait ? T.lessonMaxWait() : T.lessonInterlock()) : g.era.lesson;
  g.result = { title, why, lesson, code };
  emit(g, { type: 'fail', ...g.result });
}

export function win(g) {
  g.state = 'win';
  const score = Math.max(0, Math.round(g.score)), ratio = score / g.max, stars = ratio >= .8 ? 3 : ratio >= .55 ? 2 : 1;
  g.result = { score, max: g.max, ratio, stars };
  emit(g, { type: 'win', ...g.result });
}
