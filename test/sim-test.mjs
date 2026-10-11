// เทสต์ตัวจำลอง src/sim ใน Node ล้วน ๆ (ไม่ใช้เบราว์เซอร์) — ใช้: node test/sim-test.mjs
// 1) src/sim และ src/save ไม่แตะ DOM/เวลาจริง  2) JSON ตรงกับ LAYOUTS/LEVELS/ERAS ของต้นแบบ
// 3) บอทชนะครบ 12 ด่าน ผลเท่าต้นแบบ และเล่นซ้ำได้ผลเดิม  4) กรณีผิดกติกา  5) JSON เสีย  6) เซฟ  7) ความเร็ว
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import * as sim from '../src/sim/index.js';
import { createSave, memoryBackend, migrate, SAVE_VERSION } from '../src/save/index.js';

const require = createRequire(import.meta.url);
const { playAll, PROTOTYPE_PCT } = require('./lib/bot.js');
const { prototypeData } = require('./lib/prototype-data.js');
const { nodeHook } = require('./lib/node-hook.js');
const root = path.resolve(import.meta.dirname, '..');
const readJson = f => JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));

let fails = 0, checks = 0;
const ok = (cond, name, detail = '') => { checks++; if (!cond) { fails++; console.error(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); } };
const same = (a, b, name) => { const x = JSON.stringify(a), y = JSON.stringify(b); ok(x === y, name, x === y ? '' : `ได้ ${x.slice(0, 200)} แต่ควรเป็น ${y.slice(0, 200)}`); };
const section = s => console.log(`\n== ${s}`);

