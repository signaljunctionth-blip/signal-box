// ตรวจเจาะจุด WP8 (สายอีสาน + หน้าเลือกสาย) — ใช้: node test/qa-wp8.js (ต้อง build ก่อน หรือตั้ง SJ_URL)
// 1) หน้าเลือกสาย 4 จอ เปิด/ปิด (ปุ่มปิด Esc แตะพื้นหลัง) ล้นจอ เป้าแตะ  2) เซฟใหม่ ล็อก ข้ามบทสอน เปิดเองครั้งเดียว
// 3) เล่น br-1 sr-1 tc-1 ด้วยการแตะจริง 844×390 / 390×844  4) ป้ายบนผัง 3 สถานี สว่าง/มืด  5) error + เซฟเก่า namtok
const { path, shots, sleep, createReport, launch, open, tapXY, tapEl, audit, auditBoard, startTap, playLevel, VIEWS } = require('./qa-lib.js');
const NAMTOK = require('../data/levels/namtok.json'), ISAN = require('../data/levels/isan.json');
const R = createReport('qa-wp8');
const ONLY = process.env.QA_ONLY ? process.env.QA_ONLY.split(',') : null, want = k => !ONLY || ONLY.includes(k);
const V = Object.fromEntries(VIEWS.map(v => [v.name, v]));
const bestOf = (ids, n = 3) => Object.fromEntries(ids.map(id => [id, { stars: n, score: n * 300 }]));
const mkSave = ({ namtok = {}, isan = {}, flags = null } = {}) => JSON.stringify({ v: 2, packs: { namtok: { stars: [], best: namtok }, ...(Object.keys(isan).length ? { isan: { stars: [], best: isan } } : {}) }, ...(flags ? { flags } : {}) });
const NT_ALL = bestOf(NAMTOK.levels.map(l => l.id));
let nShots = 0;
const snap = async (p, name) => { if (nShots >= 16) return R.note(`ข้ามภาพ ${name} (ครบ 16 แล้ว)`); nShots++; await p.screenshot({ path: path.join(shots, `wp8-${name}.png`) }); };
const mapReady = p => p.waitForFunction(() => window.__sjApp.map && window.__sjApp.map.camera && window.__sjApp.map.camera(), null, { timeout: 20000 });
const isPicking = p => p.evaluate(() => window.__sjApp.map.picking());

