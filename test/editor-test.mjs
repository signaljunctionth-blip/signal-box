// เทสต์โหมดสร้าง (M4) ใน Node ล้วน — ใช้: node test/editor-test.mjs
// ตัวแก้ผังบนกริด -> ผัง schema 2 ที่เล่นได้จริง, ตารางอินเตอร์ล็อกอัตโนมัติ (เทียบกับเอนจินทุกคู่), รหัสแชร์ (เสีย/ถูกแก้ต้องไม่พัง)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import * as sim from '../src/sim/index.js';
import { createSave, memoryBackend } from '../src/save/index.js';
import { createWallet } from '../src/ui/wallet.js';

const require = createRequire(import.meta.url);
const { playHints } = require('./lib/bot.js');
const root = path.resolve(import.meta.dirname, '..');
const readJson = f => JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));

let fails = 0, checks = 0;
const ok = (cond, name, detail = '') => { checks++; if (!cond) { fails++; console.error(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); } };
const same = (a, b, name) => { const x = JSON.stringify(a), y = JSON.stringify(b); ok(x === y, name, x === y ? '' : `ได้ ${x.slice(0, 300)} แต่ควรเป็น ${y.slice(0, 300)}`); };
const section = s => console.log(`\n== ${s}`);

const stationJson = fs.readdirSync(path.join(root, 'data/stations')).filter(f => f.endsWith('.json')).sort().map(f => ({ name: f, json: readJson('data/stations/' + f) }));
const { stations } = sim.loadStations(stationJson);
const testJson = readJson('data/levels/test-crossing.json');
const NX = 3;

// ผังทางหลีก 1 ทาง วาดบนกริดแบบที่ผู้เล่นทำ: ทางประธานแถว 7, ทางหลีกแถว 5, ประแจที่ช่อง 5 และ 18
function loopPlan() {
  let p = sim.emptyPlan(24, 12, 'E');
  for (let i = 0; i < 24; i++) p = sim.toggleSeg(p, i, 7, 0);
  for (const [i, j, d] of [[5, 7, -1], [6, 6, -1], [16, 5, 1], [17, 6, 1]]) p = sim.toggleSeg(p, i, j, d);
  for (let i = 7; i < 16; i++) p = sim.toggleSeg(p, i, 5, 0);
  const cells = j => Array.from({ length: 9 }, (_, k) => [7 + k, j, 0]);
  p = sim.setPlatform(p, cells(7), 1); p = sim.setPlatform(p, cells(5), 2);
  for (const s of [[4, 7, 'E'], [19, 7, 'W'], [16, 7, 'E'], [7, 7, 'W'], [16, 5, 'E'], [7, 5, 'W']]) p = sim.toggleSignal(p, ...s);
  return p;
}
function packFor(station, trains, era = 2) {
  const all = { ...stations, [station.id]: station };
  const j = { schema: 2, id: 'editor', eras: testJson.eras, levels: [{ id: 'e', station: station.id, era, name: 'ผังของฉัน', goal: 'ทดสอบ', speed: 60, hints: true, tips: [], trains }] };
  const r = sim.loadLevelPack(j, all, {});
  if (!r.ok || r.pack.levels[0].error) throw new Error((r.errors || [r.pack.levels[0].error]).join(' | '));
  return r.pack;
}

