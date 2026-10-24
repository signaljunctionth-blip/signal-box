// เทสต์ชุดภารกิจสายอีสาน (WP8 / M5) ใน Node ล้วน — ใช้: node test/isan-test.mjs  (เพิ่ม -v เพื่อดูเหตุการณ์ของภารกิจที่ไม่ผ่าน)
// โหลด data/levels/isan.json กับผังจริงใน data/stations แล้วให้บอทตามคำใบ้ (playHints) และบอทมือช้าเล่นครบทุกภารกิจ
// เกณฑ์: ไม่มี error, บอทชนะทุกภารกิจ, ทุกภารกิจจบใน 6 นาที, ไม่มีห่วงทางสะดวก, ขา K (ทางแยกสมมุติ) ใช้กับขบวนสินค้าเท่านั้น
// ภารกิจท้ายของแต่ละสถานีเป็นข้อสอบ บอทตามคำใบ้ไม่รู้จักหลบสินค้าให้ด่วน จึงได้ต่ำกว่า 80% ได้ แต่ต้องมีแผนผู้เล่นเก่ง (PLANS) ที่ได้ 3 ดาว
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

const IDS = ['br-1', 'br-2', 'br-3', 'br-4', 'sr-1', 'sr-2', 'sr-3', 'sr-4', 'tc-1', 'tc-2', 'tc-3', 'tc-4'];
const STATIONS = [['buri-ram', 0], ['surin', 6], ['thanon-chira-jn', 15]];
const MIN_PCT_EASY = 80, MAX_TIME = 360;
// แผนผู้เล่นเก่ง: เล่นตามคำใบ้ แตะ 1 ครั้งต่อวินาที แต่ "ยังไม่แตะ" ขบวนบางคันตามแผน { เลขขบวน: [วินาทีที่ยังไม่รับเข้า, วินาทีที่ยังไม่ปล่อยออก] }
// พิสูจน์ว่าภารกิจที่บอทตามคำใบ้ได้ต่ำกว่า 80% ยังได้ 3 ดาวได้ถ้าจัดลำดับเป็น (ส่วนใหญ่คือกักขบวนสินค้าไว้ให้ด่วนไปก่อน)
// แผนหาด้วยการสุ่มค้นนอกเทสต์ ถ้าแก้ตารางของภารกิจเหล่านี้ ต้องหาแผนใหม่
const PLANS = {
  'br-3': { 1: [0, 20], 2: [12, 22], 4: [0, 1] },
  'br-4': { 2: [4, 20] },
  'sr-4': { 3: [0, 21], 7: [0, 15], 8: [0, 8] },
  'tc-3': { 1: [12, 0] },
  'tc-4': { 2: [17, 0], 5: [4, 0], 9: [0, 16] },
};

const stationJson = fs.readdirSync(path.join(root, 'data/stations')).filter(f => f.endsWith('.json')).sort().map(f => ({ name: f, json: readJson('data/stations/' + f) }));
const { stations, errors: stationErrors } = sim.loadStations(stationJson);
for (const [id] of STATIONS) ok(stations[id] && !stationErrors[id], `ผัง ${id} ผ่านตัวตรวจ`, (stationErrors[id] || []).join(' | '));

const raw = readJson('data/levels/isan.json');
const res = sim.loadLevelPack(raw, stations, stationErrors);
ok(res.ok, 'ชุดด่าน isan ผ่านตัวตรวจ', (res.errors || []).join(' | '));
if (!res.ok) { console.error(`\nไม่ผ่าน ${fails}/${checks}`); process.exit(1); }
const pack = res.pack;

