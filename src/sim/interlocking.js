// อินเตอร์ล็อก: เดินเส้นทางจากสัญญาณ, ล็อก/ปลดล็อกเส้นทาง, overlap, คำสั่งแตะสัญญาณและประแจ
// ทุกฟังก์ชันรับสถานะเกม g เป็นตัวแรก คำสั่งคืน true เมื่อระบบรับคำสั่ง, false เมื่อปฏิเสธ (เหตุผลส่งทาง event 'msg' พร้อม code)
// การล็อกและการครอบครองคิดจากรางกายภาพ (E[k].track): ขอบราง k (ทิศ E) กับ k~ (ทิศ W) คือรางเส้นเดียวกัน
import { T, way } from './messages.js';
import { msg, fail } from './events.js';
import { blockState, blockFree, requestPermit, returnPermit, tokenMode, hasToken } from './block.js';

// ชื่อที่ผู้เล่นเห็นของสัญญาณ (ฟิลด์ label ในไฟล์ผัง) แยกจาก id ภายใน
export const sigName = (g, id) => (g.S[id] && g.S[id].label) || id;
export const T_OVL = 2; // วินาทีที่ขบวนต้องจอดนิ่งในรางจอดก่อนคืน overlap (SIGNALLING-RULES 2.9)
export const T_CANCEL = 3; // วินาทีที่เส้นทางยังล็อกหลังยกเลิกเสาที่มีขบวนเข้าใกล้ (approach locking, 2.10)

