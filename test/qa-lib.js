// QA อิสระ: ของใช้ร่วมของสคริปต์ test/qa-*.js (ไม่แก้โค้ดเกม เสิร์ฟ dist/ จากโฟลเดอร์ย่อยผ่าน test/lib/serve.js)
const fs = require('fs');
const path = require('path');
const { serveGame, prefer2D } = require('./lib/serve.js');

const shots = path.join(__dirname, 'screenshots');
const SAVE_KEY = 'sj-signalbox-save';
const IDS = ['tk-1', 'tk-2', 'tk-3', 'wp-1', 'wp-2', 'wp-3', 'nt-1', 'nt-2', 'kb-1', 'kb-2', 'kb-3', 'np-1', 'np-2', 'np-3'];
const ST = { tk: 'tha-kilen', wp: 'wang-pho', nt: 'nam-tok', kb: 'kanchanaburi', np: 'nong-pla-duk-jn' };
const stationOf = id => ST[id.split('-')[0]];
const VIEWS = [
  { name: '844x390', width: 844, height: 390, dpr: 2, touch: true },
  { name: '390x844', width: 390, height: 844, dpr: 2, touch: true },
  { name: '1180x820', width: 1180, height: 820, dpr: 2, touch: true },
  { name: '1280x800', width: 1280, height: 800, dpr: 1, touch: false },
];
const sleep = ms => new Promise(r => setTimeout(r, ms));
// เซฟตั้งต้น: { 'tk-1': 3, ... } -> ข้อความเซฟรุ่น 2
const saveText = (stars, flags) => JSON.stringify({ v: 2, packs: { namtok: { stars: [], best: Object.fromEntries(Object.entries(stars).map(([k, n]) => [k, { stars: n, score: n * 100 }])) } }, ...(flags ? { flags } : {}) });

function createReport(name) {
  const fails = [], notes = [];
  return {
    fails, notes,
    fail(m) { fails.push(m); console.log('  [FAIL] ' + m); },
    note(m) { notes.push(m); console.log('  [note] ' + m); },
    check(ok, m) { if (!ok) this.fail(m); return !!ok; },
    ok(m) { console.log('  [ok] ' + m); },
    done() { console.log(`\n== ${name}: ${fails.length ? 'ไม่ผ่าน ' + fails.length + ' ข้อ' : 'ผ่าน'} (หมายเหตุ ${notes.length})`); return fails.length; },
  };
}

async function launch() {
  const { chromium } = require('playwright');
  fs.mkdirSync(shots, { recursive: true });
  const game = await serveGame(), b = await chromium.launch();
  return { game, b, async close() { await b.close(); game.close(); } };
}

