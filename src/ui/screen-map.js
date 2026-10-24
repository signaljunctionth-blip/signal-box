// หน้าแผนที่ประเทศไทย: canvas (render/map-draw.js) + ปุ่ม DOM ของสถานีทุกชุดอาชีพซ้อนด้านบน + แถบควบคุม + แผ่นข้อมูลสถานี + หน้าเลือกสาย
// - นิ้วเดียวลาก สองนิ้วซูม ล้อเมาส์ซูม ปุ่ม + − คีย์บอร์ด (ลูกศร + − 0) จุดแตะทุกจุดแปลงผ่าน stage.toStage() จึงใช้ได้ตอนเวทีหมุน 90°
// - วาด canvas ใหม่เฉพาะเมื่อกล้องเปลี่ยน (invalidate -> requestAnimationFrame รอบเดียว)
// - สถานีแบ่งกลุ่มตามชุดอาชีพ (เส้นทางสอน, สายอีสาน, ...) จุดของกลุ่มที่ใกล้กันกว่า CLUSTER_PX บนจอ รวมเป็นปุ่มเดียวของกลุ่มที่พาซูมเข้า
//   เป้าแตะจึงไม่ซ้อนกันทุกระดับซูม พิกัดสถานีจาก map.namtok ถ้าไม่มีใช้ lat/lon ในไฟล์ผัง (geo)
// - หน้าเลือกสาย (ROADMAP M5): 6 สายตาม map.lines เปิดเองครั้งแรกที่ผ่านน้ำตกครบ (ธง PICK_FLAG)
import { createMapRenderer, LINE_DASH, EDGED } from '../render/map-draw.js';
import { fitBounds, centerOn, clampCamera, panBy, zoomAt, pinch, lerpCamera, easeInOut, sameCamera, toScreen, boundsOf, minPairDistance, labelSides, KM_PER_UNIT } from '../render/map-camera.js';
import { sheetHtml, starCount, starIcon, esc, LOCK_ICON, NOTE_UNOFFICIAL } from './station-sheet.js';
import { fullscreenButton } from './stage.js';
import { soundButton } from '../audio/ui.js';

const CLUSTER_PX = 56;        // ระยะบนจอขั้นต่ำระหว่างจุดสถานีก่อนแยกเป็นปุ่มของตัวเอง
const MAX_PX_PER_KM = 20;
const INTRO_FLAG = 'map-intro-seen';
const PICK_FLAG = 'line-pick-seen';
// สายที่เป็นการจัดกลุ่มของเกมเอง ไม่ใช่การแบ่งสายทางการของการรถไฟ (ทางไปน้ำตกและสุพรรณบุรีเป็นทางแยกของสายใต้)
const GAME_GROUPS = ['west'];
const swatch = id => `<svg class="ln" viewBox="0 0 30 8" aria-hidden="true">${EDGED.has(id) ? `<line x1="2" y1="4" x2="28" y2="4" stroke="var(--ln-${id}-edge)" class="edge"/>` : ''}<line x1="2" y1="4" x2="28" y2="4" stroke="var(--ln-${id})" stroke-dasharray="${(LINE_DASH[id] || []).map(n => n * 0.6).join(' ')}"/></svg>`;
const DRAG_PX = 8;            // ขยับเกินนี้ถือว่าลาก ไม่ใช่แตะ
const STATE_TH = { locked: 'ยังล็อก', open: 'เปิดแล้ว', done: 'ผ่านแล้ว' };
const ICON = {
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  minus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg>',
  check: '<svg class="ic-check" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
};

