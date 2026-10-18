// กล้องและการฉายภาพของหน้าแผนที่ เป็นฟังก์ชันล้วน ไม่แตะ DOM ทดสอบใน Node ได้
// พิกัดโลก (world): x = (lon - minLon) * cos13°, y = maxLat - lat หน่วยเป็นองศาละติจูด (สูตรเดียวกับ data/README.md)
// กล้อง: { x, y, k } = จุดโลกที่อยู่กลางจอ และจำนวน px ต่อ 1 หน่วยโลก
// view: { w, h } ขนาดจอ (พิกัดเวที), pad: { l, t, r, b } ขอบที่ถูกบัง (แถบบน แผ่นข้อมูลสถานี) ใช้ตอนจัดกลางและจำกัดขอบเขต
export const COS13 = Math.cos(13 * Math.PI / 180);
export const KM_PER_UNIT = 111.2; // 1 องศาละติจูดโดยประมาณ
const NOPAD = { l: 0, t: 0, r: 0, b: 0 };

export function makeProjection(bbox) {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  return {
    w: (maxLon - minLon) * COS13, h: maxLat - minLat,
    x: lon => (lon - minLon) * COS13, y: lat => maxLat - lat,
    lon: x => x / COS13 + minLon, lat: y => maxLat - y,
    point: ([lon, lat]) => [(lon - minLon) * COS13, maxLat - lat],
  };
}

export const toScreen = (cam, view, wx, wy) => ({ x: (wx - cam.x) * cam.k + view.w / 2, y: (wy - cam.y) * cam.k + view.h / 2 });
export const toWorld = (cam, view, sx, sy) => ({ x: cam.x + (sx - view.w / 2) / cam.k, y: cam.y + (sy - view.h / 2) / cam.k });

export function boundsOf(points) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of points) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return { x0, y0, x1, y1 };
}

// กล้องที่เห็น bounds ทั้งก้อนในพื้นที่ที่ไม่ถูกบัง
export function fitBounds(b, view, pad = NOPAD, maxK = Infinity) {
  const uw = Math.max(1, view.w - pad.l - pad.r), uh = Math.max(1, view.h - pad.t - pad.b);
  const bw = Math.max(1e-9, b.x1 - b.x0), bh = Math.max(1e-9, b.y1 - b.y0);
  const k = Math.min(uw / bw, uh / bh, maxK);
  return centerOn((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, k, pad);
}
// กล้องที่วางจุดโลก (wx, wy) ไว้กลางพื้นที่ที่ไม่ถูกบัง
export function centerOn(wx, wy, k, pad = NOPAD) {
  return { x: wx - (pad.l - pad.r) / (2 * k), y: wy - (pad.t - pad.b) / (2 * k), k };
}

// จำกัดซูมและขอบเขตการเลื่อน: แกนไหนโลกเล็กกว่าพื้นที่ จัดกลางแกนนั้น ไม่งั้นขอบโลกห้ามหลุดเข้ามาในพื้นที่
export function clampCamera(cam, view, world, limits, pad = NOPAD) {
  const k = Math.min(limits.maxK, Math.max(limits.minK, cam.k));
  const axis = (c, size, wsize, a, b) => {
    const usable = size - a - b;
    if (wsize * k <= usable) return wsize / 2 - (a - b) / (2 * k);
    const lo = (size / 2 - a) / k, hi = wsize - (size / 2 - b) / k;
    return Math.min(hi, Math.max(lo, c));
  };
  return { x: axis(cam.x, view.w, world.w, pad.l, pad.r), y: axis(cam.y, view.h, world.h, pad.t, pad.b), k };
}

export const panBy = (cam, dx, dy) => ({ x: cam.x - dx / cam.k, y: cam.y - dy / cam.k, k: cam.k });

// ซูมโดยให้จุดโลกใต้ (sx, sy) อยู่กับที่
export function zoomAt(cam, view, sx, sy, factor, limits) {
  const k = Math.min(limits.maxK, Math.max(limits.minK, cam.k * factor));
  const ox = sx - view.w / 2, oy = sy - view.h / 2;
  return { x: cam.x + ox / cam.k - ox / k, y: cam.y + oy / cam.k - oy / k, k };
}

// สองนิ้ว: a = { x, y, d } จุดกึ่งกลางและระยะห่างของนิ้วรอบก่อน, b = รอบนี้
export function pinch(cam, view, a, b, limits) {
  const moved = panBy(cam, b.x - a.x, b.y - a.y);
  return a.d > 0 && b.d > 0 ? zoomAt(moved, view, b.x, b.y, b.d / a.d, limits) : moved;
}

// กล้องระหว่างทาง e = 0..1: ซูมแบบทวีคูณ และจุดหมายเลื่อนเข้าหากลางจอเป็นเส้นตรงบนจอ
export function lerpCamera(a, b, e) {
  if (e <= 0) return { ...a };
  if (e >= 1) return { ...b };
  const k = a.k * Math.pow(b.k / a.k, e), f = (1 - e) * a.k / k;
  return { x: b.x + (a.x - b.x) * f, y: b.y + (a.y - b.y) * f, k };
}
export const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const sameCamera = (a, b) => Math.abs(a.x - b.x) * a.k < 0.5 && Math.abs(a.y - b.y) * a.k < 0.5 && Math.abs(a.k / b.k - 1) < 0.002;

// ระยะบนจอที่สั้นที่สุดระหว่างจุดโลกคู่ใด ๆ (ใช้ตัดสินว่าจุดสถานีซ้อนกันจนต้องรวมเป็นปุ่มเดียวไหม)
export function minPairDistance(points, k) {
  let min = Infinity;
  for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) {
    const d = Math.hypot(points[i][0] - points[j][0], points[i][1] - points[j][1]) * k;
    if (d < min) min = d;
  }
  return min;
}

// เลือกด้านวางป้ายชื่อของแต่ละจุด (right, bottom, left, top) ให้หันออกจากจุดข้างเคียงที่ใกล้ที่สุด
export function labelSides(points) {
  const SIDES = [['right', 0], ['bottom', Math.PI / 2], ['left', Math.PI], ['top', -Math.PI / 2]];
  return points.map((p, i) => {
    const others = points.map((q, j) => ({ j, d: Math.hypot(q[0] - p[0], q[1] - p[1]), a: Math.atan2(q[1] - p[1], q[0] - p[0]) })).filter(o => o.j !== i && o.d > 0);
    if (!others.length) return 'right';
    const near = Math.min(...others.map(o => o.d));
    const close = others.filter(o => o.d <= near * 2.2);
    let best = 'right', score = -1;
    for (const [side, ang] of SIDES) {
      const s = Math.min(...close.map(o => { const d = Math.abs(o.a - ang) % (2 * Math.PI); return d > Math.PI ? 2 * Math.PI - d : d; }));
      if (s > score + 1e-9) { score = s; best = side; }
    }
    return best;
  });
}

export const rectsOverlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
// วางป้ายแบบไม่ซ้อน: เรียงตามลำดับที่ส่งมา (สำคัญก่อน) อันไหนชนของที่วางแล้วให้ข้าม คืนดัชนีที่วางได้
export function placeLabels(rects, occupied = []) {
  const taken = occupied.slice(), keep = [];
  rects.forEach((r, i) => { if (!r) return; if (taken.some(t => rectsOverlap(r, t))) return; taken.push(r); keep.push(i); });
  return keep;
}
