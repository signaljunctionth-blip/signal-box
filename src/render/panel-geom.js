// เรขาคณิตของแผงผังเส้น 2 มิติ: ของแต่ละชิ้นอยู่ตรงไหนบนแผง และจุดที่แตะโดนอะไร — ฟังก์ชันล้วน ไม่แตะ DOM ทดสอบใน Node ได้
// ใช้ได้ทั้งผัง schema 1 (ขอบรางทิศเดียว) และ schema 2 (รางสองทิศ หลายขา ทางตัน) อ่านจากผังที่ sim สร้างแล้ว (g.L) เท่านั้น
// หน่วยทั้งหมดเป็นหน่วยของแผง (เหมือนพิกัดในไฟล์ผัง) ตัววาด (panel2d.js) และตัวหาเป้าแตะใช้ตำแหน่งชุดเดียวกันจากไฟล์นี้
export const TAP_R = 44;       // รัศมีเป้าแตะของเสาและประแจ
export const MIN_GAP = 60;     // ระยะขั้นต่ำระหว่างศูนย์กลางเป้าแตะที่ใช้พร้อมกัน (ที่แผงกว้าง 844 px ≈ 44 px บนจอ)
const KNOB = 34, MARGIN = 72, SIG_OFF = 30;
const cache = new WeakMap();
// ความกว้างข้อความโดยประมาณ (หน่วยแผง ตัวอักษร 13) ไม่นับสระบนล่างและวรรณยุกต์ของไทยที่ไม่กินที่
const textWidth = s => [...String(s)].filter(c => !/[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/.test(c)).length * 8.6;

const lenOf = pts => { let n = 0; for (let i = 1; i < pts.length; i++) n += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return n; };
// จุดบนเส้น pts ที่ระยะ s จากจุดแรก
export function along(pts, s) {
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (s <= d || i === pts.length - 1) { const f = d ? Math.max(0, Math.min(1, s / d)) : 0; return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f]; }
    s -= d;
  }
  return pts[0];
}
// ตัดเส้นให้เหลือช่วง x ระหว่าง x0..x1 (รางที่เลยขอบแผงออกไป) คืน null ถ้าอยู่นอกทั้งเส้น
function clipX(pts, x0, x1) {
  const out = [];
  for (let i = 1; i < pts.length; i++) {
    let [ax, ay] = pts[i - 1], [bx, by] = pts[i];
    if (Math.max(ax, bx) < x0 || Math.min(ax, bx) > x1) continue;
    const cut = (x) => { const f = (x - ax) / (bx - ax); return [x, ay + (by - ay) * f]; };
    let a = [ax, ay], b = [bx, by];
    if (ax < x0) a = cut(x0); else if (ax > x1) a = cut(x1);
    if (bx < x0) b = cut(x0); else if (bx > x1) b = cut(x1);
    if (!out.length) out.push(a);
    out.push(b);
  }
  return out.length ? out : null;
}

