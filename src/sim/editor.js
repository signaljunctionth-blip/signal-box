// ตัวแก้ผังบนกริด (GDD ข้อ 7): แผนผังของผู้เล่น (plan) -> ไฟล์ผัง schema 2 -> ผ่านตัวตรวจผังเดียวกับสถานีจริง
// โมดูลล้วน ไม่แตะ DOM ฝั่งหน้าจอเรียกฟังก์ชันแก้ผัง (คืน plan ใหม่ ไม่แก้ของเดิม) แล้ว buildPlan เพื่อตรวจและได้ผังที่เล่นได้
//
// plan = {
//   v: 1, cols, rows, upDir: 'E'|'W', name: ข้อความ (ไม่บังคับ),
//   segs:    [[i, j, d]]        ราง 1 ช่อง จากจุดกริด (i, j) ไป (i+1, j+d), d = -1 (เฉียงขึ้น 45°) | 0 (ตรง) | 1 (เฉียงลง)
//   signals: [[i, j, dir]]      เสาที่จุด (i, j) คุมขบวนที่วิ่งไปทิศ dir ('E' = ขวา, 'W' = ซ้าย)
//   plats:   [[i, j, d, no]]    ช่องรางที่เป็นทางจอดเลข no (ช่องติดกันที่เลขเดียวกันรวมเป็นทางจอด 1 ทาง)
// }
// จุดกริด (i, j) อยู่ที่ x = i*GRID, y = (j + 0.5)*GRID ปลายรางที่ขอบซ้าย (i = 0) หรือขอบขวา (i = cols) เป็นขาเข้าออก ปลายลอยที่อื่นเป็นทางตัน
import { loadStation } from './station.js';

export const PLAN_VERSION = 1;
export const GRID = 40;
export const MAX_COLS = 35, MAX_ROWS = 20; // รหัสแชร์ใช้เลขฐาน 36 หลักเดียว (จุดกริดขวาสุด i = cols)
const OUT = 100; // รางของขาเข้าออกยื่นเลยขอบแผงเท่านี้ (ส่วนที่รถวิ่งเข้า/ออกจอ)

const isInt = v => Number.isInteger(v);
const segKey = (i, j, d) => `${i},${j},${d}`;
const nodeKey = (i, j) => `${i},${j}`;
const xy = (i, j) => [i * GRID, (j + 0.5) * GRID];

export function emptyPlan(cols = 24, rows = 12, upDir = 'E') {
  return { v: PLAN_VERSION, cols, rows, upDir, name: '', segs: [], signals: [], plats: [] };
}

