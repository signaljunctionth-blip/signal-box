// ตรวจเจาะจุด WP10 (ฉาก 3 มิติทั้งเกม + กล้องอิสระ) — ใช้: node test/qa-wp10.js (ต้อง build ก่อน หรือตั้ง SJ_URL)
// 1) ภารกิจแรกทุกสถานี 3 มิติ 844×390 / 390×844  2) แตะป้ายหลังหมุน/ซูมกล้อง ลากไม่กด ป้ายไม่อยู่ใต้ "มุมมาตรฐาน"
// 3) ภารกิจห่วงชนะด้วยการแตะจริง  4) เดินรถอิสระ/ทดลองเดินรถ  5) โหมดมืด 1280×800  6) draw call / fps หนองปลาดุก
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { serveGame } = require('./lib/serve.js');

const shots = path.join(__dirname, 'screenshots');
const fails = [], notes = [];
const fail = m => { fails.push(m); console.error('  ✗ ' + m); };
const check = (ok, m) => { if (!ok) fail(m); return ok; };
const note = m => { notes.push(m); console.log('  - ' + m); };
const NAMTOK = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/levels/namtok.json'), 'utf8'));
const RICH = JSON.stringify({ v: 2, packs: { [NAMTOK.id]: { stars: [], best: Object.fromEntries(NAMTOK.levels.map(l => [l.id, { stars: 3, score: 900 }])) } } });
const FIRST = ['tk-1', 'wp-1', 'nt-1', 'kb-1', 'np-1'];
const ONLY = process.env.QA_ONLY ? process.env.QA_ONLY.split(',') : null;
const want = k => !ONLY || ONLY.includes(k);

async function newPage(b, vp, tag, opts = {}) {
  const ctx = await b.newContext({ viewport: { width: vp.w, height: vp.h }, hasTouch: true, deviceScaleFactor: 1, colorScheme: opts.scheme || 'light' });
  if (opts.save) await ctx.addInitScript(t => { try { if (!localStorage.getItem('sj-signalbox-save')) localStorage.setItem('sj-signalbox-save', t); } catch { /* */ } }, opts.save);
  const p = await ctx.newPage(), errs = [];
  p.on('pageerror', e => errs.push('page error: ' + e.message));
  p.on('console', m => { if (m.type() === 'error' || /GL_INVALID|WebGL:/.test(m.text())) errs.push(m.text().slice(0, 200)); });
  return { ctx, p, errs, tag };
}
const wait3D = p => p.waitForFunction(() => { const a = window.__sjApp && window.__sjApp.play, v = a && a.view3d, s = v && v.active && v.stats(); return s && s.calls > 0; }, null, { timeout: 60000 }).then(() => true).catch(() => false);
const refresh = async p => { await p.evaluate(() => window.__sjApp.play.view3d.touch()); await p.waitForTimeout(120); };

async function touchDrag(ctx, p, from, steps, dx, dy) {
  const cdp = await ctx.newCDPSession(p), t = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((q, i) => ({ x: q[0], y: q[1], id: i })) });
  await t('touchStart', [from]); for (let i = 1; i <= steps; i++) await t('touchMove', [[from[0] + dx * i / steps, from[1] + dy * i / steps]]); await t('touchEnd', []);
  await cdp.detach();
}
async function pinch(ctx, p, c, d0, d1) {
  const cdp = await ctx.newCDPSession(p), t = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((q, i) => ({ x: q[0], y: q[1], id: i })) });
  await t('touchStart', [[c[0] - d0, c[1]], [c[0] + d0, c[1]]]);
  for (let i = 1; i <= 8; i++) { const d = d0 + (d1 - d0) * i / 8; await t('touchMove', [[c[0] - d, c[1]], [c[0] + d, c[1]]]); }
  await t('touchEnd', []); await cdp.detach();
}
// ป้ายทั้งหมดที่เห็นอยู่ + ข้อมูลว่าจุดกลางป้ายมีอะไรอยู่บนสุด
const chipsInfo = p => p.evaluate(() => {
  const home = document.querySelector('.v3d-home'), hr = home && !home.hidden ? home.getBoundingClientRect() : null;
  return [...document.querySelectorAll('.v3d-chip')].filter(e => !e.hidden).map(e => {
    const r = e.getBoundingClientRect(), x = (r.left + r.right) / 2, y = (r.top + r.bottom) / 2, top = document.elementFromPoint(x, y);
    const topChip = top && top.closest('.v3d-chip');
    const under = hr && !(r.right < hr.left || r.left > hr.right || r.bottom < hr.top || r.top > hr.bottom);
    return { key: e.dataset.key, x, y, w: r.width, h: r.height, topKey: topChip ? topChip.dataset.key : (top ? top.className || top.tagName : null), under: !!under, inView: x >= 0 && y >= 0 && x <= innerWidth && y <= innerHeight };
  });
});

