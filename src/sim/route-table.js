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

// ทางหยุดเลยของเส้นทาง r แบบไม่มีสถานะเกม เดินแบบเดียวกับ overlapPath ใน interlocking.js
// ประแจด้านหลัง (เข้าทางขา) ท่าตายตัว -> points, ประแจด้านหน้าที่เส้นทางไม่ได้ตั้ง เอนจินใช้ท่าที่ประแจอยู่ตอนนั้น
// ตารางจึงคิดทั้งสองท่า: tracks = รางที่อาจถูกจองทั้งหมด, facing = ประแจที่ "ล็อกตามท่าที่อยู่"
function staticOverlap(L, r) {
  const dest = L.E[r.to];
  if (!dest.ovl || !dest.ovl.length || r.exit) return null;
  const set = Object.fromEntries(r.req), tracks = [], points = [], facing = [];
  let zone = null;
  const add = (list, x) => { if (!list.some(y => JSON.stringify(y) === JSON.stringify(x))) list.push(x); };
  const go = (nx, n) => {
    if (!nx || n > L.edgeCount) return;
    if (typeof nx === 'string') return at(nx, n);
    if (nx.pt) {
      if (set[nx.pt]) { add(points, [nx.pt, set[nx.pt]]); return at(nx[set[nx.pt]], n); }
      add(facing, nx.pt); at(nx.N, n); at(nx.R, n); return;
    }
    add(points, [nx.trail, nx.as]); at(nx.to, n);
  };
  const at = (cur, n) => {
    const sec = L.sections[L.sectionOf[L.E[cur].track]];
    if (!sec || sec.kind !== 'throat') return;
    zone = sec.id; add(tracks, L.E[cur].track);
    go(L.E[cur].next, n + 1);
  };
  go(dest.next, 0);
  return tracks.length ? { tracks, points, facing, zone } : null;
}

// คืน { rows, conflicts } หรือ null ถ้าเป็นผัง schema 1
// rows[n] = { id, sig, label, from, dest, points: [[ประแจ, 'N'|'R']], tracks: [รางที่ต้องว่างและถูกล็อก],
//   overlap: { tracks, points: [[ประแจ, ท่า]], facing: [ประแจที่ล็อกตามท่าที่อยู่], zone } | null, block, conflicts: [id], sameSignal: [id]
// conflicts[n] = { a, b, why } why: 'points' ประแจในเส้นทางคนละท่า | 'overlapPoints' ประแจบนทางเผื่อหยุดเลย | 'track' รางเดียวกัน
//   | 'overlap' ทางเผื่อหยุดเลยทับเส้นทาง หรือทับกันเองในคอสถานีเดียวกัน (ในเกมนี้เข้มกว่าของจริง) | 'block' ออกตอนทางเดี่ยวเดียวกัน
// เส้นทางจากเสาเดียวกันไม่นับว่าขัด (เสาต้นหนึ่งตั้งได้ทีละเส้นทางอยู่แล้ว) อยู่ใน sameSignal
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
      overlap: ovl,
      block: portal && portal.block ? r.portal : null, // เส้นทางออกตอนทางเดี่ยว: ต้องได้ตอนว่างก่อน
      destSig: L.E[r.to].sig || null,
      conflicts: [], sameSignal: [],
    });
  }
  const pairs = [];
  for (let a = 0; a < rows.length; a++) for (let b = a + 1; b < rows.length; b++) {
    const why = conflictOf(rows[a], rows[b]);
    if (why === 'signal') { rows[a].sameSignal.push(rows[b].id); rows[b].sameSignal.push(rows[a].id); continue; }
    if (!why) continue;
    rows[a].conflicts.push(rows[b].id); rows[b].conflicts.push(rows[a].id);
    pairs.push({ a: rows[a].id, b: rows[b].id, why });
  }
  for (const r of rows) delete r.destSig;
  return { rows, conflicts: pairs };
}

// เหตุผลที่เส้นทาง A กับ B ตั้งพร้อมกันไม่ได้ (null = ได้)
// 'signal' เสาเดียวกัน หรือรหัสใน routeTable ด้านบน
export function conflictOf(A, B) {
  if (A.sig === B.sig) return 'signal';
  // ประแจคนละท่า: ประแจบนทางเผื่อหยุดเลยของเส้นทางรับเข้า ไม่ขัดกับเส้นทางออกจากรางจอดนั้นเอง (ระบบย้ายให้ได้)
  const route = X => Object.fromEntries(X.points), ovl = (X, Y) => (X.overlap && X.destSig !== Y.sig ? Object.fromEntries(X.overlap.points) : {});
  const ra = route(A), rb = route(B), oa = ovl(A, B), ob = ovl(B, A);
  for (const k in ra) if (rb[k] && rb[k] !== ra[k]) return 'points';
  for (const [m, n] of [[{ ...ra, ...oa }, { ...rb, ...ob }]]) for (const k in m) if (n[k] && n[k] !== m[k]) return 'overlapPoints';
  const tb = new Set(B.tracks);
  if (A.tracks.some(t => tb.has(t))) return 'track';
  // ทางหยุดเลยของเส้นทางรับเข้า ไม่ขัดกับเส้นทางออกจากรางจอดนั้นเอง (ตั้งทางออกต่อแล้วไม่ต้องจองทางหยุดเลย)
  const ovlHits = (X, Y) => X.overlap && X.destSig !== Y.sig && X.overlap.tracks.some(t => Y.tracks.includes(t));
  if (ovlHits(A, B) || ovlHits(B, A)) return 'overlap';
  if (A.overlap && B.overlap && A.overlap.zone === B.overlap.zone && A.destSig !== B.sig && B.destSig !== A.sig) return 'overlap';
  if (A.block && A.block === B.block) return 'block';
  return null;
}