/* ---------- 1) หน้าเลือกสาย ---------- */
async function pickChecks(env) {
  for (const v of VIEWS) for (const scheme of ['light', 'dark']) {
    if (scheme === 'dark' && !['844x390', '390x844'].includes(v.name)) continue;
    const tag = `pick ${v.name} ${scheme}`, P = await open(env, v, scheme, R, { tag, hash: '#map', reducedMotion: 'reduce' });
    const p = P.p; await mapReady(p); await sleep(300);
    await tapEl(p, v, '.map-top [data-act="pick"]', R, tag); await sleep(250);
    R.check(await isPicking(p), `${tag}: แตะ "เลือกสาย" แล้วหน้าเลือกสายไม่เปิด`);
    const g = await p.evaluate(() => {
      const el = document.querySelector('.pick'), r = el.getBoundingClientRect(), st = document.querySelector('.stage, #stage') || document.body;
      const cards = [...el.querySelectorAll('.pick-c')].map(c => { const q = c.getBoundingClientRect(); return { line: c.dataset.line, cls: c.className, w: q.width, h: q.height, txt: c.textContent.replace(/\s+/g, ' ').trim(), clip: c.scrollWidth > c.clientWidth + 1 || c.scrollHeight > c.clientHeight + 1 }; });
      const txtClip = [...el.querySelectorAll('b,small,span,p,h2')].filter(e => e.offsetWidth && (e.scrollWidth > e.clientWidth + 1) && getComputedStyle(e).overflow !== 'visible').map(e => e.textContent.trim().slice(0, 40));
      return { r: [r.left, r.top, r.right, r.bottom], vw: innerWidth, vh: innerHeight, scroll: el.scrollHeight - el.clientHeight, cards, txtClip, lead: el.querySelector('.pick-lead').textContent };
    });
    const [l, t, rr, b] = g.r;
    R.check(l >= -0.5 && t >= -0.5 && rr <= g.vw + 0.5 && b <= g.vh + 0.5, `${tag}: หน้าเลือกสายล้นจอ ${g.r.map(n => n.toFixed(0))} จอ ${g.vw}x${g.vh}`);
    R.check(g.scroll <= 1, `${tag}: หน้าเลือกสายต้องเลื่อน ${g.scroll}px`);
    R.check(g.cards.length === 6, `${tag}: การ์ดสาย ${g.cards.length} ใบ (ต้อง 6)`);
    for (const c of g.cards) { R.check(c.w >= 39.5 && c.h >= 39.5, `${tag}: การ์ด ${c.line} เล็ก ${c.w.toFixed(0)}x${c.h.toFixed(0)}`); if (c.clip) R.note(`${tag}: การ์ด ${c.line} เนื้อหาล้นกล่อง "${c.txt}"`); }
    if (g.txtClip.length) R.note(`${tag}: ข้อความถูกตัด ${g.txtClip.join(' | ')}`);
    const ne = g.cards.find(c => c.line === 'northeast');
    R.check(ne && /locked/.test(ne.cls) && ne.txt.includes('ผ่านสถานีน้ำตกก่อน'), `${tag}: สายอีสาน (เซฟใหม่) ต้องล็อกและบอก "ผ่านสถานีน้ำตกก่อน": ${ne && ne.txt}`);
    const au = await p.evaluate(() => {
      const els = [...document.querySelectorAll('.pick button')].filter(e => e.offsetWidth), rs = els.map(e => e.getBoundingClientRect()), out = [];
      const nm = e => (e.getAttribute('aria-label') || e.textContent).trim().replace(/\s+/g, ' ').slice(0, 24);
      els.forEach((e, i) => { const r = rs[i], x = r.left + r.width / 2, y = r.top + r.height / 2, top = document.elementFromPoint(x, y);
        if (!top || !(top === e || e.contains(top))) out.push(`${nm(e)} จุดกลางถูกบังโดย ${top ? top.tagName + '.' + top.className : 'ไม่มี'}`);
        for (let j = i + 1; j < els.length; j++) { const q = rs[j], ox = Math.min(r.right, q.right) - Math.max(r.left, q.left), oy = Math.min(r.bottom, q.bottom) - Math.max(r.top, q.top); if (ox > 1 && oy > 1) out.push(`${nm(e)} ซ้อน ${nm(els[j])} ${ox.toFixed(0)}x${oy.toFixed(0)}`); } });
      return out; });
    for (const m of au) R.fail(`${tag}: ${m}`);
    await snap(p, `pick-${v.name}-${scheme}`);
    if (scheme === 'dark') { await P.ctx.close(); continue; }
    // ปิดด้วยปุ่ม X
    await tapEl(p, v, '.pick [data-act="pick-close"]', R, tag + ' ปุ่มปิด'); await sleep(200);
    R.check(!(await isPicking(p)), `${tag}: แตะปุ่มปิดแล้วไม่ปิด`);
    const focusOk = await p.evaluate(() => document.activeElement && document.activeElement.dataset && document.activeElement.dataset.act);
    if (focusOk !== 'pick' && v.touch === false) R.note(`${tag}: ปิดแล้วโฟกัสไม่กลับปุ่มเลือกสาย (${focusOk})`);
    // Esc
    await tapEl(p, v, '.map-top [data-act="pick"]', R, tag); await sleep(200);
    await p.keyboard.press('Escape'); await sleep(200);
    R.check(!(await isPicking(p)), `${tag}: กด Esc แล้วไม่ปิด`);
    // แตะพื้นหลัง: หาจุดบนจอที่เป็น .pick-back จริง
    await tapEl(p, v, '.map-top [data-act="pick"]', R, tag); await sleep(200);
    const bk = await p.evaluate(() => { const c = [[8, 8], [innerWidth - 8, innerHeight - 8], [innerWidth - 8, 8], [8, innerHeight - 8], [innerWidth / 2, innerHeight - 6], [innerWidth / 2, 6], [6, innerHeight / 2], [innerWidth - 6, innerHeight / 2]];
      for (const [x, y] of c) { const e = document.elementFromPoint(x, y); if (e && e.classList.contains('pick-back')) return { x, y }; } return null; });
    if (R.check(bk, `${tag}: ไม่มีจุดพื้นหลังให้แตะปิด (หน้าเลือกสายเต็มจอ)`)) {
      await tapXY(p, v, bk.x, bk.y); await sleep(250);
      R.check(!(await isPicking(p)), `${tag}: แตะพื้นหลังแล้วไม่ปิด`);
      // แตะพื้นหลังต้องไม่ไปโดนสถานี/ปุ่มบนแผนที่ (แผ่นสถานีไม่เปิด)
      R.check(await p.evaluate(() => !window.__sjApp.map.openId()), `${tag}: แตะพื้นหลังปิดแล้วทะลุไปเปิดแผ่นสถานี`);
    }
    await P.ctx.close();
  }
}

