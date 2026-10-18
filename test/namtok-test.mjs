// เทสต์ชุดภารกิจเส้นทางสอนสายน้ำตก ใน Node ล้วน — ใช้: node test/namtok-test.mjs  (เพิ่ม -v เพื่อดูเหตุการณ์ของภารกิจที่ไม่ผ่าน)
// โหลด data/levels/namtok.json กับผังจริงใน data/stations แล้วให้บอทตามคำใบ้ (playHints) เล่นครบทุกภารกิจ
// เกณฑ์: ไม่มี error, บอทชนะทุกภารกิจด้วยคะแนนตั้งแต่ 80% (3 ดาว), ทุกภารกิจจบใน 6 นาที, tk-1 จบใน 3 นาที
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import * as sim from '../src/sim/index.js';

const require = createRequire(import.meta.url);
const { playHints } = require('./lib/bot.js');
const root = path.resolve(import.meta.dirname, '..');
const readJson = f => JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));
const verbose = process.argv.includes('-v');

let fails = 0, checks = 0;
const ok = (cond, name, detail = '') => { checks++; if (!cond) { fails++; console.error(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); } };

const IDS = ['tk-1', 'tk-2', 'tk-token', 'tk-3', 'wp-1', 'wp-token', 'wp-2', 'wp-3', 'nt-1', 'nt-2', 'kb-1', 'kb-2', 'kb-3', 'np-1', 'np-2', 'np-3'];
const STATIONS = [['tha-kilen', 0], ['wang-pho', 0], ['nam-tok', 0], ['kanchanaburi', 12], ['nong-pla-duk-jn', 20]];
const MIN_PCT = 80, MAX_TIME = 360, MAX_TIME_FIRST = 180;

const stationJson = fs.readdirSync(path.join(root, 'data/stations')).filter(f => f.endsWith('.json')).sort().map(f => ({ name: f, json: readJson('data/stations/' + f) }));
const { stations, errors: stationErrors } = sim.loadStations(stationJson);
for (const [id] of STATIONS) ok(stations[id] && !stationErrors[id], `ผัง ${id} ผ่านตัวตรวจ`, (stationErrors[id] || []).join(' | '));

const res = sim.loadLevelPack(readJson('data/levels/namtok.json'), stations, stationErrors);
ok(res.ok, 'ชุดด่าน namtok ผ่านตัวตรวจ', (res.errors || []).join(' | '));
if (!res.ok) { console.error(`\nไม่ผ่าน ${fails}/${checks}`); process.exit(1); }
const pack = res.pack;

ok(pack.id === 'namtok', 'id ของชุดคือ namtok');
ok(JSON.stringify(pack.levels.map(l => l.id)) === JSON.stringify(IDS), 'มี 16 ภารกิจ id tk-1 ถึง np-3 ตามลำดับ (ภารกิจห่วงแทรกหลัง tk-2 และ wp-1)', pack.levels.map(l => l.id).join(','));
ok(JSON.stringify(pack.stations.map(s => [s.station, s.needStars])) === JSON.stringify(STATIONS), 'stations[] เรียงตามลำดับปลดล็อก needStars 0/0/0/12/20');
const NO_EMOJI = /\p{Extended_Pictographic}/u;
for (const lv of pack.levels) {
  ok(!lv.error, `${lv.id} ไม่มี error`, lv.error || '');
  ok(pack.eras[lv.era] && lv.L && lv.L.id === lv.station, `${lv.id} ใช้ผัง ${lv.station}`);
  ok(typeof lv.teaches === 'string' && lv.teaches.length > 0, `${lv.id} มี teaches`);
  ok(lv.tips.length >= 2 && lv.tips.length <= 4, `${lv.id} มีคำใบ้ 2–4 ข้อ`);
  ok(![lv.name, lv.teaches, lv.goal, ...lv.tips].some(s => NO_EMOJI.test(s)), `${lv.id} ไม่มีอีโมจิ`);
}
// ปลดล็อก: เริ่มเกมเปิดแค่ tk-1, ได้ 1 ดาวทุกภารกิจของขั้น 1–2 (8 ดาว) ยังเข้ากาญจนบุรีไม่ได้, 3 ดาวทุกภารกิจเปิดครบ
const u0 = sim.unlockState(pack, () => 0), u1 = sim.unlockState(pack, l => (l.i < 8 ? 1 : 0)), u3 = sim.unlockState(pack, () => 3);
ok(u0.levels.filter(l => l.open).length === 1 && u0.levels[0].open, 'เริ่มเกมเปิดแค่ tk-1');
ok(!u1.stations[3].open, 'ดาวสะสม 8 ยังเข้ากาญจนบุรีไม่ได้ (ต้อง 12)');
ok(u3.levels.every(l => l.open), 'ได้ดาวครบแล้วทุกภารกิจเปิด');