// L = ผังจาก sim (lv.L หรือ g.L)
export function panelGeom(L) {
  if (cache.has(L)) return cache.get(L);
  const [W, H] = L.size, E = L.E;
  // รางกายภาพ: ขอบที่เป็นตัวแทนของราง (schema 2 = ขอบทิศ E, schema 1 = ทุกขอบ)
  const tracks = {};
  for (const k in E) if (E[k].track === k) tracks[k] = { id: k, pts: E[k].pts, len: E[k].len ?? lenOf(E[k].pts), vis: clipX(E[k].pts, 0, W) };

  // เสา: ตำแหน่งหัวเสาจาก sim (lx, ly) ปลายรางที่เสาคุม และด้านที่เสาอยู่เทียบกับราง (เหนือ = -1, ใต้ = 1)
  const signals = {};
  for (const k in L.S) {
    const s = L.S[k], e = E[s.edge], end = e.pts[e.pts.length - 1];
    const side = s.ly <= end[1] ? -1 : 1;
    const dir = s.dir || e.dir || 'E', label = s.label || k, lw = textWidth(label) * 1.05 + 4;
    // ผังสองทิศที่ไม่ได้กำหนดตำแหน่งเสาเอง (lx, ly เป็นค่าที่เอนจินวางให้): วางหัวเสาชิดรางของตัวเอง และป้ายชื่ออยู่ข้างหัวเสา
    // ชื่อจึงไม่ไปทับแนวรางหรือแถบชานชาลาของทางถัดไป และดูออกว่าเสาเป็นของทางไหน ผังอื่นใช้ตำแหน่งจากไฟล์ ป้ายอยู่เหนือ/ใต้หัวเสา
    const auto = !!L.bidir && s.lx === end[0] + (dir === 'E' ? -18 : 18) && s.ly === end[1] + (dir === 'E' ? -44 : 44);
    const x = s.lx, y = auto ? end[1] + side * SIG_OFF : s.ly;
    const text = auto ? { x: x + (dir === 'E' ? -19 : 19), y, align: dir === 'E' ? 'right' : 'left' } : { x, y: y + (side < 0 ? -34 : 33), align: 'center' };
    const tx0 = text.align === 'right' ? text.x - lw : text.align === 'left' ? text.x : text.x - lw / 2;
    signals[k] = { id: k, x, y, endX: end[0], endY: end[1], side, dir, type: s.type || 'signal', label, track: e.track, text,
      // กรอบที่ป้ายอื่นต้องหลบ: หัวเสา และป้ายชื่อ
      boxes: [{ x: x - 16, y: y - 24, w: 32, h: 46 }, { x: tx0 - 2, y: text.y - 10, w: lw + 4, h: 20 }] };
  }
  const sigList = Object.values(signals);

  // ประแจ: ปุ่มอยู่ฝั่งตรงข้ามกับทางแยก ถ้าชนเป้าแตะอื่นให้ลองอีกฝั่ง แล้วค่อยเลื่อนออกด้านข้าง
  const points = {}, placed = sigList.map(s => [s.x, s.y]);
  const gap = (x, y) => Math.min(Infinity, ...placed.map(p => Math.hypot(p[0] - x, p[1] - y)));
  for (const k in L.P) {
    const p = L.P[k], r = E[p.R], rp = r.pts;
    const nearStart = Math.hypot(rp[0][0] - p.x, rp[0][1] - p.y) <= Math.hypot(rp[rp.length - 1][0] - p.x, rp[rp.length - 1][1] - p.y);
    const q = along(nearStart ? rp : [...rp].reverse(), 40), up = q[1] < p.y - 0.5, down = q[1] > p.y + 0.5;
    const first = up ? 1 : down ? -1 : 1; // ทางแยกขึ้นบน -> ปุ่มอยู่ล่าง
    const cands = [[0, first], [0, -first], [-30, first], [30, first], [-30, -first], [30, -first], [-48, first], [48, first], [-48, -first], [48, -first], [0, first * 1.9], [0, -first * 1.9]].map(([dx, s]) => [p.x + dx, p.y + s * KNOB]);
    let best = cands[0], bg = gap(...cands[0]);
    for (const c of cands) { if (bg >= MIN_GAP) break; const g = gap(...c); if (g > bg) { best = c; bg = g; } }
    points[k] = { id: k, x: p.x, y: p.y, kx: best[0], ky: best[1], N: p.N, R: p.R, facing: p.facing !== false, stem: p.stem || null };
    placed.push(best);
  }

  // ทางจอด: แถบสีใต้ราง หลบเสาทิศ W ที่อยู่ใต้ปลายซ้าย
  const plats = {};
  for (const n of L.plats) {
    const k = L.platEdge[n], t = tracks[E[k].track] || tracks[k], a = t.pts[0], b = t.pts[t.pts.length - 1];
    const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), y = a[1];
    const below = sigList.filter(s => s.track === t.id && s.side === 1);
    const sx = below.length ? Math.max(...below.map(s => Math.max(s.x + 20, ...s.boxes.map(b => b.x + b.w + 6)))) : x0 + 12;
    plats[n] = { no: n, track: t.id, role: L.roleOf ? L.roleOf[t.id] || null : null, x0, x1, y, sx, sw: Math.max(40, x1 - 12 - sx), cx: (x0 + x1) / 2 };
  }

  // ขา: ป้ายอยู่ชิดขอบแผงบนแนวราง ด้านตรงข้ามกับเสาเข้าของขานั้น
  const portals = {};
  for (const k in L.portals || {}) {
    const p = L.portals[k], t = tracks[p.track], east = p.side === 'E';
    const edgeX = east ? W : 0, pt = t.vis ? (east ? t.vis[t.vis.length - 1] : t.vis[0]) : [edgeX, t.pts[0][1]];
    // ลองวางป้าย 3 ที่ (ฝั่งตรงข้ามเสาเข้า อีกฝั่ง บนแนวราง) เลือกที่ทับเสาและป้ายขาอื่นน้อยที่สุด
    const home = sigList.find(s => s.track === p.track && s.type !== 'starter') || sigList.find(s => s.track === p.track);
    const label = p.label || k, lw = textWidth(label) + 34, first = home ? -home.side : 1, x0 = east ? W - 8 - lw : 8;
    const overlap = y => {
      let n = 0; const box = (bx, by, bw, bh) => Math.max(0, Math.min(x0 + lw, bx + bw) - Math.max(x0, bx)) * Math.max(0, Math.min(y + 14, by + bh) - Math.max(y - 14, by));
      for (const s of sigList) for (const b of s.boxes) n += box(b.x, b.y, b.w, b.h);
      for (const q of Object.values(points)) n += box(q.kx - 18, q.ky - 18, 36, 36);
      for (const o of Object.values(portals)) if (o.side === p.side) n += box(o.east ? W - 8 - o.lw : 8, o.y - 16, o.lw, 32) * 4;
      return n;
    };
    let y = pt[1] + first * 30, score = overlap(y);
    for (const c of [pt[1] - first * 30, pt[1] + first * 58, pt[1] - first * 58, pt[1]]) { const sc = overlap(c); if (sc < score - 1) { y = c; score = sc; } }
    portals[k] = { id: k, label, lw, side: p.side, east, x: east ? W - 10 : 10, y, ty: pt[1], align: east ? 'right' : 'left', in: p.in, out: p.out };
  }

  // กันชนปลายทางตัน
  const buffers = [];
  for (const k in E) if (E[k].buffer) { const pts = E[k].pts, a = pts[pts.length - 2], b = pts[pts.length - 1], d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; buffers.push({ x: b[0], y: b[1], nx: -(b[1] - a[1]) / d, ny: (b[0] - a[0]) / d }); }

  // กรอบที่ต้องเห็น: เต็มความกว้างแผง สูงเท่าที่มีของ
  let y0 = Infinity, y1 = -Infinity;
  for (const k in tracks) if (tracks[k].vis) for (const p of tracks[k].vis) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
  if (!Number.isFinite(y0)) { y0 = 0; y1 = H; }
  const view = { x0: 0, x1: W, y0: y0 - MARGIN, y1: y1 + MARGIN };

  const G = { W, H, tracks, signals, points, plats, portals, buffers, view };
  G.tokens = placeTokens(G, sigList);
  cache.set(L, G);
  return G;
}

