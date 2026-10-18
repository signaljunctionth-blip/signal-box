// เทสต์ตัวจำลองส่วนสองทิศ (M1 ขั้น B) ใน Node ล้วน — ใช้: node test/sim2-test.mjs
// ผัง schema 2, ตารางขบวนแบบ object, อินเตอร์ล็อกสองทิศ + overlap + ตอนทางเดี่ยว, กลับหัว, ชุมทาง, บอทตามคำใบ้
// หมายเลข T01–T25 อ้างตาราง docs/SIGNALLING-RULES.md ข้อ 7
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import * as sim from '../src/sim/index.js';
import { createSave, memoryBackend } from '../src/save/index.js';

const require = createRequire(import.meta.url);
const { playHints, PROTOTYPE_PCT } = require('./lib/bot.js');
const root = path.resolve(import.meta.dirname, '..');
const readJson = f => JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));

let fails = 0, checks = 0;
const ok = (cond, name, detail = '') => { checks++; if (!cond) { fails++; console.error(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); } };
const same = (a, b, name) => { const x = JSON.stringify(a), y = JSON.stringify(b); ok(x === y, name, x === y ? '' : `ได้ ${x.slice(0, 300)} แต่ควรเป็น ${y.slice(0, 300)}`); };
const section = s => console.log(`\n== ${s}`);

const stationJson = fs.readdirSync(path.join(root, 'data/stations')).filter(f => f.endsWith('.json')).sort().map(f => ({ name: f, json: readJson('data/stations/' + f) }));
const { stations, errors: stationErrors } = sim.loadStations(stationJson);
const testJson = readJson('data/levels/test-crossing.json');
const X = 'fictional-crossing-1-loop', TM = 'fictional-terminus-2-tracks', JN = 'fictional-junction-3-legs';
const NONE = 0, MECH = 1, TC = 2, NX = 3; // ลำดับยุคใน test-crossing.json

section('ผังและชุดด่านทดสอบโหลดได้');
same(stationErrors, {}, 'ผังทุกไฟล์ผ่านตัวตรวจ');
const packRes = sim.loadLevelPack(testJson, stations, stationErrors);
ok(packRes.ok, 'ชุดด่าน test-crossing ผ่านตัวตรวจ', (packRes.errors || []).join(' | '));
if (!packRes.ok) process.exit(1);
const pack = packRes.pack;
ok(pack.levels.every(l => !l.error), 'ทุกด่านเล่นได้', pack.levels.map(l => l.error).filter(Boolean).join(' | '));
{
  const L = stations[X];
  ok(L.bidir && L.upDir === 'E' && Object.keys(L.E).length === 20, 'ผังสองทิศ: ราง 10 เส้น = ขอบรางมีทิศ 20 เส้น');
  same(Object.values(L.sections).filter(s => s.kind === 'throat').map(s => s.tracks), [['ap', 'b', 'c'], ['bp', 'x1', 'x2']], 'ตอนคอสถานีสองฝั่งตรงกับข้อ 1.3 (ZW, ZE)');
  same(Object.keys(L.portals), ['W', 'E'], 'มีขา W และ E');
  ok(L.portals.W.entry === 'bw' && L.portals.W.exit === 'bw~' && L.portals.E.entry === 'be~' && L.portals.E.exit === 'be', 'ขาเข้า/ขาออกของแต่ละขาเป็นรางเส้นเดียวกันคนละทิศ');
  ok(L.P.P1.facing === true && L.P.P1.stem === 'ap' && L.P.P2.facing === false && L.P.P2.stem === 'bp', 'ประแจ 3 ขา: หาโคนประแจเองจากผัง');
  ok(L.S.S2.dir === 'W' && L.S.S2.edge === 'be~' && L.S.U1.edge === 'k1~' && L.S.S1.label === 'S1', 'สัญญาณสองทิศ และ label เริ่มต้น = id');
  same(L.E.k1.ovl, ['bp', 'x1', 'x2'], 'overlap ของทางเข้า K1 จากฝั่ง W = คอสถานีฝั่ง E ทั้งตอน');
  same(L.rolePlat, { main: 2, loop1: 1 }, 'บทบาททาง main/loop1 จับคู่กับเลขทาง');
}

/* ---------- เครื่องมือ ---------- */
// สร้างเกม 1 ด่านจากตารางขบวนที่กำหนดเอง
function play(station, era, trains, extra = {}) {
  const j = { schema: 2, id: 'adhoc', eras: testJson.eras, levels: [{ id: 'a', station, era, name: 'ทดสอบ', goal: 'ทดสอบ', speed: 60, tips: [], trains, ...extra }] };
  const r = sim.loadLevelPack(j, stations, stationErrors);
  if (!r.ok || r.pack.levels[0].error) throw new Error((r.errors || [r.pack.levels[0].error]).join(' | '));
  const events = [], g = sim.createGame(r.pack, 0, { onEvent: ev => events.push(ev) });
  sim.startGame(g);
  return { g, events };
}
const DT = 0.05;
const run = (g, sec) => { for (let n = Math.round(sec / DT); n > 0 && g.state === 'play'; n--) sim.step(g, DT); };
const until = (g, cond, max = 120) => { for (let n = Math.round(max / DT); n > 0 && g.state === 'play' && !cond(); n--) sim.step(g, DT); return cond(); };
const train = (g, id) => g.trains.find(t => t.id === id);
const waitingAt = (g, id, sig) => { const t = train(g, id); return !!t && t.stopped && g.E[t.edge].sig === sig; };
const ready = (g, id) => { const t = train(g, id); return !!t && t.state === 'ready' && t.stopped; };
const code = g => g.lastCode;
const W1E = { at: 1, from: 'W', to: 'E', track: 'loop1' }, E3W = { at: 3, from: 'E', to: 'W', track: 'main' };

section('ตารางอินเตอร์ล็อก 1 ทางหลีกสองทิศ ตรงกับข้อ 8 และสมมาตร');
{
  const R = { E1: ['S1', 1], E2: ['S1', 2], W1: ['S2', 1], W2: ['S2', 2], DE1: ['T1'], DE2: ['T2'], DW1: ['U1'], DW2: ['U2'] };
  const want = { E1: 'E2 W1 W2 DE2 DW1 DW2', E2: 'E1 W1 W2 DE1 DW1 DW2', W1: 'E1 E2 W2 DE1 DE2 DW2', W2: 'E1 E2 W1 DE1 DE2 DW1',
    DE1: 'E2 W1 W2 DE2', DE2: 'E1 W1 W2 DE1', DW1: 'E1 E2 W2 DW2', DW2: 'E1 E2 W1 DW1' };
  const routeOf = (g, [sig, plat]) => (plat ? g.L.routes[sig].find(r => r.plat === plat) : g.L.routes[sig][0]);
  const got = {};
  for (const a in R) {
    got[a] = [];
    for (const b in R) {
      if (a === b) continue;
      const { g } = play(X, NX, [{ at: 900, from: 'W', to: 'E', track: 'main' }]); // ยุค NX: ระบบกลับประแจที่ล็อกด้วย overlap ของทางเข้ารางเดียวกันให้เอง
      ok(sim.setRoute(g, R[a][0], routeOf(g, R[a])) === true, `ตั้ง ${a} บนผังว่างได้`);
      if (sim.canRoute(g, R[b][0], routeOf(g, R[b]))) got[a].push(b);
    }
    same(got[a].join(' '), want[a], `${a} ขัดกับ ${want[a]}`);
  }
  ok(Object.keys(R).every(a => got[a].every(b => got[b].includes(a))), 'ตารางสมมาตร (X ขัด Y แล้ว Y ขัด X)');
}

section('T01–T08 หลีกขบวนในยุคไฟสี + วงจรตอนราง');
{
  const { g, events } = play(X, TC, [W1E, E3W], { waitGrace: 60 });
  until(g, () => waitingAt(g, 1, 'S1'));
  ok(waitingAt(g, 1, 'S1'), 'T20 ขบวน 1 หยุดเองหน้าเสาเข้า S1 ที่ห้าม');
  sim.tapPoint(g, 'P1');
  ok(sim.tapSignal(g, 'S1') === true && g.S.S1.aspect === 'G', 'T01 P1→R แตะ S1 ได้');
  ok(g.P.P1.lock && g.P.P1.pos === 'R' && g.lockOf.ap && g.lockOf.b && g.lockOf.k1 && g.lockOf['k1~'], 'T01 P1 ล็อกท่า R, ZW และ K1 ถูกจอง (ทั้งสองทิศของรางเดียวกัน)');
  ok(g.ovlOf.bp && g.ovlOf.x1 && !g.ovlOf.x2 && g.P.P2.ovl && g.P.P2.pos === 'R', 'T01 ทางหยุดเลยจาก K1 (x1, bp) ถูกกันเป็น overlap และระบบตั้ง P2 ไปท่า R (ขา x1) ให้แล้วล็อก ไม่ใช่ล็อกท่า N ที่สวนทาง');
  ok(/ระบบตั้งประแจปลายไกล P2 ให้ด้วย/.test(events.filter(e => e.type === 'msg').pop().text), 'T01 ข้อความบอกว่าระบบตั้งประแจปลายไกลให้');
  ok(sim.tapPoint(g, 'P1') === false && code(g) === 'POINT_LOCKED' && g.P.P1.pos === 'R', 'T07 แตะ P1 ที่ล็อกในเส้นทาง = POINT_LOCKED');
  ok(sim.tapSignal(g, 'S2') === false && code(g) === 'OVERLAP_HELD' && g.S.S2.aspect === 'R', 'T02 แตะ S2 ขณะขบวนแรกยังไม่จอด = OVERLAP_HELD', code(g));
  ok(/รอระยะเผื่อหยุดเลยของขบวนก่อนหน้า \(ทางของ S1\) คืนก่อน/.test(events.filter(e => e.type === 'msg').pop().text), 'T02 ข้อความบอกให้รอระยะเผื่อหยุดเลยของขบวนก่อนหน้าคืน');
  ok(sim.tapPoint(g, 'P2') === false && code(g) === 'POINT_LOCKED', 'T03 กลับ P2 เพื่อรับสวนเข้ารางเดียวกันไม่ได้ (POINT_LOCKED)');
  until(g, () => g.S.S1.aspect === 'R');
  ok(g.routes.length === 1 && g.routes[0].passed, 'T08 หัวขบวนผ่าน S1: สัญญาณกลับห้าม เส้นทางยังค้าง');
  ok(sim.tapSignal(g, 'S1') === false && code(g) === 'ROUTE_CONFLICT' && g.routes.length === 1, 'T08 ยกเลิกไม่ได้หลังหัวขบวนผ่านสัญญาณ');
  ok(sim.tapPoint(g, 'P1') === false && ['POINT_LOCKED', 'POINT_OCCUPIED'].includes(code(g)), 'T08 ประแจใต้ขบวนกลับไม่ได้');
  until(g, () => !g.routes.length);
  ok(!sim.onTrack(g, train(g, 1), 'ap') && !sim.onTrack(g, train(g, 1), 'b'), 'T08 เส้นทางคืนเองเมื่อท้ายขบวนพ้น ZW');
  ok(g.overlaps.length === 1, 'เส้นทางคืนแล้ว แต่ overlap ยังค้างจนขบวนจอดสนิท');
  until(g, () => !g.overlaps.length);
  const t1 = train(g, 1);
  ok(t1.stopped && t1.edge === 'k1' && t1.state !== 'arriving', 'T04 overlap คืนหลังขบวน 1 จอดนิ่งใน K1 ครบ T_OVL');
  until(g, () => waitingAt(g, 2, 'S2') && ready(g, 1));
  same(sim.blockState(g, 'E').state + '/' + sim.blockState(g, 'E').dir, 'occupied/in', 'ขบวน 2 ที่รอนอก S2 ยังครองตอนฝั่ง E');
  ok(g.P.P2.pos === 'R' && sim.tapSignal(g, 'T1') === false && code(g) === 'BLOCK_NOT_FREE', 'T05 ปล่อยขบวน 1 ออกไปหาขบวนที่กำลังมา = BLOCK_NOT_FREE (P2 อยู่ท่า R แล้วจากทางเผื่อหยุดเลย)', code(g));
  ok(/มีขบวนกำลังมา/.test(events.filter(e => e.type === 'msg').pop().text), 'T05 ข้อความบอกว่าตอนฝั่งนั้นมีขบวนกำลังมา');
  sim.tapPoint(g, 'P2');
  ok(sim.tapSignal(g, 'S2') === true && g.P.P1.ovl && g.ovlOf.ap && g.P.P1.pos === 'N', 'T04 รับขบวน 2 เข้า K2 ได้ ระบบตั้ง P1 กลับท่า N (ขาจาก K2) แล้วล็อกด้วย overlap ของเส้นทางใหม่');
  const t2 = train(g, 2);
  until(g, () => t2.edge === 'k2~' && t2.s > 100);
  ok(!t2.stopped && g.S.T2.aspect === 'R', 'T21 ขบวนทิศ W วิ่งผ่านตำแหน่งเสาออก T2 (ทิศ E) ที่ห้ามโดยไม่หยุด');
  until(g, () => !g.routes.length && !g.overlaps.length && ready(g, 2));
  ok(sim.blockFree(g, 'E') && sim.blockFree(g, 'W'), 'ขบวน 2 เข้าพ้นคอสถานี: ตอนฝั่ง E ว่าง');
  ok(sim.tapPoint(g, 'P2') && sim.tapSignal(g, 'T1') === true, 'T06 P2→R แตะ T1 ได้');
  same(sim.blockState(g, 'E').state, 'permit', 'T06 ตอนฝั่ง E = permit(out)');
  ok(g.P.P1.pos === 'N' && sim.tapSignal(g, 'U2') === true, 'T06 P1 อยู่ท่า N แล้ว (จากทางเผื่อหยุดเลยของขบวน 2) แตะ U2 ได้พร้อมกัน (เส้นทางออกคนละฝั่งไม่ขัดกัน)');
  until(g, () => train(g, 1) && train(g, 1).edge === 'be');
  same(sim.blockState(g, 'E').state + '/' + sim.blockState(g, 'E').dir, 'occupied/out', 'T06 ขบวนเข้าตอน = occupied(out)');
  until(g, () => g.done === 1);
  const tOut = g.time;
  ok(!sim.blockFree(g, 'E'), 'T12 ท้ายขบวนพ้นจอแล้ว ตอนยังไม่ว่าง');
  until(g, () => g.state !== 'play');
  ok(g.state === 'win' && g.result.score === 300, 'เล่นตามลำดับที่ถูกจนชนะ ได้คะแนนเต็ม 300', JSON.stringify(g.result));
  ok(!events.some(e => e.type === 'fail'), 'ไม่มีเหตุ');
  const blockEv = events.filter(e => e.type === 'block' && e.portal === 'E').map(e => e.state + (e.dir ? '/' + e.dir : ''));
  same(blockEv, ['occupied/in', 'free', 'permit/out', 'occupied/out'], 'event block ของขา E เรียงตามจริง');
  ok(tOut > 0, 'จดเวลาออก');
}
{
  const { g } = play(X, TC, [{ at: 1, from: 'W', to: 'E', track: 'main' }, { at: 40, from: 'E', to: 'W', track: 'main' }]);
  until(g, () => waitingAt(g, 1, 'S1')); sim.tapSignal(g, 'S1');
  until(g, () => ready(g, 1) && !g.overlaps.length); sim.tapSignal(g, 'T2');
  until(g, () => g.done === 1);
  const t0 = g.time; run(g, 7.5);
  same(sim.blockState(g, 'E').dir, 'out', 'T12 ตอนฝั่ง E ยังเป็น occupied(out) จนครบ runTime');
  run(g, 1);
  ok(sim.blockFree(g, 'E') && g.time - t0 > 8, 'T12 ครบ runTime 8 วินาทีแล้วตอนว่าง');
}

