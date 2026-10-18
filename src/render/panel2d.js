// ตัววาดแผงผังเส้น 2 มิติของโหมดอาชีพ — วาดจากสถานะของ sim เท่านั้น ไม่แก้สถานะ (sim ห้าม import ไฟล์นี้)
// วาดได้ทั้งผัง schema 1 และ schema 2: รางกายภาพวาดครั้งเดียว ประแจ เสาสองทิศพร้อมชื่อ (label) ทางจอด ทางตัน ป้ายขา + สถานะตอนทางเดี่ยว
// เส้นทางที่ล็อก การครอบครอง (ยุคที่มีวงจรตอนราง) ขบวนพร้อมทิศและปลายทาง และคำใบ้ทุกชนิด (ประแจ เสา ทางจอด ป้ายขา รางปลายทาง)
// ตำแหน่งของทุกชิ้นมาจาก panel-geom.js ชุดเดียวกับตัวหาเป้าแตะ สีทุกสีอ่านจาก CSS variable (โหมดมืด)
// (โหมดประวัติศาสตร์ยังใช้ canvas2d.js ตัวเดิม เพราะมีเทสต์เทียบภาพกับต้นแบบ v2 ทีละพิกเซล)
import { trackState, blockState, trainInfo, sigName } from '../sim/index.js';
import { panelGeom, targetCenter, destinations, along, tokenBoxes } from './panel-geom.js';

const VARS = { board: '--board', track: '--track', route: '--route', occ: '--occ', ink: '--ink', muted: '--muted', paper: '--paper', line: '--line',
  red: '--red', green: '--green', amber: '--amber', navy: '--navy', lampOff: '--lamp-off', onColor: '--on-color', onAmber: '--on-amber', stripe: '--train-stripe' };
const TRAIN_VARS = ['--exp', '--t1', '--t2', '--t3'];
const MIN_TEXT_PX = 11.5, MAX_SCALE = 1.5;

