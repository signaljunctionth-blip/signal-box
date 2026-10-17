// ผัง schema 2: รางกายภาพ (tracks) วิ่งได้สองทิศ ต่อกันด้วยจุดปลายที่พิกัดตรงกัน
// ไฟล์นี้ตรวจผัง แล้ว "ขยาย" เป็นขอบรางมีทิศแบบเดียวกับ schema 1 (ราง k ได้ขอบ k ทิศ E และ k~ ทิศ W)
// ตัวจำลองจึงเดินรถด้วยโค้ดชุดเดียว ส่วนการครอบครอง/ล็อก/ชน คิดจากรางกายภาพ (track) เดียวกัน
import { prepEdges, posAt } from './geometry.js';

export const TL = 72;          // ความยาวขบวน (หน่วยของผัง)
export const STOP_GAP = 6;     // ขบวนหยุดก่อนถึงปลายราง/สัญญาณเท่านี้
export const FOUL_CLEAR = 24;  // ระยะปลอดภัยจากรางอีกขาของประแจ (SIGNALLING-RULES 1.6)
export const REV = '~';        // ต่อท้ายชื่อราง = ขอบรางทิศ W

const DIRS = ['E', 'W'];
const NAME = /^[A-Za-z0-9_-]+$/;
const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const isNum = v => typeof v === 'number' && Number.isFinite(v);
const key = p => `${p[0]},${p[1]}`;
const edgeOf = (track, dir) => (dir === 'E' ? track : track + REV);

// จุดต่อของราง: ins = รางที่ปลายขวา (จุดสุดท้าย) มาจบที่นี่, outs = รางที่ปลายซ้าย (จุดแรก) เริ่มที่นี่
function nodesOf(T) {
  const N = {};
  const at = p => (N[key(p)] ||= { x: p[0], y: p[1], ins: [], outs: [], pt: null });
  for (const k in T) { at(T[k].pts[0]).outs.push(k); at(T[k].pts[T[k].pts.length - 1]).ins.push(k); }
  return N;
}
const portalTrack = v => (typeof v === 'string' ? v : isObj(v) ? v.track : undefined);

// ระยะจากจุด p ถึงเส้น polyline
function distTo(pts, p) {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], dx = x1 - x0, dy = y1 - y0;
    const f = Math.max(0, Math.min(1, ((p.x - x0) * dx + (p.y - y0) * dy) / (dx * dx + dy * dy)));
    best = Math.min(best, Math.hypot(p.x - (x0 + dx * f), p.y - (y0 + dy * f)));
  }
  return best;
}

