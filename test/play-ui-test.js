// ตรวจหน้าจอเล่นด่านของโหมดอาชีพ (แผงผังเส้น 2 มิติ) — ใช้: node test/play-ui-test.js (เปิด dist/ เอง ต้อง build ก่อน หรือตั้ง SJ_URL=http://localhost:5173/)
// ส่วนที่ 1 (Node ล้วน): เรขาคณิตของแผงทุกผังใน data/stations — เป้าแตะห่างกันพอ และแตะกลางเป้าแล้วได้ target นั้นจริง
// ส่วนที่ 2 (Playwright):
//   ก) ทุกด่านของชุด test-crossing ผ่านหน้าจอจริง (#dev/test-crossing/<id>) ที่ 844×390 และ 390×844 (เวทีหมุน 90°):
//      บอทถามคำใบ้ (nextTarget) แล้ว "แตะที่พิกัดจริงบนจอ" จนชนะ ตรวจว่าจุดที่แตะโดนเป้านั้น เป้ากว้าง >= 40 px ดาวถูกเซฟ
//   ข) ภาพ play-* ที่ 4 ขนาดจอ × สว่าง/มืด ของด่านสวนทาง ปลายทาง ชุมทาง NX (ก่อนเริ่ม ระหว่างเล่น จบ)
//   ค) การ์ดแพ้ (ตาม code), พัก/เล่นต่อ/เริ่มใหม่, ป้ายข้อจำกัดของข้อมูล 3 ข้อ, เป้าแตะของปุ่ม >= 40 px, ไม่มี console error
//   ง) ชุดภารกิจจริงของแผนที่ (data/levels/namtok.json) เล่นตามลำดับปลดล็อกผ่านหน้าจอจริง: ภารกิจแรกของแต่ละสถานี (tk-1, wp-1, nt-1, kb-1, np-1) แตะจริง
//      ที่เหลือสั่งผ่าน hook ดาวบนแผนที่ต้องตรงกับดาวจากหน้าเล่น ป้ายข้อจำกัดของข้อมูลและหมายเหตุผังย่อต้องขึ้น
//   จ) ผัง schema 1 (โหมดประวัติศาสตร์) วาดและเล่นบนตัววาดใหม่ได้
//   SJ_ONLY=844x390 จำกัดขนาดจอของ (ข), SJ_SKIP_BROWSER=1 รันเฉพาะส่วนที่ 1
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { serveGame } = require('./lib/serve.js');

const root = path.resolve(__dirname, '..'), shots = path.join(__dirname, 'screenshots');
const src = f => 'file://' + path.join(root, 'src', f).split(path.sep).map(encodeURIComponent).join('/').replace(/%3A/g, ':');
const fails = [];
const fail = m => { fails.push(m); console.error('  ✗ ' + m); };
const check = (ok, m) => { if (!ok) fail(m); };
const TEST_PACK = 'test-crossing';

async function pure() {
  const sim = await import(src('sim/index.js')), G = await import(src('render/panel-geom.js'));
  const dir = path.join(root, 'data/stations');
  const list = fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => ({ name: f, json: JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) }));
  const { stations } = sim.loadStations(list);
  assert.ok(Object.keys(stations).length >= 6, 'โหลดผังได้น้อยเกินไป');
  for (const id in stations) {
    const L = stations[id], geo = G.panelGeom(L), gap = G.minTargetGap(L);
    assert.ok(gap.min >= G.MIN_GAP, `${id}: เป้าแตะ ${gap.pair && gap.pair.join(' กับ ')} ห่างกันแค่ ${gap.min.toFixed(0)} (ต้อง >= ${G.MIN_GAP})`);
    assert.ok(geo.view.y1 - geo.view.y0 <= 480 && geo.view.x1 - geo.view.x0 === L.size[0], `${id}: กรอบแผงผิด ${JSON.stringify(geo.view)}`);
    // แตะกลางเป้าแล้วต้องได้ target นั้น (ไม่ถูกเป้าข้างเคียงแย่ง) ทั้งเสา ประแจ ทางจอด และปลายทางของยุค NX
    const g = { L, era: { nx: false }, nxSel: null };
    const same = (a, b) => a && a.kind === b.kind && (a.id ?? a.no) === (b.id ?? b.no);
    for (const t of [...Object.keys(L.S).map(k => ({ kind: 'signal', id: k })), ...Object.keys(L.P).map(k => ({ kind: 'point', id: k })), ...L.plats.map(n => ({ kind: 'platform', no: n }))]) {
      const c = G.targetCenter(L, t);
      assert.ok(c && same(G.hitTest(g, c.x, c.y), t), `${id}: แตะกลาง ${JSON.stringify(t)} แล้วได้ ${JSON.stringify(c && G.hitTest(g, c.x, c.y))}`);
    }
    for (const sig in L.S) {
      const gn = { L, era: { nx: true }, nxSel: sig };
      for (const t of G.destinations(gn)) { const c = G.targetCenter(L, t); assert.ok(c && same(G.hitTest(gn, c.x, c.y), t), `${id}: ยุค NX เลือก ${sig} แล้วแตะปลายทาง ${JSON.stringify(t)} ได้ ${JSON.stringify(c && G.hitTest(gn, c.x, c.y))}`); }
    }
  }
  console.log(`✓ ส่วนที่ 1: เรขาคณิตแผง ${Object.keys(stations).length} ผัง เป้าแตะแยกกันได้ทุกผัง`);
}