/* ---------- 2) เซฟใหม่: ล็อก / ข้ามบทสอน / เปิดเองครั้งเดียว ---------- */
async function saveFlow(env) {
  const v = V['844x390'];
  { // เซฟใหม่ -> บุรีรัมย์ล็อก -> ข้ามบทสอน -> เล่นได้
    const tag = 'เซฟใหม่ 844', P = await open(env, v, 'light', R, { tag, hash: '#map/buri-ram', reducedMotion: 'reduce' }), p = P.p;
    await mapReady(p); await sleep(400);
    const sh = await p.textContent('.sheet');
    R.check(/ยังล็อก/.test(sh) && sh.includes('ผ่านสถานีน้ำตกก่อน') && await p.locator('.sheet [data-act="play"]').count() === 0, `${tag}: แผ่นบุรีรัมย์ไม่บอกล็อก/เงื่อนไข: ${sh.replace(/\s+/g, ' ').slice(0, 160)}`);
    await p.goto(env.game.url + '#play/buri-ram/br-1'); await sleep(500);
    R.check(await p.evaluate(() => location.hash !== '#play/buri-ram/br-1' && !window.__sjApp.play), `${tag}: ลิงก์ตรงเข้า br-1 ได้ทั้งที่ล็อก`);
    await p.evaluate(() => window.__sjApp.router.go({ screen: 'map', stationId: 'tha-kilen' })); await sleep(500);
    await tapEl(p, v, '.skipbox summary', R, tag + ' ข้ามบทสอน'); await sleep(200);
    await tapEl(p, v, '.skipbox [data-act="skip"]', R, tag + ' ปุ่มเปิดทุกสถานี'); await sleep(300);
    await p.evaluate(() => window.__sjApp.router.go({ screen: 'map', stationId: 'buri-ram' })); await sleep(500);
    const n = await p.locator('.sheet [data-act="play"]').count();
    if (R.check(n >= 1, `${tag}: ข้ามบทสอนแล้วบุรีรัมย์ยังไม่มีปุ่มเล่น`)) {
      await tapEl(p, v, '.sheet [data-act="play"]', R, tag + ' เล่น br-1'); await sleep(600);
      R.check(await p.evaluate(() => location.hash) === '#play/buri-ram/br-1', `${tag}: แตะเล่นแล้วไม่เข้า br-1 (${await p.evaluate(() => location.hash)})`);
    }
    // ข้ามบทสอนแล้วหน้าเลือกสายไม่ควรเด้งเอง (เปิดเองเฉพาะผ่านน้ำตกครบ)
    await p.evaluate(() => window.__sjApp.router.go({ screen: 'map' })); await sleep(400);
    if (await isPicking(p)) R.note(`${tag}: ข้ามบทสอนแล้วกลับแผนที่ หน้าเลือกสายเปิดเอง`);
    await P.ctx.close();
  }
  { // ผ่านน้ำตกครบ (เซฟจากดิสก์) -> เปิดเองครั้งเดียว
    const tag = 'เปิดเอง', save = mkSave({ namtok: bestOf(['tk-1', 'tk-2', 'tk-token', 'tk-3', 'wp-1', 'wp-token', 'wp-2', 'wp-3', 'nt-1', 'nt-2'], 2) });
    const P = await open(env, v, 'light', R, { tag, hash: '#map', save, reducedMotion: 'reduce' }), p = P.p;
    await mapReady(p); await sleep(600);
    const a = await isPicking(p);
    R.check(a, `${tag}: เซฟที่ผ่านน้ำตกครบ เปิดแผนที่แล้วหน้าเลือกสายไม่เปิดเอง`);
    if (a) { R.check(await p.evaluate(() => document.querySelector('.pick-c[data-line="northeast"]').classList.contains('open')), `${tag}: การ์ดอีสานไม่เปิด`); await snap(p, 'pick-auto-844x390'); }
    await tapEl(p, v, '.pick [data-act="pick-close"]', R, tag); await sleep(200);
    await p.reload({ waitUntil: 'load' }); await p.waitForFunction(() => !!window.__sjApp); await mapReady(p); await sleep(600);
    R.check(!(await isPicking(p)), `${tag}: โหลดหน้าใหม่แล้วหน้าเลือกสายเปิดซ้ำ`);
    await p.evaluate(() => window.__sjApp.router.go({ screen: 'home' })); await sleep(200);
    await p.evaluate(() => window.__sjApp.router.go({ screen: 'map' })); await sleep(500);
    R.check(!(await isPicking(p)), `${tag}: กลับหน้าแรกแล้วเข้าแผนที่ใหม่ หน้าเลือกสายเปิดซ้ำ`);
    const fl = await p.evaluate(k => { try { return JSON.parse(localStorage.getItem(k)).flags; } catch { return null; } }, 'sj-signalbox-save');
    R.check(fl && fl['line-pick-seen'] === true, `${tag}: ธง line-pick-seen ไม่ถูกเขียนลงเซฟ ${JSON.stringify(fl)}`);
    await P.ctx.close();
  }
  { // หน้าเลือกสายเปิดเองเมื่อชนะภารกิจสุดท้ายของน้ำตก (เล่นจริง) แล้วกลับแผนที่
    const tag = 'เปิดเองหลังชนะ nt-2', save = mkSave({ namtok: bestOf(['tk-1', 'tk-2', 'tk-token', 'tk-3', 'wp-1', 'wp-token', 'wp-2', 'wp-3', 'nt-1'], 2) });
    const P = await open(env, v, 'light', R, { tag, hash: '#map', save, reducedMotion: 'reduce' }), p = P.p;
    await mapReady(p); await sleep(400);
    R.check(!(await isPicking(p)), `${tag}: ยังไม่ผ่าน nt-2 แต่หน้าเลือกสายเปิดเอง`);
    await p.evaluate(() => window.__sjApp.openMission('nam-tok', 'nt-2')); await sleep(400);
    await startTap(p, v, R, tag);
    const res = await playLevel(p, v, R, tag);
    R.check(res.state === 'win' && res.stars > 0, `${tag}: เล่น nt-2 ไม่ชนะ ${JSON.stringify(res).slice(0, 200)}`);
    const card = await p.evaluate(() => document.querySelector('.pl-card') && document.querySelector('.pl-card').textContent.replace(/\s+/g, ' '));
    R.note(`${tag}: การ์ดจบ: ${(card || '').slice(0, 160)}`);
    await tapEl(p, v, '.pl-card [data-act="exit"]', R, tag + ' กลับแผนที่'); await sleep(800);
    R.check(await isPicking(p), `${tag}: ชนะ nt-2 แล้วกลับแผนที่ หน้าเลือกสายไม่เปิดเอง`);
    await P.ctx.close();
  }
}