section('T10–T11 ขบวนด่วนผ่าน: เส้นทางออกทิศเดียวกันแทน overlap');
{
  const exp = [{ at: 1, from: 'W', to: 'E', track: 'main', type: 'express' }];
  const { g, events } = play(X, TC, exp);
  until(g, () => waitingAt(g, 1, 'S1'));
  ok(sim.tapSignal(g, 'S1') && g.overlaps.length === 1, 'T10 แตะ S1: จอง overlap ที่ ZE');
  ok(sim.tapSignal(g, 'T2') === true && g.overlaps.length === 0, 'T10 แตะ T2 ต่อ: อนุญาต และ overlap หมดไป');
  until(g, () => g.state !== 'play');
  ok(g.state === 'win' && g.result.score === 150 && !g.overlaps.length && !g.routes.length, 'T10 ขบวนด่วนผ่านไม่หยุด ได้ 150 ไม่มีอะไรค้าง', JSON.stringify(g.result));
  ok(events.some(e => e.type === 'score' && e.reason === 'express' && e.delta === 150), 'event score ของขบวนด่วน');

  const b = play(X, TC, exp).g;
  until(b, () => waitingAt(b, 1, 'S1'));
  ok(sim.tapSignal(b, 'T2') && sim.blockState(b, 'E').state === 'permit', 'ตั้งเสาออก T2 รอไว้ก่อน: ได้ทางสะดวกฝั่ง E');
  ok(sim.tapSignal(b, 'S1') && b.overlaps.length === 0, 'แล้วแตะ S1: ไม่ต้องจอง overlap');
  ok(sim.tapSignal(b, 'T2') === true && b.S.T2.aspect === 'R' && sim.blockFree(b, 'E'), 'T11 ยกเลิก T2 ก่อนขบวนผ่าน: ตอนฝั่ง E กลับเป็น free');
  ok(b.overlaps.length === 1 && b.ovlOf.x2 && b.P.P2.ovl, 'ยกเลิกเสาออกที่ตั้งรอขบวนผ่าน: overlap กลับไปเป็นของเส้นทางรับเข้า');
  ok(sim.tapSignal(b, 'S2') === false && code(b) === 'OVERLAP_HELD', 'ระหว่างนั้นรับขบวนสวนไม่ได้ (overlap ค้าง)', String(code(b)));
}

section('T13 ยุคอินเตอร์ล็อกกล: กติกาเดียวกัน');
{
  const { g } = play(X, MECH, [W1E, E3W]);
  until(g, () => waitingAt(g, 1, 'S1') && waitingAt(g, 2, 'S2'));
  sim.tapPoint(g, 'P1');
  ok(sim.tapSignal(g, 'S1') === false && code(g) === 'OVERLAP_POINT_NOT_SET' && g.S.S1.aspect === 'R' && g.P.P2.pos === 'N', 'T13 ยุคกล: P2 ปลายไกลยังตั้งสวนทาง = ไม่ให้สัญญาณ และไม่มีใครสับให้', String(code(g)));
  ok(sim.tapPoint(g, 'P2') === true && sim.tapSignal(g, 'S1') === true && g.P.P2.ovl, 'T13 ผู้เล่นสับ P2 ไปท่า R เองแล้วแตะ S1 ได้ P2 ถูกล็อกด้วย overlap');
  ok(sim.tapSignal(g, 'S2') === false && code(g) === 'OVERLAP_HELD', 'T13 รับเข้าคนละรางพร้อมกันไม่ได้ (รับทีละขบวน)');
  ok(sim.tapPoint(g, 'P2') === false && g.S.S2.aspect === 'R', 'T13 และตั้งทางเข้ารางเดียวกันไม่ได้');
}

section('T14–T19 ยุคไม่มีอินเตอร์ล็อก: พลาดแล้วเกิดเหตุจริง');
{
  const { g } = play(X, NONE, [W1E, { at: 1, from: 'E', to: 'W', track: 'loop1' }]);
  until(g, () => waitingAt(g, 1, 'S1') && waitingAt(g, 2, 'S2'));
  sim.tapPoint(g, 'P1'); sim.tapPoint(g, 'P2');
  ok(sim.tapSignal(g, 'S1') && sim.tapSignal(g, 'S2') && g.S.S1.aspect === 'G' && g.S.S2.aspect === 'G' && !g.routes.length, 'T14 เปิดเสาเข้าสองทิศเข้ารางเดียวกันได้ ไม่มีอะไรห้าม');
  until(g, () => false, 30);
  ok(g.state === 'fail' && g.result.code === 'HEAD_ON' && /ชนประสานงา/.test(g.result.why) && g.result.lesson === g.era.lesson, 'T14 สองขบวนเข้า K1 = HEAD_ON', JSON.stringify(g.result));
}
{
  const { g } = play(X, NONE, [{ at: 1, from: 'W', to: 'E', track: 'main' }, { at: 12, from: 'W', to: 'E', track: 'main' }]);
  until(g, () => waitingAt(g, 1, 'S1')); sim.tapSignal(g, 'S1');
  until(g, () => waitingAt(g, 2, 'S1')); sim.tapSignal(g, 'S1');
  until(g, () => false, 30);
  ok(g.state === 'fail' && g.result.code === 'REAR_END', 'T15 รับเข้ารางที่มีรถจอด = REAR_END', JSON.stringify(g.result));
}
{
  const { g } = play(X, NONE, [W1E]);
  until(g, () => waitingAt(g, 1, 'S1')); sim.tapPoint(g, 'P1'); sim.tapSignal(g, 'S1');
  until(g, () => ready(g, 1)); sim.tapSignal(g, 'T1');
  until(g, () => false, 30);
  ok(g.state === 'fail' && g.result.code === 'RUN_THROUGH' && g.result.title === 'รถฝ่าประแจ!', 'T16 ออกจาก K1 ขณะ P2 อยู่ N = RUN_THROUGH (ไม่ใช่ตกราง)', JSON.stringify(g.result));
}
{
  const a = play(X, NONE, [W1E]).g;
  until(a, () => waitingAt(a, 1, 'S1')); sim.tapSignal(a, 'S1');
  until(a, () => sim.nearPoint(a, a.P.P1)); sim.tapPoint(a, 'P1');
  ok(a.state === 'fail' && a.result.code === 'DERAIL_UNDER' && a.result.title === 'ตกราง!', 'T17 กลับประแจใต้ขบวน (ไม่มีอินเตอร์ล็อก) = DERAIL_UNDER', JSON.stringify(a.result));
  const b = play(X, MECH, [W1E]).g;
  until(b, () => waitingAt(b, 1, 'S1')); sim.tapSignal(b, 'S1');
  until(b, () => sim.nearPoint(b, b.P.P1));
  ok(sim.tapPoint(b, 'P1') === false && b.state === 'play' && b.P.P1.pos === 'N', 'T17 ยุคที่มีอินเตอร์ล็อก การกระทำเดียวกันถูกปฏิเสธ ไม่มีเหตุ');
  b.P.P1.lock = null; // ถอดล็อกเส้นทางออก เหลือแต่การตรวจรถในตอนคอสถานี
  ok(sim.tapPoint(b, 'P1') === false && code(b) === 'POINT_OCCUPIED', 'ประแจที่มีรถอยู่ในตอนคอสถานีเดียวกัน = POINT_OCCUPIED');
}
{
  // ทำตามตัวอักษรของ T18 ไม่ได้ (กลับ P2 ขณะ B อยู่ใน ZE จะเป็น DERAIL_UNDER ก่อน) จึงปล่อย P2 ที่ N แล้วแตะ T1 ให้ A วิ่งเข้าขาแยกไปเบียด B
  const { g } = play(X, NONE, [W1E, { at: 16, from: 'E', to: 'W', track: 'main' }]);
  until(g, () => waitingAt(g, 1, 'S1')); sim.tapPoint(g, 'P1'); sim.tapSignal(g, 'S1');
  until(g, () => ready(g, 1) && !!train(g, 2)); sim.tapSignal(g, 'S2');
  until(g, () => train(g, 2).edge === 'be~' && train(g, 2).s >= 110); sim.tapSignal(g, 'T1');
  until(g, () => false, 30);
  ok(g.state === 'fail' && g.result.code === 'SIDE' && /ชนสีข้าง/.test(g.result.why), 'T18 ปล่อย A ออกไปเบียด B ที่ประแจ = SIDE', JSON.stringify(g.result));
}
{
  const { g } = play(X, NONE, [{ at: 1, from: 'W', to: 'E', track: 'main' }, { at: 34, from: 'E', to: 'W', track: 'main' }]);
  until(g, () => waitingAt(g, 1, 'S1')); sim.tapSignal(g, 'S1');
  until(g, () => sim.blockState(g, 'E').dir === 'in');
  ok(ready(g, 1) && !train(g, 2), 'T19 ตอนฝั่ง E = occupied(in) ขบวนสวนยังไม่โผล่');
  ok(sim.tapSignal(g, 'T2') === true, 'T19 ยุคนี้เปิดเสาออกได้ทั้งที่ตอนไม่ว่าง');
  until(g, () => false, 30);
  ok(g.state === 'fail' && g.result.code === 'HEAD_ON_BLOCK', 'T19 ปล่อยเข้าตอนที่มีขบวนสวนมา = HEAD_ON_BLOCK', JSON.stringify(g.result));
}

section('T22 ทางตัน');
{
  const E2 = (at, track) => ({ at, from: 'W', to: 'E', track });
  const { g } = play(X, TC, [E2(1, 'loop1'), E2(14, 'main'), { at: 22, from: 'E', to: 'W', track: 'main' }]);
  until(g, () => waitingAt(g, 1, 'S1')); sim.tapPoint(g, 'P1'); sim.tapSignal(g, 'S1');
  until(g, () => waitingAt(g, 2, 'S1') && !g.overlaps.length && !g.routes.length); sim.tapPoint(g, 'P1');
  ok(sim.tapSignal(g, 'S1') === true, 'รับขบวน 2 เข้า K2 (ตอนนี้ทุกรางจอดมีขบวนที่จะไปฝั่ง E)', String(code(g)));
  until(g, () => false, 90);
  ok(g.state === 'fail' && g.result.code === 'DEADLOCK' && /ลำดับ/.test(g.result.lesson), 'T22 K1 และ K2 เต็ม ขบวนสวนรออยู่นอก S2 = DEADLOCK ไม่ค้างตลอดไป', JSON.stringify(g.result));
}

