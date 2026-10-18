// เรขาคณิตของขอบราง: ขอบราง 1 เส้น = polyline ที่มีทิศ (วิ่งจาก pts[0] ไป pts ตัวสุดท้าย)

// เติม id, len และรายการท่อนย่อย (seg) ให้ขอบรางทุกเส้น คืนอ็อบเจกต์ใหม่ ไม่แก้ของเดิม
export function prepEdges(src) {
  const E = {};
  for (const k in src) {
    const e = { ...src[k], id: k, len: 0, seg: [] };
    for (let i = 1; i < e.pts.length; i++) {
      const [x0, y0] = e.pts[i - 1], [x1, y1] = e.pts[i], l = Math.hypot(x1 - x0, y1 - y0);
      e.seg.push({ x0, y0, x1, y1, l, s0: e.len }); e.len += l;
    }
    E[k] = e;
  }
  return E;
}

// จุดบนขอบราง e ที่ระยะ s จากต้นขอบ
export function posAt(e, s) {
  s = Math.max(0, Math.min(e.len, s));
  for (const g of e.seg) if (s <= g.s0 + g.l + 1e-6) {
    const f = (s - g.s0) / g.l;
    return { x: g.x0 + (g.x1 - g.x0) * f, y: g.y0 + (g.y1 - g.y0) * f };
  }
  const g = e.seg[e.seg.length - 1]; return { x: g.x1, y: g.y1 };
}