// ตรวจรูปร่างของ plan (ข้อมูลจากรหัสแชร์หรือเซฟอาจเสียหรือถูกแก้) ไม่ throw คืน { plan, errors }
// plan ที่คืนเป็นสำเนาที่ตัดส่วนเสียทิ้งแล้ว errors บอกว่าตัดอะไรไป
export function normalizePlan(raw) {
  const errors = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { plan: null, errors: ['ผัง: ข้อมูลไม่ใช่แผนผัง'] };
  if (raw.v !== PLAN_VERSION) return { plan: null, errors: [`ผัง: รุ่น ${JSON.stringify(raw.v)} ไม่รองรับ (รองรับรุ่น ${PLAN_VERSION})`] };
  const cols = raw.cols, rows = raw.rows;
  if (!(isInt(cols) && cols >= 2 && cols <= MAX_COLS && isInt(rows) && rows >= 1 && rows <= MAX_ROWS)) return { plan: null, errors: [`ผัง: ขนาดกริดต้องกว้าง 2–${MAX_COLS} สูง 1–${MAX_ROWS} ช่อง`] };
  const plan = emptyPlan(cols, rows, raw.upDir === 'W' ? 'W' : 'E');
  if (typeof raw.name === 'string') plan.name = raw.name.slice(0, 40);
  const list = (v, name) => { if (v === undefined) return []; if (Array.isArray(v)) return v; errors.push(`ผัง: ${name} ต้องเป็นรายการ`); return []; };
  const inGrid = (i, j) => isInt(i) && isInt(j) && i >= 0 && i <= cols && j >= 0 && j < rows;
  const seen = new Set();
  for (const s of list(raw.segs, 'segs')) {
    const [i, j, d] = Array.isArray(s) ? s : [];
    if (!(inGrid(i, j) && i < cols && [-1, 0, 1].includes(d) && inGrid(i + 1, j + d))) { errors.push(`ผัง: ตัดรางที่อยู่นอกกริด ${JSON.stringify(s)}`); continue; }
    const k = segKey(i, j, d);
    if (!seen.has(k)) { seen.add(k); plan.segs.push([i, j, d]); }
  }
  const sigSeen = new Set();
  for (const s of list(raw.signals, 'signals')) {
    const [i, j, dir] = Array.isArray(s) ? s : [];
    if (!(inGrid(i, j) && (dir === 'E' || dir === 'W'))) { errors.push(`ผัง: ตัดเสาที่ข้อมูลผิด ${JSON.stringify(s)}`); continue; }
    const k = `${i},${j},${dir}`;
    if (!sigSeen.has(k)) { sigSeen.add(k); plan.signals.push([i, j, dir]); }
  }
  const platSeen = new Set();
  for (const s of list(raw.plats, 'plats')) {
    const [i, j, d, no] = Array.isArray(s) ? s : [];
    const k = segKey(i, j, d);
    if (!(seen.has(k) && isInt(no) && no >= 1 && no <= 35)) { errors.push(`ผัง: ตัดทางจอดที่ไม่อยู่บนราง ${JSON.stringify(s)}`); continue; }
    if (!platSeen.has(k)) { platSeen.add(k); plan.plats.push([i, j, d, no]); }
  }
  return { plan, errors };
}

/* ---------- คำสั่งแก้ผัง (คืน plan ใหม่เสมอ) ---------- */

const clone = p => ({ ...p, segs: p.segs.map(s => [...s]), signals: p.signals.map(s => [...s]), plats: p.plats.map(s => [...s]) });

// วาง/รื้อราง 1 ช่อง: รื้อแล้วทางจอดบนช่องนั้นหายไปด้วย
export function toggleSeg(plan, i, j, d) {
  const p = clone(plan), k = segKey(i, j, d), at = p.segs.findIndex(s => segKey(...s) === k);
  if (at >= 0) { p.segs.splice(at, 1); p.plats = p.plats.filter(s => segKey(s[0], s[1], s[2]) !== k); }
  else if (i >= 0 && i < p.cols && j >= 0 && j < p.rows && j + d >= 0 && j + d < p.rows && [-1, 0, 1].includes(d)) p.segs.push([i, j, d]);
  return p;
}

// วาง/รื้อเสาที่จุด (i, j) ทิศ dir
export function toggleSignal(plan, i, j, dir) {
  const p = clone(plan), at = p.signals.findIndex(s => s[0] === i && s[1] === j && s[2] === dir);
  if (at >= 0) p.signals.splice(at, 1); else p.signals.push([i, j, dir]);
  return p;
}

// ทำช่องรางเป็นทางจอดเลข no (no = 0 หรือ null = เอาทางจอดออก) ช่องที่ไม่มีรางถูกข้าม
export function setPlatform(plan, cells, no) {
  const p = clone(plan), has = new Set(p.segs.map(s => segKey(...s)));
  for (const [i, j, d] of cells) {
    const k = segKey(i, j, d);
    p.plats = p.plats.filter(s => segKey(s[0], s[1], s[2]) !== k);
    if (no && has.has(k)) p.plats.push([i, j, d, no]);
  }
  return p;
}

