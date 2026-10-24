// เทสต์ขบวนสินค้าและลำดับความสำคัญ (WP8 / M5) ใน Node ล้วน — ใช้: node test/freight-test.mjs
// ผังสมมุติ fictional-crossing-1-loop (k1 = loop1 ทาง 1, k2 = main ทาง 2, ขา W/E)
import fs from 'node:fs';
import path from 'node:path';
import * as sim from '../src/sim/index.js';

const root = path.resolve(import.meta.dirname, '..');
const readJson = f => JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));
let fails = 0, checks = 0;
const ok = (cond, name, detail = '') => { checks++; if (!cond) { fails++; console.error(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); } };
const section = s => console.log(`\n== ${s}`);

const stationJson = fs.readdirSync(path.join(root, 'data/stations')).filter(f => f.endsWith('.json')).sort().map(f => ({ name: f, json: readJson('data/stations/' + f) }));
const { stations, errors: stationErrors } = sim.loadStations(stationJson);
const testJson = readJson('data/levels/test-crossing.json');
const X = 'fictional-crossing-1-loop', TC = 2;
const packOf = (trains, extra = {}, st = stations) => sim.loadLevelPack({ schema: 2, id: 'fr', eras: testJson.eras,
  levels: [{ id: 'a', station: X, era: TC, name: 'ทดสอบ', goal: 'ทดสอบ', speed: 60, tips: [], trains, ...extra }] }, st, stationErrors);
function mk(trains, extra = {}) {
  const r = packOf(trains, extra);
  if (!r.ok || r.pack.levels[0].error) throw new Error((r.errors || [r.pack.levels[0].error]).join(' | '));
  const events = [], g = sim.createGame(r.pack, 0, { onEvent: ev => events.push(ev) });
  sim.startGame(g);
  return { g, events };
}
// บอทตามคำใบ้ (แบบเดียวกับ botPlay)
function play(g, limit = 400) {
  while (g.state === 'play' && g.time < limit) {
    for (let m = 0; m < 6 && g.state === 'play'; m++) { const t = sim.nextTarget(g); if (!t) break; sim.press(g, t); }
    sim.step(g, 0.05);
  }
  return g.state;
}
const run = (g, sec) => { for (let n = 0; n < sec * 120 && g.state === 'play'; n++) sim.step(g, sim.FIXED_DT); };
const scores = ev => ev.filter(e => e.type === 'score').map(e => `${e.reason}:${e.delta}`);

section('ขบวนสินค้า: ชนิด ความเร็ว ความยาว เวลาจอด');
{
  const fr = mk([{ at: 0, from: 'W', to: 'E', track: 'main', type: 'freight' }]);
  const ex = mk([{ at: 0, from: 'W', to: 'E', track: 'main', type: 'express' }]);
  const sp = fr.g.lv.sched[0];
  ok(sp.kind === 'freight' && !sp.exp && sp.plat === 2 && sp.dwell === sim.FREIGHT_DWELL && sim.FREIGHT_DWELL === 5, 'ตาราง: kind freight จอดทาง main (2) เวลาจอดเริ่มต้น 5 วินาที', JSON.stringify(sp));
  ok(ex.g.lv.sched[0].kind === 'express', 'ตาราง: ขบวนด่วนมี kind express');
  run(fr.g, 1); run(ex.g, 1);
  const a = fr.g.trains[0], b = ex.g.trains[0];
  ok(a.kind === 'freight' && a.exp === false && b.kind === 'express' && b.exp === true, 'ขบวนมี t.kind และคง t.exp');
  ok(Math.abs(a.s / b.s - sim.FREIGHT_SPEED) < 1e-6 && sim.FREIGHT_SPEED === 0.7, `สินค้าวิ่งช้ากว่า (${a.s.toFixed(1)} กับ ${b.s.toFixed(1)})`);
  ok(a.len === sim.FREIGHT_LEN && sim.FREIGHT_LEN === sim.TL * 1.5 && b.len === sim.TL, 'สินค้ายาว 1.5×TL ขบวนอื่นยาว TL');
  ok(sim.snapshot(fr.g).trains[0].kind === 'freight' && sim.snapshot(fr.g).queue.length === 0, 'snapshot ส่ง kind ให้ตัววาด');
  // หลังวิ่งพ้นความยาวขบวน หางขบวนยาวราว FREIGHT_LEN
  const g = mk([{ at: 0, from: 'W', to: 'E', track: 'main', type: 'freight' }]).g;
  play(g, 8);
  const t = g.trains[0]; let L = 0;
  for (let i = 1; i < t.trail.length; i++) L += Math.hypot(t.trail[i].x - t.trail[i - 1].x, t.trail[i].y - t.trail[i - 1].y);
  ok(Math.abs(L - sim.FREIGHT_LEN) < 3, `หางขบวนสินค้ายาว ${L.toFixed(1)}`);
}