section('ตัวแก้ผัง: ทางหลีกที่วาดบนกริดเป็นผังที่ผ่านตัวตรวจ');
const P0 = loopPlan();
const B0 = sim.buildPlan(P0);
ok(B0.ok, 'ผังทางหลีกผ่านตัวตรวจ', B0.errors.join(' | '));
{
  const L = B0.json.layout;
  same(Object.keys(L.points), ['P1', 'P2'], 'ประแจ 2 ตัว');
  same([L.points.P1.N, L.points.P1.R].map(t => B0.cells.tracks[t][0][2]), [0, -1], 'ประแจ: ขาตรง = N ขาเฉียง = R');
  same(Object.keys(L.signals).sort(), ['S1', 'S2', 'S3', 'S4', 'S5', 'S6'], 'เสา 6 ต้น');
  ok(L.signals.S1.type === 'home' && L.signals.S1.dir === 'E' && L.signals.S2.type === 'home' && L.signals.S2.dir === 'W', 'ชื่อเสา: เสาเข้าได้เลขน้อยสุด ปลายขาล่อง (W) S1 ปลายขาขึ้น S2');
  ok(L.signals.S3.dir === 'W' && L.platforms.find(p => p.no === 1).track === L.signals.S3.track && L.signals.S4.dir === 'E' && L.signals.S4.track === L.signals.S3.track, 'ชื่อเสา: เสาออกเรียงตามเลขทาง S3/S4 = ทาง 1, เลขคี่ด้าน W');
  same(Object.keys(L.portals), ['W', 'E'], 'ปลายที่ขอบกริดเป็นขาเข้าออก');
  ok(L.tracks[L.portals.W.track].pts[0][0] < 0 && L.tracks[L.portals.E.track].pts.at(-1)[0] > L.size[0], 'รางขาเข้าออกยื่นเลยขอบแผง');
  const P1 = sim.buildPlan({ ...P0, upDir: 'W' }).json.layout.signals;
  ok(P1.S1.dir === 'W' && P1.S2.dir === 'E', 'upDir = W: ปลายขาล่องอยู่ด้าน E เลขคี่ย้ายไปด้าน E');
  same(sim.planCount(P0), { straight: 33, diagonal: 4, points: 2, signals: 6, platformCells: 18 }, 'นับชิ้นส่วน');
  ok(sim.planCost(P0, { straight: 5, diagonal: 8, points: 40, signals: 15, platformCells: 30 }) === 33 * 5 + 4 * 8 + 80 + 90 + 540, 'คิดราคาจากตารางราคาที่ส่งเข้ามา');
  ok(JSON.stringify(sim.toggleSeg(sim.toggleSeg(P0, 2, 2, 0), 2, 2, 0)) === JSON.stringify(P0), 'วางแล้วรื้อราง = ผังเดิม');
  ok(!sim.toggleSeg(P0, 9, 7, 0).plats.some(s => s[0] === 9 && s[1] === 7), 'รื้อรางแล้วทางจอดบนช่องนั้นหายด้วย');
  ok(P0.segs.length === 37 && !sim.toggleSeg(P0, 23, 11, 1).segs.some(s => s[0] === 23 && s[1] === 11), 'วางรางเลยขอบกริดไม่ได้');
}

section('ตัวแก้ผัง: ผังที่ผิดได้ข้อความบอกตำแหน่ง');
{
  const err = p => sim.buildPlan(p).errors.join(' | ');
  ok(/ตรงประแจ/.test(err(sim.toggleSignal(P0, 5, 7, 'W'))), 'เสาทิศ W ตรงประแจด้านขาแยก');
  ok(/ตรงประแจ/.test(err(sim.toggleSignal(P0, 18, 7, 'E'))), 'เสาทิศ E ตรงประแจด้านขาแยก');
  ok(/ตัดกัน/.test(err(sim.toggleSeg(sim.toggleSeg(P0, 10, 0, 1), 10, 1, -1))), 'รางเฉียงตัดกันกลางช่อง');
  ok(/บรรจบ/.test(err(sim.toggleSeg(P0, 5, 7, 1))), 'ราง 4 เส้นที่จุดเดียว');
  ok(/สั้นกว่าขบวน/.test(err(sim.setPlatform(sim.setPlatform(P0, Array.from({ length: 9 }, (_, k) => [7 + k, 5, 0]), 0), [[7, 5, 0], [8, 5, 0]], 2))), 'ทางจอดสั้นกว่าขบวน');
  ok(/สัญญาณออก/.test(err(sim.toggleSignal(P0, 16, 5, 'E'))), 'ทางจอดไม่มีเสาออก');
  ok(/หลายท่อน/.test(err(sim.toggleSignal(P0, 11, 7, 'E'))), 'เสาคั่นกลางทางจอด');
  ok(/ไม่ต่อกับรางอื่น/.test(err(sim.toggleSeg(P0, 12, 9, 0))), 'รางลอยกลางผังถูกบอก');
  const lone = sim.toggleSeg(sim.emptyPlan(10, 4), 3, 1, 0);
  ok(!sim.buildPlan(lone).ok, 'รางลอยกลางผังที่ไม่มีขาเข้าออกไม่ผ่าน');
  for (const bad of [null, 1, 'x', [], {}, { v: 2 }, { v: 1, cols: 99, rows: 3 }, { v: 1, cols: 10, rows: 4, segs: 'x' }, { v: 1, cols: 10, rows: 4, segs: [[1, 1, 5], [-1, 0, 0], [3, 3, 1]], signals: [[0, 0, 'N']], plats: [[1, 1, 0, 1]] }]) {
    let r; try { r = sim.buildPlan(bad); } catch (e) { r = { threw: e.message }; }
    ok(r && !r.threw && r.ok === false && r.errors.length, `ข้อมูลเสีย ${JSON.stringify(bad)} ไม่ทำให้พัง`, r && r.threw);
  }
  // สุ่มผังมั่ว 300 ผัง: ต้องไม่ throw
  let seed = 7, threw = 0;
  const rnd = n => { seed = (seed * 1103515245 + 12345) >>> 0; return seed % n; };
  for (let n = 0; n < 300; n++) {
    let p = sim.emptyPlan(12, 6);
    for (let m = rnd(40); m > 0; m--) p = sim.toggleSeg(p, rnd(12), rnd(6), rnd(3) - 1);
    for (let m = rnd(6); m > 0; m--) p = sim.toggleSignal(p, rnd(13), rnd(6), rnd(2) ? 'E' : 'W');
    p = sim.setPlatform(p, p.segs.filter(() => rnd(3) === 0), 1 + rnd(3));
    try { const r = sim.buildPlan(p); if (r.ok) sim.routeTable(r.station); } catch (e) { threw++; if (threw === 1) console.error(e); }
  }
  ok(threw === 0, 'ผังสุ่ม 300 ผังไม่ทำให้ตัวตรวจหรือตารางพัง', `${threw} ผัง`);
}

