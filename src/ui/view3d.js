// ชั้นหน้าจอของฉาก 3 มิติในหน้าเล่น: canvas WebGL + ป้ายแตะ (เสา ประแจ ปลายทาง) + การลาก/ซูมกล้อง
// โหลด three.js และชิ้นงานแบบแยกก้อน (dynamic import) เฉพาะตอนผู้เล่นเปิด 3 มิติ ระหว่างรอยังเห็นแผงผังเส้นตามปกติ
// ไม่แตะสถานะเกม: ส่งคำสั่งออกทาง onPress(target) แบบเดียวกับแผงผังเส้น
import { readPref, writePref, initialTier, createGovernor, tierOf, TIERS } from '../render3d/quality.js';
import { destinations } from '../render/panel-geom.js';
import { esc } from './station-sheet.js';

// สถานีที่มีฉาก 3 มิติแล้ว (M1.5 เริ่มที่ท่ากิเลน) สถานีอื่นยังเป็นแผงผังเส้นอย่างเดียว
export const SCENE_STATIONS = ['tha-kilen'];
export const has3D = id => SCENE_STATIONS.includes(id);
export const pref3D = () => readPref() || {};
export const savePref3D = v => writePref(undefined, { ...pref3D(), ...v });
export { TIERS };

const COLOR_VARS = ['--t1', '--t2', '--t3', '--exp', '--route', '--occ', '--scene-exposure', '--scene-fog', '--scene-sun', '--scene-env', '--scene-tint'];
const TAP = 44, DRAG = 8;