ok(pack.id === 'isan', 'id ของชุดคือ isan');
ok(JSON.stringify(pack.levels.map(l => l.id)) === JSON.stringify(IDS), 'มี 12 ภารกิจ br-1 ถึง tc-4 ตามลำดับ', pack.levels.map(l => l.id).join(','));
ok(JSON.stringify(pack.stations.map(s => [s.station, s.needStars])) === JSON.stringify(STATIONS), 'stations[] needStars 0/6/15');
const NO_EMOJI = /\p{Extended_Pictographic}/u;
for (const lv of pack.levels) {
  ok(!lv.error, `${lv.id} ไม่มี error`, lv.error || '');
  ok(pack.eras[lv.era] && lv.L && lv.L.id === lv.station, `${lv.id} ใช้ผัง ${lv.station}`);
  ok(typeof lv.teaches === 'string' && lv.teaches.length > 0, `${lv.id} มี teaches`);
  ok(lv.tips.length >= 1 && lv.tips.length <= 3, `${lv.id} มีคำใบ้ 1–3 ข้อ`);
  ok(![lv.name, lv.teaches, lv.goal, ...lv.tips].some(s => NO_EMOJI.test(s)), `${lv.id} ไม่มีอีโมจิ`);
  // เงื่อนไขเจ ข้อ 5: สายนี้ไม่ใช้ห่วงทางสะดวก
  ok(!lv.token, `${lv.id} ไม่มีห่วงทางสะดวก`);
  // ขั้น 3 = ยุคไฟสีและวงจรตอนราง, ขั้น 4 = NX
  const tier = pack.stations.find(s => s.station === lv.station).tier;
  ok(!!pack.eras[lv.era].tc && !!pack.eras[lv.era].nx === (tier === 4), `${lv.id} ใช้ยุคตามขั้น ${tier}`);
  // ขา K ของบุรีรัมย์เป็นทางแยกสมมุติ ใช้กับขบวนสินค้าเท่านั้น
  lv.trains.forEach((t, n) => { if (t.from === 'K' || t.to === 'K') ok(t.type === 'freight', `${lv.id} ขบวน ${n + 1} ใช้ขา K ต้องเป็นขบวนสินค้า`); });
}
for (const lv of pack.levels) if (lv.trains.some(t => t.type === 'freight') && lv.trains.some(t => t.type === 'express')) ok(lv.priority === true, `${lv.id} มีทั้งสินค้าและด่วน ต้องเปิด priority`);
ok(pack.levels.some(l => l.trains.some(t => t.origin !== undefined)), 'มีขบวนต้นทางอย่างน้อย 1 ภารกิจ');
ok(pack.levels.some(l => l.trains.some(t => t.from && t.from === t.to)), 'มีขบวนปลายทางที่กลับออกทางเดิมอย่างน้อย 1 ภารกิจ');

// ปลดล็อก
const u0 = sim.unlockState(pack, () => 0), u1 = sim.unlockState(pack, l => (l.station !== 'thanon-chira-jn' ? 1 : 0)), u3 = sim.unlockState(pack, () => 3);
ok(u0.levels.filter(l => l.open).length === 1 && u0.levels[0].open, 'เริ่มสายเปิดแค่ br-1');
ok(!u1.stations[2].open, 'ได้ 1 ดาวทุกภารกิจ (8 ดาวก่อนถนนจิระ) ยังเข้าชุมทางถนนจิระไม่ได้');
ok(u3.levels.every(l => l.open), 'ได้ดาวครบแล้วทุกภารกิจเปิด');

const fmt = s => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
if (!pack.levels.some(l => l.error)) {
  console.log('\nภารกิจ  ผล    ขบวน  คะแนน      %   ดาว  เวลา   แตะ  ถูกปฏิเสธ');
  pack.levels.forEach((lv, i) => {
    const events = [], [r] = playHints(sim, pack, { events, from: i, to: i + 1 });
    const g = sim.createGame(pack, i), stars = r.state !== 'win' ? 0 : r.pct >= 80 ? 3 : r.pct >= 55 ? 2 : 1;
    console.log(`${r.id.padEnd(7)} ${(r.state + (r.code ? ' ' + r.code : '')).padEnd(5)} ${r.trains.padEnd(5)} ${String(Math.round(r.score)).padStart(4)}/${String(g.max).padEnd(5)} ${String(r.pct).padStart(3)}   ${stars}    ${fmt(r.time).padEnd(5)}  ${String(r.taps).padStart(3)}  ${r.refused}`);
    ok(r.state === 'win', `${r.id} บอทชนะ`, `จบด้วย ${r.state} ${r.code} ขบวน ${r.trains} เวลา ${r.time}`);
    if (!PLANS[lv.id]) ok(r.state !== 'win' || r.pct >= MIN_PCT_EASY, `${r.id} บอทได้ตั้งแต่ ${MIN_PCT_EASY}% (ภารกิจนี้ไม่มีแผนผู้เล่นเก่ง)`, `ได้ ${r.pct}%`);
    const wrong = events.filter(ev => ev.type === 'score' && /wrong/.test(ev.reason)).map(ev => ev.train);
    ok(!wrong.length, `${r.id} ตารางไม่บังคับให้บอทเข้าผิดทางหรือออกผิดขา`, `ขบวน ${wrong.join(', ')}`);
    ok(r.time <= MAX_TIME, `${r.id} จบในเวลา`, `${r.time} วินาที`);
    if (verbose && (r.state !== 'win' || r.pct < MIN_PCT_EASY)) for (const ev of events) if (ev.type !== 'score') console.log('     ', JSON.stringify(ev));
  });
}