section('ผังที่สร้างเล่นได้จริง (บอทตามคำใบ้หลีกขบวนจนจบ)');
{
  const st = { ...B0.station, id: 'custom' };
  for (const era of [1, 2, 3]) {
    const pack = packFor(st, [{ at: 1, from: 'W', to: 'E', track: 2 }, { at: 3, from: 'E', to: 'W', track: 1 }, { at: 40, from: 'W', to: 'E', track: 1 }], era);
    const [r] = playHints(sim, pack);
    ok(r.state === 'win', `ยุค ${testJson.eras[era].name}: ชนะ`, JSON.stringify(r));
  }
}

section('ภารกิจเดินรถอิสระ: เกมจัดตารางขบวนให้ผังที่สร้าง และบอทเล่นจบ');
{
  const career = readJson('data/levels/namtok.json');
  for (const era of [0, 1, 2, 3]) {
    const r = sim.freePlayPack({ ...B0.station, id: 'custom' }, career.eras, { era });
    ok(r.ok && r.trains.length === 4 && sim.botPlay(r.pack) === 'win', `ทางหลีก ยุค ${career.eras[era].name}: ตาราง 4 ขบวน บอทชนะ`, r.reason || JSON.stringify(r.trains));
  }
  // ปลายทาง: ขาเดียว ทางตัน 1 ทาง
  let t = sim.emptyPlan(16, 6, 'E');
  for (let i = 0; i < 12; i++) t = sim.toggleSeg(t, i, 2, 0);
  t = sim.setPlatform(t, Array.from({ length: 6 }, (_, k) => [6 + k, 2, 0]), 1);
  t = sim.toggleSignal(sim.toggleSignal(t, 4, 2, "E"), 6, 2, "W");
  const bt = sim.buildPlan(t);
  ok(bt.ok, 'ผังปลายทางผ่านตัวตรวจ', bt.errors.join(' | '));
  const rt = bt.ok && sim.freePlayPack({ ...bt.station, id: 'custom' }, career.eras, { era: 2 });
  ok(rt && rt.ok && rt.trains.every(x => x.from === 'W' && x.to === 'W'), 'ผังปลายทาง: ขบวนเข้าแล้วกลับออกขาเดิม บอทชนะ', rt && (rt.reason || JSON.stringify(rt.trains)));
  // เดินรถอิสระของทุกสถานีในเส้นทางสอน ทุกขั้นระบบสัญญาณ (ตัวคูณจากอัปเกรด) ต้องจัดตารางได้และบอทเล่นจบ
  const miss = [];
  for (const s of career.stations) for (const era of [0, 1, 2, 3]) {
    const up = sim.upgradeOf(era), r = sim.freePlayPack(stations[s.station], career.eras, { era, speed: up.speed, grace: up.grace });
    if (!r.ok || sim.botPlay(r.pack) !== 'win') miss.push(`${s.station} ขั้น ${era}: ${r.reason || 'บอทไม่ชนะ'}`);
  }
  ok(!miss.length, 'เดินรถอิสระ 5 สถานี × 4 ขั้น เล่นจบทุกแบบ', miss.join(' | '));
  const none = sim.freePlayPack({ ...B0.station, id: 'custom', plats: [], noPlatform: [] }, career.eras);
  ok(!none.ok && /ทางจอด/.test(none.reason), 'ผังไม่มีทางจอด: บอกเหตุผล');
}