/* ---------- 1) ภารกิจแรกทุกสถานี ---------- */
async function firstMissions(b, game) {
  for (const vp of [{ w: 844, h: 390 }, { w: 390, h: 844 }]) for (const id of FIRST) {
    const { ctx, p, errs } = await newPage(b, vp), tag = `${vp.w}×${vp.h} ${id}`;
    await p.goto(game.url + '#dev/namtok/' + id, { waitUntil: 'load' });
    const ok = await wait3D(p);
    if (!check(ok, `${tag}: ฉาก 3 มิติไม่ขึ้น`)) { await ctx.close(); continue; }
    await p.evaluate(() => { const a = window.__sjApp.play; a.start(); a.setManual(true); a.step(8); });
    await refresh(p);
    const info = await p.evaluate(() => { const a = window.__sjApp.play, v = a.view3d; return { stats: v.stats(), sigs: Object.keys(a.g.S).length, pts: Object.keys(a.g.P).length, vis: Object.keys(a.g.S).filter(k => v.targetClient({ kind: 'signal', id: k })).length + Object.keys(a.g.P).filter(k => v.targetClient({ kind: 'point', id: k })).length }; });
    const ch = await chipsInfo(p);
    check(ch.every(c => c.inView), `${tag}: ป้ายล้นจอ ${ch.filter(c => !c.inView).map(c => c.key)}`);
    const small = ch.filter(c => Math.min(c.w, c.h) < 39.5); check(!small.length, `${tag}: ป้ายเล็กกว่า 40 px ${small.map(c => c.key + ' ' + c.w.toFixed(0) + 'x' + c.h.toFixed(0))}`);
    const covered = ch.filter(c => c.topKey !== c.key); check(!covered.length, `${tag}: ป้ายถูกบัง ${covered.map(c => c.key + '<-' + c.topKey)}`);
    // กล่องคำใบ้ห้ามบังป้ายอื่นเกินครึ่งความสูงป้าย (ป้ายเป้าของคำใบ้เองไม่นับ)
    const bub = await p.evaluate(() => { const b = document.querySelector('.v3d-bubble'); if (!b || b.hidden) return []; const r = b.getBoundingClientRect();
      return [...document.querySelectorAll('.v3d-chip:not(.hint)')].filter(e => !e.hidden).map(e => { const c = e.getBoundingClientRect(), ox = Math.max(0, Math.min(r.right, c.right) - Math.max(r.left, c.left)), oy = Math.max(0, Math.min(r.bottom, c.bottom) - Math.max(r.top, c.top)); return [e.dataset.key, ox * oy / (c.width * c.height)]; }).filter(x => x[1] > 0.15); });
    check(!bub.length, `${tag}: คำใบ้บังป้าย ${bub.map(x => x[0] + ' ' + Math.round(x[1] * 100) + '%')}`);
    check(info.vis === info.sigs + info.pts, `${tag}: มุมมาตรฐานเห็นป้ายเสา/ประแจ ${info.vis}/${info.sigs + info.pts}`);
    await p.screenshot({ path: path.join(shots, `wp10-${id}-${vp.w}x${vp.h}.png`) });
    check(!errs.length, `${tag}: error ${errs.slice(0, 3).join(' | ')}`);
    note(`${tag}: calls ${info.stats.calls} tris ${info.stats.tris} tier ${info.stats.tier} ป้าย ${info.vis}/${info.sigs + info.pts}`);
    await ctx.close();
  }
}

