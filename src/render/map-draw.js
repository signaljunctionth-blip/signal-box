// ตัววาดแผนที่ประเทศไทยบน canvas: ขอบประเทศ เส้นจังหวัด แนวรถไฟแยกสีตามสาย สถานีอ้างอิง และสายน้ำตกแบบละเอียดเมื่อซูมเข้า
// - เส้นทั้งหมดแปลงเป็น Path2D ในพิกัดโลกครั้งเดียว แต่ละเฟรมแค่ตั้ง transform ตามกล้องแล้วลากเส้น
// - สีทุกสีอ่านจาก CSS variable (โหมดมืดเปลี่ยนที่ CSS ที่เดียว) เรียก refreshColors() เมื่อธีมเปลี่ยน
// - จุดสถานีเส้นทางสอนที่แตะได้เป็นปุ่ม DOM ของ ui/screen-map.js ไม่ได้วาดที่นี่
import { makeProjection, toScreen, placeLabels, KM_PER_UNIT } from './map-camera.js';

const VARS = {
  sea: '--map-sea', land: '--map-land', coast: '--map-coast', prov: '--map-prov', ink: '--map-ink', faint: '--map-faint',
  northeast: '--ln-northeast', north: '--ln-north', south: '--ln-south', maeklong: '--ln-maeklong', east: '--ln-east', west: '--ln-west', other: '--ln-other',
};
// สถานีอ้างอิงที่ให้ป้ายชื่อขึ้นก่อนเมื่อที่ไม่พอ (ที่เหลือเรียงตามไฟล์)
const FIRST = ['กรุงเทพอภิวัฒน์', 'เชียงใหม่', 'หนองคาย', 'อุบลราชธานี', 'ชุมทางหาดใหญ่', 'สุไหงโก-ลก', 'นครราชสีมา', 'พิษณุโลก', 'สุราษฎร์ธานี', 'อรัญประเทศ', 'ขอนแก่น', 'ชุมพร', 'หัวหิน', 'นครสวรรค์', 'นครลำปาง', 'พัทยา', 'ตรัง', 'นครศรีธรรมราช', 'อุดรธานี', 'สุรินทร์'];
// เริ่มแสดงที่หยุดรถของสายน้ำตกเมื่อ 1 กม. กว้างตั้งแต่กี่ px
export const DETAIL_PX_PER_KM = 3.2;
// ลายเส้นของแต่ละสาย (px บนจอ) ไม่ใส่ = เส้นทึบ ใช้คู่กับสีเพื่อให้แยกสายได้โดยไม่พึ่งสีอย่างเดียว (รายการ "สายรถไฟ" ใช้ชุดเดียวกัน)
export const LINE_DASH = { east: [9, 5], maeklong: [2, 5], north: [14, 4, 3, 4] };
// เริ่มแสดงป้ายชื่อสายบนแผนที่เมื่อ 1 กม. กว้างตั้งแต่กี่ px
export const LINE_LABEL_PX_PER_KM = 0.3;