// ด่านที่มีห่วงทางสะดวก: ป้ายขาเป็นเครื่องทางสะดวก (แตะ = ขอ/คืนห่วง) และปุ่ม "ให้ทาง" ขึ้นข้างป้ายเมื่อสถานีข้างเคียงขอทาง
// กรอบที่วาด (หน่วยแผง) ส่วนเป้าแตะขยายบนล่างให้สูงอย่างน้อย TOKEN_HIT × 2 หน่วย (≈ 44 px ที่แผงกว้าง 844 px)
export const TOKEN_H = 30, ACCEPT_W = 84, TOKEN_HIT = 31;
export const tokenBoxes = (G, k) => G.tokens[k] || null;
// วางกรอบเครื่องทางสะดวกและปุ่มให้ทางของทุกขา (คิดครั้งเดียวต่อผัง): ลองหลายตำแหน่ง เลือกที่ทับเสา ปุ่มประแจ และกรอบอื่นน้อยที่สุด
function placeTokens(G, sigList) {
  const solid = [...sigList.flatMap(s => s.boxes), ...Object.values(G.points).map(q => ({ x: q.kx - 20, y: q.ky - 20, w: 40, h: 40 }))], out = {};
  const hit = r => solid.reduce((n, b) => n + Math.max(0, Math.min(r.x + r.w, b.x + b.w) - Math.max(r.x, b.x)) * Math.max(0, Math.min(r.y + r.h, b.y + b.h) - Math.max(r.y, b.y)), 0);
  const V = G.view, outside = r => (r.y < V.y0 + 4 || r.y + r.h > V.y1 - 4 || r.x < V.x0 || r.x + r.w > V.x1 ? 1e6 : 0);
  const best = cands => cands.reduce((a, c) => { const sc = hit(c) + outside(c) + (c.cost || 0); return sc < a.sc ? { c, sc } : a; }, { c: cands[0], sc: Infinity }).c;
  for (const k in G.portals) {
    const p = G.portals[k], w = p.lw + 6, x0 = p.east ? p.x - w : p.x;
    const token = best([0, -8, 8, -16, 16].map(d => ({ x: x0, y: p.y + d - TOKEN_H / 2, w, h: TOKEN_H, cost: Math.abs(d) })));
    solid.push(token);
    const inner = p.east ? token.x - 8 - ACCEPT_W : token.x + w + 8, edge = p.east ? token.x + w - ACCEPT_W : token.x;
    const accept = best([[inner, 0], [edge, -38], [edge, 38], [inner, -38], [inner, 38]].map(([x, dy], i) => ({ x, y: token.y + dy, w: ACCEPT_W, h: TOKEN_H, cost: i })));
    solid.push(accept);
    out[k] = { token: { x: token.x, y: token.y, w, h: TOKEN_H }, accept: { x: accept.x, y: accept.y, w: ACCEPT_W, h: TOKEN_H } };
  }
  return out;
}
const boxDist = (b, x, y) => Math.hypot(Math.max(0, b.x - x, x - b.x - b.w), Math.max(0, Math.abs(y - (b.y + b.h / 2)) - Math.max(b.h / 2, TOKEN_HIT)));