// นับชิ้นส่วน (ใช้คิดราคาในโหมดสร้าง ราคาส่งมาจากตารางราคา ไม่ผูกตัวเลขไว้ที่นี่)
export function planCount(plan) {
  const ends = {};
  for (const [i, j, d] of plan.segs) { (ends[nodeKey(i, j)] ||= [0, 0])[1]++; (ends[nodeKey(i + 1, j + d)] ||= [0, 0])[0]++; }
  const points = Object.values(ends).filter(([a, b]) => a + b === 3 && a && b).length;
  return { straight: plan.segs.filter(s => s[2] === 0).length, diagonal: plan.segs.filter(s => s[2] !== 0).length, points, signals: plan.signals.length, platformCells: plan.plats.length };
}
export function planCost(plan, price) {
  const c = planCount(plan), n = k => (Number.isFinite(price[k]) ? price[k] : 0);
  return c.straight * n('straight') + c.diagonal * n('diagonal') + c.points * n('points') + c.signals * n('signals') + c.platformCells * n('platformCells');
}

/* ---------- แปลงเป็นไฟล์ผัง schema 2 ---------- */

// คืน { json, errors, cells } — errors = ปัญหาที่เห็นได้ตั้งแต่บนกริด (เป็นภาษาของกริด บอกตำแหน่งช่อง)
// cells = ชิ้นในไฟล์ผัง -> ตำแหน่งบนกริด (หน้าจอใช้ไฮไลต์ช่องที่ผิด) { tracks: { t1: [[i,j,d]] }, points: { P1: [i,j] }, signals: { S1: [i,j,dir] } }
export function planToStation(input, id = 'custom') {
  const { plan, errors } = normalizePlan(input);
  if (!plan) return { json: null, errors, cells: null };
  const cell = (i, j) => `ช่อง (${i + 1}, ${j + 1})`;
  const nodes = {};
  const node = (i, j) => (nodes[nodeKey(i, j)] ||= { i, j, L: [], R: [], sig: {} });
  const platOf = {};
  for (const [i, j, d, no] of plan.plats) platOf[segKey(i, j, d)] = no;
  for (const s of plan.segs) { node(s[0], s[1]).R.push(s); node(s[0] + 1, s[1] + s[2]).L.push(s); }
  // รางเฉียงสองเส้นตัดกันกลางช่อง (X) ไม่มีจุดต่อ เอนจินยังไม่รองรับทางตัด
  const has = new Set(plan.segs.map(s => segKey(...s)));
  for (const [i, j, d] of plan.segs) if (d === 1 && has.has(segKey(i, j + 1, -1))) errors.push(`${cell(i, j)}: รางเฉียงสองเส้นตัดกันกลางช่อง ในเกมนี้ยังไม่มีทางตัด ให้ย้ายเส้นใดเส้นหนึ่ง`);
  for (const [i, j, dir] of plan.signals) {
    const n = nodes[nodeKey(i, j)];
    const side = n && (dir === 'E' ? n.L : n.R);
    if (!side || !side.length) { errors.push(`${cell(i, j)}: เสาทิศ${dir === 'E' ? 'ขวา' : 'ซ้าย'}ต้องมีรางเข้ามาจาก${dir === 'E' ? 'ซ้าย' : 'ขวา'}`); continue; }
    if (side.length > 1) { errors.push(`${cell(i, j)}: เสาอยู่ตรงประแจ ให้เลื่อนไปอย่างน้อย 1 ช่องจากประแจ`); continue; }
    n.sig[dir] = true;
  }
  const isBreak = n => !(n.L.length === 1 && n.R.length === 1) || n.sig.E || n.sig.W || (platOf[segKey(...n.L[0])] || 0) !== (platOf[segKey(...n.R[0])] || 0);

  // ไล่รางจากจุดแบ่งไปทางขวาจนถึงจุดแบ่งถัดไป = ราง 1 เส้นในไฟล์ผัง
  const runs = [];
  for (const k in nodes) {
    const n0 = nodes[k];
    if (!isBreak(n0)) continue;
    for (const s0 of n0.R) {
      const segs = [s0];
      let n = nodes[nodeKey(s0[0] + 1, s0[1] + s0[2])];
      while (!isBreak(n)) { const s = n.R[0]; segs.push(s); n = nodes[nodeKey(s[0] + 1, s[1] + s[2])]; }
      runs.push(segs);
    }
  }
  runs.sort((a, b) => a[0][0] - b[0][0] || a[0][1] - b[0][1] || a[0][2] - b[0][2]);
  const tracks = {}, trackCells = {}, startAt = {}, endAt = {};
  runs.forEach((segs, n) => {
    const name = `t${n + 1}`, pts = [xy(segs[0][0], segs[0][1])];
    for (let m = 0; m < segs.length; m++) {
      const s = segs[m], next = segs[m + 1];
      if (!next || next[2] !== s[2]) pts.push(xy(s[0] + 1, s[1] + s[2])); // จุดหักเลี้ยวเท่านั้น
    }
    tracks[name] = { pts };
    trackCells[name] = segs.map(s => [...s]);
    (startAt[nodeKey(segs[0][0], segs[0][1])] ||= []).push(name);
    const z = segs[segs.length - 1];
    (endAt[nodeKey(z[0] + 1, z[1] + z[2])] ||= []).push(name);
  });

  // ประแจ: จุดที่ราง 3 เส้นบรรจบ ทางตรง (N) = ขาที่วิ่งตรง ถ้ามี
  const points = {}, pointCells = {}, portals = {}, buffers = [];
  const pnodes = Object.values(nodes).filter(n => n.L.length + n.R.length >= 3).sort((a, b) => a.i - b.i || a.j - b.j);
  for (const n of pnodes) {
    const two = n.L.length === 2 && n.R.length === 1 ? 'L' : n.L.length === 1 && n.R.length === 2 ? 'R' : null;
    if (!two) { errors.push(`${cell(n.i, n.j)}: มีราง ${n.L.length + n.R.length} เส้นมาบรรจบ ประแจ 1 ตัวต่อได้ 3 ขา (1 ด้านหนึ่ง 2 อีกด้าน)`); continue; }
    const k = nodeKey(n.i, n.j), legs = two === 'L' ? endAt[k] : startAt[k];
    const segOf = t => (two === 'L' ? trackCells[t][trackCells[t].length - 1] : trackCells[t][0]);
    const straight = legs.filter(t => segOf(t)[2] === 0);
    // ไม่มีขาตรง (แยกเป็นตัว Y): ขาบน = N
    const N = straight.length === 1 ? straight[0] : [...legs].sort((a, b) => segOf(a)[2] - segOf(b)[2])[0], R = legs.find(t => t !== N);
    const name = `P${Object.keys(points).length + 1}`, [x, y] = xy(n.i, n.j);
    points[name] = { x, y, N, R };
    pointCells[name] = [n.i, n.j];
  }

  // ปลายลอย: ขอบซ้าย/ขวาของกริด = ขาเข้าออก (ยื่นรางออกนอกแผง) ที่อื่น = ทางตัน
  const ends = Object.values(nodes).filter(n => n.L.length + n.R.length === 1).sort((a, b) => a.j - b.j || a.i - b.i);
  const count = { W: 0, E: 0 };
  for (const n of ends) {
    const k = nodeKey(n.i, n.j);
    if (n.i === 0 && n.R.length) {
      const t = startAt[k][0]; count.W++;
      const pts = tracks[t].pts;
      if (pts[0][1] === pts[1][1]) pts[0] = [-OUT, pts[0][1]]; else pts.unshift([-OUT, pts[0][1]]);
      portals[count.W === 1 ? 'W' : `W${count.W}`] = { track: t, label_th: count.W === 1 ? 'ทางซ้าย' : `ทางซ้าย ${count.W}` };
    } else if (n.i === plan.cols && n.L.length) {
      const t = endAt[k][0], pts = tracks[t].pts; count.E++;
      const z = pts.length - 1;
      if (pts[z][1] === pts[z - 1][1]) pts[z] = [plan.cols * GRID + OUT, pts[z][1]]; else pts.push([plan.cols * GRID + OUT, pts[z][1]]);
      portals[count.E === 1 ? 'E' : `E${count.E}`] = { track: t, label_th: count.E === 1 ? 'ทางขวา' : `ทางขวา ${count.E}` };
    } else buffers.push((startAt[k] || endAt[k])[0]);
  }
  const portalTrack = new Set(Object.values(portals).map(v => v.track));
  // รางท่อนที่ปลายลอยทั้งสองข้าง (ไม่ต่อกับรางอื่นเลย)
  const twice = buffers.filter((t, n) => buffers.indexOf(t) !== n);
  for (const t of new Set([...twice, ...buffers.filter(t => portalTrack.has(t))])) {
    const [i, j] = trackCells[t][0];
    errors.push(`${cell(i, j)}: รางท่อนนี้ไม่ต่อกับรางอื่น ให้ต่อเข้ากับผังหรือรื้อออก`);
  }

  // ทางจอด: รางที่ทุกช่องเป็นทางจอดเลขเดียวกัน (จุดแบ่งรางตัดตรงขอบทางจอดอยู่แล้ว)
  const platforms = [], platTrack = {};
  for (const t in trackCells) {
    const no = platOf[segKey(...trackCells[t][0])];
    if (!no) continue;
    if (platTrack[no]) { errors.push(`ทางจอด ${no}: ถูกแบ่งเป็นหลายท่อน (มีเสา ประแจ หรือทางจอดอื่นคั่น) ทางจอด 1 เลขต้องเป็นรางท่อนเดียว`); continue; }
    platTrack[no] = t;
    platforms.push({ track: t, no });
  }
  platforms.sort((a, b) => a.no - b.no);
  const platNo = Object.fromEntries(platforms.map(p => [p.track, p.no]));

  // เสา: ชื่อตามกติกาใน DECISIONS — ปลายด้านขาล่องเลขคี่ ด้านขาขึ้นเลขคู่ นับจากนอกเข้าใน เสาเข้าก่อน แล้วเสาออกตามเลขทาง
  const sigs = [];
  for (const [i, j, dir] of plan.signals) {
    const n = nodes[nodeKey(i, j)];
    if (!n || !n.sig[dir]) continue;
    const k = nodeKey(i, j), track = dir === 'E' ? endAt[k][0] : startAt[k][0];
    const home = portalTrack.has(track), end = home ? (dir === 'E' ? 'W' : 'E') : dir;
    sigs.push({ i, j, dir, track, home, end, plat: platNo[track] ?? 99 });
  }
  const down = plan.upDir === 'E' ? 'W' : 'E', signals = {}, signalCells = {};
  for (const end of ['W', 'E']) {
    const fromOut = (a, b) => (end === 'W' ? a.i - b.i : b.i - a.i) || a.j - b.j;
    const list = sigs.filter(s => s.end === end).sort((a, b) => (b.home - a.home) || (a.home ? fromOut(a, b) : a.plat - b.plat || fromOut(a, b)));
    list.forEach((s, n) => {
      const id = `S${2 * n + (end === down ? 1 : 2)}`;
      signals[id] = { track: s.track, dir: s.dir, label: id, type: s.home ? 'home' : platNo[s.track] ? 'starter' : 'shunt' };
      signalCells[id] = [s.i, s.j, s.dir];
    });
  }

  const json = {
    schema: 2, id, fictional: true, upDir: plan.upDir,
    name_th: plan.name || 'ผังของฉัน', name_en: 'Custom layout',
    verified: { layout: false, signalling: false, notes: 'ผังที่ผู้เล่นสร้างในตัวแก้ผัง' }, sources: [],
    layout: { size: [plan.cols * GRID, plan.rows * GRID], tracks, points, signals, platforms, portals, buffers },
  };
  return { json, errors, cells: { tracks: trackCells, points: pointCells, signals: signalCells } };
}

// ตรวจผังครบทุกชั้น: ปัญหาบนกริด + ตัวตรวจผังของเอนจิน คืน { ok, station, json, errors, cells }
// ผังจากรหัสแชร์ต้องผ่านฟังก์ชันนี้ก่อนเล่นเสมอ
export function buildPlan(plan, id = 'custom') {
  const { json, errors, cells } = planToStation(plan, id);
  if (!json || errors.length) return { ok: false, station: null, json, errors, cells };
  const r = loadStation(json);
  return r.ok ? { ok: true, station: r.station, json, errors: [], cells } : { ok: false, station: null, json, errors: r.errors, cells };
}
