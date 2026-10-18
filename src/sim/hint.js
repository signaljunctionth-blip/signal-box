// คำใบ้ = ตัวตั้งทางอัตโนมัติแบบปลอดภัย: บอกสิ่งถัดไปที่ควรแตะ คืน null หรือ { k, kind, text }
//   kind: 'p' ประแจ | 's' สัญญาณ | 'plat' ทางจอด (k = เลขทาง) | 'portal' ป้ายขาออก (k = ชื่อขา) | 'track' รางปลายทาง
// ปกติทำงานเฉพาะด่านที่เปิด hints; hint(g, { force: true }) ใช้กับบอทและ ARS ได้ทุกด่าน
// nextTarget(g) คืน target ที่ส่งเข้า press() ได้ทันที
import { canRoute, walk, onTrack, sigName, edgeOccupied, overlapMoves } from './interlocking.js';
import { needsDestination } from './control.js';
import { T, way } from './messages.js';

// เส้นทางที่ขบวน t ต้องการจากสัญญาณที่มันจอดรออยู่ (ไม่ดูว่าตั้งได้ไหม)
export function wantedRoute(g, t) {
  const L = g.L, e = g.E[t.edge], sig = e.sig;
  if (!sig) return null;
  const routes = L.routes[sig], R = L.reach, exits = t.exit ? [t.exit] : L.exits;
  const toExit = r => r.exit ? exits.includes(r.to) : exits.some(x => R[r.to].has(x));
  if (t.state === 'arriving') { // ต้องเข้าทางจอดของตัวเอง
    const pe = L.platEdge[t.plat], goal = [pe, g.E[pe].rev];
    return routes.find(r => r.plat === t.plat) || routes.find(r => goal.some(x => x && R[r.to].has(x))) || null;
  }
  const ok = routes.filter(toExit);
  if (!ok.length) return null;
  if (t.state === 'through' && !ok[0].exit) { // ขบวนด่วนที่สัญญาณเข้าเขต: ทางที่ตารางกำหนด ไม่งั้นทางจอดที่ว่างและสับประแจน้อยสุด
    if (t.via !== null) { const r = ok.find(x => x.plat === t.via); if (r) return r; }
    const moves = r => r.req.filter(([k, pos]) => g.P[k].pos !== pos).length;
    const free = ok.filter(r => !canRoute(g, sig, r)).sort((a, b) => moves(a) - moves(b));
    return free[0] || ok[0];
  }
  return ok.find(r => r.exit) || ok[0];
}

// ไม่มีอะไรกำลังจะเปลี่ยนเอง: ทุกขบวนหยุดรอหน้าสัญญาณที่ห้าม ไม่มีเส้นทาง overlap หรือทางสะดวกค้าง ไม่มีขบวนกำลังมา
// (ถ้าสถานะนี้ไม่มีเส้นทางที่เป็นประโยชน์เหลือเลย = ทางตัน)
export function isStatic(g) {
  if (!g.L.bidir || !g.trains.length || g.overlaps.length || g.routes.length) return false;
  for (const k in g.block) { const b = g.block[k]; if (b.tails.length || b.in !== null || b.permit) return false; }
  for (const idx of g.pend) { const sp = g.lv.sched[idx]; if (sp.origin !== null || !g.block[sp.from]) return false; }
  for (const t of g.trains) {
    const sig = g.E[t.edge].sig;
    if (!t.stopped || t.state === 'dwell' || !sig || g.S[sig].aspect === 'G') return false;
  }
  // ยุคไม่มีอินเตอร์ล็อก: เสาที่ผู้เล่นเปิดค้างไว้ยังอาจมีรถมาใช้ ไม่ถือว่านิ่ง
  if (!g.era.interlock) for (const k in g.S) if (g.S[k].aspect === 'G') return false;
  return true;
}

// เส้นทาง r พาขบวน t ไปต่อได้จริงไหม: ออกถูกขา หรือเข้ารางที่ยังไปถึงขาออกของตัวเองได้ (กลับหัวได้เฉพาะที่ทางจอดและทางตัน)
export function leadsOut(g, t, r) {
  const L = g.L, exits = t.exit ? [t.exit] : L.exits, e = g.E[r.to];
  if (r.exit) return exits.includes(r.to);
  const from = e.rev && (e.plat || e.buffer) ? [r.to, e.rev] : [r.to];
  return from.some(a => exits.some(x => L.reach[a].has(x)));
}

