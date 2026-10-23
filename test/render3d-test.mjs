// เทสต์ส่วนคำนวณของฉาก 3 มิติใน Node ล้วน (ไม่ใช้ WebGL) — ใช้: node test/render3d-test.mjs
// 1) แปลงผังท่ากิเลนเป็นโลก 3 มิติ: ราง ประแจ เสา ชานชาลา อยู่ถูกด้านและไม่ซ้อนกัน
// 2) ตำแหน่งขบวนจาก trail ของ sim อยู่บนแนวรางที่วาด  3) ระดับคุณภาพ: เลือกเริ่มต้นและลดระดับเมื่อช้าถูกต้อง
// 4) ชิ้นงานใน assets/ ทุกไฟล์มีรายการใน assets/ASSETS.md และไม่เกินเพดานขนาด
import fs from 'node:fs';
import path from 'node:path';
import * as sim from '../src/sim/index.js';
import { world3d, trailPoint, carSpan, KX, TRACK_GAP, CAR_LEN, SIG_SIDE } from '../src/render3d/layout3d.js';
import { TIERS, initialTier, createGovernor, readPref, writePref } from '../src/render3d/quality.js';

const root = path.resolve(import.meta.dirname, '..');
const readJson = f => JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));
let fails = 0, checks = 0;
const ok = (cond, name, detail = '') => { checks++; if (!cond) { fails++; console.error(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); } };
const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;

const stationJson = fs.readdirSync(path.join(root, 'data/stations')).filter(f => f.endsWith('.json')).map(f => ({ name: f, json: readJson('data/stations/' + f) }));
const { stations, errors } = sim.loadStations(stationJson);
const res = sim.loadLevelPack(readJson('data/levels/namtok.json'), stations, errors);
ok(res.ok, 'โหลดชุดด่าน namtok');
const tk = res.pack.levels.findIndex(l => l.id === 'tk-3');
const g = sim.createGame(res.pack, tk, {});
const W = world3d(g.L);

/* 1) ผังท่ากิเลน */
ok(near(W.tracks.m.zAt(0), 0), 'ทางประธานอยู่ z = 0');
ok(near(W.tracks.l1.zAt(0), TRACK_GAP), 'ทางหลีกอยู่ใต้แผง ห่าง TRACK_GAP', W.tracks.l1.zAt(0));
ok(near(W.points.P1.x, -W.points.P2.x), 'ประแจสองปลายสมมาตรรอบกลางสถานี', `${W.points.P1.x} ${W.points.P2.x}`);
ok(near(W.points.P1.x, (190 - 500) * KX), 'ประแจ P1 อยู่ที่ x = (190 - 500) × KX');
ok(W.points.P1.away === 1 && W.points.P2.away === -1, 'ขาแยกของประแจหันเข้าหากลางสถานี');
ok(W.points.P1.side === 1 && W.points.P2.side === 1, 'ขาแยกของประแจไปทางทางหลีก (+z)');
const lw = W.tracks.lw, a = lw.zAt(lw.x0 + 0.01), b = lw.zAt(lw.x1 - 0.01);
ok(a < 0.01 && near(b, TRACK_GAP, 0.01), 'รางเลี้ยวเข้าทางหลีกเป็นโค้งตัว S จาก z 0 ไป TRACK_GAP', `${a} ${b}`);
ok(lw.pts.every((p, i) => i === 0 || p[0] > lw.pts[i - 1][0]), 'จุดบนรางเรียงตาม x');
for (const k in W.signals) {
  const s = W.signals[k];
  ok(near(Math.abs(s.z - s.trackZ), SIG_SIDE), `เสา ${s.label} ห่างราง ${SIG_SIDE} ม.`);
  ok(s.dir === 'E' ? s.z < s.trackZ : s.z > s.trackZ, `เสา ${s.label} อยู่ซ้ายมือคนขับ`);
}
ok(W.signals.HW.x < W.points.P1.x && W.signals.HE.x > W.points.P2.x, 'เสาเข้าอยู่นอกประแจทั้งสองปลาย');
ok(W.signals.XE1.x > W.signals.XW1.x, 'เสาออกทิศ E อยู่ปลายขวาของทางจอด');
const pl = W.platforms.find(p => p.no === 1);
ok(pl && pl.side === -1 && !pl.none, 'ชานชาลา 1 อยู่ด้านบนของแผง (ไม่มีรางอื่น) ตาม OSM');
const p2 = W.platforms.find(p => p.no === 2);
ok(p2 && p2.none, 'ทาง 2 ไม่มีชานชาลา (noPlatform)');
const sigPts = Object.values(W.signals);
for (let i = 0; i < sigPts.length; i++) for (let j = i + 1; j < sigPts.length; j++) ok(Math.hypot(sigPts[i].x - sigPts[j].x, sigPts[i].z - sigPts[j].z) > 3, `เสา ${sigPts[i].label} กับ ${sigPts[j].label} ไม่ทับกัน`);