/* ---------- 3) เล่นจริง br-1 sr-1 tc-1 ---------- */
async function playFlow(env) {
  const runs = [['buri-ram', 'br-1', 'br-2', {}], ['surin', 'sr-1', 'sr-2', bestOf(['br-1', 'br-2', 'br-3', 'br-4'], 2)], ['thanon-chira-jn', 'tc-1', 'tc-2', bestOf(['br-1', 'br-2', 'br-3', 'br-4', 'sr-1', 'sr-2', 'sr-3', 'sr-4'], 2)]];
  for (const vn of ['844x390', '390x844']) for (const [st, id, nx, isan] of runs) {
    const v = V[vn], tag = `เล่น ${id} ${vn}`;
    const P = await open(env, v, 'light', R, { tag, hash: '#map', save: mkSave({ namtok: NT_ALL, isan, flags: { 'line-pick-seen': true } }), reducedMotion: 'reduce' }), p = P.p;
    await mapReady(p); await sleep(400);
    const before = await p.evaluate(() => { const C = window.__sjApp.careerProgress(); return { total: C.totalStars, isan: C.packs.isan.totalStars, pill: document.getElementById('map-total').textContent.trim() }; });
    // เปิดแผ่นสถานีด้วยการแตะปุ่มสถานีบนแผนที่ (ถ้าไม่โดน ใช้ router)
    await p.evaluate(s => window.__sjApp.map.focus ? window.__sjApp.map.focus(s) : null, st).catch(() => {});
    await p.evaluate(s => window.__sjApp.router.go({ screen: 'map', stationId: s }), st); await sleep(600);
    const btn = `.sheet [data-act="play"][data-mission="${id}"]`;
    const sel = (await p.locator(btn).count()) ? btn : '.sheet [data-act="play"]';
    if (!R.check(await p.locator(sel).count(), `${tag}: ไม่มีปุ่มเล่นในแผ่น ${st}`)) { await P.ctx.close(); continue; }
    if (!(await p.locator(btn).count())) R.note(`${tag}: ปุ่มเล่นไม่มี data-mission ใช้ปุ่มแรก`);
    await p.locator(sel).first().scrollIntoViewIfNeeded();
    await tapEl(p, v, sel, R, tag + ' ปุ่มเล่น'); await sleep(600);
    const h = await p.evaluate(() => location.hash);
    if (!R.check(h === `#play/${st}/${id}`, `${tag}: แตะเล่นแล้วไปที่ ${h}`)) { await P.ctx.close(); continue; }
    await startTap(p, v, R, tag);
    await auditBoard(p, v, R, tag);
    const res = await playLevel(p, v, R, tag);
    R.check(res.state === 'win' && res.stars > 0, `${tag}: ไม่ชนะ ${JSON.stringify({ state: res.state, code: res.code, stars: res.stars, done: res.done, total: res.total })}`);
    R.ok(`${tag}: ${res.code} ดาว ${res.stars} คะแนน ${res.score}/${res.max} แตะ ${res.taps} ครั้ง`);
    if (id === 'br-1' && vn === '844x390') await snap(p, `win-br-1-${vn}`);
    const hasNext = await p.locator('.pl-card [data-act="next"]').count();
    R.check(hasNext, `${tag}: การ์ดชนะไม่มีปุ่ม "ภารกิจถัดไป"`);
    const sv = await p.evaluate(([k, id]) => { try { const d = JSON.parse(localStorage.getItem(k)); return d.packs.isan && d.packs.isan.best[id]; } catch (e) { return 'err ' + e.message; } }, ['sj-signalbox-save', id]);
    R.check(sv && sv.stars === res.stars, `${tag}: ดาวไม่ถูกบันทึกลง localStorage (packs.isan.best.${id} = ${JSON.stringify(sv)})`);
    await tapEl(p, v, '.pl-card [data-act="exit"]', R, tag + ' กลับแผนที่'); await sleep(700);
    const after = await p.evaluate(([st, nx]) => { const C = window.__sjApp.careerProgress(), S = C.byId[st]; return { total: C.totalStars, isan: C.packs.isan.totalStars, pill: document.getElementById('map-total').textContent.trim(), next: (S.missions.find(m => m.id === nx) || {}).unlocked, hash: location.hash }; }, [st, nx]);
    R.check(after.total === before.total + res.stars && after.isan === before.isan + res.stars, `${tag}: ดาวรวมไม่เพิ่มถูก ${JSON.stringify({ before, after, got: res.stars })}`);
    R.check(after.pill !== before.pill, `${tag}: ป้ายดาวรวมบนแผนที่ไม่เปลี่ยน (${before.pill} -> ${after.pill})`);
    R.check(after.next === true, `${tag}: ชนะแล้ว ${nx} ไม่ปลดล็อก`);
    await P.ctx.close();
  }
}

