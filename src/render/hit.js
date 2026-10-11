// หาว่าจุด (x, y) ในพิกัดของผัง 2 มิติ แตะโดนอะไร คืน target สำหรับ sim.press() หรือ null
// (ฉาก 3 มิติจะมีตัวหาเป้าของตัวเอง แต่ส่ง target รูปเดียวกัน)
const REACH = 44; // รัศมีเป้าแตะ (หน่วยของผัง)

export function hitTest(g, x, y) {
  const d = (a, b) => Math.hypot(x - a, y - b);
  let best = null, bd = REACH;
  for (const k in g.S) { const s = g.S[k], dd = d(s.lx, s.ly); if (dd < bd) { bd = dd; best = { kind: 'signal', id: k }; } }
  for (const k in g.P) { const p = g.P[k], dd = Math.min(d(p.x, p.y + 34), d(p.x, p.y) + 6); if (dd < bd) { bd = dd; best = { kind: 'point', id: k }; } }
  if (best) return best;
  for (const n of g.L.plats) {
    const e = g.E[g.L.platEdge[n]], [px, py] = e.pts[0];
    if (x > px - 10 && x < px + e.len + 10 && y > py - 34 && y < py + 44) return { kind: 'platform', no: n };
  }
  return null;
}
