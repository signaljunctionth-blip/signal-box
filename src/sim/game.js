// สถานะเกม 1 ด่าน และการเดินเวลา — ไม่มีตัวแปร global: ทุกอย่างอยู่ในอ็อบเจกต์ g ที่ createGame คืนมา
import { createRng } from './rng.js';
import { TL, spawn, moveTrain, checkCollisions } from './trains.js';
import { occEdges, release } from './interlocking.js';
import { msg, win } from './events.js';

export const FIXED_DT = 1 / 120; // ช่วงเวลามาตรฐานของ 1 ก้าว (ผู้เรียกควรใช้ค่านี้เสมอเพื่อให้ผลซ้ำได้)

// pack = ชุดด่านจาก loadLevelPack, i = ลำดับด่าน (เริ่ม 0)
// opts: { onEvent(ev, g), seed }
export function createGame(pack, i, { onEvent = null, seed = 1 } = {}) {
  const lv = pack.levels[i];
  if (!lv) throw new Error(`ไม่มีด่านลำดับ ${i} ในชุด ${pack.id}`);
  if (lv.error) throw new Error(`ด่าน ${i + 1} เล่นไม่ได้: ${lv.error}`);
  const era = pack.eras[lv.era], L = lv.L;
  const P = {}, S = {};
  for (const k in L.P) P[k] = { ...L.P[k], pos: 'N', lock: null };
  for (const k in L.S) S[k] = { ...L.S[k], aspect: 'R', route: null };
  return {
    i, lv, era, L, E: L.E, P, S,       // ด่าน ยุค ผัง (L, E คงที่) ประแจ (pos, lock) สัญญาณ (aspect, route)
    trains: [], routes: [], lockOf: {}, // ขบวนในผัง, เส้นทางที่ล็อกอยู่, ขอบราง -> เส้นทางที่ล็อก
    time: 0, spawned: 0, done: 0, score: 0, max: lv.trains.length * 150,
    state: 'intro',                     // 'intro' | 'play' | 'win' | 'fail'
    nxSel: null, nid: 1, result: null,
    seed, rng: createRng(seed), onEvent,
  };
}

export function startGame(g) {
  if (g.state !== 'intro') return;
  g.state = 'play'; msg(g, g.lv.goal);
}

// เดินเวลา dt วินาที (ไม่อ่านนาฬิกาจริง) ไม่ทำอะไรถ้าเกมไม่ได้อยู่ในสถานะ 'play'
export function step(g, dt = FIXED_DT) {
  if (g.state !== 'play') return;
  g.time += dt;
  const next = g.lv.trains[g.spawned];
  if (next) {
    const entry = next[2] || g.L.entry;
    if (g.time >= next[0] && !g.trains.some(t => t.edge === entry && t.s < TL + 24)) spawn(g, next[1], entry);
  }
  for (const t of [...g.trains]) { moveTrain(g, t, dt); if (g.state !== 'play') return; }
  for (const r of [...g.routes]) if (r.passed) {
    const occ = g.trains.includes(r.train) ? occEdges(r.train) : new Set();
    if (!r.edges.slice(0, -1).some(e => occ.has(e))) release(g, r);
  }
  checkCollisions(g);
  if (g.state === 'play' && g.spawned === g.lv.trains.length && g.trains.length === 0) win(g);
}