section('T23 ยุค NX และชุมทาง 3 ขา');
{
  const { g } = play(X, NX, [W1E]);
  until(g, () => waitingAt(g, 1, 'S1'));
  ok(sim.tapPoint(g, 'P1') === false && g.P.P1.pos === 'N', 'T23 ผู้เล่นแตะประแจเองไม่ได้');
  sim.press(g, { kind: 'signal', id: 'S1' });
  ok(g.nxSel === 'S1' && g.S.S1.aspect === 'R', 'T23 แตะ S1 = เลือกต้นทาง');
  ok(sim.press(g, { kind: 'platform', no: 1 }) === true && g.P.P1.pos === 'R' && g.P.P1.lock && g.S.S1.aspect === 'G', 'T23 แตะราง K1: ระบบกลับ P1 เป็น R ล็อก และอนุญาต');
}
{
  const { g, events } = play(JN, NX, [{ at: 1, from: 'A', to: 'C', track: 't1' }]);
  same(Object.keys(g.L.portals), ['A', 'B', 'C'], 'ชุมทาง: ขา A, B, C');
  same(g.L.routes.T2.map(r => r.portal), ['B', 'C'], 'เสาออก T2 มี 2 เส้นทาง (ไปขา B หรือ C)');
  until(g, () => waitingAt(g, 1, 'SA'));
  sim.press(g, { kind: 'signal', id: 'SA' }); sim.press(g, { kind: 'platform', no: 2 });
  until(g, () => ready(g, 1) && !g.overlaps.length);
  sim.press(g, { kind: 'signal', id: 'T2' });
  ok(g.nxSel === 'T2', 'เสาออกที่ไปได้หลายขา ต้องเลือกปลายทาง');
  ok(sim.press(g, { kind: 'portal', id: 'C' }) === true && g.P.P3.pos === 'R' && sim.blockState(g, 'C').state === 'permit' && sim.blockFree(g, 'B'), 'แตะป้ายขา C: P3 ไปทางแยก ได้ทางสะดวกเฉพาะขา C');
  until(g, () => g.state !== 'play');
  ok(g.state === 'win' && g.result.score === 150, 'ขบวนออกถูกขา ได้คะแนนเต็ม');
  ok(!events.some(e => e.type === 'score' && e.reason === 'wrong-exit'), 'ไม่มีโทษออกผิดขา');
}
{
  const { g, events } = play(JN, TC, [{ at: 1, from: 'A', to: 'C', track: 't1' }]);
  until(g, () => waitingAt(g, 1, 'SA')); sim.tapSignal(g, 'SA');
  until(g, () => ready(g, 1) && !g.overlaps.length); sim.tapSignal(g, 'T2'); // P3 อยู่ N = ไปขา B
  until(g, () => g.state !== 'play');
  ok(g.state === 'win' && g.result.score === 100 && events.some(e => e.type === 'score' && e.reason === 'wrong-exit'), 'ส่งออกผิดขา: ไม่ได้คะแนนขาออก (100 จาก 150)', JSON.stringify(g.result));
  ok(events.some(e => e.type === 'msg' && /ต้องไปด้านขา C แต่ออกด้านขา B/.test(e.text)), 'ข้อความบอกว่าออกผิดขา');
}

section('สถานีปลายทาง: กลับหัว และขบวนต้นทาง');
{
  const { g, events } = play(TM, MECH, [{ at: 1, from: 'W', to: 'W', track: 'main', dwell: 6 }]);
  until(g, () => waitingAt(g, 1, 'S1'));
  ok(sim.tapSignal(g, 'S1') === true && g.overlaps.length === 0, 'รับเข้าทางตัน: ไม่ต้องมี overlap (มีกันชนปลายราง)');
  const t = train(g, 1);
  until(g, () => t.state === 'dwell');
  ok(t.edge === 'k2' && Math.abs(t.s - (g.E.k2.len - sim.STOP_GAP)) < 0.01, 'ขบวนหยุดก่อนถึงปลายทางตัน');
  const t0 = g.time; until(g, () => t.state === 'ready');
  ok(Math.abs(g.time - t0 - 6) < 0.11, 'จอดตามเวลา dwell ที่ตารางกำหนด (6 วินาที)', String(g.time - t0));
  ok(t.edge === 'k2~' && g.E[t.edge].dir === 'W' && events.some(e => e.type === 'train' && e.what === 'reverse'), 'ครบเวลาจอดแล้วกลับหัว (from = to)');
  until(g, () => waitingAt(g, 1, 'U2'));
  ok(sim.tapSignal(g, 'U2') === true, 'ปล่อยออกทางเสาออกอีกด้านของทางจอด');
  until(g, () => g.state !== 'play');
  ok(g.state === 'win' && g.result.score === 150, 'เข้าแล้วกลับออกทางเดิม ได้คะแนนเต็ม', JSON.stringify(g.result));
}
{
  const { g } = play(TM, TC, [{ at: 0, origin: 'loop1', to: 'W', dwell: 3 }]);
  run(g, 0.1);
  const t = train(g, 1);
  ok(t && t.origin && t.edge === 'k1~' && t.state === 'dwell' && t.trail.length > 50, 'ขบวนต้นทางตั้งอยู่ที่ทางจอด หันไปทางขาออก');
  until(g, () => ready(g, 1));
  sim.tapPoint(g, 'P1'); ok(sim.tapSignal(g, 'U1') === true, 'ปล่อยขบวนต้นทางออก');
  until(g, () => g.state !== 'play');
  ok(g.state === 'win' && g.result.score === 150, 'ขบวนต้นทางออกถูกขา ได้ 150', JSON.stringify(g.result));
}
{
  const t3 = (at, track) => ({ at, from: 'W', to: 'W', track, dwell: 60 });
  const { g } = play(TM, MECH, [t3(1, 'loop1'), t3(16, 'main'), t3(32, 'loop1')]);
  until(g, () => waitingAt(g, 1, 'S1')); sim.tapPoint(g, 'P1'); sim.tapSignal(g, 'S1');
  until(g, () => waitingAt(g, 2, 'S1') && !g.routes.length); sim.tapPoint(g, 'P1'); sim.tapSignal(g, 'S1');
  until(g, () => false, 200);
  ok(g.state === 'fail' && g.result.code === 'DEADLOCK', 'ปลายทางเต็มทุกทางและมีขบวนรอเข้า = DEADLOCK (ภารกิจ NT2)', JSON.stringify(g.result));
}

section('ตารางขบวนแบบ object: after, pointsLocked, waitGrace, label');
{
  const { g } = play(X, NONE, [{ at: 1, from: 'W', to: 'E', track: 'main' }, { after: { train: 1, event: 'cleared', delay: 3 }, from: 'W', to: 'E', track: 'main' }], { pointsLocked: true });
  ok(sim.tapPoint(g, 'P1') === false && code(g) === 'POINTS_FIXED' && g.P.P1.pos === 'N', 'pointsLocked: แตะประแจไม่ได้');
  until(g, () => waitingAt(g, 1, 'S1')); sim.tapSignal(g, 'S1');
  until(g, () => ready(g, 1)); run(g, 20);
  ok(g.trains.length === 1 && g.pend.length === 1, 'after: ขบวน 2 ยังไม่มาจนกว่าขบวน 1 จะพ้นจอ (จังหวะตามผู้เล่น)');
  sim.tapSignal(g, 'T2'); until(g, () => g.done === 1);
  const c = g.time; until(g, () => !!train(g, 2));
  ok(Math.abs(g.time - c - 3) < 0.11, 'after: ขบวน 2 เข้ามา 3 วินาทีหลังขบวน 1 พ้นจอ', String(g.time - c));
}
{
  const one = [{ at: 1, from: 'W', to: 'E', track: 'main' }];
  const a = play(X, TC, one).g, b = play(X, TC, one, { waitGrace: 20 }).g, c = play(X, TC, one, { waitGrace: { entry: 20, ready: 12 } }).g;
  for (const g of [a, b, c]) { until(g, () => waitingAt(g, 1, 'S1')); run(g, 15); }
  ok(a.score < -20 && b.score === 0 && c.score === 0, 'waitGrace: รอเสาเข้า 15 วินาที เสียคะแนนเฉพาะด่านที่ไม่ผ่อนเวลา', `${a.score} ${b.score} ${c.score}`);
  for (const g of [b, c]) { sim.tapSignal(g, 'S1'); until(g, () => ready(g, 1)); run(g, 15); }
  ok(b.score === 100 && c.score < 100 && c.score > 85, 'waitGrace แบบ { entry, ready }: ผ่อนตอนพร้อมออกแยกจากตอนรอเข้า', `${b.score} ${c.score}`);
}
{
  const j = structuredClone(stationJson.find(s => s.json.id === X).json); j.id = 'x-label'; j.layout.signals.S1.label = 'ข.2';
  const r = sim.loadStation(j);
  ok(r.ok && r.station.S.S1.label === 'ข.2', 'ชื่อที่แสดงของเสามาจาก label แยกจาก id');
  const p = sim.loadLevelPack({ schema: 2, id: 'l', eras: testJson.eras, levels: [{ id: 'a', station: 'x-label', era: TC, name: 'n', goal: 'g', speed: 60, tips: [], trains: [W1E] }] }, { 'x-label': r.station });
  const ev = [], g = sim.createGame(p.pack, 0, { onEvent: e => ev.push(e) }); sim.startGame(g);
  sim.tapSignal(g, 'S1'); sim.tapSignal(g, 'S1');
  ok(ev.some(e => e.type === 'msg' && e.text === 'ยกเลิกสัญญาณ ข.2'), 'ข้อความใช้ชื่อจาก label');
}

section('T24 ตัวตรวจผัง schema 2 ตีกลับผังผิดพร้อมเหตุผล');
{
  const good = () => structuredClone(stationJson.find(s => s.json.id === X).json);
  const bad = [
    ['ไม่มี upDir', j => { delete j.upDir; }, /^upDir:/],
    ['ใช้ edges ใน schema 2', j => { j.layout.edges = {}; }, /^layout\.edges: schema 2 ใช้ layout\.tracks/],
    ['เขียนจุดจากขวาไปซ้าย', j => { j.layout.tracks.c.pts.reverse(); }, /^layout\.tracks\.c\.pts: ต้องเขียนจุดจากซ้ายไปขวา/],
    ['ปลายรางไม่ต่อกับอะไร', j => { j.layout.tracks.k1.pts[1] = [630, 210]; }, /ปลายรางที่ \(630, 210\) ไม่ต่อกับอะไร/],
    ['ราง 3 เส้นบรรจบแต่ไม่ประกาศประแจ', j => { delete j.layout.points.P2; }, /มีราง 3 เส้นมาบรรจบ .* ต้องประกาศประแจ/],
    ['ประแจชี้ขาผิด', j => { j.layout.points.P1.N = 'ap'; }, /^layout\.points\.P1: N และ R ต้องเป็นรางขาแยก/],
    ['ประแจไม่อยู่บนปลายราง', j => { j.layout.points.P1.x = 200; }, /ไม่มีปลายรางอยู่ที่ \(200, 300\)/],
    ['ราง 4 เส้นบรรจบ', j => { j.layout.tracks.z = { pts: [[100, 400], [190, 300]] }; j.layout.buffers = ['z']; }, /รองรับเฉพาะรางต่อกัน 2 เส้น หรือประแจ 3 ขา/],
    ['ทางจอดสั้นกว่าขบวน', j => { j.layout.tracks.k1.pts = [[360, 210], [430, 210]]; j.layout.tracks.x1.pts[0] = [430, 210]; }, /ราง k1 ยาว 70 สั้นกว่าขบวน/],
    ['ทางจอดไม่มีเสาออกทิศ W', j => { delete j.layout.signals.U1; }, /ทางจอด k1 ต้องมีสัญญาณออกทิศ W/],
    ['ขาเข้าไม่มีเสาเข้า', j => { delete j.layout.signals.S2; }, /^layout\.portals\.E: ขา E รับรถเข้าได้ ต้องมีสัญญาณเข้าเขต/],
    ['เสาออกล้ำหลักเขตปลอดภัย', j => { delete j.layout.tracks.x2; j.layout.tracks.k2.pts = [[360, 300], [810, 300]]; j.layout.points.P2.N = 'k2'; }, /^layout\.signals\.T2: เสาอยู่ล้ำหลักเขตปลอดภัยของประแจ P2/],
    ['สัญญาณหันออกนอกผัง', j => { j.layout.signals.Z = { track: 'be', dir: 'E' }; }, /หันออกนอกผังหรือเข้าหาทางตัน/],
    ['สัญญาณซ้ำบนรางเดียวกันทิศเดียวกัน', j => { j.layout.signals.Z = { track: 'k1', dir: 'E' }; }, /ราง k1 มีสัญญาณทิศ E แล้ว/],
    ['บทบาทชี้รางที่ไม่ใช่ทางจอด', j => { j.layout.roles.bay1 = 'c'; }, /^layout\.roles\.bay1: ราง c ต้องอยู่ใน platforms/],
    ['ขาชี้รางที่ไม่มีปลายลอย', j => { j.layout.portals.E.track = 'k1'; }, /ราง k1 ต้องมีปลายลอย 1 ด้าน/],
    ['รางลอยไปไม่ถึง', j => { j.layout.tracks.q1 = { pts: [[0, 50], [100, 50]] }; j.layout.tracks.q2 = { pts: [[100, 50], [200, 50]] }; j.layout.buffers = ['q1', 'q2']; }, /^layout\.tracks\.q1: ไปไม่ถึงจากขาเข้าใดเลย/],
  ];
  for (const [name, mutate, want] of bad) {
    const j = good(); mutate(j);
    let res, threw = null; try { res = sim.loadStation(j); } catch (e) { threw = e; }
    ok(!threw, `ผังเสีย (${name}): ไม่ throw`, threw && threw.stack);
    ok(res && res.ok === false && res.errors.some(m => want.test(m)), `ผังเสีย (${name}): error อ่านรู้เรื่อง`, res && JSON.stringify(res.errors || 'ผ่านตัวตรวจ'));
  }
  ok(sim.loadStation(good()).ok, 'ผังที่ไม่ได้แก้ผ่านตัวตรวจ');
}

