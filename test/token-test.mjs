// เทสต์ห่วงทางสะดวก (M2) และ approach locking ใน Node ล้วน — ใช้: node test/token-test.mjs
// ผังสมมุติ fictional-crossing-1-loop (ทางเดี่ยว 1 ทางหลีก ขา W/E มีตอนทางเดี่ยว) กับชุดด่านที่สร้างในไฟล์นี้
// อ้างอิง: docs/SIGNALLING-RULES.md ข้อ 4 (ห่วงแบบเครื่องทางสะดวกสองปลายตอน ออกได้ทีละอัน) และ 2.10 (approach locking)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import * as sim from '../src/sim/index.js';

const require = createRequire(import.meta.url);
const { playHints } = require('./lib/bot.js');
const root = path.resolve(import.meta.dirname, '..');
const readJson = f => JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));

let fails = 0, checks = 0;
const ok = (cond, name, detail = '') => { checks++; if (!cond) { fails++; console.error(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); } };

const stationJson = ['fictional-crossing-1-loop', 'fictional-history-2-platforms'].map(id => ({ name: id + '.json', json: readJson(`data/stations/${id}.json`) }));
const { stations, errors } = sim.loadStations(stationJson);

const ERAS = [
  { name: 'ไม่มีอินเตอร์ล็อก', interlock: false, sema: true, tc: false, nx: false, lesson: 'ทดสอบ' },
  { name: 'อินเตอร์ล็อกกล', interlock: true, sema: true, tc: false, nx: false },
  { name: 'ไฟสี', interlock: true, sema: false, tc: true, nx: false, approachLock: true },
  { name: 'NX', interlock: true, sema: false, tc: true, nx: true, approachLock: true },
];
const CROSS = [{ at: 1, from: 'W', to: 'E', track: 'loop1' }, { at: 3, from: 'E', to: 'W', track: 'main' }];
const level = (era, extra = {}) => ({ id: `t-${era}`, station: 'fictional-crossing-1-loop', era, name: 'ห่วง', goal: 'ทดสอบ', speed: 60, waitGrace: 20, tips: [], token: true, trains: CROSS, ...extra });
const packOf = levels => {
  const r = sim.loadLevelPack({ schema: 2, id: 'token-test', eras: ERAS, levels }, stations, errors);
  if (!r.ok) throw new Error(r.errors.join(' | '));
  return r.pack;
};
const run = (g, sec) => { for (let t = 0; t < sec && g.state === 'play'; t += sim.FIXED_DT) sim.step(g, sim.FIXED_DT); };
const until = (g, cond, sec = 60) => { for (let t = 0; t < sec && g.state === 'play' && !cond(); t += sim.FIXED_DT) sim.step(g, sim.FIXED_DT); return cond(); };
function game(levels, i = 0) {
  const ev = [], g = sim.createGame(packOf(levels), i, { onEvent: e => ev.push(e) });
  sim.startGame(g);
  return { g, ev, last: () => [...ev].reverse().find(e => e.type === 'msg') || {} };
}

// ---------- ตัวตรวจข้อมูล ----------
{
  const bad = sim.loadLevelPack({ schema: 2, id: 'x', eras: ERAS, levels: [level(1, { token: 'yes' })] }, stations, errors);
  ok(!bad.ok && bad.errors.some(e => /token/.test(e)), 'token ต้องเป็น boolean');
  const noBlock = sim.loadLevelPack({ schema: 2, id: 'x', eras: ERAS, levels: [level(1, { station: 'fictional-history-2-platforms', trains: { pattern: '12', gap: 12, start: 1 } })] }, stations, errors);
  ok(noBlock.ok && /ไม่มีตอนทางเดี่ยว/.test(noBlock.pack.levels[0].error || ''), 'ภารกิจที่มีห่วงบนผังที่ไม่มีตอนทางเดี่ยว = error ของด่าน', noBlock.ok ? noBlock.pack.levels[0].error : noBlock.errors.join());
  const card = sim.loadLevelPack({ schema: 2, id: 'x', eras: ERAS, levels: [level(1, { card: { title: 'ก', text: 'ข' } })] }, stations, errors);
  ok(!card.ok && card.errors.some(e => /card/.test(e)), 'การ์ดความรู้ต้องมีแหล่งอ้างอิง');
  const al = sim.loadLevelPack({ schema: 2, id: 'x', eras: [{ ...ERAS[0], approachLock: true }], levels: [level(0)] }, stations, errors);
  ok(!al.ok && al.errors.some(e => /approachLock/.test(e)), 'approachLock ใช้ได้เฉพาะยุคที่มีอินเตอร์ล็อก');
}