function playPlan(i, hold, lag = 1, dt = 0.05, limit = 600) {
  const g = sim.createGame(pack, i); sim.startGame(g);
  let lastTap = -lag; const since = {};
  while (g.state === 'play' && g.time < limit) {
    if (g.time - lastTap >= lag) {
      const hid = [];
      for (const t of g.trains) {
        if (!t.stopped) continue;
        const atHome = t.edge === t.entry, k = t.id + (atHome ? 'i' : 'o');
        since[k] ??= g.time;
        if (g.time < since[k] + (hold[t.id] || [0, 0])[atHome ? 0 : 1]) { hid.push([t, t.state]); t.state = 'dwell'; t.stopped = false; } // ซ่อนจากคำใบ้ชั่วคราว
      }
      const tg = sim.nextTarget(g);
      for (const [t, st] of hid) { t.state = st; t.stopped = true; }
      if (tg) { sim.press(g, tg); lastTap = g.time; }
    }
    sim.step(g, dt);
  }
  return { state: g.state, code: g.result && g.result.code || '', pct: Math.round(100 * g.score / g.max) };
}
if (!pack.levels.some(l => l.error)) {
  console.log('\nแผนผู้เล่นเก่ง (แตะ 1 ครั้งต่อวินาที)');
  for (const [id, plan] of Object.entries(PLANS)) {
    const r = playPlan(pack.levels.find(l => l.id === id).i, plan);
    console.log(`${id.padEnd(7)} ${r.state}${r.code ? ' ' + r.code : ''} ${r.pct}%`);
    ok(r.state === 'win' && r.pct >= 80, `${id} ผู้เล่นที่จัดลำดับเป็นได้ 3 ดาว`, `${r.state} ${r.pct}%`);
  }
}

// บอทมือช้า: แตะได้ครั้งละ 1 อย่างทุก lag วินาที ต้องไม่ค้างและไม่เจอทางตัน (แพ้เพราะรอเกินเวลารอสูงสุดได้ เฉพาะภารกิจที่มี maxWait)
function playSlow(i, lag, dt = 0.05, limit = 600) {
  const g = sim.createGame(pack, i); sim.startGame(g);
  let lastTap = -lag;
  while (g.state === 'play' && g.time < limit) {
    if (g.time - lastTap >= lag) { const t = sim.nextTarget(g); if (t) { sim.press(g, t); lastTap = g.time; } }
    sim.step(g, dt);
  }
  return { state: g.state, code: g.result && g.result.code || '', pct: Math.round(100 * g.score / g.max), time: g.time };
}
if (!pack.levels.some(l => l.error)) {
  console.log('\nบอทมือช้า (แตะ 1 ครั้งทุก 2 / 4 วินาที)');
  pack.levels.forEach((lv, i) => {
    const a = playSlow(i, 2), b = playSlow(i, 4), show = r => `${r.state}${r.code ? ' ' + r.code : ''} ${r.pct}% ${Math.round(r.time)} วิ`;
    console.log(`${lv.id.padEnd(7)} 2 วิ: ${show(a).padEnd(22)} 4 วิ: ${show(b)}`);
    ok(a.state === 'win', `${lv.id} บอทมือช้า 2 วิ ชนะ`, show(a));
    ok(b.state === 'win' || (b.code === 'MAX_WAIT' && lv.maxWait), `${lv.id} บอทมือช้า 4 วิ ไม่ค้าง ไม่ชน ไม่เจอทางตัน`, show(b));
  });
}

// กันทางตันจากตาราง: ขบวนที่เข้าจากขา X ต้องไม่ถูกกำหนดให้จอดทางที่คนก่อนจะออกไปขา X (ยกเว้นมาแบบ after คันเก่าพ้นจอ)
for (const lv of pack.levels) {
  const lastOn = {};
  lv.trains.forEach((t, n) => {
    if (t.type === 'express' || t.stop === false || t.track === undefined || t.origin !== undefined) return;
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