section('ตัวตรวจชุดด่าน schema 2');
{
  const lj = () => structuredClone(testJson), load = j => sim.loadLevelPack(j, stations, stationErrors);
  const hard = [
    [j => { delete j.levels[0].id; }, /^levels\[0\]\.id: ชุดด่าน schema 2 ต้องมี id/],
    [j => { j.levels[1].id = 'x-1'; }, /^levels\[1\]\.id: id "x-1" ซ้ำ/],
    [j => { j.levels[2].trains[1].after.train = 2; }, /^levels\[2\]\.trains\[1\]\.after\.train: ต้องเป็นเลขขบวนที่มาก่อน/],
    [j => { delete j.levels[0].trains[0].at; }, /ต้องมี "at" \(วินาที\) หรือ "after"/],
    [j => { delete j.levels[0].trains[0].track; }, /^levels\[0\]\.trains\[0\]\.track: ขบวนที่จอดต้องระบุทางจอด/],
    [j => { j.levels[0].waitGrace = { entry: 3 }; }, /^levels\[0\]\.waitGrace:/],
    [j => { j.stations[2].needStars = 99; }, /^stations\[2\]\.needStars: ต้องการ 99 ดาว แต่ก่อนถึงสถานีนี้เก็บได้มากสุด 15 ดาว/],
    [j => { j.stations.pop(); }, /ไม่อยู่ใน stations\[\]/],
  ];
  for (const [mutate, want] of hard) { const j = lj(); mutate(j); const r = load(j); ok(!r.ok && r.errors.some(m => want.test(m)), `ชุดด่านเสีย: ${want}`, JSON.stringify(r.errors || 'ผ่าน')); }
  const soft = [
    [j => { j.levels[0].trains[0].from = 'Q'; }, /ขบวน 1: ผัง .* ไม่มีขา "Q" \(มี W, E\)/],
    [j => { j.levels[0].trains[0].track = 'bay1'; }, /ไม่มีทางจอด "bay1" \(roles: main, loop1/],
    [j => { j.levels[4].trains[1].to = 'E'; }, /ไม่มีขา "E"/],
    [j => { j.levels[0].station = 'fictional-history-2-platforms'; j.stations[0].station = 'fictional-history-2-platforms'; j.levels.splice(1, 3); }, /ไม่มีขา "E" \(มี ไม่มีขาแบบมีชื่อ ต้องใช้ผัง schema 2\)/],
  ];
  for (const [mutate, want] of soft) {
    const j = lj(); mutate(j); const r = load(j), bad = r.ok && r.pack.levels.find(l => l.error);
    ok(r.ok && bad && want.test(bad.error), `ตารางขบวนอ้างสิ่งที่ผังไม่มี = ปิดเฉพาะด่านนั้น: ${want}`, r.ok ? String(bad && bad.error) : r.errors.join('|'));
  }
  // ตารางแบบเดิมยังใช้กับผังสองทิศได้ และชุดด่าน schema 1 ไม่ต้องมี id
  const j = { schema: 1, id: 'old', eras: readJson('data/levels/history.json').eras, levels: [{ era: 1, station: X, name: 'n', goal: 'g', speed: 60, tips: [], trains: { pattern: '21', gap: 30, start: 1 } }] };
  const r = load(j), g = r.ok && sim.createGame(r.pack, 0);
  ok(r.ok && !r.pack.levels[0].error && g.lv.sched[0].entry === 'bw' && g.lv.sched[0].exit === null && sim.levelKey(r.pack.levels[0]) === '0', 'รูปแบบ pattern/gap เดิมใช้กับผัง schema 2 ได้ (เข้าขาแรก ออกขาไหนก็ได้)');
}

section('ปลดล็อกสถานีและเซฟต่อ id ภารกิจ');
{
  const save = createSave(memoryBackend()), starsOf = lv => save.getBest(pack.id, sim.levelKey(lv)).stars;
  let u = sim.unlockState(pack, starsOf);
  same(u.levels.map(l => +l.open), [1, 0, 0, 0, 0, 0, 0], 'เริ่มเกม: เปิดเฉพาะภารกิจแรก');
  for (const id of ['x-1', 'x-2', 'x-3']) save.setBest(pack.id, id, { stars: 1, score: 200 });
  u = sim.unlockState(pack, starsOf);
  same(u.levels.map(l => +l.open), [1, 1, 1, 1, 0, 0, 0], 'ภารกิจในสถานีเดียวกันเปิดตามลำดับ สถานีถัดไปยังปิดจนผ่านครบ');
  save.setBest(pack.id, 'x-4', { stars: 1, score: 100 }); save.setBest(pack.id, 't-1', { stars: 1, score: 100 });
  u = sim.unlockState(pack, starsOf);
  ok(u.stations[1].open && !u.stations[2].open && u.total === 5 && u.stations[2].need === 6, 'ผ่านครบแต่ดาวสะสมไม่ถึง needStars: สถานีถัดไปยังปิด');
  save.setBest(pack.id, 'x-1', { stars: 3, score: 290 }); save.setBest(pack.id, 'x-1', { stars: 2, score: 300 });
  same(save.getBest(pack.id, 'x-1'), { stars: 3, score: 300 }, 'เซฟเก็บดาวและคะแนนที่ดีที่สุดต่อ id ภารกิจ (แยกกัน)');
  u = sim.unlockState(pack, starsOf);
  ok(u.stations[2].open && u.levels[5].open && !u.levels[6].open && save.totalStars(pack.id) === 7, 'ดาวถึงแล้วสถานีถัดไปเปิด');
  const other = createSave(memoryBackend());
  ok(other.importCode(save.exportCode()) && other.getBest(pack.id, 'x-1').score === 300 && other.hasProgress(pack.id), 'รหัสสำรองเกมพา best ไปด้วย');
  same(sim.unlockState(packH(), lv => 0).levels.map(l => +l.open).slice(0, 3), [1, 0, 0], 'ชุดด่านที่ไม่มี stations[]: เปิดเรียงตามลำดับ');
}
function packH() { return sim.loadLevelPack(readJson('data/levels/history.json'), stations, stationErrors).pack; }

section('บอทตามคำใบ้เล่นชุดด่านทดสอบ (รถสวนทาง ปลายทาง ชุมทาง)');
{
  const ev1 = [], run1 = playHints(sim, pack, { events: ev1 }), ev2 = [], run2 = playHints(sim, pack, { events: ev2 });
  console.table(run1.map(r => ({ ด่าน: r.id, ผล: r.state, ส่งออก: r.trains, '%': r.pct, วินาที: r.time, แตะ: r.taps, ถูกปฏิเสธ: r.refused })));
  for (const r of run1) {
    ok(r.state === 'win', `ด่าน ${r.id}: บอทชนะ`, `${r.state} ${r.code}`);
    ok(r.pct >= 90, `ด่าน ${r.id}: ได้ 90% ขึ้นไป`, `${r.pct}%`);
    ok(r.refused === 0, `ด่าน ${r.id}: คำใบ้ไม่เคยพาไปแตะสิ่งที่ระบบปฏิเสธ`, String(r.refused));
  }
  same(run2, run1, 'เล่นซ้ำได้ผลเดิมทุกค่า (deterministic)');
  same(ev2, ev1, 'ลำดับ event เหมือนเดิมทุกตัวเมื่อเล่นซ้ำ');
  ok(!ev1.some(e => e.type === 'fail'), 'T20 ไม่มีเหตุใดเลยตลอดการเล่นของบอท');
  ok(ev1.filter(e => e.type === 'train' && e.what === 'reverse').length === 2, 'ด่านปลายทาง: ขบวนที่เข้ามากลับหัว 2 ครั้ง (ขบวนต้นทางไม่ต้องกลับ)', String(ev1.filter(e => e.type === 'train' && e.what === 'reverse').length));
  fs.mkdirSync(path.join(root, 'test-results'), { recursive: true });
  fs.writeFileSync(path.join(root, 'test-results/sim2-bot.json'), JSON.stringify(run1, null, 2));
}

section('T25 บอทตามคำใบ้เล่น 12 ด่านเดิมได้ด้วย (คำใบ้ใช้ได้กับผังทิศเดียว)');
{
  const res = playHints(sim, packH());
  ok(res.length === 12 && res.every(r => r.state === 'win'), 'ชนะครบ 12 ด่าน', res.filter(r => r.state !== 'win').map(r => `${r.level}:${r.code}`).join(' '));
  ok(res.every((r, i) => r.pct >= PROTOTYPE_PCT[i] - 3), 'คะแนนไม่แย่กว่าบอทเดิมเกิน 3 จุด', res.map(r => r.pct).join(' '));
  ok(res.every(r => r.refused === 0), 'คำใบ้ไม่เคยพาไปแตะสิ่งที่ระบบปฏิเสธ');
}

section('ทางตันบนผังจริง: แจ้งผลชัดเจน ไม่ค้างเงียบ และคำใบ้ไม่พาเข้าทางตันเอง');
{
  const KB = 'kanchanaburi', NP = 'nong-pla-duk-jn';
  ok(stations[KB] && stations[NP], 'มีผังจริงกาญจนบุรีและชุมทางหนองปลาดุก');
  // เล่นตามคำใบ้จนจบ เก็บข้อความคำใบ้ที่เคยขึ้น
  const auto = (g, max = 400) => { const texts = new Set(); let refused = 0;
    for (let n = Math.round(max / DT); n > 0 && g.state === 'play'; n--) {
      for (let k = 0; k < 6 && g.state === 'play'; k++) { const h = sim.hint(g, { force: true }), t = sim.nextTarget(g); if (!t) break; texts.add(h.text); if (sim.press(g, t) === false) refused++; }
      sim.step(g, DT);
    }
    return { texts: [...texts], refused }; };

  // (ก) กาญจนบุรี: ขบวน 1 จอดทางประธานแล้วต้องออกไป W, ขบวน 2 จาก W ครองตอนขา W และต้องการทางประธานเหมือนกัน
  const ka = [{ at: 1, from: 'E', to: 'W', track: 'main', dwell: 4 }, { at: 6, from: 'W', to: 'E', track: 'main' }];
  {
    const { g, events } = play(KB, TC, ka);
    until(g, () => waitingAt(g, 1, 'HE')); sim.tapSignal(g, 'HE');
    until(g, () => ready(g, 1) && waitingAt(g, 2, 'HW') && !g.overlaps.length && !g.routes.length);
    ok(sim.isStatic(g) && sim.blockState(g, 'W').dir === 'in', '(ก) จำลองได้: ขบวน 1 พร้อมออกไป W แต่ขบวน 2 ครองตอนขา W และทางประธานไม่ว่าง');
    ok(sim.canRoute(g, 'XW1', g.L.routes.XW1[0]).code === 'BLOCK_NOT_FREE' && sim.canRoute(g, 'HW', g.L.routes.HW.find(r => r.plat === 1)).code === 'TRACK_OCCUPIED', '(ก) ทางที่ตารางกำหนดตั้งไม่ได้ทั้งสองขบวน');
    const h = sim.hint(g, { force: true }), esc = sim.escapeRoutes(g);
    ok(h && /ทางที่กำหนดไม่ว่าง|เปิดทางสำรอง/.test(h.text) && esc.length === 1 && esc[0].t.id === 2 && esc[0].r.plat === 2, '(ก) ยังมีทางออก: คำใบ้ชี้ให้รับขบวน 2 เข้าทางหลีกแทน', JSON.stringify(h));
    ok(!esc.some(x => x.r.track === 'bay'), '(ก) ไม่ชี้เข้าทางตัน bay1 เพราะจากที่นั่นไปขา E ไม่ได้');
    run(g, 20);
    ok(g.state === 'play', '(ก) ยังมีทางออกอยู่ เกมไม่ตัดสินทางตัน (รอผู้เล่น)');
    const a = auto(g);
    ok(g.state === 'win' && g.done === 2 && a.refused === 0, '(ก) ทำตามคำใบ้แล้วจบภารกิจได้', `${g.state} ${g.result && g.result.code}`);
    ok(events.some(e => e.type === 'score' && e.reason === 'wrong-platform' && e.train === 2) && !events.some(e => e.type === 'fail'), '(ก) ราคาของทางสำรอง: ขบวน 2 เข้าผิดทาง ได้ 20 แทน 100 ไม่มีเหตุ');
  }
  {
    const { g, events } = play(KB, TC, ka), a = auto(g);
    ok(g.state === 'win' && a.refused === 0 && !events.some(e => e.type === 'fail'), '(ก) บอทตามคำใบ้เล่นทั้งด่านเองก็ไม่ค้างและไม่แพ้', `${g.state} เวลา ${g.time.toFixed(1)}`);
  }
  {
    // ไม่มีทางออกจริง: ประแจถูกล็อกท่าตรง รับเข้าทางอื่นไม่ได้
    const { g, events } = play(KB, TC, ka, { pointsLocked: true }), a = auto(g);
    const f = events.find(e => e.type === 'fail');
    ok(g.state === 'fail' && f && f.code === 'DEADLOCK' && f.title === 'ทางตัน!' && /ลำดับ/.test(f.lesson), '(ก) ถ้าย้ายไปทางอื่นไม่ได้ = DEADLOCK พร้อมข้อความสอน', JSON.stringify(f || g.state));
    ok(g.time < 60 && a.refused === 0, '(ก) แจ้งภายในไม่กี่วินาทีหลังทุกอย่างหยุดนิ่ง', g.time.toFixed(1));
  }

  // (ข) หนองปลาดุก: ขบวน A→t3→C จอดใน t3 ขณะขบวนจากขา C ครองตอนขา C ซึ่งเข้าได้เฉพาะ t3
  same(stations[NP].routes.HC.map(r => r.track), ['k3'], '(ข) ขา C เข้าได้เฉพาะ t3');
  const nb = [{ at: 1, from: 'A', to: 'C', track: 't3', dwell: 6 }, { at: 16, from: 'C', to: 'A', track: 't3' }];
  {
    // สถานีข้างเคียงไม่ส่งขบวน 2 เข้าตอนขา C ตราบที่ t3 (ทางเดียวที่มันเข้าได้) มีขบวนที่ต้องออกขา C: ทางตันแบบนี้ผู้เล่นแก้ไม่ได้ จึงไม่ให้เกิด
    const { g, events } = play(NP, NX, nb);
    until(g, () => waitingAt(g, 1, 'HA')); sim.press(g, { kind: 'signal', id: 'HA' }); sim.press(g, { kind: 'platform', no: 3 });
    until(g, () => ready(g, 1) && g.time > 17);
    ok(sim.blockFree(g, 'C') && !train(g, 2) && g.pend.length === 1, '(ข) ขบวน 2 ถูกกักที่สถานีข้างเคียง ตอนขา C ยังว่างให้ขบวน 1 ออก');
    const h = sim.hint(g, { force: true });
    ok(h && h.k === 'XE3', '(ข) คำใบ้ชี้ให้ปล่อยขบวน 1 ออก', JSON.stringify(h));
    sim.press(g, { kind: 'signal', id: 'XE3' });
    ok(sim.press(g, { kind: 'portal', id: 'C' }) === true, '(ข) ปล่อยขบวน 1 ออกขา C ได้');
    until(g, () => g.done === 1); const c = g.time;
    until(g, () => !!train(g, 2));
    ok(g.time - c > 15, '(ข) ขบวน 2 มาหลังตอนขา C ว่างแล้ววิ่งอีก runTime', (g.time - c).toFixed(1));
    const a = auto(g);
    ok(g.state === 'win' && a.refused === 0 && !events.some(e => e.type === 'fail'), '(ข) จบภารกิจได้ ไม่ค้าง ไม่มีทางตัน', `${g.state} ${g.result && g.result.code}`);
  }
  {
    // ถ้าขบวนจากขา C ได้ตอนไปก่อนแล้ว (มาถึงพร้อมกัน) แล้วผู้เล่นฝืนรับขบวนที่ต้องออกขา C เข้า t3 = ทางตันจริง ต้องแจ้ง
    const { g, events } = play(NP, NX, [{ at: 1, from: 'A', to: 'C', track: 't3' }, { at: 1, from: 'C', to: 'A', track: 't3' }]);
    until(g, () => waitingAt(g, 1, 'HA') && waitingAt(g, 2, 'HC'));
    sim.press(g, { kind: 'signal', id: 'HA' }); sim.press(g, { kind: 'platform', no: 3 });
    until(g, () => ready(g, 1) && !g.overlaps.length && !g.routes.length);
    ok(sim.isStatic(g), '(ข) จำลองได้: ขบวน 1 ใน t3 ต้องออกขา C ขบวน 2 ครองตอนขา C รอที่เสาเข้า');
    same(sim.escapeRoutes(g), [], '(ข) ไม่มีเส้นทางที่เป็นประโยชน์ (ออกขา B ได้แต่ผิดขา ไม่นับเป็นทางออก)');
    ok(sim.hint(g, { force: true }) === null && !sim.canRoute(g, 'XE3', g.L.routes.XE3.find(r => r.portal === 'B')), '(ข) คำใบ้ไม่ชี้ให้ส่งขบวนออกผิดขา แม้เส้นทางนั้นตั้งได้');
    const t0 = g.time; until(g, () => false, 30);
    const f = events.find(e => e.type === 'fail');
    ok(g.state === 'fail' && f && f.code === 'DEADLOCK' && g.time - t0 < 4, '(ข) เอนจินแจ้ง DEADLOCK ภายใน 3 วินาที ไม่ค้างที่สถานะ play', JSON.stringify(f || g.state));
  }
  {
    // คำใบ้ต้องไม่ก่อทางตันเอง: ขบวน 1 (B→t3→C) มาถึงพร้อมขบวน 2 (C→t3→A) ถ้ารับขบวน 1 เข้า t3 ก่อน จะออกขา C ไม่ได้ตลอดไป
    const lk = [{ at: 1, from: 'B', to: 'C', track: 't3' }, { at: 1, from: 'C', to: 'A', track: 't3' }];
    const { g, events } = play(NP, NX, lk, { waitGrace: 60 });
    until(g, () => waitingAt(g, 1, 'HB') && waitingAt(g, 2, 'HC'));
    ok(sim.trapsItself(g, train(g, 1), 'k3') && !sim.trapsItself(g, train(g, 2), 'k3'), 'รู้ว่ารับขบวน 1 เข้า t3 ตอนนี้ = ขังตัวเอง (ขา C มีขบวนกำลังมาและเข้าได้เฉพาะ t3)');
    const h = sim.hint(g, { force: true });
    ok(h && h.k === 'HC', 'คำใบ้ข้ามขบวน 1 ไปรับขบวน 2 จากขา C ก่อน', JSON.stringify(h));
    const a = auto(g);
    ok(g.state === 'win' && g.result.score === 300 && a.refused === 0 && !events.some(e => e.type === 'fail'), 'ทำตามคำใบ้แล้วจบได้คะแนนเต็ม ไม่เข้าทางตัน', `${g.state} ${JSON.stringify(g.result)}`);
    // ผู้เล่นฝืนรับขบวน 1 เข้า t3 เอง = ทางตันจริง ต้องแจ้ง
    const b = play(NP, NX, lk); until(b.g, () => waitingAt(b.g, 1, 'HB') && waitingAt(b.g, 2, 'HC'));
    sim.press(b.g, { kind: 'signal', id: 'HB' }); sim.press(b.g, { kind: 'platform', no: 3 });
    until(b.g, () => false, 60);
    ok(b.g.state === 'fail' && b.g.result.code === 'DEADLOCK', 'ถ้าผู้เล่นฝืนรับขบวน 1 เข้า t3 เอง เกมแจ้ง DEADLOCK', `${b.g.state} ${b.g.result && b.g.result.code}`);
  }
  {
    // บอทตามคำใบ้บนผังจริงทั้ง 5 สถานี ด้วยตารางอย่างง่าย: ต้องจบ (ชนะ หรือแพ้แบบมีรหัส) ไม่ค้าง
    const cases = [['tha-kilen', MECH, [{ at: 1, from: 'W', to: 'E', track: 'loop1' }, { at: 3, from: 'E', to: 'W', track: 'main' }]],
      ['wang-pho', MECH, [{ at: 1, from: 'W', to: 'E', track: 'loop1' }, { at: 3, from: 'E', to: 'W', track: 'main' }, { at: 20, from: 'W', to: 'E', track: 'main', type: 'express' }]],
      ['nam-tok', MECH, [{ at: 1, from: 'W', to: 'W', track: 'main', dwell: 6 }, { at: 18, from: 'W', to: 'W', track: 'loop1', dwell: 6 }]],
      [KB, TC, [{ at: 1, from: 'W', to: 'E', track: 'loop1' }, { at: 6, from: 'E', to: 'W', track: 'main' }, { at: 30, from: 'W', to: 'W', track: 'bay1', dwell: 10 }, { at: 36, from: 'E', to: 'W', track: 'loop2' }]],
      [NP, NX, [{ at: 1, from: 'A', to: 'B', track: 't1' }, { at: 3, from: 'C', to: 'A', track: 't3' }, { at: 30, from: 'B', to: 'A', track: 't2' }, { at: 32, from: 'A', to: 'C', track: 't3' }]]];
    for (const [st, era, trains] of cases) {
      if (!stations[st]) { ok(false, `ผังจริง ${st}: โหลดไม่ได้`, JSON.stringify(stationErrors[st + '.json'])); continue; }
      const { g } = play(st, era, trains, { waitGrace: 20 }), a = auto(g, 600);
      ok(g.state === 'win' && a.refused === 0, `ผังจริง ${st}: บอทตามคำใบ้จบได้ ไม่ค้าง ไม่ถูกปฏิเสธ`, `${g.state} ${g.result && g.result.code || ''} ส่งออก ${g.done}/${trains.length} เวลา ${g.time.toFixed(1)}`);
    }
  }
}

section('ข้อแก้จากวิศวกรอาณัติสัญญาณ (รอบตรวจผังจริง)');
{
  const KB = 'kanchanaburi', NP = 'nong-pla-duk-jn', TK = 'tha-kilen', NT = 'nam-tok';
  const pts = g => Object.keys(g.P).map(k => k + g.P[k].pos).join(' ');
  const lastText = ev => ev.filter(e => e.type === 'msg').pop().text;
  {
    // 1) autoRoute: ถูกปฏิเสธแล้วต้องไม่มีประแจขยับ
    const { g, events } = play(NP, NX, [{ at: 1, from: 'A', to: 'B', track: 't3' }, { at: 30, from: 'B', to: 'A', track: 't1' }]);
    until(g, () => waitingAt(g, 1, 'HA')); sim.press(g, { kind: 'signal', id: 'HA' }); sim.press(g, { kind: 'platform', no: 3 });
    until(g, () => ready(g, 1) && sim.blockState(g, 'B').dir === 'in');
    const before = pts(g), r = g.L.routes.XE3.find(x => x.portal === 'B');
    ok(r.req.some(([k, pos]) => g.P[k].pos !== pos), 'S10>ขา B ต้องกลับประแจอย่างน้อย 1 ตัว');
    sim.press(g, { kind: 'signal', id: 'XE3' });
    ok(sim.press(g, { kind: 'portal', id: 'B' }) === false && code(g) === 'BLOCK_NOT_FREE', '1) ตั้ง S10>ขา B ขณะตอน B มีขบวนกำลังมา = BLOCK_NOT_FREE');
    same(pts(g), before, '1) ถูกปฏิเสธแล้วประแจไม่ขยับสักตัว');
    ok(sim.autoRoute(g, 'XE3', r.req) === false && pts(g) === before && !g.routes.length && !g.overlaps.length, '1) เรียก autoRoute ตรง ๆ ก็เหมือนกัน ไม่มีอะไรเปลี่ยน');
    // ป้ายขาอ่านจากผัง (ผังจริงเปลี่ยนป้ายได้โดยเทสต์ไม่พัง) ข้อความต้องตรงทั้งประโยค
    ok(lastText(events) === `ไม่ให้สัญญาณ: ตอนทางเดี่ยวด้าน${g.L.portals.B.label} มีขบวนกำลังมา รอให้เข้าสถานีพ้นก่อน`, '7) ข้อความใช้ป้ายขาจากผัง เว้นวรรคก่อนข้อความต่อท้าย', lastText(events));
    // กรณีป้ายมีวงเล็บ: ตั้งป้ายเองในสำเนาผัง แล้วเล่นเหตุการณ์เดียวกัน
    const j = structuredClone(stationJson.find(s => s.json.id === NP).json); j.id = 'np-paren'; j.layout.portals.B.label_th = 'ไปบ้านโป่ง (สายใต้)';
    const st = sim.loadStation(j), ev = [];
    const p = sim.loadLevelPack({ schema: 2, id: 'l', eras: testJson.eras, levels: [{ id: 'a', station: j.id, era: NX, name: 'n', goal: 'g', speed: 60, tips: [],
      trains: [{ at: 1, from: 'A', to: 'B', track: 't3' }, { at: 30, from: 'B', to: 'A', track: 't1' }] }] }, { [j.id]: st.station });
    const h = sim.createGame(p.pack, 0, { onEvent: e => ev.push(e) }); sim.startGame(h);
    until(h, () => waitingAt(h, 1, 'HA')); sim.press(h, { kind: 'signal', id: 'HA' }); sim.press(h, { kind: 'platform', no: 3 });
    until(h, () => ready(h, 1) && sim.blockState(h, 'B').dir === 'in');
    sim.press(h, { kind: 'signal', id: 'XE3' });
    ok(st.ok && sim.press(h, { kind: 'portal', id: 'B' }) === false && h.lastCode === 'BLOCK_NOT_FREE' && /ไปบ้านโป่ง \(สายใต้\) มีขบวนกำลังมา/.test(lastText(ev)), '7) ป้ายขาที่มีวงเล็บเว้นวรรคก่อนข้อความต่อท้าย', lastText(ev));
  }
  {
    // 2) ประแจ "มีรถทับ" นับเฉพาะรางของประแจตัวนั้น
    const { g } = play(KB, TC, [{ at: 1, from: 'E', to: 'W', track: 'main' }]);
    until(g, () => waitingAt(g, 1, 'HE')); sim.tapSignal(g, 'HE');
    until(g, () => ready(g, 1) && !g.overlaps.length); sim.tapSignal(g, 'XW1');
    until(g, () => train(g, 1).edge === 'mw~' && train(g, 1).s > 90);
    ok(sim.tapPoint(g, 'P3') === true && g.P.P3.pos === 'R', '2) กาญจนบุรี: ขบวนอยู่บน mw กลับ P3 (คนละรางในคอเดียวกัน) ได้');
    ok(sim.tapPoint(g, 'P2') === true, '2) และ P2 ก็กลับได้');
    ok(sim.tapPoint(g, 'P1') === false && ['POINT_LOCKED', 'POINT_OCCUPIED'].includes(code(g)), '2) ส่วน P1 ที่ขบวนกำลังจะผ่านยังกลับไม่ได้');
    until(g, () => g.state !== 'play'); ok(g.state === 'win', '2) ขบวนออกได้ปกติ');
  }
  {
    const { g } = play(NP, NX, [{ at: 1, from: 'C', to: 'A', track: 't3' }, { at: 1, from: 'A', to: 'B', track: 't1', type: 'express' }]);
    until(g, () => waitingAt(g, 1, 'HC') && waitingAt(g, 2, 'HA'));
    g.P.P3.pos = 'R'; // จัดฉาก: P3 ค้างท่าแยกจากเส้นทางก่อนหน้า
    sim.press(g, { kind: 'signal', id: 'HC' }); sim.press(g, { kind: 'platform', no: 3 });
    until(g, () => train(g, 1).edge === 'e3~' && train(g, 1).s > 40);
    ok(sim.autoRoute(g, 'XE1', g.L.routes.XE1[0].req) === true && g.P.P3.pos === 'N', '2) หนองปลาดุก: ขบวนจาก C อยู่บน e3 ตั้ง S6>ขา B ที่ต้องกลับ P3 ได้', String(code(g)));
  }
  {
    // ยุคไม่มีอินเตอร์ล็อก: กลับประแจตัวอื่นในคอเดียวกันไม่ตกราง กลับตัวที่รถทับ = ตกราง
    const { g } = play(KB, NONE, [{ at: 1, from: 'W', to: 'E', track: 'main' }]);
    until(g, () => waitingAt(g, 1, 'HW')); sim.tapSignal(g, 'HW');
    until(g, () => sim.nearPoint(g, g.P.P1));
    ok(sim.tapPoint(g, 'P3') && g.state === 'play', '2) ยุคไม่มีอินเตอร์ล็อก: กลับ P3 ขณะรถทับ P1 ไม่เกิดเหตุ');
    sim.tapPoint(g, 'P1');
    ok(g.state === 'fail' && g.result.code === 'DERAIL_UNDER', '2) กลับ P1 ใต้ขบวน = DERAIL_UNDER');
  }
  {
    // 3) overlap เป็นเส้นทางเดิน
    const { g, events } = play(NP, NX, [{ at: 1, from: 'A', to: 'B', track: 't1' }, { at: 900, from: 'A', to: 'C', track: 't3' }]);
    until(g, () => waitingAt(g, 1, 'HA')); sim.press(g, { kind: 'signal', id: 'HA' }); sim.press(g, { kind: 'platform', no: 1 });
    same(g.overlaps[0].tracks, ['x1', 'bp'], '3) S1>ทาง 1: ทางหยุดเลย = x1, bp (เดินจากเสาออกจนถึงรางของขา B)');
    same(g.overlaps[0].points, ['P3'], '3) ล็อกเฉพาะประแจบนทางหยุดเลย');
    ok(g.P.P3.ovl && !g.P.P4.ovl && !g.P.P5.ovl && !g.ovlOf.x3 && !g.ovlOf.e3, '3) P4, P5 และราง x3, e3 ไม่ถูกจอง');
    same(sim.snapshot(g).overlaps, [{ sig: 'HA', from: 'k1', dir: 'E', tracks: ['x1', 'bp'], points: ['P3'] }], '3) snapshot.overlaps ให้ตัววาดวาดเส้นประ');
    ok(sim.canRoute(g, 'XE3', g.L.routes.XE3.find(r => r.portal === 'C')) === null, '3) S1>ทาง 1 กับ S10>ขา C ตั้งพร้อมกันได้แล้ว');
    ok(['OVERLAP_HELD', 'POINT_LOCKED'].includes((sim.canRoute(g, 'XE3', g.L.routes.XE3.find(r => r.portal === 'B')) || {}).code), '3) แต่ S10>ขา B ที่ใช้ bp และ P3 ร่วมกับทางหยุดเลย ยังขัด');
    ok(sim.canRoute(g, 'HC', g.L.routes.HC[0]).code === 'ROUTE_CONFLICT', '3) S4>ทาง 3 ยังขัด (ทางหยุดเลยของมันทับเส้นทาง S1>ทาง 1 ที่คอฝั่ง A)');
    const c = play(X, TC, [W1E]); until(c.g, () => waitingAt(c.g, 1, 'S1')); sim.tapPoint(c.g, 'P1'); sim.tapSignal(c.g, 'S1');
    ok(sim.tapPoint(c.g, 'P2') === false && code(c.g) === 'POINT_LOCKED' && lastText(c.events) === 'ประแจ P2 ถูกกันไว้เผื่อขบวนหยุดเลย ถ้าขบวนนี้ผ่านไม่จอด ให้ตั้งเสาออกก่อนเสาเข้า', '6) ข้อความประแจที่ล็อกด้วย overlap แยกจากล็อกด้วยเส้นทาง', lastText(c.events));
    ok(sim.tapPoint(c.g, 'P1') === false && /ถูกล็อกโดยทางของ S1/.test(lastText(c.events)), '6) ประแจที่ล็อกด้วยเส้นทางยังใช้ข้อความเดิม');
  }
  {
    // overlap ชน overlap ในคอเดียวกันยังขัดกันเสมอ (ไม่ผ่อน) แม้รางบนทางหยุดเลยไม่ทับกัน
    const { g } = play(NP, NX, [{ at: 900, from: 'A', to: 'B', track: 't1' }]);
    g.overlaps.push({ sig: 'HB', destSig: null, dest: 'k1', tracks: [], points: [], zone: sim.overlapPath(g, g.E.k3).zone, route: { passed: false }, timer: 0 });
    ok(sim.canRoute(g, 'HA', g.L.routes.HA.find(r => r.plat === 3)).code === 'OVERLAP_HELD', '3) overlap สองอันในคอสถานีเดียวกันขัดกันเหมือนเดิม');
  }
  {
    // 4) ทางตันในยุคไม่มีอินเตอร์ล็อก
    const full = [{ at: 1, from: 'W', to: 'W', track: 'main', dwell: 4 }, { at: 14, from: 'W', to: 'W', track: 'loop1', dwell: 4 }, { at: 24, from: 'W', to: 'W', track: 'main' }];
    const { g, events } = play(NT, NONE, full, { holdGrace: 0 });
    const L = g.L, sigIn = L.portals.W && g.E[L.portals.W.entry].sig;
    until(g, () => waitingAt(g, 1, sigIn)); sim.setRoute(g, sigIn, g.L.routes[sigIn].find(r => r.plat === g.L.rolePlat.main));
    until(g, () => waitingAt(g, 2, sigIn) && g.S[sigIn].aspect === 'R'); sim.setRoute(g, sigIn, g.L.routes[sigIn].find(r => r.plat === g.L.rolePlat.loop1));
    until(g, () => false, 150);
    const f = events.find(e => e.type === 'fail');
    ok(g.state === 'fail' && f && f.code === 'DEADLOCK' && f.title === 'ติดขัด!' && f.why === 'ติดขัด: เหลือแต่ทางที่ปล่อยไปแล้วรถชนกัน' && /คิดล่วงหน้า/.test(f.lesson), '4) น้ำตก ยุคไม่มีอินเตอร์ล็อก: ทางจอดเต็มและขบวนรอเข้า = แจ้งติดขัด ไม่ค้าง', JSON.stringify(f || [g.state, g.time]));
    ok(g.time < 100, '4) แจ้งภายในไม่กี่วินาทีหลังทุกอย่างหยุดนิ่ง', g.time.toFixed(1));
  }
  {
    // 5) ช่วงผ่อนของการกักขบวน: ค่าเริ่มต้น = ช่วงผ่อนตอนพร้อมออก + 10, กำหนดเองได้, null = กักตลอด
    const two = [{ at: 1, from: 'W', to: 'W', track: 'main', dwell: 2 }, { at: 1, from: 'W', to: 'W', track: 'loop1', dwell: 2 }, { at: 30, from: 'W', to: 'W', track: 'main' }];
    // วัดว่าขบวนข้างใน (ขบวน 1) พร้อมออกและรอไปนานเท่าไร ตอนที่สถานีข้างเคียงเลิกกักแล้วส่งขบวน 3 เข้าตอน
    const arrive = extra => { const { g } = play(TM, MECH, two, extra);
      until(g, () => waitingAt(g, 1, 'S1')); sim.tapSignal(g, 'S1');
      until(g, () => waitingAt(g, 2, 'S1') && g.S.S1.aspect === 'R' && !g.routes.length); sim.tapPoint(g, 'P1'); sim.tapSignal(g, 'S1');
      until(g, () => (ready(g, 1) && sim.blockState(g, 'W').dir === 'in') || g.state !== 'play', 80);
      const t1 = train(g, 1); return { g, held: t1 ? t1.wait : -1 }; };
    const a = arrive({}), b = arrive({ waitGrace: 20 }), c = arrive({ holdGrace: 3 }), d = arrive({ holdGrace: null });
    ok(a.held > 14 && a.held < 14.2, '5) ค่าเริ่มต้น: กักจนขบวนข้างในพร้อมออกแล้วรอเกิน 4 + 10 วินาที', a.held.toFixed(2));
    ok(b.held > 30 && b.held < 30.2, '5) ด่านที่ waitGrace 20: กัก 20 + 10 วินาที', b.held.toFixed(2));
    ok(c.held > 3 && c.held < 3.2, '5) holdGrace กำหนดเองได้', c.held.toFixed(2));
    ok(d.g.state === 'play' && sim.blockFree(d.g, 'W') && d.g.pend.length === 1 && d.held > 60, '5) holdGrace: null = กักตลอด ไม่มีทางตัน', `${d.g.state} ${d.held.toFixed(1)}`);
    const bad = sim.loadLevelPack({ schema: 2, id: 'l', eras: testJson.eras, levels: [{ id: 'a', station: NT, era: MECH, name: 'n', goal: 'g', speed: 60, tips: [], trains: two, holdGrace: 'x' }] }, stations, stationErrors);
    ok(!bad.ok && /holdGrace/.test(bad.errors.join()), '5) ตัวตรวจด่านตีกลับ holdGrace ที่ไม่ใช่วินาทีหรือ null');
  }
  {
    // 7) ผัง schema 2 เรียก "ทาง n" 12 ด่านเดิมยังเป็น "ชานชาลา n"
    const { g, events } = play(TK, MECH, [{ at: 1, from: 'W', to: 'E', track: 'main' }, { at: 12, from: 'W', to: 'E', track: 'loop1' }]);
    const s = g.E[g.L.portals.W.entry].sig, n = g.L.rolePlat.main;
    until(g, () => waitingAt(g, 1, s)); sim.setRoute(g, s, g.L.routes[s].find(r => r.plat === n));
    ok(lastText(events) === `ตั้งทางเข้าทาง ${n} และล็อกประแจแล้ว`, '7) "ตั้งทางเข้าทาง n"', lastText(events));
    until(g, () => ready(g, 1));
    ok(events.some(e => e.type === 'msg' && e.text === `ขบวน 1 เข้าทาง ${n} ถูกต้อง +100`), '7) "ขบวน 1 เข้าทาง n ถูกต้อง"');
    until(g, () => waitingAt(g, 2, s)); sim.tapSignal(g, s);
    ok(lastText(events) === `เจ้าหน้าที่เห็นว่าทาง ${n} ยังมีรถอยู่ ยังให้สัญญาณไม่ได้`, '7) ยุคกล (ไม่มีวงจรตอนราง): "เจ้าหน้าที่เห็นว่าทาง n ยังมีรถอยู่"', lastText(events));
    ok(!events.some(e => e.type === 'msg' && /ชานชาลา/.test(e.text)), '7) ไม่มีคำว่าชานชาลาในข้อความของผัง schema 2');
    const ev = [], h = sim.createGame(packH(), 3, { onEvent: e => ev.push(e) }); sim.startGame(h); sim.tapSignal(h, 'S1');
    ok(/ตั้งทางเข้าชานชาลา 2/.test(lastText(ev)), '7) 12 ด่านเดิมคงคำว่าชานชาลา', lastText(ev));
  }
  {
    // 8) ตัวเฝ้า: นิ่งนานแต่ไม่เข้าเงื่อนไขทางตัน (มีขบวนต้นทางค้างรอทางว่าง) = event stall ไม่แพ้
    const { g, events } = play(TM, MECH, [{ at: 1, from: 'W', to: 'W', track: 'loop1', dwell: 2 }, { at: 25, origin: 'loop1', to: 'W', dwell: 2 }]);
    until(g, () => waitingAt(g, 1, 'S1')); sim.tapPoint(g, 'P1'); sim.tapSignal(g, 'S1');
    until(g, () => waitingAt(g, 1, 'U1') && g.time > 26);
    ok(!sim.isStatic(g) && g.pend.length === 1, '8) มีขบวนต้นทางค้างใน pend จึงไม่นับว่านิ่งตามเงื่อนไขทางตัน');
    until(g, () => g.stall >= 44); ok(!events.some(e => e.type === 'stall'), '8) ยังไม่ถึง 45 วินาที ไม่มี event');
    run(g, 2);
    same(events.filter(e => e.type === 'stall'), [{ type: 'stall', seconds: 45 }], '8) ครบ 45 วินาที ส่ง event stall หนึ่งครั้ง');
    run(g, 60);
    ok(g.state === 'play' && events.filter(e => e.type === 'stall').length === 1, '8) ไม่ตัดสินแพ้ และไม่ส่งซ้ำระหว่างที่ยังนิ่ง');
    ok(sim.tapSignal(g, 'U1') === true, '8) ผู้เล่นปล่อยขบวนออก'); until(g, () => g.done === 1 && ready(g, 2)); run(g, 46);
    ok(events.filter(e => e.type === 'stall').length === 2 && g.state === 'play', '8) ขยับแล้วกลับมานิ่งอีก ส่งได้อีกครั้ง');
  }
  {
    // 9) ทางสำรอง: ทางที่ไม่มีชานชาลาเสนอเป็นลำดับท้าย และข้อความบอกว่าได้คะแนนน้อยลง
    // สำเนาผังกาญจนบุรี 2 ชุด ล้างธง noPlatform ก่อนแล้วตั้งเอง เทสต์จึงไม่ขึ้นกับว่าผังจริงติดธงทางไหน
    const j0 = structuredClone(stationJson.find(s => s.json.id === KB).json); j0.id = 'kb-pax';
    for (const p of j0.layout.platforms) delete p.noPlatform;
    const j = structuredClone(j0); j.id = 'kb-nopax';
    j.layout.platforms.find(p => p.track === j.layout.roles.loop1).noPlatform = true;
    const r0 = sim.loadStation(j0), r = sim.loadStation(j);
    ok(r0.ok && r0.station.noPlatform.length === 0, '9) สำเนาที่ล้างธงแล้วไม่มีทางใดติด noPlatform', JSON.stringify(r0.errors));
    ok(r.ok && r.station.noPlatform.length === 1 && r.station.noPlatform[0] === r.station.rolePlat.loop1, '9) ผังบอกทางจอดที่ไม่มีชานชาลาได้ด้วย noPlatform: true', JSON.stringify(r.errors));
    const mk = st => { const p = sim.loadLevelPack({ schema: 2, id: 'l', eras: testJson.eras, levels: [{ id: 'a', station: st.id, era: TC, name: 'n', goal: 'g', speed: 60, tips: [],
        trains: [{ at: 1, from: 'E', to: 'W', track: 'main', dwell: 4 }, { at: 6, from: 'W', to: 'E', track: 'main' }] }] }, { [st.id]: st });
      const g = sim.createGame(p.pack, 0); sim.startGame(g);
      until(g, () => waitingAt(g, 1, 'HE')); sim.tapSignal(g, 'HE');
      until(g, () => sim.isStatic(g), 60); return g; };
    const g1 = mk(r0.station), g2 = mk(r.station);
    ok(sim.escapeRoutes(g1)[0].r.plat === g1.L.rolePlat.loop1 && sim.escapeRoutes(g2)[0].r.plat === g2.L.rolePlat.loop2, '9) ปกติเสนอ loop1 แต่ถ้า loop1 ไม่มีชานชาลา เสนอ loop2 ก่อน');
    const h = sim.hint(g2, { force: true }), seen = [];
    for (let n = 0; n < 6 && sim.hint(g2, { force: true }); n++) { seen.push(sim.hint(g2, { force: true }).text); sim.press(g2, sim.nextTarget(g2)); }
    ok(h && seen.some(t => /รับเข้าทาง \d แทน \(ได้คะแนนน้อยลง\)/.test(t)), '9) ข้อความคำใบ้บอกว่าได้คะแนนน้อยลง', seen.join(' | '));
  }
}

section('ประแจปลายไกลบนทางหยุดเลย (overlap) ต้องไม่ตั้งสวนทาง');
{
  // ตัวตรวจอิสระ (ไม่ใช้ overlapPath): เดินจากปลายรางจอดตามท่าประแจจริงผ่านคอสถานี ประแจด้านหลังต้องอยู่ท่าของขาที่เดินเข้า
  const against = g => {
    const bad = [];
    for (const o of g.overlaps) {
      let nx = g.E[o.dest].next;
      for (let n = 0; n < g.L.edgeCount && nx; n++) {
        let cur;
        if (typeof nx === 'string') cur = nx;
        else if (nx.pt) cur = nx[g.P[nx.pt].pos];
        else { if (g.P[nx.trail].pos !== nx.as) bad.push(`${sim.sigName(g, o.sig)}:${nx.trail}`); cur = nx.to; }
        const sec = g.L.sections[g.L.sectionOf[g.E[cur].track]];
        if (!sec || sec.kind !== 'throat') break;
        nx = g.E[cur].next;
      }
    }
    return bad;
  };
  const packFor = (st, era) => {
    // ขบวนเดียวที่มาหลังจบเทสต์ (at: 900) แค่ให้ชุดด่านผ่านตัวตรวจ: ลองขา/ทางจนเจอคู่ที่ไปถึงกัน
    const L = stations[st], ports = Object.keys(L.portals);
    for (const from of ports) for (const to of ports) for (const track of Object.keys(L.rolePlat)) {
      const r = sim.loadLevelPack({ schema: 2, id: 'o', eras: testJson.eras, levels: [{ id: 'a', station: st, era, name: 'n', goal: 'g', speed: 60, tips: [],
        trains: [{ at: 900, from, to, track }] }] }, stations, stationErrors);
      if (r.ok && !r.pack.levels[0].error) return r.pack;
    }
    throw new Error(`${st}: สร้างชุดด่านทดสอบไม่ได้`);
  };
  const bidir = Object.keys(stations).filter(k => stations[k].bidir);
  let cases = 0, refusedMech = 0, autoSet = 0;
  const problems = [];
  for (const st of bidir) for (const era of [MECH, TC, NX]) {
    const pack = packFor(st, era), L = stations[st], pts = Object.keys(L.P);
    for (const sig in L.routes) for (const r of L.routes[sig]) {
      if (r.exit) continue;
      for (let m = 0; m < 1 << pts.length; m++) {
        const g = sim.createGame(pack, 0); sim.startGame(g);
        pts.forEach((k, i) => { g.P[k].pos = m & (1 << i) ? 'R' : 'N'; });
        const ovl = sim.overlapFor(g, g.E[r.edges[r.edges.length - 1]], Object.fromEntries(r.req));
        if (!ovl) continue;
        cases++;
        const wrong = ovl.req.filter(([k, pos]) => g.P[k].pos !== pos);
        let got;
        if (era === NX) got = sim.autoRoute(g, sig, r.req);
        else { for (const [k, pos] of r.req) g.P[k].pos = pos; got = sim.tapSignal(g, sig); }
        if (era === MECH && wrong.length) {
          refusedMech++;
          if (got !== false || g.lastCode !== 'OVERLAP_POINT_NOT_SET' || g.S[sig].aspect !== 'R') { problems.push(`${st} ยุคกล ${sig}>${r.to}: ควรปฏิเสธ (${wrong.map(x => x[0])}) ได้ ${got} ${g.lastCode}`); continue; }
          for (const [k] of wrong) if (!sim.tapPoint(g, k)) problems.push(`${st} ${sig}>${r.to}: สับ ${k} เองไม่ได้ (${g.lastCode})`);
          got = sim.tapSignal(g, sig);
        } else if (wrong.length) autoSet++;
        if (got !== true) { problems.push(`${st} ยุค ${era} ${sig}>${r.to} ตั้งบนผังว่างไม่ได้: ${g.lastCode}`); continue; }
        const bad = against(g);
        if (bad.length) problems.push(`${st} ยุค ${era} ${sig}>${r.to}: overlap ผ่านประแจสวนทาง ${bad.join(',')}`);
        if (g.overlaps.some(o => o.points.some(k => g.P[k].ovl !== o))) problems.push(`${st} ${sig}>${r.to}: ประแจบนทางหยุดเลยไม่ถูกล็อก`);
      }
    }
  }
  ok(cases > 500 && refusedMech > 0 && autoSet > 0, `ทดลองทุกเส้นทางรับเข้าของทุกผัง ทุกท่าประแจ (${cases} กรณี, ยุคกลปฏิเสธ ${refusedMech}, ระบบตั้งให้ ${autoSet})`);
  ok(!problems.length, 'ทุกผัง: สัญญาณอนุญาตเมื่อประแจปลายไกลอยู่ท่าที่ถูกและล็อกแล้วเท่านั้น', problems.slice(0, 5).join(' | '));

  // ระหว่างเล่นจริงทั้งชุด (บอทตามคำใบ้): ไม่มีช่วงไหนที่ overlap ผ่านประแจสวนทาง
  const namtok = sim.loadLevelPack(readJson('data/levels/namtok.json'), stations, stationErrors).pack;
  const seen = [];
  for (const p of [namtok, pack]) p.levels.forEach((lv, i) => {
    const g = sim.createGame(p, i); sim.startGame(g);
    for (let n = 0; n < 12000 && g.state === 'play'; n++) {
      for (let k = 0; k < 6 && g.state === 'play'; k++) { const t = sim.nextTarget(g); if (!t) break; sim.press(g, t); const b = against(g); if (b.length) seen.push(`${lv.id || i} ${b}`); }
      sim.step(g, DT);
      const b = against(g); if (b.length) seen.push(`${lv.id || i} t=${g.time.toFixed(1)} ${b}`);
    }
  });
  ok(!seen.length, 'บอทเล่นภารกิจน้ำตกและชุดทดสอบครบ: overlap ไม่เคยผ่านประแจที่ตั้งสวนทาง', seen.slice(0, 3).join(' | '));

  // กรณีที่เจอ: วังโพ รับเข้าทาง 2 ยุคกล ขณะ P4 ยังอยู่ท่า N
  const WP = 'wang-pho';
  const lastText = ev => ev.filter(e => e.type === 'msg').pop().text;
  {
    const { g, events } = play(WP, MECH, [{ at: 1, from: 'W', to: 'E', track: 'loop1' }]);
    const home = g.E[g.L.portals.W.entry].sig, r = g.L.routes[home].find(x => x.plat === g.L.rolePlat.loop1);
    until(g, () => waitingAt(g, 1, home));
    for (const [k, pos] of r.req) if (g.P[k].pos !== pos) sim.tapPoint(g, k);
    const far = sim.overlapMoves(g, r);
    ok(far.length === 1 && far[0][0] === 'P4' && far[0][1] === 'R', 'วังโพ ยุคกล: ทางเข้าทาง 2 ต้องสับ P4 ปลายไกลไปท่า R ก่อน', JSON.stringify(far));
    same(sim.hint(g, { force: true }), { k: 'P4', kind: 'p', text: 'สลับ P4 ให้ทางเผื่อหยุดเลย' }, 'คำใบ้ชี้ให้สับประแจปลายไกลก่อนแตะเสาเข้า');
    ok(sim.tapSignal(g, home) === false && code(g) === 'OVERLAP_POINT_NOT_SET' && lastText(events) === 'ไม่ให้สัญญาณ: สับประแจปลายไกล P4 ไปทางแยกก่อน ทางเผื่อหยุดเลยต้องไม่ผ่านประแจที่ตั้งสวนทาง', 'แตะเสาเข้าก่อนสับ P4 = ปฏิเสธ บอกชื่อประแจและท่า', lastText(events));
    ok(sim.tapPoint(g, 'P4') === true && g.P.P4.pos === 'R' && sim.tapSignal(g, home) === true && g.P.P4.ovl, 'สับ P4 ไปท่า R (ท่าที่ถูก) ไม่ถูกปฏิเสธ แล้วเสาเข้าอนุญาต P4 ถูกล็อก');
    ok(sim.tapPoint(g, 'P4') === false && code(g) === 'POINT_LOCKED' && g.P.P4.pos === 'R', 'สับ P4 ออกจากท่าของทางเผื่อหยุดเลยไม่ได้');
    // ข้อ 4: ประแจที่ทางหยุดเลยกันไว้ในท่าที่ยังสวนทาง (จัดฉาก) แตะไปท่าที่ถูกได้ แตะกลับไม่ได้
    g.P.P4.pos = 'N';
    ok(sim.tapPoint(g, 'P4') === true && g.P.P4.pos === 'R', 'tapPoint: ประแจที่ล็อกด้วย overlap แตะไปท่าที่ทางหยุดเลยต้องใช้ได้');
    ok(sim.tapPoint(g, 'P4') === false && code(g) === 'POINT_LOCKED', 'tapPoint: แล้วแตะกลับไปท่าสวนทางไม่ได้');
  }
  {
    // ยุคไฟสี: ระบบตั้ง P4 ให้เองถ้าว่าง ข้อความบอก, ยุคกลที่ตั้ง overlapPointsAuto: true ข้อความบอกว่า "ในเกมนี้"
    const { g, events } = play(WP, TC, [{ at: 1, from: 'W', to: 'E', track: 'loop1' }]);
    const home = g.E[g.L.portals.W.entry].sig, r = g.L.routes[home].find(x => x.plat === g.L.rolePlat.loop1);
    until(g, () => waitingAt(g, 1, home));
    for (const [k, pos] of r.req) if (g.P[k].pos !== pos) sim.tapPoint(g, k);
    ok(sim.tapSignal(g, home) === true && g.P.P4.pos === 'R' && g.P.P4.ovl && / ระบบตั้งประแจปลายไกล P4 ให้ด้วย$/.test(lastText(events)), 'ยุคไฟสี: ระบบตั้ง P4 ให้เองแล้วล็อก', lastText(events));
    const eras = structuredClone(testJson.eras); eras[MECH].overlapPointsAuto = true;
    const j = { schema: 2, id: 'a2', eras, levels: [{ id: 'a', station: WP, era: MECH, name: 'n', goal: 'g', speed: 60, tips: [], trains: [{ at: 1, from: 'W', to: 'E', track: 'loop1' }] }] };
    const ev = [], h = sim.createGame(sim.loadLevelPack(j, stations, stationErrors).pack, 0, { onEvent: e => ev.push(e) }); sim.startGame(h);
    until(h, () => waitingAt(h, 1, home));
    for (const [k, pos] of r.req) if (h.P[k].pos !== pos) sim.tapPoint(h, k);
    ok(sim.overlapMoves(h, r).length === 0 && sim.tapSignal(h, home) === true && h.P.P4.pos === 'R' && /\(ในเกมนี้ระบบตั้งประแจปลายไกล P4 ให้\)$/.test(lastText(ev)), 'ยุคกลที่ตั้ง overlapPointsAuto: true ระบบตั้งให้ และข้อความบอกว่าในเกมนี้', lastText(ev));
    // ประแจปลายไกลมีรถทับ: ระบบตั้งให้ไม่ได้ = ปฏิเสธ ไม่ขยับประแจ
    const k = play(WP, TC, [{ at: 1, from: 'W', to: 'E', track: 'loop1' }]).g;
    until(k, () => waitingAt(k, 1, home));
    for (const [p, pos] of r.req) if (k.P[p].pos !== pos) sim.tapPoint(k, p);
    k.trains[0].trail.push({ x: 0, y: 0, e: k.P.P4.N }); // จัดฉาก: ท้ายขบวนค้างบนขา N ของ P4 (ไม่อยู่บนทางหยุดเลย)
    ok(sim.tapSignal(k, home) === false && code(k) === 'POINT_OCCUPIED' && k.P.P4.pos === 'N' && !k.routes.length, 'ประแจปลายไกลมีรถทับ: ไม่ให้สัญญาณ และไม่มีอะไรขยับ', String(code(k)));
  }
  const bad = sim.loadLevelPack({ schema: 2, id: 'l', eras: testJson.eras.map((e, i) => (i === NX ? { ...e, overlapPointsAuto: false } : i === MECH ? { ...e, overlapPointsAuto: 'yes' } : e)),
    levels: [{ id: 'a', station: X, era: MECH, name: 'n', goal: 'g', speed: 60, tips: [], trains: [W1E] }] }, stations, stationErrors);
  ok(!bad.ok && bad.errors.filter(e => /overlapPointsAuto/.test(e)).length === 2, 'ตัวตรวจชุดด่าน: overlapPointsAuto ต้องเป็น true/false และยุค NX ห้ามเป็น false', (bad.errors || []).join(' | '));
}

section('key เซฟของภารกิจ และธงในเซฟ');
{
  const p = sim.loadLevelPack({ schema: 2, id: 'namtok', eras: testJson.eras, stations: [{ station: X, tier: 1, needStars: 0 }],
    levels: [{ id: 'tk-1', station: X, era: MECH, name: 'n', goal: 'g', speed: 50, tips: [], trains: [W1E] }] }, stations, stationErrors);
  ok(p.ok && sim.levelKey(p.pack.levels[0]) === 'tk-1', 'levelKey(lv) ของชุดด่าน schema 2 = id ภารกิจ ("tk-1")');
  ok(sim.levelKey(packH().levels[4]) === '4', 'levelKey(lv) ของชุด history (ไม่มี id) = ลำดับด่านเป็นข้อความ');
  const be = memoryBackend(), s = createSave(be);
  ok(s.getFlag('seen-tutorial-pan') === false && s.getFlag('x', 7) === 7, 'getFlag: ยังไม่เคยตั้ง = false หรือค่าเริ่มต้นที่ส่งมา');
  ok(!/flags/.test(be.read() || ''), 'ไม่มีธง = เซฟไม่มี key flags (รูปเซฟเดิมไม่เปลี่ยน)');
  ok(s.setFlag('seen-tutorial-pan', true) === true && s.getFlag('seen-tutorial-pan') === true, 'setFlag แล้วอ่านได้');
  s.setBest('namtok', 'tk-1', { stars: 2, score: 400 });
  const again = createSave(be);
  ok(again.getFlag('seen-tutorial-pan') === true && again.getBest('namtok', 'tk-1').stars === 2 && JSON.parse(be.read()).v === 2, 'เปิดใหม่ธงยังอยู่ ดาวยังอยู่ เวอร์ชันเซฟยังเป็น 2');
  const other = createSave(memoryBackend());
  ok(other.importCode(s.exportCode()) && other.getFlag('seen-tutorial-pan') === true, 'รหัสสำรองเกมพาธงไปด้วย');
  ok(s.setFlag('bad', { a: 1 }) === false && s.setFlag('', true) === false && s.getFlag('bad') === false, 'ค่าธงที่ไม่ใช่ true/false ตัวเลข ข้อความสั้น ถูกปฏิเสธ');
  s.setFlag('seen-tutorial-pan', null);
  ok(s.getFlag('seen-tutorial-pan') === false && !/flags/.test(be.read()), 'ตั้งเป็น null = ลบธง');
  const old = createSave(memoryBackend('{"v":1,"packs":{"history":{"stars":[3,2]}},"flags":{"a":true,"b":{"x":1}}}'));
  ok(old.getStars('history', 1) === 2 && old.getFlag('a') === true && old.getFlag('b') === false, 'ตัวแปลงเซฟเก่า: ดาวอยู่ครบ ธงที่รูปถูกอยู่ต่อ ธงเสียถูกทิ้ง');
  s.reset(); ok(s.getFlag('x') === false && !s.hasProgress('namtok'), 'reset ล้างธงด้วย');
}

section('เซฟ: สองแท็บใช้ที่เก็บเดียวกัน ดาวต้องไม่หาย');
{
  const be = memoryBackend(), tabA = createSave(be), tabB = createSave(be);   // เปิดสองแท็บตอนเซฟยังเปล่า
  tabB.setStars('history', 0, 3);                                             // แท็บ B ชนะด่าน 1 โหมดประวัติศาสตร์
  tabA.setBest('namtok', 'tk-1', { stars: 2, score: 400 });                   // กลับมาแท็บ A ชนะ tk-1
  const fresh = createSave(be);
  ok(fresh.getStars('history', 0) === 3 && fresh.getBest('namtok', 'tk-1').stars === 2, 'ทำซ้ำบั๊กของผู้ทดสอบ: ดาวโหมดประวัติศาสตร์จากอีกแท็บยังอยู่หลังแท็บแรกเขียน', be.read());
  ok(tabA.getStars('history', 0) === 3, 'แท็บ A เห็นดาวของแท็บ B หลังเขียนครั้งถัดไป');
  ok(tabB.getBest('namtok', 'tk-1').stars === 0, 'แท็บ B ยังไม่เห็นจนกว่าจะเขียนหรือ reload');
  tabB.reload(); ok(tabB.getBest('namtok', 'tk-1').stars === 2, 'reload แล้วเห็น');
  // ค่าเดียวกันจากสองแท็บ: เอาค่ามากกว่า แยกดาวกับคะแนน
  tabA.setBest('namtok', 'tk-2', { stars: 3, score: 100 }); tabB.setBest('namtok', 'tk-2', { stars: 1, score: 450 });
  tabA.setStars('history', 1, 1); tabB.setStars('history', 1, 2); tabA.setStars('history', 2, 1);
  const f2 = createSave(be);
  same(f2.getBest('namtok', 'tk-2'), { stars: 3, score: 450 }, 'ภารกิจเดียวกันจากสองแท็บ: ดาวและคะแนนเอาค่ามากกว่า');
  same([0, 1, 2].map(i => f2.getStars('history', i)), [3, 2, 1], 'ดาวตามลำดับด่านจากสองแท็บ: เอาค่ามากกว่าทีละด่าน');
  // ธงรวมกัน และลบธงได้จริง
  tabA.setFlag('seen-a', true); tabB.setFlag('seen-b', 5);
  const f3 = createSave(be);
  ok(f3.getFlag('seen-a') === true && f3.getFlag('seen-b') === 5, 'ธงจากสองแท็บรวมกัน');
  tabB.setFlag('seen-a', null);
  ok(createSave(be).getFlag('seen-a') === false && createSave(be).getFlag('seen-b') === 5, 'ลบธงที่อีกแท็บตั้งไว้ได้');
  // reset ต้องล้างจริง แม้อีกแท็บยังถือเซฟเก่าในหน่วยความจำ
  ok(tabA.reset() === true && !createSave(be).hasProgress('history') && !createSave(be).hasProgress('namtok') && createSave(be).getFlag('seen-b') === false, 'reset ล้างที่เก็บจริง รวมของที่อีกแท็บเขียนไว้');
  tabB.setStars('history', 5, 1); // แท็บ B ยังถือดาวเก่าในหน่วยความจำ แล้วเขียนต่อ
  const f4 = createSave(be);
  same([0, 1, 2, 5].map(i => f4.getStars('history', i)), [0, 0, 0, 1], 'หลัง reset แท็บอื่นเขียนต่อ: ของเก่าไม่กลับมา มีแต่ของใหม่');
  ok(f4.getBest('namtok', 'tk-2').stars === 0 && tabB.getStars('history', 0) === 0, 'แท็บ B เองก็เห็นเซฟที่ล้างแล้ว');
  // นำเข้ารหัส = แทนที่ทั้งก้อน อีกแท็บไม่เอาของเก่ามารวมกลับ
  const src = createSave(memoryBackend()); src.setBest('namtok', 'wp-1', { stars: 1, score: 50 });
  tabB.setStars('history', 6, 3);
  ok(tabA.importCode(src.exportCode()) === true, 'นำเข้ารหัสสำรองในแท็บ A');
  tabB.setFlag('later', true);
  const f5 = createSave(be);
  ok(f5.getBest('namtok', 'wp-1').stars === 1 && f5.getStars('history', 6) === 0 && f5.getFlag('later') === true, 'นำเข้ารหัสแทนที่ทั้งก้อน แท็บอื่นเขียนต่อได้โดยไม่ดึงของเก่ากลับ', be.read());
  // แท็บเดียว: ข้อความเซฟต้องเหมือนเดิมทุกตัวอักษร
  const one = memoryBackend(), solo = createSave(one);
  solo.setStars('history', 0, 3);
  ok(one.read() === '{"v":2,"packs":{"history":{"stars":[3],"best":{}}}}', 'แท็บเดียว: เซฟที่เขียนออกเหมือนเดิมทุกตัวอักษร', one.read());
  solo.setStars('history', 2, 2); solo.setBest('namtok', 'tk-1', { stars: 2, score: 300 }); solo.setBest('namtok', 'tk-1', { stars: 1, score: 350 }); solo.setFlag('f', true);
  ok(one.read() === '{"v":2,"packs":{"history":{"stars":[3,null,2],"best":{}},"namtok":{"stars":[],"best":{"tk-1":{"stars":2,"score":350}}}},"flags":{"f":true}}', 'แท็บเดียว เขียนหลายครั้ง: รูปและลำดับ key เหมือนเดิม', one.read());
  // ที่เก็บมีข้อมูลเสียระหว่างทาง: ไม่พัง และไม่ทำของในหน่วยความจำหาย
  const junk = memoryBackend(), j = createSave(junk); j.setStars('history', 0, 2); junk.write('{เสีย');
  ok(j.setStars('history', 1, 1) === true && createSave(junk).getStars('history', 0) === 2, 'ที่เก็บถูกเขียนเป็นข้อมูลเสียจากที่อื่น: เขียนทับด้วยของที่ถูกต้อง ไม่พัง');
}

section('ตัวอ่านสถานะสำหรับตัววาด');
{
  const { g } = play(X, TC, [W1E, E3W]);
  until(g, () => waitingAt(g, 1, 'S1')); sim.tapPoint(g, 'P1'); sim.tapSignal(g, 'S1');
  const s = sim.snapshot(g);
  ok(JSON.stringify(s).length > 100 && s.tracks.k1.locked === 'S1' && s.tracks.x1.overlap === 'S1' && s.tracks.bw.occupied && !s.tracks.k1.occupied, 'snapshot: ราง (ล็อก / overlap / มีรถ) เป็นข้อมูลล้วน');
  ok(s.points.P1.pos === 'R' && s.points.P1.locked && s.points.P2.locked && s.signals.S1.aspect === 'G' && s.signals.S2.dir === 'W', 'snapshot: ประแจและสัญญาณ');
  ok(s.trains[0].dir === 'E' && s.trains[0].up === true && s.trains[0].role === 'loop1' && s.trains[0].to === 'E' && s.blocks.W.state === 'occupied', 'snapshot: ขบวน (ทิศ เที่ยวขึ้น/ล่อง บทบาททาง ขาออก) และตอนทางเดี่ยว');
  ok(Object.keys(s.tracks).length === 10, 'snapshot นับรางกายภาพ ไม่นับซ้ำสองทิศ');
}

section('ความเร็ว: ผังสองทิศ 20 ขบวน');
{
  const { g } = play(JN, NX, [W1E].map(r => ({ ...r, from: 'A', to: 'B', track: 't1' })));
  for (const [edge, n] of [['bw', 3], ['k1', 3], ['k2', 3], ['pa', 2], ['pb', 2], ['k1~', 0], ['b', 2], ['c', 2], ['x1', 2], ['x2', 1]]) for (let k = 0; k < n; k++) {
    const t = sim.spawn(g, 1, 'bw'), e = g.E[edge]; t.id = 100 + g.trains.length; t.edge = edge; t.s = Math.min(e.len - 1, 76 + 86 * k); t.trail = [];
    for (let d = sim.TL; d >= 0; d -= 0.8) t.trail.push({ ...sim.posAt(e, t.s - d), e: edge });
  }
  const N = 1000, t0 = process.hrtime.bigint();
  for (let n = 0; n < N; n++) { g.state = 'play'; sim.step(g, 0); sim.hint(g, { force: true }); sim.snapshot(g); }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6 / N;
  console.log(`  ${g.trains.length} ขบวน: step + hint + snapshot = ${ms.toFixed(3)} ms ต่อก้าว (เฟรมละ 2 ก้าว = ${(2 * ms).toFixed(3)} ms จากงบ 16.7 ms)`);
  ok(g.trains.length === 20 && 2 * ms < 4, 'ไม่เกิน 4 ms ต่อเฟรมบนเครื่องเทสต์', `${g.trains.length} ขบวน ${(2 * ms).toFixed(2)} ms`);
}

console.log(`\n${checks - fails}/${checks} ข้อผ่าน`);
if (fails) { console.error('✗ sim2-test ไม่ผ่าน'); process.exit(1); }
console.log('✓ sim2-test ผ่าน');
