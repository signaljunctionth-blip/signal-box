// หน้าแผนที่ประเทศไทย: canvas (render/map-draw.js) + ปุ่ม DOM ของสถานีเส้นทางสอนซ้อนด้านบน + แถบควบคุม + แผ่นข้อมูลสถานี
// - นิ้วเดียวลาก สองนิ้วซูม ล้อเมาส์ซูม ปุ่ม + − คีย์บอร์ด (ลูกศร + − 0) จุดแตะทุกจุดแปลงผ่าน stage.toStage() จึงใช้ได้ตอนเวทีหมุน 90°
// - วาด canvas ใหม่เฉพาะเมื่อกล้องเปลี่ยน (invalidate -> requestAnimationFrame รอบเดียว)
// - จุดสถานีที่ใกล้กันกว่า CLUSTER_PX บนจอ รวมเป็นปุ่ม "เส้นทางสอน" ปุ่มเดียวที่พาซูมเข้า เป้าแตะจึงไม่ซ้อนกันทุกระดับซูม
import { createMapRenderer, LINE_DASH } from '../render/map-draw.js';
import { fitBounds, centerOn, clampCamera, panBy, zoomAt, pinch, lerpCamera, easeInOut, sameCamera, toScreen, boundsOf, minPairDistance, labelSides, KM_PER_UNIT } from '../render/map-camera.js';
import { sheetHtml, starCount, starIcon, esc, LOCK_ICON, NOTE_UNOFFICIAL } from './station-sheet.js';
import { canFullscreen, toggleFullscreen } from './stage.js';

const CLUSTER_PX = 56;        // ระยะบนจอขั้นต่ำระหว่างจุดสถานีก่อนแยกเป็นปุ่มของตัวเอง
const MAX_PX_PER_KM = 20;
const INTRO_FLAG = 'map-intro-seen';
// สายที่เป็นการจัดกลุ่มของเกมเอง ไม่ใช่การแบ่งสายทางการของการรถไฟ (ทางไปน้ำตกและสุพรรณบุรีเป็นทางแยกของสายใต้)
const GAME_GROUPS = ['west'];
const swatch = id => `<svg class="ln" viewBox="0 0 30 8" aria-hidden="true"><line x1="2" y1="4" x2="28" y2="4" stroke="var(--ln-${id})" stroke-dasharray="${(LINE_DASH[id] || []).map(n => n * 0.6).join(' ')}"/></svg>`;
const DRAG_PX = 8;            // ขยับเกินนี้ถือว่าลาก ไม่ใช่แตะ
const STATE_TH = { locked: 'ยังล็อก', open: 'เปิดแล้ว', done: 'ผ่านแล้ว' };
const ICON = {
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  minus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg>',
  full: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/></svg>',
  check: '<svg class="ic-check" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
};