// ---------- ขาเข้า: สถานีข้างเคียงขอทาง ผู้เล่นให้ทาง ขบวนมาพร้อมห่วง ----------
{
  const { g, last } = game([level(1)]);
  run(g, 0.1);
  let W = sim.blockState(g, 'W');
  ok(W.ask === 1 && W.state === 'free', 'ขบวน 1 จากฝั่ง W: สถานีข้างเคียงขอทาง (ask = 1)', JSON.stringify(W));
  run(g, 15);
  ok(g.trains.length === 0, 'ไม่ให้ทาง = ขบวนไม่มา');
  ok(sim.press(g, { kind: 'accept', id: 'W' }), 'แตะให้ทางฝั่ง W ได้');
  W = sim.blockState(g, 'W');
  ok(W.state === 'occupied' && W.dir === 'in' && W.token === 'away' && W.ask === null, 'ให้ทางแล้ว: ตอนฝั่ง W มีขบวนกำลังมา ห่วงอยู่กับขบวนนอกจอ', JSON.stringify(W));
  ok(!sim.press(g, { kind: 'token', id: 'W' }) && last().code === 'BLOCK_NOT_FREE', 'ขอห่วงฝั่งที่ขบวนกำลังมาไม่ได้');
  ok(until(g, () => g.trains.length === 1, 20), 'ขบวน 1 โผล่หลัง runTime');
  ok(g.trains[0].token === 'W' && sim.trainInfo(g, g.trains[0]).token === 'W', 'ขบวนที่มาถือห่วงฝั่ง W');
  ok(sim.setRoute(g, 'S1', g.L.routes.S1.find(r => r.plat === 1)), 'รับขบวน 1 เข้าทาง 1');
  ok(until(g, () => sim.blockState(g, 'W').state === 'free', 30), 'ขบวนเข้าสถานีพ้นทั้งขบวน ตอนฝั่ง W ว่าง');
  ok(g.trains[0].token === null, 'ห่วงคืนเข้าเครื่องแล้ว');
}

// ---------- ขาออก: ต้องขอห่วงก่อนเปิดเสาออก ห่วงไปกับขบวน ออกได้ทีละอัน ----------
{
  const { g, last } = game([level(1, { trains: [{ at: 0, origin: 'loop1', to: 'E', dwell: 0.5 }, { at: 30, from: 'E', to: 'W', track: 'main' }] })]);
  run(g, 2);
  sim.press(g, { kind: 'point', id: 'P2' }); // T1 ออกฝั่ง E ผ่าน P2 ท่าแยก
  ok(!sim.press(g, { kind: 'signal', id: 'T1' }) && last().code === 'TOKEN_NEEDED', 'ไม่มีห่วง = เสาออกไม่ให้สัญญาณ (TOKEN_NEEDED)', last().code);
  ok(sim.canRoute(g, 'T1', g.L.routes.T1[0]) === null, 'คำใบ้/ตัวตรวจทางตันถือว่าขอห่วงได้ (ตอนว่าง)');
  ok(sim.nextTarget(g) && sim.nextTarget(g).kind === 'token' && sim.nextTarget(g).id === 'E', 'คำใบ้ชี้เครื่องทางสะดวกฝั่ง E ก่อน', JSON.stringify(sim.nextTarget(g)));
  ok(sim.press(g, { kind: 'token', id: 'E' }) && sim.blockState(g, 'E').token === 'station', 'ขอห่วงฝั่ง E ได้ ห่วงอยู่ที่สถานี');
  ok(sim.press(g, { kind: 'token', id: 'E' }) && sim.blockState(g, 'E').state === 'free', 'แตะอีกครั้ง = คืนห่วงเข้าเครื่อง');
  sim.press(g, { kind: 'token', id: 'E' });
  ok(sim.press(g, { kind: 'signal', id: 'T1' }), 'มีห่วงแล้ว เปิดเสาออก T1 ได้');
  ok(!sim.press(g, { kind: 'token', id: 'E' }) && last().code === 'TOKEN_IN_USE', 'เปิดเสาออกด้วยห่วงอยู่ คืนห่วงไม่ได้');
  sim.press(g, { kind: 'signal', id: 'T1' });
  ok(sim.blockState(g, 'E').token === 'station', 'ยกเลิกเสาออก ห่วงยังอยู่ที่สถานี (ไม่หายไปเอง)');
  sim.press(g, { kind: 'signal', id: 'T1' });
  ok(until(g, () => g.trains[0] && g.trains[0].token === 'E', 10), 'หัวขบวนเข้าตอน ห่วงไปกับขบวน');
  ok(!sim.press(g, { kind: 'token', id: 'E' }) && last().code === 'BLOCK_NOT_FREE', 'ห่วงออกไปแล้ว ขอห่วงอันที่สองไม่ได้');
  ok(until(g, () => g.trains.length === 0, 20), 'ขบวน 1 ออกพ้นจอ');
  ok(sim.blockState(g, 'E').state === 'occupied' && sim.blockState(g, 'E').token === 'away', 'ยังนับว่าอยู่ในตอนอีก runTime');
  ok(until(g, () => sim.blockState(g, 'E').state === 'free', 12), 'ครบ runTime ห่วงถึงสถานีข้างหน้า ตอนว่าง');
}