if (!pack.levels.some(l => l.error)) {
  console.log('\nภารกิจ   ผล    ขบวน   คะแนน     %   ดาว  เวลา    แตะ  ถูกปฏิเสธ');
  const fmt = s => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
  pack.levels.forEach((lv, i) => {
    const events = [], [r] = playHints(sim, pack, { events, from: i, to: i + 1 });
    const stars = r.state !== 'win' ? 0 : r.pct >= 80 ? 3 : r.pct >= 55 ? 2 : 1;
    console.log(`${r.id.padEnd(8)} ${(r.state + (r.code ? ' ' + r.code : '')).padEnd(5)} ${r.trains.padEnd(6)} ${String(Math.round(r.score)).padStart(4)}/${String(lv.trains.length * 150).padEnd(4)} ${String(r.pct).padStart(3)}   ${stars}    ${fmt(r.time).padEnd(6)}  ${String(r.taps).padStart(3)}  ${r.refused}`);
    ok(r.state === 'win', `${r.id} บอทชนะ`, `จบด้วย ${r.state} ${r.code} ขบวน ${r.trains} เวลา ${r.time}`);
    ok(r.state !== 'win' || r.pct >= MIN_PCT, `${r.id} บอทได้ตั้งแต่ ${MIN_PCT}%`, `ได้ ${r.pct}%`);
    const wrong = events.filter(ev => ev.type === 'score' && (ev.reason === 'wrong-platform' || ev.reason === 'wrong-exit')).map(ev => ev.train);
    ok(!wrong.length, `${r.id} ตารางไม่บังคับให้บอทเข้าผิดทางหรือออกผิดขา`, `ขบวน ${wrong.join(', ')}`);
    ok(r.time <= (r.id === 'tk-1' ? MAX_TIME_FIRST : MAX_TIME), `${r.id} จบในเวลา`, `${r.time} วินาที`);
    if (verbose && (r.state !== 'win' || r.pct < MIN_PCT)) for (const ev of events) if (ev.type !== 'score') console.log('     ', JSON.stringify(ev));
  });
}

// บอทมือช้า: เล่นตามคำใบ้เหมือนกัน แต่แตะได้ครั้งละ 1 อย่างทุก lag วินาที (แทนผู้เล่นที่เล่นถูกแต่ช้า)
// คืนผลแบบเดียวกับ playHints; state 'play' = เล่นไม่จบใน 10 นาที (ค้าง)
function playSlow(i, lag, dt = 0.05, limit = 600) {
  const g = sim.createGame(pack, i); sim.startGame(g);
  let last = -lag;
  while (g.state === 'play' && g.time < limit) {
    if (g.time - last >= lag) { const t = sim.nextTarget(g); if (t) { sim.press(g, t); last = g.time; } }
    sim.step(g, dt);
  }
  return { state: g.state, code: g.result && g.result.code || '', pct: Math.round(100 * g.score / g.max), time: g.time };
}
if (!pack.levels.some(l => l.error)) {
  console.log('\nบอทมือช้า (แตะ 1 ครั้งทุก 2 / 4 วินาที): ต้องไม่ค้างและไม่เจอทางตัน');
  pack.levels.forEach((lv, i) => {
    const a = playSlow(i, 2), b = playSlow(i, 4), show = r => `${r.state}${r.code ? ' ' + r.code : ''} ${r.pct}% ${Math.round(r.time)} วิ`;
    console.log(`${lv.id.padEnd(8)} 2 วิ: ${show(a).padEnd(22)} 4 วิ: ${show(b)}`);
    ok(a.state === 'win', `${lv.id} บอทมือช้า 2 วิ ชนะ`, show(a));
    ok(b.state === 'win' || (b.code === 'MAX_WAIT' && lv.maxWait), `${lv.id} บอทมือช้า 4 วิ ไม่ค้าง ไม่ชน ไม่เจอทางตัน`, show(b));
  });
}

// กันทางตันจากตาราง: ขบวนที่เข้าจากขา X ต้องไม่ถูกกำหนดให้จอดทางที่ผู้ใช้คนก่อนจะออกไปขา X
// (ขบวนใหม่ยึดตอนทางเดี่ยวของขา X ไว้ คันเก่าจึงออกไม่ได้ และคันใหม่ก็เข้าไม่ได้) ยกเว้นขบวนที่มาแบบ after คันเก่าพ้นจอแล้ว
for (const lv of pack.levels) {
  const lastOn = {};
  lv.trains.forEach((t, n) => {
    if (t.type === 'express' || t.stop === false || t.track === undefined) return;
    const prev = lastOn[t.track];
    if (prev) {
      let chained = false;
      for (let a = t.after; a; a = lv.trains[a.train - 1].after) if (a.train - 1 === prev.n) { chained = true; break; }
      ok(chained || prev.t.to !== t.from, `${lv.id} ขบวน ${n + 1} ไม่เข้าทาง ${t.track} สวนกับขบวน ${prev.n + 1} ที่จะออกขาเดียวกัน`);
    }
    lastOn[t.track] = { t, n };
  });
}

console.log(fails ? `\nไม่ผ่าน ${fails}/${checks}` : `\nผ่านทั้งหมด ${checks} ข้อ`);
process.exit(fails ? 1 : 0);
