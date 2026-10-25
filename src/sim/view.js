// ตัวอ่านสถานะสำหรับตัววาดและ UI (ไม่แก้สถานะ ไม่แตะ DOM) — ใช้แทนการไล่อ่านโครงสร้างภายในเอง
import { edgeOccupied } from './interlocking.js';
import { blockState } from './block.js';
import { graceOf } from './trains.js';
import { KINDS, DEFAULT_KIND } from './consists.js';

// สถานะของรางกายภาพ 1 เส้น: { locked: สัญญาณต้นทางของเส้นทางที่ล็อก | null, overlap: สัญญาณของ overlap ที่จอง | null, occupied }
export function trackState(g, track) {
  const r = g.lockOf[track], o = g.ovlOf[track];
  return { locked: r ? r.sig : null, overlap: o ? o.sig : null, occupied: edgeOccupied(g, track) };
}

// ข้อมูลขบวนสำหรับป้ายและแถบคิว
export function trainInfo(g, t) {
  const e = g.E[t.edge], P = g.L.portals, to = t.exit ? Object.values(P).find(p => p.exit === t.exit) : null;
  return { id: t.id, plat: t.plat, role: t.plat ? g.L.roleOf[g.L.platEdge[t.plat]] || null : null, express: t.exp, state: t.state, dir: e.dir,
    track: e.track, to: to ? to.id : null, stopped: t.stopped, wait: t.wait, late: t.wait > graceOf(g, t), up: g.L.upDir ? e.dir === g.L.upDir : null,
    token: t.token || null, head: t.trail[t.trail.length - 1], tail: t.trail[0], kind: t.kind || DEFAULT_KIND, len: t.len, cars: KINDS[t.kind || DEFAULT_KIND].cars };
}

// ภาพรวมสถานะแบบข้อมูลล้วน (JSON ได้) สำหรับบอทในเบราว์เซอร์ ตัววาด 3 มิติ และการดีบั๊ก
export function snapshot(g) {
  const tracks = {}, points = {}, signals = {}, blocks = {};
  for (const k in g.E) if (g.E[k].track === k) tracks[k] = trackState(g, k);
  for (const k in g.P) points[k] = { pos: g.P[k].pos, locked: !!(g.P[k].lock || g.P[k].ovl) };
  for (const k in g.S) signals[k] = { label: g.S[k].label || k, type: g.S[k].type, aspect: g.S[k].aspect, dir: g.S[k].dir, track: g.E[g.S[k].edge].track };
  for (const k in g.block) blocks[k] = blockState(g, k);
  // ทางหยุดเลยที่จองอยู่: รางเรียงตามทางจากเสาออกปลายทาง ให้ตัววาดวาดเป็นเส้นประ
  const overlaps = g.overlaps.map(o => ({ sig: o.sig, from: g.E[o.dest].track, dir: g.E[o.dest].dir, tracks: [...o.tracks], points: [...o.points] }));
  return { overlaps, state: g.state, time: g.time, score: g.score, max: g.max, done: g.done, total: g.lv.sched.length, nxSel: g.nxSel,
    tracks, points, signals, blocks, trains: g.trains.map(t => trainInfo(g, t)),
    queue: g.pend.map(i => { const sp = g.lv.sched[i]; return { id: i + 1, plat: sp.plat, express: sp.exp, from: sp.from, to: sp.to, at: sp.at, kind: sp.kind }; }) };
}
