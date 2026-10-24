// ตรวจฉาก 3 มิติในหน้าเล่น (สถานีท่ากิเลน) — ใช้: node test/view3d-ui-test.js (เปิด dist/ เอง ต้อง build ก่อน หรือตั้ง SJ_URL=http://localhost:5173/)
// 1) dist: three.js อยู่ในก้อนแยก โหลดเฉพาะตอนเปิด 3 มิติ ก้อนนั้นไม่เกิน 1 MB และหน้าแรกไม่มีโค้ด WebGL
// 2) 844×390 และ 390×844 (เวทีหมุน): เปิดมาเป็น 3 มิติเอง (ค่าเริ่มต้น WP10) ฉากขึ้นไม่มี error ของหน้าเว็บหรือ WebGL
//    บอทเล่น tk-1 จนชนะด้วยการ "แตะป้ายจริงบนจอ" ตามคำใบ้ ป้ายแตะกว้างและสูง >= 40 px
//    กลับเป็นแผงผังเส้นได้ และจำค่าที่เลือก (เปิดใหม่แล้วยังเป็น 3 มิติ)
// 2b) ภารกิจห่วงที่น้ำตกใน 3 มิติ: แตะเครื่องทางสะดวก/ให้ทางจริงจนชนะ ลากกล้องจากป้ายไม่กดเสา
// 2c) งบการวาดของหนองปลาดุกตลอดภารกิจ np-2 (สถานีที่หนักสุด)
// 3) งบการวาดที่ระดับกลาง: draw call <= 90 สามเหลี่ยม <= 180,000 (docs/ART-3D.md ข้อ 5) ระดับประหยัด <= 50 / 90,000
// เครื่องที่ไม่มี WebGL: ฉากต้องถอยกลับแผงผังเส้นพร้อมข้อความ ไม่ใช่หน้าพัง (ข้ามข้อ 2–3 ถ้าไม่ได้ตั้ง SJ_REQUIRE_WEBGL=1)
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { serveGame } = require('./lib/serve.js');

const root = path.resolve(__dirname, '..');
const fails = [];
const fail = m => { fails.push(m); console.error('  ✗ ' + m); };
const check = (ok, m) => { if (!ok) fail(m); };

function bundle() {
  const dir = path.join(root, 'dist/assets');
  if (process.env.SJ_URL || !fs.existsSync(dir)) return;
  const js = fs.readdirSync(dir).filter(f => f.endsWith('.js'));
  const scene = js.filter(f => /^scene3d-/.test(f));
  check(scene.length === 1, `มีก้อน scene3d-*.js 1 ก้อน (พบ ${scene.join(', ') || 'ไม่มี'})`);
  if (scene[0]) check(fs.statSync(path.join(dir, scene[0])).size <= 1024 * 1024, `ก้อนฉาก 3 มิติไม่เกิน 1 MB (${fs.statSync(path.join(dir, scene[0])).size} ไบต์)`);
  for (const f of js.filter(f => !/^scene3d-/.test(f))) check(!fs.readFileSync(path.join(dir, f), 'utf8').includes('WebGLRenderer'), `${f}: มี three.js ปนในก้อนอื่น (ต้องโหลดเฉพาะตอนเปิด 3 มิติ)`);
}

