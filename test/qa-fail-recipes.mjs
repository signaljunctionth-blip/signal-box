// QA: หาสูตรแพ้แบบทำซ้ำได้ของแต่ละสาเหตุ (ใช้ sim ตรง ๆ ใน Node) แล้วเขียนเป็น JSON ให้ qa-ui.js เล่นซ้ำผ่านหน้าจอจริง
// ใช้: node test/qa-fail-recipes.mjs <out.json>
import fs from 'node:fs';
import path from 'node:path';
import * as sim from '../src/sim/index.js';

const root = path.resolve(import.meta.dirname, '..');
const readJson = f => JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));
const stationJson = fs.readdirSync(path.join(root, 'data/stations')).filter(f => f.endsWith('.json')).sort().map(f => ({ name: f, json: readJson('data/stations/' + f) }));
const { stations, errors } = sim.loadStations(stationJson);
const PACK = process.env.QA_PACK || 'namtok';
const pack = sim.loadLevelPack(readJson(`data/levels/${PACK}.json`), stations, errors).pack;

// ตัวสุ่มแบบมี seed
const rng = seed => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const found = {}; // code -> { id, actions:[{t, target}], time }
const want = process.argv[3] ? process.argv[3].split(',') : null;

for (const lv of pack.levels) {
  if (want && !want.includes(lv.id)) continue;
  const i = pack.levels.indexOf(lv);
  for (let seed = 1; seed <= 900; seed++) {
    const mode = seed % 3; // 0 = สุ่มทุกเป้า, 1 = เปิดแต่เสาเข้า + สับประแจ ไม่ปล่อยออก, 2 = ตามคำใบ้แต่แทรกแตะมั่ว
    const r = rng(seed * 7919 + i);
    let code = null;
    const g = sim.createGame(pack, i, { onEvent: ev => { if (ev.type === 'fail') code = ev.code; } });
    sim.startGame(g);
    const targets = [...Object.keys(g.L.S).map(k => ({ kind: 'signal', id: k })), ...Object.keys(g.L.P).map(k => ({ kind: 'point', id: k })), ...g.L.plats.map(n => ({ kind: 'platform', no: n })), ...Object.keys(g.L.portals || {}).map(k => ({ kind: 'portal', id: k }))];
    const actions = [];
    const rate = 0.02 + 0.1 * r();
    const homes = targets.filter(t => t.kind === 'signal' && g.L.S[t.id].type !== 'starter').concat(targets.filter(t => t.kind !== 'signal'));
    const pick = pool => pool[Math.floor(r() * pool.length)];
    const act = t => { actions.push({ step: steps, target: t }); sim.press(g, t); };
    let steps = 0;
    for (; steps < 6000 && g.state === 'play'; steps++) {
      if (mode === 2) { if (r() < 0.3) { const t = sim.nextTarget(g); if (t) act(t); } if (r() < rate * 0.4) act(pick(targets)); }
      else if (r() < rate) act(pick(mode === 1 ? homes : targets));
      sim.step(g, sim.FIXED_DT);
    }
    if (code) {
      const key = code + '@' + lv.id;
      if (process.env.QA_PACK) found[key] && 0;
      if (!found[key] || found[key].actions.length > actions.length) found[key] = { code, pack: PACK, id: lv.id, station: lv.station, steps, actions, dt: sim.FIXED_DT };
    }
  }
}
const byCode = {};
for (const k in found) (byCode[found[k].code] ||= []).push(`${found[k].id}(${found[k].actions.length} แตะ ${found[k].steps} ก้าว)`);
for (const c in byCode) console.log(c, byCode[c].join(' '));
if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify(found));