// ---------- ห่วงทีละอัน: ถือห่วงขาออกอยู่ สถานีข้างเคียงขอทางไม่ได้ / ให้ทางไม่ได้ ----------
{
  const { g, last } = game([level(1, { trains: [{ at: 0, origin: 'loop1', to: 'E', dwell: 0.5 }, { at: 9, from: 'E', to: 'W', track: 'main' }] })]);
  sim.press(g, { kind: 'token', id: 'E' });
  run(g, 3);
  ok(sim.blockState(g, 'E').ask === null, 'ห่วงฝั่ง E อยู่ที่เรา: สถานีข้างเคียงยังขอทางไม่ได้');
  sim.press(g, { kind: 'token', id: 'E' });
  run(g, 0.1);
  ok(sim.blockState(g, 'E').ask === 2, 'คืนห่วงแล้ว สถานีข้างเคียงขอทางส่งขบวน 2');
  sim.press(g, { kind: 'token', id: 'E' });
  ok(!sim.press(g, { kind: 'accept', id: 'E' }) && last().code === 'BLOCK_NOT_FREE', 'ถือห่วงอยู่ ให้ทางไม่ได้ (ห่วงออกได้ทีละอัน)');
  ok(!sim.press(g, { kind: 'accept', id: 'W' }) && last().code === 'NO_ASK', 'ฝั่งที่ไม่มีคำขอ ให้ทางไม่ได้');
}

// ---------- ยุคไม่มีอินเตอร์ล็อก: คนขับไม่ออกถ้าไม่มีห่วง จึงชนประสานงาในตอนไม่ได้ ----------
{
  const { g, last } = game([level(0, { trains: [{ at: 0, origin: 'loop1', to: 'E', dwell: 0.5 }, { at: 9, from: 'E', to: 'W', track: 'main' }] })]);
  run(g, 1.5);
  sim.press(g, { kind: 'point', id: 'P2' });
  sim.press(g, { kind: 'accept', id: 'E' });
  ok(!sim.press(g, { kind: 'signal', id: 'T1' }) && last().code === 'BLOCK_NOT_FREE', 'ให้ทางขาเข้าแล้ว เปิดเสาออกฝั่งเดียวกันไม่ได้แม้ไม่มีอินเตอร์ล็อก', last().code);
  const g2 = game([level(0, { trains: [{ at: 0, origin: 'loop1', to: 'E', dwell: 0.5 }] })]);
  run(g2.g, 1);
  sim.press(g2.g, { kind: 'point', id: 'P2' });
  ok(!sim.press(g2.g, { kind: 'signal', id: 'T1' }) && g2.last().code === 'TOKEN_NEEDED' && /คนขับ/.test(g2.last().text), 'ไม่มีห่วง: คนขับไม่ออก');
}