async function run(b, game, vp) {
  const ctx = await b.newContext({ viewport: { width: vp.w, height: vp.h }, hasTouch: true, isMobile: false, deviceScaleFactor: 1 });
  const p = await ctx.newPage(), errs = [];
  p.on('pageerror', e => errs.push('page error: ' + e.message));
  p.on('console', m => { if (m.type() === 'error' || /GL_INVALID|WebGL:/.test(m.text())) errs.push(m.text().slice(0, 200)); });
  const tag = `${vp.w}×${vp.h}`;
  await p.goto(game.url + '#dev/namtok/tk-1', { waitUntil: 'load' });
  await p.waitForFunction(() => window.__sjApp && window.__sjApp.play && window.__sjApp.play.view3d);
  const btn = p.locator('.pl-bar [data-act="view"]');
  check(await btn.isVisible(), `${tag}: ไม่มีปุ่ม 3 มิติที่ท่ากิเลน`);
  const bb = await btn.boundingBox(); check(bb && Math.min(bb.width, bb.height) >= 40 - 0.5, `${tag}: ปุ่ม 3 มิติเล็กกว่า 40 px ${JSON.stringify(bb)}`);
  // ค่าเริ่มต้น (WP10): ยังไม่เคยเลือก = เปิดฉาก 3 มิติเองเมื่อเครื่องรองรับ ไม่ต้องกดปุ่ม
  const ok = await p.waitForFunction(() => { const v = window.__sjApp.play.view3d, s = v.stats(); return v.active && s && s.calls > 0 ? 'ok' : document.querySelector('.pl-bar [data-act="view"]').hidden ? 'nowebgl' : false; }, null, { timeout: 60000 }).then(h => h.jsonValue()).catch(() => 'timeout');
  if (ok !== 'ok') {
    const msg = await p.evaluate(() => document.querySelector('.pl-msg').textContent);
    if (ok === 'nowebgl' && !process.env.SJ_REQUIRE_WEBGL) { console.log(`  - ${tag}: เครื่องนี้ไม่มี WebGL ถอยกลับแผงผังเส้นแล้ว (${msg}) ข้ามข้อ 2–3`); await ctx.close(); return; }
    fail(`${tag}: เปิดฉาก 3 มิติไม่ได้ (${ok}) ${msg}`); await ctx.close(); return;
  }
  check(await p.evaluate(() => getComputedStyle(document.querySelector('canvas.v3d')).display !== 'none'), `${tag}: canvas 3 มิติไม่แสดง`);
  check(await p.evaluate(() => document.querySelector('.pl-bar [data-act="view"]').textContent.trim() === 'ผังเส้น'), `${tag}: เปิดมาเป็น 3 มิติแล้วปุ่มต้องเป็น "ผังเส้น"`);

  // บอทแตะป้ายจริงตามคำใบ้จนจบภารกิจ (เวลาเดินเฉพาะตอนบอทสั่ง)
  await p.evaluate(() => { const a = window.__sjApp.play; a.start(); a.setManual(true); });
  let taps = 0, small = 0, missed = 0;
  for (let i = 0; i < 600; i++) {
    const st = await p.evaluate(() => { const a = window.__sjApp.play; return { state: a.g.state, t: a.nextTarget() }; });
    if (st.state !== 'play') break;
    if (st.t) {
      await p.evaluate(() => window.__sjApp.play.view3d.touch());
      await p.waitForTimeout(60);
      const c = await p.evaluate(t => window.__sjApp.play.view3d.targetClient(t), st.t);
      if (!c) { missed++; await p.evaluate(t => window.__sjApp.play.press(t), st.t); }
      else {
        if (Math.min(c.w, c.h) < 40 - 0.5) small++;
        const before = await p.evaluate(() => JSON.stringify(window.__sjApp.play.snapshot()));
        await p.touchscreen.tap(c.x, c.y); taps++;
        const after = await p.evaluate(() => JSON.stringify(window.__sjApp.play.snapshot()));
        if (before === after) { missed++; await p.evaluate(t => window.__sjApp.play.press(t), st.t); }
      }
    }
    await p.evaluate(() => window.__sjApp.play.step(1));
  }
  const end = await p.evaluate(() => window.__sjApp.play.g.state);
  check(end === 'win', `${tag}: บอทเล่น tk-1 ใน 3 มิติไม่ชนะ (สถานะ ${end})`);
  check(taps >= 4 && missed === 0, `${tag}: แตะป้ายจริง ${taps} ครั้ง พลาด ${missed} ครั้ง`);
  check(small === 0, `${tag}: ป้ายแตะเล็กกว่า 40 px ${small} ครั้ง`);

  // งบการวาด (ระดับกลาง และประหยัด) — วัดหลังวาดใหม่
  for (const [tier, calls, tris] of [['mid', 90, 180000], ['low', 50, 90000]]) {
    const s = await p.evaluate(async t => { const v = window.__sjApp.play.view3d; v.setTier(t); v.touch(); await new Promise(r => setTimeout(r, 400)); v.touch(); await new Promise(r => setTimeout(r, 400)); return v.stats(); }, tier);
    check(s.calls <= calls && s.tris <= tris, `${tag}: งบระดับ ${tier} เกิน ${JSON.stringify(s)} (ต้อง <= ${calls} draw call, ${tris} สามเหลี่ยม)`);
  }

  // กลับเป็นแผงผังเส้น แล้วเปิดหน้าใหม่ต้องจำค่าที่เลือก
  await p.locator('.pl-ov [data-act="exit"], .pl-ov [data-act="retry"]').first().waitFor({ timeout: 5000 }).catch(() => {});
  await p.evaluate(() => window.__sjApp.play.restart());
  await btn.tap();
  await p.waitForFunction(() => !window.__sjApp.play.view3d.active);
  check(await p.evaluate(() => getComputedStyle(document.querySelector('canvas.v3d')).display === 'none' && (document.querySelector('.pl-bar [data-act="view"]').textContent.trim() === '3 มิติ')), `${tag}: กลับเป็นแผงผังเส้นไม่ได้`);
  // เลือกผังเส้นไว้ = เปิดหน้าใหม่ยังเป็นผังเส้น (ไม่ทับค่าที่ผู้เล่นเลือกด้วยค่าเริ่มต้น 3 มิติ)
  await p.reload({ waitUntil: 'load' });
  await p.waitForFunction(() => window.__sjApp && window.__sjApp.play && window.__sjApp.play.view3d);
  await p.waitForTimeout(500);
  check(await p.evaluate(() => !window.__sjApp.play.view3d.active), `${tag}: เปิดหน้าใหม่แล้วไม่จำว่าเลือกผังเส้นไว้`);
  await btn.tap();
  await p.waitForFunction(() => window.__sjApp.play.view3d.active);
  await p.reload({ waitUntil: 'load' });
  const again = await p.waitForFunction(() => window.__sjApp && window.__sjApp.play && window.__sjApp.play.view3d && window.__sjApp.play.view3d.active, null, { timeout: 60000 }).then(() => true).catch(() => false);
  check(again, `${tag}: เปิดหน้าใหม่แล้วไม่จำว่าเลือก 3 มิติไว้`);
  check(!errs.length, `${tag}: มี error ${errs.slice(0, 3).join(' | ')}`);
  console.log(`  - ${tag}: แตะป้ายจริง ${taps} ครั้ง จบภารกิจ ${end}`);
  await ctx.close();
}