section('คะแนนขบวนสินค้า: จอดถูกทาง 60 + ออกถูกขา 40, ผ่านไม่จอด 100');
{
  const { g, events } = mk([{ at: 0, from: 'W', to: 'E', track: 'main', type: 'freight' }]);
  ok(g.max === 100, `g.max ขบวนสินค้า 1 ขบวน = 100 (ได้ ${g.max})`);
  ok(play(g) === 'win', 'บอทเล่นจบ');
  ok(scores(events).join() === 'freight-arrived:60,freight-departed:40', 'คะแนนจอด 60 ออก 40', scores(events).join());
  const m = events.filter(e => e.type === 'msg').map(e => e.text);
  ok(m.some(x => /ขบวนสินค้า 1 เข้าทาง 2 ถูกต้อง \+60/.test(x)), 'ข้อความเข้าจอดของขบวนสินค้า');
  ok(!m.some(x => /ผู้โดยสาร/.test(x)), 'ข้อความขบวนสินค้าไม่พูดถึงผู้โดยสาร');
  const arr = events.findIndex(e => e.type === 'train' && e.what === 'arrive');
  ok(arr >= 0, 'ขบวนสินค้าเข้าจอด');
}
{
  const { g, events } = mk([{ at: 0, from: 'W', to: 'E', track: 'main', type: 'freight', stop: false }]);
  ok(g.lv.sched[0].exp && g.lv.sched[0].via === 2 && g.lv.sched[0].kind === 'freight', 'สินค้า stop: false = ผ่านทาง main ไม่จอด');
  ok(play(g) === 'win', 'บอทเล่นจบ (สินค้าผ่าน)');
  ok(scores(events).join() === 'freight-through:100', 'ผ่านไม่ถูกกัก 100', scores(events).join());
  ok(events.some(e => e.type === 'msg' && /ขบวนสินค้า 1 ผ่านไปได้ไม่ต้องหยุด \+100/.test(e.text)), 'ข้อความสินค้าผ่าน');
}
{ // ถูกกักที่ทาง (ไม่เปิดเสาออก) แล้วค่อยปล่อย = 40
  const { g, events } = mk([{ at: 0, from: 'W', to: 'E', track: 'main', type: 'freight', stop: false }]);
  sim.press(g, { kind: 'signal', id: 'S1' }); // ประแจท่าปกติพาเข้าทาง main แต่ไม่เปิดเสาออก
  ok(g.S.S1.aspect === 'G', 'เปิดเสาเข้า S1 ได้');
  run(g, 25);
  ok(g.trains[0] && g.trains[0].state === 'ready' && g.trains[0].delayed, 'สินค้าที่ไม่ได้เปิดเสาออกถูกกักที่ทาง');
  ok(events.some(e => e.type === 'msg' && /ขบวนสินค้า 1 ต้องหยุดรอ/.test(e.text)), 'ข้อความสินค้าถูกกัก');
  play(g);
  ok(g.state === 'win' && scores(events).join() === 'freight-through:40', 'ผ่านแต่ถูกกัก 40', `${g.state} ${scores(events).join()}`);
}
{
  const r = packOf([{ at: 0, from: 'W', to: 'E', track: 'main' }, { at: 5, from: 'E', to: 'W', track: 'loop1', type: 'freight' }, { at: 9, from: 'W', to: 'E', type: 'express' }]);
  const g = sim.createGame(r.pack, 0);
  ok(g.max === 150 + 100 + 150, `g.max ผสมชนิดขบวน = 400 (ได้ ${g.max})`);
}