// ตรวจส่วน layout ของ schema 2 (ส่วนหัวไฟล์ตรวจที่ station.js) เติมข้อความลง err ผ่าน bad()
export function validateLayout2(L, bad) {
  const T = L.tracks;
  if (!isObj(T) || !Object.keys(T).length) return bad('layout.tracks', 'ต้องมีรางอย่างน้อย 1 เส้น');
  let broken = false;
  for (const k in T) {
    const t = T[k], at = `layout.tracks.${k}`;
    if (!NAME.test(k)) { bad(at, 'ชื่อรางใช้ได้เฉพาะ a–z A–Z 0–9 _ -'); broken = true; }
    if (!isObj(t)) { bad(at, 'ต้องเป็นอ็อบเจกต์'); broken = true; continue; }
    if (!Array.isArray(t.pts) || t.pts.length < 2 || !t.pts.every(p => Array.isArray(p) && p.length === 2 && p.every(isNum))) { bad(`${at}.pts`, 'ต้องเป็นรายการจุด [x, y] อย่างน้อย 2 จุด'); broken = true; continue; }
    for (let i = 1; i < t.pts.length; i++) if (t.pts[i][0] === t.pts[i - 1][0] && t.pts[i][1] === t.pts[i - 1][1]) { bad(`${at}.pts[${i}]`, 'จุดซ้ำกับจุดก่อนหน้า (ท่อนรางยาว 0)'); broken = true; }
    if (!(t.pts[0][0] < t.pts[t.pts.length - 1][0])) { bad(`${at}.pts`, 'ต้องเขียนจุดจากซ้ายไปขวา (x ของจุดแรกน้อยกว่าจุดสุดท้าย)'); broken = true; }
    if (t.berth !== undefined && typeof t.berth !== 'boolean') bad(`${at}.berth`, 'ต้องเป็น true หรือ false');
  }
  if (broken) return;
  const hasT = id => typeof id === 'string' && Object.hasOwn(T, id);
  const N = nodesOf(T);
  const dangling = k => { const a = N[key(T[k].pts[0])], b = N[key(T[k].pts[T[k].pts.length - 1])]; return [a.ins.length === 0 ? 'W' : null, b.outs.length === 0 ? 'E' : null].filter(Boolean); };

  // ประแจ
  const P = L.points === undefined ? {} : L.points;
  if (!isObj(P)) return bad('layout.points', 'ต้องเป็นอ็อบเจกต์');
  for (const k in P) {
    const p = P[k], at = `layout.points.${k}`;
    if (!isObj(p)) { bad(at, 'ต้องเป็นอ็อบเจกต์'); continue; }
    if (!isNum(p.x) || !isNum(p.y)) { bad(at, 'ต้องมีตำแหน่ง x, y เป็นตัวเลข'); continue; }
    if (!hasT(p.N)) bad(`${at}.N`, `ไม่พบราง ${JSON.stringify(p.N)}`);
    if (!hasT(p.R)) bad(`${at}.R`, `ไม่พบราง ${JSON.stringify(p.R)}`);
    if (!hasT(p.N) || !hasT(p.R)) continue;
    if (p.N === p.R) { bad(at, 'ทาง N กับ R ต้องเป็นคนละราง'); continue; }
    const n = N[key([p.x, p.y])];
    if (!n) { bad(at, `ไม่มีปลายรางอยู่ที่ (${p.x}, ${p.y})`); continue; }
    if (n.pt) { bad(at, `ซ้ำกับประแจ ${n.pt} ที่จุดเดียวกัน`); continue; }
    const two = n.ins.length === 2 && n.outs.length === 1 ? n.ins : n.ins.length === 1 && n.outs.length === 2 ? n.outs : null;
    if (!two) { bad(at, `ที่ (${p.x}, ${p.y}) ต้องมีราง 3 เส้น: 1 เส้นด้านหนึ่ง (โคนประแจ) กับ 2 เส้นอีกด้าน (พบซ้าย ${n.ins.length} ขวา ${n.outs.length})`); continue; }
    if (!(two.includes(p.N) && two.includes(p.R))) { bad(at, `N และ R ต้องเป็นรางขาแยกสองเส้นที่จุดนี้ (${two.join(', ')})`); continue; }
    n.pt = k;
  }

  // ขา (portals) และทางตัน (buffers)
  const portals = L.portals, buffers = L.buffers === undefined ? [] : L.buffers, endUse = {};
  if (!isObj(portals) || !Object.keys(portals).length) bad('layout.portals', 'ต้องมีขาเข้าออกอย่างน้อย 1 ขา เช่น { "W": { "track": "bw" } }');
  else for (const k in portals) {
    const v = portals[k], at = `layout.portals.${k}`, tk = portalTrack(v);
    if (!NAME.test(k)) bad(at, 'ชื่อขาใช้ได้เฉพาะ a–z A–Z 0–9 _ -');
    if (!hasT(tk)) { bad(`${at}.track`, `ไม่พบราง ${JSON.stringify(tk)}`); continue; }
    if (dangling(tk).length !== 1) bad(`${at}.track`, `ราง ${tk} ต้องมีปลายลอย 1 ด้าน (ด้านที่ต่อออกนอกผัง)`);
    if (endUse[tk]) bad(`${at}.track`, `ราง ${tk} ถูกใช้เป็น ${endUse[tk]} แล้ว`);
    endUse[tk] = `ขา ${k}`;
    if (isObj(v)) {
      if (v.dir !== undefined && !['in', 'out', 'both'].includes(v.dir)) bad(`${at}.dir`, 'ต้องเป็น "in", "out" หรือ "both"');
      if (v.runTime !== undefined && !(isNum(v.runTime) && v.runTime >= 0)) bad(`${at}.runTime`, 'ต้องเป็นจำนวนวินาทีตั้งแต่ 0');
      if (v.block !== undefined && typeof v.block !== 'boolean') bad(`${at}.block`, 'ต้องเป็น true หรือ false');
    }
  }
  if (!Array.isArray(buffers)) bad('layout.buffers', 'ต้องเป็นรายการชื่อรางที่ปลายเป็นทางตัน');
  else buffers.forEach((tk, i) => {
    const at = `layout.buffers[${i}]`;
    if (!hasT(tk)) return bad(at, `ไม่พบราง ${JSON.stringify(tk)}`);
    if (dangling(tk).length !== 1) bad(at, `ราง ${tk} ต้องมีปลายลอย 1 ด้าน (ด้านที่เป็นทางตัน)`);
    if (endUse[tk]) bad(at, `ราง ${tk} ถูกใช้เป็น ${endUse[tk]} แล้ว`);
    endUse[tk] = 'ทางตัน';
  });

  // จุดต่อ
  for (const id in N) {
    const n = N[id], a = n.ins.length, b = n.outs.length, at = `จุดต่อ (${n.x}, ${n.y})`;
    if (a === 1 && b === 1) continue;
    if (a + b === 1) { const tk = n.ins[0] || n.outs[0]; if (!endUse[tk]) bad(`layout.tracks.${tk}`, `ปลายรางที่ (${n.x}, ${n.y}) ไม่ต่อกับอะไร ต้องประกาศใน portals (ขาเข้าออก) หรือ buffers (ทางตัน) หรือแก้พิกัดให้ตรงกับรางข้างเคียง`); continue; }
    if ((a === 1 && b === 2) || (a === 2 && b === 1)) { if (!n.pt) bad('layout.points', `${at} มีราง 3 เส้นมาบรรจบ (${[...n.ins, ...n.outs].join(', ')}) ต้องประกาศประแจที่จุดนี้`); continue; }
    if (a === 0 || b === 0) bad('layout.tracks', `${at}: ราง ${[...n.ins, ...n.outs].join(', ')} มาชนกันจากด้านเดียวกัน ไม่มีรางต่อไปอีกด้าน`);
    else bad('layout.tracks', `${at}: มีราง ${a + b} เส้นมาบรรจบ เอนจินรองรับเฉพาะรางต่อกัน 2 เส้น หรือประแจ 3 ขา (ยังไม่รองรับทางตัดและประแจคู่)`);
  }

  // สัญญาณ
  const S = L.signals, sigAt = {};
  if (!isObj(S)) bad('layout.signals', 'ต้องเป็นอ็อบเจกต์');
  else for (const k in S) {
    const s = S[k], at = `layout.signals.${k}`;
    if (!isObj(s)) { bad(at, 'ต้องเป็นอ็อบเจกต์'); continue; }
    if (!DIRS.includes(s.dir)) bad(`${at}.dir`, 'ต้องเป็น "E" (คุมรถที่วิ่งไปทางขวา) หรือ "W" (คุมรถที่วิ่งไปทางซ้าย)');
    if (s.label !== undefined && !(typeof s.label === 'string' && s.label)) bad(`${at}.label`, 'ต้องเป็นข้อความ (ชื่อที่ผู้เล่นเห็น)');
    if ((s.lx !== undefined || s.ly !== undefined) && !(isNum(s.lx) && isNum(s.ly))) bad(at, 'lx, ly ต้องเป็นตัวเลขทั้งคู่ (หรือไม่ใส่ทั้งคู่ให้เอนจินวางเสาเอง)');
    if (!hasT(s.track)) { bad(`${at}.track`, `ไม่พบราง ${JSON.stringify(s.track)}`); continue; }
    if (!DIRS.includes(s.dir)) continue;
    const e = edgeOf(s.track, s.dir);
    if (sigAt[e]) bad(at, `ราง ${s.track} มีสัญญาณทิศ ${s.dir} แล้ว (${sigAt[e]}) ถ้าต้องการสัญญาณกลางทางให้แบ่งรางเป็น 2 เส้น`);
    sigAt[e] = k;
    if (dangling(s.track).includes(s.dir)) bad(at, `สัญญาณทิศ ${s.dir} บนราง ${s.track} หันออกนอกผังหรือเข้าหาทางตัน ไม่มีทางให้คุม`);
  }

  // ทางจอด (platforms) และบทบาททาง (roles)
  const platTracks = new Set();
  if (!Array.isArray(L.platforms)) bad('layout.platforms', 'ต้องเป็นรายการ [{ "track": ..., "no": ... }]');
  else {
    const seen = new Set();
    L.platforms.forEach((p, i) => {
      const at = `layout.platforms[${i}]`;
      if (!isObj(p)) return bad(at, 'ต้องเป็นอ็อบเจกต์');
      if (!Number.isInteger(p.no) || p.no < 1) bad(`${at}.no`, 'เลขทางจอดต้องเป็นจำนวนเต็มตั้งแต่ 1');
      else if (seen.has(p.no)) bad(`${at}.no`, `เลขทางจอด ${p.no} ซ้ำ`);
      seen.add(p.no);
      if (!hasT(p.track)) return bad(`${at}.track`, `ไม่พบราง ${JSON.stringify(p.track)}`);
      if (platTracks.has(p.track)) bad(`${at}.track`, `ราง ${p.track} เป็นทางจอดซ้ำ`);
      if (p.noPlatform !== undefined && typeof p.noPlatform !== 'boolean') bad(`${at}.noPlatform`, 'ต้องเป็น true หรือ false');
      platTracks.add(p.track);
      if (isObj(portals) && Object.values(portals).some(v => portalTrack(v) === p.track)) bad(`${at}.track`, `ราง ${p.track} เป็นรางของขาเข้าออก ใช้เป็นทางจอดไม่ได้`);
      const len = prepEdges({ t: T[p.track] }).t.len, need = TL + 2 * STOP_GAP;
      if (len < need) bad(`${at}.track`, `ราง ${p.track} ยาว ${Math.round(len)} สั้นกว่าขบวน ต้องยาวอย่างน้อย ${need} (SIGNALLING-RULES 1.7)`);
      const dang = dangling(p.track);
      for (const d of DIRS) if (!dang.includes(d) && isObj(S) && !sigAt[edgeOf(p.track, d)]) bad(`${at}.track`, `ทางจอด ${p.track} ต้องมีสัญญาณออกทิศ ${d} (เพิ่มใน signals: { "track": "${p.track}", "dir": "${d}" })`);
    });
  }
  if (L.roles !== undefined) {
    if (!isObj(L.roles)) bad('layout.roles', 'ต้องเป็นอ็อบเจกต์ เช่น { "main": "k2", "loop1": "k1" }');
    else {
      const used = {};
      for (const r in L.roles) {
        const tk = L.roles[r], at = `layout.roles.${r}`;
        if (!NAME.test(r) || /^\d+$/.test(r)) bad(at, 'ชื่อบทบาทใช้ a–z A–Z 0–9 _ - และต้องไม่เป็นตัวเลขล้วน');
        if (!hasT(tk)) bad(at, `ไม่พบราง ${JSON.stringify(tk)}`);
        else if (!platTracks.has(tk)) bad(at, `ราง ${tk} ต้องอยู่ใน platforms ด้วย (ทางที่ขบวนจอดต้องมีเลขทาง)`);
        else if (used[tk]) bad(at, `ราง ${tk} มีบทบาท ${used[tk]} อยู่แล้ว`);
        used[tk] = r;
      }
    }
  }
  return N;
}

