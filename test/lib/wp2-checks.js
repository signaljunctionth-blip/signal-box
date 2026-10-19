// เทสต์หน้าจอของชุดงาน WP2 (เรียกจาก test/map-ui-test.js): หมุนเครื่องกลางเกม, เลื่อนแผ่นข้อมูลด้วยนิ้วตอนเวทีหมุน,
// แผ่นข้อมูลไม่บังสถานีบนจอใหญ่, ปุ่มเต็มจอ, ลิงก์เครดิต >= 40 px, ขอบปลอดภัย (ฉีด --sa-*) ของแผ่นเครดิตและแผงเล่น
const sleep = ms => new Promise(r => setTimeout(r, ms));
const SAVE_KEY = 'sj-signalbox-save';
const saveText = stars => JSON.stringify({ v: 2, packs: { namtok: { stars: [], best: Object.fromEntries(Object.entries(stars).map(([k, n]) => [k, { stars: n, score: n * 100 }])) } }, flags: { 'map-intro-seen': true } });

async function wp2Checks(b, url, check) {
  const newPage = async (w, h, opt = {}) => {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: true, isMobile: w < 900 && h < 900, reducedMotion: 'reduce', ...opt });
    if (opt.save) await ctx.addInitScript(([k, t]) => { try { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k, t); sessionStorage.setItem('seeded', '1'); } } catch { /* ไม่มีที่เก็บ */ } }, [SAVE_KEY, opt.save]);
    const p = await ctx.newPage();
    p.on('pageerror', e => check(false, `WP2: page error: ${e.message}`));
    return { ctx, p };
  };
  const frames = p => p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));

  // ---- 1) หมุนเครื่องกลางเกม: สถานะเกมไม่เปลี่ยน และแตะเป้าตำแหน่งใหม่ได้ทันที ----
  {
    const { ctx, p } = await newPage(844, 390);
    await p.goto(url, { waitUntil: 'load' });
    await p.waitForFunction(() => !!window.__sjApp);
    await p.evaluate(() => window.__sjApp.openDev('test-crossing', 'x-1'));
    await p.waitForFunction(() => window.__sjApp.play && window.__sjApp.play.g.state === 'intro');
    const snap = () => p.evaluate(() => { const P = window.__sjApp.play, g = P.g; return { state: g.state, time: +g.time.toFixed(3), score: g.score, done: g.done, trains: g.trains.map(t => [t.id, t.state, t.trail.length]), card: !document.querySelector('.pl-ov').hidden }; });
    await p.evaluate(() => { const P = window.__sjApp.play; P.start(); P.setManual(true); for (let i = 0; i < 200 && !P.g.trains.length; i++) P.step(0.1); P.step(2); });
    const before = await snap();
    for (const [w, h] of [[390, 844], [844, 390], [390, 844]]) {
      await p.setViewportSize({ width: w, height: h }); await frames(p);
      const after = await snap(), lay = await p.evaluate(() => window.__sjApp.stage.layout);
      check(lay.rotated === (h > w) && JSON.stringify(after) === JSON.stringify(before), `WP2 หมุนกลางเกม ${w}x${h}: สถานะเปลี่ยน ${JSON.stringify({ before, after, lay })}`);
    }
    // แตะเป้าถัดไปที่พิกัดจอจริงหลังหมุน (ยังไม่ทันวาดเฟรมใหม่ก็ต้องแตะถูก)
    await p.setViewportSize({ width: 844, height: 390 });
    const t = await p.evaluate(() => { const P = window.__sjApp.play; window.dispatchEvent(new Event('resize')); let t = P.nextTarget(); for (let i = 0; !t && i < 100; i++) { P.step(0.1); t = P.nextTarget(); } return t && { t, at: P.targetClient(t) }; });
    await p.setViewportSize({ width: 390, height: 844 });
    const t2 = await p.evaluate(tt => { window.dispatchEvent(new Event('resize')); const P = window.__sjApp.play, at = P.targetClient(tt), bp = P.toBoard(at.x, at.y), h = P.hitTest(bp.x, bp.y); return { at, hit: h && (h.id ?? h.no) === (tt.id ?? tt.no) }; }, t.t);
    check(t2.hit && t2.at.x >= 0 && t2.at.x <= 390 && t2.at.y >= 0 && t2.at.y <= 844, `WP2 หมุนกลางเกม: เป้าหลังหมุนแตะไม่ถูก ${JSON.stringify(t2)}`);
    const s0 = await p.evaluate(() => JSON.stringify([window.__sjApp.play.snapshot(), window.__sjApp.play.g.P, window.__sjApp.play.g.S]));
    await p.touchscreen.tap(t2.at.x, t2.at.y); await frames(p);
    const moved = await p.evaluate(s0 => JSON.stringify([window.__sjApp.play.snapshot(), window.__sjApp.play.g.P, window.__sjApp.play.g.S]) !== s0, s0);
    check(moved, `WP2 หมุนกลางเกม: แตะเป้าหลังหมุนแล้วเกมไม่ตอบสนอง`);
    await ctx.close();
  }

  // ---- 2) แผนที่: หมุนเครื่องตอนเปิดแผ่นข้อมูล แผ่นยังเปิดอยู่ที่สถานีเดิม ----
  {
    const { ctx, p } = await newPage(844, 390);
    await p.goto(url + '#map/tha-kilen', { waitUntil: 'load' });
    await p.waitForFunction(() => window.__sjApp && window.__sjApp.map && window.__sjApp.map.openId() === 'tha-kilen');
    await p.setViewportSize({ width: 390, height: 844 }); await frames(p); await sleep(100);
    const r = await p.evaluate(() => { const c = window.__sjApp.map.markerClient('tha-kilen'), el = document.elementFromPoint(c.x, c.y); return { open: window.__sjApp.map.openId(), hash: location.hash, rot: window.__sjApp.stage.layout.rotated, hit: !!(el && el.closest('.mk[data-id="tha-kilen"]')) }; });
    check(r.open === 'tha-kilen' && r.hash === '#map/tha-kilen' && r.rot && r.hit, `WP2 หมุนตอนเปิดแผ่นข้อมูล: ${JSON.stringify(r)}`);

    // ---- 3) เลื่อนแผ่นข้อมูลด้วยนิ้วตอนเวทีหมุน: ลากนิ้วไปทาง "ขึ้น" ของเวที (ขวาของจอจริง) เนื้อหาต้องเลื่อนลง ลากทางแกนจอเดิม (ขึ้นจอ) ต้องไม่เลื่อน ----
    await p.evaluate(() => { const d = document.createElement('div'); d.style.cssText = 'height:1200px;flex:none'; d.className = 'qa-pad'; document.querySelector('.sheet').append(d); });
    const box = await p.evaluate(() => { const r = document.querySelector('.sheet').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    const cdp = await ctx.newCDPSession(p), pt = (x, y) => ({ id: 1, x, y, radiusX: 4, radiusY: 4, force: 1 });
    const drag = async (dx, dy) => {
      await p.evaluate(() => { document.querySelector('.sheet').scrollTop = 0; });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt(box.x - dx * 5, box.y - dy * 5)] });
      for (let i = -4; i <= 5; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [pt(box.x + dx * i, box.y + dy * i)] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await sleep(400);
      return p.evaluate(() => document.querySelector('.sheet').scrollTop);
    };
    const along = await drag(-12, 0), across = await drag(0, -12);   // นิ้วไปซ้ายของจอจริง = ลงของเวที -> เนื้อหาเลื่อนขึ้น (scrollTop คงที่ 0)
    const upStage = await drag(12, 0);
    check(upStage > 40 && along === 0 && across === 0, `WP2 เลื่อนแผ่นข้อมูลตอนหมุน: ทิศผิด (ลากขึ้นของเวที ${upStage}, ลงของเวที ${along}, ขวางแกน ${across})`);
    await cdp.detach();
    await ctx.close();
  }

  // ---- 4) จอใหญ่: เปิดแผ่นน้ำตก (หลังผ่าน nt-2) แล้วแตะทุกสถานีได้โดยไม่ต้องปิดแผ่น ----
  for (const [w, h, touch] of [[1180, 820, true], [1280, 800, false]]) {
    const { ctx, p } = await newPage(w, h, { hasTouch: touch, save: saveText({ 'tk-1': 3, 'tk-2': 3, 'tk-3': 3, 'wp-1': 3, 'wp-2': 2, 'wp-3': 2, 'nt-1': 2, 'nt-2': 3 }) });
    await p.goto(url + '#map/nam-tok', { waitUntil: 'load' });
    await p.waitForFunction(() => window.__sjApp && window.__sjApp.map && window.__sjApp.map.openId() === 'nam-tok' && !window.__sjApp.map.animating());
    const cov = await p.evaluate(() => ['tha-kilen', 'wang-pho', 'nam-tok', 'kanchanaburi', 'nong-pla-duk-jn'].filter(id => { const c = window.__sjApp.map.markerClient(id), el = document.elementFromPoint(c.x, c.y); return !(el && el.closest(`.mk[data-id="${id}"]`)); }));
    check(!cov.length, `WP2 ${w}x${h}: แผ่นน้ำตกเปิดอยู่ แตะสถานีไม่ได้: ${cov.join(', ')}`);
    await ctx.close();
  }

  // ---- 5) ปุ่มเต็มจอ: มีทุกหน้าจอเมื่อเบราว์เซอร์รองรับ เป้า >= 44 px ไอคอนและชื่อเปลี่ยนตามสถานะ; ไม่รองรับ (iPhone) ซ่อน ----
  for (const supported of [true, false]) {
    const { ctx, p } = await newPage(844, 390);
    if (!supported) await ctx.addInitScript(() => { Object.defineProperty(Document.prototype, 'fullscreenEnabled', { get: () => false }); Object.defineProperty(Document.prototype, 'webkitFullscreenEnabled', { get: () => undefined }); });
    await p.goto(url, { waitUntil: 'load' });
    await p.waitForFunction(() => !!window.__sjApp);
    const btns = async where => {
      const r = await p.evaluate(() => [...document.querySelectorAll('#stage .screen:not([hidden]) [data-act="full"]')].filter(b => !b.hidden && b.offsetWidth).map(b => { const r = b.getBoundingClientRect(); return { w: r.width, h: r.height, label: b.getAttribute('aria-label') }; }));
      check(supported ? r.length === 1 && r[0].w >= 44 && r[0].h >= 44 : r.length === 0, `WP2 ปุ่มเต็มจอ (${supported ? 'รองรับ' : 'ไม่รองรับ'}) ${where}: ${JSON.stringify(r)}`);
      return r;
    };
    await btns('หน้าแรก');
    if (supported) {
      await p.click('#b-full'); await sleep(300);
      const on = await p.evaluate(() => ({ fs: !!document.fullscreenElement, label: document.getElementById('b-full').getAttribute('aria-label'), cls: document.documentElement.classList.contains('is-fs') }));
      if (on.fs) {
        check(on.label === 'ออกจากเต็มจอ' && on.cls, `WP2 ปุ่มเต็มจอ: เข้าเต็มจอแล้วชื่อปุ่ม/ไอคอนไม่เปลี่ยน ${JSON.stringify(on)}`);
        await p.evaluate(() => document.exitFullscreen()); await sleep(300);
        const off = await p.evaluate(() => ({ label: document.getElementById('b-full').getAttribute('aria-label'), cls: document.documentElement.classList.contains('is-fs') }));
        check(off.label === 'เต็มจอ' && !off.cls, `WP2 ปุ่มเต็มจอ: ออกจากเต็มจอแล้วสถานะไม่กลับ ${JSON.stringify(off)}`);
      }
    }
    await p.evaluate(() => window.__sjApp.router.go({ screen: 'map' })); await p.waitForFunction(() => window.__sjApp.map && window.__sjApp.map.camera());
    await btns('แผนที่');
    await p.evaluate(() => window.__sjApp.openDev('test-crossing', 'x-1')); await p.waitForFunction(() => window.__sjApp.play && window.__sjApp.play.g);
    await btns('หน้าเล่น');
    await ctx.close();
  }

  // ---- 6) แผ่นเครดิตหน้าแรก: ลิงก์ >= 40 px, อยู่ในพื้นที่ปลอดภัย, ยาวเกินจอเลื่อนได้และปุ่มปิดอยู่ตลอด ----
  for (const [w, h, sa] of [[844, 390, { l: 47, b: 21 }], [390, 844, { l: 47, r: 34 }], [1180, 820, {}]]) {
    const { ctx, p } = await newPage(w, h);
    await p.goto(url, { waitUntil: 'load' });
    await p.waitForFunction(() => !!window.__sjApp);
    await p.evaluate(sa => { const s = document.getElementById('stage'); for (const k of ['t', 'r', 'b', 'l']) s.style.setProperty('--sa-' + k, (sa[k] || 0) + 'px'); }, sa);
    await p.click('.credits summary'); await sleep(100);
    const r = await p.evaluate(sa => {
      const S = window.__sjApp.stage, pn = document.querySelector('.credits-panel'), b = S.rectOf(pn), W = S.layout.w, H = S.layout.h;
      const small = [...pn.querySelectorAll('a,button')].map(a => a.getBoundingClientRect()).filter(q => Math.min(q.width, q.height) < 39.5).length;
      const inside = b.x >= (sa.l || 0) - 0.5 && b.y >= (sa.t || 0) - 0.5 && b.x + b.w <= W - (sa.r || 0) + 0.5 && b.y + b.h <= H - (sa.b || 0) + 0.5;
      pn.scrollTop = pn.scrollHeight;
      const x = S.rectOf(pn.querySelector('[data-act="close-credits"]')), v = S.rectOf(pn.querySelector('.credits .fine'));
      return { small, inside, closeVisible: x.y >= b.y - 0.5, lastVisible: v.y + v.h <= b.y + b.h + 0.5, cue: pn.classList.contains('scroll-cue') };
    }, sa);
    check(!r.small && r.inside && r.closeVisible && r.lastVisible && r.cue, `WP2 แผ่นเครดิต ${w}x${h}: ${JSON.stringify(r)}`);
    await ctx.close();
  }

  // ---- 7) ขอบปลอดภัยของแผงเล่น: เป้าแตะบนแผงไม่อยู่ใต้รอยบาก (ซ้ายหรือขวา) ----
  for (const sa of [{ l: 47, b: 21 }, { r: 47, b: 21 }]) {
    const { ctx, p } = await newPage(844, 390);
    await p.goto(url, { waitUntil: 'load' });
    await p.waitForFunction(() => !!window.__sjApp);
    await p.evaluate(sa => { const s = document.getElementById('stage'); for (const k of ['t', 'r', 'b', 'l']) s.style.setProperty('--sa-' + k, (sa[k] || 0) + 'px'); }, sa);
    await p.evaluate(() => window.__sjApp.openDev('test-crossing', 'j-1'));
    await p.waitForFunction(() => window.__sjApp.play && window.__sjApp.play.g);
    await p.evaluate(() => window.__sjApp.play.start());
    const bad = await p.evaluate(sa => {
      const P = window.__sjApp.play, S = window.__sjApp.stage, G = P.geom(), out = [];
      for (const t of [...Object.keys(G.signals).map(id => ({ kind: 'signal', id })), ...Object.keys(G.points).map(id => ({ kind: 'point', id })), ...Object.keys(G.portals).map(id => ({ kind: 'portal', id }))]) {
        const c = P.targetClient(t), s = S.toStage(c.x, c.y);
        if (s.x < (sa.l || 0) + 10 || s.x > S.layout.w - (sa.r || 0) - 10) out.push(`${t.kind}:${t.id}@${s.x.toFixed(0)}`);
      }
      return out;
    }, sa);
    check(!bad.length, `WP2 ขอบปลอดภัยแผงเล่น ${JSON.stringify(sa)}: เป้าอยู่ใต้รอยบาก ${bad.join(', ')}`);
    await ctx.close();
  }
}
module.exports = { wp2Checks };