export function mountView3D(board, { stage, getGame, onPress, getHint, say, station }) {
  const cv = document.createElement('canvas'), chips = document.createElement('div'), load = document.createElement('div'), home = document.createElement('button');
  cv.className = 'v3d'; cv.setAttribute('aria-label', 'ฉากสถานี 3 มิติ แตะป้ายชื่อเสาหรือประแจเพื่อสั่งการ ลากเพื่อเลื่อนมุมมอง');
  chips.className = 'v3d-chips'; load.className = 'v3d-load'; load.setAttribute('role', 'status'); load.textContent = 'กำลังสร้างฉาก 3 มิติ';
  home.className = 'btn sm v3d-home'; home.type = 'button'; home.textContent = 'ดูทั้งสถานี'; home.hidden = true;
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
      el.addEventListener('click', e => { e.stopPropagation(); onPress(a.target); dirty = true; });
      chips.append(el); chipEls.set(key, el);
    }
    return el;
  }
  const isHinted = (hn, t) => !!hn && ((hn.kind === 's' && t.kind === 'signal' && hn.k === t.id) || (hn.kind === 'p' && t.kind === 'point' && hn.k === t.id) || (hn.kind === 'plat' && t.kind === 'platform' && hn.k === t.no) || (hn.kind === t.kind && hn.k === t.id));
  function layoutChips() {
    const g = getGame(), { w, h } = size(), hn = getHint(), dest = destinations(g), destKeys = new Set(dest.map(t => t.kind + ':' + (t.id ?? t.no)));
    const used = [], seen = new Set();
    let hintEl = null;
    for (const a of view.anchors()) {
      const k = a.target.kind, key = k + ':' + (a.target.id ?? a.target.no);
      const show = k === 'signal' || k === 'point' || destKeys.has(key);
      if (!show) continue;
      // ป้ายอยู่เหนือหัวเสา ถ้าหัวเสาพ้นขอบบนให้เกาะขอบบนตรงเสา ถ้าโคนเสาอยู่นอกจอ (ซูมเข้าอยู่) ไม่แสดงป้าย
      // ยกเว้นเป้าของคำใบ้: เกาะขอบจอด้านที่เป้าอยู่ ผู้เล่นจะได้รู้ว่าต้องแตะอะไรแม้ซูมเข้าอยู่
      const p = view.project(a.pos, w, h), q = view.project(a.base, w, h), hinted = isHinted(hn, a.target);
      const off = !q.on || q.x < -8 || q.x > w + 8 || q.y < 0 || q.y > h + 60;
      if (off && !hinted) continue;
      let x = Math.max(36, Math.min(w - 36, q.on ? q.x : (q.x < w / 2 ? w - 36 : 36))), y = Math.max(28, Math.min(h - 26, Math.min(p.on ? p.y - 18 : 28, q.y - 30)));
      if (off) y = Math.max(28, Math.min(h - 26, q.y));
      const clash = yy => used.some(u => Math.abs(u[0] - x) < 74 && Math.abs(u[1] - yy) < 40);   // ป้ายประแจกว้างราว 68 px
      for (let n = 1; n < 6 && clash(y); n++) { const up = y - 40 * n, dn = y + 40 * n; if (up >= 28 && !clash(up)) { y = up; break; } if (dn <= h - 26 && !clash(dn)) { y = dn; break; } }   // หลบป้ายที่วางไปแล้ว
      used.push([x, y]);
      const el = chipFor(a); seen.add(key);
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      a._xy = [x, y];
      const pill = el.firstChild, dot = pill.children[0], label = pill.children[1], sub = pill.children[2];
      let state = '', text = a.label, subT = '';
      if (k === 'signal') { const s = g.S[a.target.id]; text = s.label || a.target.id; state = s.aspect === 'G' ? 'go' : 'stop'; if (g.nxSel === a.target.id) state += ' sel'; }
      else if (k === 'point') { const p_ = g.P[a.target.id]; subT = p_.pos === 'N' ? 'ตรง' : 'แยก'; state = (p_.lock || p_.ovl ? 'locked ' : '') + (g.lv.pointsLocked ? 'fixed' : ''); }
      else state = 'dest';
      if (label.textContent !== text) label.textContent = text;
      if (sub.textContent !== subT) sub.textContent = subT;
      dot.hidden = k !== 'signal';
      el.className = `v3d-chip k-${k} ${state}`;
      el.setAttribute('aria-label', k === 'signal' ? `เสา ${text} ${state.startsWith('go') ? 'ทางเปิด' : 'ห้าม'}` : k === 'point' ? `ประแจ ${text} ${subT}` : `ปลายทาง ${text}`);
      if (hinted) { el.classList.add('hint'); hintEl = [x, y, hn.text]; }
    }
    for (const [key, el] of chipEls) el.hidden = !seen.has(key);
    // ข้อความคำใบ้ข้างป้ายที่ต้องแตะ
    if (hintEl && hintEl[2]) {
      if (!bubble) { bubble = document.createElement('div'); bubble.className = 'v3d-bubble'; chips.append(bubble); }
      const [x, y, t] = hintEl, below = y < h - 80;   // ใต้ป้ายเป็นหลัก (เหนือป้ายมักมีป้ายอื่นซ้อน)
      if (bubble.textContent !== t) bubble.textContent = t;
      bubble.style.transform = `translate(${Math.max(90, Math.min(w - 90, x)).toFixed(1)}px, ${(below ? y + 30 : y - 30).toFixed(1)}px)`;
      bubble.classList.toggle('below', below); bubble.hidden = false;
    } else if (bubble) bubble.hidden = true;
    home.hidden = !view.camera.zoomed;
  }

  /* ---------- การแตะ ลาก ซูม บน canvas ---------- */
  const ptrs = new Map(); let downAt = null, moved = false, pinch = 0;
  const local = e => { const p = stage.toStage(e.clientX, e.clientY), r = stage.rectOf(cv); return { x: p.x - r.x, y: p.y - r.y }; };
  function tapAt(x, y) {
    const { w, h } = size(), g = getGame(); let best = null, bd = TAP;
    const dest = new Set(destinations(g).map(t => t.kind + ':' + (t.id ?? t.no)));
    for (const a of view.anchors()) {
      const k = a.target.kind; if (k !== 'signal' && k !== 'point' && !dest.has(k + ':' + (a.target.id ?? a.target.no))) continue;
      for (const pos of [a.pos, a.base]) { const p = view.project(pos, w, h); if (!p.on) continue; const d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; best = a.target; } }
    }
    if (best) { onPress(best); dirty = true; }
  }
  const onDown = e => {
    if (!view || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault(); try { cv.setPointerCapture(e.pointerId); } catch { /* ไม่เป็นไร */ }
    const p = local(e); ptrs.set(e.pointerId, p);
    if (ptrs.size === 1) { downAt = p; moved = false; } else { moved = true; const [a, b] = [...ptrs.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); }
  };
  const onMove = e => {
    if (!view || !ptrs.has(e.pointerId)) return;
    const p = local(e), q = ptrs.get(e.pointerId); ptrs.set(e.pointerId, p);
    if (ptrs.size >= 2) { const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y); if (pinch > 0 && d > 0) view.camera.zoom(pinch / d); pinch = d; dirty = true; return; }
    if (!moved && downAt && Math.hypot(p.x - downAt.x, p.y - downAt.y) > DRAG) moved = true;
    if (moved) { view.camera.pan(p.x - q.x, p.y - q.y, size().h); dirty = true; }
  };
  const onUp = e => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.delete(e.pointerId);
    if (e.type === 'pointerup' && !moved && downAt && ptrs.size === 0) { const g = getGame(); if (g && g.state === 'play') tapAt(downAt.x, downAt.y); }
    if (!ptrs.size) { downAt = null; pinch = 0; }
  };
  const onWheel = e => { if (!view) return; e.preventDefault(); view.camera.zoom(Math.exp(e.deltaY * 0.0012)); dirty = true; };
  cv.addEventListener('pointerdown', onDown); cv.addEventListener('pointermove', onMove);
  cv.addEventListener('pointerup', onUp); cv.addEventListener('pointercancel', onUp); cv.addEventListener('wheel', onWheel, { passive: false });
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
      cv.removeEventListener('pointerup', onUp); cv.removeEventListener('pointercancel', onUp); cv.removeEventListener('wheel', onWheel);
      if (view) view.dispose(); cv.remove(); chips.remove(); load.remove(); home.remove();
    },
  };
}
export const tierButtons = cur => TIERS.map(t => `<button class="btn sm" type="button" data-act="tier" data-tier="${t.id}" aria-pressed="${t.id === cur}">${esc(t.name)}</button>`).join('');