/* ---------- 4) ป้ายบนผัง 3 สถานี (แผงผังเส้น) ---------- */
const HOOK = () => {
  const P = CanvasRenderingContext2D.prototype, f = P.fillText;
  window.__txt = [];
  P.fillText = function (s, x, y, ...rest) {
    try {
      if (this.canvas.closest && this.canvas.closest('.pl-board')) {
        const m = this.measureText(s), T = this.getTransform(), al = this.textAlign, w = m.width;
        const x0 = al === 'center' ? x - w / 2 : (al === 'right' || al === 'end') ? x - w : x;
        const a = m.actualBoundingBoxAscent, d = m.actualBoundingBoxDescent;
        const pts = [[x0, y - a], [x0 + w, y - a], [x0, y + d], [x0 + w, y + d]].map(([u, v]) => [T.a * u + T.c * v + T.e, T.b * u + T.d * v + T.f]);
        const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]);
        window.__txt.push({ s: String(s), l: Math.min(...xs), t: Math.min(...ys), r: Math.max(...xs), b: Math.max(...ys), cw: this.canvas.width, ch: this.canvas.height, sc: Math.hypot(T.a, T.b) });
      }
    } catch { /* */ }
    return f.call(this, s, x, y, ...rest);
  };
};
async function grabText(p) {
  await p.evaluate(() => { window.__txt = []; });
  await p.evaluate(() => { const P = window.__sjApp.play; P.step(0.02); }); // บังคับวาด
  await sleep(250);
  return p.evaluate(() => { const seen = new Set(), out = []; for (const x of window.__txt) { const k = `${x.s}|${x.l.toFixed(0)}|${x.t.toFixed(0)}`; if (!seen.has(k)) { seen.add(k); out.push(x); } } return out; });
}
function textIssues(T, tag, focusLegs) {
  const bad = [];
  for (const x of T) if (x.l < -1 || x.t < -1 || x.r > x.cw + 1 || x.b > x.ch + 1) bad.push(`ถูกตัดที่ขอบแผง: "${x.s}" [${[x.l, x.t, x.r, x.b].map(n => n.toFixed(0))}] แผง ${x.cw}x${x.ch}`);
  for (let i = 0; i < T.length; i++) for (let j = i + 1; j < T.length; j++) {
    const A = T[i], B = T[j]; if (A.s === B.s) continue; const ox = Math.min(A.r, B.r) - Math.max(A.l, B.l), oy = Math.min(A.b, B.b) - Math.max(A.t, B.t);
    if (ox > 2 * A.sc && oy > 2 * A.sc) bad.push(`ป้ายซ้อน: "${A.s}" กับ "${B.s}" (${ox.toFixed(0)}x${oy.toFixed(0)} px)`);
  }
  return bad.map(m => ({ m, legs: focusLegs.some(l => m.includes(l)) }));
}
async function layoutChecks(env) {
  const legs = {};
  for (const id of ['buri-ram', 'surin', 'thanon-chira-jn']) legs[id] = Object.values(require(`../data/stations/${id}.json`).layout ? require(`../data/stations/${id}.json`).layout.portals || {} : {}).map(x => x.label_th).filter(Boolean);
  const all = Object.values(legs).flat();
  for (const vn of ['844x390', '390x844', '1280x800']) for (const scheme of ['light', 'dark']) {
    if (vn === '1280x800' && scheme === 'dark') continue;
    for (const [st, id] of [['buri-ram', 'br-1'], ['surin', 'sr-1'], ['thanon-chira-jn', 'tc-1']]) {
      const v = V[vn], tag = `ผัง ${st} ${vn} ${scheme}`;
      const P = await open(env, v, scheme, R, { tag, hash: `#dev/isan/${id}`, init: HOOK, reducedMotion: 'reduce' }), p = P.p;
      await p.waitForFunction(() => window.__sjApp.play && window.__sjApp.play.g, null, { timeout: 20000 });
      await sleep(300);
      await p.evaluate(() => { const P = window.__sjApp.play; P.setManual(true); });
      const t0 = await grabText(p);
      const names = t0.map(x => x.s);
      const want = legs[st] || [];
      for (const l of want) R.check(names.some(n => n.includes(l.replace(/^ไป/, '')) || n === l), `${tag}: ไม่พบป้ายขา "${l}" บนแผง (เจอ ${names.slice(0, 20).join(', ')})`);
      for (const i of textIssues(t0, tag, all)) (i.legs ? R.fail : R.note).call(R, `${tag} (ก่อนเริ่ม): ${i.m}`);
      // ระหว่างเล่น: เริ่ม เดินเวลา ดูป้ายอีกรอบ
      await p.evaluate(() => { const P = window.__sjApp.play; P.start(); P.step(12); });
      const t1 = await grabText(p);
      for (const i of textIssues(t1, tag, all)) (i.legs ? R.fail : R.note).call(R, `${tag} (ระหว่างเล่น): ${i.m}`);
      if (vn === '844x390' || (vn === '390x844' && st === 'buri-ram' && scheme === 'light')) await snap(p, `layout-${st}-${vn}-${scheme}`);
      await P.ctx.close();
    }
  }
}