// ศูนย์กลางของเป้าแตะ (หน่วยแผง) ของ target แบบเดียวกับที่ส่งเข้า sim.press()
export function targetCenter(L, target) {
  const G = panelGeom(L);
  if (!target) return null;
  if (target.kind === 'signal') { const s = G.signals[target.id]; return s ? { x: s.x, y: s.y } : null; }
  if (target.kind === 'point') { const p = G.points[target.id]; return p ? { x: p.kx, y: p.ky } : null; }
  if (target.kind === 'platform') { const p = G.plats[target.no]; return p ? { x: p.cx, y: p.y + 26 } : null; }
  if (target.kind === 'portal') { const p = G.portals[target.id]; return p ? { x: p.east ? G.W - 60 : 60, y: p.y } : null; }
  if (target.kind === 'token' || target.kind === 'accept') { const b = tokenBoxes(G, target.id); if (!b) return null; const r = b[target.kind]; return { x: r.x + r.w / 2, y: r.y + r.h / 2 }; }
  if (target.kind === 'track') { const t = G.tracks[target.id]; if (!t) return null; const [x, y] = along(t.pts, t.len / 2); return { x, y }; }
  return null;
}

// ปลายทางที่เลือกได้ตอนนี้ (ยุคแผงต้นทาง-ปลายทาง หลังแตะเสาต้นทางแล้ว)
export function destinations(g) {
  if (!g.era.nx || !g.nxSel) return [];
  const seen = new Set(), out = [];
  for (const r of g.L.routes[g.nxSel]) {
    const t = r.plat !== null && r.plat !== undefined && !r.exit ? { kind: 'platform', no: r.plat } : r.exit && r.portal ? { kind: 'portal', id: r.portal } : !r.exit && r.track ? { kind: 'track', id: r.track } : null;
    if (!t) continue;
    const key = t.kind + ':' + (t.id ?? t.no);
    if (!seen.has(key)) { seen.add(key); out.push(t); }
  }
  return out;
}

