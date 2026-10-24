// หน้าจอโหมดสร้าง (GDD ข้อ 7, M4): วางรางบนกริด ดูตารางอินเตอร์ล็อก แชร์ผังด้วยลิงก์ และทดลองเดินรถบนผังของตัวเอง
// ตรรกะทั้งหมดอยู่ใน src/sim (editor.js, route-table.js, share.js, free-play.js) ไฟล์นี้วาดกริดบน canvas กับจัดการการแตะเท่านั้น
// จุดแตะทุกจุดแปลงผ่าน stage.toStage() จึงใช้ได้ตอนเวทีหมุน 90° สีบน canvas อ่านจาก CSS variable (โหมดมืด)
// opts: { root, stage, eras, wallet (ui/wallet.js ไม่ใส่ = ไม่คิดงบ), econ (โมดูล wallet.js: upgradeOf, upgradeCost), onExit(), onPlay(pack, name) }
// งบ (DECISIONS): ทดลองเดินรถผังของตัวเองต้องยืนยันผังก่อน (จ่ายค่าชิ้นที่เพิ่ม รื้อคืนครึ่ง) และขั้นระบบสัญญาณของผังซื้อแยก (สถานี 'custom')
// ผังที่ได้จากลิงก์แชร์เล่นแบบทดลอง ไม่ใช้งบ เลือกขั้นไหนก็ได้
import './build.css';
import { GRID, starterPlan, normalizePlan, toggleSeg, toggleSignal, setPlatform, planCount, buildPlan, routeTable, encodePlan, decodeShare, shareLink, freePlayPack } from '../sim/index.js';

export const BUILD_KEY = 'sj-build-plan';
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const segKey = (i, j, d) => `${i},${j},${d}`;

function loadSaved() {
  try { const raw = localStorage.getItem(BUILD_KEY); if (raw) { const { plan } = normalizePlan(JSON.parse(raw)); if (plan) return plan; } } catch { /* เซฟใช้ไม่ได้ เริ่มผังใหม่ */ }
  return starterPlan();
}
function savePlan(p) { try { localStorage.setItem(BUILD_KEY, JSON.stringify(p)); } catch { /* เก็บไม่ได้ (โหมดส่วนตัว/เต็ม) ผังยังอยู่ในหน้านี้ */ } }

const TOOLS = [
  { id: 'track', name: 'วางราง', hint: 'ลากจากจุดไปจุดเพื่อวางราง (ตรงหรือเฉียง) แตะรางเดิมเพื่อรื้อ', icon: '<path d="M3 17L21 7M6 19l-2-4M11 16l-2-4M16 13l-2-4M21 10l-2-4"/>' },
  { id: 'sigE', name: 'เสาหันขวา', hint: 'แตะจุดบนรางเพื่อวางหรือเอาเสาที่คุมขบวนวิ่งไปทางขวาออก', icon: '<path d="M7 21V5M7 5h6M17 5a3 3 0 1 1-6 0 3 3 0 0 1 6 0z"/>' },
  { id: 'sigW', name: 'เสาหันซ้าย', hint: 'แตะจุดบนรางเพื่อวางหรือเอาเสาที่คุมขบวนวิ่งไปทางซ้ายออก', icon: '<path d="M17 21V5M17 5h-6M13 5a3 3 0 1 1-6 0 3 3 0 0 1 6 0z"/>' },
  { id: 'plat', name: 'ทางจอด', hint: 'ลากบนรางอย่างน้อย 3 ช่องเพื่อทำทางจอด แตะทางจอดเดิมเพื่อเอาออก', icon: '<path d="M3 15h18M3 19h18M5 15V9h14v6"/>' },
  { id: 'erase', name: 'ลบ', hint: 'ลากผ่านรางหรือเสาเพื่อลบ', icon: '<path d="M4 20h16M7 16l9-9 3 3-9 9H7v-3z"/>' },
];

const CUSTOM = 'custom';