// ภารกิจห่วงใน 3 มิติ (WP10): ป้ายเครื่องทางสะดวกและปุ่ม "ให้ทาง" แตะได้จริงจนชนะ และลากกล้องที่เริ่มบนป้ายเสาต้องไม่กดเสา
async function tokenRun(b, game, vp, id) {
  const ctx = await b.newContext({ viewport: { width: vp.w, height: vp.h }, hasTouch: true, deviceScaleFactor: 1 });
  const p = await ctx.newPage(), errs = [], tag = `${vp.w}×${vp.h} ${id}`;
  p.on('pageerror', e => errs.push('page error: ' + e.message));
  await p.goto(game.url + '#dev/namtok/' + id, { waitUntil: 'load' });
  const ok = await p.waitForFunction(() => { const a = window.__sjApp && window.__sjApp.play, v = a && a.view3d, s = v && v.stats(); return v && v.active && s && s.calls > 0; }, null, { timeout: 60000 }).then(() => true).catch(() => false);
  if (!ok) { if (!process.env.SJ_REQUIRE_WEBGL) console.log(`  - ${tag}: ไม่มี WebGL ข้าม`); else fail(`${tag}: เปิดฉาก 3 มิติไม่ได้`); await ctx.close(); return; }
  await p.evaluate(() => { const a = window.__sjApp.play; a.start(); a.setManual(true); a.view3d.touch(); });
  await p.waitForTimeout(150);
  // ลากจากป้ายเสา: เกมต้องไม่เปลี่ยน แต่กล้องหมุน
  const sig = await p.evaluate(() => { const a = window.__sjApp.play; const t = Object.keys(a.g.S).map(k => ({ kind: 'signal', id: k })).find(t => a.view3d.targetClient(t)); return t && a.view3d.targetClient(t); });
  if (sig) {
    const cdp = await ctx.newCDPSession(p), touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((q, i) => ({ x: q[0], y: q[1], id: i })) });
    const before = await p.evaluate(() => JSON.stringify(window.__sjApp.play.snapshot())), az0 = await p.evaluate(() => window.__sjApp.play.view3d.camera().state.az);
    await touch('touchStart', [[sig.x, sig.y]]); for (let i = 1; i <= 8; i++) await touch('touchMove', [[sig.x + i * 10, sig.y + i * 3]]); await touch('touchEnd', []);
    await p.waitForTimeout(100);
    check(before === await p.evaluate(() => JSON.stringify(window.__sjApp.play.snapshot())), `${tag}: ลากกล้องจากป้ายเสาแล้วเสาถูกกด`);
    check(Math.abs(az0 - await p.evaluate(() => window.__sjApp.play.view3d.camera().state.az)) > 0.1, `${tag}: ลากแล้วกล้องไม่หมุน`);
  } else fail(`${tag}: ไม่เห็นป้ายเสาในมุมมาตรฐาน`);
  let taps = 0, missed = 0, kinds = new Set();
  for (let i = 0; i < 1500; i++) {
    const st = await p.evaluate(() => { const a = window.__sjApp.play; return { state: a.g.state, t: a.nextTarget() }; });
    if (st.state !== 'play') break;
    if (st.t) {
      await p.evaluate(() => window.__sjApp.play.view3d.touch()); await p.waitForTimeout(40);
      const c = await p.evaluate(t => window.__sjApp.play.view3d.targetClient(t), st.t);
      const before = await p.evaluate(() => JSON.stringify(window.__sjApp.play.snapshot()));
      if (c) { await p.touchscreen.tap(c.x, c.y); taps++; kinds.add(st.t.kind); }
      if (!c || before === await p.evaluate(() => JSON.stringify(window.__sjApp.play.snapshot()))) { missed++; await p.evaluate(t => window.__sjApp.play.press(t), st.t); }
    }
    await p.evaluate(() => window.__sjApp.play.step(1));
  }
  const end = await p.evaluate(() => window.__sjApp.play.g.state);
  check(end === 'win', `${tag}: บอทเล่นใน 3 มิติไม่ชนะ (${end})`);
  check(missed === 0 && kinds.has('token') && kinds.has('accept'), `${tag}: แตะป้าย ${taps} ครั้ง พลาด ${missed} ชนิดที่แตะ ${[...kinds]}`);
  check(!errs.length, `${tag}: มี error ${errs.slice(0, 3).join(' | ')}`);
  console.log(`  - ${tag}: แตะป้ายจริง ${taps} ครั้ง (${[...kinds].join(' ')}) จบภารกิจ ${end}`);
  await ctx.close();
}