// จุด (x, y) บนแผงแตะโดนอะไร คืน target สำหรับ sim.press() หรือ null
// ปกติ: เสาและประแจ (อันที่ใกล้ที่สุดในรัศมี TAP_R) แล้วจึงแถบทางจอด
// ตอนกำลังเลือกปลายทาง: ป้ายขา ทางจอด และรางปลายทางของเสาที่เลือกไว้ มาก่อน
export function hitTest(g, x, y) {
  const G = panelGeom(g.L), d = (a, b) => Math.hypot(x - a, y - b);
  const inPlat = p => x > p.x0 - 10 && x < p.x1 + 10 && y > p.y - 34 && y < p.y + 48;
  const dest = destinations(g);
  if (dest.length) {
    let best = null, bd = 64;
    for (const t of dest) {
      if (t.kind === 'platform') { if (inPlat(G.plats[t.no]) && !Object.values(G.signals).some(s => d(s.x, s.y) < 24)) return t; continue; }
      const c = targetCenter(g.L, t), dd = t.kind === 'portal' ? Math.hypot(Math.max(0, Math.abs(x - c.x) - 50), y - c.y) : d(c.x, c.y);
      if (dd < bd) { bd = dd; best = t; }
    }
    if (best) return best;
  }
  // ด่านที่มีห่วง: ปุ่ม "ให้ทาง" (เมื่อมีคำขอ) และป้ายขา (เครื่องทางสะดวก)
  // แตะในกรอบที่วาด = โดนปุ่มเสมอ, นอกกรอบแต่ในแถบขยายบนล่าง = โดนปุ่มเมื่อไม่มีเสาหรือประแจในรัศมี
  let near = null;
  if (g.lv && g.lv.token) for (const k in G.portals) {
    if (!g.block || !g.block[k]) continue;
    const b = tokenBoxes(G, k), kinds = g.block[k].ask !== null ? ['accept', 'token'] : ['token'];
    for (const kind of kinds) {
      const r = b[kind];
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return { kind, id: k };
      if (!near && boxDist(r, x, y) < TAP_R - 14) near = { kind, id: k };
    }
  }
  let best = null, bd = TAP_R;
  for (const k in G.signals) { const s = G.signals[k], dd = d(s.x, s.y); if (dd < bd) { bd = dd; best = { kind: 'signal', id: k }; } }
  for (const k in G.points) { const p = G.points[k], dd = Math.min(d(p.kx, p.ky), d(p.x, p.y) + 6); if (dd < bd) { bd = dd; best = { kind: 'point', id: k }; } }
  if (best) return best;
  if (near) return near;
  for (const n in G.plats) if (inPlat(G.plats[n])) return { kind: 'platform', no: G.plats[n].no };
  return null;
}

// ระยะที่สั้นที่สุดระหว่างเป้าแตะวงกลม (เสา ปุ่มประแจ) ของผัง ใช้ตรวจว่าผังแตะแยกกันได้บนจอมือถือ
export function minTargetGap(L) {
  const G = panelGeom(L), c = [...Object.values(G.signals).map(s => ['เสา ' + s.label, s.x, s.y]), ...Object.values(G.points).map(p => ['ประแจ ' + p.id, p.kx, p.ky])];
  let min = Infinity, pair = null;
  for (let i = 0; i < c.length; i++) for (let j = i + 1; j < c.length; j++) { const dd = Math.hypot(c[i][1] - c[j][1], c[i][2] - c[j][2]); if (dd < min) { min = dd; pair = [c[i][0], c[j][0]]; } }
  return { min, pair };
}