/* ---------- 5) เซฟเก่า namtok ---------- */
async function oldSave(env) {
  const v = V['1280x800'], old = { 'tk-1': 3, 'tk-2': 2, 'tk-token': 1, 'tk-3': 3, 'wp-1': 2 };
  const save = JSON.stringify({ v: 2, packs: { namtok: { stars: [], best: Object.fromEntries(Object.entries(old).map(([k, n]) => [k, { stars: n, score: n * 100 }])) } } });
  const P = await open(env, v, 'light', R, { tag: 'เซฟเก่า', hash: '#map', save, reducedMotion: 'reduce' }), p = P.p;
  await mapReady(p); await sleep(400);
  const o = await p.evaluate(() => { const C = window.__sjApp.careerProgress(); return { tut: C.tutorial.totalStars, all: C.totalStars, max: C.maxStars, isanLocked: C.packs.isan.locked, ms: Object.fromEntries(C.tutorial.stations.flatMap(s => s.missions.map(m => [m.id, m.stars]))), pill: document.getElementById('map-total').textContent.trim(), picking: window.__sjApp.map.picking() }; });
  const exp = Object.values(old).reduce((a, b) => a + b, 0);
  R.check(o.tut === exp && o.all === exp, `เซฟเก่า: ดาวรวมไม่ตรง ${o.tut}/${o.all} ต้อง ${exp}`);
  for (const [k, n] of Object.entries(old)) R.check(o.ms[k] === n, `เซฟเก่า: ${k} ได้ ${o.ms[k]} ต้อง ${n}`);
  R.check(o.isanLocked && !o.picking, `เซฟเก่า: อีสานต้องล็อกและหน้าเลือกสายไม่เปิดเอง ${JSON.stringify(o)}`);
  R.ok(`เซฟเก่า: ${o.pill} (สูงสุด ${o.max})`);
  // งบ: กระเป๋าไม่ติดลบ/ไม่หาย
  const w = await p.evaluate(() => { const W = window.__sjApp.data.wallet; return W ? { bal: W.balance ? W.balance() : null } : null; });
  R.note(`เซฟเก่า: งบ ${JSON.stringify(w)}`);
  await P.ctx.close();
}