export function createBuildScreen({ root, stage, eras, wallet = null, econ = null, onExit, onPlay }) {
  root.innerHTML = `<div class="bld">
    <header class="bld-top">
      <button class="iconbtn" type="button" data-act="exit" aria-label="กลับ"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg></button>
      <div class="bld-title"><h2>โหมดสร้าง</h2><span class="bld-chip" data-ref="chip"></span><span class="bld-budget" data-ref="budget"${wallet ? '' : ' hidden'}></span></div>
      <div class="bld-acts">
        <button class="btn sm" type="button" data-act="table">ตารางอินเตอร์ล็อก</button>
        <button class="btn sm" type="button" data-act="share">แชร์ผัง</button>
        <button class="btn sm go" type="button" data-act="try">ทดลองเดินรถ</button>
      </div>
    </header>
    <nav class="bld-tools" aria-label="เครื่องมือ">
      ${TOOLS.map(t => `<button class="bld-tool" type="button" data-tool="${t.id}" aria-pressed="false" title="${esc(t.hint)}"><svg viewBox="0 0 24 24" aria-hidden="true">${t.icon}</svg><span>${esc(t.name)}</span></button>`).join('')}
      <button class="bld-tool" type="button" data-act="undo" title="ย้อนการแก้ล่าสุด"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7L4 12l5 5M4 12h11a5 5 0 0 1 0 10h-2"/></svg><span>ย้อน</span></button>
    </nav>
    <div class="bld-board" data-ref="board"><canvas aria-label="กริดผังสถานี"></canvas></div>
    <p class="bld-msg" data-ref="msg" role="status"></p>
    <div class="bld-sheet" data-ref="sheet" hidden></div>
  </div>`;
  const $ = s => root.querySelector(s);
  const board = $('[data-ref="board"]'), cv = $('canvas'), ctx2 = cv.getContext('2d'), chip = $('[data-ref="chip"]'), msgEl = $('[data-ref="msg"]'), sheet = $('[data-ref="sheet"]');

  let plan = loadSaved(), built = null, tool = 'track', undo = [], received = null, note = '', view = { k: 1, ox: 0, oy: 0 };

  /* ---------- สถานะผัง ---------- */
  function rebuild() {
    built = buildPlan(plan);
    const n = built.errors.length, c = planCount(plan);
    chip.textContent = built.ok ? 'ผังใช้ได้' : `ต้องแก้ ${n} จุด`;
    if (wallet) {
      const due = received ? 0 : wallet.layoutCharge(c);
      $('[data-ref="budget"]').textContent = `งบ ${wallet.balance()}${due > 0 ? ` · ค่าก่อสร้าง ${due}` : due < 0 ? ` · รื้อได้คืน ${-due}` : ''}`;
    }
    chip.classList.toggle('ok', built.ok);
    $('[data-act="try"]').disabled = !built.ok;
    $('[data-act="table"]').disabled = !built.ok;
    const first = n ? friendly(built.errors[0]) : `ราง ${c.straight + c.diagonal} ช่อง · ประแจ ${c.points} · เสา ${c.signals} · ${TOOLS.find(t => t.id === tool).hint}`;
    msgEl.textContent = note ? `${note} ${first}` : first;
    msgEl.classList.toggle('bad', n > 0);
    draw();
  }
  // ชื่อภายใน (t3, P1) ในข้อความของตัวตรวจ -> ตำแหน่งช่องบนกริดที่ผู้เล่นเห็น
  function friendly(e) {
    const T = (built && built.cells && built.cells.tracks) || {};
    return String(e).replace(/^layout\.[\w.[\]-]*: /, '').replace(/^จุดต่อ /, '').replace(/\(เพิ่มใน signals:[^)]*\)/, '(ใช้เครื่องมือเสา)').replace(/ \(SIGNALLING-RULES [\d.]+\)/, '')
      .replace(/\bt(\d+)\b/g, m => (T[m] ? `รางช่อง (${T[m][0][0] + 1}, ${T[m][0][1] + 1})` : m));
  }
  function change(next) {
    if (JSON.stringify(next) === JSON.stringify(plan)) return;
    undo.push(plan); if (undo.length > 60) undo.shift();
    plan = next; received = null; note = '';
    savePlan(plan); rebuild();
  }

  /* ---------- วาด ---------- */
  const css = n => getComputedStyle(root).getPropertyValue(n).trim();
  function fit() {
    const w = board.clientWidth, h = board.clientHeight, dpr = window.devicePixelRatio || 1;
    if (!w || !h) return;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); cv.style.width = `${w}px`; cv.style.height = `${h}px`;
    const W = plan.cols * GRID, H = plan.rows * GRID, pad = 14, k = Math.min((w - 2 * pad) / W, (h - 2 * pad) / H);
    view = { k, ox: (w - W * k) / 2, oy: (h - H * k) / 2, dpr };
    draw();
  }
  const X = i => view.ox + i * GRID * view.k, Y = j => view.oy + (j + 0.5) * GRID * view.k;
  function draw() {
    if (!view.dpr) return;
    const c = ctx2, k = view.k, bad = badCells();
    c.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    c.clearRect(0, 0, cv.width, cv.height);
    c.fillStyle = css('--board'); c.fillRect(X(0), view.oy, plan.cols * GRID * k, plan.rows * GRID * k);
    // ขอบซ้ายขวา = ขาเข้าออก
    c.fillStyle = css('--line'); c.fillRect(X(0) - 3, view.oy, 3, plan.rows * GRID * k); c.fillRect(X(plan.cols), view.oy, 3, plan.rows * GRID * k);
    c.fillStyle = css('--muted');
    for (let i = 0; i <= plan.cols; i++) for (let j = 0; j < plan.rows; j++) { c.beginPath(); c.arc(X(i), Y(j), Math.max(1.4, 2 * k), 0, 7); c.fill(); }
    // ทางจอด
    const plat = {};
    for (const [i, j, d, no] of plan.plats) plat[segKey(i, j, d)] = no;
    c.lineCap = 'round';
    c.strokeStyle = css('--cream'); c.lineWidth = 16 * k;
    for (const [i, j, d] of plan.segs) if (plat[segKey(i, j, d)]) { c.beginPath(); c.moveTo(X(i), Y(j)); c.lineTo(X(i + 1), Y(j + d)); c.stroke(); }
    // ราง
    for (const [i, j, d] of plan.segs) {
      c.strokeStyle = bad.segs.has(segKey(i, j, d)) ? css('--red') : css('--ink');
      c.lineWidth = 5 * k; c.beginPath(); c.moveTo(X(i), Y(j)); c.lineTo(X(i + 1), Y(j + d)); c.stroke();
    }
    c.font = `500 ${Math.max(10, 13 * k)}px ${css('--display')}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    // เลขทางจอด
    const seen = new Set();
    for (const [i, j, d, no] of plan.plats) if (!seen.has(no)) { seen.add(no); const run = plan.plats.filter(p => p[3] === no), m = run[Math.floor(run.length / 2)]; c.fillStyle = css('--ink'); c.fillText(`ทาง ${no}`, X(m[0] + 0.5), Y(m[1] + m[2] / 2) + 17 * k); }
    // ประแจ
    if (built && built.cells) for (const id in built.cells.points) {
      const [i, j] = built.cells.points[id];
      c.fillStyle = css('--amber'); c.beginPath(); c.arc(X(i), Y(j), 6 * k, 0, 7); c.fill();
      c.fillStyle = css('--ink'); c.fillText(id, X(i), Y(j) - 15 * k);
    }
    // เสา: อยู่ซ้ายมือคนขับ หันขวาอยู่เหนือราง หันซ้ายอยู่ใต้ราง
    const names = {};
    if (built && built.cells) for (const id in built.cells.signals) names[built.cells.signals[id].join(',')] = id;
    for (const [i, j, dir] of plan.signals) {
      const up = dir === 'E' ? -1 : 1, x = X(i), y = Y(j) + up * 13 * k, r = 5.5 * k, name = names[`${i},${j},${dir}`];
      c.strokeStyle = css('--muted'); c.lineWidth = 2 * k;
      c.beginPath(); c.moveTo(x, Y(j) + up * 4 * k); c.lineTo(x, y); c.lineTo(x + (dir === 'E' ? 1 : -1) * 7 * k, y); c.stroke();
      c.fillStyle = name ? css('--red') : css('--muted'); c.beginPath(); c.arc(x + (dir === 'E' ? 1 : -1) * 12 * k, y, r, 0, 7); c.fill();
      if (name) { c.fillStyle = css('--ink'); c.fillText(name, x + (dir === 'E' ? 1 : -1) * 12 * k, y + up * 13 * k); }
    }
    for (const [i, j] of bad.nodes) { c.strokeStyle = css('--red'); c.lineWidth = 2.5 * k; c.beginPath(); c.arc(X(i), Y(j), 11 * k, 0, 7); c.stroke(); }
  }
  // ช่องที่ข้อความผิดชี้ถึง: ราง tN และ "ช่อง (x, y)"
  function badCells() {
    const segs = new Set(), nodes = [];
    if (!built || built.ok) return { segs, nodes };
    const T = (built.cells && built.cells.tracks) || {};
    for (const e of built.errors.slice(0, 3)) {
      for (const m of String(e).matchAll(/\bt(\d+)\b/g)) for (const s of T[m[0]] || []) segs.add(segKey(...s));
      for (const m of String(e).matchAll(/ช่อง \((\d+), (\d+)\)/g)) nodes.push([+m[1] - 1, +m[2] - 1]);
      for (const m of String(e).matchAll(/\((-?\d+), (-?\d+)\)/g)) if (!/ช่อง/.test(e)) nodes.push([Math.round(+m[1] / GRID), Math.round(+m[2] / GRID - 0.5)]);
    }
    return { segs, nodes };
  }

  /* ---------- แตะและลาก ---------- */
  const local = e => { const p = stage.toStage(e.clientX, e.clientY), r = stage.rectOf(cv); return { x: p.x - r.x, y: p.y - r.y }; };
  const nodeAt = p => ({ i: Math.round((p.x - view.ox) / (GRID * view.k)), j: Math.round((p.y - view.oy) / (GRID * view.k) - 0.5) });
  const inGrid = n => n.i >= 0 && n.i <= plan.cols && n.j >= 0 && n.j < plan.rows;
  function segAt(p) {
    let best = null, bd = 0.45;
    for (const s of plan.segs) {
      const [i, j, d] = s, x0 = X(i), y0 = Y(j), x1 = X(i + 1), y1 = Y(j + d), dx = x1 - x0, dy = y1 - y0;
      const f = Math.max(0, Math.min(1, ((p.x - x0) * dx + (p.y - y0) * dy) / (dx * dx + dy * dy)));
      const dist = Math.hypot(p.x - (x0 + dx * f), p.y - (y0 + dy * f)) / (GRID * view.k);
      if (dist < bd) { bd = dist; best = s; }
    }
    return best;
  }
  let drag = null;
  cv.addEventListener('pointerdown', e => {
    if (e.button) return;
    e.preventDefault(); try { cv.setPointerCapture(e.pointerId); } catch { /* pointer จำลองบางแบบจับไม่ได้ ลากต่อได้ตามปกติ */ }
    const p = local(e), n = nodeAt(p);
    drag = { start: plan, last: n, moved: false, cells: [], p0: p, work: plan };
    if (tool === 'erase') eraseAt(p);
    if (tool === 'plat') { const s = segAt(p); if (s) drag.cells.push(s); }
  });
  cv.addEventListener('pointermove', e => {
    if (!drag) return;
    const p = local(e), n = nodeAt(p);
    if (Math.hypot(p.x - drag.p0.x, p.y - drag.p0.y) > GRID * view.k * 0.35) drag.moved = true;
    // นับว่าถึงจุดถัดไปเมื่อนิ้วเข้าใกล้จุดนั้นจริง (ลากเฉียงผ่านกลางช่องจะไม่ไปติดจุดข้างเคียง)
    const near = Math.hypot(p.x - X(n.i), p.y - Y(n.j)) < GRID * view.k * 0.35;
    if (tool === 'track' && near && inGrid(n) && inGrid(drag.last) && (n.i !== drag.last.i || n.j !== drag.last.j)) {
      const a = n.i < drag.last.i ? n : drag.last, b = a === n ? drag.last : n, d = b.j - a.j;
      if (b.i - a.i === 1 && Math.abs(d) <= 1) {
        if (!drag.work.segs.some(s => s[0] === a.i && s[1] === a.j && s[2] === d)) drag.work = toggleSeg(drag.work, a.i, a.j, d);
        drag.last = n; plan = drag.work; draw();
      } else if (b.i !== a.i) drag.last = n;
    } else if (tool === 'plat') {
      const s = segAt(p);
      if (s && !drag.cells.some(c => segKey(...c) === segKey(...s))) { drag.cells.push(s); }
    } else if (tool === 'erase') eraseAt(p);
  });
  const end = () => {
    if (!drag) return;
    const d = drag; drag = null;
    plan = d.start;
    if (tool === 'track') {
      if (d.moved || d.work !== d.start) return change(d.work);
      const s = segAt(d.p0);
      if (s) change(toggleSeg(plan, ...s));
    } else if (tool === 'sigE' || tool === 'sigW') {
      const n = nodeAt(d.p0);
      if (inGrid(n)) change(toggleSignal(plan, n.i, n.j, tool === 'sigE' ? 'E' : 'W'));
    } else if (tool === 'plat') {
      const s = segAt(d.p0), cells = d.cells.length ? d.cells : s ? [s] : [];
      if (!cells.length) return;
      const has = plan.plats.find(q => segKey(q[0], q[1], q[2]) === segKey(...cells[0]));
      if (has && !d.moved) return change(setPlatform(plan, plan.plats.filter(q => q[3] === has[3]), 0));
      const used = new Set(plan.plats.map(q => q[3]));
      let no = 1; while (used.has(no)) no++;
      change(setPlatform(plan, cells, has ? has[3] : no));
    } else if (tool === 'erase') change(d.work);
  };
  cv.addEventListener('pointerup', end);
  cv.addEventListener('pointercancel', () => { if (drag) { plan = drag.start; drag = null; draw(); } });
  function eraseAt(p) {
    let w = drag.work;
    const s = segAt(p);
    if (s) w = toggleSeg(w, ...s);
    const n = nodeAt(p), cx = X(n.i), cy = Y(n.j);
    if (Math.hypot(p.x - cx, p.y - cy) < GRID * view.k * 0.5) for (const g of w.signals.filter(g => g[0] === n.i && g[1] === n.j)) w = toggleSignal(w, ...g);
    if (w !== drag.work) { drag.work = w; plan = w; draw(); }
  }

  /* ---------- ปุ่ม ---------- */
  function setTool(id) {
    tool = id;
    for (const b of root.querySelectorAll('[data-tool]')) b.setAttribute('aria-pressed', String(b.dataset.tool === id));
    rebuild();
  }
  root.addEventListener('click', e => {
    const t = e.target.closest('[data-tool]');
    if (t) return setTool(t.dataset.tool);
    const a = e.target.closest('[data-act]');
    if (!a) return;
    const act = a.dataset.act;
    if (act === 'exit') return onExit();
    if (act === 'undo') { if (undo.length) { plan = undo.pop(); savePlan(plan); rebuild(); } return; }
    if (act === 'table') return openTable();
    if (act === 'share') return openShare();
    if (act === 'try') return openTry();
    if (act === 'close') return closeSheet();
    if (act === 'copy') return copy(a.dataset.copy);
    if (act === 'paste') return pasteCode();
    if (act === 'era') return runEra(+a.dataset.era);
    if (act === 'mine') { plan = loadSaved(); received = null; note = ''; closeSheet(); return rebuild(); }
    if (act === 'reset') { change(starterPlan()); return closeSheet(); }
  });

  function openSheet(html, label) {
    sheet.innerHTML = `<div class="bld-card" role="dialog" aria-label="${esc(label)}"><button class="iconbtn bld-x" type="button" data-act="close" aria-label="ปิด"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>${html}</div>`;
    sheet.hidden = false;
    const f = sheet.querySelector('h3'); if (f) { f.tabIndex = -1; f.focus(); }
  }
  function closeSheet() { sheet.hidden = true; sheet.innerHTML = ''; }

  // ตารางอินเตอร์ล็อก: ชื่ออ่านง่ายแทนชื่อภายใน
  function openTable() {
    if (!built.ok) return;
    const L = built.station, T = routeTable(L), mid = L.size[0] / 2;
    const sideOf = tracks => { const xs = tracks.flatMap(t => L.E[t].pts.map(p => p[0])); return xs.reduce((a, b) => a + b, 0) / xs.length < mid ? 'ซ้าย' : 'ขวา'; };
    const nameOf = t => {
      const no = L.E[t].plat;
      if (no !== undefined) return `ทาง ${no}`;
      const pk = Object.values(L.portals).find(p => p.track === t);
      if (pk) return `ขา${pk.label.replace(/^ทาง/, '')}`;
      const sec = L.sections[L.sectionOf[t]];
      if (sec && sec.kind === 'throat') return `คอสถานีฝั่ง${sideOf(sec.tracks)}`;
      return L.buffers.includes(t) ? 'ทางตัน' : 'รางรอ';
    };
    const uniq = a => [...new Set(a)];
    const pts = list => list.map(([k, p]) => `${k} ${p}`).join(', ') || '–';
    const by = Object.fromEntries(T.rows.map(r => [r.id, r]));
    const title = r => `${esc(r.label)} → ${esc(r.dest.kind === 'platform' ? `ทาง ${r.dest.no}` : r.dest.kind === 'portal' ? r.dest.label : r.dest.kind === 'signal' ? r.dest.label : 'ทางตัน')}`;
    const rows = T.rows.map(r => `<tr><th scope="row">${title(r)}</th><td>${pts(r.points)}</td><td>${esc(uniq(r.tracks.map(nameOf)).join(', '))}</td>
      <td>${r.overlap ? esc(uniq(r.overlap.tracks.map(nameOf)).join(', ')) + (r.overlap.points.length ? `<br><small>${esc(pts(r.overlap.points))}</small>` : '') + (r.overlap.facing.length ? `<br><small>${esc(r.overlap.facing.join(', '))} ล็อกตามท่าที่อยู่</small>` : '') : r.dest.kind === 'buffer' ? 'ไม่มี (ทางตัน)' : '–'}</td>
      <td>${r.block ? esc(`ตอนฝั่ง${L.portals[r.block].label.replace(/^ทาง/, '')}`) : '–'}</td>
      <td>${r.conflicts.map(id => title(by[id])).join(', ') || '–'}</td></tr>`).join('');
    openSheet(`<h3>ตารางอินเตอร์ล็อกของผังนี้</h3>
      <p class="muted">เกมสร้างจากผังให้เอง เส้นทางที่อยู่ในช่อง "ขัดกับ" ตั้งพร้อมกันไม่ได้ อินเตอร์ล็อกจะไม่ยอมเปิดสัญญาณ</p>
      <div class="bld-scroll"><table class="bld-table"><thead><tr><th>เส้นทาง</th><th>ประแจและท่า</th><th>ตอนรางที่ต้องว่าง</th><th>ทางเผื่อหยุดเลย</th><th>ทางสะดวก</th><th>ขัดกับ</th></tr></thead><tbody>${rows}</tbody></table></div>
      <details class="bld-more"><summary>สิ่งที่เกมนี้ทำให้ง่ายกว่าของจริง</summary><ul class="bld-notes">
        <li>ในเกมนี้ ท่าปกติ (N) ของประแจคือทางตรง ท่า R คือทางแยก ของจริงการรถไฟเป็นผู้กำหนดท่าปกติ</li>
        <li>ในเกมนี้ ทางเผื่อหยุดเลยสองเส้นที่อยู่ในคอสถานีเดียวกันถือว่าขัดกันเสมอ ซึ่งเข้มกว่าของจริง</li>
        <li>เส้นทางจากเสาเดียวกันตั้งได้ทีละเส้นทางอยู่แล้ว จึงไม่เขียนในช่องขัดกัน</li>
        <li>ชื่อเสาเกมตั้งเอง: ปลายด้านขาล่องเลขคี่ ด้านขาขึ้นเลขคู่ เสาเข้าได้เลขน้อยสุด</li>
      </ul></details>`, 'ตารางอินเตอร์ล็อก');
  }

  function openShare() {
    const code = encodePlan(plan), link = shareLink(plan, location.href);
    openSheet(`<h3>แชร์ผัง</h3>
      <p class="muted">ข้อมูลผังทั้งหมดอยู่ในลิงก์ ไม่ต้องสมัครหรือใช้อินเทอร์เน็ตเพิ่ม เพื่อนเปิดลิงก์แล้วเกมตรวจผังก่อนเล่นทุกครั้ง</p>
      <label class="bld-field">ลิงก์<input readonly value="${esc(link || '')}" data-ref="link"></label>
      <div class="actions"><button class="btn sm go" type="button" data-act="copy" data-copy="link">คัดลอกลิงก์</button><button class="btn sm" type="button" data-act="copy" data-copy="code">คัดลอกรหัส</button></div>
      <input type="hidden" value="${esc(code || '')}" data-ref="code">
      <label class="bld-field">เปิดผังจากรหัสหรือลิงก์ของเพื่อน<textarea rows="2" data-ref="paste" placeholder="วางรหัสที่ขึ้นต้นด้วย SJ1. หรือทั้งลิงก์"></textarea></label>
      <div class="actions"><button class="btn sm" type="button" data-act="paste">เปิดผังนี้</button><button class="btn sm quiet" type="button" data-act="reset">เริ่มผังใหม่</button></div>
      <p class="bld-err" data-ref="perr" role="alert"></p>`, 'แชร์ผัง');
  }
  async function copy(which) {
    const el = sheet.querySelector(`[data-ref="${which}"]`), text = el ? el.value : '';
    let ok = false;
    try { if (navigator.clipboard) { await navigator.clipboard.writeText(text); ok = true; } } catch { /* ไม่ได้รับอนุญาต ใช้วิธีเลือกข้อความแทน */ }
    if (!ok && el && el.type !== 'hidden') { el.focus(); el.select(); try { ok = document.execCommand('copy'); } catch { ok = false; } }
    const b = sheet.querySelector(`[data-copy="${which}"]`);
    if (b) b.textContent = ok ? 'คัดลอกแล้ว' : 'กดค้างที่ช่องเพื่อคัดลอก';
  }
  function pasteCode() {
    const r = openShared(sheet.querySelector('[data-ref="paste"]').value);
    if (r) closeSheet(); else sheet.querySelector('[data-ref="perr"]').textContent = note;
  }
  // ผังจากรหัส: ถอดรหัส (ไม่พังแม้รหัสเสีย) แล้วโหลดเข้ากริด ตัวตรวจผังทำงานทันทีใน rebuild()
  function openShared(text) {
    const r = decodeShare(text);
    if (!r.ok) { note = `${r.errors[0]}`; rebuild(); return false; }
    undo.push(plan); plan = r.plan; received = r.plan;
    const b = buildPlan(plan);
    note = b.ok ? `ผังที่ได้รับ: ${plan.name || 'ไม่มีชื่อ'} (ยังไม่บันทึกทับผังของคุณ จนกว่าจะแก้)` : 'ผังที่ได้รับยังไม่ผ่านตัวตรวจผัง เล่นไม่ได้จนกว่าจะแก้';
    rebuild(); return true;
  }

  function openTry() {
    if (!built.ok) return;
    const free = !wallet || !!received, counts = planCount(plan);
    const due = free ? 0 : wallet.layoutCharge(counts), owned = free ? eras.length - 1 : wallet.owned(CUSTOM), sel = free ? 2 : wallet.selected(CUSTOM);
    const left = free ? Infinity : wallet.balance() - Math.max(0, due);
    const btn = (e, i) => {
      const cost = free ? 0 : econ.upgradeCost(owned, i), ok = cost <= left;
      const gain = econ ? econ.upgradeOf(i).gain : '';
      return `<li class="fr-lv${i === sel ? ' on' : ''}"><div><b>${esc(e.name)}</b>${gain ? `<span>${esc(gain)}</span>` : ''}</div>
        <button class="btn sm${i === sel ? ' go' : ''}" type="button" data-act="era" data-era="${i}" ${ok ? '' : 'disabled'}>${cost ? `อัปเกรด ${cost} แล้วเดินรถ` : 'เดินรถ'}</button></li>`;
    };
    const head = free
      ? (received ? 'ผังที่ได้รับจากเพื่อนเล่นแบบทดลอง ไม่ใช้งบ เลือกระบบสัญญาณได้ทุกขั้น' : 'เลือกระบบสัญญาณ')
      : `งบคงเหลือ ${wallet.balance()} · ${due > 0 ? `ค่าก่อสร้างผังนี้ ${due} (จ่ายตอนเริ่มเดินรถ)` : due < 0 ? `รื้อชิ้นที่ยืนยันแล้วได้คืน ${-due}` : 'ผังนี้ยืนยันแล้ว ไม่มีค่าก่อสร้างเพิ่ม'}`;
    const short = !free && due > wallet.balance() ? `<p class="bld-err">งบไม่พอสำหรับค่าก่อสร้าง ขาดอีก ${due - wallet.balance()} เล่นภารกิจให้ได้ดาวหรือคะแนนมากกว่าเดิมเพื่อเพิ่มงบ หรือรื้อชิ้นที่ไม่ใช้ออก</p>` : '';
    openSheet(`<h3>ทดลองเดินรถ</h3><p class="muted">${esc(head)}</p>${short}
      <p class="muted">เกมจัดตารางขบวนให้และตรวจก่อนว่าเล่นจบได้ ผังที่สร้างเองไม่นับดาว อัปเกรดของผังนี้ไม่มีผลกับภารกิจสอน</p>
      <ol class="fr-levels">${short ? '' : eras.map(btn).join('')}</ol>
      <p class="bld-err" data-ref="terr" role="alert"></p>`, 'ทดลองเดินรถ');
  }
  function runEra(era) {
    const err = t => { sheet.querySelector('[data-ref="terr"]').textContent = t; };
    const up = econ ? econ.upgradeOf(era) : { speed: 1, grace: 1 };
    // ตรวจว่าเกมจัดตารางขบวนได้ก่อนเก็บเงิน
    const r = freePlayPack({ ...built.station, name: plan.name || 'ผังของฉัน' }, eras, { era, speed: up.speed, grace: up.grace });
    if (!r.ok) return err(r.reason);
    if (wallet && !received) {
      const counts = planCount(plan), due = wallet.layoutCharge(counts), cost = econ.upgradeCost(wallet.owned(CUSTOM), era);
      if (Math.max(0, due) + cost > wallet.balance()) return err(`งบไม่พอ ต้องใช้ ${Math.max(0, due) + cost} มีอยู่ ${wallet.balance()}`);
      if (due !== 0 && !wallet.confirmLayout(counts).ok) return err('ยืนยันผังไม่สำเร็จ');
      const c = wallet.choose(CUSTOM, era);
      if (!c.ok) return err(c.reason);
    }
    closeSheet();
    rebuild();
    onPlay(r.pack, plan.name || 'ผังของฉัน');
  }

  const off = stage.onResize(() => requestAnimationFrame(fit));
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => fit()) : null;
  if (ro) ro.observe(board);
  const mq = window.matchMedia('(prefers-color-scheme: dark)'), repaint = () => draw();
  mq.addEventListener('change', repaint);
  setTool('track');
  requestAnimationFrame(fit);

  return {
    // รหัสจากลิงก์ #share=... (เปิดหน้าโหมดสร้างพร้อมผังของเพื่อน)
    openShared,
    get plan() { return plan; }, get built() { return built; }, get received() { return received; },
    setPlan(p) { change(normalizePlan(p).plan || plan); },
    // สถานะที่ต้องคงไว้ระหว่างออกไปทดลองเดินรถแล้วกลับมา
    memo: () => ({ plan, received, note, undo: [...undo] }),
    restore(m) { plan = m.plan; received = m.received; note = m.note; undo = [...m.undo]; rebuild(); },
    refresh: fit,
    destroy() { off(); if (ro) ro.disconnect(); mq.removeEventListener('change', repaint); root.innerHTML = ''; },
  };
}
