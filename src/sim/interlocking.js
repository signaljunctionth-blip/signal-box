// อินเตอร์ล็อก: เดินเส้นทางจากสัญญาณ, ล็อก/ปลดล็อกเส้นทาง, คำสั่งแตะสัญญาณและประแจ
// ทุกฟังก์ชันรับสถานะเกม g เป็นตัวแรก คำสั่งคืน true เมื่อระบบรับคำสั่ง, false เมื่อปฏิเสธ (เหตุผลส่งทาง event 'msg')
import { T } from './messages.js';
import { msg, fail } from './events.js';

// เดินจากสัญญาณตามตำแหน่งประแจปัจจุบัน จนถึงขอบที่มีสัญญาณถัดไปหรือขาออก
export function walk(g, sig) {
  const { E, P, S } = g, edges = [], req = [];
  let nx = E[S[sig].edge].next;
  for (let n = 0; n < g.L.edgeCount; n++) {
    let cur;
    if (typeof nx === 'string') cur = nx;
    else if (nx.pt) { const pos = P[nx.pt].pos; req.push([nx.pt, pos]); cur = nx[pos]; }
    else {
      req.push([nx.trail, nx.as]);
      if (P[nx.trail].pos !== nx.as) return { ok: false, edges, req, reason: T.trailNotSet(nx.trail) };
      cur = nx.to;
    }
    edges.push(cur);
    const e = E[cur];
    if (e.sig || e.exit) break;
    nx = e.next;
  }
  return { ok: true, edges, req };
}

// ขอบรางที่ขบวน t ทับอยู่ (หัวขบวน + ทุกจุดของหางที่ลากตาม)
export const occEdges = t => { const s = new Set([t.edge]); for (const p of t.trail) s.add(p.e); return s; };
export const edgeOccupied = (g, id) => g.trains.some(t => occEdges(t).has(id));
export function nearPoint(g, p) {
  for (const t of g.trains) for (const q of t.trail) if (Math.hypot(q.x - p.x, q.y - p.y) < 30) return true;
  return false;
}

export function release(g, r) {
  for (const e of r.edges) if (g.lockOf[e] === r) delete g.lockOf[e];
  for (const k in g.P) if (g.P[k].lock === r) g.P[k].lock = null;
  g.routes = g.routes.filter(x => x !== r);
}

export function tapSignal(g, id) {
  const s = g.S[id];
  if (s.aspect === 'G') {
    if (s.route) release(g, s.route);
    s.aspect = 'R'; s.route = null; msg(g, T.cancelSignal(id)); return true;
  }
  if (!g.era.interlock) { s.aspect = 'G'; msg(g, T.openNoInterlock(id)); return true; }
  const w = walk(g, id);
  if (!w.ok) return msg(g, w.reason, 'bad');
  for (const e of w.edges) {
    if (g.lockOf[e]) return msg(g, T.routeConflict(g.lockOf[e].sig), 'bad');
    if (edgeOccupied(g, e)) return msg(g, g.E[e].plat ? T.platOccupied(g.E[e].plat) : T.routeOccupied(), 'bad');
  }
  const r = { sig: id, edges: w.edges, passed: false, train: null };
  for (const e of w.edges) g.lockOf[e] = r;
  for (const [p] of w.req) g.P[p].lock = r;
  g.routes.push(r); s.route = r; s.aspect = 'G';
  const dest = g.E[w.edges[w.edges.length - 1]];
  msg(g, dest.plat ? T.routeSetIn(dest.plat) : T.routeSetOut(id), 'good');
  return true;
}

export function tapPoint(g, k) {
  const p = g.P[k];
  if (g.era.nx) return msg(g, T.nxPointsAuto());
  if (g.era.interlock) {
    if (p.lock) return msg(g, T.pointLocked(k, p.lock.sig), 'bad');
    if (nearPoint(g, p)) return msg(g, T.pointOccupied(k), 'bad');
  }
  p.pos = p.pos === 'N' ? 'R' : 'N';
  if (!g.era.interlock && nearPoint(g, p)) { fail(g, T.failDerail(), T.failDerailSwitched(k)); return true; }
  msg(g, T.pointMoved(k, p.pos));
  return true;
}

// ยุค NX: ตั้งประแจตาม req ให้ครบก่อน แล้วเปิดสัญญาณ
export function autoRoute(g, sig, req) {
  for (const [k, pos] of req) {
    const p = g.P[k];
    if (p.pos === pos) continue;
    if (p.lock) return msg(g, T.autoPointLocked(k, p.lock.sig), 'bad');
    if (nearPoint(g, p)) return msg(g, T.autoPointOccupied(k), 'bad');
  }
  for (const [k, pos] of req) g.P[k].pos = pos;
  return tapSignal(g, sig);
}
