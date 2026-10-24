// แปลงผังของ sim (g.L หน่วยแผง 2 มิติ) เป็นตำแหน่งในโลก 3 มิติ (หน่วยเมตร) — ฟังก์ชันล้วน ไม่แตะ three.js ไม่แตะ DOM ทดสอบใน Node ได้
// แกนโลก: x = ตามแนวแผง (ซ้ายไปขวา), y = ขึ้น, z = ลงล่างของแผง  ด้านบนของแผง (-z) จึงเป็นซ้ายมือของคนขับที่วิ่งไปทาง E
// ย่อคนละแกน: แนวราง 1 หน่วยแผง = KX เมตร ส่วนแนวขวาง รางแต่ละระดับห่างกัน TRACK_GAP เมตร (แผงวางรางห่างกันมากเพื่อให้แตะง่าย)
// ความยาวขบวนในแผง (72 หน่วย) จึงเท่ากับรถดีเซลราง 1 คันพอดี
export const KX = 0.25;           // เมตรต่อหน่วยแผงตามแนวราง
export const TRACK_GAP = 4.6;     // ระยะศูนย์กลางรางคู่ขนาน (เมตร)
export const GAUGE = 1.0;         // ทางกว้าง 1 เมตร
export const SIG_SIDE = 2.75;     // เสาสัญญาณห่างศูนย์กลางรางไปทางซ้ายมือคนขับ
export const CAR_LEN = 17.6;      // ความยาวตัวรถดีเซลราง (เมตร) ไม่เกินความยาวขบวนในแผง × KX

const smooth = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };

// ระดับแนวขวาง: ค่า y ของแผงที่มีรางวิ่งแนวนอนอยู่ (เรียงจากบนลงล่าง) แต่ละระดับห่างกัน TRACK_GAP
function levelsOf(L) {
  const ys = new Set();
  for (const k in L.E) {
    const e = L.E[k]; if (e.track !== k) continue;
    for (let i = 1; i < e.pts.length; i++) if (e.pts[i][1] === e.pts[i - 1][1]) ys.add(e.pts[i][1]);
  }
  const list = [...ys].sort((a, b) => a - b), out = [];
  list.forEach((y, i) => { if (i === 0 || y - list[i - 1] > 20) out.push(y); });
  return out.length ? out : [L.size[1] / 2];
}

// รางหลัก: ระดับที่มีรางยาวที่สุด (ทางประธาน) ใช้เป็น z = 0
function mainLevel(L, levels) {
  const len = new Map(levels.map(y => [y, 0]));
  for (const k in L.E) {
    const e = L.E[k]; if (e.track !== k) continue;
    for (let i = 1; i < e.pts.length; i++) { const a = e.pts[i - 1], b = e.pts[i]; if (a[1] === b[1] && len.has(a[1])) len.set(a[1], len.get(a[1]) + Math.abs(b[0] - a[0])); }
  }
  return [...len].sort((a, b) => b[1] - a[1])[0][0];
}