section('ตารางอินเตอร์ล็อกอัตโนมัติ: ตรงกับตารางข้อ 8 ใน SIGNALLING-RULES');
{
  const T = sim.routeTable(stations['fictional-crossing-1-loop']);
  const name = r => (r.dest.kind === 'platform' ? `${r.label}>${r.dest.no}` : r.label);
  const by = Object.fromEntries(T.rows.map(r => [r.id, name(r)]));
  const want = { 'S1>1': 'S2>1 S2>2 S1>2 T2 U1 U2', 'S1>2': 'S2>1 S2>2 S1>1 T1 U1 U2', 'S2>1': 'S1>1 S1>2 S2>2 T1 T2 U2', 'S2>2': 'S1>1 S1>2 S2>1 T1 T2 U1',
    T1: 'S1>2 S2>1 S2>2 T2', T2: 'S1>1 S2>1 S2>2 T1', U1: 'S1>1 S1>2 S2>2 U2', U2: 'S1>1 S1>2 S2>1 U1' };
  // ชื่อในข้อ 8: E1 = S1>1, W1 = S2>1, DE1 = T1, DW1 = U1 (เสาเดียวกันนับว่าขัดด้วย)
  // เสาเดียวกันไม่นับในช่องขัดกัน (อยู่ใน sameSignal)
  for (const r of T.rows) same(r.conflicts.map(id => by[id]).sort().join(' '), want[name(r)].split(' ').filter(x => x.split('>')[0] !== r.label).sort().join(' '), `${name(r)} ขัดกับ ${want[name(r)]}`);
  const e1 = T.rows.find(r => name(r) === 'S1>1');
  same(e1.points, [['P1', 'R']], 'S1 → ทาง 1 ต้องตั้ง P1 ท่า R');
  same(e1.overlap && e1.overlap.tracks, ['x1', 'bp'], 'S1 → ทาง 1 ทางหยุดเลย = x1, bp (คอสถานีฝั่ง E)');
  same(e1.overlap && e1.overlap.points, [['P2', 'R']], 'ทางหยุดเลยใช้ P2 ท่า R');
  ok(T.rows.find(r => r.label === 'T1').block === 'E', 'เส้นทางออก T1 ต้องได้ตอนทางเดี่ยวฝั่ง E');
  ok(T.rows.every(r => r.conflicts.every(id => T.rows.find(x => x.id === id).conflicts.includes(r.id))), 'ตารางสมมาตร');
  ok(sim.routeTable({ bidir: false }) === null, 'ผัง schema 1 ไม่มีตาราง (คืน null)');
}