// ---------- ช่องที่ signalling-engineer พบ (WP4 รอบตรวจ 1) ----------
const ORIGIN_E = [{ at: 0, origin: 'loop1', to: 'E', dwell: 0.5 }, { at: 12, from: 'E', to: 'W', track: 'main' }];
for (const era of [1, 2]) { // หัวขบวนผ่านเสาออกแล้วแต่ยังไม่ถึงขาออก: คืนห่วงไม่ได้ ตอนเป็น occupied(out) แล้ว (ข้อ 4.2)
  const { g, last } = game([level(era, { trains: ORIGIN_E })]);
  run(g, 1);
  ok(sim.setRoute(g, 'T1', g.L.routes.T1.find(r => r.exit)) || (sim.press(g, { kind: 'token', id: 'E' }) && sim.setRoute(g, 'T1', g.L.routes.T1.find(r => r.exit))), `ยุค ${era}: เปิด T1 ด้วยห่วง`);
  ok(until(g, () => g.trains[0] && g.trains[0].edge !== 'k1' && !g.E[g.trains[0].edge].exit, 10), `ยุค ${era}: หัวขบวนผ่าน T1 อยู่ในคอสถานี`, g.trains[0] && g.trains[0].edge);
  ok(g.trains[0].token === 'E' && sim.blockState(g, 'E').state === 'occupied', `ยุค ${era}: ผ่านเสาออกแล้วห่วงอยู่กับขบวน ตอนไม่ว่าง`, JSON.stringify(sim.blockState(g, 'E')));
  ok(!sim.press(g, { kind: 'token', id: 'E' }) && last().code === 'BLOCK_NOT_FREE', `ยุค ${era}: คืนห่วงที่คนขับรับไปแล้วไม่ได้`);
  run(g, 20);
  ok(g.state === 'play' || g.state === 'win', `ยุค ${era}: ไม่เกิดเหตุ`, g.result && g.result.code);
}
{ // ยุคไม่มีอินเตอร์ล็อก: เปิดเสาก่อนแล้วค่อยสับประแจไปขาออก ขบวนไม่มีห่วงต้องหยุดที่เสา
  const { g } = game([level(0, { trains: ORIGIN_E })]);
  run(g, 1);
  ok(sim.press(g, { kind: 'signal', id: 'T1' }), 'ยุค 0: เปิด T1 ตอนประแจยังไม่พาไปขาออก');
  until(g, () => sim.blockState(g, 'E').ask === 2, 15); sim.press(g, { kind: 'accept', id: 'E' });
  sim.press(g, { kind: 'point', id: 'P2' });
  run(g, 25);
  ok(g.state === 'play' && g.trains.some(t => t.id === 1 && t.edge === 'k1' && t.stopped), 'ยุค 0: ขบวนไม่มีห่วงหยุดรอที่ T1 ไม่ชน', `${g.state} ${g.result && g.result.code}`);
}
{ // ยุคไม่มีอินเตอร์ล็อก: สับประแจออกจากขาออกเพื่อคืนห่วง แล้วสับกลับ ขบวนต้องไม่ออกโดยไม่มีห่วง
  const { g, ev } = game([level(0, { trains: ORIGIN_E })]);
  run(g, 1);
  sim.press(g, { kind: 'token', id: 'E' }); sim.press(g, { kind: 'point', id: 'P2' }); sim.press(g, { kind: 'signal', id: 'T1' });
  sim.press(g, { kind: 'point', id: 'P2' }); sim.press(g, { kind: 'token', id: 'E' }); sim.press(g, { kind: 'point', id: 'P2' });
  until(g, () => sim.blockState(g, 'E').ask === 2, 15); sim.press(g, { kind: 'accept', id: 'E' });
  run(g, 25);
  ok(g.state === 'play' && g.trains.some(t => t.id === 1 && t.edge === 'k1'), 'ยุค 0: คืนห่วงแล้ว ขบวนหยุดที่ T1 ไม่ชนในตอน', `${g.state} ${g.result && g.result.code}`);
  ok(ev.some(e => e.type === 'msg' && e.code === 'TOKEN_NEEDED' && /คนขับ/.test(e.text)), 'ยุค 0: บอกผู้เล่นว่าคนขับไม่ออกเพราะไม่มีห่วง');
}
{ // T12 แบบมีห่วง: ระหว่างนับ runTime ขาออก สถานีข้างเคียงยังขอทางไม่ได้
  const { g } = game([level(1, { trains: [{ at: 0, origin: 'loop1', to: 'E', dwell: 0.5 }, { at: 16, from: 'E', to: 'W', track: 'main' }] })]);
  run(g, 1); sim.press(g, { kind: 'token', id: 'E' }); sim.setRoute(g, 'T1', g.L.routes.T1.find(r => r.exit));
  until(g, () => g.trains.length === 0 || g.trains.every(t => t.id !== 1), 20);
  let asked = false; for (let t = 0; t < 7; t += sim.FIXED_DT) { sim.step(g, sim.FIXED_DT); if (sim.blockState(g, 'E').ask !== null) asked = true; }
  ok(!asked && sim.blockState(g, 'E').state === 'occupied', 'T12 มีห่วง: ห่วงยังไปไม่ถึงสถานีข้างหน้า ยังขอทางไม่ได้');
  ok(until(g, () => sim.blockState(g, 'E').ask === 2, 5), 'T12 มีห่วง: ห่วงถึงแล้ว สถานีข้างเคียงขอทางส่งขบวน 2');
}