export function world3d(L) {
  const levels = levelsOf(L), y0 = mainLevel(L, levels), i0 = levels.indexOf(y0);
  // x กลาง: กึ่งกลางระหว่างประแจซ้ายสุดและขวาสุด (ไม่มีประแจ = กลางแผง)
  const px = Object.values(L.P || {}).map(p => p.x), cx = px.length ? (Math.min(...px) + Math.max(...px)) / 2 : L.size[0] / 2;
  const X = bx => (bx - cx) * KX;
  const Z = by => {                                 // y ของแผง → z โลก (สอดแทรกเชิงเส้นระหว่างระดับ)
    if (by <= levels[0]) return (0 - i0) * TRACK_GAP + (by - levels[0]) * TRACK_GAP / 90;
    for (let i = 1; i < levels.length; i++) if (by <= levels[i]) return (i - 1 - i0 + (by - levels[i - 1]) / (levels[i] - levels[i - 1])) * TRACK_GAP;
    return (levels.length - 1 - i0) * TRACK_GAP + (by - levels[levels.length - 1]) * TRACK_GAP / 90;
  };

  // ราง: ช่วงที่เปลี่ยนระดับกลายเป็นโค้งตัว S (สัมผัสแนวตรงทั้งสองปลาย) z เป็นฟังก์ชันของ x ตามแนวราง
  const tracks = {};
  for (const k in L.E) {
    const e = L.E[k]; if (e.track !== k) continue;
    const segs = [];
    for (let i = 1; i < e.pts.length; i++) segs.push({ x0: X(e.pts[i - 1][0]), x1: X(e.pts[i][0]), z0: Z(e.pts[i - 1][1]), z1: Z(e.pts[i][1]) });
    const mono = segs.every(s => s.x1 > s.x0);
    const zAt = x => {
      for (const s of segs) if (x <= s.x1 || s === segs[segs.length - 1]) return s.z0 + (s.z1 - s.z0) * (s.z0 === s.z1 ? 0 : (mono ? smooth : t => Math.max(0, Math.min(1, t)))((x - s.x0) / (s.x1 - s.x0 || 1)));
      return segs[0].z0;
    };
    const x0 = segs[0].x0, x1 = segs[segs.length - 1].x1, pts = [];
    if (mono) {
      for (const s of segs) {
        const n = s.z0 === s.z1 ? 1 : Math.max(2, Math.ceil((s.x1 - s.x0) / 1.0));
        for (let j = pts.length ? 1 : 0; j <= n; j++) { const x = s.x0 + (s.x1 - s.x0) * j / n; pts.push([x, zAt(x)]); }
      }
    } else for (const p of e.pts) pts.push([X(p[0]), Z(p[1])]);
    tracks[k] = { id: k, pts, x0, x1, zAt, len: e.len ?? 0 };
  }

  // ประแจ: จุดเริ่มแยก และทิศที่ขาแยกออกไป (+1 = ไปทาง +x)
  const points = {};
  for (const k in L.P) {
    const p = L.P[k], x = X(p.x), R = tracks[p.R], N = tracks[p.N];
    const away = R && Math.abs(R.x0 - x) < 0.01 ? 1 : -1;
    const span = R ? Math.abs((away > 0 ? R.x1 : R.x0) - x) : 10;
    const zr = R ? R.zAt(x + away * Math.min(span, 30)) : 0, z = Z(p.y);
    points[k] = { id: k, x, z, away, side: Math.sign(zr - z) || 1, N: p.N, R: p.R, N_track: N ? N.id : null };
  }

  // สัญญาณ: ตำแหน่งตามแนวรางจาก lx ของ sim, อยู่ซ้ายมือคนขับ, หันหน้าหาขบวนที่วิ่งเข้ามา
  const signals = {};
  for (const k in L.S) {
    const s = L.S[k], e = L.E[s.edge], t = tracks[e.track], dir = s.dir || e.dir || 'E';
    const x = X(s.lx), side = dir === 'E' ? -1 : 1;
    signals[k] = { id: k, x, z: (t ? t.zAt(x) : 0) + side * SIG_SIDE, trackZ: t ? t.zAt(x) : 0, dir, side, label: s.label || k, type: s.type, track: e.track,
      rotY: dir === 'E' ? -Math.PI / 2 : Math.PI / 2 };
  }

  // ชานชาลา: ข้างทางจอดด้านที่ไม่มีรางอื่นขนาน (ถ้ามีทั้งสองข้างใช้ด้านบนของแผง)
  const platforms = [];
  for (const n of L.plats || []) {
    const tk = L.E[L.platEdge[n]].track, t = tracks[tk]; if (!t) continue;
    const no = L.noPlatform && L.noPlatform.includes(n);
    const z = t.zAt((t.x0 + t.x1) / 2), mid = (t.x0 + t.x1) / 2;
    // ตรวจรางอื่นที่ขนานอยู่ข้าง ๆ ตลอดแนวชานชาลา (สุ่มจุดตาม x ไม่ใช้จุดยอดของราง เพราะรางตรงมีแค่จุดหัวท้าย)
    const xs_ = [0.1, 0.3, 0.5, 0.7, 0.9].map(f => t.x0 + (t.x1 - t.x0) * f);
    const has = sd => Object.values(tracks).some(o => o !== t && xs_.some(x => { if (x < o.x0 || x > o.x1) return false; const d = o.zAt(x) - z; return Math.sign(d) === sd && Math.abs(d) < TRACK_GAP * 1.2; }));
    const side = !has(-1) ? -1 : !has(1) ? 1 : -1;
    platforms.push({ no: n, track: tk, x0: t.x0 + 1, x1: t.x1 - 1, z, side, none: !!no });
  }

  // ปลายทางตัน (L.buffers = รางที่สุดทางในสถานี เช่น น้ำตก): ปลายที่ไม่ต่อกับรางอื่น วางหลักกันชน ไม่ต่อรางออกไปนอกผัง
  const buffers = [];
  for (const k of L.buffers || []) {
    const t = tracks[k], e = L.E[k]; if (!t || !e) continue;
    const atEnd = e.next === null || e.next === undefined, a = X(e.pts[0][0]), b = X(e.pts[e.pts.length - 1][0]), x = atEnd ? b : a;
    buffers.push({ track: k, x, z: t.zAt(x), dir: (atEnd ? b - a : a - b) > 0 ? 1 : -1 });   // dir = ทิศที่รางสุดทาง (+1 = สุดทางด้าน +x)
  }

  // ย่านสถานี: ระหว่างเสาเข้า (หรือประแจ) ซ้ายสุดและขวาสุด รวมชานชาลาและหลักกันชน (ผังทางตันเสาออกอยู่กลางย่าน)
  const xs = [...Object.values(signals).map(s => s.x), ...Object.values(points).map(p => p.x), ...platforms.flatMap(p => [p.x0 - 4, p.x1 + 4]), ...buffers.map(b => b.x + b.dir * 6)];
  const zs = Object.values(tracks).flatMap(t => t.pts.map(p => p[1]));
  const bounds = { x0: Math.min(...xs, -40), x1: Math.max(...xs, 40), z0: Math.min(...zs), z1: Math.max(...zs) };
  return { X, Z, cx, levels, tracks, points, signals, platforms, buffers, bounds };
}

// ตำแหน่งในโลกของจุดบนทางวิ่งของขบวน (trail ของ sim: {x, y, e}) วางบนแนวรางโค้งเดียวกับที่วาด
export function trailPoint(W, L, q) {
  const tk = L.E[q.e] ? L.E[q.e].track : null, t = tk && W.tracks[tk], x = W.X(q.x);
  return [x, t ? t.zAt(x) : W.Z(q.y)];
}

// วางรถยาว len ตามทางวิ่ง (เรียงจากท้ายไปหัว) คืนจุดหัวและท้ายของตัวรถในโลก
export function carSpan(path, len) {
  if (path.length < 2) return null;
  const head = path[path.length - 1];
  let acc = 0, tail = path[0];
  for (let i = path.length - 1; i > 0; i--) {
    const a = path[i], b = path[i - 1], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
    if (acc + d >= len) { const f = (len - acc) / d; tail = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]; acc = len; break; }
    acc += d; tail = b;
  }
  return { head, tail, len: acc };
}