section('ตารางอินเตอร์ล็อกอัตโนมัติ: เทียบกับเอนจินทุกคู่ทุกผัง (ยุค NX)');
{
  const list = Object.values(stations).filter(s => s.bidir);
  list.push({ ...B0.station, id: 'custom' });
  for (const st of list) {
    const T = sim.routeTable(st);
    let pack = null;
    for (const from of Object.keys(st.portals)) for (const to of Object.keys(st.portals)) for (const track of st.plats) {
      if (!pack) try { pack = packFor(st, [{ at: 900, from, to, track }], NX); } catch { /* ลองคู่ถัดไป */ }
    }
    if (!pack) { ok(false, `${st.id}: หาขบวนทดสอบที่โหลดได้ไม่เจอ`); continue; }
    const routeOf = row => st.routes[row.sig][T.rows.filter(x => x.sig === row.sig).indexOf(row)]; // แถวเรียงตาม L.routes ของเสานั้น
    let bad = [];
    for (const A of T.rows) for (const B of T.rows) {
      if (A === B || A.sig === B.sig) continue;
      const g = sim.createGame(pack, 0);
      sim.startGame(g);
      if (!sim.setRoute(g, A.sig, routeOf(A))) { bad.push(`${A.label}→ ตั้งบนผังว่างไม่ได้`); continue; }
      const engine = !!sim.canRoute(g, B.sig, routeOf(B)), table = A.conflicts.includes(B.id);
      // ประแจด้านหน้าบนทางเผื่อหยุดเลย: ตารางคิดทั้งสองท่า จึงเข้มกว่าเอนจินที่เริ่มจากท่า N ได้ (ห้ามหลวมกว่า)
      const loose = table && !engine && ((A.overlap && A.overlap.facing.length) || (B.overlap && B.overlap.facing.length));
      if (engine !== table && !loose) bad.push(`${A.id}(${A.label}) + ${B.id}(${B.label}): เอนจิน ${engine ? 'ขัด' : 'ไม่ขัด'} ตาราง ${table ? 'ขัด' : 'ไม่ขัด'} ${sim.conflictOf(A, B) || ''}`);
    }
    ok(!bad.length, `${st.id}: ${T.rows.length} เส้นทาง ตารางตรงกับเอนจินทุกคู่`, bad.slice(0, 6).join(' | ') + (bad.length > 6 ? ` …อีก ${bad.length - 6}` : ''));
  }
}

section('รหัสแชร์ผัง');
{
  const named = { ...P0, name: 'ทางหลีกของเจ' };
  const code = sim.encodePlan(named);
  ok(/^SJ1\.[0-9A-Za-z._-]+$/.test(code), 'รหัสใช้เฉพาะตัวอักษรที่ใส่ลิงก์ได้', code);
  ok(code.length < 300, `รหัสสั้น (${code.length} ตัว)`);
  const back = sim.decodeShare(code);
  ok(back.ok, 'ถอดรหัสได้', back.errors.join(' | '));
  same(back.plan, sim.normalizePlan(named).plan, 'ถอดแล้วได้ผังเดิมทุกชิ้น รวมชื่อภาษาไทย');
  const link = sim.shareLink(named, 'https://signaljunctionth-blip.github.io/signal-junction/#map');
  ok(link.startsWith('https://signaljunctionth-blip.github.io/signal-junction/#share=SJ1.'), 'ลิงก์แชร์ = หน้าเกม + #share=', link);
  ok(sim.decodeShare(`ลองเล่นผังนี้ ${link} สนุกมาก`).ok, 'วางทั้งข้อความที่มีลิงก์ก็อ่านได้');
  ok(sim.buildPlan(back.plan).ok, 'ผังที่รับมาผ่านตัวตรวจผังก่อนเล่น');
  // รหัสเสีย/ถูกแก้: เปลี่ยนทีละตัวอักษร ตัดท้าย สุ่มขยะ ต้องไม่ throw และต้องไม่ผ่านถ้าตรวจสอบไม่ตรง
  let threw = 0, passed = 0;
  const alpha = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ._-';
  for (let i = 4; i < code.length; i++) for (const c of 'a0Z.') {
    if (code[i] === c) continue;
    const t = code.slice(0, i) + c + code.slice(i + 1);
    try { if (sim.decodeShare(t).ok) passed++; } catch { threw++; }
  }
  for (let n = 1; n < code.length; n += 3) { try { if (sim.decodeShare(code.slice(0, n)).ok) passed++; } catch { threw++; } }
  let seed = 3;
  for (let n = 0; n < 500; n++) {
    let s = 'SJ1.';
    for (let m = (seed = (seed * 69069 + 1) >>> 0) % 120; m > 0; m--) s += alpha[(seed = (seed * 69069 + 1) >>> 0) % alpha.length];
    try { const r = sim.decodeShare(s); if (r.ok) sim.buildPlan(r.plan); } catch { threw++; }
  }
  for (const x of [undefined, null, 42, {}, '', 'SJ9.aa', 'SJ1.', 'x'.repeat(50000), 'SJ1.' + '0'.repeat(7000)]) { try { ok(sim.decodeShare(x).ok === false, `ขยะ ${String(x).slice(0, 20)} ถูกปฏิเสธ`); } catch { threw++; } }
  ok(threw === 0, 'รหัสเสียไม่ทำให้เกมพัง', `throw ${threw} ครั้ง`);
  ok(passed === 0, 'รหัสที่ถูกแก้หรือตัดขาดไม่ผ่านการตรวจสอบ', `ผ่าน ${passed} ครั้ง`);
  // รหัสที่ผ่านการตรวจสอบแต่ผังผิด (ทำรหัสเองแล้วคิดค่าตรวจสอบใหม่) ต้องถูกตัวตรวจผังกันไว้
  const broken = sim.encodePlan(sim.toggleSignal(P0, 16, 5, 'E'));
  const r = sim.decodeShare(broken);
  ok(r.ok && !sim.buildPlan(r.plan).ok, 'ผังที่ผิดแม้รหัสถูกต้อง ไม่ผ่านตัวตรวจผัง');
}

