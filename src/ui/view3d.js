// ชั้นหน้าจอของฉาก 3 มิติในหน้าเล่น: canvas WebGL + ป้ายแตะ (เสา ประแจ ปลายทาง เครื่องทางสะดวก) + กล้องอิสระ (หมุน ซูม เลื่อน)
// โหลด three.js และชิ้นงานแบบแยกก้อน (dynamic import) เฉพาะตอนผู้เล่นเปิด 3 มิติ ระหว่างรอยังเห็นแผงผังเส้นตามปกติ
// ไม่แตะสถานะเกม: ส่งคำสั่งออกทาง onPress(target) แบบเดียวกับแผงผังเส้น
import { readPref, writePref, initialTier, createGovernor, tierOf, TIERS } from '../render3d/quality.js';
import { destinations } from '../render/panel-geom.js';
import { blockState } from '../sim/index.js';
import { esc } from './station-sheet.js';

// สถานีที่มีฉาก 3 มิติ: ครบ 5 สถานีของเส้นทางสอน (WP10) ผังสมมุติและโหมดประวัติศาสตร์คงเป็นแผงผังเส้น 2 มิติ
export const SCENE_STATIONS = ['tha-kilen', 'wang-pho', 'nam-tok', 'kanchanaburi', 'nong-pla-duk-jn'];
export const has3D = id => SCENE_STATIONS.includes(id);
export const pref3D = () => readPref() || {};
// เครื่องนี้มี WebGL ไหม (ตรวจครั้งเดียว ไม่โหลด three.js) ใช้ตัดสินค่าเริ่มต้น 3 มิติ
let glOk = null;
export function canWebGL() {
  if (glOk === null) { try { const c = document.createElement('canvas'), gl = c.getContext('webgl2') || c.getContext('webgl'); glOk = !!gl; if (gl) { const x = gl.getExtension('WEBGL_lose_context'); if (x) x.loseContext(); } } catch { glOk = false; } }
  return glOk;
}
// เปิดฉาก 3 มิติตอนเข้าภารกิจไหม: ผู้เล่นเคยเลือกไว้ใช้ค่านั้น ยังไม่เคยเลือก = 3 มิติเมื่อเครื่องรองรับ (WP10)
export const want3D = () => { const on = pref3D().on; return on === undefined ? canWebGL() : !!on; };
export const savePref3D = v => writePref(undefined, { ...pref3D(), ...v });
export { TIERS };

const COLOR_VARS = ['--t1', '--t2', '--t3', '--exp', '--route', '--occ', '--scene-exposure', '--scene-fog', '--scene-sun', '--scene-env', '--scene-tint'];
const TAP = 44, DRAG = 8;