// เปิดหน้าในบริบทใหม่ (เซฟเปล่า) เก็บ console error/warning, page error, คำขอที่ล้ม และคำขอออกนอกเครื่อง
async function open(env, v, scheme, R, { tag = `${v.name}-${scheme}`, hash = '', init = null, save = null, reducedMotion = null, ctx = null } = {}) {
  ctx ||= await env.b.newContext({ viewport: { width: v.width, height: v.height }, deviceScaleFactor: v.dpr, hasTouch: v.touch, isMobile: false, colorScheme: scheme, ...(reducedMotion ? { reducedMotion } : {}) });
  if (init) await ctx.addInitScript(init);
  if (!env.view3d) await prefer2D(ctx);   // ภาพตรวจเดิมเป็นแผงผังเส้น ตั้ง env.view3d = ใช้ค่าเริ่มต้นของเกม (3 มิติ)
  if (save) await ctx.addInitScript(([k, t]) => { try { if (!sessionStorage.getItem('qa-seeded')) { localStorage.setItem(k, t); sessionStorage.setItem('qa-seeded', '1'); } } catch { /* ไม่มีที่เก็บ */ } }, [SAVE_KEY, save]);
  const p = await ctx.newPage();
  const log = { requests: [], external: [], errors: [], warnings: [] };
  p.on('pageerror', e => { log.errors.push(e.message); R.fail(`${tag}: page error: ${e.message}\n${(e.stack || '').split('\n').slice(0, 4).join('\n')}`); });
  p.on('console', m => { if (m.type() === 'error') { log.errors.push(m.text()); R.fail(`${tag}: console error: ${m.text()}`); } else if (m.type() === 'warning') { log.warnings.push(m.text()); R.fail(`${tag}: console warning: ${m.text()}`); } });
  p.on('requestfailed', r => R.fail(`${tag}: โหลดไม่ได้: ${r.url()} ${r.failure() && r.failure().errorText}`));
  p.on('request', r => { log.requests.push(r.url()); if (!/^(data|blob):/.test(r.url()) && !r.url().startsWith(env.game.origin)) { log.external.push(r.url()); R.fail(`${tag}: คำขอออกนอกเครื่อง: ${r.url()}`); } });
  p.on('response', r => { if (r.status() >= 400) R.fail(`${tag}: HTTP ${r.status()}: ${r.url()}`); });
  await p.goto(env.game.url + hash, { waitUntil: 'load' });
  await p.waitForFunction(() => !!window.__sjApp);
  await p.evaluate(() => document.fonts.ready);
  return { ctx, p, log, v, tag };
}

const tapXY = (p, v, x, y) => (v.touch ? p.touchscreen.tap(x, y) : p.mouse.click(x, y));
// แตะกลาง element ด้วยพิกัดจอจริง ตรวจก่อนว่าจุดนั้นเป็นของ element นี้จริง (ไม่มีอะไรบัง)
async function tapEl(p, v, sel, R, where = '') {
  const info = await p.evaluate(s => {
    const el = document.querySelector(s); if (!el) return null;
    const r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2, top = document.elementFromPoint(x, y);
    return { x, y, w: r.width, h: r.height, hitOk: !!top && (el === top || el.contains(top)), top: top ? (top.className && top.className.baseVal !== undefined ? top.tagName : `${top.tagName}.${top.className}`) : 'ไม่มี', vw: innerWidth, vh: innerHeight };
  }, sel);
  if (!info) { R.fail(`${where}: ไม่พบ ${sel}`); return false; }
  if (!info.hitOk) R.fail(`${where}: จุดกลางของ ${sel} ถูกบังโดย ${info.top}`);
  if (info.x < 0 || info.y < 0 || info.x > info.vw || info.y > info.vh) R.fail(`${where}: ${sel} อยู่นอกจอ (${info.x.toFixed(0)},${info.y.toFixed(0)})`);
  if (info.w < 39.5 || info.h < 39.5) R.fail(`${where}: เป้าแตะ ${sel} เล็ก ${info.w.toFixed(0)}x${info.h.toFixed(0)}`);
  await tapXY(p, v, info.x, info.y);
  return true;
}