section('งบ ดาว อัปเกรด (เจเลือกข้อ 1 ทุกข้อ 2026-10-24)');
{
  ok(sim.budgetOf({ stars: 0, score: 900 }) === 0, '0 ดาวไม่ได้งบ แม้คะแนนสูง');
  ok(sim.budgetOf({ stars: 1, score: 300 }) === 50 && sim.budgetOf({ stars: 3, score: 600 }) === 160, 'งบ = คะแนน/10 + โบนัสดาว 20/50/100');
  ok(sim.payout({ stars: 0, score: 0 }, { stars: 2, score: 400 }) === 90, 'ผ่านครั้งแรกได้งบเต็ม');
  ok(sim.payout({ stars: 2, score: 400 }, { stars: 2, score: 300 }) === 0, 'เล่นซ้ำได้แย่กว่าเดิมไม่ได้งบ');
  ok(sim.payout({ stars: 2, score: 400 }, { stars: 3, score: 450 }) === 55, 'เล่นซ้ำได้งบเฉพาะส่วนที่ดีกว่าเดิม (ดาวที่สาม +50 คะแนน +5)');
  ok(sim.payout({ stars: 3, score: 450 }, { stars: 1, score: 600 }) === 15, 'คะแนนดีขึ้นแต่ดาวน้อยลง: ได้เฉพาะส่วนคะแนนที่ดีกว่า (ผลดีสุดรวมแยกดาวกับคะแนน)');
  ok(sim.payout({ stars: 1, score: 200 }, { stars: 0, score: 900 }) === 0, 'รอบ 0 ดาวไม่ได้งบ');
  ok(sim.upgradeCost(0, 2) === 550 && sim.upgradeCost(2, 1) === 0 && sim.upgradeCost(1, 3) === 1300, 'ราคาอัปเกรดสะสมจากขั้นที่มี ถอยกลับฟรี');
  ok(sim.layoutCharge({ straight: 10, points: 0 }, { straight: 12, points: 2 }) === 90 && sim.layoutCharge({ straight: 10 }, { straight: 6 }) === -10, 'ค่าก่อสร้าง: เพิ่มจ่ายเต็ม รื้อคืนครึ่ง');
  ok(sim.upgradeOf(2).speed > 1 && sim.upgradeOf(3).grace > 1 && sim.upgradeOf(0).speed === 1, 'ทุกขั้นที่อัปเกรดมีผลกับการเล่น (ไฟสีเร็วขึ้น NX รอได้นานขึ้น)');
  const fast = sim.freePlayPack({ ...B0.station, id: 'custom' }, testJson.eras, { era: 2, speed: 1.15, grace: 1.2 });
  ok(fast.ok && fast.pack.levels[0].speed === 64 && fast.pack.levels[0].waitGrace.entry === 7.2, 'เดินรถอิสระรับตัวคูณความเร็วและเวลารอจากอัปเกรด');
  const career = readJson('data/levels/namtok.json');
  ok(career.eras.every(e => e.speedMul === undefined) && career.levels.every(l => l.speed !== undefined), 'ภารกิจสอนไม่ถูกแตะ (อัปเกรดไม่มีผลกับภารกิจ)');

  // กระเป๋างบกลางผ่านเซฟจริง
  const save = createSave(memoryBackend()), P = 'namtok', keys = career.levels.map(l => l.id);
  const W = createWallet(save, () => keys.map(k => save.getBest(P, k)));
  ok(W.balance() === 0 && W.owned('tha-kilen') === 0, 'เริ่มเกม งบ 0 ขั้น 0');
  ok(!W.choose('tha-kilen', 1).ok && W.owned('tha-kilen') === 0, 'งบไม่พอซื้อไม่ได้ และไม่ถูกหักเงิน');
  for (const k of keys.slice(0, 4)) save.setBest(P, k, { stars: 3, score: 900 });
  const earned = 4 * 190;
  ok(W.earned() === earned && W.balance() === earned, `งบคิดจากผลดีสุดในเซฟ (${W.balance()})`);
  ok(W.choose('tha-kilen', 2).ok && W.owned('tha-kilen') === 2 && W.balance() === earned - 550, 'อัปเกรด 2 ขั้นจ่าย 550');
  ok(W.choose('tha-kilen', 0).ok && W.selected('tha-kilen') === 0 && W.balance() === earned - 550, 'ถอยกลับขั้น 0 ฟรี');
  ok(W.choose('tha-kilen', 2).ok && W.balance() === earned - 550, 'กลับไปขั้นที่ซื้อแล้วฟรี');
  ok(W.owned('wang-pho') === 0, 'อัปเกรดแยกต่อสถานี ใช้งบกลาง');
  const starter = sim.planCount(sim.starterPlan());
  ok(W.layoutCharge(starter) === 0, 'ผังเริ่มต้นให้ฟรี');
  const loop = sim.planCount(loopPlan());
  const charge = W.layoutCharge(loop);
  ok(charge > 0 && !W.confirmLayout(loop).ok, `ผังทางหลีกมีค่าก่อสร้าง ${charge} งบที่เหลือ ${W.balance()} ไม่พอยืนยันไม่ได้`);
  for (const k of keys.slice(4, 6)) save.setBest(P, k, { stars: 3, score: 900 });
  const before = W.balance();
  ok(W.confirmLayout(loop).ok && W.balance() === before - charge && W.layoutCharge(loop) === 0, 'ยืนยันผังแล้วจ่ายครั้งเดียว');
  ok(W.layoutCharge(starter) < 0, 'รื้อทางหลีกที่จ่ายแล้วกลับเป็นผังเริ่มต้นได้คืนครึ่ง');
  ok(createWallet(createSave(memoryBackend()), () => []).layoutCharge(sim.planCount(sim.emptyPlan())) === 0, 'รื้อชิ้นของผังเริ่มต้นไม่ได้เงินคืน (ไม่เคยจ่าย)');
  ok(W.freeRecord('tha-kilen', 2, 500).isNew && !W.freeRecord('tha-kilen', 2, 400).isNew && W.freeRecord('tha-kilen', 2, 400).best === 500 && W.freeRecord('tha-kilen', 3, 100).isNew, 'สถิติเดินรถอิสระแยกต่อสถานีต่อขั้น');
  const code = save.exportCode(), s2 = createSave(memoryBackend());
  ok(s2.importCode(code) && createWallet(s2, () => keys.map(k => s2.getBest(P, k))).balance() === W.balance(), 'งบไปกับรหัสสำรองเกม');
  save.setFlag('budgetSpent', -5000); save.setFlag('upg:tha-kilen', 99); save.setFlag('layoutPaid', 'x,y');
  ok(W.spent() === 0 && W.owned('tha-kilen') === 3 && W.layoutCharge(starter) === 0, 'ค่าในเซฟที่ถูกแก้ไม่ทำให้งบเกินที่ได้หรือพัง');
}

console.log(`\n${checks - fails}/${checks} ผ่าน`);
if (fails) { console.error(`ไม่ผ่าน ${fails} ข้อ`); process.exit(1); }