// รับขบวน t เข้าราง track แล้วจะขังตัวเองไหม: ขาที่ t ต้องออกมีขบวนกำลังเข้ามา และขบวนนั้นเข้าได้เฉพาะรางนี้ (หรือรางที่มีรถอยู่)
// ตอนทางเดี่ยวจะไม่ว่างจนขบวนนั้นเข้าสถานี แต่มันเข้าไม่ได้เพราะ t ขวางอยู่ = ทางตันที่ก่อเอง
export function trapsItself(g, t, track) {
  if (!t.exit) return false;
  const L = g.L, pk = Object.keys(L.portals).find(k => L.portals[k].exit === t.exit), b = pk && g.block[pk];
  if (!b || (b.in === null && !b.inTrain) || b.inTrain === t) return false;
  const home = g.E[L.portals[pk].entry].sig;
  if (!home) return false;
  return L.routes[home].filter(r => !r.exit).every(r => r.track === track || edgeOccupied(g, r.to));
}

// เส้นทางสำรองเมื่อทางที่ตารางกำหนดใช้ไม่ได้และทุกอย่างหยุดนิ่ง: เส้นทางที่ตั้งได้ตอนนี้และยังพาขบวนไปถึงขาออกของตัวเอง
// คืน [{ t, sig, r }] ว่าง = ไม่มีทางออกเหลือ (ทางตันจริง)
export function escapeRoutes(g) {
  const out = [];
  for (const t of [...g.trains].sort((a, b) => a.id - b.id)) {
    const sig = g.E[t.edge].sig;
    if (!sig || !t.stopped || g.S[sig].aspect !== 'R') continue;
    const moves = r => r.req.filter(([k, pos]) => g.P[k].pos !== pos).length;
    const ok = g.L.routes[sig].filter(r => leadsOut(g, t, r) && !canRoute(g, sig, r) && (r.exit || !trapsItself(g, t, r.track)));
    // ขบวนที่ต้องจอดรับผู้โดยสาร: ทางที่มีชานชาลามาก่อน ทางที่ไม่มีชานชาลาเสนอเมื่อไม่มีทางอื่น
    const pax = r => (r.plat !== null && !(!t.exp && g.L.noPlatform.includes(r.plat)) ? 1 : 0);
    ok.sort((a, b) => pax(b) - pax(a) || moves(a) - moves(b));
    if (ok.length) out.push({ t, sig, r: ok[0] });
  }
  return out.sort((a, b) => (b.t.edge === b.t.entry) - (a.t.edge === a.t.entry));
}

// รางที่ "มีคนจองทางไว้แล้ว" ในยุคไม่มีอินเตอร์ล็อก: ทางของสัญญาณที่เปิดอยู่ + ทางข้างหน้าของขบวนที่กำลังวิ่ง
function claimed(g) {
  const E = g.E, set = new Set();
  for (const k in g.S) if (g.S[k].aspect === 'G') for (const e of walk(g, k).edges) set.add(E[e].track);
  for (const t of g.trains) {
    if (t.stopped) continue;
    let e = E[t.edge];
    for (let n = 0; n < g.L.edgeCount; n++) {
      set.add(e.track);
      if (e.sig || e.exit || !e.next) break;
      const nx = e.next; e = E[typeof nx === 'string' ? nx : nx.pt ? nx[g.P[nx.pt].pos] : nx.to];
    }
  }
  return set;
}