const VIEWS = [
  { name: '844x390', width: 844, height: 390, dpr: 2, touch: true },
  { name: '390x844', width: 390, height: 844, dpr: 2, touch: true },   // ถือแนวตั้ง: เวทีหมุน 90°
  { name: '1180x820', width: 1180, height: 820, dpr: 2, touch: true },
  { name: '1280x800', width: 1280, height: 800, dpr: 1, touch: false },
];

async function browser() {
  const { chromium } = require('playwright');
  fs.mkdirSync(shots, { recursive: true });
  const game = await serveGame(), b = await chromium.launch();
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const open = async (v, scheme, tag) => {
    const ctx = await b.newContext({ viewport: { width: v.width, height: v.height }, deviceScaleFactor: v.dpr, hasTouch: v.touch, colorScheme: scheme });
    const p = await ctx.newPage();
    p.on('pageerror', e => fail(`${tag}: page error: ${e.message}`));
    p.on('console', m => { if (m.type() === 'error') fail(`${tag}: console error: ${m.text()}`); });
    p.on('requestfailed', r => fail(`${tag}: โหลดไม่ได้: ${r.url()}`));
    p.on('request', r => { if (!/^(data|blob):/.test(r.url()) && !r.url().startsWith(game.origin)) fail(`${tag}: คำขอออกนอกเครื่อง: ${r.url()}`); });
    await p.goto(game.url, { waitUntil: 'load' });
    await p.waitForFunction(() => !!window.__sjApp);
    await p.evaluate(async () => { await window.__sjApp.ready(); await document.fonts.ready; });
    return { ctx, p };
  };
  const openLevel = async (p, packId, id) => {
    await p.evaluate(([a, c]) => window.__sjApp.openDev(a, c), [packId, id]);
    await p.waitForFunction(c => window.__sjApp.play && window.__sjApp.play.id === c && window.__sjApp.play.g.state === 'intro', id);
    await p.evaluate(() => window.__sjApp.play.setManual(true));
  };
  const shot = (p, name) => p.screenshot({ path: path.join(shots, `play-${name}.png`) });
  // ทุกอย่างที่กดได้ในหน้าจอเล่นต้องกว้าง/สูงอย่างน้อย 40 px บนจอจริง และอยู่ในจอ
  const audit = async (p, v, where) => {
    const bad = await p.evaluate(({ W, H }) => [...document.querySelectorAll('#s-play :is(a,button)')].map(el => {
      const r = el.getBoundingClientRect();
      if (!r.width || el.closest('[hidden]')) return null;
      const name = (el.getAttribute('aria-label') || el.textContent).trim().slice(0, 24);
      if (r.width < 39.5 || r.height < 39.5) return `${name}: เป้าแตะ ${r.width.toFixed(0)}×${r.height.toFixed(0)}`;
      if (r.left < -0.5 || r.top < -0.5 || r.right > W + 0.5 || r.bottom > H + 0.5) return `${name}: ล้นจอ ${[r.left, r.top, r.right, r.bottom].map(n => n.toFixed(0))}`;
      return null;
    }).filter(Boolean), { W: v.width, H: v.height });
    bad.forEach(m => fail(`${where}: ${m}`));
  };
  // เล่นด่านที่เปิดอยู่ตามคำใบ้ของเอนจิน real = แตะจอจริงที่พิกัดของเป้า, ไม่ real = สั่งผ่าน hook; midShot = ถ่ายภาพเมื่อมีขบวนในผังครบ 2 ขบวน (หรือขบวนแรกจอดแล้ว)
  const playLevel = async (p, v, tag, { real, midShot = null }) => {
    let taps = 0, minTarget = Infinity, shotDone = !midShot;
    for (let i = 0; i < 4000; i++) {
      const s = await p.evaluate(() => {
        const P = window.__sjApp.play, g = P.g;
        if (g.state !== 'play') return { state: g.state };
        let t = P.nextTarget();
        for (let n = 0; !t && n < 40 && g.state === 'play'; n++) { P.step(0.05); t = P.nextTarget(); }
        const at = t ? P.targetClient(t) : null, c = t ? P.geom() : null;
        return { state: g.state, t, at, time: g.time, trains: g.trains.length, stopped: g.trains.filter(x => x.stopped).length,
          hitAt: at ? (() => { const bp = P.toBoard(at.x, at.y); return P.hitTest(bp.x, bp.y); })() : null, px: P.scale() * (t && (t.kind === 'signal' || t.kind === 'point') ? 88 : 64) };
      });
      if (!shotDone && s.state === 'play' && (s.trains >= 2 || (s.trains === 1 && s.stopped === 1 && s.time > 8))) { shotDone = true; await sleep(60); await midShot(); }
      if (s.state !== 'play') break;
      if (!s.t) continue;
      const key = t => t && `${t.kind}:${t.id ?? t.no}`;
      if (key(s.hitAt) !== key(s.t)) { fail(`${tag}: จุดแตะของ ${key(s.t)} ไปโดน ${key(s.hitAt)}`); break; }
      if (s.at.x < 0 || s.at.y < 0 || s.at.x > v.width || s.at.y > v.height) { fail(`${tag}: เป้า ${key(s.t)} อยู่นอกจอ ${JSON.stringify(s.at)}`); break; }
      minTarget = Math.min(minTarget, s.px);
      if (real) { if (v.touch) await p.touchscreen.tap(s.at.x, s.at.y); else await p.mouse.click(s.at.x, s.at.y); } else await p.evaluate(t => window.__sjApp.play.press(t), s.t);
      taps++;
      // แตะแล้วคำใบ้ต้องขยับ (ไม่งั้นแปลว่าแตะไม่โดน) ให้โอกาสซ้ำได้เล็กน้อยเพราะบางคำสั่งถูกปฏิเสธชั่วคราว
      if (taps > 400) { fail(`${tag}: แตะเกิน 400 ครั้งแล้วยังไม่จบ (คำใบ้ล่าสุด ${key(s.t)})`); break; }
    }
    if (!shotDone) await midShot();
    const end = await p.evaluate(() => { const P = window.__sjApp.play, g = P.g; return { state: g.state, done: g.done, total: g.lv.sched.length, score: Math.round(g.score), max: g.max, code: g.result && g.result.code, stars: g.result && g.result.stars, time: +g.time.toFixed(1), card: document.querySelector('.pl-card') ? document.querySelector('.pl-card').textContent : '' }; });
    return { ...end, taps, minTarget };
  };

  try {
    // ---- ก) ทุกด่านของชุดทดสอบ ด้วยการแตะจริง ที่จอมือถือแนวนอนและแนวตั้ง (หมุน) ----
    for (const v of VIEWS.slice(0, 2)) {
      const tag0 = `${v.name}`, { ctx, p } = await open(v, 'light', tag0);
      const lay = await p.evaluate(() => window.__sjApp.stage.layout);
      check(lay.rotated === (v.height > v.width), `${tag0}: การหมุนเวทีผิด ${JSON.stringify(lay)}`);
      const ids = await p.evaluate(id => window.__sjApp.data.packs[id].levels.map(l => ({ id: l.id, error: l.error })), TEST_PACK);
      check(ids.length >= 7 && ids.every(l => !l.error), `${tag0}: ชุด ${TEST_PACK} มีด่านที่เปิดไม่ได้ ${JSON.stringify(ids.filter(l => l.error))}`);
      for (const { id } of ids) {
        const tag = `${v.name} ${id}`;
        await openLevel(p, TEST_PACK, id);
        const intro = await p.textContent('.pl-card');
        for (const t of ['สิ่งที่สอน', 'เป้าหมาย', 'เกมนี้ไม่ใช่ผลงานทางการของการรถไฟแห่งประเทศไทย ไม่ใช่ขั้นตอนปฏิบัติงานจริง', 'ระบบสัญญาณสมมุติ', 'ชื่อเสาในเกมนี้เกมตั้งเอง ไม่ใช่ชื่อจริงของสถานี', 'เริ่มเดินรถ']) check(intro.includes(t), `${tag}: การ์ดก่อนเริ่มไม่มี "${t}"`);
        await audit(p, v, `${tag} ก่อนเริ่ม`);
        const start = p.locator('.pl-card [data-act="start"]');
        if (v.touch) await start.tap(); else await start.click();
        check(await p.evaluate(() => window.__sjApp.play.g.state) === 'play', `${tag}: กด "เริ่มเดินรถ" แล้วเกมไม่เริ่ม`);
        const r = await playLevel(p, v, tag, { real: true });
        check(r.state === 'win' && r.done === r.total, `${tag}: บอทแตะจริงไม่ชนะ (${r.state} ${r.code || ''} ส่ง ${r.done}/${r.total} เวลา ${r.time})`);
        check(r.minTarget >= 40, `${tag}: เป้าแตะบนแผงเล็กกว่า 40 px (${r.minTarget.toFixed(1)})`);
        check(r.card.includes('ส่งครบ') && r.card.includes(`${r.score} จาก ${r.max} คะแนน`), `${tag}: การ์ดจบไม่บอกผล: ${r.card.slice(0, 80)}`);
        const saved = await p.evaluate(([a, c]) => window.__sjApp.save.getBest(a, c), [TEST_PACK, id]);
        check(saved.stars === r.stars && saved.score === r.score, `${tag}: เซฟไม่ตรง ${JSON.stringify(saved)} กับ ${r.stars} ดาว ${r.score}`);
        await audit(p, v, `${tag} จบ`);
        console.log(`  ${tag}: แตะจริง ${r.taps} ครั้ง -> ${r.state} ${r.done}/${r.total} ${r.score}/${r.max} ${r.stars} ดาว เป้าเล็กสุด ${r.minTarget.toFixed(0)} px`);
      }
      // ---- ค) พัก / เล่นต่อ / เริ่มใหม่ และการ์ดแพ้ตาม code ----
      const tag = `${v.name} x-4`;
      await openLevel(p, TEST_PACK, 'x-4');
      await p.locator('.pl-card [data-act="start"]').tap();
      await p.locator('.pl-bar [data-act="menu"]').tap();
      check(await p.evaluate(() => window.__sjApp.play.paused) && (await p.textContent('.pl-card')).includes('หยุดเวลาไว้'), `${tag}: ปุ่มพักไม่หยุดเกม`);
      for (const t of ['ชื่อเสาในเกมนี้เกมตั้งเอง ไม่ใช่ชื่อจริงของสถานี', 'เล่นต่อ', 'เริ่มใหม่', 'ออก']) check((await p.textContent('.pl-card')).includes(t), `${tag}: การ์ดพักไม่มี "${t}"`);
      await audit(p, v, `${tag} พัก`);
      await p.locator('.pl-card [data-act="resume"]').tap();
      check(await p.evaluate(() => !window.__sjApp.play.paused && document.querySelector('.pl-ov').hidden), `${tag}: เล่นต่อไม่ได้`);
      // ยุคไม่มีอินเตอร์ล็อก: เปิดเสาเข้าทั้งสองฝั่งโดยไม่สับประแจ ขบวนสวนกันบนทางประธาน = แพ้
      const f = await p.evaluate(() => { const P = window.__sjApp.play; P.step(6); for (const k in P.g.L.S) if (P.g.L.S[k].type === 'home') P.press({ kind: 'signal', id: k }); for (let i = 0; i < 80 && P.g.state === 'play'; i++) P.step(0.5); return { state: P.g.state, code: P.g.result && P.g.result.code }; });
      check(f.state === 'fail' && !!f.code, `${tag}: ไม่เกิดเหตุตามที่จัดไว้ ${JSON.stringify(f)}`);
      const fc = await p.textContent('.pl-card');
      check(fc.includes('ไม่ผ่าน') && fc.includes('ลองอีกครั้ง'), `${tag}: การ์ดแพ้ไม่ขึ้น: ${fc.slice(0, 80)}`);
      await audit(p, v, `${tag} แพ้`);
      await sleep(80); await shot(p, `fail-${v.name}-light`);
      await p.locator('.pl-card [data-act="retry"]').tap();
      check(await p.evaluate(() => window.__sjApp.play.g.state) === 'intro', `${tag}: ลองอีกครั้งแล้วไม่กลับไปการ์ดก่อนเริ่ม`);
      // ไม่มีอะไรขยับ 45 วินาที (event 'stall'): ไม่แพ้ ขึ้นแถบบอก เปิดคำใบ้ให้แม้ด่านที่ปิดคำใบ้ และเริ่มใหม่ได้
      await openLevel(p, TEST_PACK, 'x-2');
      await p.locator('.pl-card [data-act="start"]').tap();
      const sl = await p.evaluate(() => { const P = window.__sjApp.play, before = P.hint(); P.step(70); return { state: P.g.state, stalled: !!P.g.stalled, before, hint: P.hint(), bar: !document.querySelector('.pl-stall').hidden, text: document.querySelector('.pl-stall').textContent }; });
      // แถบช่วยเหลือต้องไม่ทับแผง: จุดที่คำใบ้ชี้ต้องแตะถึง canvas และกรอบของแถบไม่ซ้อนกับ canvas เลย
      const clear = await p.evaluate(() => { const P = window.__sjApp.play, t = P.nextTarget(), c = P.targetClient(t), top = document.elementFromPoint(c.x, c.y), bar = document.querySelector('.pl-stall').getBoundingClientRect(), cv = document.querySelector('.pl-board canvas').getBoundingClientRect();
        return { onCanvas: !!top && top.tagName === 'CANVAS', apart: bar.right <= cv.left + 0.5 || bar.left >= cv.right - 0.5 || bar.bottom <= cv.top + 0.5 || bar.top >= cv.bottom - 0.5, queueHidden: !document.querySelector('.pl-queue').offsetWidth }; });
      check(clear.onCanvas && clear.apart && clear.queueHidden, `${tag}: แถบช่วยเหลือทับแผงหรือบังเป้าคำใบ้ ${JSON.stringify(clear)}`);
      check(sl.state === 'play' && sl.stalled && sl.bar && sl.before === null && !!sl.hint && sl.text.includes('เริ่มใหม่'), `${tag}: ขบวนค้าง 45 วินาทีแล้วไม่ขึ้นแถบช่วยเหลือ ${JSON.stringify(sl)}`);
      await sleep(80); await audit(p, v, `${tag} ค้าง`); await shot(p, `stall-${v.name}-light`);
      // "เล่นต่อ": แถบหาย; ยังนิ่งต่ออีก แถบกลับมา; ทำตามคำใบ้จนชนะ แถบต้องไม่ค้างบนการ์ดชนะ
      await p.locator('.pl-stall [data-act="unstall"]').tap();
      const st2 = await p.evaluate(() => { const P = window.__sjApp.play, bar = document.querySelector('.pl-stall'), a = bar.hidden; P.step(5); const b5 = bar.hidden; P.step(40); return { a, b5, back: !bar.hidden, state: P.g.state }; });
      check(st2.a && st2.b5 && st2.back && st2.state === 'play', `${tag}: กด "เล่นต่อ" แล้วแถบช่วยเหลือไม่หาย หรือไม่กลับมาเมื่อยังนิ่งต่อ ${JSON.stringify(st2)}`);
      const wn = await playLevel(p, v, `${tag} หลังค้าง`, { real: true });
      check(wn.state === 'win' && await p.evaluate(() => document.querySelector('.pl-stall').hidden && !document.querySelector('.pl-foot').classList.contains('stalled')), `${tag}: แถบช่วยเหลือค้างหลังชนะ (${wn.state})`);
      await p.locator('.pl-card [data-act="retry"]').tap();
      await p.locator('.pl-card [data-act="start"]').tap();
      await p.evaluate(() => window.__sjApp.play.step(70));
      await p.locator('.pl-stall [data-act="retry"]').tap();
      check(await p.evaluate(() => window.__sjApp.play.g.state === 'intro' && document.querySelector('.pl-stall').hidden), `${tag}: ปุ่มเริ่มใหม่บนแถบช่วยเหลือไม่ทำงาน`);
      await p.locator('.pl-card [data-act="exit"]').tap();
      await p.waitForFunction(() => location.hash !== '#dev/test-crossing/x-2');   // ปุ่มกลับ = ถอยประวัติ 1 ขั้น
      await ctx.close();
    }

    // ---- ข) ภาพ 4 ขนาดจอ × สว่าง/มืด: สวนทาง ปลายทาง ชุมทาง NX ----
    const views = VIEWS.filter(v => !process.env.SJ_ONLY || process.env.SJ_ONLY.split(',').includes(v.name));
    for (const v of views) for (const scheme of ['light', 'dark']) {
      const tag0 = `${v.name}-${scheme}`, { ctx, p } = await open(v, scheme, tag0);
      for (const id of ['x-1', 't-1', 'j-1']) {
        const tag = `${tag0} ${id}`;
        await openLevel(p, TEST_PACK, id);
        await sleep(80); await shot(p, `${id}-intro-${tag0}`);
        await audit(p, v, `${tag} ก่อนเริ่ม`);
        check(await p.evaluate(() => { const c = document.querySelector('.pl-card'), b = c.querySelector('[data-act="start"]').getBoundingClientRect(), r = c.getBoundingClientRect(); return b.top >= r.top - 1 && b.bottom <= r.bottom + 1 && b.left >= r.left - 1 && b.right <= r.right + 1; }), `${tag}: ปุ่มเริ่มเดินรถหลุดการ์ด`);
        await p.evaluate(() => window.__sjApp.play.start());
        const r = await playLevel(p, v, tag, { real: false, midShot: async () => { await sleep(60); await shot(p, `${id}-mid-${tag0}`); } });
        check(r.state === 'win', `${tag}: บอทไม่ชนะ (${r.state} ${r.code || ''})`);
        await sleep(80); await shot(p, `${id}-win-${tag0}`);
        await audit(p, v, `${tag} จบ`);
      }
      await ctx.close();
    }

    // ---- ง) ชุดภารกิจจริงของแผนที่ + จ) ผัง schema 1 ----
    {
      const v = VIEWS[0], tag0 = 'career', { ctx, p } = await open(v, 'light', tag0);
      const info = await p.evaluate(() => { const A = window.__sjApp; return { id: A.pack.id, levels: A.pack.levels.map(l => ({ id: l.id, station: l.station, error: l.error, key: A.data.levelKey(l) })) }; });
      check(info.levels.every(l => l.key === l.id), 'levelKey ของ sim ไม่ได้คืน id ภารกิจ: ดาวบนแผนที่กับหน้าเล่นจะไม่ตรงกัน');
      {
        const rows = [];
        const notes = await p.evaluate(() => { const P = window.__sjApp.pack; return { pack: P.note || '', st: Object.fromEntries(P.stations.map(s => [s.station, s.note_th || ''])) }; });
        check(!!notes.st['nam-tok'] && !!notes.st['nong-pla-duk-jn'], 'career: ชุดภารกิจไม่มี note_th ของน้ำตก/หนองปลาดุก');
        for (const l of info.levels) {
          const st = await p.evaluate(([s, m]) => { const P = window.__sjApp.progress(), x = P.byId[s].missions.find(q => q.id === m); return { open: x.unlocked, lock: P.byId[s].lock, total: P.totalStars }; }, [l.station, l.id]);
          if (!st.open) { rows.push(`${l.id}: ยังล็อก (ดาวสะสม ${st.total}${st.lock && st.lock.missingStars ? ` ขาด ${st.lock.missingStars}` : ''})`); continue; }
          if (l.error) { fail(`career ${l.id}: เปิดไม่ได้: ${l.error}`); continue; }
          await p.evaluate(([s, m]) => window.__sjApp.openMission(s, m), [l.station, l.id]);
          await p.waitForFunction(c => window.__sjApp.play && window.__sjApp.play.id === c && window.__sjApp.play.g.state === 'intro', l.id);
          const intro = await p.textContent('.pl-card');
          for (const t of ['เกมนี้ไม่ใช่ผลงานทางการของการรถไฟแห่งประเทศไทย ไม่ใช่ขั้นตอนปฏิบัติงานจริง', 'ผังจำลองจากข้อมูลสาธารณะ อาจไม่ตรงกับสภาพจริง', 'ระบบสัญญาณสมมุติตามขนาดสถานี', 'ชื่อเสาในเกมนี้เกมตั้งเอง ไม่ใช่ชื่อจริงของสถานี', 'เลขทางและตารางเดินรถ', notes.st[l.station] || '']) check(intro.includes(t), `career ${l.id}: การ์ดก่อนเริ่มไม่มีป้าย "${t}"`);
          if (/-1$/.test(l.id)) { await sleep(80); await shot(p, `career-${l.id}-intro-${v.name}-light`); }
          await p.evaluate(() => { const P = window.__sjApp.play; P.setManual(true); P.start(); });
          const first = /-1$/.test(l.id);
          const r = await playLevel(p, v, `career ${l.id}`, { real: first, midShot: first ? async () => { await sleep(60); await shot(p, `career-${l.id}-mid-${v.name}-light`); } : null });
          rows.push(`${l.id}: ${r.state}${r.code ? ' ' + r.code : ''} ${r.done}/${r.total} ${r.score}/${r.max} ${r.stars || 0} ดาว แตะ${first ? 'จริง' : 'ผ่าน hook'} ${r.taps} ครั้ง`);
          check(r.state === 'win', `career ${l.id}: บอทตามคำใบ้ไม่ชนะ (${r.state} ${r.code || ''} ${r.done}/${r.total})`);
          if (first) check(r.minTarget >= 40, `career ${l.id}: เป้าแตะบนแผงเล็กกว่า 40 px (${r.minTarget.toFixed(1)})`);
          const both = await p.evaluate(([s, m, id]) => { const A = window.__sjApp; return { map: A.progress().byId[s].missions.find(q => q.id === m).stars, save: A.save.getBest(id, m).stars }; }, [l.station, l.id, info.id]);
          check(both.map === (r.stars || 0) && both.save === both.map, `career ${l.id}: ดาวบนแผนที่ ${both.map} เซฟ ${both.save} หน้าเล่น ${r.stars}`);
          await audit(p, v, `career ${l.id} จบ`);
        }
        console.log('  ชุดภารกิจจริง (' + info.id + '):\n    ' + rows.join('\n    '));
        // กลับแผนที่: ป้ายสถานีแรกต้องขึ้นดาวที่เพิ่งได้
        await p.evaluate(() => window.__sjApp.router.go({ screen: 'map', stationId: 'tha-kilen' }));
        await p.waitForSelector('#s-map:not([hidden]) .sheet .ms');
        const lab = await p.getAttribute('.mk[data-id="tha-kilen"]', 'aria-label'), tot = await p.evaluate(() => window.__sjApp.progress().byId['tha-kilen'].stars);
        check(lab.includes(`ดาว ${tot} จาก 9`) && tot > 0, `career: ป้ายท่ากิเลนบนแผนที่ไม่ขึ้นดาวจากหน้าเล่น (${lab})`);
        await sleep(900); await shot(p, `career-map-after-${v.name}-light`);
      }
      // จ) โหมดประวัติศาสตร์ (ผัง schema 1) บนตัววาดใหม่: ด่าน 1 และด่าน 10 (NX แตะชานชาลา)
      for (const key of ['0', '9']) {
        await openLevel(p, 'history', key);
        await p.evaluate(() => window.__sjApp.play.start());
        const r = await playLevel(p, v, `history ${key}`, { real: true, midShot: async () => { await sleep(60); await shot(p, `history-${key}-mid-${v.name}-light`); } });
        check(r.state === 'win', `history ด่าน ${+key + 1} บนตัววาดใหม่: บอทแตะจริงไม่ชนะ (${r.state} ${r.code || ''} ${r.done}/${r.total})`);
        console.log(`  history ด่าน ${+key + 1} (schema 1) บนตัววาดใหม่: แตะจริง ${r.taps} ครั้ง -> ${r.state} ${r.done}/${r.total}`);
      }
      // ข้อ 9: ชนะภารกิจสุดท้ายของสถานี -> "ภารกิจถัดไป" (ข้ามไปสถานีถัดไป) -> "กลับ" ต้องไปแผ่นข้อมูลของสถานีของภารกิจปัจจุบัน
      await p.evaluate(() => { const A = window.__sjApp; A.save.reset(); A.career.setStars('tk-1', 3); A.career.setStars('tk-2', 3); A.refresh(); A.router.go({ screen: 'map', stationId: 'tha-kilen' }); });
      await p.waitForSelector('#s-map:not([hidden]) .sheet [data-mission="tk-3"]');
      await p.locator('.sheet [data-mission="tk-3"]').tap();
      await p.waitForFunction(() => window.__sjApp.play && window.__sjApp.play.id === 'tk-3');
      await p.evaluate(() => { const P = window.__sjApp.play; P.setManual(true); P.start(); });
      const r9 = await playLevel(p, v, 'ข้อ 9 tk-3', { real: false });
      check(r9.state === 'win', `ข้อ 9: tk-3 ไม่ชนะ (${r9.state})`);
      await p.locator('.pl-card [data-act="next"]').tap();
      await p.waitForFunction(() => window.__sjApp.play && window.__sjApp.play.id === 'wp-1' && window.__sjApp.play.g.state === 'intro');
      await p.locator('.pl-card [data-act="exit"]').tap();
      await p.waitForFunction(() => !window.__sjApp.play);
      await sleep(200);
      const at9 = await p.evaluate(() => ({ hash: location.hash, open: window.__sjApp.map.openId() }));
      check(at9.hash === '#map/wang-pho' && at9.open === 'wang-pho', `ข้อ 9: กด "กลับ" จาก wp-1 แล้วไปผิดที่ ${JSON.stringify(at9)}`);

      // ข้อ 5: เป้าแตะ (เสา ปุ่มประแจ) ของผังจริงทั้ง 5 สถานี ห่างกันอย่างน้อย 40 px บนจอจริง ที่ 844×390, 390×844 และ 667×375
      for (const [w, h] of [[844, 390], [390, 844], [667, 375]]) {
        await p.setViewportSize({ width: w, height: h }); await sleep(120);
        for (const id of ['tk-1', 'wp-1', 'nt-1', 'kb-1', 'np-1']) {
          await openLevel(p, info.id, id); await sleep(60);
          const gp = await p.evaluate(() => { const P = window.__sjApp.play; P.setPaused(true); return P.minGapPx(); });
          check(gp.px >= 40, `ข้อ 5: ${id} ที่ ${w}×${h} เป้าแตะ ${gp.pair && gp.pair.join(' กับ ')} ห่างกัน ${gp.px.toFixed(1)} px (ต้อง >= 40)`);
          if (w === 667) { await sleep(60); await shot(p, `small-${id}-${w}x${h}`); await audit(p, { width: w, height: h }, `ข้อ 10 ${id} ${w}×${h}`); }
        }
      }
      await p.setViewportSize({ width: v.width, height: v.height });

      // ภาพแผงของทั้ง 5 สถานีขณะมีขบวนจอดมากที่สุด (ภารกิจสุดท้ายของแต่ละสถานี) ที่ 844×390 สว่าง และ 1280×800 มืด ไว้เปิดดูด้วยตา
      for (const [w, h, scheme] of [[844, 390, 'light'], [1280, 800, 'dark']]) {
        await p.setViewportSize({ width: w, height: h }); await p.emulateMedia({ colorScheme: scheme }); await sleep(150);
        for (const id of ['tk-3', 'wp-3', 'nt-2', 'kb-3', 'np-3']) {
          await openLevel(p, info.id, id);
          // เล่นตามคำใบ้ไปเรื่อย ๆ จำเวลาที่มีขบวนจอดอยู่มากที่สุด แล้วเล่นใหม่ให้ถึงเวลานั้นเพื่อถ่ายภาพ
          const best = await p.evaluate(() => { const P = window.__sjApp.play; P.start(); let best = { n: -1, t: 0 }; for (let i = 0; i < 6000 && P.g.state === 'play'; i++) { for (let n = 0; n < 6; n++) { const t = P.nextTarget(); if (!t) break; P.press(t); } P.step(0.05); const n = P.g.trains.filter(x => x.stopped).length * 10 + P.g.trains.length; if (n > best.n) best = { n, t: P.g.time }; } return best; });
          await p.evaluate(t => { const P = window.__sjApp.play; P.restart(); P.setManual(true); P.start(); while (P.g.state === 'play' && P.g.time < t) { for (let n = 0; n < 6; n++) { const x = P.nextTarget(); if (!x) break; P.press(x); } P.step(0.05); } }, best.t);
          await sleep(5200);   // รอข้อความแจ้งในแถบบนหายก่อนถ่าย
          await shot(p, `board-${id}-${w}x${h}-${scheme}`);
        }
      }
      await p.emulateMedia({ colorScheme: 'light' }); await p.setViewportSize({ width: v.width, height: v.height });

      // ทางเข้าสำหรับนักพัฒนา
      await p.goto(game.url + '#dev', { waitUntil: 'load' });
      await p.waitForSelector('.dev a[href="#dev/test-crossing/x-1"]');
      // ข้อ 12 (ก): ทางเข้านักพัฒนากับชุดภารกิจจริง เล่นได้แต่ไม่เขียนเซฟ
      await p.evaluate(() => window.__sjApp.save.reset());
      await openLevel(p, info.id, 'np-3');
      await p.evaluate(() => window.__sjApp.play.start());
      const d12 = await playLevel(p, v, 'ข้อ 12 np-3', { real: false });
      const sv12 = await p.evaluate(id => ({ best: window.__sjApp.save.getBest(id, 'np-3'), has: window.__sjApp.save.hasProgress(id) }), info.id);
      check(d12.state === 'win' && sv12.best.stars === 0 && !sv12.has && d12.card.includes('ไม่ถูกบันทึก'), `ข้อ 12: เล่น np-3 ทาง #dev แล้วดาวลงเซฟจริง ${JSON.stringify(sv12)} ${d12.state}`);
      await ctx.close();
    }
    // ข้อ 12 (ข): ผู้เล่นทั่วไป (ไม่ใช่เบราว์เซอร์ของเครื่องมือทดสอบ) พิมพ์ #dev แล้วต้องถูกพาไปแผนที่ ใส่ ?dev ก็เปิดไม่ได้ (เปิดได้เฉพาะ dev server)
    {
      const ctx = await b.newContext({ viewport: { width: 844, height: 390 }, reducedMotion: 'reduce' });
      await ctx.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }));
      const p = await ctx.newPage();
      p.on('pageerror', e => fail(`ข้อ 12: page error: ${e.message}`));
      if (!process.env.SJ_URL) {   // dev server (import.meta.env.DEV) เปิดทางเข้านี้เสมอ จึงตรวจเฉพาะกับ dist/
        for (const h of ['#dev', '#dev/namtok/np-3', '#dev/test-crossing/x-1', '?dev=1#dev/namtok/np-3', '?dev#dev']) {
          await p.goto(game.url + h, { waitUntil: 'load' }); await p.reload({ waitUntil: 'load' });
          await p.waitForFunction(() => window.__sjApp && window.__sjApp.map && !document.getElementById('s-map').hidden);
          check(await p.evaluate(() => location.hash === '#map' && !window.__sjApp.play && !document.querySelector('.dev')), `ข้อ 12: ผู้เล่นทั่วไปเปิด ${h} ได้`);
        }
      } else {   // dev server: เปิดได้แม้ไม่ใช่เบราว์เซอร์ของเครื่องมือทดสอบ
        await p.goto(game.url + '#dev/test-crossing/x-1', { waitUntil: 'load' });
        await p.waitForFunction(() => window.__sjApp && window.__sjApp.play && window.__sjApp.play.id === 'x-1');
      }
      await ctx.close();
    }
  } finally { await b.close(); game.close(); }
}

(async () => {
  await pure();
  if (!process.env.SJ_SKIP_BROWSER) await browser();
  if (fails.length) { console.error(`✗ หน้าจอเล่นไม่ผ่าน ${fails.length} ข้อ`); process.exit(1); }
  console.log(`✓ หน้าจอเล่นผ่าน${process.env.SJ_SKIP_BROWSER ? ' (เฉพาะส่วนที่ 1)' : ' ภาพอยู่ที่ test/screenshots/play-*.png'}`);
})().catch(e => { console.error(e); process.exit(1); });