// cv = canvas, styleEl = element ที่อ่าน CSS variable
export function createPanel(cv, styleEl = document.documentElement) {
  const cx = cv.getContext('2d');
  let C = null, K = 1, dpr = 1, ox = 0, oy = 0, cw = 0, ch = 0, fam = 'sans-serif', famBody = 'sans-serif';

  function refreshColors() {
    const cs = getComputedStyle(styleEl), v = n => cs.getPropertyValue(n).trim();
    C = { t: TRAIN_VARS.map(v) };
    for (const k in VARS) C[k] = v(VARS[k]) || '#888';
    fam = v('--display') || 'sans-serif'; famBody = v('--body') || 'sans-serif';
  }
  const trainColor = plat => C.t[!plat ? 0 : 1 + (plat - 1) % (C.t.length - 1)];
  const fs = n => Math.max(n, MIN_TEXT_PX / K);                       // ขนาดตัวอักษร (หน่วยแผง) ไม่เล็กกว่า 11.5 px บนจอ
  const font = (sz, w = 500, body = false) => `${w} ${fs(sz)}px ${body ? famBody : fam}`;
  function txt(s, x, y, align = 'center') { cx.textAlign = align; cx.textBaseline = 'middle'; cx.fillText(s, x, y); }
  function rr(x, y, w, h, r) { cx.beginPath(); if (cx.roundRect) cx.roundRect(x, y, w, h, r); else cx.rect(x, y, w, h); }
  function poly(pts, w, col) { cx.strokeStyle = col; cx.lineWidth = w; cx.lineCap = 'round'; cx.lineJoin = 'round'; cx.beginPath(); pts.forEach((p, i) => (i ? cx.lineTo(p[0], p[1]) : cx.moveTo(p[0], p[1]))); cx.stroke(); }
  function part(pts, len, a, b, w, col) { const n = Math.max(2, Math.ceil((b - a) / 8)), out = []; for (let i = 0; i <= n; i++) out.push(along(pts, a + (b - a) * i / n)); poly(out, w, col); }
  // ป้ายข้อความมีพื้น คืนกรอบ
  function tag(s, x, y, { align = 'center', bg = C.paper, fg = C.ink, border = C.line, size = 13, weight = 500, pad = 8, h = 0 } = {}) {
    cx.font = font(size, weight);
    const w = cx.measureText(s).width + pad * 2, hh = h || fs(size) + 10, x0 = align === 'left' ? x : align === 'right' ? x - w : x - w / 2;
    cx.fillStyle = bg; rr(x0, y - hh / 2, w, hh, hh / 2); cx.fill();
    if (border) { cx.strokeStyle = border; cx.lineWidth = 1.5; cx.stroke(); }
    cx.fillStyle = fg; txt(s, x0 + w / 2, y + 0.5);
    return { x: x0, y: y - hh / 2, w, h: hh };
  }

  // ปรับ canvas ให้เต็มกล่อง (ขนาด CSS w × h ในพิกัดเวที) แล้วคิดมาตราส่วนให้กรอบของผังพอดี
  function fit(G, w, h) {
    dpr = Math.min(2.5, globalThis.devicePixelRatio || 1);
    cw = Math.max(1, Math.floor(w)); ch = Math.max(1, Math.floor(h));
    if (cv.width !== Math.round(cw * dpr) || cv.height !== Math.round(ch * dpr)) { cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr); }
    const V = G.view, vw = V.x1 - V.x0, vh = V.y1 - V.y0;
    K = Math.max(0.1, Math.min(cw / vw, ch / vh, MAX_SCALE));
    ox = (cw - vw * K) / 2 - V.x0 * K; oy = (ch - vh * K) / 2 - V.y0 * K;
  }

  // g = สถานะเกมจาก sim, time = วินาที (ใช้กับการกะพริบเท่านั้น), hn = คำใบ้จาก sim.hint(g) หรือ null, size = { w, h } ของกล่อง
  function draw(g, time, hn, size, { calm = false } = {}) {
    if (!C) refreshColors();
    const L = g.L, G = panelGeom(L), E = g.E, blink = calm || Math.floor(time * 3) % 2 === 0, pulse = calm ? 4 : (Math.sin(time * 5) + 1) * 4;
    fit(G, size.w, size.h);
    cx.setTransform(1, 0, 0, 1, 0, 0); cx.fillStyle = C.board; cx.fillRect(0, 0, cv.width, cv.height);
    cx.setTransform(dpr * K, 0, 0, dpr * K, dpr * ox, dpr * oy);
    const dest = destinations(g), isDest = (kind, id) => dest.some(t => t.kind === kind && (t.id ?? t.no) === id);
    const hinted = (kind, id) => hn && hn.kind === kind && hn.k === id;
    const bubbles = [], portalBoxes = []; // ข้อความคำใบ้ วาดทับทุกอย่างตอนท้าย, กรอบป้ายขา

    // ทางจอด
    for (const n in G.plats) {
      const p = G.plats[n];
      // แถบสี = ชานชาลา ทางจอดที่ไม่มีชานชาลา (noPlatform) มีแค่เลขทาง ไม่วาดแถบ
      const bare = !!(L.noPlatform && L.noPlatform.includes(p.no));
      if (!bare) { cx.fillStyle = trainColor(p.no); cx.globalAlpha = .22; rr(p.sx, p.y + 14, p.sw, 24, 8); cx.fill(); cx.globalAlpha = 1; }
      cx.fillStyle = bare ? C.muted : C.ink; cx.font = font(14); txt(L.bidir ? `ทาง ${p.no}${bare ? ' · ไม่มีชานชาลา' : ''}` : `ชานชาลา ${p.no}`, p.sx + 12, p.y + 26.5, 'left');
      const pick = isDest('platform', p.no) || (!L.bidir && g.era.nx && g.nxSel === L.entrySig);
      if ((pick && blink) || (hinted('plat', p.no) && blink)) { cx.strokeStyle = C.amber; cx.lineWidth = 3; rr(p.x0 + 6, p.y - 22, p.x1 - p.x0 - 12, 64, 12); cx.stroke(); }
      if (hinted('plat', p.no)) bubbles.push([hn.text, p.cx, p.y - 34]);
    }

    // ราง: พื้น -> overlap ที่จอง -> เส้นทางที่ล็อก -> มีรถ (ยุควงจรตอนราง)
    for (const k in G.tracks) poly(G.tracks[k].pts, 7, C.track);
    for (const k in G.tracks) {
      const st = trackState(g, k), pts = G.tracks[k].pts;
      if (g.era.interlock && st.overlap && !st.locked) { cx.setLineDash([10, 9]); poly(pts, 7, C.route); cx.setLineDash([]); }
      if (g.era.interlock && st.locked) poly(pts, 7, C.route);
      if (g.era.tc && st.occupied) poly(pts, 7, C.occ);
      if (isDest('track', k) && blink) poly(pts, 11, C.amber);
      if (hinted('track', k)) { const c = targetCenter(L, { kind: 'track', id: k }); bubbles.push([hn.text, c.x, c.y - 30]); if (blink) poly(pts, 11, C.amber); }
    }
    // กันชนปลายทางตัน
    for (const b of G.buffers) { cx.strokeStyle = C.ink; cx.lineWidth = 5; cx.lineCap = 'round'; cx.beginPath(); cx.moveTo(b.x + b.nx * 11, b.y + b.ny * 11); cx.lineTo(b.x - b.nx * 11, b.y - b.ny * 11); cx.stroke(); }

    // ป้ายขา + สถานะตอนทางเดี่ยวของขานั้น
    const tokens = !!g.lv.token;
    for (const k in G.portals) {
      if (tokens && g.block[k]) { tokenPortal(g, G, k, hn, blink, bubbles, portalBoxes); continue; }
      const p = G.portals[k], pick = isDest('portal', k) || hinted('portal', k);
      // ป้ายเดียว: เครื่องหมายบอกสถานะตอนทางเดี่ยว + ชื่อขา (ว่าง = จุดเขียว, ให้ทางแล้ว = วงเหลือง, มีขบวน = สามเหลี่ยมแดงชี้ทิศที่ขบวนวิ่ง)
      const blk = blockState(g, k);
      cx.font = font(13); const lw = cx.measureText(p.label).width;
      const dot = blk ? 15 : 0, w = lw + dot + 18, hh = fs(13) + 10, x0 = p.east ? p.x - w : p.x, hot = pick && blink;
      cx.fillStyle = hot ? C.amber : C.paper; rr(x0, p.y - hh / 2, w, hh, hh / 2); cx.fill();
      cx.strokeStyle = pick ? C.amber : C.line; cx.lineWidth = 1.5; cx.stroke();
      if (blk) {
        const mx = x0 + 14, my = p.y;
        if (blk.state === 'free') { cx.fillStyle = C.green; cx.beginPath(); cx.arc(mx, my, 4.5, 0, 7); cx.fill(); }
        else if (blk.state === 'permit') { cx.strokeStyle = C.amber; cx.lineWidth = 2.5; cx.beginPath(); cx.arc(mx, my, 4, 0, 7); cx.stroke(); }
        else { const d = (blk.dir === 'in') === p.east ? -1 : 1; cx.fillStyle = C.red; cx.beginPath(); cx.moveTo(mx + d * 6, my); cx.lineTo(mx - d * 5, my - 6); cx.lineTo(mx - d * 5, my + 6); cx.closePath(); cx.fill(); }
      }
      cx.fillStyle = hot ? C.onAmber : C.ink; cx.font = font(13); txt(p.label, x0 + 9 + dot, p.y + 0.5, 'left');
      const box = { x: x0, y: p.y - hh / 2, w, h: hh };
      portalBoxes.push(box);
      if (hinted('portal', k)) bubbles.push([hn.text, box.x + box.w / 2, p.y + (p.y >= p.ty ? -1 : 1) * 30]);
    }
    // ประแจ: ขาที่ตั้งอยู่เป็นเส้นทึบ ขาที่ไม่ได้ตั้งเว้นช่อง ปุ่มกลมแตะได้
    for (const key in G.points) {
      const gp = G.points[key], p = g.P[key];
      const seg = (tk, a, b, w, col) => { const t = G.tracks[E[tk].track] || { pts: E[tk].pts, len: E[tk].len }; const start = Math.hypot(t.pts[0][0] - gp.x, t.pts[0][1] - gp.y) < 1; part(t.pts, t.len, start ? a : t.len - b, start ? b : t.len - a, w, col); };
      seg(gp[p.pos === 'N' ? 'R' : 'N'], 4, 26, 9, C.board);
      seg(gp[p.pos], 0, 34, 7, C.ink);
      const locked = !!(p.lock || p.ovl), fixed = !!g.lv.pointsLocked;
      cx.strokeStyle = C.muted; cx.lineWidth = 1.5; cx.beginPath(); cx.moveTo(gp.x, gp.y); cx.lineTo(gp.kx, gp.ky); cx.stroke();
      cx.fillStyle = locked ? C.route : C.paper; cx.strokeStyle = fixed ? C.muted : C.ink; cx.lineWidth = 2;
      if (fixed) cx.setLineDash([4, 4]);
      cx.beginPath(); cx.arc(gp.kx, gp.ky, 16, 0, 7); cx.fill(); cx.stroke(); cx.setLineDash([]);
      cx.fillStyle = fixed ? C.muted : C.ink; cx.font = font(12, 600); txt(key, gp.kx, gp.ky + 1);
      if (locked) { cx.strokeStyle = C.ink; cx.lineWidth = 1.8; cx.beginPath(); cx.arc(gp.kx + 18, gp.ky - 16, 4, Math.PI, 0); cx.stroke(); cx.fillStyle = C.ink; cx.fillRect(gp.kx + 13, gp.ky - 16, 10, 8); }
      if (hinted('p', key)) { ring(gp.kx, gp.ky, 26 + pulse); bubbles.push([hn.text, gp.kx, gp.ky + (gp.ky > gp.y ? 44 : -44)]); }
    }

    // เสา: ทิศ E อยู่เหนือราง ทิศ W อยู่ใต้ราง (ตำแหน่งจาก sim) ชื่อที่เห็นมาจาก label
    for (const key in G.signals) {
      const s = G.signals[key], a = g.S[key].aspect, up = s.side < 0;
      cx.strokeStyle = C.muted; cx.lineWidth = 3; cx.beginPath(); cx.moveTo(s.x, s.y + (up ? 16 : -16)); cx.lineTo(s.x, s.endY + (up ? -8 : 8)); cx.stroke();
      if (g.era.sema) {
        cx.save(); cx.translate(s.x, s.y); if (s.dir === 'W') cx.scale(-1, 1);
        cx.fillStyle = C.ink; cx.fillRect(-3, -16, 6, 34);
        cx.rotate(a === 'G' ? -0.7 : 0);
        cx.fillStyle = C.red; rr(2, -5, 30, 10, 3); cx.fill();
        cx.fillStyle = C.onColor; cx.fillRect(22, -5, 4, 10);
        cx.restore();
        cx.fillStyle = a === 'G' ? C.green : C.red; cx.beginPath(); cx.arc(s.x + (s.dir === 'W' ? 10 : -10), s.y + 10, 5, 0, 7); cx.fill();
      } else {
        cx.fillStyle = C.navy; rr(s.x - 13, s.y - 22, 26, 42, 9); cx.fill();
        cx.fillStyle = a === 'R' ? C.red : C.lampOff; cx.beginPath(); cx.arc(s.x, s.y - 10, 7, 0, 7); cx.fill();
        cx.fillStyle = a === 'G' ? C.green : C.lampOff; cx.beginPath(); cx.arc(s.x, s.y + 8, 7, 0, 7); cx.fill();
      }
      if (g.nxSel === key && blink) ring(s.x, s.y, 28);
      cx.fillStyle = C.ink; cx.font = font(13, 600); txt(sigName(g, key), s.text.x, s.text.y + 0.5, s.text.align);
      if (hinted('s', key)) { ring(s.x, s.y, 26 + pulse); bubbles.push([hn.text, s.x, s.y + (up ? -48 : 48)]); }
    }

    if (!L.bidir) { cx.fillStyle = C.muted; cx.font = font(14, 400); txt('ขบวนเข้า', 50, L.inY + 34); txt('ออกจากสถานี', G.W - 60, L.inY + 34); }

    // ขบวน: ตัวรถตามทางที่วิ่งมา หัวลูกศรบอกทิศ ป้ายบอกเลขขบวนและที่ที่ต้องไปต่อ
    // ของที่ป้ายขบวนต้องหลบ: หัวเสาและชื่อเสา ปุ่มประแจ ป้ายขา และป้ายของขบวนที่วางไปแล้ว
    const blocked = [...Object.values(G.signals).flatMap(s => s.boxes), ...Object.values(G.points).map(p => ({ x: p.kx - 19, y: p.ky - 19, w: 38, h: 38 })), ...portalBoxes,
      ...Object.values(G.plats).map(p => ({ x: p.sx, y: p.y + 15, w: L.noPlatform && L.noPlatform.includes(p.no) ? 170 : 78, h: 22 }))]; // เลขทาง
    const over = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
    for (const t of g.trains) {
      const tr = t.trail; if (tr.length < 2) continue;
      const info = trainInfo(g, t), col = trainColor(t.plat);
      const path = () => { cx.beginPath(); tr.forEach((q, i) => (i ? cx.lineTo(q.x, q.y) : cx.moveTo(q.x, q.y))); };
      cx.strokeStyle = col; cx.lineWidth = 18; cx.lineCap = 'round'; cx.lineJoin = 'round'; path(); cx.stroke();
      cx.strokeStyle = C.stripe; cx.lineWidth = 5; cx.setLineDash([8, 7]); path(); cx.stroke(); cx.setLineDash([]);
      const h = tr[tr.length - 1], h2 = tr[Math.max(0, tr.length - 4)], a = Math.atan2(h.y - h2.y, h.x - h2.x);
      cx.save(); cx.translate(h.x, h.y); cx.rotate(a);
      cx.fillStyle = C.navy; cx.beginPath(); cx.moveTo(7, 0); cx.lineTo(-4, -6.5); cx.lineTo(-4, 6.5); cx.closePath(); cx.fill(); cx.restore();
      const mid = tr[Math.floor(tr.length / 2)];
      const want = t.exp ? 'ด่วน' : t.state === 'arriving' ? `เข้าทาง ${t.plat}` : '';
      const lab = info.to && L.portals[info.to] ? L.portals[info.to].label : '', to = !lab || /^ไป/.test(lab) ? lab : `ไป${lab}`;
      // ขบวนที่ถือห่วง: เว้นที่หน้าป้ายไว้วาดห่วงเหลือง (ป้ายอยู่ในจอเสมอ แม้ตัวรถยังโผล่ไม่พ้นขอบ)
      const text = (info.token ? '\u2003\u2002' : '') + `${t.id} · ${t.state === 'arriving' ? want : t.state === 'dwell' ? 'กำลังจอด' : (t.exp ? 'ด่วน ' : '') + (to || 'พร้อมออก')}`;
      // ป้ายอยู่เหนือขบวน ถ้าตรงนั้นทับของที่ต้องแตะหรือป้ายอื่น ลองใต้ขบวน แล้วเลื่อนไปตามแนวขบวน เลือกที่ที่ทับน้อยที่สุด
      cx.font = font(12.5, 600); const bw = cx.measureText(text).width + 18, bh = fs(12.5) + 10;
      let bx = mid.x, by = mid.y - 27, bestScore = Infinity;
      for (const [dx, dy] of [[0, -27], [0, 27], [-46, -27], [46, -27], [-46, 27], [46, 27], [-92, -27], [92, -27], [-92, 27], [92, 27], [0, -50], [0, 50]]) {
        const x = Math.max(G.view.x0 + bw / 2 + 2, Math.min(G.view.x1 - bw / 2 - 2, mid.x + dx)), y = mid.y + dy;
        if (y - bh / 2 < G.view.y0 || y + bh / 2 > G.view.y1) continue;
        const r = { x: x - bw / 2 - 3, y: y - bh / 2 - 3, w: bw + 6, h: bh + 6 }, score = blocked.reduce((n, b) => n + over(r, b), 0);
        if (score < bestScore - 0.5) { bestScore = score; bx = x; by = y; }
        if (score === 0) break;
      }
      blocked.push({ x: bx - bw / 2, y: by - bh / 2, w: bw, h: bh });
      const lb = tag(text, bx, by, { bg: C.paper, fg: C.ink, border: info.late ? C.red : col, size: 12.5, weight: 600, pad: 9 });
      if (info.token) tokenRing(lb.x + 16, by, 5.5); // ห่วงทางสะดวกที่ขบวนถืออยู่
      if (info.late) { cx.strokeStyle = C.red; cx.lineWidth = 3; cx.beginPath(); cx.arc(h.x, h.y, 13, 0, 7); cx.stroke(); }
    }

    // คำใบ้: ข้อความอยู่บนสุด ไม่ให้หลุดกรอบ
    for (const [s, x, y] of bubbles) {
      cx.font = font(14, 600); const w = cx.measureText(s).width + 18, hh = fs(14) + 12;
      const bx = Math.max(G.view.x0 + w / 2 + 4, Math.min(G.view.x1 - w / 2 - 4, x)), by = Math.max(G.view.y0 + hh / 2 + 2, Math.min(G.view.y1 - hh / 2 - 2, y));
      tag(s, bx, by, { bg: C.amber, fg: C.onAmber, border: null, size: 14, weight: 600, pad: 9, h: hh });
    }
  }
  // ห่วงทางสะดวก: วงกลมเหลืองหนา (สีเดียวกับคำใบ้ แต่เส้นหนากว่าและมีขอบเข้ม อ่านได้ในโหมดมืด)
  function tokenRing(x, y, r) { cx.strokeStyle = C.ink; cx.lineWidth = 5.5; cx.beginPath(); cx.arc(x, y, r, 0, 7); cx.stroke(); cx.strokeStyle = C.amber; cx.lineWidth = 3.5; cx.stroke(); }

  // ป้ายขาของด่านที่มีห่วง = เครื่องทางสะดวก: เครื่องหมายบอกว่าห่วงอยู่ไหน + ชื่อขา, ปุ่ม "ให้ทาง" เมื่อสถานีข้างเคียงขอทาง
  //   ว่าง (ห่วงอยู่ในเครื่อง) = จุดเขียว, ห่วงอยู่ที่สถานี = ห่วงเหลือง, ห่วงไปกับขบวน = สามเหลี่ยมแดงชี้ทิศที่ขบวนวิ่ง
  function tokenPortal(g, G, k, hn, blink, bubbles, portalBoxes) {
    const p = G.portals[k], blk = blockState(g, k), b = tokenBoxes(G, k), tb = b.token, hot = hn && hn.kind === 'token' && hn.k === k;
    cx.fillStyle = hot && blink ? C.amber : C.paper; rr(tb.x, tb.y, tb.w, tb.h, tb.h / 2); cx.fill();
    cx.strokeStyle = hot ? C.amber : blk.token === 'station' ? C.amber : C.ink; cx.lineWidth = blk.token === 'station' ? 2.5 : 1.8; cx.stroke();
    const mx = tb.x + 16, my = tb.y + tb.h / 2;
    if (blk.token === 'station') tokenRing(mx, my, 6.5);
    else if (blk.state === 'free') { cx.fillStyle = C.green; cx.beginPath(); cx.arc(mx, my, 5, 0, 7); cx.fill(); }
    else { const d = (blk.dir === 'in') === p.east ? -1 : 1; cx.fillStyle = C.red; cx.beginPath(); cx.moveTo(mx + d * 6, my); cx.lineTo(mx - d * 5, my - 6); cx.lineTo(mx - d * 5, my + 6); cx.closePath(); cx.fill(); }
    cx.fillStyle = hot && blink ? C.onAmber : C.ink; cx.font = font(13); txt(p.label, tb.x + 28, my + 0.5, 'left');
    portalBoxes.push(tb);
    if (hot) bubbles.push([hn.text, tb.x + tb.w / 2, my + (my >= p.ty ? -1 : 1) * 36]);
    if (blk.ask !== null) {
      const ab = b.accept, on = hn && hn.kind === 'accept' && hn.k === k;
      cx.fillStyle = blink || !on ? C.amber : C.paper; rr(ab.x, ab.y, ab.w, ab.h, ab.h / 2); cx.fill();
      cx.strokeStyle = C.ink; cx.lineWidth = 1.8; cx.stroke();
      cx.fillStyle = blink || !on ? C.onAmber : C.ink; cx.font = font(13, 600); txt(`ให้ทาง ${blk.ask}`, ab.x + ab.w / 2, ab.y + ab.h / 2 + 0.5);
      portalBoxes.push(ab);
      const ay = ab.y + ab.h / 2;
      const away = ab.y > tb.y + 4 ? 1 : ab.y < tb.y - 4 ? -1 : ay >= p.ty ? -1 : 1; // ไม่ให้ข้อความคำใบ้บังป้ายขา
      if (on) bubbles.push([hn.text, ab.x + ab.w / 2, ay + away * 36]);
    }
  }
  function ring(x, y, r) { cx.strokeStyle = C.amber; cx.lineWidth = 3.5; cx.beginPath(); cx.arc(x, y, r, 0, 7); cx.stroke(); }

  return {
    draw, refreshColors,
    // จุดในกล่อง canvas (px ของ CSS นับจากมุมซ้ายบนของ canvas ในพิกัดเวที) <-> พิกัดของแผง
    toBoard: (x, y) => ({ x: (x - ox) / K, y: (y - oy) / K }),
    toLocal: (x, y) => ({ x: x * K + ox, y: y * K + oy }),
    get scale() { return K; },
  };
}