section('ตัวตรวจตารางขบวนสินค้า');
{
  const r = packOf([{ at: 0, from: 'W', to: 'E', type: 'freight' }]);
  ok(!r.ok && r.errors.some(e => /trains\[0\]\.track/.test(e) && /ขบวนสินค้า/.test(e)), 'ปฏิเสธ freight ที่ไม่มี track', (r.errors || []).join(' | '));
  const r2 = packOf([{ at: 0, from: 'W', to: 'E', type: 'freight', stop: false }]);
  ok(!r2.ok && r2.errors.some(e => /trains\[0\]\.track/.test(e)), 'ปฏิเสธ freight stop: false ที่ไม่มี track');
  const r3 = packOf([{ at: 0, from: 'W', to: 'E', track: 'main', type: 'cargo' }]);
  ok(!r3.ok && r3.errors.some(e => /freight/.test(e)), 'ปฏิเสธ type ที่ไม่รู้จัก');
  const r4 = packOf([{ origin: 'main', to: 'E', type: 'freight', track: 'main' }]);
  ok(!r4.ok && r4.errors.some(e => /origin/.test(e)), 'ปฏิเสธขบวนสินค้าต้นทาง (origin)');
  const r5 = packOf([{ at: 0, from: 'W', to: 'E', track: 'main', type: 'freight' }], { priority: 'yes' });
  ok(!r5.ok && r5.errors.some(e => /priority/.test(e)), 'ปฏิเสธ priority ที่ไม่ใช่ true/false');
  // ทางสั้นกว่าขบวนสินค้า (ยาวพอสำหรับขบวนโดยสาร)
  const j = structuredClone(stationJson.find(s => s.json.id === X).json);
  j.layout.tracks.k1.pts = [[360, 210], [470, 210]]; j.layout.tracks.x1.pts[0] = [470, 210];
  const s = sim.loadStation(j);
  ok(s.ok, 'ผังทาง 1 สั้น (110) ยังผ่านตัวตรวจผัง', (s.errors || []).join(' | '));
  if (s.ok) {
    const r6 = packOf([{ at: 0, from: 'W', to: 'E', track: 'loop1', type: 'freight' }], {}, { [X]: s.station });
    ok(r6.ok && /สั้นกว่าขบวนสินค้า/.test(r6.pack.levels[0].error || ''), 'ปฏิเสธขบวนสินค้าที่จอดทางสั้นกว่าขบวน', r6.ok ? r6.pack.levels[0].error : r6.errors.join());
    const r7 = packOf([{ at: 0, from: 'W', to: 'E', track: 'loop1' }], {}, { [X]: s.station });
    ok(r7.ok && !r7.pack.levels[0].error, 'ขบวนโดยสารจอดทางเดียวกันได้');
  }
}