// ตรวจทุกอย่างที่กดได้และมองเห็น: ขนาด >= 40 px บนจอจริง อยู่ในจอ ไม่ซ้อนกับปุ่มอื่น จุดกลางไม่ถูกบัง + ข้อความที่ถูกตัด (ellipsis/ล้นกล่อง)
async function audit(p, v, R, where, { allowClip = [] } = {}) {
  const res = await p.evaluate(({ W, H }) => {
    const out = { small: [], off: [], overlap: [], covered: [], clipped: [] };
    const vis = el => { if (el.closest('[hidden]')) return false; const dt = el.closest('details:not([open])'); if (dt && el.tagName !== 'SUMMARY') return false; const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0 || cs.pointerEvents === 'none') return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const name = el => (el.getAttribute('aria-label') || el.textContent || el.className).trim().replace(/\s+/g, ' ').slice(0, 28);
    const screen = [...document.querySelectorAll('.screen')].find(s => !s.hidden) || document.body;
    const els = [...screen.querySelectorAll('a,button,summary,[role="button"]')].filter(vis);
    const rects = els.map(el => el.getBoundingClientRect());
    els.forEach((el, i) => {
      const r = rects[i];
      // ลิงก์ในบรรทัดข้อความ (เครดิต) ไม่ใช่ปุ่ม: รายงานแยก
      const inline = el.tagName === 'A' && getComputedStyle(el).display.startsWith('inline') && !el.classList.contains('btn');
      if (r.right < 0 || r.bottom < 0 || r.left > W || r.top > H) return; // อยู่ในส่วนที่เลื่อนพ้นไป
      if (r.width < 39.5 || r.height < 39.5) out.small.push(`${inline ? '(ลิงก์ในข้อความ) ' : ''}${name(el)}: ${r.width.toFixed(0)}x${r.height.toFixed(0)}`);
      const mk = el.classList.contains('mk'); // ปุ่มสถานีบนแผนที่เลื่อนพ้นจอ/อยู่ใต้แผ่นข้อมูลได้ตามปกติ
      const scroller = (() => { for (let a = el.parentElement; a; a = a.parentElement) { const c = getComputedStyle(a); if (/(auto|scroll)/.test(c.overflowY) && a.scrollHeight > a.clientHeight + 1) return a; } return null; })();
      if (scroller && (r.top < -0.5 || r.bottom > H + 0.5 || r.left < -0.5 || r.right > W + 0.5)) { out.scroll = (out.scroll || 0) + 1; return; }
      if (!mk && (r.left < -0.5 || r.top < -0.5 || r.right > W + 0.5 || r.bottom > H + 0.5)) out.off.push(`${name(el)}: ${[r.left, r.top, r.right, r.bottom].map(n => n.toFixed(0))}`);
      const cx = Math.min(W - 1, Math.max(0, r.left + r.width / 2)), cy = Math.min(H - 1, Math.max(0, r.top + r.height / 2)), top = document.elementFromPoint(cx, cy);
      if (top && !(el === top || el.contains(top) || top.contains(el)) && !(mk && (top.closest('.sheet') || top.closest('.map-top') || top.closest('.map-side') || top.closest('.map-foot')))) out.covered.push(`${name(el)} ถูกบังโดย ${top.tagName}.${typeof top.className === 'string' ? top.className : ''}`);
      for (let j = i + 1; j < els.length; j++) {
        if (el.contains(els[j]) || els[j].contains(el)) continue;
        const q = rects[j], ox = Math.min(r.right, q.right) - Math.max(r.left, q.left), oy = Math.min(r.bottom, q.bottom) - Math.max(r.top, q.top);
        if (ox > 2 && oy > 2) out.overlap.push(`${name(el)} <-> ${name(els[j])}: ซ้อน ${ox.toFixed(0)}x${oy.toFixed(0)}`);
      }
    });
    // ข้อความถูกตัด: กล่องที่ overflow ซ่อนและเนื้อหากว้าง/สูงกว่ากล่อง
    for (const el of screen.querySelectorAll('*')) {
      if (!vis(el) || !el.textContent.trim() || el.children.length > 3) continue;
      const cs = getComputedStyle(el);
      if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
      if (cs.overflowY === 'auto' || cs.overflowY === 'scroll') continue;
      if (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1) out.clipped.push(`<${el.tagName.toLowerCase()} class="${el.className}"> "${el.textContent.trim().replace(/\s+/g, ' ').slice(0, 60)}" (${el.scrollWidth}>${el.clientWidth} หรือ ${el.scrollHeight}>${el.clientHeight})`);
    }
    return out;
  }, { W: v.width, H: v.height });
  for (const m of res.small) (m.startsWith('(ลิงก์') ? R.note : R.fail).call(R, `${where}: เป้าแตะเล็กกว่า 40 px: ${m}`);
  for (const m of res.off) R.fail(`${where}: ล้นจอ: ${m}`);
  for (const m of res.overlap) R.fail(`${where}: ปุ่มซ้อนกัน: ${m}`);
  for (const m of res.covered) R.fail(`${where}: ${m}`);
  for (const m of res.clipped) if (!allowClip.some(a => m.includes(a)) && !/22>19\)$/.test(m)) R.note(`${where}: ข้อความถูกตัด: ${m}`);
  return res;
}