/* 2) ขบวน */
sim.startGame(g);
let got = null;
for (let n = 0; n < 4000 && !got; n++) {
  sim.step(g, sim.FIXED_DT);
  const tl = t => t.trail.reduce((n, q, i) => n + (i ? Math.hypot(q.x - t.trail[i - 1].x, q.y - t.trail[i - 1].y) : 0), 0);
  const t = g.trains.find(t => tl(t) >= sim.TL * 0.95);
  if (t) got = t;
  const h = sim.hint(g, { force: true }); if (h) sim.press(g, h.kind === 's' ? { kind: 'signal', id: h.k } : h.kind === 'p' ? { kind: 'point', id: h.k } : null);
}
ok(!!got, 'มีขบวนวิ่งเข้าผัง');
if (got) {
  const path3 = got.trail.map(q => trailPoint(W, g.L, q));
  ok(path3.every(([x, z]) => Number.isFinite(x) && Number.isFinite(z)), 'ตำแหน่งขบวนเป็นตัวเลข');
  ok(got.trail.every((q, i) => { const t = W.tracks[g.L.E[q.e].track]; return Math.abs(t.zAt(path3[i][0]) - path3[i][1]) < 1e-9; }), 'ตำแหน่งขบวนอยู่บนแนวรางที่วาด');
  const sp = carSpan(path3, CAR_LEN);
  ok(sp && sp.len <= CAR_LEN + 1e-6 && sp.len > CAR_LEN * 0.5, 'ตัวรถวางได้ตามทางวิ่ง', sp && sp.len);
  ok(CAR_LEN <= sim.TL * KX, 'รถ 1 คันไม่ยาวกว่าขบวนในแผง');
}

/* 3) ระดับคุณภาพ */
ok(TIERS.map(t => t.id).join() === 'high,mid,low', 'มีระดับ สูง กลาง ประหยัด');
ok(initialTier({ coarse: true, w: 844 }) === 'mid' && initialTier({ coarse: false, w: 1280 }) === 'high', 'มือถือเริ่มที่กลาง คอมเริ่มที่สูง');
ok(initialTier({ coarse: true, w: 844, saved: 'low' }) === 'low', 'ใช้ระดับที่ผู้เล่นเลือกไว้');
const gov = createGovernor('high');
let drop = null; for (let i = 0; i < 200 && !drop; i++) drop = gov.frame(0.045);
ok(drop === 'mid', 'เฟรมช้ากว่า 33 มิลลิวินาทีต่อเนื่อง 2 วินาที ลดหนึ่งระดับ', drop);
const gov2 = createGovernor('mid'); let up = null; for (let i = 0; i < 400; i++) up = gov2.frame(0.01) || up;
ok(up === null, 'เร็วแล้วไม่ปรับขึ้นเอง');
const gov3 = createGovernor('low'); let slow = null; for (let i = 0; i < 200 && !slow; i++) slow = gov3.frame(0.05);
ok(slow === 'too-slow', 'ระดับประหยัดยังช้า บอกให้เสนอแผงผังเส้น');
ok(readPref({ getItem() { throw new Error('ห้าม'); } }) === null, 'อ่าน localStorage ไม่ได้ก็ไม่พัง');
ok(writePref({ setItem() { throw new Error('เต็ม'); } }, { tier: 'low' }) === false, 'เขียน localStorage ไม่ได้ก็ไม่พัง');
{ // เบราว์เซอร์ที่บล็อกที่เก็บข้อมูล: แค่อ่าน globalThis.localStorage ก็ throw (QA WP3 บั๊ก 1)
  const d = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('SecurityError'); } });
  let r1, r2; try { r1 = readPref(); r2 = writePref(undefined, { on: true }); } catch (e) { r1 = r2 = 'throw'; }
  if (d) Object.defineProperty(globalThis, 'localStorage', d); else delete globalThis.localStorage;
  ok(r1 === null && r2 === false, 'localStorage ถูกบล็อก (อ่านตัวแปรแล้ว throw) ก็ไม่พัง', `${r1} ${r2}`);
}

/* 4) ชิ้นงาน */
const list = fs.readFileSync(path.join(root, 'assets/ASSETS.md'), 'utf8');
let total = 0;
for (const dir of ['textures', 'sky']) for (const f of fs.readdirSync(path.join(root, 'assets', dir))) {
  const n = fs.statSync(path.join(root, 'assets', dir, f)).size; total += n;
  ok(list.includes(`${dir}/${f}`), `assets/${dir}/${f} มีรายการใน ASSETS.md`);
  ok(n <= 500 * 1024, `assets/${dir}/${f} ไม่เกิน 500 KB`, n);
}
ok(total <= 5 * 1024 * 1024, 'ชิ้นงาน CC0 รวมไม่เกิน 5 MB', total);

console.log(fails ? `\nไม่ผ่าน ${fails}/${checks}` : `ฉาก 3 มิติ (ส่วนคำนวณ): ผ่าน ${checks} ข้อ`);
process.exit(fails ? 1 : 0);