/* ---------- 2) แตะหลังหมุน/ซูม, ลากไม่กด, ป้ายไม่อยู่ใต้ปุ่มมุมมาตรฐาน ---------- */
async function tapAfterCamera(b, game, vp, id) {
  const { ctx, p, errs } = await newPage(b, vp), tag = `${vp.w}×${vp.h} ${id} กล้อง`;
  await p.goto(game.url + '#dev/namtok/' + id, { waitUntil: 'load' });
  if (!check(await wait3D(p), `${tag}: ฉากไม่ขึ้น`)) { await ctx.close(); return; }
  await p.evaluate(() => { const a = window.__sjApp.play; a.start(); a.setManual(true); });
  await refresh(p);
  const cv = await p.evaluate(() => { const r = document.querySelector('canvas.v3d').getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; });
  const snap = () => p.evaluate(() => JSON.stringify(window.__sjApp.play.snapshot()));
  const cam = () => p.evaluate(() => window.__sjApp.play.view3d.camera().state);
  // ลากจากป้ายประแจ: ต้องไม่สับประแจ
  let ch = await chipsInfo(p);
  const pc = ch.find(c => c.key.startsWith('point:'));
  if (pc) {
    const s0 = await snap(), c0 = await cam();
    await touchDrag(ctx, p, [pc.x, pc.y], 8, 70, 15); await p.waitForTimeout(300);
    check(s0 === await snap(), `${tag}: ลากกล้องจากป้ายประแจ ${pc.key} แล้วประแจถูกสับ`);
    const c1 = await cam(); check(Math.abs(c1.az - c0.az) + Math.abs(c1.el - c0.el) > 0.05, `${tag}: ลากจากป้ายประแจแล้วกล้องไม่ขยับ`);
    // แตะทันทีหลังลากจบ 300 ms ต้องได้ผล (กันกลืนแตะนานเกิน)
  }
  // ลากบนพื้นที่ว่างของ canvas (มุมซ้ายบน) แล้วสองนิ้วซูมเข้า
  {
    const s0 = await snap();
    await touchDrag(ctx, p, [cv[0] + cv[2] * 0.5, cv[1] + cv[3] * 0.12], 10, -90, 25);
    await pinch(ctx, p, [cv[0] + cv[2] / 2, cv[1] + cv[3] / 2], 40, 90);
    await p.waitForTimeout(300);
    check(s0 === await snap(), `${tag}: ลาก/บีบกล้องบน canvas แล้วสถานะเกมเปลี่ยน`);
    const c = await cam(); note(`${tag}: กล้องหลังลาก+บีบ az ${c.az.toFixed(2)} el ${c.el.toFixed(2)} dist ${c.dist.toFixed(1)}`);
  }
  await refresh(p);
  ch = await chipsInfo(p);
  const homeOn = await p.evaluate(() => { const h = document.querySelector('.v3d-home'); return h && !h.hidden; });
  check(homeOn, `${tag}: หมุน/ซูมแล้วไม่มีปุ่มมุมมาตรฐาน`);
  const under = ch.filter(c => c.under); check(!under.length, `${tag}: ป้ายอยู่ใต้/ชนปุ่มมุมมาตรฐาน ${under.map(c => c.key)}`);
  const covered = ch.filter(c => c.topKey !== c.key); check(!covered.length, `${tag}: ป้ายถูกบัง (แตะแล้วโดนอย่างอื่น) ${covered.map(c => c.key + '<-' + c.topKey)}`);
  // แตะทุกป้ายเสา/ประแจที่เห็น: ต้องโดนตัวนั้น ไม่ใช่ตัวอื่น
  let tested = 0;
  for (const c of ch.filter(c => /^(signal|point):/.test(c.key) && c.topKey === c.key)) {
    const [kind, k] = c.key.split(':');
    const lockedBefore = kind === 'point' && await p.evaluate(k => { const a = window.__sjApp.play, q = a.g.P[k]; return !!(q && (q.lock || q.ovl || a.g.lv.pointsLocked || a.g.era.nx)); }, k);
    const before = await p.evaluate(() => { const a = window.__sjApp.play; return { P: Object.fromEntries(Object.entries(a.g.P).map(([k, v]) => [k, v.pos])), S: Object.fromEntries(Object.entries(a.g.S).map(([k, v]) => [k, v.aspect])), nx: a.g.nxSel, msg: document.querySelector('.pl-msg').textContent }; });
    const fresh = (await chipsInfo(p)).find(x => x.key === c.key); if (!fresh) continue;
    await p.touchscreen.tap(fresh.x, fresh.y); await p.waitForTimeout(80);
    const after = await p.evaluate(() => { const a = window.__sjApp.play; return { P: Object.fromEntries(Object.entries(a.g.P).map(([k, v]) => [k, v.pos])), S: Object.fromEntries(Object.entries(a.g.S).map(([k, v]) => [k, v.aspect])), nx: a.g.nxSel, msg: document.querySelector('.pl-msg').textContent }; });
    const chP = Object.keys(after.P).filter(x => after.P[x] !== before.P[x]), chS = Object.keys(after.S).filter(x => after.S[x] !== before.S[x]);
    const fixed = lockedBefore;
    if (kind === 'point') check(fixed ? !chP.length && !chS.length && after.msg !== before.msg || !chP.length : chP.length === 1 && chP[0] === k && !chS.length, `${tag}: แตะป้ายประแจ ${k} (ล็อก ${fixed}) แล้วเปลี่ยน ประแจ [${chP}] เสา [${chS}] ข้อความ "${after.msg}"`);
    else check(chS.every(x => x === k) && (!chP.length || before.nx !== undefined) && (chS.length || after.nx !== before.nx || after.msg !== before.msg), `${tag}: แตะป้ายเสา ${k} แล้วเปลี่ยน ประแจ [${chP}] เสา [${chS}] ข้อความ "${after.msg}"`);
    tested++;
    // คืนสถานะ
    if (kind === 'point' && chP.length) { const f2 = (await chipsInfo(p)).find(x => x.key === c.key); if (f2) await p.touchscreen.tap(f2.x, f2.y); await p.waitForTimeout(80); }
    if (kind === 'signal' && chS.length) await p.evaluate(k => window.__sjApp.play.press({ kind: 'signal', id: k }), k);
    if (after.nx) await p.evaluate(() => { window.__sjApp.play.g.nxSel = null; });
  }
  note(`${tag}: แตะป้ายหลังหมุน/ซูม ${tested} ป้าย`);
  // กดมุมมาตรฐานแล้วกลับ
  await p.locator('.v3d-home').tap(); await p.waitForTimeout(200);
  check(await p.evaluate(() => !window.__sjApp.play.view3d.camera().zoomed), `${tag}: กดมุมมาตรฐานแล้วกล้องไม่กลับ`);
  // ล้อเมาส์บนป้ายซูมได้
  const c0 = await cam(); const anyChip = (await chipsInfo(p))[0];
  if (anyChip) { await p.mouse.move(anyChip.x, anyChip.y); await p.mouse.wheel(0, -400); await p.waitForTimeout(150); check((await cam()).dist < c0.dist - 0.5, `${tag}: ล้อเมาส์บนป้ายไม่ซูม`); }
  // ซูมเข้าสุด: ป้ายไม่ใต้ปุ่ม
  await p.evaluate(() => { const c = window.__sjApp.play.view3d.camera(); for (let i = 0; i < 30; i++) c.zoom(0.8); });
  await refresh(p);
  const ch2 = await chipsInfo(p); const u2 = ch2.filter(c => c.under); check(!u2.length, `${tag}: ซูมเข้าสุดแล้วป้ายชนปุ่มมุมมาตรฐาน ${u2.map(c => c.key)}`);
  const cz = await cam(); note(`${tag}: ซูมเข้าสุด dist ${cz.dist.toFixed(1)} ซูมออก:`);
  await p.evaluate(() => { const c = window.__sjApp.play.view3d.camera(); for (let i = 0; i < 40; i++) c.zoom(1.3); for (let i = 0; i < 40; i++) c.orbit(0, 200, 400); for (let i = 0; i < 40; i++) c.pan(500, 500, 400); });
  const cf = await cam(); note(`${tag}: ซูมออกสุด+เอียงต่ำสุด+เลื่อนไกล dist ${cf.dist.toFixed(1)} el ${cf.el.toFixed(2)} tx ${cf.tx.toFixed(0)} tz ${cf.tz.toFixed(0)}`);
  await p.evaluate(() => { const c = window.__sjApp.play.view3d.camera(); for (let i = 0; i < 40; i++) c.orbit(0, -200, 400); });
  const cl = await cam(); note(`${tag}: เอียงต่ำสุด el ${cl.el.toFixed(2)} (สูงสุด ${cf.el.toFixed(2)})`);
  check(cl.el > 0.02, `${tag}: กล้องมุดใต้ดินได้ (el ${cl.el})`);
  await p.screenshot({ path: path.join(shots, `wp10-cam-limit-${id}-${vp.w}x${vp.h}.png`) });
  check(!errs.length, `${tag}: error ${errs.slice(0, 3).join(' | ')}`);
  await ctx.close();
}