section('ลำดับความสำคัญ: ค่าปรับรอนาน และข้อความ PRIORITY');
{
  // ไม่มีใครตั้งทาง: ขบวนรอหน้าเสาเข้า grace 6 วินาที แล้วเสียคะแนน 3/วินาที × ตัวคูณ
  const penalty = (type, priority) => {
    const row = { at: 0, from: 'W', to: 'E', type, ...(type === 'express' ? {} : { track: 'main' }) };
    const { g } = mk([row], priority ? { priority: true } : {});
    run(g, 30);
    const t = g.trains[0];
    return { lost: -g.score, wait: t.wait };
  };
  const exp = (sec, mul) => 3 * mul * (sec - 6);
  for (const [type, mul] of [['express', 2], ['local', 1], ['freight', 0.5]]) {
    const on = penalty(type, true), off = penalty(type, false);
    ok(Math.abs(on.lost - exp(on.wait, mul)) < 0.2, `priority: ${type} เสีย ×${mul} (${on.lost.toFixed(1)})`);
    ok(Math.abs(off.lost - exp(off.wait, 1)) < 0.2, `ไม่มี priority: ${type} เสีย ×1 เท่าเดิม (${off.lost.toFixed(1)})`);
  }
  ok(sim.PRIORITY_MUL.express === 2 && sim.PRIORITY_MUL.local === 1 && sim.PRIORITY_MUL.freight === 0.5, 'ค่าคงที่ PRIORITY_MUL');
}
{
  const { g, events } = mk([{ at: 0, from: 'W', to: 'E', track: 'main', type: 'freight' }, { at: 1, from: 'E', to: 'W', type: 'express' }], { priority: true });
  run(g, 40);
  const pr = events.filter(e => e.type === 'msg' && e.code === 'PRIORITY');
  ok(pr.length === 1, `ด่วนรอเกิน grace ขณะมีสินค้าในผัง: เตือน PRIORITY ครั้งเดียว (ได้ ${pr.length})`);
  ok(pr[0] && /ขบวนด่วน 2/.test(pr[0].text) && /สินค้า/.test(pr[0].text) && /ทางหลีก/.test(pr[0].text), 'ข้อความ PRIORITY บอกให้หลบสินค้าเข้าทางหลีก', pr[0] && pr[0].text);
  const t = mk([{ at: 0, from: 'W', to: 'E', track: 'main' }, { at: 1, from: 'E', to: 'W', type: 'express' }], { priority: true });
  run(t.g, 40);
  ok(!t.events.some(e => e.code === 'PRIORITY'), 'ไม่มีขบวนสินค้า = ไม่เตือน PRIORITY');
}

section('ด่านเดิมไม่เปลี่ยน: คะแนนเต็มยังเป็นจำนวนขบวน × 150');
for (const f of ['history.json', 'namtok.json', 'test-crossing.json']) {
  const r = sim.loadLevelPack(readJson('data/levels/' + f), stations, stationErrors);
  ok(r.ok, `${f} โหลดได้`);
  if (!r.ok) continue;
  r.pack.levels.forEach((lv, i) => {
    if (lv.error) return;
    const g = sim.createGame(r.pack, i);
    ok(g.max === lv.trains.length * 150, `${f} ด่าน ${i + 1} g.max = ${lv.trains.length * 150}`, String(g.max));
    ok(!lv.priority && lv.sched.every(sp => sp.kind !== 'freight'), `${f} ด่าน ${i + 1} ไม่มี priority/สินค้า`);
  });
}

section('ขา (portal) สมมุติ: fictional: true');
{
  const j = structuredClone(stationJson.find(s => s.json.id === X).json);
  j.layout.portals.E.fictional = true;
  const s = sim.loadStation(j);
  ok(s.ok && s.station.portals.E.fictional === true && s.station.portals.W.fictional === false, 'เก็บ fictional ไว้ใน L.portals[k].fictional', (s.errors || []).join());
  j.layout.portals.E.fictional = 'yes';
  const b = sim.loadStation(j);
  ok(!b.ok && b.errors.some(e => /portals\.E\.fictional/.test(e)), 'ปฏิเสธ fictional ที่ไม่ใช่ true/false');
}

console.log(`\n${checks - fails}/${checks} ข้อผ่าน`);
if (fails) { console.error(`✗ freight-test ไม่ผ่าน ${fails} ข้อ`); process.exit(1); }
console.log('✓ freight-test ผ่าน');