// opts.gameGroups = id ของสายที่เป็นการจัดกลุ่มของเกมเอง ไม่ใช่การแบ่งสายทางการ (ป้ายจะบอกไว้)
export function createMapRenderer(canvas, map, styleEl, opts = {}) {
  const ctx = canvas.getContext('2d');
  const proj = makeProjection(map.bbox);
  const world = { w: proj.w, h: proj.h };
  const line = pts => { const p = new Path2D(); pts.forEach(([lon, lat], i) => { const x = proj.x(lon), y = proj.y(lat); if (i) p.lineTo(x, y); else p.moveTo(x, y); }); return p; };

  const country = new Path2D();
  for (const poly of map.country.polygons) { country.addPath(line(poly)); }
  const borders = new Path2D();
  for (const b of map.provinces.borders) borders.addPath(line(b));
  const rail = {};
  for (const r of map.rail) { const id = r.line && map.lines[r.line] ? r.line : 'other'; (rail[id] ||= new Path2D()).addPath(line(r.pts)); }
  const route = line(map.namtok.path), extension = line(map.namtok.extension || []);
  // จุดวางป้ายชื่อสาย: กึ่งกลางของแนวทางที่ยาวที่สุดของสายนั้น
  const lineLabels = [];
  for (const id in map.lines) {
    const longest = map.rail.filter(r => r.line === id).sort((a, b) => b.km - a.km)[0];
    if (!longest) continue;
    const m = longest.pts[Math.floor(longest.pts.length / 2)];
    lineLabels.push({ id, name: map.lines[id].name_th + (opts.gameGroups && opts.gameGroups.includes(id) ? ' (กลุ่มในเกม)' : ''), x: proj.x(m[0]), y: proj.y(m[1]) });
  }

  const rank = name => { const i = FIRST.indexOf(name); return i < 0 ? FIRST.length : i; };
  const landmarks = map.landmarks.map((l, i) => ({ name: l.name_th, x: proj.x(l.lon), y: proj.y(l.lat), i }))
    .sort((a, b) => rank(a.name) - rank(b.name) || a.i - b.i);
  const tutorial = new Set(map.namtok.tutorial_route);
  const stops = map.namtok.stations.filter(s => !tutorial.has(s.id) && !s.beyond_terminus)
    .map(s => ({ name: s.name_th, x: proj.x(s.lon), y: proj.y(s.lat), station: s.kind === 'station' }))
    .sort((a, b) => b.station - a.station);

  let C = {}, W = 0, H = 0, dpr = 1;
  const refreshColors = () => {
    const cs = getComputedStyle(styleEl);
    for (const key in VARS) C[key] = cs.getPropertyValue(VARS[key]).trim() || '#888';
    C.display = cs.getPropertyValue('--display').trim() || 'sans-serif';
    C.body = cs.getPropertyValue('--body').trim() || 'sans-serif';
  };
  refreshColors();

  function resize(w, h, ratio) {
    W = w; H = h; dpr = ratio;
    const pw = Math.round(w * dpr), ph = Math.round(h * dpr);
    if (canvas.width !== pw || canvas.height !== ph) { canvas.width = pw; canvas.height = ph; }
  }

  // ป้ายชื่อบน canvas: ตัวอักษรมีขอบสีพื้นรองให้อ่านออกเมื่อทับเส้น
  function label(text, x, y, color) {
    ctx.lineWidth = 3.5; ctx.strokeStyle = C.land; ctx.lineJoin = 'round';
    ctx.strokeText(text, x, y); ctx.fillStyle = color; ctx.fillText(text, x, y);
  }
  // maxLabels = จำนวนป้ายชื่อสูงสุด (ตามลำดับความสำคัญ), onlyLabelled = วาดจุดเฉพาะอันที่มีป้าย (ตอนซูมออกจนจุดแน่น)
  function dots(items, cam, view, r, fill, stroke, font, color, occupied, maxLabels = Infinity, onlyLabelled = false) {
    const vis = [];
    for (const it of items) {
      const s = toScreen(cam, view, it.x, it.y);
      if (s.x < -20 || s.y < -20 || s.x > W + 20 || s.y > H + 20) continue;
      vis.push({ it, s });
    }
    ctx.font = font; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    const rects = vis.map(({ it, s }) => ({ x: s.x - r - 2, y: s.y - 10, w: ctx.measureText(it.name).width + 2 * r + 12, h: 20 }));
    const keep = placeLabels(rects, occupied).slice(0, maxLabels), kept = new Set(keep);
    ctx.fillStyle = fill; ctx.strokeStyle = stroke; ctx.lineWidth = 1.5;
    vis.forEach(({ it, s }, i) => { if (onlyLabelled && !kept.has(i)) return; const rr = it.station === false ? r - 1 : r; ctx.beginPath(); ctx.arc(s.x, s.y, rr, 0, 6.2832); ctx.fill(); ctx.stroke(); });
    for (const i of keep) { label(vis[i].it.name, vis[i].s.x + r + 4, vis[i].s.y + 0.5, color); occupied.push(rects[i]); }
  }

  // cam: กล้อง, view: { w, h }, opts.occupied: กรอบของปุ่ม DOM ที่ป้ายบน canvas ต้องหลบ (พิกัดเวที)
  function draw(cam, view, o = {}) {
    const k = cam.k, tx = view.w / 2 - cam.x * k, ty = view.h / 2 - cam.y * k;
    const pxPerKm = k / KM_PER_UNIT, detail = pxPerKm >= DETAIL_PX_PER_KM;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = C.sea; ctx.fillRect(0, 0, W, H);

    ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * tx, dpr * ty);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.setLineDash([]);
    const px = n => n / k;
    ctx.fillStyle = C.land; ctx.fill(country);
    ctx.strokeStyle = C.prov; ctx.lineWidth = px(1); ctx.stroke(borders);
    ctx.strokeStyle = C.coast; ctx.lineWidth = px(1.5); ctx.stroke(country);

    // แนวรถไฟ: สายที่ยังไม่เปิดวาดบางและจางกว่าเส้นทางสอน
    const thin = Math.min(3, 1.8 + pxPerKm * 0.25);
    ctx.globalAlpha = 0.9; ctx.lineWidth = px(thin);
    for (const id of ['other', 'maeklong', 'east', 'south', 'north', 'northeast', 'west']) {
      if (!rail[id]) continue;
      ctx.strokeStyle = C[id]; ctx.setLineDash((LINE_DASH[id] || []).map(px)); ctx.stroke(rail[id]);
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    if (detail && map.namtok.extension) {
      ctx.strokeStyle = C.faint; ctx.lineWidth = px(2); ctx.setLineDash([px(4), px(5)]); ctx.stroke(extension); ctx.setLineDash([]);
    }
    // เส้นทางสอน: เส้นละเอียดของสายน้ำตก มีขอบรองให้เด่น
    const thick = Math.min(5, 3 + pxPerKm * 0.3);
    ctx.strokeStyle = C.land; ctx.lineWidth = px(thick + 3.5); ctx.stroke(route);
    ctx.strokeStyle = C.west; ctx.lineWidth = px(thick); ctx.stroke(route);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const occupied = (o.occupied || []).slice();
    // ป้ายชื่อสาย (ตัวช่วยที่ไม่พึ่งสี) ขึ้นเมื่อซูมพอ และหลบปุ่ม/ป้ายที่มีอยู่
    if (pxPerKm >= LINE_LABEL_PX_PER_KM) {
      ctx.font = `500 12px ${C.display}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      for (const l of lineLabels) {
        const s = toScreen(cam, view, l.x, l.y);
        if (s.x < 0 || s.y < 0 || s.x > W || s.y > H) continue;
        const w = ctx.measureText(l.name).width, r = { x: s.x + 6, y: s.y - 22, w: w + 22, h: 20 };
        if (placeLabels([r], occupied).length !== 1) continue;
        occupied.push(r);
        ctx.fillStyle = C.land; ctx.globalAlpha = 0.88; ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(r.x, r.y, r.w, r.h, 10); else ctx.rect(r.x, r.y, r.w, r.h); ctx.fill(); ctx.globalAlpha = 1;
        ctx.strokeStyle = C[l.id]; ctx.lineWidth = 3; ctx.setLineDash(LINE_DASH[l.id] ? LINE_DASH[l.id].map(n => n * 0.5) : []); ctx.beginPath(); ctx.moveTo(r.x + 5, r.y + 10); ctx.lineTo(r.x + 15, r.y + 10); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = C.ink; ctx.fillText(l.name, r.x + 18, r.y + 10.5);
      }
    }
    if (detail) dots(stops, cam, view, 3.5, C.land, C.west, `400 12px ${C.body}`, C.ink, occupied);
    // ซูมออก: ป้ายสถานีอ้างอิงขึ้นเฉพาะอันสำคัญ และไม่วาดจุดที่ไม่มีป้าย (แถวกรุงเทพจุดแน่นมากบนจอมือถือ)
    const maxLm = pxPerKm < 0.25 ? 7 : pxPerKm < 0.4 ? 12 : pxPerKm < 0.8 ? 24 : Infinity;
    dots(landmarks, cam, view, pxPerKm < 0.6 ? 2.2 : 3, C.land, C.ink, `500 12px ${C.display}`, C.ink, occupied, maxLm, pxPerKm < 0.25);
  }

  return { draw, resize, refreshColors, world, proj };
}