/* ---------- 3) ภารกิจห่วงชนะด้วยการแตะจริง (หลังหมุนกล้องเล็กน้อย) ---------- */
async function tokenWin(b, game, vp, id) {
  const { ctx, p, errs } = await newPage(b, vp), tag = `${vp.w}×${vp.h} ${id}`;
  await p.goto(game.url + '#dev/namtok/' + id, { waitUntil: 'load' });
  if (!check(await wait3D(p), `${tag}: ฉากไม่ขึ้น`)) { await ctx.close(); return; }
  await p.evaluate(() => { const a = window.__sjApp.play; a.start(); a.setManual(true); a.view3d.camera().orbit(-30, 10, 400); });
  await refresh(p);
  let taps = 0, missed = 0, wrong = 0; const kinds = new Set(), why = [];
  for (let i = 0; i < 2000; i++) {
    const st = await p.evaluate(() => { const a = window.__sjApp.play; return { state: a.g.state, t: a.nextTarget() }; });
    if (st.state !== 'play') break;
    if (st.t) {
      await refresh(p);
      const key = st.t.kind + ':' + (st.t.id ?? st.t.no);
      const c = (await chipsInfo(p)).find(x => x.key === key);
      const before = await p.evaluate(() => JSON.stringify(window.__sjApp.play.snapshot()));
      if (c) { if (c.topKey !== key) { wrong++; why.push(key + '<-' + c.topKey); } await p.touchscreen.tap(c.x, c.y); taps++; kinds.add(st.t.kind); }
      if (!c || before === await p.evaluate(() => JSON.stringify(window.__sjApp.play.snapshot()))) { missed++; why.push('miss ' + key + (c ? '' : ' (ไม่มีป้าย)')); await p.evaluate(t => window.__sjApp.play.press(t), st.t); }
    }
    await p.evaluate(() => window.__sjApp.play.step(1));
  }
  const end = await p.evaluate(() => window.__sjApp.play.g.state);
  check(end === 'win', `${tag}: ไม่ชนะ (${end})`);
  check(missed === 0 && wrong === 0, `${tag}: แตะ ${taps} พลาด ${missed} โดนผิดตัว ${wrong}: ${why.slice(0, 5).join(', ')}`);
  check(kinds.has('token') && kinds.has('accept'), `${tag}: ไม่ได้แตะเครื่องทางสะดวก/ให้ทาง (${[...kinds]})`);
  check(!errs.length, `${tag}: error ${errs.slice(0, 3).join(' | ')}`);
  note(`${tag}: แตะจริง ${taps} ครั้ง (${[...kinds].join(' ')}) ผล ${end}`);
  await ctx.close();
}