export function createMapScreen({ root, stage, map, pack, getProgress, onStation, onPlay, onHome, reducedMotion = () => false, flags = { get: () => false, set() {} } }) {
  const lineIds = Object.keys(map.lines);
  root.innerHTML = `
    <div class="map-view" tabindex="0" role="group" aria-label="แผนที่ประเทศไทย ลากเพื่อเลื่อน ใช้ปุ่มลูกศรเลื่อน ปุ่มบวกลบซูม">
      <canvas aria-hidden="true"></canvas>
      <div class="markers"></div>
    </div>
    <div class="map-top">
      <button class="btn sm" type="button" data-act="home">หน้าแรก</button>
      <h2 class="map-title">แผนที่ประเทศไทย</h2>
      <span class="pill" id="map-total"></span>
      <button class="btn sm go" type="button" data-act="route">ไปเส้นทางสอน</button>
    </div>
    <div class="map-side">
      ${canFullscreen() ? `<button class="iconbtn" type="button" data-act="full" aria-label="เต็มจอ">${ICON.full}</button>` : ''}
      <button class="iconbtn" type="button" data-act="zin" aria-label="ซูมเข้า">${ICON.plus}</button>
      <button class="iconbtn" type="button" data-act="zout" aria-label="ซูมออก">${ICON.minus}</button>
    </div>
    <div class="map-foot">
      <div class="map-lines">
        <button class="btn sm lines-toggle" type="button" data-act="lines" aria-expanded="false" aria-controls="map-lines-list">สายรถไฟ</button>
        <ul id="map-lines-list" hidden>
          ${lineIds.map(id => `<li><button type="button" data-act="line" data-line="${id}">${swatch(id)}<b>${esc(map.lines[id].name_th)}</b><span>${[id === pack.line ? 'เส้นทางสอน' : 'เร็ว ๆ นี้', GAME_GROUPS.includes(id) ? 'กลุ่มเส้นทางในเกม' : ''].filter(Boolean).join(' · ')}</span></button></li>`).join('')}
        </ul>
      </div>
      <p class="map-credit">
        <span class="map-disc">${NOTE_UNOFFICIAL}</span>
        <a href="${esc(map.credits.osm.url)}" target="_blank" rel="noopener">${esc(map.credits.osm.text)}</a>
        <a href="${esc(map.credits.natural_earth.url)}" target="_blank" rel="noopener">${esc(map.credits.natural_earth.text)}</a>
      </p>
    </div>
    <aside class="sheet" role="dialog" aria-modal="false" aria-labelledby="sheet-title" hidden></aside>
    <div class="toast" role="status" aria-live="polite"></div>`;

  const $ = sel => root.querySelector(sel);
  const viewEl = $('.map-view'), canvas = $('canvas'), markersEl = $('.markers'), sheetEl = $('.sheet'), toastEl = $('.toast');
  const linesBtn = $('.lines-toggle'), linesList = $('#map-lines-list');
  const R = createMapRenderer(canvas, map, stage.el, { gameGroups: GAME_GROUPS });
  const world = R.world, proj = R.proj;

  // ---- ข้อมูลสถานีเส้นทางสอน ----
  const infoById = Object.fromEntries(map.namtok.stations.map(s => [s.id, s]));
  const nameOf = id => (infoById[id] ? infoById[id].name_th : id);
  const stops = pack.stations.filter(s => infoById[s.station]).map(s => ({ id: s.station, info: infoById[s.station], p: [proj.x(infoById[s.station].lon), proj.y(infoById[s.station].lat)] }));
  const pts = stops.map(s => s.p), sides = labelSides(pts);
  const routeBounds = boundsOf(pts), routeMid = [(routeBounds.x0 + routeBounds.x1) / 2, (routeBounds.y0 + routeBounds.y1) / 2];
  const unclusterK = CLUSTER_PX / minPairDistance(pts, 1);
  const lineBounds = {};
  for (const r of map.rail) if (r.line) (lineBounds[r.line] ||= []).push(...r.pts.map(proj.point));
  for (const id in lineBounds) lineBounds[id] = boundsOf(lineBounds[id]);

  markersEl.innerHTML = stops.map((s, i) => `<button class="mk side-${sides[i]}" type="button" data-id="${s.id}"><span class="mk-dot"></span><span class="mk-l"><b>${esc(s.info.name_th)}</b><span class="mk-s"></span></span></button>`).join('')
    + '<button class="mk mk-cluster side-left" type="button" data-act="route"><span class="mk-dot"></span><span class="mk-l"><b>เส้นทางสอน</b><span class="mk-s"></span></span></button>';
  const mkEls = stops.map(s => markersEl.querySelector(`[data-id="${s.id}"]`)), clusterEl = markersEl.querySelector('.mk-cluster');

  // ---- กล้อง ----
  let view = { w: 0, h: 0 }, cam = null, limits = { minK: 1, maxK: MAX_PX_PER_KM * KM_PER_UNIT };
  let visible = false, dirty = false, raf = 0, anim = null, openId = null, introDone = false, clustered = null, labelBox = [], hud = null;
  // กรอบของแถบควบคุม (พิกัดเวที): ป้ายชื่อของปุ่มสถานีและป้ายบน canvas ที่ไปอยู่ใต้แถบจะถูกซ่อน
  const hudRects = () => (hud ||= [...root.querySelectorAll('.map-top > *, .map-side > *, .lines-toggle, #map-lines-list, .map-credit')].filter(el => !el.hidden && el.offsetWidth).map(el => { const r = stage.rectOf(el); return { x: r.x - 4, y: r.y - 4, w: r.w + 8, h: r.h + 8 }; }));
  const hudChanged = () => { hud = null; invalidate(); };
  const basePad = () => ({ l: 8, t: 56, r: 60, b: 64 });
  const pad = () => { const p = basePad(); if (openId) p.r += sheetEl.offsetWidth; return p; };
  const worldBounds = { x0: 0, y0: 0, x1: world.w, y1: world.h };
  const countryCam = () => fitBounds(worldBounds, view, pad());
  const routeCam = () => {
    // เผื่อที่ให้ป้ายชื่อรอบจุดสถานี (ป้ายยาวสุดอยู่ด้านขวาของปลายทางตะวันออก)
    const p = pad(); p.l += 70; p.r += 150; p.t += 55; p.b += 34;
    const c = fitBounds(routeBounds, view, p, limits.maxK);
    return c.k < unclusterK * 1.1 ? centerOn(routeMid[0], routeMid[1], unclusterK * 1.1, pad()) : c;
  };
  const stationCam = id => {
    const s = stops.find(x => x.id === id);
    return centerOn(s.p[0], s.p[1], Math.min(limits.maxK, Math.max(cam.k, unclusterK * 1.3)), pad());
  };
  const clamp = c => clampCamera(c, view, world, limits, pad());

  function invalidate() { dirty = true; if (!raf && visible) raf = requestAnimationFrame(frame); }
  function setCam(c) { cam = clamp(c); invalidate(); }
  function stopAnim() { anim = null; }
  function flyTo(target, ms = 900) {
    const to = clamp(target);
    if (reducedMotion() || ms <= 0 || sameCamera(cam, to)) { anim = null; cam = to; invalidate(); return; }
    anim = { from: { ...cam }, to, t0: performance.now(), ms };
    invalidate();
  }
  function frame(now) {
    raf = 0;
    if (!visible) return;
    if (anim) {
      const e = Math.min(1, (now - anim.t0) / anim.ms);
      cam = lerpCamera(anim.from, anim.to, easeInOut(e));
      if (e >= 1) { cam = anim.to; anim = null; } else { dirty = true; raf = requestAnimationFrame(frame); }
    }
    if (!dirty) return;
    dirty = false;
    placeMarkers();
    R.draw(cam, view, { occupied: labelBox });
  }

  // ---- ปุ่มสถานี ----
  function paintMarkers() {
    const P = getProgress();
    stops.forEach((s, i) => {
      const st = P.byId[s.id], el = mkEls[i];
      el.className = `mk side-${sides[i]} ${st.state}${P.current === s.id && st.state === 'open' ? ' current' : ''}${openId === s.id ? ' sel' : ''}`;
      el.querySelector('.mk-dot').innerHTML = `${st.order}${st.state === 'locked' ? `<i class="badge">${LOCK_ICON}</i>` : st.state === 'done' ? `<i class="badge">${ICON.check}</i>` : ''}`;
      el.querySelector('.mk-s').innerHTML = st.state === 'locked' ? 'ล็อก' : `${starIcon(st.stars > 0)}${st.stars}/${st.maxStars}`;
      el.setAttribute('aria-label', `สถานีที่ ${st.order} ${s.info.name_th} ${STATE_TH[st.state]}${st.state === 'locked' ? '' : ` ดาว ${st.stars} จาก ${st.maxStars}`}`);
    });
    clusterEl.querySelector('.mk-dot').textContent = stops.length;
    clusterEl.querySelector('.mk-s').innerHTML = `${starIcon(P.totalStars > 0)}${P.totalStars}/${P.maxStars}`;
    clusterEl.setAttribute('aria-label', `เส้นทางสอน ${stops.length} สถานี ดาว ${P.totalStars} จาก ${P.maxStars} แตะเพื่อซูมเข้า`);
    $('#map-total').innerHTML = starCount(P.totalStars, P.maxStars);
    clustered = null;
    invalidate();
  }
  // กรอบป้ายชื่อของปุ่ม (พิกัดเวที) จากด้านที่ป้ายอยู่ ใช้ให้ป้ายบน canvas หลบ
  function boxOf(el, s, side) {
    const l = el.querySelector('.mk-l'), w = l.offsetWidth, h = l.offsetHeight, g = 20;
    const b = side === 'right' ? { x: s.x + g, y: s.y - h / 2 } : side === 'left' ? { x: s.x - g - w, y: s.y - h / 2 } : side === 'top' ? { x: s.x - w / 2, y: s.y - g - h } : { x: s.x - w / 2, y: s.y + g };
    return [{ x: s.x - 20, y: s.y - 20, w: 40, h: 40 }, { ...b, w, h }];
  }
  function placeMarkers() {
    const now = cam.k < unclusterK;
    if (now !== clustered) {
      clustered = now;
      const hadFocus = markersEl.contains(document.activeElement);
      mkEls.forEach(el => { el.hidden = now; });
      clusterEl.hidden = !now;
      if (hadFocus && document.activeElement === document.body) viewEl.focus({ preventScroll: true });
    }
    labelBox = hudRects().slice();
    const H = hudRects(), hit = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    const put = (el, p, side) => {
      const s = toScreen(cam, view, p[0], p[1]);
      const on = s.x > -30 && s.y > -30 && s.x < view.w + 30 && s.y < view.h + 30;
      el.style.visibility = on ? '' : 'hidden';
      el.style.transform = `translate(${s.x.toFixed(1)}px,${s.y.toFixed(1)}px)`;
      if (!on) return;
      const [dot, lab] = boxOf(el, s, side);
      const under = H.some(h => hit(lab, h));
      el.classList.toggle('nolabel', under);
      // จุดสถานีที่ไปอยู่ใต้ปุ่มของแถบควบคุม: ซ่อนไว้ (แตะไม่ได้อยู่แล้ว) เลื่อนแผนที่แล้วกลับมาเอง
      const tapBox = { x: s.x - 22, y: s.y - 22, w: 44, h: 44 };
      if (H.some(h => hit(tapBox, { x: h.x + 4, y: h.y + 4, w: h.w - 8, h: h.h - 8 }))) { el.style.visibility = 'hidden'; return; }
      labelBox.push(dot); if (!under) labelBox.push(lab);
    };
    if (now) put(clusterEl, routeMid, 'left'); else stops.forEach((s, i) => put(mkEls[i], s.p, sides[i]));
  }

  // ---- แผ่นข้อมูลสถานี ----
  function renderSheet() {
    const P = getProgress(), st = P.byId[openId];
    sheetEl.innerHTML = sheetHtml(st, infoById[openId], P, nameOf, (pack.stations.find(s => s.station === openId) || {}).note_th || '');
    sheetEl.scrollTop = 0;
  }
  function setSheet(id, focus) {
    const was = openId;
    openId = id && infoById[id] && getProgress().byId[id] ? id : null;
    sheetEl.hidden = !openId;
    root.classList.toggle('has-sheet', !!openId); hud = null;
    if (openId) {
      renderSheet();
      if (focus) sheetEl.querySelector('#sheet-title').focus({ preventScroll: true });
      flyTo(stationCam(openId), was ? 500 : 800);
    } else {
      sheetEl.innerHTML = '';
      if (was) {
        flyTo(cam, 300);
        if (focus) { const el = mkEls[stops.findIndex(s => s.id === was)]; (el && !el.hidden && el.style.visibility !== 'hidden' ? el : viewEl).focus({ preventScroll: true }); }
      }
    }
    paintMarkers();
  }

  let toastT = 0;
  function toast(text) { toastEl.textContent = text; toastEl.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('on'), 2600); }

  // ---- การแตะ ลาก ซูม ----
  const fingers = new Map();
  let moved = false, start = null, lastDragEnd = 0;
  const at = e => stage.toStage(e.clientX, e.clientY);
  const two = () => { const [a, b] = [...fingers.values()]; return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) }; };
  viewEl.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (view.h < 600 && !linesList.hidden) setLines(false); // จอเตี้ย: รายการสายเป็นแผ่นลอยชั่วคราว แตะแผนที่แล้วปิด
    stopAnim();
    fingers.set(e.pointerId, at(e));
    if (fingers.size === 1) { moved = false; start = at(e); }
    if (fingers.size === 2) { moved = true; for (const id of fingers.keys()) try { viewEl.setPointerCapture(id); } catch { /* นิ้วยกไปแล้ว */ } }
  });
  viewEl.addEventListener('pointermove', e => {
    const prev = fingers.get(e.pointerId);
    if (!prev) return;
    const p = at(e);
    if (fingers.size === 1) {
      if (!moved) {
        if (Math.hypot(p.x - start.x, p.y - start.y) < DRAG_PX) return;
        moved = true;
        try { viewEl.setPointerCapture(e.pointerId); } catch { /* ไม่เป็นไร */ }
        viewEl.classList.add('dragging');
      }
      fingers.set(e.pointerId, p);
      setCam(panBy(cam, p.x - prev.x, p.y - prev.y));
    } else if (fingers.size === 2) {
      const a = two();
      fingers.set(e.pointerId, p);
      setCam(pinch(cam, view, a, two(), limits));
    }
  });
  const lift = e => {
    if (!fingers.delete(e.pointerId)) return;
    if (moved) lastDragEnd = performance.now();
    if (!fingers.size) viewEl.classList.remove('dragging');
  };
  viewEl.addEventListener('pointerup', lift);
  viewEl.addEventListener('pointercancel', lift);
  // ลากแล้วปล่อยบนปุ่มสถานี ไม่นับเป็นการแตะปุ่ม
  viewEl.addEventListener('click', e => { if (performance.now() - lastDragEnd < 60) { e.stopPropagation(); e.preventDefault(); } }, true);
  viewEl.addEventListener('wheel', e => {
    e.preventDefault();
    stopAnim();
    const p = at(e), unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? view.h : 1;
    setCam(zoomAt(cam, view, p.x, p.y, Math.exp(-e.deltaY * unit * (e.ctrlKey ? 0.01 : 0.0016)), limits));
  }, { passive: false });
  viewEl.addEventListener('gesturestart', e => e.preventDefault());
  viewEl.addEventListener('scroll', () => { viewEl.scrollTop = 0; viewEl.scrollLeft = 0; });

  const center = () => { const p = pad(); return { x: (p.l + view.w - p.r) / 2, y: (p.t + view.h - p.b) / 2 }; };
  const zoomStep = f => { const c = center(); flyTo(zoomAt(anim ? anim.to : cam, view, c.x, c.y, f, limits), 220); };
  viewEl.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const step = 90, k = e.key;
    const pan = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[k];
    if (pan) { stopAnim(); setCam(panBy(cam, pan[0], pan[1])); } else if (k === '+' || k === '=') zoomStep(1.6); else if (k === '-' || k === '_') zoomStep(1 / 1.6); else if (k === '0') flyTo(countryCam()); else return;
    e.preventDefault();
  });

  function goRoute(byKeyboard) {
    flyTo(routeCam(), 1000);
    if (byKeyboard) {
      // ปุ่มรวมจะหายเมื่อซูมถึง: ย้ายโฟกัสไปสถานีที่ควรเล่นต่อ
      const P = getProgress(), i = Math.max(0, stops.findIndex(s => s.id === P.current));
      const wait = () => { if (!visible) return; if (anim) return void setTimeout(wait, 60); if (!mkEls[i].hidden) mkEls[i].focus({ preventScroll: true }); };
      setTimeout(wait, 60);
    }
  }

  root.addEventListener('click', e => {
    const mk = e.target.closest('.mk[data-id]');
    if (mk) return onStation(mk.dataset.id === openId ? null : mk.dataset.id);
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'home') onHome();
    else if (act === 'route') goRoute(e.detail === 0);
    else if (act === 'zin') zoomStep(1.6);
    else if (act === 'zout') zoomStep(1 / 1.6);
    else if (act === 'full') toggleFullscreen();
    else if (act === 'lines') setLines(linesList.hidden);
    else if (act === 'line') {
      const id = b.dataset.line, L = map.lines[id];
      if (lineBounds[id]) { const p = pad(); p.l += 30; p.r += 30; p.t += 20; p.b += 20; flyTo(fitBounds(lineBounds[id], view, p, limits.maxK)); }
      toast(id === pack.line ? `${L.name_th} เปิดเส้นทางสอนแล้ว` : `${L.name_th} เร็ว ๆ นี้`);
      if (view.h < 600) setLines(false);
    } else if (act === 'close') onStation(null);
    else if (act === 'station') onStation(b.dataset.station);
    else if (act === 'play') onPlay(openId, b.dataset.mission);
  });
  root.addEventListener('keydown', e => { if (e.key === 'Escape' && openId) { e.preventDefault(); onStation(null); } });
  function setLines(open) { linesList.hidden = !open; linesBtn.setAttribute('aria-expanded', String(open)); hudChanged(); }
  root.addEventListener('transitionend', e => { if (e.target.closest('.map-side')) hudChanged(); });

  // ---- ขนาดจอ ธีม ----
  function layout() {
    const L = stage.layout, first = !cam, wasMin = cam && cam.k <= limits.minK * 1.001;
    view = { w: L.w, h: L.h };
    R.resize(view.w, view.h, Math.min(2, window.devicePixelRatio || 1)); hud = null;
    limits = { minK: fitBounds(worldBounds, view, basePad()).k, maxK: MAX_PX_PER_KM * KM_PER_UNIT };
    cam = first || wasMin ? countryCam() : clamp(cam);
    if (first) setLines(view.h >= 600);
    invalidate();
  }
  stage.onResize(() => { if (visible) layout(); });
  const recolor = () => { R.refreshColors(); invalidate(); };
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', recolor);
  new MutationObserver(recolor).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  if (document.fonts) Promise.all([document.fonts.load('500 12px Mitr', 'ก A'), document.fonts.load('400 12px Anuphan', 'ก A')]).then(() => { clustered = null; invalidate(); }, () => {});

  return {
    // เปิดหน้าแผนที่ stationId = เปิดแผ่นข้อมูลสถานีนั้นด้วย
    show(stationId, { focus = false } = {}) {
      const wasVisible = visible;
      visible = true;
      if (!wasVisible || view.w !== stage.layout.w || view.h !== stage.layout.h) layout();
      if (stationId !== openId || !wasVisible) setSheet(stationId || null, focus); else paintMarkers();
      if (!introDone) {
        introDone = true;
        // ครั้งแรกของเครื่องนี้: เห็นทั้งประเทศแล้วกล้องเลื่อนเข้าหาเส้นทางสอน ครั้งต่อไปเปิดที่เส้นทางสอนเลย
        if (openId) { anim = null; cam = clamp(stationCam(openId)); invalidate(); } else if (flags.get(INTRO_FLAG)) { anim = null; cam = clamp(routeCam()); invalidate(); } else if (!reducedMotion()) setTimeout(() => { if (visible && !openId && !fingers.size && sameCamera(cam, countryCam())) { flyTo(routeCam(), 1500); flags.set(INTRO_FLAG); } }, 600);
      }
      invalidate();
    },
    hide() { visible = false; anim = null; fingers.clear(); if (raf) { cancelAnimationFrame(raf); raf = 0; } },
    refresh() { if (openId) renderSheet(); paintMarkers(); },
    // สำหรับบอททดสอบ
    debug: {
      camera: () => ({ ...cam }), limits: () => ({ ...limits }), animating: () => !!anim, clustered: () => (cam ? cam.k < unclusterK : null), openId: () => openId,
      country: () => { anim = null; setCam(countryCam()); }, route: () => { anim = null; setCam(routeCam()); },
      // จุดกลางปุ่มสถานีบนจอจริง (หลังหมุน)
      markerClient(id) { const s = stops.find(x => x.id === id), p = toScreen(cam, view, s.p[0], s.p[1]); return stage.toClient(p.x, p.y); },
    },
  };
}