// เป้าแตะบนแผง (เสา/ประแจ) เป็น px จอจริง: เส้นผ่านศูนย์กลาง และระยะระหว่างศูนย์กลางที่ใกล้สุด + ทุกเป้าอยู่ในจอและแตะกลางได้เป้านั้น
async function auditBoard(p, v, R, where) {
  const res = await p.evaluate(() => {
    const P = window.__sjApp.play, G = P.geom(), k = P.scale(), out = { scale: k, dia: 88 * k, n: 0, minGap: Infinity, pair: '', wrong: [], off: [] };
    const cv = document.querySelector('.pl-board canvas').getBoundingClientRect();
    const T = [...Object.keys(G.signals).map(id => ({ kind: 'signal', id })), ...Object.keys(G.points).map(id => ({ kind: 'point', id }))];
    const C = T.map(t => ({ t, c: P.targetClient(t) }));
    out.n = C.length;
    for (const { t, c } of C) {
      const b = P.toBoard(c.x, c.y), h = P.hitTest(b.x, b.y);
      if (!h || h.kind !== t.kind || h.id !== t.id) out.wrong.push(`${t.kind}:${t.id} -> ${h ? h.kind + ':' + h.id : 'ไม่โดน'}`);
      if (c.x < cv.left + 14 || c.x > cv.right - 14 || c.y < cv.top + 14 || c.y > cv.bottom - 14) out.off.push(`${t.kind}:${t.id} ใกล้/เลยขอบแผง (${c.x.toFixed(0)},${c.y.toFixed(0)}) แผง ${[cv.left, cv.top, cv.right, cv.bottom].map(n => n.toFixed(0))}`);
    }
    for (let i = 0; i < C.length; i++) for (let j = i + 1; j < C.length; j++) { const d = Math.hypot(C[i].c.x - C[j].c.x, C[i].c.y - C[j].c.y); if (d < out.minGap) { out.minGap = d; out.pair = `${C[i].t.id}-${C[j].t.id}`; } }
    return out;
  });
  if (res.dia < 40) R.fail(`${where}: เป้าแตะบนแผงเส้นผ่านศูนย์กลาง ${res.dia.toFixed(1)} px (< 40)`);
  if (res.minGap < 40) R.fail(`${where}: เป้า ${res.pair} ห่างกันแค่ ${res.minGap.toFixed(1)} px บนจอ (< 40: เป้าที่ใช้ได้จริงแคบกว่า 40)`);
  for (const m of res.wrong) R.fail(`${where}: แตะกลางเป้าแล้วโดนผิด ${m}`);
  for (const m of res.off) R.fail(`${where}: ${m}`);
  return res;
}

const startTap = async (p, v, R, where) => { await p.waitForFunction(() => window.__sjApp.play && window.__sjApp.play.g && window.__sjApp.play.g.state === 'intro'); await tapEl(p, v, '.pl-card [data-act="start"]', R, where); };