// ---------- บอทตามคำใบ้เล่นด่านหลีกขบวนแบบมีห่วงผ่านทุกยุค ----------
{
  const levels = [0, 1, 2, 3].map(e => level(e, { id: `cross-${e}` }));
  levels.push(level(1, { id: 'cross-3tr', trains: [...CROSS, { after: { train: 1, event: 'cleared', delay: 3 }, from: 'W', to: 'E', track: 'main' }] }));
  for (const r of playHints(sim, packOf(levels))) ok(r.state === 'win' && r.pct >= 80, `บอทชนะ ${r.id} ด้วย ≥ 80%`, `${r.state} ${r.code} ${r.pct}% ${r.time} วิ`);
}

// ---------- approach locking (2.10) ----------
{
  const lv = { id: 'al', station: 'fictional-crossing-1-loop', name: 'al', goal: 'x', speed: 60, waitGrace: 20, tips: [], trains: [{ at: 1, from: 'W', to: 'E', track: 'loop1' }] };
  for (const era of [2, 1]) {
    const { g, last } = game([{ ...lv, era }]);
    ok(until(g, () => g.trains[0] && g.trains[0].stopped, 20), `ยุค ${era}: ขบวนจอดรอหน้า S1`);
    sim.press(g, { kind: 'point', id: 'P1' }); sim.press(g, { kind: 'signal', id: 'S1' });
    sim.press(g, { kind: 'signal', id: 'S1' });
    ok(g.S.S1.aspect === 'R', `ยุค ${era}: ยกเลิกแล้ว S1 กลับห้ามทันที`);
    const refused = !sim.press(g, { kind: 'point', id: 'P1' });
    if (era === 2) {
      ok(refused && last().code === 'APPROACH_LOCKED', 'ยุคไฟสี: ประแจยังล็อก APPROACH_LOCKED', last().code);
      ok(!sim.press(g, { kind: 'signal', id: 'S1' }) && last().code === 'APPROACH_LOCKED', 'ยุคไฟสี: ตั้งทางทับเส้นทางที่ยังล็อกไม่ได้');
      ok(g.trains[0].edge === g.trains[0].entry, 'ขบวนยังหยุดหน้า S1 ระหว่างหน่วงเวลา');
      run(g, sim.T_CANCEL + 0.1);
      ok(sim.press(g, { kind: 'point', id: 'P1' }), `ครบ ${sim.T_CANCEL} วินาที ประแจกลับได้`);
    } else ok(!refused, 'ยุคอินเตอร์ล็อกกล: ไม่มีหน่วงเวลา ประแจกลับได้ทันที');
  }
  // ไม่มีขบวนเข้าใกล้ = คืนทันที
  const { g } = game([{ ...lv, era: 2, trains: [{ at: 60, from: 'W', to: 'E', track: 'loop1' }] }]);
  sim.press(g, { kind: 'point', id: 'P1' }); sim.press(g, { kind: 'signal', id: 'S1' }); sim.press(g, { kind: 'signal', id: 'S1' });
  ok(sim.press(g, { kind: 'point', id: 'P1' }), 'ยุคไฟสี ไม่มีขบวนเข้าใกล้: ยกเลิกแล้วคืนทันที');
}

if (fails) { console.error(`\nไม่ผ่าน ${fails}/${checks}`); process.exit(1); }
console.log(`token-test: ผ่านทั้งหมด ${checks} ข้อ`);