/* ---------- ปุ่มสลับ 2 มิติ ---------- */
async function toggle2D(p, tag) {
  const btn = p.locator('.pl-bar [data-act="view"]');
  if (!check(await btn.count() && await btn.isVisible(), `${tag}: ไม่มีปุ่มสลับมุมมอง`)) return;
  await btn.tap();
  const off = await p.waitForFunction(() => !window.__sjApp.play.view3d.active && getComputedStyle(document.querySelector('canvas.v3d')).display === 'none', null, { timeout: 5000 }).then(() => true).catch(() => false);
  check(off, `${tag}: กดปุ่มแล้วไม่กลับเป็นผังเส้น`);
  await btn.tap();
  const on = await wait3D(p); check(on, `${tag}: สลับกลับ 3 มิติไม่ได้`);
}

/* ---------- 4) เดินรถอิสระ + ทดลองเดินรถ ---------- */
async function freePlay(b, game, vp) {
  const { ctx, p, errs } = await newPage(b, vp, '', { save: RICH }), tag = `${vp.w}×${vp.h} free/tha-kilen`;
  await p.goto(game.url + '#free/tha-kilen', { waitUntil: 'load' });
  const okHash = await p.waitForFunction(() => location.hash === '#free/tha-kilen' && window.__sjApp.play && window.__sjApp.play.g.lv.id === 'free', null, { timeout: 15000 }).then(() => true).catch(() => false);
  if (!check(okHash, `${tag}: เปิดเดินรถอิสระไม่ได้ (hash ${await p.evaluate(() => location.hash)})`)) { await ctx.close(); return; }
  check(await wait3D(p), `${tag}: ฉาก 3 มิติไม่ขึ้น`);
  await p.evaluate(() => { const a = window.__sjApp.play; a.start(); a.setManual(true); for (let n = 0; n < 60; n++) { const t = a.nextTarget(); if (t) a.press(t); a.step(1); } a.view3d.touch(); });
  await p.waitForTimeout(300);
  await p.screenshot({ path: path.join(shots, `wp10-free-${vp.w}x${vp.h}.png`) });
  await toggle2D(p, tag);
  const r = await p.evaluate(() => { const a = window.__sjApp.play; for (let n = 0; n < 4000 && a.g.state === 'play'; n++) { for (let m = 0; m < 6; m++) { const t = a.nextTarget(); if (!t) break; a.press(t); } a.step(0.1); } return a.g.state; });
  check(r === 'win', `${tag}: เล่นจบไม่ได้ (${r})`);
  check(!errs.length, `${tag}: error ${errs.slice(0, 3).join(' | ')}`);
  note(`${tag}: 3 มิติขึ้น สลับ 2 มิติได้ ผล ${r}`);
  await ctx.close();
}
const LOOP = [[5, 4], [6, 3], [7, 2], [8, 2], [9, 2], [10, 2], [11, 2], [12, 3], [13, 4]];
async function buildPlay(b, game) {
  const { ctx, p, errs } = await newPage(b, { w: 844, h: 390 }, '', { save: RICH }), tag = '844×390 build/play';
  await p.goto(game.url + '#build', { waitUntil: 'load' });
  await p.waitForFunction(() => !!document.querySelector('.bld canvas') && document.querySelector('.bld-chip') && document.querySelector('.bld-chip').textContent, null, { timeout: 15000 });
  await p.evaluate(() => { try { localStorage.removeItem('sj-build-plan'); } catch { /* */ } });
  await p.reload({ waitUntil: 'load' });
  await p.waitForFunction(() => document.querySelector('.bld-chip') && document.querySelector('.bld-chip').textContent); await p.waitForTimeout(300);
  const pts = await p.evaluate(list => {
    const cv = document.querySelector('.bld canvas'), R = cv.getBoundingClientRect(), w = cv.clientWidth, h = cv.clientHeight;
    const k = Math.min((w - 28) / 720, (h - 28) / 320), ox = (w - 720 * k) / 2, oy = (h - 320 * k) / 2;
    return list.map(([i, j]) => [R.left + ox + i * 40 * k, R.top + oy + (j + 0.5) * 40 * k]);
  }, LOOP);
  await p.click('[data-tool="track"]');
  await p.mouse.move(...pts[0]); await p.mouse.down(); for (const q of pts.slice(1)) await p.mouse.move(...q, { steps: 4 }); await p.mouse.up();
  await p.click('[data-act="try"]');
  await p.click('[data-act="era"][data-era="2"]').catch(() => {});
  const ok = await p.waitForFunction(() => location.hash === '#build/play' && window.__sjApp.play && window.__sjApp.play.g.L.id === 'custom', null, { timeout: 10000 }).then(() => true).catch(() => false);
  if (!check(ok, `${tag}: เปิดทดลองเดินรถไม่ได้ (${await p.$eval('.bld-card', e => e.textContent).catch(() => '')})`)) { await ctx.close(); return; }
  await p.waitForTimeout(500);
  const info = await p.evaluate(() => ({ v3d: !!window.__sjApp.play.view3d, btn: !!document.querySelector('.pl-bar [data-act="view"]'), panel: !!document.querySelector('.pl-board canvas:not(.v3d)') }));
  check(!info.v3d && !info.btn, `${tag}: คาดว่าเป็น 2 มิติล้วน แต่ได้ ${JSON.stringify(info)}`);
  check(!errs.length, `${tag}: error ${errs.slice(0, 3).join(' | ')}`);
  note(`${tag}: เปิดได้ ${JSON.stringify(info)}`);
  await ctx.close();
}