/* ---------- 1) โมดูลล้วน ---------- */
section('src/sim และ src/save ไม่แตะ DOM, canvas, window, เวลาจริง, ตัวสุ่มที่ไม่มี seed');
const BANNED = /\b(document|window|navigator|requestAnimationFrame|performance|setTimeout|setInterval|getContext|fetch|Date|Math\.random)\b/;
for (const dir of ['src/sim', 'src/save']) for (const f of fs.readdirSync(path.join(root, dir))) {
  const code = fs.readFileSync(path.join(root, dir, f), 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const m = code.match(BANNED);
  ok(!m, `${dir}/${f} สะอาด`, m ? `พบ "${m[0]}"` : '');
  if (dir === 'src/sim') ok(!/localStorage/.test(code), `${dir}/${f} ไม่แตะ localStorage`);
}
ok(typeof globalThis.document === 'undefined' && typeof globalThis.window === 'undefined', 'รันโดยไม่มี DOM จริง');

/* ---------- โหลดข้อมูล ---------- */
const stationFiles = fs.readdirSync(path.join(root, 'data/stations')).filter(f => f.endsWith('.json')).sort();
const stationJson = stationFiles.map(f => ({ name: f, json: readJson('data/stations/' + f) }));
const { stations, errors: stationErrors } = sim.loadStations(stationJson);
const packRes = sim.loadLevelPack(readJson('data/levels/history.json'), stations, stationErrors);
section('ข้อมูล JSON โหลดได้');
same(stationErrors, {}, 'ผังทุกไฟล์ผ่านตัวตรวจ');
ok(packRes.ok, 'ชุดด่าน history ผ่านตัวตรวจ', (packRes.errors || []).join(' | '));
if (!packRes.ok) process.exit(1);
const pack = packRes.pack;
for (const { name, json } of stationJson) {
  ok(name === json.id + '.json', `${name}: ชื่อไฟล์ตรงกับ id`);
  if (json.fictional) ok(name.startsWith('fictional-'), `${name}: ผังสมมุติขึ้นต้นชื่อไฟล์ด้วย fictional-`);
}
ok(pack.levels.every(l => !l.error), 'ทุกด่านมีผังที่ใช้ได้', pack.levels.filter(l => l.error).map(l => l.error).join(' | '));

/* ---------- 2) เทียบกับต้นแบบ ---------- */
section('ข้อมูล JSON ตรงกับ LAYOUTS / LEVELS / ERAS ของต้นแบบ v2');
const proto = prototypeData();
same(pack.eras, proto.ERAS, 'ERAS เท่ากันทุกฟิลด์');
ok(pack.levels.length === proto.LEVELS.length && pack.levels.length === 12, 'มี 12 ด่าน');
const layOf = {};
pack.levels.forEach((l, i) => {
  const p = proto.LEVELS[i];
  const { lay, ...rest } = p;
  const mine = {}; for (const k in rest) mine[k] = l[k];
  same(mine, rest, `ด่าน ${i + 1}: ฟิลด์เท่ากับต้นแบบ (รวมตารางขบวน)`);
  ok(!layOf[lay] || layOf[lay] === l.station, `ด่าน ${i + 1}: ใช้ผังชุดเดียวกับต้นแบบ`); layOf[lay] = l.station;
});
for (const lay in proto.LAYOUTS) {
  const P = proto.LAYOUTS[lay], L = stations[layOf[lay]];
  if (!L) { ok(false, `ผัง ${lay}: ไม่มีด่านไหนใช้`); continue; }
  const strip = E => Object.fromEntries(Object.entries(E).map(([k, e]) => [k, { pts: e.pts, sig: e.sig, plat: e.plat, next: e.next, exit: e.exit, len: e.len, seg: e.seg }]));
  same(strip(L.E), strip(P.E), `ผัง ${lay} (${L.id}): ขอบรางเท่ากัน`);
  same(L.P, P.P, `ผัง ${lay}: ประแจเท่ากัน`);
  same(Object.fromEntries(Object.entries(L.S).map(([k, s]) => [k, { edge: s.edge, lx: s.lx, ly: s.ly }])), P.S, `ผัง ${lay}: สัญญาณเท่ากัน`);
  same(L.REQ, P.REQ, `ผัง ${lay}: ตารางเส้นทาง (REQ) ที่คำนวณจากกราฟ เท่ากับที่ต้นแบบเขียนมือ`);
  same(L.plats, P.plats, `ผัง ${lay}: ชานชาลาเท่ากัน`);
  ok(L.inY === P.inY, `ผัง ${lay}: inY เท่ากัน`);
}

/* ---------- 3) บอท 12 ด่าน ---------- */
section('บอทเล่น 12 ด่านบน src/sim (Node)');
const ev1 = [], run1 = playAll(nodeHook(sim, pack, ev1)), ev2 = [], run2 = playAll(nodeHook(sim, pack, ev2));
console.table(run1.map((r, i) => ({ ด่าน: r.level, ผล: r.state, ส่งออก: r.trains, 'sim %': r.pct, 'ต้นแบบ %': PROTOTYPE_PCT[i], คะแนน: +r.score.toFixed(3) })));
run1.forEach((r, i) => {
  ok(r.state === 'win', `ด่าน ${r.level}: ชนะ`, `state = ${r.state}`);
  ok(r.trains === `${pack.levels[i].trains.length}/${pack.levels[i].trains.length}`, `ด่าน ${r.level}: ส่งออกครบ`, r.trains);
  ok(r.pct === PROTOTYPE_PCT[i], `ด่าน ${r.level}: เปอร์เซ็นต์เท่าต้นแบบ`, `sim ${r.pct} ต้นแบบ ${PROTOTYPE_PCT[i]}`);
});
same(run2, run1, 'เล่นซ้ำได้ผลเดิมทุกค่า (deterministic)');
same(ev2, ev1, 'ลำดับ event เหมือนเดิมทุกตัวเมื่อเล่นซ้ำ');
ok(ev1.filter(e => e.type === 'win').length === 12 && !ev1.some(e => e.type === 'fail'), 'ได้ event win 12 ครั้ง ไม่มี fail');

/* ---------- 4) กรณีผิดกติกา ---------- */
const play = (i, events = []) => { const g = sim.createGame(pack, i, { onEvent: ev => events.push(ev) }); sim.startGame(g); return { g, events }; };
const run = (g, sec, dt = 0.05) => { for (let n = Math.round(sec / dt); n > 0 && g.state === 'play'; n--) sim.step(g, dt); };
const lastMsg = events => events.filter(e => e.type === 'msg').pop();
const levelOf = (era, plats) => pack.levels.findIndex(l => l.era === era && l.L.plats.length === plats);

section('อินเตอร์ล็อกปฏิเสธทางที่ขัดกัน (ยุคที่มีอินเตอร์ล็อก)');
{
  const { g, events } = play(levelOf(1, 3)); // ยุค 1856 ผัง 3 ชานชาลา
  ok(g.era.interlock && !g.era.nx, 'ใช้ด่านยุคอินเตอร์ล็อกเครื่องกล');
  ok(sim.tapSignal(g, 'T2') === true && g.S.T2.aspect === 'G', 'ตั้งทางออก T2 ได้');
  ok(g.P.P3.lock && g.P.P4.lock && g.lockOf.out && g.lockOf.out.sig === 'T2', 'ประแจ P3, P4 และขอบราง out ถูกล็อกโดยทางของ T2');
  ok(sim.tapPoint(g, 'P4') === false && g.P.P4.pos === 'N', 'สลับประแจ P4 ที่ถูกล็อกไม่ได้');
  ok(/ถูกล็อกโดยทางของ T2/.test(lastMsg(events).text) && lastMsg(events).kind === 'bad', 'บอกเหตุผล: ถูกล็อกโดยทางของ T2', lastMsg(events).text);
  ok(sim.tapSignal(g, 'T1') === false && g.S.T1.aspect === 'R', 'เปิด T1 (ใช้ขอบราง out ร่วมกับ T2) ไม่ได้');
  ok(/^ไม่ให้สัญญาณ/.test(lastMsg(events).text), 'บอกเหตุผล: ไม่ให้สัญญาณ', lastMsg(events).text);
  ok(sim.tapSignal(g, 'T3') === false && g.S.T3.aspect === 'R', 'เปิด T3 (ต้องใช้ P3 อีกทาง) ไม่ได้');
  ok(g.routes.length === 1, 'มีเส้นทางล็อกอยู่เส้นเดียว');
  // บังคับสถานะให้เส้นทางทับกันโดยประแจไม่ขัด เพื่อทดสอบชั้นตรวจขอบรางซ้อน
  g.P.P3.lock = g.P.P4.lock = null; g.P.P4.pos = 'R';
  ok(sim.tapSignal(g, 'T1') === false && /เส้นทางทับกับทางของ T2/.test(lastMsg(events).text), 'ขอบรางที่ถูกล็อกแล้วตั้งทางซ้อนไม่ได้', lastMsg(events).text);
  g.P.P4.pos = 'N'; g.P.P3.lock = g.P.P4.lock = g.routes[0];
  ok(sim.tapSignal(g, 'T2') === true && g.S.T2.aspect === 'R' && !g.routes.length && !g.P.P3.lock && !g.P.P4.lock && !Object.keys(g.lockOf).length, 'ยกเลิก T2 แล้วปลดล็อกครบ');
  ok(sim.tapPoint(g, 'P4') === true && g.P.P4.pos === 'R' && sim.tapSignal(g, 'T1') === true, 'หลังยกเลิก ตั้งทาง T1 ได้');
}
{
  const { g, events } = play(levelOf(1, 2)); // ชานชาลามีรถอยู่
  sim.tapPoint(g, 'P1'); run(g, 4); ok(sim.tapSignal(g, 'S1') === true, 'ให้ขบวนแรกเข้าชานชาลา 1');
  run(g, 9);
  ok(sim.edgeOccupied(g, 'p1'), 'ขบวนแรกอยู่ที่ชานชาลา 1');
  ok(sim.tapSignal(g, 'S1') === false && /ชานชาลา 1 ยังมีรถอยู่/.test(lastMsg(events).text), 'ตั้งทางเข้าชานชาลาที่มีรถอยู่ไม่ได้', lastMsg(events).text);
  ok(g.state === 'play', 'เกมยังเล่นต่อได้');
}
{
  const { g } = play(levelOf(0, 3)); // ยุคไม่มีอินเตอร์ล็อก: คำสั่งเดียวกันผ่านหมด
  ok(!g.era.interlock, 'ใช้ด่านยุคบุกเบิก (ไม่มีอินเตอร์ล็อก)');
  ok(sim.tapSignal(g, 'T2') && sim.tapSignal(g, 'T1') && sim.tapSignal(g, 'T3') && g.S.T1.aspect === 'G' && g.S.T3.aspect === 'G', 'ยุคไม่มีอินเตอร์ล็อก เปิดสัญญาณขัดกันได้ (ไม่มีอะไรห้าม)');
  ok(sim.tapPoint(g, 'P4') && g.P.P4.pos === 'R' && !g.routes.length, 'และสลับประแจได้ทั้งที่สัญญาณเปิดอยู่');
}
{
  const { g, events } = play(levelOf(3, 3)); // ยุค NX
  ok(g.era.nx, 'ใช้ด่านยุค NX');
  ok(sim.tapPoint(g, 'P1') === false && g.P.P1.pos === 'N', 'ยุค NX กดประแจเองไม่ได้');
  sim.press(g, { kind: 'signal', id: 'S1' });
  ok(g.nxSel === 'S1' && g.S.S1.aspect === 'R', 'แตะ S1 = เลือกต้นทาง ยังไม่เปิดสัญญาณ');
  sim.press(g, { kind: 'platform', no: 3 });
  ok(g.nxSel === null && g.S.S1.aspect === 'G' && g.P.P1.pos === 'N' && g.P.P2.pos === 'R', 'แตะชานชาลา 3 = ระบบตั้ง P1 ตรง P2 แยก แล้วเปิด S1');
  ok(sim.autoRoute(g, 'T3', g.L.REQ.T3) === true && g.P.P3.pos === 'R', 'ตั้งทางออก T3 อัตโนมัติ');
  ok(sim.autoRoute(g, 'T2', g.L.REQ.T2) === false && g.P.P3.pos === 'R' && /ประแจ P3 ถูกล็อกโดยทางของ T3/.test(lastMsg(events).text), 'ทางออก T2 ที่ขัดกับ T3 ถูกปฏิเสธ ประแจไม่ขยับ', lastMsg(events).text);
  sim.press(g, { kind: 'signal', id: 'S1' });
  ok(g.S.S1.aspect === 'R' && !g.lockOf.p3, 'แตะ S1 ที่เปิดอยู่ = ยกเลิกทาง');
}

section('ชนกัน ตกราง รอนาน ต้องแพ้');
{
  const events = [], { g } = play(levelOf(0, 1), events); // ยุคบุกเบิก 1 ชานชาลา
  run(g, 3); sim.tapSignal(g, 'S1'); run(g, 14);
  ok(g.trains[0].id === 1 && g.E[g.trains[0].edge].plat === 1 && g.trains[0].stopped, 'ขบวน 1 จอดอยู่ที่ชานชาลา');
  run(g, 6); sim.tapSignal(g, 'S1'); run(g, 15); // ปล่อยขบวน 2 ตามเข้าไปทั้งที่ชานชาลาไม่ว่าง
  ok(g.state === 'fail', 'ปล่อยรถเข้าชานชาลาที่มีรถอยู่ = แพ้', `state = ${g.state}`);
  const f = events.find(e => e.type === 'fail');
  ok(f && f.title === 'รถชนกัน!' && /ขบวน 1 กับขบวน 2/.test(f.why) && f.lesson === g.era.lesson, 'event fail: รถชนกัน! พร้อมเหตุผลและบทเรียนของยุค', JSON.stringify(f));
  const t = g.time, sc = g.score; sim.step(g, 0.05);
  ok(g.time === t && g.score === sc, 'แพ้แล้วเวลาไม่เดินต่อ');
}
{
  const events = [], { g } = play(levelOf(0, 2), events); // ตกราง: ประแจตามตั้งผิดทาง
  run(g, 3); sim.tapSignal(g, 'S1'); run(g, 12); // ขบวนแรก (ชานชาลา 2) เข้าทางตรง
  sim.tapPoint(g, 'P2'); sim.tapSignal(g, 'T2'); run(g, 10);
  const f = events.find(e => e.type === 'fail');
  ok(g.state === 'fail' && f && f.title === 'ตกราง!' && /ฝ่าประแจ P2/.test(f.why), 'วิ่งฝ่าประแจตามที่ตั้งผิด = ตกราง', JSON.stringify(f));
}
{
  const events = [], { g } = play(levelOf(0, 2), events); // ตกราง: สลับประแจใต้ท้องรถ
  run(g, 3); sim.tapSignal(g, 'S1');
  while (g.state === 'play' && !sim.nearPoint(g, g.P.P1)) sim.step(g, 0.05);
  sim.tapPoint(g, 'P1');
  const f = events.find(e => e.type === 'fail');
  ok(g.state === 'fail' && f && /สลับประแจ P1 ขณะรถกำลังผ่าน/.test(f.why), 'สลับประแจขณะรถทับ (ยุคไม่มีอินเตอร์ล็อก) = ตกราง', JSON.stringify(f));
}
{
  const { g, events } = play(levelOf(1, 2)); // ยุคอินเตอร์ล็อก: ประแจที่รถทับสลับไม่ได้
  sim.tapPoint(g, 'P1'); run(g, 3); sim.tapSignal(g, 'S1');
  while (g.state === 'play' && !sim.nearPoint(g, g.P.P1)) sim.step(g, 0.05);
  g.P.P1.lock = null; // ถอดล็อกเส้นทางออก เหลือแต่การตรวจรถทับ
  ok(sim.tapPoint(g, 'P1') === false && g.P.P1.pos === 'R' && g.state === 'play' && /มีรถทับอยู่/.test(lastMsg(events).text), 'ยุคอินเตอร์ล็อก: ประแจที่รถทับอยู่สลับไม่ได้ ไม่ตกราง', lastMsg(events).text);
}
{
  const events = [], i = pack.levels.findIndex(l => l.maxWait), { g } = play(i, events);
  run(g, g.lv.maxWait + 20);
  const f = events.find(e => e.type === 'fail');
  ok(g.state === 'fail' && f && f.title === 'ผู้โดยสารร้องเรียน!', `ด่าน ${i + 1}: ปล่อยให้รอเกิน ${g.lv.maxWait} วินาที = แพ้`, JSON.stringify(f));
}

/* ---------- 5) JSON เสีย ---------- */
section('JSON ผังเสีย ได้ error ที่อ่านรู้เรื่อง และไม่ทำให้เกมพัง');
const good = () => structuredClone(stationJson.find(s => s.json.layout.platforms.length === 2).json);
const broken = [
  ['ไม่ใช่อ็อบเจกต์', () => 'สวัสดี', /ต้องเป็นอ็อบเจกต์ JSON/],
  ['null', () => null, /ต้องเป็นอ็อบเจกต์ JSON/],
  ['schema ผิดรุ่น', j => { j.schema = 99; }, /^schema: ต้องเป็น 1/],
  ['ไม่มี fictional', j => { delete j.fictional; }, /^fictional:/],
  ['ไม่มี verified', j => { delete j.verified; }, /^verified:/],
  ['สถานีจริงไม่มีแหล่งอ้างอิง', j => { j.fictional = false; }, /^sources: สถานีจริงต้องมีแหล่งอ้างอิง/],
  ['ไม่มี layout', j => { delete j.layout; }, /^layout: ไม่พบผัง/],
  ['next ชี้ขอบรางที่ไม่มี', j => { j.layout.edges.b.next = 'zz'; }, /^layout\.edges\.b\.next: ไม่พบขอบราง "zz"/],
  ['จุดไม่ใช่ตัวเลข', j => { j.layout.edges.c.pts[1] = [360, 'x']; }, /^layout\.edges\.c\.pts: ต้องเป็นรายการจุด/],
  ['จุดเดียว', j => { j.layout.edges.c.pts = [[190, 300]]; }, /^layout\.edges\.c\.pts:/],
  ['ท่อนยาว 0', j => { j.layout.edges.c.pts = [[190, 300], [190, 300]]; }, /ท่อนรางยาว 0/],
  ['ไม่มี next และไม่ใช่ขาออก', j => { delete j.layout.edges.c.next; }, /^layout\.edges\.c\.next: ต้องเป็นชื่อขอบรางถัดไป/],
  ['ประแจที่ไม่มี', j => { j.layout.edges.ap.next.pt = 'P9'; }, /^layout\.edges\.ap\.next\.pt: ไม่พบประแจ "P9"/],
  ['ทางประแจไม่ตรงกัน', j => { j.layout.points.P1.R = 'c'; j.layout.points.P1.N = 'b'; }, /ทาง N\/R ไม่ตรงกับ layout\.points\.P1/],
  ['ประแจตามตั้งผิดขา', j => { j.layout.edges.x1.next.as = 'N'; }, /layout\.points\.P2\.N ไม่ได้ชี้มาที่ขอบรางนี้/],
  ['ประแจไม่ถูกใช้', j => { j.layout.points.P7 = { x: 1, y: 1, N: 'b', R: 'c', facing: true }; }, /^layout\.points\.P7: ประแจสวนต้องมีขอบรางเข้าหา/],
  ['สัญญาณชี้ขอบรางที่ไม่มี', j => { j.layout.signals.T1.edge = 'p9'; }, /^layout\.signals\.T1\.edge: ไม่พบขอบราง "p9"/],
  ['ทิศสัญญาณไม่ตรงทิศราง', j => { j.layout.signals.S1.dir = 'W'; }, /^layout\.signals\.S1\.dir: ทิศของสัญญาณ/],
  ['ชานชาลาซ้ำเลข', j => { j.layout.platforms[1].no = 1; }, /เลขชานชาลา 1 ซ้ำ/],
  ['ชานชาลาไม่มีสัญญาณออก', j => { delete j.layout.signals.T2; delete j.layout.edges.p2.sig; }, /ต้องมีสัญญาณออกที่ปลายทาง/],
  ['ไม่มีขาเข้า', j => { j.layout.entries = []; }, /^layout\.entries: ต้องมีขอบรางขาเข้า/],
  ['ขาออกไม่อยู่ใน exits', j => { j.layout.exits = []; }, /ไม่อยู่ใน layout\.exits|^layout\.exits:/],
  ['รางวนเป็นวง', j => { j.layout.edges.c.next = 'ap'; }, /รางวนเป็นวง: ap → c → ap/],
  ['ขอบรางลอย', j => { j.layout.edges.zz = { pts: [[0, 0], [10, 0]], next: 'out' }; }, /^layout\.edges\.zz: ไปไม่ถึงจากขาเข้าใดเลย/],
];
for (const [name, mutate, want] of broken) {
  let j = good(); const r0 = mutate(j); if (r0 !== undefined) j = r0;
  let res, threw = null;
  try { res = sim.loadStation(j); } catch (e) { threw = e; }
  ok(!threw, `ผังเสีย (${name}): ไม่ throw`, threw && threw.message);
  ok(res && res.ok === false && res.errors.some(m => want.test(m)), `ผังเสีย (${name}): error อ่านรู้เรื่อง`, res && JSON.stringify(res.errors || 'ผ่านตัวตรวจ'));
}
ok(sim.loadStation(good()).ok === true, 'ผังที่ไม่ได้แก้ผ่านตัวตรวจ');
{
  // ผังเสีย 1 ไฟล์: ด่านที่ใช้ผังนั้นถูกปิด ด่านอื่นยังเล่นได้
  const list = stationJson.map(s => ({ name: s.name, json: structuredClone(s.json) }));
  const victim = list.find(s => s.json.layout.platforms.length === 2); victim.json.layout.edges.b.next = 'zz';
  const r = sim.loadStations(list), p = sim.loadLevelPack(readJson('data/levels/history.json'), r.stations, { [victim.json.id]: r.errors[victim.name] });
  ok(Object.keys(r.errors).length === 1 && Object.keys(r.stations).length === list.length - 1, 'ผังเสีย 1 ไฟล์ ไฟล์อื่นยังโหลดได้');
  ok(p.ok && p.pack.levels.filter(l => l.error).length === 2 && /ไม่พบขอบราง "zz"/.test(p.pack.levels[1].error), 'ด่านที่ใช้ผังเสียมี lv.error บอกสาเหตุ', p.ok ? p.pack.levels[1].error : p.errors.join('|'));
  let threw = null; try { sim.createGame(p.pack, 1); } catch (e) { threw = e; }
  ok(threw && /เล่นไม่ได้/.test(threw.message), 'createGame ด่านที่ผังเสีย = error ชัดเจน');
  const g = sim.createGame(p.pack, 0); sim.startGame(g); run(g, 2);
  ok(g.state === 'play', 'ด่านที่ผังดียังเล่นได้');
}
{
  const lj = () => readJson('data/levels/history.json');
  const cases = [
    [j => { j.levels[0].era = 9; }, /^levels\[0\]\.era: ไม่มียุคลำดับ 9/],
    [j => { j.levels[2].trains.pattern = '12x'; }, /^levels\[2\]\.trains\.pattern:/],
    [j => { j.levels[3].speed = 0; }, /^levels\[3\]\.speed:/],
    [j => { delete j.eras[1].interlock; }, /^eras\[1\]\.interlock:/],
    [j => { j.levels = []; }, /^levels: ต้องมีอย่างน้อย 1 ด่าน/],
  ];
  for (const [mutate, want] of cases) {
    const j = lj(); mutate(j); const r = sim.loadLevelPack(j, stations);
    ok(!r.ok && r.errors.some(m => want.test(m)), `ชุดด่านเสีย: ${want}`, JSON.stringify(r.errors || 'ผ่าน'));
  }
  const j = lj(); j.levels[0].trains.pattern = '13'; const r = sim.loadLevelPack(j, stations);
  ok(r.ok && /ตารางขบวนอ้างชานชาลา/.test(r.pack.levels[0].error || ''), 'ตารางขบวนอ้างชานชาลาที่ผังไม่มี = ปิดเฉพาะด่านนั้น');
}

/* ---------- 6) เซฟ ---------- */
section('โมดูลเซฟ');
{
  const be = memoryBackend(), s = createSave(be);
  ok(s.getStars('history', 0) === 0 && !s.hasProgress('history'), 'เซฟเปล่า = 0 ดาว');
  ok(s.setStars('history', 2, 2) === true && s.getStars('history', 2) === 2, 'บันทึกดาวได้');
  s.setStars('history', 2, 1); ok(s.getStars('history', 2) === 2, 'เก็บดาวที่ดีที่สุด');
  ok(createSave(be).getStars('history', 2) === 2 && JSON.parse(be.read()).v === SAVE_VERSION, 'เปิดใหม่อ่านค่าเดิมได้ และมีเลขเวอร์ชัน');
  const code = s.exportCode(), other = createSave(memoryBackend());
  ok(/^SJ1\.[A-Za-z0-9+/=]+$/.test(code) && other.importCode(code) && other.getStars('history', 2) === 2, 'รหัสสำรองเกม: ส่งออกแล้วนำเข้าอีกเครื่องได้');
  ok(other.importCode('SJ1.@@@') === false && other.importCode('xyz') === false && other.importCode(null) === false && other.getStars('history', 2) === 2, 'รหัสเสีย: ปฏิเสธและไม่แตะเซฟเดิม');
  same(migrate({ stars: [3, , 1] }), { v: 1, packs: { history: { stars: [3, 0, 1] } } }, 'ตัวแปลงเซฟเก่า: รูปแบบของต้นแบบ v2 -> v1');
  same(migrate({ v: 99, packs: {} }), { v: 1, packs: {} }, 'เซฟจากรุ่นใหม่กว่า = เริ่มเปล่า ไม่พัง');
  ok(createSave(memoryBackend('{เสีย')).getStars('history', 0) === 0, 'ข้อมูลในที่เก็บเสีย = เริ่มเปล่า ไม่พัง');
  const angry = { read() { throw new Error('quota'); }, write() { throw new Error('quota'); } };
  let threw = null, s2; try { s2 = createSave(angry); s2.setStars('history', 0, 3); } catch (e) { threw = e; }
  ok(!threw && s2.getStars('history', 0) === 3 && s2.setStars('history', 1, 1) === false, 'ที่เก็บ throw ทุกครั้ง: เกมไม่พัง ค่าอยู่ในหน่วยความจำ และ setStars คืน false');
  threw = null; let s3; try { s3 = createSave(); s3.setStars('history', 0, 1); } catch (e) { threw = e; } // Node ไม่มี localStorage
  ok(!threw && s3.getStars('history', 0) === 1, 'backend เริ่มต้น (localStorage) ใช้ไม่ได้ก็ไม่พัง');
}

/* ---------- 7) ความเร็ว ---------- */
section('ความเร็วของ step ที่ 20 ขบวนพร้อมกัน (วัดบนเครื่องที่รันเทสต์ ไม่ใช่มือถือ)');
{
  // ผัง 3 ชานชาลา วางขบวน 20 คันเรียงบนขอบรางโดยไม่ชนกัน แล้วจับเวลางานต่อก้าว (ย้ายขบวน + ตรวจชน)
  const g = sim.createGame(pack, 11); g.state = 'play';
  for (const [edge, n] of [['in', 2], ['p1', 3], ['p2', 3], ['p3', 3], ['out', 3], ['b', 2], ['x1', 2], ['d', 1], ['x3', 1]]) for (let k = 0; k < n; k++) {
    const t = sim.spawn(g, 1 + (k % 3)), e = g.E[edge]; t.edge = edge; t.s = 76 + 86 * k; t.trail = [];
    for (let d = sim.TL; d >= 0; d -= 0.8) t.trail.push({ ...sim.posAt(e, t.s - d), e: edge });
  }
  sim.checkCollisions(g);
  ok(g.state === 'play', 'ฉากจับเวลาไม่มีขบวนชนกัน (ตรวจชนต้องไล่ครบทุกคู่)');
  const N = 2000, t0 = process.hrtime.bigint();
  for (let n = 0; n < N; n++) { for (const t of g.trains) sim.moveTrain(g, t, 0); sim.checkCollisions(g); g.state = 'play'; }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6 / N;
  console.log(`  20 ขบวน: ${ms.toFixed(3)} ms ต่อก้าว (เฟรมละ 2 ก้าว = ${(2 * ms).toFixed(3)} ms จากงบ 16.7 ms)`);
  ok(g.trains.length === 20, 'มี 20 ขบวนในผัง');
  ok(2 * ms < 4, 'sim ใช้ไม่เกิน 4 ms ต่อเฟรมบนเครื่องเทสต์', `${(2 * ms).toFixed(2)} ms`);
}

console.log(`\n${checks - fails}/${checks} ข้อผ่าน`);
if (fails) { console.error('✗ sim-test ไม่ผ่าน'); process.exit(1); }
console.log('✓ sim-test ผ่าน');