// ขยายผัง schema 2 ที่ตรวจโครงสร้างผ่านแล้ว เป็นขอบรางมีทิศ + ข้อมูลเสริม
export function expandLayout2(L) {
  const T = L.tracks, N = nodesOf(T), PJ = L.points || {};
  for (const k in PJ) N[key([PJ[k].x, PJ[k].y])].pt = k;
  const portalOf = {}, portals = {}, bufferSet = new Set(L.buffers || []);
  for (const k in L.portals) {
    const v = L.portals[k], tk = portalTrack(v), o = isObj(v) ? v : {};
    portalOf[tk] = k;
    const east = N[key(T[tk].pts[T[tk].pts.length - 1])].outs.length === 0; // ปลายลอยอยู่ด้านขวา
    const dir = o.dir || 'both';
    portals[k] = { id: k, track: tk, side: east ? 'E' : 'W', entry: edgeOf(tk, east ? 'W' : 'E'), exit: edgeOf(tk, east ? 'E' : 'W'),
      in: dir !== 'out', out: dir !== 'in', label: o.label_th || k, neighbor: o.neighbor || null,
      block: o.block !== false, runTime: o.runTime ?? 8 };
  }
  const edges = {};
  // ขอบรางที่มาถึงจุดต่อ n จากด้าน mine (รายการรางด้านเดียวกับตัวเอง) ไปต่อที่ด้าน other
  const nextOf = (tk, dir, n, mine, other) => {
    if (!other.length) return portalOf[tk] ? { exit: true, portal: portalOf[tk] } : { buffer: true };
    if (mine.length === 1 && other.length === 1) return { next: edgeOf(other[0], dir) };
    const p = PJ[n.pt];
    if (mine.length === 1) return { next: { pt: n.pt, N: edgeOf(p.N, dir), R: edgeOf(p.R, dir) } };
    return { next: { trail: n.pt, as: p.N === tk ? 'N' : 'R', to: edgeOf(other[0], dir) } };
  };
  for (const k in T) {
    const pts = T[k].pts, a = N[key(pts[0])], b = N[key(pts[pts.length - 1])];
    edges[k] = { pts: pts.map(p => [...p]), dir: 'E', track: k, rev: k + REV, ...nextOf(k, 'E', b, b.ins, b.outs) };
    edges[k + REV] = { pts: pts.map(p => [...p]).reverse(), dir: 'W', track: k, rev: k, ...nextOf(k, 'W', a, a.outs, a.ins) };
  }
  const points = {};
  for (const k in PJ) {
    const p = PJ[k], n = N[key([p.x, p.y])], facing = n.outs.length === 2, stem = facing ? n.ins[0] : n.outs[0];
    points[k] = { x: p.x, y: p.y, N: p.N, R: p.R, facing, stem, tracks: [stem, p.N, p.R] };
  }
  const signals = {};
  for (const k in L.signals) {
    const s = L.signals[k], edge = edgeOf(s.track, s.dir), end = edges[edge].pts[edges[edge].pts.length - 1];
    // เสาอยู่ซ้ายมือของคนขับ: ทิศ E อยู่เหนือราง ทิศ W อยู่ใต้ราง (ใส่ lx, ly เองได้)
    signals[k] = { type: 'signal', label: k, ...s, edge, lx: s.lx ?? end[0] + (s.dir === 'E' ? -18 : 18), ly: s.ly ?? end[1] + (s.dir === 'E' ? -44 : 44) };
  }
  const platforms = L.platforms.map(p => ({ edge: p.track, no: p.no, noPlatform: p.noPlatform === true }));
  const entries = [], exits = [];
  for (const k in portals) { if (portals[k].in) entries.push(portals[k].entry); if (portals[k].out) exits.push(portals[k].exit); }

  // ตอนราง: รางจอด (ทางจอด ขา ทางตัน หรือ berth: true) เป็นตอนของตัวเอง ที่เหลือที่ต่อถึงกันรวมเป็น "คอสถานี" 1 ตอน
  const berth = new Set([...platforms.map(p => p.edge), ...Object.keys(portalOf), ...bufferSet]);
  for (const k in T) if (T[k].berth) berth.add(k);
  const sectionOf = {}, sections = {};
  let zn = 0;
  for (const k in T) {
    if (sectionOf[k]) continue;
    if (berth.has(k)) { sectionOf[k] = k; sections[k] = { id: k, kind: portalOf[k] ? 'portal' : 'berth', tracks: [k] }; continue; }
    const id = `Z${++zn}`, list = [], stack = [k];
    while (stack.length) {
      const c = stack.pop();
      if (sectionOf[c] || berth.has(c)) continue;
      sectionOf[c] = id; list.push(c);
      for (const n of [N[key(T[c].pts[0])], N[key(T[c].pts[T[c].pts.length - 1])]]) stack.push(...n.ins, ...n.outs);
    }
    sections[id] = { id, kind: 'throat', tracks: list.sort() };
  }
  // overlap ของสัญญาณ: คอสถานีทั้งตอนที่อยู่ถัดจากสัญญาณ (SIGNALLING-RULES 1.8)
  for (const k in signals) {
    const e = edges[signals[k].edge], n = e.next;
    const first = !n ? null : typeof n === 'string' ? n : n.pt ? n.N : n.to;
    const sec = first && sections[sectionOf[edges[first].track]];
    e.ovl = sec && sec.kind === 'throat' ? [...sec.tracks] : [];
  }
  for (const k in points) {
    const zone = new Set();
    for (const tk of points[k].tracks) { const sec = sections[sectionOf[tk]]; if (sec.kind === 'throat') sec.tracks.forEach(x => zone.add(x)); }
    points[k].zone = zone.size ? [...zone] : [...points[k].tracks]; // ตอนคอสถานีของประแจ (ข้อมูลสำหรับตัววาด เอนจินใช้ p.tracks)
  }
  const roles = { ...(L.roles || {}) };
  return { size: L.size, edges, points, signals, platforms, entries, exits, portals, buffers: [...bufferSet], sections, sectionOf, roles };
}

