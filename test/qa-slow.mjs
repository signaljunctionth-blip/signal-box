// QA: ผู้เล่นมือช้ามาก (หน่วง lag วินาทีในเกมก่อนแตะตามคำใบ้แต่ละครั้ง) ทุกภารกิจต้องจบได้ ไม่วนไม่รู้จบ
// ใช้: node test/qa-slow.mjs [lag=40] [id] [-v]
import fs from 'node:fs'; import path from 'node:path'; import * as sim from '../src/sim/index.js';
const root = path.resolve(import.meta.dirname, '..'), rj = f => JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));
const { stations, errors } = sim.loadStations(fs.readdirSync(path.join(root, 'data/stations')).filter(f => f.endsWith('.json')).sort().map(f => ({ name: f, json: rj('data/stations/' + f) })));
const pack = sim.loadLevelPack(rj('data/levels/namtok.json'), stations, errors).pack;
const lags = (process.argv[2] || '40').split(',').map(Number), only = process.argv[3] && process.argv[3] !== '-v' ? process.argv[3] : null, v = process.argv.includes('-v');
for (const lag of lags) for (let i = 0; i < pack.levels.length; i++) {
  const lv = pack.levels[i]; if (only && lv.id !== only) continue;
  const log = []; let code = '';
  const g = sim.createGame(pack, i, { onEvent: ev => { if (ev.type === 'msg') log.push(`   ${g.time.toFixed(1)} msg[${ev.kind || ''}${ev.code ? ' ' + ev.code : ''}] ${ev.text}`); if (ev.type === 'fail') code = ev.code; if (ev.type === 'stall') log.push(`   ${g.time.toFixed(1)} STALL`); } });
  sim.startGame(g);
  const stepS = s => { for (let n = Math.round(s / sim.FIXED_DT); n > 0 && g.state === 'play'; n--) sim.step(g, sim.FIXED_DT); };
  let taps = 0;
  while (g.state === 'play' && taps < 300 && g.time < 6000) {
    let t = sim.nextTarget(g);
    for (let n = 0; !t && n < 40 && g.state === 'play'; n++) { sim.step(g, 0.05); t = sim.nextTarget(g); }
    if (!t) continue;
    stepS(lag); if (g.state !== 'play') break;
    t = sim.nextTarget(g); if (!t) continue;
    log.push(`   ${g.time.toFixed(1)} แตะ ${t.kind}:${t.id ?? t.no}  (ขบวน ${g.trains.map(x => `${x.id}@${x.edge}${x.stopped ? ' จอด' : ''}`).join(', ')})`);
    sim.press(g, t); taps++;
  }
  console.log(`lag ${lag} ${lv.id}: ${g.state}${code ? ' ' + code : ''} ส่ง ${g.done}/${lv.sched.length} คะแนน ${Math.round(g.score)}/${g.max} เวลา ${g.time.toFixed(0)} วิ แตะ ${taps}`);
  if (v || (g.state === 'play')) console.log(log.slice(0, 40).join('\n'));
}