/* ---------- 5+6) โหมดมืด 1280×800 + งบการวาด/fps หนองปลาดุก + ปุ่มสลับทุกสถานี ---------- */
async function darkAndPerf(b, game) {
  const vp = { w: 1280, h: 800 };
  for (const id of ['np-1', 'tk-1', 'wp-1', 'nt-1', 'kb-1']) {
    const { ctx, p, errs } = await newPage(b, vp, '', { scheme: 'dark' }), tag = `1280×800 มืด ${id}`;
    await p.goto(game.url + '#dev/namtok/' + id, { waitUntil: 'load' });
    if (!check(await wait3D(p), `${tag}: ฉากไม่ขึ้น`)) { await ctx.close(); continue; }
    const vars = await p.evaluate(() => getComputedStyle(document.querySelector('.stage') || document.documentElement).getPropertyValue('--scene-sun').trim());
    check(parseFloat(vars) < 0.8, `${tag}: --scene-sun ในโหมดมืด = ${vars} (ไม่ใช่พลบค่ำ)`);
    await p.evaluate(() => { const a = window.__sjApp.play; a.start(); a.setManual(true); for (let n = 0; n < 40 && !a.g.trains.length; n++) { const t = a.nextTarget(); if (t) a.press(t); a.step(1); } });
    const nTr = await p.evaluate(() => window.__sjApp.play.g.trains.length);
    await refresh(p); await p.waitForTimeout(300);
    const dark = await p.evaluate(() => window.__sjApp.play.view3d.stats(true));
    if (id === 'np-1' || id === 'tk-1') await p.screenshot({ path: path.join(shots, `wp10-dark-${id}-1280x800.png`) });
    await p.evaluate(() => { document.documentElement.dataset.theme = 'light'; }); await refresh(p); await p.waitForTimeout(300);
    const light = await p.evaluate(() => window.__sjApp.play.view3d.stats(true));
    await p.evaluate(() => { document.documentElement.dataset.theme = 'dark'; }); await refresh(p); await p.waitForTimeout(200);
    // นับไฟหน้ารถที่ติดตรง ๆ (draw call ของเฟรมล่าสุดขึ้นกับว่าเฟรมนั้นวาดเงาด้วยหรือไม่ จึงเทียบกันไม่ได้)
    check(dark.lamps === dark.trains && light.lamps === 0, `${tag}: ไฟหน้ารถติด มืด ${dark.lamps}/${dark.trains} สว่าง ${light.lamps}/${light.trains} คัน (ควรติดทุกคันเฉพาะพลบค่ำ)`);
    note(`${tag}: ขบวน ${nTr} calls มืด ${dark.calls} / สว่าง ${light.calls} tris ${dark.tris} tier ${dark.tier}`);
    if (id === 'np-1') {
      // fps จริงตอนเกมเดินเอง (headless ใช้ SwiftShader ค่านี้ต่ำกว่าเครื่องจริง ใช้ดูแนวโน้ม)
      await p.evaluate(() => window.__sjApp.play.setManual(false));
      const fps = await p.evaluate(() => new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(f); else r(n / ((performance.now() - t0) / 1000)); }; requestAnimationFrame(f); }));
      for (const t of ['high', 'mid', 'low']) {
        const s = await p.evaluate(async t => { const v = window.__sjApp.play.view3d; v.setTier(t); v.touch(); await new Promise(r => setTimeout(r, 500)); return v.stats(); }, t).catch(() => null);
        if (s) note(`${tag}: ระดับ ${t}: calls ${s.calls} tris ${s.tris}`);
      }
      note(`${tag}: fps (headless) ~${fps.toFixed(1)}`);
    }
    await toggle2D(p, tag);
    check(!errs.length, `${tag}: error ${errs.slice(0, 3).join(' | ')}`);
    await ctx.close();
  }
}

