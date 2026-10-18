// ตัววาดแผงควบคุม 2 มิติบน canvas (แนวนอนอย่างเดียว) — วาดจากสถานะของ sim เท่านั้น ไม่แก้สถานะ
// สีทุกสีอ่านจาก CSS variable เพื่อรองรับโหมดมืด
import { posAt, edgeOccupied } from '../sim/index.js';

const VARS = { board: '--board', track: '--track', route: '--route', occ: '--occ', ink: '--ink', muted: '--muted', paper: '--paper',
  red: '--red', green: '--green', amber: '--amber', navy: '--navy', lampOff: '--lamp-off', onColor: '--on-color', onAmber: '--on-amber', stripe: '--train-stripe' };
const TRAIN_VARS = ['--exp', '--t1', '--t2', '--t3']; // สีขบวนตามชานชาลา (0 = ด่วน) เกิน 3 วนกลับ

export function createRenderer(cv) {
  const cx = cv.getContext('2d');
  let C = {}, cT = 0, K = 1, W = 960, H = 480;

  function colors() {
    const cs = getComputedStyle(document.documentElement), v = n => cs.getPropertyValue(n).trim();
    C = { t: TRAIN_VARS.map(v) };
    for (const k in VARS) C[k] = v(VARS[k]);
  }
  const trainColor = plat => C.t[plat === 0 ? 0 : 1 + (plat - 1) % (C.t.length - 1)];
  const font = (sz, w = 500) => `${w} ${sz}px Mitr, Anuphan, system-ui, sans-serif`;
  function txt(s, x, y, align = 'center') { cx.textAlign = align; cx.textBaseline = 'middle'; cx.fillText(s, x, y); }
  function rr(x, y, w, h, r) { cx.beginPath(); cx.roundRect ? cx.roundRect(x, y, w, h, r) : cx.rect(x, y, w, h); }
  function strokeEdge(e, w, col, from = 0, to = e.len) {
    cx.strokeStyle = col; cx.lineWidth = w; cx.lineCap = 'round'; cx.lineJoin = 'round'; cx.beginPath();
    const n = Math.max(2, Math.ceil((to - from) / 8));
    for (let i = 0; i <= n; i++) { const p = posAt(e, from + (to - from) * i / n); i ? cx.lineTo(p.x, p.y) : cx.moveTo(p.x, p.y); }
    cx.stroke();
  }

  // ปรับขนาด canvas ให้พอดีกล่อง box โดยคงสัดส่วนของผัง
  function fit(box, size) {
    [W, H] = size;
    const bw = box.clientWidth - 16, bh = box.clientHeight - 16;
    const k = Math.max(0.1, Math.min(bw / W, bh / H));
    const cw = Math.floor(W * k), ch = Math.floor(H * k), dpr = Math.min(2.5, window.devicePixelRatio || 1);
    if (cv.style.width !== cw + 'px' || cv.style.height !== ch + 'px' || cv.width !== Math.round(cw * dpr)) {
      cv.style.width = cw + 'px'; cv.style.height = ch + 'px'; cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
    }
    K = cv.width / W;
  }

  // g = สถานะเกมจาก sim, time = วินาที (ใช้กับการกะพริบเท่านั้น), hn = คำใบ้จาก sim.hint(g) หรือ null
  function draw(g, time, hn, box) {
    if (--cT <= 0) { colors(); cT = 30; }
    fit(box, g.L.size);
    cx.setTransform(1, 0, 0, 1, 0, 0); cx.fillStyle = C.board; cx.fillRect(0, 0, cv.width, cv.height);
    cx.setTransform(K, 0, 0, K, 0, 0);
    const E = g.E, L = g.L, blink = Math.floor(time * 3) % 2 === 0;

    // ชานชาลา
    for (const n of L.plats) {
      const e = E[L.platEdge[n]], [x, y] = e.pts[0];
      cx.fillStyle = trainColor(n); cx.globalAlpha = .2; rr(x + 12, y + 14, e.len - 24, 24, 8); cx.fill(); cx.globalAlpha = 1;
      cx.fillStyle = C.ink; cx.font = font(15);
      cx.textAlign = 'left'; cx.textBaseline = 'middle'; cx.fillText(`ชานชาลา ${n}`, x + 24, y + 26);
      const nxHi = g.era.nx && g.nxSel === L.entrySig && blink;
      if (nxHi || (hn && hn.kind === 'plat' && hn.k === n && blink)) { cx.strokeStyle = C.amber; cx.lineWidth = 3; rr(x + 6, y - 22, e.len - 12, 64, 12); cx.stroke(); }
    }
    cx.fillStyle = C.muted; cx.font = font(14, 400);
    txt('ขบวนเข้า', 50, L.inY + 34); txt('ออกจากสถานี', W - 60, L.inY + 34);

    // ราง
    for (const k in E) strokeEdge(E[k], 7, C.track);
    if (g.era.interlock) for (const k in g.lockOf) strokeEdge(E[k], 7, C.route);
    if (g.era.tc) for (const k in E) if (edgeOccupied(g, k)) strokeEdge(E[k], 7, C.occ);

    // ประแจ
    for (const key in g.P) {
      const p = g.P[key], on = E[p[p.pos]], off = E[p[p.pos === 'N' ? 'R' : 'N']];
      const near = (e, a, b) => p.facing ? [a, b] : [e.len - b, e.len - a];
      let [a, b] = near(off, 4, 26); strokeEdge(off, 9, C.board, a, b);
      [a, b] = near(on, 0, 34); strokeEdge(on, 7, C.ink, a, b);
      const ly = p.y + 34;
      cx.fillStyle = p.lock ? C.route : C.paper; cx.strokeStyle = C.ink; cx.lineWidth = 2;
      cx.beginPath(); cx.arc(p.x, ly, 16, 0, 7); cx.fill(); cx.stroke();
      cx.fillStyle = C.ink; cx.font = font(12, 600); txt(key, p.x, ly + 1);
      if (p.lock) {
        cx.strokeStyle = C.ink; cx.lineWidth = 1.8; cx.beginPath(); cx.arc(p.x + 18, ly - 16, 4, Math.PI, 0); cx.stroke();
        cx.fillStyle = C.ink; cx.fillRect(p.x + 13, ly - 16, 10, 8);
      }
    }

    // สัญญาณ
    for (const key in g.S) {
      const s = g.S[key], e = E[s.edge], endY = e.pts[e.pts.length - 1][1];
      cx.strokeStyle = C.muted; cx.lineWidth = 3; cx.beginPath(); cx.moveTo(s.lx, s.ly + 16); cx.lineTo(s.lx, endY - 8); cx.stroke();
      if (g.era.sema) {
        cx.save(); cx.translate(s.lx, s.ly);
        cx.fillStyle = C.ink; cx.fillRect(-3, -16, 6, 34);
        cx.rotate(s.aspect === 'G' ? -0.7 : 0);
        cx.fillStyle = C.red; rr(2, -5, 30, 10, 3); cx.fill();
        cx.fillStyle = C.onColor; cx.fillRect(22, -5, 4, 10);
        cx.restore();
        cx.fillStyle = s.aspect === 'G' ? C.green : C.red; cx.beginPath(); cx.arc(s.lx - 10, s.ly + 10, 5, 0, 7); cx.fill();
      } else {
        cx.fillStyle = C.navy; rr(s.lx - 13, s.ly - 22, 26, 42, 9); cx.fill();
        cx.fillStyle = s.aspect === 'R' ? C.red : C.lampOff; cx.beginPath(); cx.arc(s.lx, s.ly - 10, 7, 0, 7); cx.fill();
        cx.fillStyle = s.aspect === 'G' ? C.green : C.lampOff; cx.beginPath(); cx.arc(s.lx, s.ly + 8, 7, 0, 7); cx.fill();
      }
      if (g.nxSel === key && blink) { cx.strokeStyle = C.amber; cx.lineWidth = 3; cx.beginPath(); cx.arc(s.lx, s.ly, 28, 0, 7); cx.stroke(); }
      cx.fillStyle = C.ink; cx.font = font(13, 600); txt(key, s.lx, s.ly - 34);
    }

    // คำใบ้
    if (hn && hn.kind !== 'plat') {
      const at = hn.kind === 's' ? { x: g.S[hn.k].lx, y: g.S[hn.k].ly } : { x: g.P[hn.k].x, y: g.P[hn.k].y + 34 };
      const r = 26 + (Math.sin(time * 5) + 1) * 4;
      cx.strokeStyle = C.amber; cx.lineWidth = 3.5; cx.beginPath(); cx.arc(at.x, at.y, r, 0, 7); cx.stroke();
      cx.font = font(14, 600); const tw = cx.measureText(hn.text).width + 18;
      const bx = at.x, by = at.y + (hn.kind === 's' ? -64 : 52);
      cx.fillStyle = C.amber; rr(bx - tw / 2, by - 14, tw, 28, 14); cx.fill();
      cx.fillStyle = C.onAmber; txt(hn.text, bx, by + 1);
    } else if (hn) {
      const e = E[L.platEdge[hn.k]];
      cx.fillStyle = C.amber; cx.font = font(14, 600); txt(hn.text, e.pts[0][0] + e.len / 2, e.pts[0][1] - 32);
    }

    // ขบวนรถ
    for (const t of g.trains) {
      const tr = t.trail; if (tr.length < 2) continue;
      const path = () => { cx.beginPath(); tr.forEach((q, i) => i ? cx.lineTo(q.x, q.y) : cx.moveTo(q.x, q.y)); };
      cx.strokeStyle = trainColor(t.plat); cx.lineWidth = 18; cx.lineCap = 'round'; cx.lineJoin = 'round'; path(); cx.stroke();
      cx.strokeStyle = C.stripe; cx.lineWidth = 5; cx.setLineDash([8, 7]); path(); cx.stroke(); cx.setLineDash([]);
      const h = tr[tr.length - 1], h2 = tr[Math.max(0, tr.length - 4)], a = Math.atan2(h.y - h2.y, h.x - h2.x);
      cx.save(); cx.translate(h.x, h.y); cx.rotate(a);
      cx.fillStyle = C.navy; cx.beginPath(); cx.arc(-2, -4, 2.4, 0, 7); cx.arc(-2, 4, 2.4, 0, 7); cx.fill(); cx.restore();
      const bx = h.x - Math.cos(a) * 32, by = h.y - Math.sin(a) * 32 - 24;
      const late = t.wait > (t.state === 'ready' ? 4 : 6);
      cx.fillStyle = C.paper; cx.strokeStyle = late ? C.red : trainColor(t.plat); cx.lineWidth = late ? 3.5 : 2.5;
      if (t.exp) { rr(bx - 20, by - 11, 40, 22, 11); } else { cx.beginPath(); cx.arc(bx, by, 11.5, 0, 7); }
      cx.fill(); cx.stroke();
      cx.fillStyle = C.ink; cx.font = font(t.exp ? 12 : 13, 600); txt(t.exp ? 'ด่วน' : String(t.plat), bx, by + 1);
      cx.font = font(12, 500); cx.fillStyle = t.state === 'ready' ? C.ink : C.muted;
      if (t.state === 'ready') txt('พร้อมออก', bx, by - 22);
      if (t.state === 'dwell') txt('รับผู้โดยสาร', bx, by - 22);
    }

    // คิว
    const q = g.lv.trains.slice(g.spawned, g.spawned + 4);
    cx.fillStyle = C.muted; cx.font = font(13, 400);
    if (q.length) txt('คันถัดไป', 40, H - 62);
    q.forEach(([, p], i) => {
      const qx = 40 + i * 50, qy = H - 32;
      cx.fillStyle = trainColor(p); rr(qx - 21, qy - 13, 42, 26, 9); cx.fill();
      cx.fillStyle = C.onColor; cx.font = font(p ? 14 : 12, 600); txt(p ? String(p) : 'ด่วน', qx, qy + 1);
    });
  }

  // แปลงตำแหน่งบนจอ <-> พิกัดของผัง
  function toBoard(clientX, clientY) {
    const r = cv.getBoundingClientRect();
    return { x: (clientX - r.left) / r.width * W, y: (clientY - r.top) / r.height * H };
  }
  function toClient(x, y) {
    const r = cv.getBoundingClientRect();
    return { x: r.left + x / W * r.width, y: r.top + y / H * r.height };
  }
  return { draw, toBoard, toClient };
}