// เดินจากสัญญาณตามตำแหน่งประแจปัจจุบัน จนถึงขอบที่มีสัญญาณถัดไป ขาออก หรือทางตัน
export function walk(g, sig) {
  const { E, P, S } = g, edges = [], req = [];
  let nx = E[S[sig].edge].next;
  for (let n = 0; n < g.L.edgeCount && nx; n++) {
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
// ขบวน t ทับรางกายภาพ track อยู่หรือไม่ (ไม่สนทิศ)
export function onTrack(g, t, track) {
  const E = g.E;
  if (E[t.edge].track === track) return true;
  for (const p of t.trail) if (E[p.e].track === track) return true;
  return false;
}
// มีรถทับรางของขอบ id หรือไม่ (id เป็นขอบทิศไหนของรางก็ได้)
export function edgeOccupied(g, id) {
  const track = g.E[id].track;
  for (const t of g.trains) if (onTrack(g, t, track)) return true;
  return false;
}
export function nearPoint(g, p) {
  for (const t of g.trains) for (const q of t.trail) if (Math.hypot(q.x - p.x, q.y - p.y) < 30) return true;
  return false;
}
// ใกล้ประแจในระยะที่กลับแล้วตกราง: ผังสองทิศนับเฉพาะส่วนของขบวนที่อยู่บนรางของประแจตัวนั้น (โคน, N, R) ผังเดิมนับทุกจุดแบบต้นแบบ
export function underPoint(g, p) {
  if (!p.tracks) return nearPoint(g, p);
  for (const t of g.trains) for (const q of t.trail) if (Math.hypot(q.x - p.x, q.y - p.y) < 30 && p.tracks.includes(g.E[q.e].track)) return true;
  return false;
}
// ประแจ "มีรถทับ" ในความหมายของอินเตอร์ล็อก: ผังสองทิศ = มีรถบนรางของประแจตัวนั้น (โคน, N, R), ผังเดิม = รัศมี 30 แบบต้นแบบ
// ความปลอดภัยส่วนที่เหลือมาจากการล็อกเส้นทางและ overlap ไม่ใช่จากการห้ามกลับประแจทั้งคอสถานี
export function pointBusy(g, p) {
  if (!p.tracks) return nearPoint(g, p);
  for (const tk of p.tracks) for (const t of g.trains) if (onTrack(g, t, tk)) return true;
  return false;
}

function dropOverlap(g, o) {
  for (const k of o.tracks) if (g.ovlOf[k] === o) delete g.ovlOf[k];
  for (const k in g.P) if (g.P[k].ovl === o) g.P[k].ovl = null;
  g.overlaps = g.overlaps.filter(x => x !== o);
}

// ทางหยุดเลย (overlap) ของรางจอดที่จบด้วยขอบ dest: เดินต่อจากเสาออกปลายทาง จนถึงรางของขา ทางจอด หรือทางตัน
// คืน { tracks: รางบนเส้นนั้น (ไม่รวมรางที่ไปหยุด), points: ประแจบนเส้นนั้น, req: [[ประแจ, ท่าที่ทางหยุดเลยต้องใช้]], zone: ตอนคอสถานีที่เส้นนี้อยู่ }
// ประแจด้านหน้า (เข้าทางโคน) ใช้ท่าที่เป็นอยู่, ประแจด้านหลัง (เข้าทางขา N/R) ต้องอยู่ท่าของขาที่ขบวนหยุดเลยวิ่งเข้าไป ไม่งั้นขบวนจะฝ่าประแจ
// pos = ท่าประแจที่จะถูกตั้ง (เช่น req ของเส้นทางที่กำลังจะตั้ง) ใช้แทนท่าปัจจุบัน
export function overlapPath(g, dest, pos = null) {
  const E = g.E, L = g.L, tracks = [], points = [], req = [];
  const at = k => (pos && pos[k]) || g.P[k].pos;
  let nx = dest.next, zone = null;
  for (let n = 0; n < L.edgeCount && nx; n++) {
    let cur;
    if (typeof nx === 'string') cur = nx;
    else if (nx.pt) { const p = at(nx.pt); points.push(nx.pt); req.push([nx.pt, p]); cur = nx[p]; }
    else { points.push(nx.trail); req.push([nx.trail, nx.as]); cur = nx.to; }
    const sec = L.sections[L.sectionOf[E[cur].track]];
    if (!sec || sec.kind !== 'throat') break;
    zone = sec.id; tracks.push(E[cur].track);
    nx = E[cur].next;
  }
  return { tracks, points, req, zone };
}

// ระบบตั้งประแจบนทางหยุดเลยให้เองไหม: ยุควงจรตอนราง/ไฟสีและยุค NX ตั้งให้ (ค่าตั้งต้น)
// ยุคอินเตอร์ล็อกกลอ่านค่า overlapPointsAuto ของยุคในชุดด่าน (ไม่ใส่ = false ผู้เล่นต้องสับเอง) เปลี่ยนได้ด้วยการแก้ข้อมูลอย่างเดียว
export function overlapAuto(g) {
  const e = g.era;
  if (!e.interlock) return false;
  return typeof e.overlapPointsAuto === 'boolean' ? e.overlapPointsAuto : !!(e.tc || e.nx);
}

// ประแจบนทางหยุดเลยพร้อมไหม คืน null = พร้อม (หรือย้ายได้ถ้า move) หรือ { code, text }
// move = ประแจที่ยังไม่อยู่ท่าจะถูกสับ (ระบบตั้งให้ หรือคำใบ้ถามล่วงหน้าว่าผู้เล่นสับเองได้ไหม) ต้องว่าง: ไม่ล็อก ไม่ถูกกัน ไม่มีรถทับ
function overlapPointsBlock(g, ovl, move) {
  for (const [k, want] of ovl.req) {
    const p = g.P[k];
    if (p.pos === want) continue;
    if (!move) return { code: 'OVERLAP_POINT_NOT_SET', text: T.overlapPointNotSet(k, want) };
    if (g.lv.pointsLocked) return { code: 'POINTS_FIXED', text: T.pointsFixed() };
    if (p.lock) return { code: 'POINT_LOCKED', text: T.overlapPointLocked(k, sigName(g, p.lock.sig)) };
    if (p.ovl) return { code: 'OVERLAP_HELD', text: T.overlapHeld(sigName(g, p.ovl.sig)) };
    if (pointBusy(g, p)) return { code: 'POINT_OCCUPIED', text: T.overlapPointOccupied(k) };
  }
  return null;
}

// จอง overlap ให้เส้นทางรับเข้า route ที่จบที่ขอบ dest: ล็อกรางและประแจบนทางหยุดเลย (1.8, 2.6)
// ประแจที่ยังไม่อยู่ท่าที่ทางหยุดเลยต้องใช้: ยุคที่ระบบตั้งให้ สับให้ถ้าว่าง แล้วล็อกในท่านั้น (คืนรายชื่อประแจที่สับให้)
function holdOverlap(g, dest, route) {
  const path = overlapPath(g, dest), moved = [];
  if (overlapAuto(g)) for (const [k, want] of path.req) {
    const p = g.P[k];
    if (p.pos !== want && !p.lock && !p.ovl && !pointBusy(g, p)) { p.pos = want; moved.push(k); }
  }
  const o = { sig: route.sig, destSig: dest.sig || null, dest: dest.id, tracks: path.tracks, points: path.points, want: Object.fromEntries(path.req), zone: path.zone, route, timer: 0 };
  for (const k of o.tracks) g.ovlOf[k] = o;
  for (const k of o.points) g.P[k].ovl = o;
  g.overlaps.push(o); route.overlap = o;
  return moved;
}

export function release(g, r) {
  for (const e of r.edges) {
    if (g.lockOf[e] === r) delete g.lockOf[e];
    const v = g.E[e].rev; if (v && g.lockOf[v] === r) delete g.lockOf[v];
  }
  for (const k in g.P) if (g.P[k].lock === r) g.P[k].lock = null;
  g.routes = g.routes.filter(x => x !== r);
  if (r.portal) returnPermit(g, r.portal, r);
  if (!r.passed && r.overlap) dropOverlap(g, r.overlap); // ยกเลิกก่อนรถผ่าน: คืน overlap ด้วย
}

// overlap ที่เส้นทางซึ่งจบที่ขอบ dest ต้องจอง: ไม่ต้องจองถ้าตั้งทางออกต่อจากรางนั้นไว้แล้ว (2.4 ข้อยกเว้น)
export function overlapFor(g, dest, pos = null) {
  if (!dest.ovl || !dest.ovl.length || dest.exit) return null;
  if (dest.sig && g.S[dest.sig].route) return null;
  const path = overlapPath(g, dest, pos);
  return path.tracks.length ? path : null;
}

// ตรวจเงื่อนไข 2.2 c–f ของเส้นทางที่ผ่านขอบ edges คืน null = ตั้งได้ หรือ { code, text }
// pos = ท่าประแจที่เส้นทางนี้จะตั้ง ({ ชื่อประแจ: 'N'|'R' }) ใช้คิดทางหยุดเลย ไม่ใส่ = ท่าปัจจุบัน
// plan = ถามล่วงหน้าแทนผู้เล่น (คำใบ้/บอท): ประแจบนทางหยุดเลยที่ผู้เล่นสับเองได้ ถือว่าจะถูกสับ
export function routeConflict(g, sig, edges, pos = null, plan = false) {
  const E = g.E, dest = E[edges[edges.length - 1]];
  if (dest.exit && dest.portal && g.block[dest.portal]) {
    const k = dest.portal, side = g.L.portals[k].label;
    if (tokenMode(g)) { const bad = tokenBlock(g, k, plan); if (bad) return bad; }
    else if (!blockFree(g, k)) {
      const b = blockState(g, k);
      return { code: 'BLOCK_NOT_FREE', text: b.state === 'permit' ? T.blockNotFreePermit(side) : b.dir === 'in' ? T.blockNotFreeIn(side) : T.blockNotFreeOut(side) };
    }
  }
  for (const e of edges) {
    if (g.lockOf[e]) return g.lockOf[e].cancelAt !== undefined ? { code: 'APPROACH_LOCKED', text: T.approachLockedRoute(sigName(g, g.lockOf[e].sig)) } : { code: 'ROUTE_CONFLICT', text: T.routeConflict(sigName(g, g.lockOf[e].sig)) };
    const o = g.ovlOf[E[e].track];
    if (o && o.destSig !== sig) return { code: 'OVERLAP_HELD', text: T.overlapHeld(sigName(g, o.sig)) };
    if (edgeOccupied(g, e)) return { code: 'TRACK_OCCUPIED', text: E[e].plat ? T.platOccupied(E[e].plat, way(g), g.era.tc) : T.routeOccupied(g.era.tc) };
  }
  const ovl = overlapFor(g, dest, pos);
  // overlap กับ overlap ในคอสถานีเดียวกันขัดกันเสมอ (เหมือนเดิม รอเจตัดสิน) ส่วน overlap กับเส้นทาง คิดเฉพาะรางบนทางหยุดเลย
  if (ovl) for (const o of g.overlaps) if (o.zone === ovl.zone) return { code: 'OVERLAP_HELD', text: T.overlapHeld(sigName(g, o.sig)) };
  for (const k of ovl ? ovl.tracks : []) {
    if (g.lockOf[k]) return { code: 'ROUTE_CONFLICT', text: T.overlapBlocked(sigName(g, g.lockOf[k].sig)) };
    if (g.ovlOf[k]) return { code: 'OVERLAP_HELD', text: T.overlapHeld(sigName(g, g.ovlOf[k].sig)) };
    if (edgeOccupied(g, k)) return { code: 'TRACK_OCCUPIED', text: T.overlapOccupied() };
  }
  // ประแจบนทางหยุดเลยต้องอยู่ท่าที่ขบวนหยุดเลยวิ่งผ่านได้ (ไม่ตั้งสวนทาง) ก่อนสัญญาณอนุญาต — ยุคที่ไม่มีอินเตอร์ล็อกไม่มีใครตรวจ
  if (ovl && g.era.interlock) { const bad = overlapPointsBlock(g, ovl, plan || overlapAuto(g)); if (bad) return bad; }
  return null;
}

// ด่านที่มีห่วง: ขบวนออกไปขา k ได้เมื่อผู้เล่นถือห่วงของขานั้นอยู่ที่สถานี คืน null = ได้ หรือ { code, text }
// plan = ถามล่วงหน้า (คำใบ้/บอท/ตัวตรวจทางตัน): ตอนว่างถือว่าผู้เล่นแตะขอห่วงได้
function tokenBlock(g, k, plan = false) {
  if (hasToken(g, k)) return null;
  const b = blockState(g, k), side = g.L.portals[k].label;
  if (b.state !== 'free') return { code: 'BLOCK_NOT_FREE', text: b.dir === 'in' ? T.blockNotFreeIn(side) : T.blockNotFreeOut(side) };
  return plan ? null : { code: 'TOKEN_NEEDED', text: g.era.interlock ? T.tokenNeeded(side) : T.tokenNeededDriver(side) };
}

// มีขบวนกำลังเข้าใกล้เสา id ไหม (approach locking): ขบวนอยู่บนรางหน้าเสา หรือรางก่อนหน้านั้น หรือกำลังมาในตอนทางเดี่ยวสู่เสาเข้านี้
function approaching(g, id) {
  const e = g.S[id].edge;
  if (g.trains.some(t => t.edge === e || g.E[t.edge].next === e)) return true;
  for (const k in g.block) if (g.L.portals[k].entry === e && g.block[k].in !== null) return true;
  return false;
}

// เส้นทางที่ยกเลิกแล้วแต่ยังล็อกรอ T_CANCEL: ครบเวลาแล้วคืน
export function stepCancels(g) {
  for (const r of [...g.routes]) if (r.cancelAt !== undefined && g.time >= r.cancelAt) { release(g, r); msg(g, T.approachReleased(sigName(g, r.sig))); }
}

export function tapSignal(g, id) {
  const s = g.S[id];
  if (s.aspect === 'G') {
    // ยุคที่มี approach locking: ยกเลิกเสาที่มีขบวนเข้าใกล้ เสากลับห้ามทันที แต่เส้นทางและประแจยังล็อกอีก T_CANCEL วินาที
    const held = !!(s.route && g.era.approachLock && !s.route.passed && approaching(g, id));
    if (held) s.route.cancelAt = g.time + T_CANCEL; else if (s.route) release(g, s.route);
    s.aspect = 'R'; s.route = null;
    // ยกเลิกเสาออกที่ตั้งรอขบวนผ่าน: ขบวนที่กำลังเข้ารางนี้ไม่มีทางออกต่อแล้ว ต้องคืน overlap ให้เส้นทางรับเข้า
    const here = g.E[s.edge];
    if (g.era.interlock && here.ovl && here.ovl.length && !g.overlaps.some(o => o.dest === here.id)) {
      const r = g.routes.find(x => x.edges[x.edges.length - 1] === here.id);
      const t = r ? null : g.trains.find(x => x.edge === here.id && !x.stopped && x.state !== 'leaving');
      // ยุคที่ผู้เล่นสับเอง: ประแจบนทางหยุดเลยที่ยังไม่อยู่ท่า (ถ้ามี) ถูกล็อกไว้ก่อน แตะไปท่าที่ถูกได้ (tapPoint)
      if (r) holdOverlap(g, here, r); else if (t) holdOverlap(g, here, { sig: id, passed: true, train: t, edges: [here.id], overlap: null });
    }
    if (held) msg(g, T.approachLocked(sigName(g, id), T_CANCEL), '', 'APPROACH_LOCKED'); else msg(g, T.cancelSignal(sigName(g, id)));
    return true;
  }
  const w = walk(g, id);
  // ด่านที่มีห่วง: เสาออกเปิดไม่ได้ถ้ายังไม่มีห่วงของขาที่จะไป (ยุคไม่มีอินเตอร์ล็อกก็เช่นกัน: คนขับไม่ออกถ้าไม่มีห่วง)
  if (tokenMode(g) && (w.ok || !g.era.interlock)) {
    const last = g.E[w.edges[w.edges.length - 1]];
    if (last && last.exit && last.portal && g.block[last.portal]) { const bad = tokenBlock(g, last.portal); if (bad) return msg(g, bad.text, 'bad', bad.code); }
  }
  if (!g.era.interlock) { s.aspect = 'G'; msg(g, T.openNoInterlock(sigName(g, id))); return true; }
  if (!w.ok) return msg(g, w.reason, 'bad', 'POINT_NOT_SET');
  const bad = routeConflict(g, id, w.edges);
  if (bad) return msg(g, bad.text, 'bad', bad.code);
  const dest = g.E[w.edges[w.edges.length - 1]];
  const r = { sig: id, edges: w.edges, passed: false, train: null, portal: dest.exit ? dest.portal || null : null, overlap: null };
  for (const e of w.edges) { g.lockOf[e] = r; if (g.E[e].rev) g.lockOf[g.E[e].rev] = r; }
  for (const [p] of w.req) g.P[p].lock = r;
  const moved = overlapFor(g, dest) ? holdOverlap(g, dest, r) : [];
  // ตั้งทางออกต่อจากรางจอด: overlap ของทางเข้ารางนั้นคืนได้เลย (2.9)
  for (const o of [...g.overlaps]) if (o.destSig === id) dropOverlap(g, o);
  if (r.portal && !tokenMode(g)) requestPermit(g, r.portal, 'out', r);
  g.routes.push(r); s.route = r; s.aspect = 'G';
  const auto = moved.length ? (g.era.tc || g.era.nx ? T.overlapPointsSet(moved) : T.overlapPointsSetGame(moved)) : '';
  msg(g, (dest.plat ? T.routeSetIn(dest.plat, way(g)) : T.routeSetOut(sigName(g, id))) + auto, 'good');
  return true;
}

// เดินเวลา overlap: คืนเมื่อขบวนจอดนิ่งในรางจอดครบ T_OVL หรือขบวนไม่อยู่ในรางนั้นแล้ว
export function stepOverlaps(g, dt) {
  for (const o of [...g.overlaps]) {
    const r = o.route;
    if (!r.passed) continue;
    const t = r.train;
    if (!g.trains.includes(t) || !(t.edge === o.dest || t.edge === g.E[o.dest].rev)) {
      // ยังวิ่งอยู่ในคอสถานี = รอ, พ้นรางจอดไปแล้วหรือออกจากผังแล้ว = คืน
      if (g.trains.includes(t) && r.edges.includes(t.edge)) continue;
      dropOverlap(g, o); continue;
    }
    o.timer = t.stopped ? o.timer + dt : 0;
    if (o.timer >= T_OVL) dropOverlap(g, o);
  }
}

export function tapPoint(g, k) {
  const p = g.P[k];
  if (g.lv.pointsLocked) return msg(g, T.pointsFixed(), '', 'POINTS_FIXED');
  if (g.era.nx) return msg(g, T.nxPointsAuto());
  if (g.era.interlock) {
    if (p.lock && p.lock.cancelAt !== undefined) return msg(g, T.pointApproachLocked(k, Math.max(0, Math.ceil(p.lock.cancelAt - g.time))), 'bad', 'APPROACH_LOCKED');
    if (p.lock) return msg(g, T.pointLocked(k, sigName(g, p.lock.sig)), 'bad', 'POINT_LOCKED');
    // ประแจที่ทางหยุดเลยกันไว้: แตะไปท่าที่ทางหยุดเลยต้องใช้ได้ (แก้ท่าที่ยังสวนทาง) แตะออกจากท่านั้นไม่ได้
    if (p.ovl && !(p.ovl.want && p.ovl.want[k] && p.ovl.want[k] !== p.pos)) return msg(g, T.pointOverlapLocked(k), 'bad', 'POINT_LOCKED');
    if (pointBusy(g, p)) return msg(g, T.pointOccupied(k), 'bad', 'POINT_OCCUPIED');
  }
  p.pos = p.pos === 'N' ? 'R' : 'N';
  if (!g.era.interlock && underPoint(g, p)) { fail(g, T.failDerail(), T.failDerailSwitched(k), 'DERAIL_UNDER'); return true; }
  msg(g, T.pointMoved(k, p.pos));
  return true;
}

// ประแจ k ย้ายไปท่า pos ได้ไหมเพื่อเส้นทางจากสัญญาณ sig (ประแจที่ล็อกด้วย overlap ของทางเข้ารางเดียวกัน ระบบ NX ย้ายให้ได้)
function pointBlock(g, sig, k, takeover) {
  const p = g.P[k];
  if (p.lock) return { code: 'POINT_LOCKED', text: T.autoPointLocked(k, sigName(g, p.lock.sig)) };
  if (p.ovl && !(takeover && p.ovl.destSig === sig)) return { code: 'POINT_LOCKED', text: T.pointOverlapLocked(k) };
  if (pointBusy(g, p)) return { code: 'POINT_OCCUPIED', text: T.autoPointOccupied(k) };
  return null;
}

// ยุค NX: ตั้งประแจตาม req ให้ครบก่อน แล้วเปิดสัญญาณ
// ตรวจทุกเงื่อนไขก่อนย้ายประแจ: ถ้าถูกปฏิเสธ ต้องไม่มีอะไรเปลี่ยน
export function autoRoute(g, sig, req) {
  for (const [k, pos] of req) {
    if (g.P[k].pos === pos) continue;
    const bad = pointBlock(g, sig, k, true);
    if (bad) return msg(g, bad.text, 'bad', bad.code);
  }
  const key = JSON.stringify(req), r = g.S[sig].aspect === 'R' && g.era.interlock ? g.L.routes[sig].find(x => JSON.stringify(x.req) === key) : null;
  if (r) { const bad = routeConflict(g, sig, r.edges, Object.fromEntries(req)); if (bad) return msg(g, bad.text, 'bad', bad.code); }
  for (const [k, pos] of req) g.P[k].pos = pos;
  return tapSignal(g, sig);
}

// ถามล่วงหน้า (ไม่เปลี่ยนสถานะ): เส้นทาง r (จาก L.routes[sig]) ตั้งได้ตอนนี้ไหม คืน null = ได้ หรือ { code, text }
// ใช้กับคำใบ้ บอท และตัวตรวจทางตัน คิดเหมือนยุคที่มีอินเตอร์ล็อกเสมอ
export function canRoute(g, sig, r) {
  if (g.S[sig].aspect === 'G') return { code: 'ALREADY_SET', text: '' };
  for (const [k, pos] of r.req) {
    if (g.P[k].pos === pos) continue;
    if (g.lv.pointsLocked) return { code: 'POINTS_FIXED', text: T.pointsFixed() };
    const bad = pointBlock(g, sig, k, g.era.nx);
    if (bad) return bad;
    if (!g.era.interlock && underPoint(g, g.P[k])) return { code: 'POINT_OCCUPIED', text: T.autoPointOccupied(k) };
  }
  return routeConflict(g, sig, r.edges, Object.fromEntries(r.req), true);
}

// ประแจบนทางหยุดเลยของเส้นทาง r ที่ผู้เล่นต้องสับเองก่อนแตะสัญญาณ (ยุคอินเตอร์ล็อกกลที่ระบบไม่ตั้งให้) คืน [[ประแจ, ท่า]]
export function overlapMoves(g, r) {
  if (!g.era.interlock || overlapAuto(g)) return [];
  const ovl = overlapFor(g, g.E[r.edges[r.edges.length - 1]], Object.fromEntries(r.req));
  return ovl ? ovl.req.filter(([k, pos]) => g.P[k].pos !== pos) : [];
}

// ตั้งเส้นทาง r ให้เสร็จในคำสั่งเดียว (สับประแจที่ต้องสับ แล้วเปิดสัญญาณ) สำหรับบอทและ ARS — ผู้เล่นใช้ press ทีละแตะ
export function setRoute(g, sig, r) {
  if (g.era.nx) return autoRoute(g, sig, r.req);
  for (const [k, pos] of [...r.req, ...overlapMoves(g, r)]) if (g.P[k].pos !== pos && !tapPoint(g, k)) return false;
  return g.state === 'play' ? tapSignal(g, sig) : false;
}
