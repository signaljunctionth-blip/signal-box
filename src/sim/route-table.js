// ตารางอินเตอร์ล็อก (route table) ที่สร้างจากผังอัตโนมัติ (GDD ข้อ 7): เส้นทางทุกเส้นจากทุกเสา
// บอกว่าต้องตั้งประแจไหนท่าไหน ทางหยุดเลยกินรางไหน รางไหนต้องว่าง และเส้นทางไหนขัดกัน
// กติกาขัดกันคิดแบบเดียวกับ routeConflict ใน interlocking.js (เทสต์เทียบกับเอนจินจริงทุกคู่ใน test/editor-test.mjs)
// โมดูลล้วน รับผังที่ loadStation สร้าง (schema 2) คืนข้อมูลล้วนให้ตัววาดไปทำเป็นตาราง
import { overlapPath } from './interlocking.js';

// ปลายทางของเส้นทาง
function destOf(L, r) {
  const e = L.E[r.to];
  if (e.plat !== undefined && !r.exit) return { kind: 'platform', no: e.plat, track: e.track };
  if (r.exit) return { kind: 'portal', id: r.portal, label: L.portals[r.portal] ? L.portals[r.portal].label : r.portal };
  if (e.sig) return { kind: 'signal', sig: e.sig, label: L.S[e.sig].label || e.sig, track: e.track };
  return { kind: 'buffer', track: e.track };
}

// ทางหยุดเลยของเส้นทาง r แบบไม่มีสถานะเกม: ประแจที่เส้นทางตั้งใช้ท่านั้น ประแจอื่นถือว่าอยู่ท่าปกติ (N) แบบตอนเริ่มเกม
function staticOverlap(L, r) {
  const dest = L.E[r.to];
  if (!dest.ovl || !dest.ovl.length || r.exit) return null;
  const P = {};
  for (const k in L.P) P[k] = { pos: 'N' };
  const path = overlapPath({ E: L.E, L, P }, dest, Object.fromEntries(r.req));
  return path.tracks.length ? path : null;
}

// คืน { rows, conflicts } หรือ null ถ้าเป็นผัง schema 1
// rows[n] = { id, sig, label, from, dest, points: [[ประแจ, 'N'|'R']], tracks: [รางที่ต้องว่างและถูกล็อก], overlap: { tracks, points } | null, block, conflicts: [id] }
export function routeTable(L) {
  if (!L || !L.bidir) return null;
  const rows = [];
  const sigs = Object.keys(L.S).sort((a, b) => String(L.S[a].label || a).localeCompare(String(L.S[b].label || b), 'en', { numeric: true }));
  for (const sig of sigs) for (const r of L.routes[sig]) {
    const ovl = staticOverlap(L, r);
    const dest = destOf(L, r), portal = r.exit ? L.portals[r.portal] : null;
    rows.push({
      id: `R${rows.length + 1}`, sig, label: L.S[sig].label || sig, from: L.E[L.S[sig].edge].track, dest,
      points: r.req.map(x => [...x]),
      tracks: [...new Set(r.edges.map(e => L.E[e].track))],
      overlap: ovl ? { tracks: [...ovl.tracks], points: ovl.req.map(x => [...x]), zone: ovl.zone } : null,
      block: portal && portal.block ? r.portal : null, // เส้นทางออกตอนทางเดี่ยว: ต้องได้ตอนว่างก่อน
      destSig: L.E[r.to].sig || null,
      conflicts: [],
    });
  }
  const pairs = [];
  for (let a = 0; a < rows.length; a++) for (let b = a + 1; b < rows.length; b++) {
    const why = conflictOf(rows[a], rows[b]);
    if (!why) continue;
    rows[a].conflicts.push(rows[b].id); rows[b].conflicts.push(rows[a].id);
    pairs.push({ a: rows[a].id, b: rows[b].id, why });
  }
  for (const r of rows) delete r.destSig;
  return { rows, conflicts: pairs };
}

// เหตุผลที่เส้นทาง A กับ B ตั้งพร้อมกันไม่ได้ (null = ได้)
// 'signal' เสาเดียวกัน | 'points' ต้องการประแจคนละท่า | 'track' ใช้รางเดียวกัน | 'overlap' ทางหยุดเลยทับเส้นทางหรือกันเองในคอสถานีเดียวกัน | 'block' ออกตอนทางเดี่ยวเดียวกัน
export function conflictOf(A, B) {
  if (A.sig === B.sig) return 'signal';
  // ประแจคนละท่า: ยกเว้นประแจบนทางหยุดเลยของเส้นทางรับเข้า กับเส้นทางออกจากรางจอดนั้นเอง (ระบบย้ายให้ได้)
  const pos = (X, Y) => { const m = {}; for (const [k, p] of X.points) m[k] = p; if (X.overlap && X.destSig !== Y.sig) for (const [k, p] of X.overlap.points) m[k] ||= p; return m; };
  const pa = pos(A, B), pb = pos(B, A);
  for (const k in pa) if (pb[k] && pb[k] !== pa[k]) return 'points';
  const tb = new Set(B.tracks);
  if (A.tracks.some(t => tb.has(t))) return 'track';
  // ทางหยุดเลยของเส้นทางรับเข้า ไม่ขัดกับเส้นทางออกจากรางจอดนั้นเอง (ตั้งทางออกต่อแล้วไม่ต้องจองทางหยุดเลย)
  const ovlHits = (X, Y) => X.overlap && X.destSig !== Y.sig && X.overlap.tracks.some(t => Y.tracks.includes(t));
  if (ovlHits(A, B) || ovlHits(B, A)) return 'overlap';
  if (A.overlap && B.overlap && A.overlap.zone === B.overlap.zone && A.destSig !== B.sig && B.destSig !== A.sig) return 'overlap';
  if (A.block && A.block === B.block) return 'block';
  return null;
}