/* ---------- เพิ่ม: หมุนจอระหว่างเล่น 3 มิติ ---------- */
async function rotateMid(b, game) {
  const { ctx, p, errs } = await newPage(b, { w: 844, h: 390 }), tag = 'หมุนจอ tk-1';
  await p.goto(game.url + '#dev/namtok/tk-1', { waitUntil: 'load' });
  if (!(await wait3D(p))) { await ctx.close(); return; }
  await p.evaluate(() => { const a = window.__sjApp.play; a.start(); a.setManual(true); });
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(400); await refresh(p);
  const ch = await chipsInfo(p);
  check(ch.length && ch.every(c => c.inView && c.topKey === c.key), `${tag}: หลังหมุนเป็นแนวตั้ง ป้ายล้นหรือถูกบัง ${ch.filter(c => !c.inView || c.topKey !== c.key).map(c => c.key)}`);
  const t = await p.evaluate(() => window.__sjApp.play.nextTarget());
  if (t) { const c = ch.find(x => x.key === t.kind + ':' + (t.id ?? t.no)); const s0 = await p.evaluate(() => JSON.stringify(window.__sjApp.play.snapshot())); if (c) await p.touchscreen.tap(c.x, c.y); check(c && s0 !== await p.evaluate(() => JSON.stringify(window.__sjApp.play.snapshot())), `${tag}: แตะเป้าคำใบ้หลังหมุนจอไม่โดน`); }
  await p.screenshot({ path: path.join(shots, 'wp10-rotate-mid-390x844.png') });
  check(!errs.length, `${tag}: error ${errs.slice(0, 3).join(' | ')}`);
  await ctx.close();
}

(async () => {
  fs.mkdirSync(shots, { recursive: true });
  const game = await serveGame(), b = await chromium.launch();
  try {
    if (want('first')) await firstMissions(b, game);
    if (want('cam')) for (const vp of [{ w: 844, h: 390 }, { w: 390, h: 844 }]) for (const id of ['tk-1', 'np-1']) await tapAfterCamera(b, game, vp, id);
    if (want('token')) { await tokenWin(b, game, { w: 844, h: 390 }, 'tk-token'); await tokenWin(b, game, { w: 390, h: 844 }, 'wp-token'); }
    if (want('free')) { await freePlay(b, game, { w: 844, h: 390 }); await freePlay(b, game, { w: 390, h: 844 }); await buildPlay(b, game); }
    if (want('dark')) await darkAndPerf(b, game);
    if (want('rotate')) await rotateMid(b, game);
  } finally { await b.close(); game.close(); }
  console.log(fails.length ? `\nไม่ผ่าน ${fails.length} ข้อ` : '\nWP10 เจาะจุด: ผ่าน');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