// ตรวจชั้นกราฟและความปลอดภัยของผังที่ขยายแล้ว
export function checkLayout2(X, bad) {
  const E = prepEdges(X.edges), sigOn = {};
  for (const k in X.signals) sigOn[X.signals[k].edge] = k;
  // ทุกขาที่รถเข้าได้ต้องมีสัญญาณเข้าเขตที่ปลายรางของขานั้น
  for (const k in X.portals) if (X.portals[k].in && !sigOn[X.portals[k].entry])
    bad(`layout.portals.${k}`, `ขา ${k} รับรถเข้าได้ ต้องมีสัญญาณเข้าเขตบนราง ${X.portals[k].track} ทิศ ${E[X.portals[k].entry].dir} (หรือใส่ "dir": "out")`);
  // สัญญาณต้องไม่ล้ำจุดปลอดภัยของประแจ: จุดหยุดของขบวนต้องห่างรางอีกขาอย่างน้อย FOUL_CLEAR
  for (const k in X.signals) {
    const e = E[X.signals[k].edge], n = e.next;
    if (!n || typeof n === 'string' || !n.trail) continue;
    const p = X.points[n.trail], other = p.N === e.track ? p.R : p.N, d = distTo(X.edges[other].pts, posAt(e, e.len - STOP_GAP));
    if (d < FOUL_CLEAR) bad(`layout.signals.${k}`, `เสาอยู่ล้ำหลักเขตปลอดภัยของประแจ ${n.trail}: ขบวนที่จอดจะห่างราง ${other} แค่ ${Math.round(d)} (ต้องอย่างน้อย ${FOUL_CLEAR}) ให้คั่นด้วยรางสั้นอีกเส้นระหว่างสัญญาณกับประแจ`);
  }
  // ไปถึงได้: เดินจากขาเข้าทุกขา กลับทิศได้เฉพาะที่ทางจอดและทางตัน
  const turn = new Set([...X.platforms.map(p => p.edge), ...X.buffers]);
  const succ = k => { const n = E[k].next; return !n ? [] : typeof n === 'string' ? [n] : n.pt ? [n.N, n.R] : [n.to]; };
  const seen = new Set(), stack = [...X.entries];
  while (stack.length) {
    const k = stack.pop();
    if (seen.has(k)) continue;
    seen.add(k); stack.push(...succ(k));
    if (turn.has(E[k].track)) stack.push(E[k].rev);
  }
  for (const k in X.edges) if (X.edges[k].dir === 'E' && !seen.has(k) && !seen.has(X.edges[k].rev)) bad(`layout.tracks.${k}`, 'ไปไม่ถึงจากขาเข้าใดเลย');
  const exitSet = new Set(X.exits);
  if (!exitSet.size) bad('layout.portals', 'ต้องมีขาที่รถออกได้อย่างน้อย 1 ขา');
  else if (![...seen].some(k => exitSet.has(k))) bad('layout.portals', 'จากขาเข้าไปไม่ถึงขาออกเลย');
}