// packs = ชุดอาชีพตามลำดับ (ชุดแรก = เส้นทางสอน), geo = id -> { name_th, name_en, lat, lon } จากไฟล์ผัง
// getProgress = () => computeCareer(...) (progress.js), onLine(packId) = ผู้เล่นเลือกสายในหน้าเลือกสาย
export function createMapScreen({ root, stage, map, packs, geo = {}, getProgress, onStation, onPlay, onHome, onSkip = () => {}, onLine = () => {}, getFree = () => null, onEra = () => '', onFree = () => {}, reducedMotion = () => false, flags = { get: () => false, set() {} } }) {
  const lineIds = Object.keys(map.lines);
  const lineShort = id => (map.lines[id] ? map.lines[id].short_th || map.lines[id].name_th : '');
  root.innerHTML = `
    <div class="map-view" tabindex="0" role="group" aria-label="แผนที่ประเทศไทย ลากเพื่อเลื่อน ใช้ปุ่มลูกศรเลื่อน ปุ่มบวกลบซูม">
      <canvas aria-hidden="true"></canvas>
      <div class="markers"></div>
    </div>
    <div class="map-top">
      <button class="btn sm" type="button" data-act="home">หน้าแรก</button>
      <h2 class="map-title">แผนที่ประเทศไทย</h2>
      <span class="pill" id="map-total"></span>
      <button class="btn sm" type="button" data-act="pick" aria-haspopup="dialog">เลือกสาย</button>
      <button class="btn sm go" type="button" data-act="route">ไปเส้นทางสอน</button>
    </div>
    <div class="map-side">
      ${soundButton()}
      ${fullscreenButton()}
      <button class="iconbtn" type="button" data-act="zin" aria-label="ซูมเข้า">${ICON.plus}</button>
      <button class="iconbtn" type="button" data-act="zout" aria-label="ซูมออก">${ICON.minus}</button>
    </div>
    <div class="map-foot">
      <div class="map-lines">
        <button class="btn sm lines-toggle" type="button" data-act="lines" aria-expanded="false" aria-controls="map-lines-list">สายรถไฟ</button>
        <ul id="map-lines-list" hidden>
          ${lineIds.map(id => `<li><button type="button" data-act="line" data-line="${id}">${swatch(id)}<b>${esc(map.lines[id].name_th)}</b><span></span></button></li>`).join('')}
        </ul>
      </div>
      <p class="map-credit">
        <span class="map-disc">${NOTE_UNOFFICIAL}</span>
        <a href="${esc(map.credits.osm.url)}" target="_blank" rel="noopener">${esc(map.credits.osm.text)}</a>
        <a href="${esc(map.credits.natural_earth.url)}" target="_blank" rel="noopener">${esc(map.credits.natural_earth.text)}</a>
      </p>
    </div>
    <aside class="sheet scroll-cue" role="dialog" aria-modal="false" aria-labelledby="sheet-title" hidden></aside>
    <div class="pick-back" data-act="pick-close" hidden></div>
    <section class="pick" role="dialog" aria-modal="true" aria-labelledby="pick-title" hidden>
      <header class="pick-h">
        <div><h2 id="pick-title" tabindex="-1">เลือกสาย</h2><p class="pick-lead"></p></div>
        <button class="iconbtn" type="button" data-act="pick-close" aria-label="ปิดหน้าเลือกสาย"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
      </header>
      <ul class="pick-list">${lineIds.map(id => `<li><button class="pick-c" type="button" data-act="pick-line" data-line="${id}">${swatch(id)}<b>${esc(lineShort(id))}</b><small>${esc(map.lines[id].name_th)}${GAME_GROUPS.includes(id) ? ' · กลุ่มเส้นทางในเกม' : ''}</small><span class="pick-s"></span></button></li>`).join('')}</ul>
    </section>
    <div class="toast" role="status" aria-live="polite"></div>`;

  const $ = sel => root.querySelector(sel);
  const viewEl = $('.map-view'), canvas = $('canvas'), markersEl = $('.markers'), sheetEl = $('.sheet'), toastEl = $('.toast');
  const linesBtn = $('.lines-toggle'), linesList = $('#map-lines-list');
  const R = createMapRenderer(canvas, map, stage.el, { gameGroups: GAME_GROUPS });
  const world = R.world, proj = R.proj;

  // ---- ข้อมูลสถานีของทุกชุดอาชีพ แบ่งกลุ่มตามชุด ----
  const infoById = Object.fromEntries(map.namtok.stations.map(s => [s.id, s]));
  const infoOf = id => infoById[id] || geo[id] || null;
  const nameOf = id => (infoOf(id) ? infoOf(id).name_th : id);
  const placed = new Set();
  const groups = packs.map((pk, gi) => {
    const stops = pk.stations.map(s => s.station).filter(id => { const i = infoOf(id); if (!i || !Number.isFinite(i.lat) || !Number.isFinite(i.lon) || placed.has(id)) return false; placed.add(id); return true; })
      .map(id => ({ id, info: infoOf(id), p: [proj.x(infoOf(id).lon), proj.y(infoOf(id).lat)] }));
    if (!stops.length) return null;
    const pts = stops.map(s => s.p), sides = labelSides(pts), bounds = boundsOf(pts);
    const g = { id: pk.id, pack: pk, line: pk.line, tutorial: gi === 0, label: gi === 0 ? 'เส้นทางสอน' : `สาย${lineShort(pk.line)}`, stops, bounds,
      mid: [(bounds.x0 + bounds.x1) / 2, (bounds.y0 + bounds.y1) / 2], unK: stops.length > 1 ? CLUSTER_PX / minPairDistance(pts, 1) : 0, clustered: null };
    stops.forEach((s, i) => { s.g = g; s.side = sides[i]; });
    // ที่เผื่อป้ายชื่อรอบกลุ่ม (เส้นทางสอนใช้ค่าเดิม: ป้ายยาวสุดอยู่ด้านขวาของปลายทางตะวันออก) กลุ่มอื่นดูว่าป้ายของสถานีริมสุดอยู่ด้านไหน
    const west = stops.reduce((a, b) => (b.p[0] < a.p[0] ? b : a)), east = stops.reduce((a, b) => (b.p[0] > a.p[0] ? b : a));
    g.labelPad = gi === 0 ? { l: 70, r: 150 } : { l: west.side === 'left' ? 170 : 70, r: east.side === 'right' ? 170 : 70 };
    return g;
  }).filter(Boolean);
  const tut = groups[0], stops = groups.flatMap(g => g.stops), stopById = Object.fromEntries(stops.map(s => [s.id, s]));
  const groupById = Object.fromEntries(groups.map(g => [g.id, g])), groupOfLine = id => groups.find(g => g.line === id) || null;
  const lineBounds = {};
  for (const r of map.rail) if (r.line) (lineBounds[r.line] ||= []).push(...r.pts.map(proj.point));
  for (const id in lineBounds) lineBounds[id] = boundsOf(lineBounds[id]);

  markersEl.innerHTML = stops.map(s => `<button class="mk side-${s.side}" type="button" data-id="${s.id}" data-pack="${s.g.id}"><span class="mk-dot"></span><span class="mk-l"><b>${esc(s.info.name_th)}</b><span class="mk-s"></span></span></button>`).join('')
    + groups.map(g => `<button class="mk mk-cluster side-${g.tutorial ? 'left' : 'right'}" type="button" data-act="route" data-group="${g.id}"><span class="mk-dot"></span><span class="mk-l"><b>${esc(g.label)}</b><span class="mk-s"></span></span></button>`).join('');
  for (const s of stops) s.el = markersEl.querySelector(`[data-id="${s.id}"]`);
  for (const g of groups) g.el = markersEl.querySelector(`.mk-cluster[data-group="${g.id}"]`);
  const pickEl = $('.pick'), pickBack = $('.pick-back'), pickBtn = $('.map-top [data-act="pick"]'), routeBtn = $('.map-top [data-act="route"]');

  // ---- กล้อง ----
  let view = { w: 0, h: 0 }, cam = null, limits = { minK: 1, maxK: MAX_PX_PER_KM * KM_PER_UNIT };
  let visible = false, dirty = false, raf = 0, anim = null, openId = null, introDone = false, labelBox = [], hud = null;
  // กรอบของแถบควบคุม (พิกัดเวที): ป้ายชื่อของปุ่มสถานีและป้ายบน canvas ที่ไปอยู่ใต้แถบจะถูกซ่อน
  const hudRects = () => (hud ||= [...root.querySelectorAll('.map-top > *, .map-side > *, .lines-toggle, #map-lines-list, .map-credit')].filter(el => !el.hidden && el.offsetWidth).map(el => { const r = stage.rectOf(el); return { x: r.x - 4, y: r.y - 4, w: r.w + 8, h: r.h + 8 }; }));
  const hudChanged = () => { hud = null; invalidate(); };
  const basePad = () => ({ l: 8, t: 56, r: 60, b: 64 });
  const pad = () => { const p = basePad(); if (openId) p.r += sheetEl.offsetWidth; return p; };
  const worldBounds = { x0: 0, y0: 0, x1: world.w, y1: world.h };
  const countryCam = () => fitBounds(worldBounds, view, pad());
  // กล้องที่เห็นทุกสถานีของกลุ่ม (ค่าเริ่มต้น = เส้นทางสอน) และจุดไม่รวมกัน
  const routeCam = (g = tut) => {
    // เผื่อที่ให้ป้ายชื่อรอบจุดสถานี (ป้ายยาวสุดอยู่ด้านขวาของปลายทางตะวันออก)
    const p = pad(); p.l += g.labelPad.l; p.r += g.labelPad.r; p.t += 55; p.b += 34;
    const c = fitBounds(g.bounds, view, p, limits.maxK);
    return c.k < g.unK * 1.1 ? centerOn(g.mid[0], g.mid[1], Math.min(limits.maxK, g.unK * 1.1), pad()) : c;
  };
  // เปิดแผ่นข้อมูล: ถ้าพื้นที่ข้างแผ่นพอให้เห็นทั้งเส้นทางสอนโดยจุดไม่รวมกัน (จอไอแพด/คอม) ให้เห็นทุกสถานี แตะสถานีอื่นได้โดยไม่ต้องปิดแผ่น
  // ไม่พอ (จอมือถือ) จัดสถานีที่เลือกไว้กลางพื้นที่ที่เหลือแบบเดิม
  const stationCam = id => {
    const s = stopById[id], g = s.g, p = pad(); p.l += g.labelPad.l; p.r += g.labelPad.r; p.t += 55; p.b += 34;
    const all = fitBounds(g.bounds, view, p, limits.maxK);
    if (all.k >= g.unK * 1.1) return all;
    return centerOn(s.p[0], s.p[1], Math.min(limits.maxK, Math.max(cam.k, g.unK * 1.3)), pad());
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
  // กลุ่มที่ปุ่มบนสุดพาไป: สายที่ผู้เล่นเลือกไว้ หรือสายที่มีภารกิจถัดไป (computeCareer.active)
  const activeGroup = (CP = getProgress()) => groupById[CP.active] || tut;
  function paintMarkers() {
    const CP = getProgress(), act = activeGroup(CP);
    for (const s of stops) {
      const st = CP.byId[s.id], P = CP.packs[s.g.id], el = s.el, pre = s.g.tutorial ? '' : `${s.g.label} `;
      el.className = `mk side-${s.side} ${st.state}${P.current === s.id && st.state === 'open' && s.g === act ? ' current' : ''}${openId === s.id ? ' sel' : ''}`;
      el.querySelector('.mk-dot').innerHTML = `${st.order}${st.state === 'locked' ? `<i class="badge">${LOCK_ICON}</i>` : st.state === 'done' ? `<i class="badge">${ICON.check}</i>` : ''}`;
      el.querySelector('.mk-s').innerHTML = st.state === 'locked' ? 'ล็อก' : `${starIcon(st.stars > 0)}${st.stars}/${st.maxStars}`;
      el.setAttribute('aria-label', `${pre}สถานีที่ ${st.order} ${s.info.name_th} ${STATE_TH[st.state]}${st.state === 'locked' ? '' : ` ดาว ${st.stars} จาก ${st.maxStars}`}`);
    }
    for (const g of groups) {
      const P = CP.packs[g.id], n = g.stops.length;
      g.el.classList.toggle('locked', P.locked);
      g.el.querySelector('.mk-dot').innerHTML = `${n}${P.locked ? `<i class="badge">${LOCK_ICON}</i>` : ''}`;
      g.el.querySelector('.mk-s').innerHTML = P.locked ? 'ล็อก' : `${starIcon(P.totalStars > 0)}${P.totalStars}/${P.maxStars}`;
      g.el.setAttribute('aria-label', `${g.label} ${n} สถานี ${P.locked ? 'ยังล็อก' : `ดาว ${P.totalStars} จาก ${P.maxStars}`} แตะเพื่อซูมเข้า`);
    }
    $('#map-total').innerHTML = starCount(CP.totalStars, CP.maxStars);
    routeBtn.textContent = act.tutorial ? 'ไปเส้นทางสอน' : `ไป${act.label}`;
    paintLines(CP);
    for (const g of groups) g.clustered = null;
    hud = null;
    invalidate();
  }
  // สถานะของแต่ละสาย (รายการสายรถไฟ + หน้าเลือกสาย)
  function lineState(id, CP) {
    const g = groupOfLine(id), P = g && CP.packs[g.id];
    if (!g) return { kind: 'soon', text: 'เร็ว ๆ นี้' };
    if (g.tutorial) return { kind: 'tutorial', g, P, text: 'เส้นทางสอน' };
    if (P.locked) return { kind: 'locked', g, P, text: `ผ่านสถานี${nameOf(CP.gate)}ก่อน` };
    return { kind: 'open', g, P, text: 'เปิดแล้ว' };
  }
  function paintLines(CP) {
    for (const b of linesList.querySelectorAll('[data-line]')) {
      const id = b.dataset.line, L = lineState(id, CP);
      b.querySelector('span').textContent = [L.kind === 'locked' ? 'ยังล็อก' : L.text, GAME_GROUPS.includes(id) ? 'กลุ่มเส้นทางในเกม' : ''].filter(Boolean).join(' · ');
    }
    if (pickEl.hidden) return;
    const act = activeGroup(CP);
    pickEl.querySelector('.pick-lead').textContent = CP.lineOpen ? 'ผ่านบทสอนแล้ว เลือกสายที่จะเล่นต่อ กลับมาเปลี่ยนได้ทุกเมื่อ' : `ผ่านสถานี${nameOf(CP.gate)}ก่อน แล้วเลือกสายต่อไปได้`;
    for (const b of pickEl.querySelectorAll('[data-line]')) {
      const L = lineState(b.dataset.line, CP), on = L.g && L.g === act && L.kind !== 'locked';
      b.className = `pick-c ${L.kind}${on ? ' on' : ''}`;
      const stars = L.P && L.kind !== 'locked' ? ` · ${starCount(L.P.totalStars, L.P.maxStars)}` : '';
      b.querySelector('.pick-s').innerHTML = `${L.kind === 'locked' ? LOCK_ICON : ''}<span>${esc(L.text)}${L.g && L.kind === 'open' ? ` · ${L.g.stops.length} สถานี` : ''}</span>${stars}${on ? '<em>เล่นอยู่</em>' : ''}`;
      b.setAttribute('aria-label', `${map.lines[b.dataset.line].name_th} ${L.text}${L.P && L.kind !== 'locked' ? ` ดาว ${L.P.totalStars} จาก ${L.P.maxStars}` : ''}${on ? ' เล่นอยู่' : ''}`);
    }
  }
  // กรอบป้ายชื่อของปุ่ม (พิกัดเวที) จากด้านที่ป้ายอยู่ ใช้ให้ป้ายบน canvas หลบ
  function boxOf(el, s, side) {
    const l = el.querySelector('.mk-l'), w = l.offsetWidth, h = l.offsetHeight, g = 20;
    const b = side === 'right' ? { x: s.x + g, y: s.y - h / 2 } : side === 'left' ? { x: s.x - g - w, y: s.y - h / 2 } : side === 'top' ? { x: s.x - w / 2, y: s.y - g - h } : { x: s.x - w / 2, y: s.y + g };
    return [{ x: s.x - 20, y: s.y - 20, w: 40, h: 40 }, { ...b, w, h }];
  }
  function placeMarkers() {
    const hadFocus = markersEl.contains(document.activeElement);
    for (const g of groups) {
      const now = cam.k < g.unK;
      if (now === g.clustered) continue;
      g.clustered = now;
      g.stops.forEach(s => { s.el.hidden = now; });
      g.el.hidden = !now;
    }
    if (hadFocus && document.activeElement === document.body) viewEl.focus({ preventScroll: true });
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
    for (const g of groups) if (g.clustered) put(g.el, g.mid, g.tutorial ? 'left' : 'right'); else g.stops.forEach(s => put(s.el, s.p, s.side));
  }

  // ---- แผ่นข้อมูลสถานี ----
  let freeMsg = ''; // ผลของการกดอัปเกรดล่าสุด (แสดงครั้งเดียว)
  function renderSheet() {
    const CP = getProgress(), st = CP.byId[openId], g = stopById[openId].g;
    sheetEl.innerHTML = sheetHtml(st, infoOf(openId), CP.packs[g.id], nameOf, (g.pack.stations.find(s => s.station === openId) || {}).note_th || '', st.done ? getFree(openId, freeMsg) : null, g.tutorial ? '' : g.label);
    sheetEl.scrollTop = 0;
  }
  function setSheet(id, focus) {
    const was = openId;
    openId = id && stopById[id] && getProgress().byId[id] ? id : null;
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
        if (focus) { const el = stopById[was] && stopById[was].el; (el && !el.hidden && el.style.visibility !== 'hidden' ? el : viewEl).focus({ preventScroll: true }); }
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

  function goRoute(byKeyboard, g = activeGroup()) {
    flyTo(routeCam(g), 1000);
    if (byKeyboard) {
      // ปุ่มรวมจะหายเมื่อซูมถึง: ย้ายโฟกัสไปสถานีที่ควรเล่นต่อของกลุ่มนั้น
      const P = getProgress().packs[g.id], s = g.stops.find(x => x.id === P.current) || g.stops[0];
      const wait = () => { if (!visible) return; if (anim) return void setTimeout(wait, 60); if (!s.el.hidden) s.el.focus({ preventScroll: true }); };
      setTimeout(wait, 60);
    }
  }

  // ---- หน้าเลือกสาย ----
  function setPick(open, focus = true) {
    if (open === !pickEl.hidden) return;
    const had = pickEl.contains(document.activeElement);
    pickEl.hidden = pickBack.hidden = !open;
    root.classList.toggle('has-pick', open);
    if (open) { stopAnim(); paintLines(getProgress()); if (focus) pickEl.querySelector('#pick-title').focus({ preventScroll: true }); }
    else if (focus && had) (pickBtn.offsetWidth ? pickBtn : viewEl).focus({ preventScroll: true });
  }
  function pickLine(id) {
    const CP = getProgress(), L = lineState(id, CP);
    setPick(false);
    if (L.g) {
      if (L.kind !== 'locked') { onLine(L.g.id); paintMarkers(); }
      flyTo(routeCam(L.g), 1000);
      toast(L.kind === 'locked' ? `${L.g.label}: ${L.text}` : `${L.g.label} ${L.g.stops.length} สถานี`);
    } else {
      if (lineBounds[id]) { const p = pad(); p.l += 30; p.r += 30; p.t += 20; p.b += 20; flyTo(fitBounds(lineBounds[id], view, p, limits.maxK)); }
      toast(`สาย${lineShort(id)} เร็ว ๆ นี้`);
    }
  }

  root.addEventListener('click', e => {
    const mk = e.target.closest('.mk[data-id]');
    if (mk) return onStation(mk.dataset.id === openId ? null : mk.dataset.id);
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'home') onHome();
    else if (act === 'route') goRoute(e.detail === 0, (b.dataset.group && groupById[b.dataset.group]) || activeGroup());
    else if (act === 'pick') setPick(true);
    else if (act === 'pick-close') setPick(false);
    else if (act === 'pick-line') pickLine(b.dataset.line);
    else if (act === 'zin') zoomStep(1.6);
    else if (act === 'zout') zoomStep(1 / 1.6);
    else if (act === 'lines') setLines(linesList.hidden);
    else if (act === 'line') {
      const id = b.dataset.line, L = map.lines[id], S = lineState(id, getProgress());
      if (S.g) flyTo(routeCam(S.g));
      else if (lineBounds[id]) { const p = pad(); p.l += 30; p.r += 30; p.t += 20; p.b += 20; flyTo(fitBounds(lineBounds[id], view, p, limits.maxK)); }
      toast(S.kind === 'tutorial' ? `${L.name_th} เปิดเส้นทางสอนแล้ว` : S.kind === 'soon' ? `${L.name_th} เร็ว ๆ นี้` : `${S.g.label} ${S.text}`);
      if (view.h < 600) setLines(false);
    } else if (act === 'close') onStation(null);
    else if (act === 'station') onStation(b.dataset.station);
    else if (act === 'play') onPlay(openId, b.dataset.mission);
    else if (act === 'free') onFree(openId);
    else if (act === 'era') {
      // อัปเกรด/เปลี่ยนขั้นแล้ววาดแผ่นใหม่ คงตำแหน่งเลื่อนและโฟกัสไว้ที่กล่องเดินรถอิสระ
      freeMsg = onEra(openId, +b.dataset.level); const y = sheetEl.scrollTop;
      renderSheet(); sheetEl.scrollTop = y; const h = sheetEl.querySelector('#free-title'); if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); }
      freeMsg = '';
    }
    else if (act === 'skip') { onSkip(); toast('เปิดทุกสถานีของเส้นทางสอนและสายถัดไปแล้ว'); if (openId) { renderSheet(); sheetEl.querySelector('#sheet-title').focus({ preventScroll: true }); } paintMarkers(); }
  });
  root.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (!pickEl.hidden) { e.preventDefault(); setPick(false); } else if (openId) { e.preventDefault(); onStation(null); }
  });
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
  if (document.fonts) Promise.all([document.fonts.load('500 12px Mitr', 'ก A'), document.fonts.load('400 12px Anuphan', 'ก A')]).then(() => { for (const g of groups) g.clustered = null; invalidate(); }, () => {});

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
        if (openId) { anim = null; cam = clamp(stationCam(openId)); invalidate(); } else if (flags.get(INTRO_FLAG)) { anim = null; cam = clamp(routeCam(activeGroup())); invalidate(); } else if (!reducedMotion()) setTimeout(() => { if (visible && !openId && !fingers.size && sameCamera(cam, countryCam())) { flyTo(routeCam(activeGroup()), 1500); flags.set(INTRO_FLAG); } }, 600);
      }
      // ผ่านน้ำตกครบครั้งแรก (ไม่นับการข้ามบทสอน): เปิดหน้าเลือกสายให้เองหนึ่งครั้ง
      if (groups.length && getProgress().tutorial.lineSelectOpen && !flags.get(PICK_FLAG)) { flags.set(PICK_FLAG); setPick(true, true); }
      invalidate();
    },
    hide() { visible = false; anim = null; fingers.clear(); setPick(false, false); if (raf) { cancelAnimationFrame(raf); raf = 0; } },
    refresh() { if (openId) renderSheet(); paintMarkers(); },
    // สำหรับบอททดสอบ
    debug: {
      // clustered(กลุ่ม) ไม่ระบุ = เส้นทางสอน
      camera: () => ({ ...cam }), limits: () => ({ ...limits }), animating: () => !!anim, clustered: (gid = tut.id) => (cam ? cam.k < groupById[gid].unK : null), openId: () => openId,
      country: () => { anim = null; setCam(countryCam()); }, route: (gid = tut.id) => { anim = null; setCam(routeCam(groupById[gid])); },
      picking: () => !pickEl.hidden, pick: open => setPick(open !== false, false), groups: () => groups.map(g => ({ id: g.id, line: g.line, stations: g.stops.map(s => s.id) })),
      // จุดกลางปุ่มสถานีบนจอจริง (หลังหมุน)
      markerClient(id) { const s = stopById[id], p = toScreen(cam, view, s.p[0], s.p[1]); return stage.toClient(p.x, p.y); },
    },
  };
}