export function mountView3D(board, { stage, getGame, onPress, getHint, say, station }) {
  const cv = document.createElement('canvas'), chips = document.createElement('div'), load = document.createElement('div'), home = document.createElement('button');
  cv.className = 'v3d'; cv.setAttribute('aria-label', 'ฉากสถานี 3 มิติ แตะป้ายชื่อเสาหรือประแจเพื่อสั่งการ ลากเพื่อหมุนมุมมอง สองนิ้วเพื่อซูมและเลื่อน');
  chips.className = 'v3d-chips'; load.className = 'v3d-load'; load.setAttribute('role', 'status'); load.textContent = 'กำลังสร้างฉาก 3 มิติ';
  home.className = 'btn sm v3d-home'; home.type = 'button'; home.textContent = 'มุมมาตรฐาน'; home.hidden = true;
  let view = null, active = false, alive = true, dirty = true, gov = null, chipEls = new Map(), bubble = null, failed = false;
  const colors = () => { const cs = getComputedStyle(stage.el), o = {}; for (const v of COLOR_VARS) { const x = cs.getPropertyValue(v).trim(); if (x) o[v] = x; } return o; };
  const size = () => ({ w: cv.clientWidth, h: cv.clientHeight });   // canvas เว้นขอบปลอดภัยเหมือนแผงผังเส้น ชั้นป้ายแตะก็เว้นเท่ากัน

  let ready = null;
  function ensure() {
    if (ready) return ready;
    const ov = board.querySelector('.pl-ov');   // การ์ดของหน้าเล่นต้องอยู่บนสุดเสมอ
    for (const el of [cv, chips, home, load]) board.insertBefore(el, ov);
    const g = getGame(), pref = pref3D();
    const tier = initialTier({ coarse: matchMedia('(pointer: coarse)').matches, w: stage.layout.w, saved: pref.tier });
    ready = import('../render3d/scene3d.js')
      .then(m => m.createScene3D(cv, { L: g.L, era: g.era, tier, colors: colors(), stationName: { th: station.name_th || g.L.name || '', en: station.name_en || '' } }))
      .then(v => {
        if (!alive) { v.dispose(); return null; }
        view = v; gov = createGovernor(v.tier); load.remove(); const s = size(); view.resize(s.w, s.h); dirty = true; return v;
      })
      .catch(e => {
        failed = true; load.remove(); cv.remove(); chips.remove(); home.remove();
        say(e && e.message === 'webgl' ? 'เครื่องนี้แสดงภาพ 3 มิติไม่ได้ ใช้แผงผังเส้นแทน' : 'โหลดฉาก 3 มิติไม่สำเร็จ ใช้แผงผังเส้นแทน', 'bad');
        console.error(e); return null;
      });
    return ready;
  }

  /* ---------- ป้ายแตะ ---------- */
  function chipFor(a) {
    const key = a.target.kind + ':' + (a.target.id ?? a.target.no);
    let el = chipEls.get(key);
    if (!el) {
      el = document.createElement('button'); el.type = 'button'; el.className = 'v3d-chip k-' + a.target.kind; el.dataset.key = key;
      el.innerHTML = '<span class="pill"><i></i><b></b><small></small></span>';
      el.addEventListener('click', e => { e.stopPropagation(); if (performance.now() - dragEnd < 250) return; onPress(a.target); dirty = true; });   // เพิ่งลากกล้องจบ = ไม่ใช่การแตะ
      chips.append(el); chipEls.set(key, el);
    }
    return el;
  }
  const isHinted = (hn, t) => !!hn && ((hn.kind === 's' && t.kind === 'signal' && hn.k === t.id) || (hn.kind === 'p' && t.kind === 'point' && hn.k === t.id) || (hn.kind === 'plat' && t.kind === 'platform' && hn.k === t.no) || (hn.kind === t.kind && hn.k === t.id));
  // ด่านที่มีห่วง: ป้ายขา (เครื่องทางสะดวก) เกาะขอบจอด้านของขานั้น ระดับเดียวกับราง แสดงว่าห่วงอยู่ไหน
  // และปุ่ม "ให้ทาง N" ใต้ป้ายเมื่อสถานีข้างเคียงขอทาง (ตรงกับแผงผังเส้น)
  const TOKEN_TH = { station: 'ห่วงอยู่ที่สถานี', train: 'ห่วงไปกับขบวน', away: 'มีขบวนในตอน' };
  function layoutTokens(g, w, h, hn, used, seen) {
    let hintEl = null;
    if (!g.lv.token || !g.block) return null;
    const ports = new Map(view.anchors().filter(a => a.target.kind === 'portal').map(a => [a.target.id, a]));
    for (const k in g.L.portals) {
      const blk = blockState(g, k), a = ports.get(k); if (!blk || !a) continue;
      const east = g.L.portals[k].side === 'E', q = view.project(a.base, w, h);
      let y = Math.max(28, Math.min(h - (east && view.camera.zoomed ? 112 : 70), q.on ? q.y : h / 2));   // ป้ายขาและปุ่มให้ทางไม่ลงไปใต้ปุ่ม "มุมมาตรฐาน"
      const x = east ? w - 8 : 8;
      const place = (kind, yy, text, cls, aria) => {
        const t = { kind, id: k }, key = kind + ':' + k, el = chipFor({ target: t }); seen.add(key);
        el.style.transform = `translate(${x}px, ${yy.toFixed(1)}px)${east ? ' translateX(-100%)' : ''}`;
        const pill = el.firstChild, label = pill.children[1];
        if (label.textContent !== text) label.textContent = text;
        pill.children[0].hidden = kind !== 'token'; pill.children[2].textContent = '';
        el.className = `v3d-chip k-${kind} ${east ? 'east' : 'west'} ${cls}`;
        el.setAttribute('aria-label', aria);
        used.push([east ? x - 60 : x + 60, yy]);
        if (isHinted(hn, t)) { el.classList.add('hint'); hintEl = [east ? x - 70 : x + 70, yy, hn.text]; }
      };
      const st = blk.token || 'free', arrow = st === 'train' || st === 'away' ? (((blk.dir === 'in') === east) ? ' tk-l' : ' tk-r') : '';
      place('token', y, g.L.portals[k].label || k, `tk-${st}${arrow}`, `เครื่องทางสะดวก ${g.L.portals[k].label || k} ${TOKEN_TH[st] || 'ห่วงอยู่ในเครื่อง'}`);
      if (blk.ask !== null) place('accept', y + 42, `ให้ทาง ${blk.ask}`, '', `ให้ทางขบวน ${blk.ask} จาก${String(g.L.portals[k].label || k).replace(/^ไป/, '')}`);
    }
    return hintEl;
  }
  function layoutChips() {
    const g = getGame(), { w, h } = size(), hn = getHint(), dest = destinations(g), destKeys = new Set(dest.map(t => t.kind + ':' + (t.id ?? t.no)));
    const used = [], seen = new Set();
    let hintEl = layoutTokens(g, w, h, hn, used, seen);
    const homeOn = view.camera.zoomed;   // ปุ่ม "มุมมาตรฐาน" มุมขวาล่าง: ป้ายห้ามไปอยู่ใต้ปุ่ม (แตะแล้วโดนปุ่มแทน)
    for (const a of view.anchors()) {
      const k = a.target.kind, key = k + ':' + (a.target.id ?? a.target.no), isDest = destKeys.has(key);
      const show = k === 'signal' || k === 'point' || isDest;
      if (!show) continue;
      // ป้ายอยู่เหนือหัวเสา ถ้าหัวเสาพ้นขอบบนให้เกาะขอบบนตรงเสา ถ้าโคนเสาอยู่นอกจอ (ซูมเข้าอยู่) ไม่แสดงป้าย
      // ยกเว้นเป้าของคำใบ้และปลายทางที่ต้องแตะ: เกาะขอบจอด้านที่เป้าอยู่ ผู้เล่นจะได้รู้ว่าต้องแตะอะไรแม้มองไม่เห็น (ภารกิจไม่มีคำใบ้ก็ยังเห็นปลายทาง)
      const p = view.project(a.pos, w, h), q = view.project(a.base, w, h), hinted = isHinted(hn, a.target);
      const off = !q.on || q.x < -8 || q.x > w + 8 || q.y < 0 || q.y > h + 60;
      if (off && !hinted && !isDest) continue;
      const el = chipFor(a); seen.add(key);
      const pill = el.firstChild, dot = pill.children[0], label = pill.children[1], sub = pill.children[2];
      let state = '', text = a.label, subT = '';
      if (k === 'signal') { const s = g.S[a.target.id]; text = s.label || a.target.id; state = s.aspect === 'G' ? 'go' : 'stop'; if (g.nxSel === a.target.id) state += ' sel'; }
      else if (k === 'point') { const p_ = g.P[a.target.id]; subT = p_.pos === 'N' ? 'ตรง' : 'แยก'; state = (p_.lock || p_.ovl ? 'locked ' : '') + (g.lv.pointsLocked ? 'fixed' : ''); }
      else state = 'dest';
      if (label.textContent !== text || sub.textContent !== subT || el._w === undefined) { label.textContent = text; sub.textContent = subT; dot.hidden = k !== 'signal'; el._w = 0; }
      // ความกว้างจริงของป้าย (วัดครั้งเดียวต่อข้อความ) กันป้ายกว้างล้นขอบจอ: ตัวป้ายเริ่มที่ x - 30 (margin ใน CSS)
      if (!el._w) { el.hidden = false; el._w = el.offsetWidth || 60; }
      const lo = 34, hi = w - el._w + 26;
      let x = Math.max(lo, Math.min(hi, q.on ? q.x : (q.x < w / 2 ? hi : lo)));
      const yMax = homeOn && x + el._w - 30 > w - 150 ? h - 70 : h - 26;
      let y = Math.max(28, Math.min(yMax, Math.min(p.on ? p.y - 18 : 28, q.y - 30)));
      if (off) y = Math.max(28, Math.min(yMax, q.y));
      const clash = yy => used.some(u => Math.abs(u[0] - x) < 74 && Math.abs(u[1] - yy) < 40);   // ป้ายประแจกว้างราว 68 px
      for (let n = 1; n < 6 && clash(y); n++) { const up = y - 40 * n, dn = y + 40 * n; if (up >= 28 && !clash(up)) { y = up; break; } if (dn <= yMax && !clash(dn)) { y = dn; break; } }   // หลบป้ายที่วางไปแล้ว
      used.push([x, y]);
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      a._xy = [x, y];
      el.className = `v3d-chip k-${k} ${state}`;
      el.setAttribute('aria-label', k === 'signal' ? `เสา ${text} ${state.startsWith('go') ? 'ทางเปิด' : 'ห้าม'}` : k === 'point' ? `ประแจ ${text} ${subT}` : `ปลายทาง ${text}`);
      if (hinted) { el.classList.add('hint'); hintEl = [x, y, hn.text]; }
    }
    for (const [key, el] of chipEls) el.hidden = !seen.has(key);
    // ข้อความคำใบ้ข้างป้ายที่ต้องแตะ
    if (hintEl && hintEl[2]) {
      if (!bubble) { bubble = document.createElement('div'); bubble.className = 'v3d-bubble'; chips.append(bubble); }
      const [x, y, t] = hintEl, bx = Math.max(90, Math.min(w - 90, x));
      if (bubble.textContent !== t) bubble.textContent = t;
      // ใต้ป้ายเป็นหลัก ถ้าทับป้ายอื่นมากกว่าตอนวางเหนือป้ายให้ย้ายขึ้น (กล่องกว้าง 180 px, ป้ายกว้างราว 68 สูง 44 เริ่มที่ x - 30)
      const bh = bubble.offsetHeight || 28, over = top => used.reduce((n, u) => (u[0] === x && u[1] === y) ? n
        : n + Math.max(0, Math.min(bx + 90, u[0] + 38) - Math.max(bx - 90, u[0] - 30)) * Math.max(0, Math.min(top + bh, u[1] + 22) - Math.max(top, u[1] - 22)), 0);
      const below = y < h - 80 && (y - 64 < 0 || over(y + 30) <= over(y - 34 - bh));
      bubble.style.transform = `translate(${bx.toFixed(1)}px, ${(below ? y + 30 : y - 30).toFixed(1)}px)`;
      bubble.classList.toggle('below', below); bubble.hidden = false;
    } else if (bubble) bubble.hidden = true;
    home.hidden = !view.camera.zoomed;
  }

  /* ---------- การแตะ ลาก ซูม บน canvas ----------
     แตะ (ขยับไม่เกิน DRAG px) = สั่งเสาหรือประแจที่ใกล้จุดแตะ, ลากนิ้วเดียว/ลากเมาส์ซ้าย = หมุนกล้อง,
     สองนิ้ว = บีบซูมและเลื่อน, ลากเมาส์ขวา (หรือ Shift + ลาก) = เลื่อน, ล้อเมาส์ = ซูม
     เริ่มลากบนป้ายแตะก็หมุนกล้องได้ ป้ายนั้นไม่ถูกกด (ลากกล้องต้องไม่กดเสาหรือประแจโดยไม่ตั้งใจ) */
  const ptrs = new Map(); let downAt = null, moved = false, pinch = 0, mid = null, mode = 'orbit', chipDown = null, dragEnd = -1e9;
  const local = e => { const p = stage.toStage(e.clientX, e.clientY), r = stage.rectOf(cv); return { x: p.x - r.x, y: p.y - r.y }; };
  const mean = () => { const [a, b] = [...ptrs.values()]; return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; };
  function tapAt(x, y) {
    const { w, h } = size(), g = getGame(); let best = null, bd = TAP;
    const dest = new Set(destinations(g).map(t => t.kind + ':' + (t.id ?? t.no)));
    for (const a of view.anchors()) {
      const k = a.target.kind; if (k !== 'signal' && k !== 'point' && !dest.has(k + ':' + (a.target.id ?? a.target.no))) continue;
      for (const pos of [a.pos, a.base]) { const p = view.project(pos, w, h); if (!p.on) continue; const d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; best = a.target; } }
    }
    if (best) { onPress(best); dirty = true; }
  }
  function begin(e, p) {
    ptrs.set(e.pointerId, p);
    if (ptrs.size === 1) { downAt = p; moved = false; mode = e.pointerType === 'mouse' && (e.button === 2 || e.button === 1 || e.shiftKey) ? 'pan' : 'orbit'; }
    else { moved = true; const [a, b] = [...ptrs.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); mid = mean(); }
  }
  const onDown = e => {
    if (!view || (e.pointerType === 'mouse' && e.button > 2)) return;
    e.preventDefault(); try { cv.setPointerCapture(e.pointerId); } catch { /* ไม่เป็นไร */ }
    begin(e, local(e));
  };
  const onMove = e => {
    if (!view || !ptrs.has(e.pointerId)) return;
    const p = local(e), q = ptrs.get(e.pointerId), h = size().h; ptrs.set(e.pointerId, p);
    if (ptrs.size >= 2) {
      const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y), m = mean();
      if (pinch > 0 && d > 0) view.camera.zoom(pinch / d);
      if (mid) view.camera.pan(m.x - mid.x, m.y - mid.y, h);
      pinch = d; mid = m; dirty = true; return;
    }
    if (!moved && downAt && Math.hypot(p.x - downAt.x, p.y - downAt.y) > DRAG) moved = true;
    if (!moved || mode === 'none') return;
    if (mode === 'pan') view.camera.pan(p.x - q.x, p.y - q.y, h); else view.camera.orbit(p.x - q.x, p.y - q.y, h);
    dirty = true;
  };
  const onUp = e => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.delete(e.pointerId);
    if (e.type === 'pointerup' && !moved && downAt && ptrs.size === 0 && mode === 'orbit') { const g = getGame(); if (g && g.state === 'play') tapAt(downAt.x, downAt.y); }
    if (moved) dragEnd = performance.now();
    if (ptrs.size === 1) { pinch = 0; mid = null; mode = 'none'; }   // ยกนิ้วหนึ่งจากการบีบ: นิ้วที่เหลือไม่หมุนกล้องจนกว่าจะยกออก (กันภาพกระตุก)
    if (!ptrs.size) { downAt = null; pinch = 0; mid = null; }
  };
  // ลากที่เริ่มบนป้ายแตะ: ขยับเกิน DRAG = โอนการลากให้กล้อง (จับ pointer ไว้ที่ canvas ป้ายจึงไม่ได้ click)
  const onChipDown = e => { if (view && e.target.closest('.v3d-chip') && !(e.pointerType === 'mouse' && e.button !== 0)) chipDown = { e, p: local(e) }; };
  const onChipMove = e => {
    if (!chipDown || chipDown.e.pointerId !== e.pointerId) return;
    if (Math.hypot(local(e).x - chipDown.p.x, local(e).y - chipDown.p.y) <= DRAG) return;
    try { cv.setPointerCapture(e.pointerId); } catch { /* ไม่เป็นไร */ }
    begin(chipDown.e, chipDown.p); moved = true; chipDown = null; dragEnd = performance.now();
  };
  const onChipUp = e => { if (chipDown && chipDown.e.pointerId === e.pointerId) chipDown = null; };
  const onWheel = e => { if (!view) return; e.preventDefault(); view.camera.zoom(Math.exp(e.deltaY * (e.ctrlKey ? 0.01 : 0.0012))); dirty = true; };
  const noMenu = e => e.preventDefault();
  cv.addEventListener('pointerdown', onDown); cv.addEventListener('pointermove', onMove);
  cv.addEventListener('pointerup', onUp); cv.addEventListener('pointercancel', onUp); cv.addEventListener('wheel', onWheel, { passive: false }); cv.addEventListener('contextmenu', noMenu);
  chips.addEventListener('pointerdown', onChipDown); chips.addEventListener('pointermove', onChipMove);
  chips.addEventListener('pointerup', onChipUp); chips.addEventListener('pointercancel', onChipUp); chips.addEventListener('wheel', onWheel, { passive: false });   // ล้อเมาส์บนป้ายก็ซูม
  home.addEventListener('click', () => { if (view) { view.camera.reset(); dirty = true; } });

  return {
    get active() { return active; }, get ready() { return !!view; }, get failed() { return failed; },
    async setActive(on) {
      active = !!on; board.classList.toggle('is3d', active);
      if (active) { await ensure(); if (!view) { active = false; board.classList.remove('is3d'); return false; } dirty = true; }
      return active;
    },
    // เรียกทุกเฟรมจากวงรอบของหน้าเล่น: วาดเมื่อเกมเดินหรือมีอะไรเปลี่ยน คืน true ถ้าวาด
    frame(dt, running) {
      if (!active || !view) return false;
      const g = getGame();
      view.update(g, dt);
      if (!running && !dirty) { layoutChips(); return false; }
      const s = size(); if (s.w !== cv._w || s.h !== cv._h) { cv._w = s.w; cv._h = s.h; view.resize(s.w, s.h); }
      view.render(); layoutChips(); dirty = false;
      if (running && gov) {
        const r = gov.frame(dt);
        if (r === 'too-slow') say('เครื่องนี้แสดง 3 มิติได้ช้า ลองกด “ผังเส้น” เพื่อเล่นลื่นขึ้น', 'bad');
        else if (r) { view.setTier(r); savePref3D({ tier: r }); say(`ปรับภาพเป็นระดับ${tierOf(r).name}ให้เล่นลื่นขึ้น`); }
      }
      return true;
    },
    touch() { dirty = true; },
    recolor() { if (view) { view.setColors(colors()); dirty = true; } },
    setTier(id) { if (view) { view.setTier(id); if (gov) gov.tier = id; savePref3D({ tier: id }); dirty = true; } },
    get tier() { return view ? view.tier : null; },
    stats: d => (view ? view.stats(d) : null),
    camera: () => (view ? view.camera : null),
    // จุดกลางป้ายแตะของ target บนจอจริง (สำหรับบอท)
    targetClient(target) {
      if (!view) return null;
      const key = target.kind + ':' + (target.id ?? target.no), el = chipEls.get(key); if (!el || el.hidden) return null;
      const r = el.getBoundingClientRect(); return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2, w: r.width, h: r.height };
    },
    destroy() {
      alive = false; cv.removeEventListener('pointerdown', onDown); cv.removeEventListener('pointermove', onMove);
      cv.removeEventListener('pointerup', onUp); cv.removeEventListener('pointercancel', onUp); cv.removeEventListener('wheel', onWheel); cv.removeEventListener('contextmenu', noMenu);
      if (view) view.dispose(); cv.remove(); chips.remove(); load.remove(); home.remove();
    },
  };
}
export const tierButtons = cur => TIERS.map(t => `<button class="btn sm" type="button" data-act="tier" data-tier="${t.id}" aria-pressed="${t.id === cur}">${esc(t.name)}</button>`).join('');