/* ---------- 6) กรณีเลวร้าย: หมุนจอขณะเปิดหน้าเลือกสาย, localStorage ใช้ไม่ได้, การ์ดชนะ nt-2 ล้นจอ ---------- */
async function extra(env) {
  { const v = V['844x390'], tag = 'หมุนจอ', P = await open(env, v, 'light', R, { tag, hash: '#map', reducedMotion: 'reduce' }), p = P.p;
    await mapReady(p); await sleep(300);
    await tapEl(p, v, '.map-top [data-act="pick"]', R, tag); await sleep(200);
    await p.setViewportSize({ width: 390, height: 844 }); await sleep(500);
    const g = await p.evaluate(() => { const r = document.querySelector('.pick').getBoundingClientRect(); return { open: !document.querySelector('.pick').hidden, r: [r.left, r.top, r.right, r.bottom].map(Math.round), vw: innerWidth, vh: innerHeight }; });
    R.check(g.open && g.r[0] >= -1 && g.r[1] >= -1 && g.r[2] <= g.vw + 1 && g.r[3] <= g.vh + 1, `${tag}: หมุนเป็นแนวตั้งระหว่างเปิดหน้าเลือกสายแล้วล้นจอ/ปิดเอง ${JSON.stringify(g)}`);
    await tapEl(p, { ...V['390x844'] }, '.pick [data-act="pick-close"]', R, tag + ' ปิดหลังหมุน'); await sleep(200);
    R.check(!(await isPicking(p)), `${tag}: แตะปิดหลังหมุนไม่ได้`);
    await P.ctx.close(); }
  { const v = V['844x390'], tag = 'ไม่มี localStorage';
    const init = () => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('denied'); } }); };
    const P = await open(env, v, 'light', R, { tag, hash: '#map', init, reducedMotion: 'reduce' }), p = P.p;
    await mapReady(p); await sleep(300);
    await tapEl(p, v, '.map-top [data-act="pick"]', R, tag); await sleep(200);
    R.check(await isPicking(p), `${tag}: หน้าเลือกสายไม่เปิด`);
    await p.keyboard.press('Escape'); await sleep(100);
    await p.evaluate(() => window.__sjApp.router.go({ screen: 'map', stationId: 'tha-kilen' })); await sleep(400);
    await tapEl(p, v, '.skipbox summary', R, tag); await sleep(150); await tapEl(p, v, '.skipbox [data-act="skip"]', R, tag); await sleep(200);
    await p.evaluate(() => window.__sjApp.router.go({ screen: 'map', stationId: 'buri-ram' })); await sleep(400);
    R.check(await p.locator('.sheet [data-act="play"]').count() >= 1, `${tag}: ข้ามบทสอนแล้วบุรีรัมย์ไม่เปิด (ธงในหน่วยความจำ)`);
    await tapEl(p, v, '.sheet [data-act="play"]', R, tag); await sleep(500);
    await startTap(p, v, R, tag); const res = await playLevel(p, v, R, tag);
    R.check(res.state === 'win', `${tag}: br-1 ไม่ชนะ`);
    const t = await p.evaluate(() => document.querySelector('.pl-card').textContent);
    R.check(t.includes('บันทึกเกมไม่ได้'), `${tag}: การ์ดชนะไม่บอกว่าบันทึกไม่ได้`);
    await tapEl(p, v, '.pl-card [data-act="exit"]', R, tag); await sleep(500);
    const c = await p.evaluate(() => { const C = window.__sjApp.careerProgress(); return { isan: C.packs.isan.totalStars, br2: C.byId['buri-ram'].missions[1].unlocked }; });
    R.check(c.isan > 0 && c.br2, `${tag}: ดาวในหน่วยความจำหายหลังกลับแผนที่ ${JSON.stringify(c)}`);
    await P.ctx.close(); }
  for (const vn of ['844x390', '390x844']) { const v = V[vn], tag = `การ์ดชนะ nt-2 ${vn}`, save = mkSave({ namtok: bestOf(['tk-1', 'tk-2', 'tk-token', 'tk-3', 'wp-1', 'wp-token', 'wp-2', 'wp-3', 'nt-1'], 2) });
    const P = await open(env, v, 'light', R, { tag, hash: '#map', save, reducedMotion: 'reduce' }), p = P.p;
    await mapReady(p); await p.evaluate(() => window.__sjApp.openMission('nam-tok', 'nt-2')); await sleep(400);
    await startTap(p, v, R, tag); await playLevel(p, v, R, tag); await sleep(400);
    const c = await p.evaluate(() => { const el = document.querySelector('.pl-card'), r = el.getBoundingClientRect(), b = el.querySelector('[data-act="exit"]').getBoundingClientRect(); return { r: [r.left, r.top, r.right, r.bottom].map(Math.round), btn: [b.left, b.top, b.right, b.bottom].map(Math.round), vw: innerWidth, vh: innerHeight, sc: el.scrollHeight - el.clientHeight }; });
    R.note(`${tag}: ${JSON.stringify(c)}`);
    await tapEl(p, v, '.pl-card [data-act="exit"]', R, tag);
    if (vn === '844x390') await snap(p, 'nt2-to-pick-844x390');
    await P.ctx.close(); }
  { const v = V['844x390'], tag = 'พักแท็บ', P = await open(env, v, 'light', R, { tag, hash: '#map', save: mkSave({ namtok: NT_ALL, flags: { 'line-pick-seen': true } }), reducedMotion: 'reduce' }), p = P.p;
    await mapReady(p); await p.evaluate(() => window.__sjApp.openMission('buri-ram', 'br-1')); await sleep(400);
    await startTap(p, v, R, tag);
    await p.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
    await sleep(300);
    await p.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });
    await sleep(300);
    const st = await p.evaluate(() => window.__sjApp.play.g.state);
    R.note(`${tag}: สถานะหลังกลับมา ${st}`);
    const r2 = await p.locator('.pl-card [data-act="resume"]').count();
    if (r2) await tapEl(p, v, '.pl-card [data-act="resume"]', R, tag);
    const res = await playLevel(p, v, R, tag);
    R.check(res.state === 'win', `${tag}: พักแท็บแล้วเล่นต่อไม่ชนะ ${res.state}`);
    await P.ctx.close(); }
}

(async () => {
  const env = await launch();
  try {
    if (want('pick')) { console.log('\n# 1 หน้าเลือกสาย'); await pickChecks(env); }
    if (want('save')) { console.log('\n# 2 เซฟใหม่/เปิดเอง'); await saveFlow(env); }
    if (want('play')) { console.log('\n# 3 เล่นจริง'); await playFlow(env); }
    if (want('layout')) { console.log('\n# 4 ป้ายผัง'); await layoutChecks(env); }
    if (want('extra')) { console.log('\n# 6 กรณีเลวร้าย'); await extra(env); }
    if (want('old')) { console.log('\n# 5 เซฟเก่า'); await oldSave(env); }
  } catch (e) { R.fail('สคริปต์ล้ม: ' + (e.stack || e.message)); } finally { await env.close(); }
  process.exit(R.done() ? 1 : 0);
})();