// งบการวาดของสถานีที่หนักสุด (หนองปลาดุก np-2 มีหลายขบวนพร้อมกัน) ระดับกลาง ตลอดภารกิจ: draw call <= 90 สามเหลี่ยม <= 180,000
// (QA WP10: เดิมเกินที่ 101 เพราะชิ้นต่อขบวนและป้ายหลายวัสดุ วัดเฉพาะท่ากิเลนจึงไม่เห็น)
async function budgetRun(b, game, id) {
  const p = await b.newPage({ viewport: { width: 844, height: 390 } }), tag = `844×390 ${id} งบการวาด`;
  await p.goto(game.url + '#dev/namtok/' + id, { waitUntil: 'load' });
  const ok = await p.waitForFunction(() => { const a = window.__sjApp && window.__sjApp.play, v = a && a.view3d, s = v && v.stats(); return v && v.active && s && s.calls > 0; }, null, { timeout: 60000 }).then(() => true).catch(() => false);
  if (!ok) { await p.close(); return; }
  await p.evaluate(() => { const a = window.__sjApp.play; a.start(); a.setManual(true); a.view3d.setTier('mid'); });
  const max = { calls: 0, tris: 0, trains: 0 };
  for (let i = 0; i < 2000; i++) {
    const st = await p.evaluate(() => { const a = window.__sjApp.play, t = a.nextTarget(); if (t) a.press(t); a.step(1); return { state: a.g.state, n: a.g.trains.length }; });
    if (st.state !== 'play') break;
    if (i % 3) continue;
    for (let f = 0; f < 2; f++) {   // เงาวาดทุก 2 เฟรมที่ระดับกลาง วัดทั้งเฟรมที่มีและไม่มีรอบวาดเงา
      const s = await p.evaluate(async () => { const v = window.__sjApp.play.view3d; v.touch(); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); return v.stats(); });
      if (s.calls > max.calls) { max.calls = s.calls; max.trains = st.n; } max.tris = Math.max(max.tris, s.tris);
    }
  }
  check(max.calls <= 90 && max.tris <= 180000, `${tag}: เกินงบ ${JSON.stringify(max)}`);
  console.log(`  - ${tag}: สูงสุด ${max.calls} draw call ${max.tris} สามเหลี่ยม (ขบวน ${max.trains})`);
  await p.close();
}

(async () => {
  bundle();
  const game = await serveGame(), b = await chromium.launch();
  try {
    for (const vp of [{ w: 844, h: 390 }, { w: 390, h: 844 }]) await run(b, game, vp);
    await tokenRun(b, game, { w: 844, h: 390 }, 'nt-1');
    await budgetRun(b, game, 'np-2');

  } finally { await b.close(); game.close(); }
  console.log(fails.length ? `\nไม่ผ่าน ${fails.length} ข้อ` : 'ฉาก 3 มิติในหน้าเล่น: ผ่าน');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