export function hint(g, { force = false } = {}) {
  const L = g.L;
  if ((!g.lv.hints && !force) || g.state !== 'play') return null;
  const ordered = [...g.trains].sort((a, b) => a.id - b.id), claims = g.era.interlock ? null : claimed(g);
  // ตั้งได้อย่างปลอดภัยตอนนี้ไหม (ยุคไม่มีอินเตอร์ล็อกต้องดูเองว่าไม่ทับทางที่มีคนใช้อยู่ และไม่สับประแจในทางนั้น)
  const safe = (t, sig, r) => {
    if (canRoute(g, sig, r)) return false;
    if (!claims) return true;
    if (r.edges.some(e => claims.has(g.E[e].track) && !onTrack(g, t, g.E[e].track))) return false;
    return !r.req.some(([k, pos]) => g.P[k].pos !== pos && [g.P[k].N, g.P[k].R].some(e => claims.has(g.E[e].track)));
  };
  // ขั้นถัดไปของการตั้งเส้นทาง r: สับประแจทีละตัว แล้วแตะสัญญาณ (ยุค NX: แตะสัญญาณ แล้วแตะปลายทาง)
  const stepOf = (sig, r, pointText, sigText) => {
    if (g.era.nx) {
      if (!needsDestination(g, sig)) return { k: sig, kind: 's', text: sigText };
      if (g.nxSel !== sig) return { k: sig, kind: 's', text: r.exit || r.plat === null ? sigText : T.hintNxEntrance(sigName(g, sig)) };
      if (r.plat !== null && !r.exit) return { k: r.plat, kind: 'plat', text: T.hintNxPlatform(way(g)) };
      return r.exit ? { k: r.portal, kind: 'portal', text: T.hintNxDest() } : { k: r.track, kind: 'track', text: T.hintNxDest() };
    }
    for (const [k, pos] of r.req) if (g.P[k].pos !== pos) return { k, kind: 'p', text: pointText(k) };
    // ยุคที่ผู้เล่นสับประแจปลายไกลเอง: ตั้งทางเผื่อหยุดเลยให้ถูกก่อนแตะสัญญาณ
    const far = overlapMoves(g, r);
    if (far.length) return { k: far[0][0], kind: 'p', text: T.hintSetOverlap(far[0][0]) };
    return { k: sig, kind: 's', text: sigText };
  };
  const atRed = t => { const sig = g.E[t.edge].sig; return sig && t.stopped && g.S[sig].aspect === 'R' ? sig : null; };

  // 1) ขบวนที่พร้อมออก (หรือขบวนด่วนที่ติดสัญญาณกลางทาง)
  for (const t of ordered) {
    if (t.edge === t.entry || !(t.state === 'ready' || t.state === 'through')) continue;
    const sig = atRed(t), r = sig && wantedRoute(g, t);
    if (r && safe(t, sig, r)) return stepOf(sig, r, T.hintSetTrailing, T.hintRelease());
  }
  // 2) ขบวนที่รอสัญญาณเข้าเขต (คันหน้าสุดของแต่ละขา)
  for (const t of ordered) {
    const sig = t.edge === t.entry ? atRed(t) : null;
    if (!sig || g.trains.some(o => o !== t && o.edge === t.entry && o.s > t.s)) continue;
    const r = wantedRoute(g, t);
    if (!r) continue;
    if (t.exp && !r.exit) { // ขบวนด่วน: เปิดทางออกรอไว้ก่อน จะได้ผ่านโดยไม่ต้องหยุด
      const next = g.E[r.to].sig;
      if (next && g.S[next].aspect === 'R' && !canRoute(g, sig, r)) {
        const exits = t.exit ? [t.exit] : L.exits, out = L.routes[next].find(x => x.exit ? exits.includes(x.to) : exits.some(y => L.reach[x.to].has(y)));
        if (out && safe(t, next, out)) return stepOf(next, out, T.hintSetTrailing, T.hintExpressOut());
      }
    }
    if (!safe(t, sig, r) || (!r.exit && trapsItself(g, t, r.track))) continue;
    return stepOf(sig, r, k => (t.exp ? T.hintSetTrailing(k) : T.hintSetFacing(k, t.plat, way(g))), T.hintAdmit());
  }
  // 3) ทุกอย่างหยุดนิ่งและทางที่ตารางกำหนดใช้ไม่ได้: ชี้ทางสำรองที่ยังพาขบวนไปต่อได้ (เช่น รับเข้าทางอื่นแทน)
  if (isStatic(g)) for (const { t, sig, r } of escapeRoutes(g)) {
    if (claims && !safe(t, sig, r)) continue;
    return stepOf(sig, r, k => T.hintEscapePoint(k), r.exit ? T.hintRelease() : T.hintEscape(r.plat, t.state === 'arriving' && r.plat !== t.plat));
  }
  return null;
}

// target ของ press() ที่ตรงกับคำใบ้ (สำหรับบอท/ARS) หรือ null
export function nextTarget(g, opts = { force: true }) {
  const h = hint(g, opts);
  if (!h) return null;
  return h.kind === 'p' ? { kind: 'point', id: h.k } : h.kind === 's' ? { kind: 'signal', id: h.k } : h.kind === 'plat' ? { kind: 'platform', no: h.k } : { kind: h.kind, id: h.k };
}