// เล่นด่านที่เปิดอยู่: ถามคำใบ้ (อ่านอย่างเดียว) แล้วแตะจอจริงที่พิกัดของเป้า
//   manual = true: หยุดเวลาจริง เดินเวลาด้วย step() (เร็ว ผลซ้ำได้), false: เวลาจริง (เหมือนผู้เล่น)
//   real = false: สั่ง press ผ่าน hook แทนการแตะ; lag = วินาทีในเกมที่หน่วงก่อนแตะแต่ละครั้ง (เล่นให้ได้คะแนนแย่)
async function playLevel(p, v, R, where, { manual = true, real = true, lag = 0, onMid = null, maxTaps = 500 } = {}) {
  const key = t => t && `${t.kind}:${t.id ?? t.no}`;
  await p.evaluate(m => window.__sjApp.play.setManual(m), manual);
  let taps = 0, missed = 0, midDone = !onMid, last = null, sameCount = 0;
  const t0 = Date.now();
  for (let i = 0; i < 6000; i++) {
    const s = await p.evaluate(({ manual, lag }) => {
      const P = window.__sjApp.play, g = P.g;
      if (g.state !== 'play') return { state: g.state };
      let t = P.nextTarget();
      if (manual) { for (let n = 0; !t && n < 40 && g.state === 'play'; n++) { P.step(0.05); t = P.nextTarget(); } if (t && lag) { P.step(lag); t = g.state === 'play' ? P.nextTarget() : null; } }
      if (g.state !== 'play') return { state: g.state };
      const at = t ? P.targetClient(t) : null;
      return { state: g.state, t, at, time: g.time, trains: g.trains.length, stopped: g.trains.filter(x => x.stopped).length, hitAt: at ? (() => { const bp = P.toBoard(at.x, at.y); return P.hitTest(bp.x, bp.y); })() : null };
    }, { manual, lag });
    if (s.state !== 'play') break;
    if (!midDone && (s.trains >= 2 || (s.trains === 1 && s.time > 10))) { midDone = true; await sleep(80); await onMid(); }
    if (!s.t) { if (!manual) await sleep(100); if (Date.now() - t0 > 240000) { R.fail(`${where}: เกิน 4 นาทีจริงแล้วยังไม่จบ`); break; } continue; }
    if (key(s.hitAt) !== key(s.t)) { R.fail(`${where}: จุดแตะของ ${key(s.t)} ไปโดน ${key(s.hitAt)}`); break; }
    if (s.at.x < 0 || s.at.y < 0 || s.at.x > v.width || s.at.y > v.height) { R.fail(`${where}: เป้า ${key(s.t)} อยู่นอกจอ ${JSON.stringify(s.at)}`); break; }
    if (real) await tapXY(p, v, s.at.x, s.at.y); else await p.evaluate(t => window.__sjApp.play.press(t), s.t);
    taps++;
    if (!manual) await sleep(140);
    if (key(s.t) === last) { if (++sameCount >= 6) { missed++; } } else sameCount = 0;
    last = key(s.t);
    if (taps > maxTaps) { R.fail(`${where}: แตะเกิน ${maxTaps} ครั้งแล้วยังไม่จบ (คำใบ้ล่าสุด ${key(s.t)})`); break; }
  }
  if (!midDone) await onMid();
  const end = await p.evaluate(() => { const P = window.__sjApp.play, g = P.g, c = document.querySelector('.pl-card'); return { state: g.state, done: g.done, total: g.lv.sched.length, score: Math.round(g.score), max: g.max, code: g.result && g.result.code, stars: g.result && g.result.stars, time: +g.time.toFixed(1), card: c ? c.textContent.replace(/\s+/g, ' ').trim() : '' }; });
  return { ...end, taps, missed, realMs: Date.now() - t0 };
}

const shot = (p, name) => p.screenshot({ path: path.join(shots, `qa-${name}.png`) });
const progress = p => p.evaluate(() => { const P = window.__sjApp.progress(); return P && { total: P.totalStars, next: P.next, stations: P.stations.map(s => ({ id: s.id, state: s.state, stars: s.stars, missions: s.missions.map(m => ({ id: m.id, stars: m.stars, unlocked: m.unlocked })) })) }; });
const mapSettled = p => p.waitForFunction(() => { const m = window.__sjApp.map; return m && !m.animating(); }, null, { polling: 100 });

module.exports = { fs, path, shots, SAVE_KEY, IDS, ST, stationOf, VIEWS, sleep, saveText, createReport, launch, open, tapXY, tapEl, audit, auditBoard, startTap, playLevel, shot, progress, mapSettled };
