// WP11 ขบวนยาวตามชนิด: ความยาว, ทางจอดรับได้ (platFit), ตัวตรวจภารกิจ, ขบวนยาวออกพ้นผัง, ปล่อยขบวนต่อท้ายขบวนยาว
import fs from 'node:fs';
import path from 'node:path';
import * as sim from '../src/sim/index.js';

const root = path.resolve(import.meta.dirname, '..');
const readJson = f => JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));
let fails = 0, checks = 0;
const ok = (cond, name, detail = '') => { checks++; if (!cond) { fails++; console.error(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); } };

const { stations, errors } = sim.loadStations(fs.readdirSync(path.join(root, 'data/stations')).filter(f => f.endsWith('.json')).map(f => ({ name: f, json: readJson('data/stations/' + f) })));
const eras = readJson('data/levels/namtok.json').eras;
const packOf = (station, trains, extra = {}) => sim.loadLevelPack({ schema: 2, id: 't', eras, levels: [{ id: 'x', station, era: 2, name: 'x', goal: 'x', speed: 64, hints: true, tips: [], trains, ...extra }] }, stations, errors);

// 1) ความยาวตามชนิด: รถดีเซลราง 1 คัน = ความยาวเดิมของเกม
ok(sim.kindLen('railcar') === sim.TL, 'รถดีเซลราง 1 คันยาวเท่า TL เดิม (72)', sim.kindLen('railcar'));
ok(sim.kindLen('railcar2') === 144 && sim.kindLen('railcar3') === 216 && sim.kindLen('local') === 224 && sim.kindLen('freight') === 208, 'ความยาวชนิดอื่น 144/216/224/208',
  ['railcar2', 'railcar3', 'local', 'freight'].map(sim.kindLen).join('/'));
// 2) ทางจอดทุกสถานีของเส้นทางสอนรับขบวนยาวสุด (หัวรถจักร + ตู้ 2) ได้
for (const id of ['tha-kilen', 'wang-pho', 'nam-tok', 'kanchanaburi', 'nong-pla-duk-jn']) {
  const fit = stations[id].platFit;
  ok(Object.values(fit).every(v => v >= sim.kindLen('local')), `${id}: ทุกทางจอดรับขบวน 224 ได้`, JSON.stringify(fit));
}
// 3) ตัวตรวจภารกิจ: ชนิดผิด / ยาวเกินทาง = error ไม่ใช่เล่นแล้วพัง
{
  const bad = packOf('wang-pho', [{ at: 1, from: 'W', to: 'E', track: 'loop1', kind: 'bogus' }]);
  ok(!bad.ok, 'ชนิดขบวนที่ไม่มีถูกปฏิเสธ');
  const st = JSON.parse(JSON.stringify(readJson('data/stations/wang-pho.json')));
  const s2 = sim.loadStation(st).station; s2.platFit = { ...s2.platFit, 2: 150 }; // จำลองทางจอดสั้น
  const r = sim.loadLevelPack({ schema: 2, id: 't', eras, levels: [{ id: 'x', station: 'wang-pho', era: 2, name: 'x', goal: 'x', speed: 64, tips: [], trains: [{ at: 1, from: 'W', to: 'E', track: 'loop1', kind: 'local' }] }] }, { 'wang-pho': s2 }, {});
  ok(r.ok && /ไม่พอ/.test(r.pack.levels[0].error || ''), 'ขบวนยาวกว่าทางจอดเป็น error ของภารกิจ', r.ok ? r.pack.levels[0].error : r.errors);
}
// 4) ขบวนยาวกว่ารางขาออก: หัวพ้นผังแล้วยังครอบครองรางจนท้ายเข้ารางขาออกทั้งขบวน (เส้นทางและประแจไม่ปลดใต้ท้ายรถ)
{
  const r = packOf('kanchanaburi', [{ at: 1, from: 'W', to: 'E', track: 'loop1', kind: 'local' }]);
  ok(r.ok && !r.pack.levels[0].error, 'ภารกิจทดสอบกาญจนบุรีโหลดได้', r.ok ? r.pack.levels[0].error : r.errors);
  const g = sim.createGame(r.pack, 0); sim.startGame(g);
  let exitAt = null, gone = false, goneTail = true, removedClear = null;
  for (let n = 0; n < 8000 && g.state === 'play'; n++) {
    const t = sim.nextTarget(g); if (t) sim.press(g, t);
    sim.step(g, 0.05);
    const tr = g.trains[0];
    if (exitAt === null && g.done === 1) exitAt = g.time;
    if (tr && tr.gone) {
      gone = true;
      const P = g.L.portals.E;
      // ระหว่างที่ท้ายยังอยู่ในผัง รางใต้ท้ายต้องยังมีรถ (trackState.occupied)
      for (const q of tr.trail) if (g.E[q.e].track !== P.track && !sim.trackState(g, g.E[q.e].track).occupied) goneTail = false;
    }
    if (gone && removedClear === null && !g.trains.length) removedClear = g.time;
  }
  ok(g.state === 'win', 'ขบวนยาวออกจากกาญจนบุรีจนจบภารกิจ', g.state);
  ok(gone, 'ขบวน 224 ยาวกว่ารางขาออก E (170) จึงยังอยู่ในผังหลังหัวพ้นขอบ');
  ok(goneTail, 'รางใต้ท้ายขบวนที่กำลังออกยังนับว่ามีรถ');
  ok(removedClear !== null && removedClear > exitAt, 'ลบขบวนหลังท้ายพ้นคอสถานี', `${exitAt} -> ${removedClear}`);
}
// 5) ขบวนที่สองจากขาเดียวกันไม่เกิดทับท้ายขบวนยาว และบอทเล่นภารกิจจนจบโดยไม่ชน
{
  const r = packOf('kanchanaburi', [{ at: 1, from: 'W', to: 'E', track: 'loop1', kind: 'local' }, { at: 2, from: 'W', to: 'E', track: 'loop2', kind: 'railcar3' }]);
  const g = sim.createGame(r.pack, 0); sim.startGame(g);
  let minGap = Infinity;
  for (let n = 0; n < 8000 && g.state === 'play'; n++) {
    const t = sim.nextTarget(g); if (t) sim.press(g, t);
    sim.step(g, 0.05);
    if (g.trains.length === 2) { const [a, b] = g.trains; for (const p of a.trail) for (const q of b.trail) minGap = Math.min(minGap, Math.hypot(p.x - q.x, p.y - q.y)); }
  }
  ok(g.state === 'win', 'ขบวนยาวสองขบวนเข้าจากขาเดียวกันเล่นจบ', `${g.state} ${g.result && g.result.code}`);
  ok(minGap >= 10, 'ขบวนที่สองไม่เกิดซ้อนท้ายขบวนแรก', minGap.toFixed(1));
}
console.log(fails ? `\nไม่ผ่าน ${fails}/${checks}` : `ขบวนยาวตามชนิด: ผ่าน ${checks} ข้อ`);
process.exit(fails ? 1 : 0);
