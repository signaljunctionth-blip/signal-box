// ตรวจโครงแอปและหน้าแผนที่ของเกมใหม่ — ใช้: node test/map-ui-test.js (เปิด dist/ เอง ต้อง build ก่อน หรือตั้ง SJ_URL=http://localhost:5173/ เพื่อใช้ dev server)
// ส่วนที่ 1 (Node ล้วน): เวทีหมุน 90°, ตัวสลับหน้า, กติกาปลดล็อก, กล้องแผนที่
// ส่วนที่ 2 (Playwright): 4 ขนาดจอ × สว่าง/มืด ถ่ายภาพหน้าแรก แผนที่ทั้งประเทศ แผนที่สายน้ำตก แผ่นข้อมูลสถานี ลง test/screenshots/map-*.png
//   และตรวจ: แตะสถานีตรงตำแหน่ง (รวมตอนหมุน 90°), ลาก ล้อเมาส์ สองนิ้ว คีย์บอร์ด, เป้าแตะ >= 40 px, ไม่ล้นจอ, ไม่มี console error
//   SJ_ONLY=844x390 จำกัดขนาดจอ, SJ_SKIP_BROWSER=1 รันเฉพาะส่วนที่ 1
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..'), shots = path.join(__dirname, 'screenshots');
const { serveGame } = require('./lib/serve.js');
const MAP = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../data/thailand-map.json'), 'utf8'));
let URL0 = '';
const src = f => 'file://' + path.join(root, 'src', f).split(path.sep).map(encodeURIComponent).join('/').replace(/%3A/g, ':');
const fails = [];
const fail = m => { fails.push(m); console.error('  ✗ ' + m); };
const check = (ok, m) => { if (!ok) fail(m); };
const near = (a, b, tol) => Math.abs(a - b) <= tol;

async function pure() {
  const S = await import(src('ui/stage.js')), Rt = await import(src('ui/router.js')), P = await import(src('ui/progress.js'));
  const C = await import(src('render/map-camera.js')), sim = await import(src('sim/index.js')), { unlockState, levelKey } = sim;
  // ชุดภารกิจจริงของแผนที่ ผ่านตัวตรวจของ sim แบบเดียวกับที่แอปโหลด
  const readJson = f => JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));
  const st = sim.loadStations(fs.readdirSync(path.join(root, 'data/stations')).filter(f => f.endsWith('.json')).map(f => ({ name: f, json: readJson('data/stations/' + f) })));
  const loaded = sim.loadLevelPack(readJson('data/levels/namtok.json'), st.stations, st.errors);
  assert.ok(loaded.ok, 'ชุดภารกิจ namtok ไม่ผ่านตัวตรวจ: ' + (loaded.errors || []).join(' | '));
  const pack = loaded.pack;
  const { createCareerSave } = await import(src('ui/career-save.js')), { createSave, memoryBackend } = await import(src('save/index.js'));

  // เวที
  assert.deepStrictEqual(S.stageLayout(844, 390), { rotated: false, w: 844, h: 390, vw: 844, vh: 390 });
  const L = S.stageLayout(390, 844);
  assert.deepStrictEqual([L.rotated, L.w, L.h], [true, 844, 390]);
  // หมุนเฉพาะจอสัมผัส หรือจอกว้างไม่เกิน 600 px: หน้าต่างคอมที่ย่อแคบไม่ตะแคง
  assert.strictEqual(S.stageLayout(700, 900, false).rotated, false); assert.strictEqual(S.stageLayout(820, 1180, true).rotated, true);
  assert.strictEqual(S.stageLayout(390, 844, false).rotated, true); assert.strictEqual(S.stageLayout(900, 700, true).rotated, false);
  assert.deepStrictEqual(S.clientToStage(L, 390, 0), { x: 0, y: 0 });       // มุมขวาบนของจอ = มุมซ้ายบนของเวที
  assert.deepStrictEqual(S.clientToStage(L, 0, 844), { x: 844, y: 390 });   // มุมซ้ายล่างของจอ = มุมขวาล่างของเวที
  for (const [x, y] of [[0, 0], [100, 50], [844, 390], [333.5, 12.25]]) { const c = S.stageToClient(L, x, y); assert.deepStrictEqual(S.clientToStage(L, c.x, c.y), { x, y }); }

  // ตัวสลับหน้า
  assert.deepStrictEqual(Rt.parseRoute(''), { screen: 'home' });
  assert.deepStrictEqual(Rt.parseRoute('#map'), { screen: 'map' });
  assert.deepStrictEqual(Rt.parseRoute('#map/tha-kilen'), { screen: 'map', stationId: 'tha-kilen' });
  assert.deepStrictEqual(Rt.parseRoute('#play/tha-kilen/tk-1'), { screen: 'play', stationId: 'tha-kilen', missionId: 'tk-1' });
  assert.deepStrictEqual(Rt.parseRoute('#play/<x>/tk-1'), { screen: 'home' });
  assert.deepStrictEqual(Rt.parseRoute('#dev'), { screen: 'dev' });
  assert.deepStrictEqual(Rt.parseRoute('#dev/test-crossing/x-1'), { screen: 'dev', packId: 'test-crossing', missionId: 'x-1' });
  for (const h of ['', '#map', '#map/wang-pho', '#play/nam-tok/nt-2', '#dev', '#dev/history/3']) assert.strictEqual(Rt.formatRoute(Rt.parseRoute(h)), h);

  // กติกาปลดล็อก
  const stars = {}, prog = () => P.computeProgress(pack, lv => stars[levelKey(lv)] || 0, unlockState);
  assert.ok(pack.levels.every(l => levelKey(l) === l.id), 'levelKey ของ sim ต้องคืน id ภารกิจ (key เซฟเดียวกับหน้าเล่น)');
  const give = (ids, n) => ids.forEach(id => { stars[id] = n; });
  let p = prog();
  assert.strictEqual(pack.levels.length, 14); assert.strictEqual(p.maxStars, 42);
  assert.deepStrictEqual(p.stations.map(s => s.state), ['open', 'locked', 'locked', 'locked', 'locked']);
  assert.deepStrictEqual(p.byId['tha-kilen'].missions.map(m => m.unlocked), [true, false, false]);
  assert.deepStrictEqual(p.next, { stationId: 'tha-kilen', missionId: 'tk-1' });
  assert.deepStrictEqual(p.byId['wang-pho'].lock, { prevStation: 'tha-kilen', prevRemaining: 3, needStars: 0, haveStars: 0, missingStars: 0 });
  assert.ok(!P.canPlay(p, 'tha-kilen', 'tk-2') && P.canPlay(p, 'tha-kilen', 'tk-1') && !P.canPlay(p, 'wang-pho', 'wp-1') && !P.canPlay(p, 'x', 'y'));
  give(['tk-1'], 1); p = prog();
  assert.deepStrictEqual(p.byId['tha-kilen'].missions.map(m => m.unlocked), [true, true, false]);
  assert.strictEqual(p.byId['wang-pho'].unlocked, false);
  give(['tk-2', 'tk-3'], 1); p = prog();
  assert.deepStrictEqual(p.stations.map(s => s.state), ['done', 'open', 'locked', 'locked', 'locked']);
  assert.strictEqual(p.current, 'wang-pho'); assert.strictEqual(p.lineSelectOpen, false);
  give(['wp-1', 'wp-2', 'wp-3', 'nt-1', 'nt-2'], 1); p = prog();   // ผ่านครบ 8 ภารกิจ แต่มีแค่ 8 ดาว: กาญจนบุรีต้อง 12
  assert.strictEqual(p.totalStars, 8); assert.strictEqual(p.lineSelectOpen, true);
  assert.deepStrictEqual(p.stations.map(s => s.state), ['done', 'done', 'done', 'locked', 'locked']);
  assert.deepStrictEqual(p.byId.kanchanaburi.lock, { prevStation: 'nam-tok', prevRemaining: 0, needStars: 12, haveStars: 8, missingStars: 4 });
  assert.strictEqual(p.next, null); assert.strictEqual(P.improvable(p).length, 3);
  give(['tk-1', 'tk-2'], 3); p = prog();                            // 12 ดาวพอดี
  assert.strictEqual(p.totalStars, 12); assert.strictEqual(p.byId.kanchanaburi.state, 'open');
  give(['kb-1', 'kb-2', 'kb-3'], 2); p = prog();                    // 18 ดาว: หนองปลาดุกต้อง 20
  assert.strictEqual(p.byId['nong-pla-duk-jn'].lock.missingStars, 2);
  give(['kb-1'], 3); give(['tk-3'], 2); p = prog();                 // 20 ดาว
  assert.strictEqual(p.byId['nong-pla-duk-jn'].state, 'open');
  assert.deepStrictEqual(p.next, { stationId: 'nong-pla-duk-jn', missionId: 'np-1' });
  // สถานะปลดล็อกต้องตรงกับ unlockState ของ sim ทุกภารกิจ (แหล่งเดียวกับหน้าเล่น)
  const U = unlockState(pack, lv => stars[lv.id] || 0);
  assert.deepStrictEqual(p.stations.flatMap(s => s.missions.map(m => m.unlocked)), U.levels.map(l => l.open));

  // ตัวห่อเซฟ: ดาวต่อ id ภารกิจ ผ่าน src/save เท่านั้น
  const mem = memoryBackend(), cs = createCareerSave(createSave(mem), 'namtok');
  assert.strictEqual(cs.stars('tk-1'), 0); assert.strictEqual(cs.setStars('tk-1', 2), true); cs.setStars('tk-1', 1, 400); cs.setStars('np-3', 3);
  const cs2 = createCareerSave(createSave(mem), 'namtok');
  assert.deepStrictEqual([cs2.stars('tk-1'), cs2.score('tk-1'), cs2.stars('np-3'), cs2.stars('tk-2'), cs2.stars('nope')], [2, 400, 3, 0, 0]);

  // กล้อง
  const map = JSON.parse(fs.readFileSync(path.join(root, 'data/thailand-map.json'), 'utf8'));
  const pr = C.makeProjection(map.bbox), world = { w: pr.w, h: pr.h };
  assert.ok(near(world.w / world.h, 0.546, 0.002));
  assert.ok(near(pr.lon(pr.x(100.5)), 100.5, 1e-9) && near(pr.lat(pr.y(13.75)), 13.75, 1e-9));
  const view = { w: 844, h: 390 }, pad = { l: 8, t: 56, r: 60, b: 48 }, wb = { x0: 0, y0: 0, x1: world.w, y1: world.h };
  const cc = C.fitBounds(wb, view, pad);
  let s = C.toScreen(cc, view, 0, 0), e = C.toScreen(cc, view, world.w, world.h);
  assert.ok(near(s.y, 56, 1e-6) && near(e.y, 390 - 48, 1e-6) && s.x >= 8 && e.x <= 844 - 60, 'ทั้งประเทศต้องอยู่ในพื้นที่ที่ไม่ถูกบัง');
  assert.ok(near((s.x + e.x) / 2, (8 + 844 - 60) / 2, 1e-6));
  const lim = { minK: cc.k, maxK: cc.k * 100 };
  assert.ok(C.sameCamera(C.clampCamera(C.panBy(cc, 500, -300), view, world, lim, pad), cc), 'ซูมออกสุดแล้วเลื่อนไม่ได้');
  const z = C.zoomAt(cc, view, 300, 200, 8, lim), w0 = C.toWorld(cc, view, 300, 200), w1 = C.toWorld(z, view, 300, 200);
  assert.ok(near(z.k, cc.k * 8, 1e-9) && near(w0.x, w1.x, 1e-9) && near(w0.y, w1.y, 1e-9), 'ซูมแล้วจุดใต้นิ้วต้องอยู่กับที่');
  assert.strictEqual(C.zoomAt(cc, view, 0, 0, 1e6, lim).k, lim.maxK); assert.strictEqual(C.zoomAt(cc, view, 0, 0, 1e-6, lim).k, lim.minK);
  const far = C.clampCamera({ x: -50, y: 999, k: z.k }, view, world, lim, pad);
  assert.ok(near(C.toScreen(far, view, 0, 0).x, pad.l, 1e-6) && near(C.toScreen(far, view, 0, world.h).y, view.h - pad.b, 1e-6), 'ขอบโลกต้องไม่หลุดเข้ามาในจอ');
  const pn = C.pinch(z, view, { x: 400, y: 200, d: 100 }, { x: 420, y: 190, d: 150 }, lim), a = C.toWorld(z, view, 400, 200), b = C.toWorld(pn, view, 420, 190);
  assert.ok(near(pn.k, z.k * 1.5, 1e-9) && near(a.x, b.x, 1e-9) && near(a.y, b.y, 1e-9), 'สองนิ้ว: จุดกึ่งกลางต้องตามนิ้ว');
  const mid = C.lerpCamera(cc, z, 0.5);
  assert.ok(near(mid.k, Math.sqrt(cc.k * z.k), 1e-9) && C.sameCamera(C.lerpCamera(cc, z, 0), cc) && C.sameCamera(C.lerpCamera(cc, z, 1), z));
  const ids = map.namtok.tutorial_route, stn = ids.map(id => map.namtok.stations.find(x => x.id === id)), pts = stn.map(x => [pr.x(x.lon), pr.y(x.lat)]);
  assert.deepStrictEqual(ids, pack.stations.map(x => x.station), 'ลำดับสถานีในชุดภารกิจต้องตรงกับ tutorial_route');
  assert.ok(C.minPairDistance(pts, cc.k) < 10, 'ซูมออกสุด จุดสถานีต้องซ้อนกัน (จึงรวมเป็นปุ่มเดียว)');
  const sides = C.labelSides(pts);
  assert.strictEqual(sides.length, 5); assert.ok(sides.every(x => ['right', 'bottom', 'left', 'top'].includes(x)));
  assert.deepStrictEqual(C.placeLabels([{ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 }, { x: 20, y: 0, w: 5, h: 5 }], [{ x: 19, y: 0, w: 3, h: 3 }]), [0]);
  console.log('✓ ส่วนที่ 1: เวที ตัวสลับหน้า กติกาปลดล็อก ตัวห่อเซฟ กล้อง ผ่าน');
}

const VIEWS = [
  { name: '844x390', width: 844, height: 390, dpr: 2, touch: true },
  { name: '390x844', width: 390, height: 844, dpr: 2, touch: true },   // ถือแนวตั้ง: เวทีหมุน 90°
  { name: '1180x820', width: 1180, height: 820, dpr: 2, touch: true },
  { name: '1280x800', width: 1280, height: 800, dpr: 1, touch: false },
].filter(v => !process.env.SJ_ONLY || process.env.SJ_ONLY.split(',').includes(v.name));

async function browser() {
  const { chromium } = require('playwright');
  fs.mkdirSync(shots, { recursive: true });
  const game = await serveGame(); URL0 = game.url;
  const b = await chromium.launch();
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  try {
    for (const v of VIEWS) for (const scheme of ['light', 'dark']) {
      const tag = `${v.name}-${scheme}`, full = scheme === 'light';
      const ctx = await b.newContext({ viewport: { width: v.width, height: v.height }, deviceScaleFactor: v.dpr, hasTouch: v.touch, colorScheme: scheme });
      const p = await ctx.newPage();
      p.on('pageerror', e => fail(`${tag}: page error: ${e.message}`));
      p.on('console', m => { if (m.type() === 'error') fail(`${tag}: console error: ${m.text()}`); });
      p.on('requestfailed', r => fail(`${tag}: โหลดไม่ได้: ${r.url()}`));
      p.on('request', r => { if (!/^(data|blob):/.test(r.url()) && !r.url().startsWith(game.origin)) fail(`${tag}: คำขอออกนอกเครื่อง: ${r.url()}`); });
      const shot = name => p.screenshot({ path: path.join(shots, `map-${name}-${tag}.png`) });
      const dbg = fn => p.evaluate(`(${fn.toString()})(window.__sjApp)`);
      const settle = async () => { await sleep(80); for (let i = 0; i < 80 && await dbg(A => A.map && A.map.animating()); i++) await sleep(50); await sleep(120); };
      const tap = (x, y) => (v.touch ? p.touchscreen.tap(x, y) : p.mouse.click(x, y));
      // ทุกอย่างที่กดได้ต้องอยู่ในจอและกว้าง/สูงอย่างน้อย 40 px บนจอจริง
      const audit = async where => {
        const bad = await p.evaluate(({ W, H }) => [...document.querySelectorAll('#stage .screen:not([hidden]) :is(a,button,summary)')].map(el => {
          const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
          if (!r.width || cs.visibility === 'hidden' || el.closest('[hidden]')) return null;
          const name = (el.getAttribute('aria-label') || el.textContent).trim().slice(0, 24);
          const scroller = el.closest('.sheet,.home,.wip');
          if (r.width < 39.5 || r.height < 39.5) return `${name}: เป้าแตะ ${r.width.toFixed(0)}×${r.height.toFixed(0)}`;
          if (!scroller && !el.classList.contains('mk') && (r.left < -0.5 || r.top < -0.5 || r.right > W + 0.5 || r.bottom > H + 0.5)) return `${name}: ล้นจอ ${[r.left, r.top, r.right, r.bottom].map(n => n.toFixed(0))}`;
          return null;
        }).filter(Boolean), { W: v.width, H: v.height });
        bad.forEach(m => fail(`${tag}: ${where}: ${m}`));
      };

      // เครดิตมุมแผนที่: ลิงก์อยู่บรรทัดเดียว ไม่ล้นจอ ไม่ถูกแผ่นข้อมูลสถานีบัง และข้อความ OSM เห็นเสมอ
      const creditFits = async where => {
        const r = await p.evaluate(() => { const S = window.__sjApp.stage, box = el => S.rectOf(el), c = document.querySelector('.map-credit'), sh = document.querySelector('.sheet');
          const links = [...c.querySelectorAll('a')].filter(a => a.offsetWidth).map(box), b = box(c), limit = sh && !sh.hidden ? box(sh).x : S.layout.w;
          return { n: links.length, oneLine: links.every(l => Math.abs(l.y - links[0].y) < 2), stacked: links.length === 2 && links[1].y >= links[0].y + links[0].h - 0.5 && limit < 520, right: Math.max(b.x + b.w, ...links.map(l => l.x + l.w)), limit, bottom: b.y + b.h, h: S.layout.h, clipped: c.scrollWidth > c.clientWidth + 1 }; });
        // ครบทั้งสองเครดิตเสมอ; พื้นที่กว้างพอ = บรรทัดเดียว, พื้นที่แคบ (เปิดแผ่นข้อมูลบนจอมือถือ) = เรียงลงมาทีละแถวได้ แต่ต้องไม่ทับกัน
        check(r.n === 2 && (r.oneLine || r.stacked) && r.right <= r.limit + 0.5 && r.bottom <= r.h + 0.5 && !r.clipped, `${tag}: ${where}: เครดิตมุมแผนที่ล้นหรือขึ้นสองบรรทัด ${JSON.stringify(r)}`);
      };

      // ---- หน้าแรก ----
      await p.goto(URL0, { waitUntil: 'load' });
      await p.evaluate(() => document.fonts.ready);
      await p.waitForFunction(() => !!window.__sjApp);
      const lay = await dbg(A => A.stage.layout);
      check(lay.rotated === (v.height > v.width) && lay.w === Math.max(v.width, v.height) && lay.h === Math.min(v.width, v.height), `${tag}: ขนาดเวทีผิด ${JSON.stringify(lay)}`);
      check((await p.textContent('#b-map')).trim() === 'เริ่มเล่น', `${tag}: ไม่พบปุ่ม "เริ่มเล่น"`);
      check(await p.getAttribute('#b-proto', 'href') === './prototype/' && /เกมเวอร์ชันเดิม.*ห้องสัญญาณ 200 ปี/.test(await p.textContent('#b-proto')) && await p.title() === 'Signal Junction' && (await p.textContent('h1')).trim() === 'Signal Junction', `${tag}: ปุ่มเกมเวอร์ชันเดิมผิด`);
      check(await p.evaluate(() => { const h = document.getElementById('s-home'); return h.scrollHeight <= h.clientHeight + 1; }), `${tag}: หน้าแรกล้นจนต้องเลื่อน`);
      await audit('หน้าแรก');
      await shot('home');
      if (full) { await p.click('.credits summary'); const cr = await p.innerHTML('.credits'); check(cr.includes('Natural Earth') && cr.includes('ไม่ใช่เส้นเขตแดนทางการ') && cr.includes('https://www.openstreetmap.org/copyright') && cr.includes('https://opendatacommons.org/licenses/odbl/1-0/') && cr.includes('github.com/signaljunctionth-blip/signal-junction/tree/main/data') && cr.includes('โหมดประวัติศาสตร์ 200 ปี'), `${tag}: เครดิตหน้าแรกไม่ครบ (OSM, ODbL, Natural Earth, ลิงก์ข้อมูล, โหมดประวัติศาสตร์)`); await sleep(150); await audit('เครดิต'); await shot('home-credits');
        const fit = await p.evaluate(() => { const S = window.__sjApp.stage, r = S.rectOf(document.querySelector('.credits-panel')); return r.x >= -0.5 && r.y >= -0.5 && r.x + r.w <= S.layout.w + 0.5 && r.y + r.h <= S.layout.h + 0.5; }); check(fit, `${tag}: แผ่นเครดิตล้นจอ`);
        await p.click('.credits [data-act="close-credits"]'); check(await p.evaluate(() => !document.querySelector('.credits').open), `${tag}: ปุ่มปิดเครดิตไม่ทำงาน`); }

      // ---- แผนที่: เปิดครั้งแรกเห็นทั้งประเทศ แล้วกล้องเลื่อนเข้าหาสายน้ำตกเอง ----
      await p.click('#b-map');
      await p.waitForFunction(() => window.__sjApp.map && window.__sjApp.map.camera());
      check(await dbg(A => A.map.clustered()) === true, `${tag}: เปิดแผนที่ครั้งแรกต้องเห็นทั้งประเทศ`);
      await sleep(900); await settle();
      check(await dbg(A => A.map.clustered()) === false, `${tag}: กล้องไม่ได้เลื่อนเข้าหาสายน้ำตก`);
      check(await p.evaluate(() => location.hash) === '#map', `${tag}: hash ไม่ใช่ #map`);
      check((await p.textContent('.map-credit')).includes('เกมนี้ไม่ใช่ผลงานทางการของการรถไฟแห่งประเทศไทย'), `${tag}: หน้าแผนที่ไม่มีข้อความปฏิเสธความเป็นทางการ`);
      const credit = await p.evaluate(() => [...document.querySelectorAll('.map-credit a')].map(a => [a.textContent.trim(), a.href]));
      // ข้อความเครดิตต้องมาจาก credits ในไฟล์แผนที่ (ไม่ผูกกับถ้อยคำ)
      check(credit[0] && credit[0][0] === MAP.credits.osm.text && credit[0][0].includes('OpenStreetMap') && credit[0][1] === MAP.credits.osm.url && /openstreetmap\.org\/copyright/.test(credit[0][1]), `${tag}: ข้อความ OSM ผิด ${JSON.stringify(credit[0])}`);
      check(credit[1] && credit[1][0] === MAP.credits.natural_earth.text, `${tag}: ไม่มีเครดิต Natural Earth บนแผนที่`);
      await creditFits('แผนที่');
      await audit('แผนที่สายน้ำตก');
      await shot('route');
      // ปุ่มสถานีทั้ง 5 ต้องอยู่ในจอและห่างกันพอ
      const mk = await p.evaluate(() => [...document.querySelectorAll('.mk[data-id]')].map(el => { const r = el.getBoundingClientRect(); return { id: el.dataset.id, x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, label: el.getAttribute('aria-label') }; }));
      check(mk.length === 5 && mk.every(m => m.x > 20 && m.y > 20 && m.x < v.width - 20 && m.y < v.height - 20), `${tag}: ปุ่มสถานีไม่ครบหรือหลุดจอ ${JSON.stringify(mk.map(m => [m.id, m.x | 0, m.y | 0]))}`);
      for (let i = 0; i < mk.length; i++) for (let j = i + 1; j < mk.length; j++) check(Math.hypot(mk[i].x - mk[j].x, mk[i].y - mk[j].y) >= 44, `${tag}: ปุ่ม ${mk[i].id} กับ ${mk[j].id} ซ้อนกัน`);
      check(mk[0].label === 'สถานีที่ 1 ท่ากิเลน เปิดแล้ว ดาว 0 จาก 9' && mk[1].label === 'สถานีที่ 2 วังโพ ยังล็อก', `${tag}: ป้ายสถานีผิด ${mk[0].label} / ${mk[1].label}`);

      // ---- ทั้งประเทศ: จุดสถานีรวมเป็นปุ่ม "เส้นทางสอน" ปุ่มเดียว ----
      await dbg(A => A.map.country()); await settle();
      check(await p.evaluate(() => !document.querySelector('.mk-cluster').hidden && [...document.querySelectorAll('.mk[data-id]')].every(e => e.hidden)), `${tag}: ซูมออกแล้วไม่รวมเป็นปุ่มเดียว`);
      await audit('แผนที่ทั้งประเทศ');
      await shot('country');
      const cl = await p.evaluate(() => { const r = document.querySelector('.mk-cluster').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
      await tap(cl.x, cl.y); await settle();
      check(await dbg(A => A.map.clustered()) === false, `${tag}: แตะปุ่ม "เส้นทางสอน" แล้วไม่ซูมเข้า`);

      // ---- ลาก ล้อเมาส์ สองนิ้ว: ทิศต้องถูกแม้เวทีหมุน ----
      const c0 = await dbg(A => A.map.camera());
      const mx = v.width / 2, my = v.height / 2;
      await p.mouse.move(mx, my); await p.mouse.down(); await p.mouse.move(mx + 20, my + 15, { steps: 3 }); await p.mouse.move(mx + 60, my + 30, { steps: 4 }); await p.mouse.up();
      const c1 = await dbg(A => A.map.camera());
      const want = lay.rotated ? { x: 30, y: -60 } : { x: 60, y: 30 };   // การขยับในพิกัดเวที
      check(near((c0.x - c1.x) * c0.k, want.x, 1.5) && near((c0.y - c1.y) * c0.k, want.y, 1.5), `${tag}: ลากแล้วแผนที่ไม่ตามนิ้ว ได้ ${((c0.x - c1.x) * c0.k).toFixed(1)},${((c0.y - c1.y) * c0.k).toFixed(1)} ต้อง ${want.x},${want.y}`);
      const under = () => p.evaluate(({ mx, my }) => { const A = window.__sjApp, c = A.map.camera(), s = A.stage.toStage(mx, my), L = A.stage.layout; return { x: c.x + (s.x - L.w / 2) / c.k, y: c.y + (s.y - L.h / 2) / c.k, k: c.k }; }, { mx: mx + 60, my: my + 30 });
      const u0 = await under(); await p.mouse.wheel(0, -200); await sleep(120); const u1 = await under();
      check(u1.k > u0.k * 1.1 && near(u0.x, u1.x, 2 / u1.k) && near(u0.y, u1.y, 2 / u1.k), `${tag}: ล้อเมาส์ซูมแล้วจุดใต้เมาส์ไม่อยู่กับที่`);
      await p.mouse.wheel(0, 200); await sleep(120);
      if (v.touch) {
        const cdp = await ctx.newCDPSession(p), pt = (id, x, y) => ({ id, x, y, radiusX: 4, radiusY: 4, force: 1 });
        const k0 = (await dbg(A => A.map.camera())).k;
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt(1, mx - 30, my - 30), pt(2, mx + 30, my + 30)] });
        for (let i = 1; i <= 6; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [pt(1, mx - 30 - i * 8, my - 30 - i * 8), pt(2, mx + 30 + i * 8, my + 30 + i * 8)] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await sleep(120);
        const k1 = (await dbg(A => A.map.camera())).k;
        const wantK = Math.min(78 / 30, (await dbg(A => A.map.limits())).maxK / k0);   // ระยะนิ้ว 30 -> 78 หรือชนเพดานซูม
        check(near(k1 / k0, wantK, 0.15), `${tag}: ซูมสองนิ้วผิด ได้ ${(k1 / k0).toFixed(2)} เท่า ต้องราว ${wantK.toFixed(2)}`);
        await cdp.detach();
      }
      await dbg(A => A.map.route()); await settle();

      // ---- แตะสถานีที่ตำแหน่งจริงบนจอ -> แผ่นข้อมูลสถานี ----
      const at = id => p.evaluate(i => window.__sjApp.map.markerClient(i), id);
      let pos = await at('tha-kilen');
      check(await p.evaluate(({ x, y }) => { const el = document.elementFromPoint(x, y); return !!(el && el.closest('.mk[data-id="tha-kilen"]')); }, pos), `${tag}: ตำแหน่งปุ่มท่ากิเลนไม่ตรงกับที่วาด`);
      await tap(pos.x, pos.y); await settle();
      check(await dbg(A => A.map.openId()) === 'tha-kilen' && await p.evaluate(() => location.hash) === '#map/tha-kilen', `${tag}: แตะท่ากิเลนแล้วแผ่นข้อมูลไม่เปิด`);
      const sheet = await p.textContent('.sheet');
      const tk = await dbg(A => A.pack.levels.filter(l => l.station === 'tha-kilen').map(l => [l.name, l.teaches]));   // ชื่อและสิ่งที่สอนจากชุดภารกิจที่ใช้จริง
      check(tk.length === 3, `${tag}: ท่ากิเลนต้องมี 3 ภารกิจ (ได้ ${tk.length})`);
      for (const t of ['ท่ากิเลน', 'Tha Kilen', 'ขั้น 1', 'ผังจำลองจากข้อมูลสาธารณะ อาจไม่ตรงกับสภาพจริง', 'ระบบสัญญาณสมมุติตามขนาดสถานี', ...tk.flat()]) check(sheet.includes(t), `${tag}: แผ่นข้อมูลไม่มี "${t}"`);
      check(await p.locator('.sheet [data-act="play"]').count() === 1 && await p.locator('.sheet .ms.locked').count() === 2, `${tag}: สถานะภารกิจเริ่มต้นผิด`);
      pos = await at('tha-kilen');
      const sheetBox = await p.locator('.sheet').boundingBox();
      check(lay.rotated ? pos.y < sheetBox.y : pos.x < sheetBox.x, `${tag}: สถานีที่เลือกถูกแผ่นข้อมูลบัง`);
      if (v.height < 500 || v.width < 500) check(await p.evaluate(() => { const s = document.querySelector('.sheet'); return s.scrollHeight - s.clientHeight; }) <= 60, `${tag}: แผ่นข้อมูลยาวเกินจอมาก`);
      await audit('แผ่นข้อมูลสถานี');
      await creditFits('แผ่นข้อมูลสถานี');
      await shot('sheet');

      // ---- สถานีล็อก: บอกเงื่อนไข ----
      pos = await at('wang-pho'); await tap(pos.x, pos.y); await settle();
      const locked = await p.textContent('.sheet');
      check(locked.includes('ยังล็อกอยู่') && locked.includes('ผ่านภารกิจของสถานีท่ากิเลนให้ครบก่อน เหลืออีก 3 ภารกิจ') && await p.locator('.sheet [data-act="play"]').count() === 0, `${tag}: สถานีล็อกไม่บอกเงื่อนไข`);
      await audit('แผ่นข้อมูลสถานีล็อก');
      if (full) await shot('locked');
      await p.locator('.sheet [data-act="station"]').click(); await settle();
      check(await dbg(A => A.map.openId()) === 'tha-kilen', `${tag}: ปุ่ม "ไปสถานีท่ากิเลน" ไม่ทำงาน`);

      // ---- ปุ่มเล่น -> หน้าจอเล่น (การ์ดก่อนเริ่ม หรือ "กำลังสร้าง" ถ้าภารกิจยังไม่มีข้อมูล) -> กลับ ----
      await p.locator('.sheet [data-act="play"]').click();
      await p.waitForSelector('#s-play:not([hidden]) [data-act="exit"]');
      const playText = await p.textContent('#s-play'), real = await dbg(A => !!A.play);
      check(await p.evaluate(() => location.hash) === '#play/tha-kilen/tk-1' && (real ? playText.includes('เริ่มเดินรถ') && playText.includes(tk[0][0]) : playText.includes('กำลังสร้าง')), `${tag}: หน้าจอเล่นไม่ขึ้น`);
      await audit('หน้าจอเล่น');
      if (full) await shot('play');
      await p.locator('#s-play [data-act="exit"]').click(); await settle();
      check(await p.evaluate(() => location.hash) === '#map/tha-kilen' && await dbg(A => A.map.openId()) === 'tha-kilen', `${tag}: กลับจากหน้าจอเล่นแล้วไม่อยู่ที่แผ่นข้อมูลสถานี`);

      // ---- ความคืบหน้า: ผ่านท่ากิเลนครบ วังโพเปิด; ดาวไม่พอเข้ากาญจนบุรี ----
      await dbg(A => { ['tk-1', 'tk-2', 'tk-3'].forEach((id, i) => A.career.setStars(id, 3 - i)); A.refresh(); });
      check(await p.getAttribute('.mk[data-id="wang-pho"]', 'aria-label') === 'สถานีที่ 2 วังโพ เปิดแล้ว ดาว 0 จาก 9' && await p.getAttribute('.mk[data-id="tha-kilen"]', 'aria-label') === 'สถานีที่ 1 ท่ากิเลน ผ่านแล้ว ดาว 6 จาก 9', `${tag}: ป้ายสถานีไม่อัปเดตตามดาว`);
      check(await p.locator('.sheet [data-act="play"]').count() === 3, `${tag}: ผ่านแล้วต้องเล่นซ้ำได้ทุกภารกิจ`);
      await dbg(A => { ['wp-1', 'wp-2', 'wp-3', 'nt-1', 'nt-2'].forEach(id => A.career.setStars(id, 1)); A.refresh(); });
      pos = await at('kanchanaburi');
      if (await p.evaluate(({ x, y }) => { const el = document.elementFromPoint(x, y); return !!(el && el.closest('.mk[data-id="kanchanaburi"]')); }, pos)) await tap(pos.x, pos.y); else await p.evaluate(() => window.__sjApp.router.replace({ screen: 'map', stationId: 'kanchanaburi' }));
      await settle();
      check((await p.textContent('.sheet')).includes('ต้องมีดาวสะสม 12 ดวง ตอนนี้มี 11 ขาดอีก 1'), `${tag}: ไม่บอกจำนวนดาวที่ขาด`);
      await audit('แผ่นข้อมูลดาวไม่พอ');
      if (full) await shot('stars-needed');

      // ---- คีย์บอร์ด: Esc ปิดแผ่น, โฟกัสปุ่มสถานีแล้ว Enter เปิด, + − ซูม ----
      await p.keyboard.press('Escape'); await settle();
      check(await dbg(A => A.map.openId()) === null && await p.evaluate(() => location.hash) === '#map', `${tag}: Esc ไม่ปิดแผ่นข้อมูล`);
      await dbg(A => A.map.route()); await settle();
      await p.focus('.mk[data-id="wang-pho"]'); await p.keyboard.press('Enter'); await settle();
      check(await dbg(A => A.map.openId()) === 'wang-pho' && await p.evaluate(() => document.activeElement.id) === 'sheet-title', `${tag}: เปิดสถานีด้วยคีย์บอร์ดไม่ได้ หรือโฟกัสไม่ย้ายเข้าแผ่นข้อมูล`);
      if (full) await shot('progress');
      await p.keyboard.press('Escape'); await settle();
      await p.focus('.map-view'); const kk0 = (await dbg(A => A.map.camera())).k; await p.keyboard.press('-'); await settle();
      check((await dbg(A => A.map.camera())).k < kk0, `${tag}: ปุ่ม − บนคีย์บอร์ดไม่ซูมออก`);
      check(await p.evaluate(() => { const s = document.getElementById('stage'), m = document.querySelector('.map-view'); return s.scrollTop + s.scrollLeft + m.scrollTop + m.scrollLeft + window.scrollX + window.scrollY; }) === 0, `${tag}: มีส่วนที่ถูกเลื่อนหลุดตำแหน่ง`);

      // ---- กลับหน้าแรก: ปุ่มหลักเปลี่ยนเป็นเล่นต่อ ----
      await p.locator('[data-act="home"]').click();
      await p.waitForSelector('#s-home:not([hidden])');
      check((await p.textContent('#b-map')).trim() === 'เล่นต่อ', `${tag}: มีความคืบหน้าแล้วปุ่มหลักต้องเป็น "เล่นต่อ"`);
      await ctx.close();
    }

    // จอเตี้ย: รายการ "สายรถไฟ" เปิดแล้วต้องไม่ทับปุ่มแถบบน ไม่ล้นจอ และแตะแผนที่แล้วปิดเอง ให้ปุ่มสถานีกลับมาแตะได้
    for (const v of VIEWS.filter(x => Math.min(x.width, x.height) < 500)) {
      const tag = `${v.name} สายรถไฟ`, ctx = await b.newContext({ viewport: { width: v.width, height: v.height }, deviceScaleFactor: v.dpr, hasTouch: true, reducedMotion: 'reduce' }), p = await ctx.newPage();
      p.on('pageerror', e => fail(`${tag}: page error: ${e.message}`));
      await p.goto(URL0 + '#map', { waitUntil: 'load' });
      await p.waitForFunction(() => window.__sjApp && window.__sjApp.map && window.__sjApp.map.camera());
      await p.evaluate(() => window.__sjApp.map.route()); await sleep(200);
      await p.locator('.lines-toggle').tap(); await sleep(150);
      const r = await p.evaluate(() => { const S = window.__sjApp.stage, box = el => S.rectOf(el), hit = (a, c) => a.x < c.x + c.w - 0.5 && a.x + a.w > c.x + 0.5 && a.y < c.y + c.h - 0.5 && a.y + a.h > c.y + 0.5;
        const list = box(document.getElementById('map-lines-list')), tops = [...document.querySelectorAll('.map-top > *, .map-side > *')].filter(e => e.offsetWidth).map(e => ({ name: e.textContent.trim() || e.getAttribute('aria-label'), r: box(e) }));
        return { open: !document.getElementById('map-lines-list').hidden, list, over: tops.filter(t => hit(list, t.r)).map(t => t.name), inside: list.x >= 0 && list.y >= 0 && list.x + list.w <= S.layout.w + 0.5 && list.y + list.h <= S.layout.h + 0.5, rows: document.querySelectorAll('#map-lines-list button').length }; });
      check(r.open && r.rows === 6 && r.inside && !r.over.length, `${tag}: รายการสายทับปุ่มหรือล้นจอ ${JSON.stringify(r)}`);
      await p.screenshot({ path: path.join(shots, `map-lines-${v.name}-light.png`) });
      // แตะที่ว่างบนแผนที่ (กลางครึ่งขวาของเวที) รายการปิด แล้วปุ่มสถานีทั้ง 5 แตะได้ (ไม่มีอะไรบัง)
      const free = await p.evaluate(() => { const S = window.__sjApp.stage; return S.toClient(S.layout.w * 0.78, S.layout.h * 0.5); });
      await p.touchscreen.tap(free.x, free.y); await sleep(150);
      const after = await p.evaluate(() => ({ closed: document.getElementById('map-lines-list').hidden, covered: [...document.querySelectorAll('.mk[data-id]')].filter(el => { const c = window.__sjApp.map.markerClient(el.dataset.id), top = document.elementFromPoint(c.x, c.y); return !(top && top.closest('.mk') === el); }).map(el => el.dataset.id) }));
      check(after.closed && !after.covered.length, `${tag}: แตะแผนที่แล้วรายการสายไม่ปิด หรือปุ่มสถานียังถูกบัง ${JSON.stringify(after)}`);
      await ctx.close();
    }

    // จอเล็กกว่า 844×390: ปุ่มของหน้าแผนที่ต้องไม่ซ้อนกัน ทั้งตอนปิดและเปิดแผ่นข้อมูลสถานี
    for (const [w, h] of [[667, 375], [568, 320]]) for (const hash of ['#map', '#map/tha-kilen']) {
      const tag = `${w}x${h} ${hash}`, ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: true, reducedMotion: 'reduce' }), p = await ctx.newPage();
      p.on('pageerror', e => fail(`${tag}: page error: ${e.message}`));
      await p.goto(URL0 + hash, { waitUntil: 'load' });
      await p.waitForFunction(() => window.__sjApp && window.__sjApp.map && window.__sjApp.map.camera());
      await sleep(500);
      const over = await p.evaluate(() => { const S = window.__sjApp.stage, sh = document.querySelector('.sheet'), els = [...document.querySelectorAll('.map-top > *, .map-side > *, .lines-toggle, .map-credit a')].filter(e => e.offsetWidth && getComputedStyle(e).display !== 'none'), out = [];
        const B = els.map(e => ({ n: (e.textContent.trim() || e.getAttribute('aria-label')).slice(0, 18), r: S.rectOf(e) })), hit = (a, c) => a.x < c.x + c.w - 0.5 && a.x + a.w > c.x + 0.5 && a.y < c.y + c.h - 0.5 && a.y + a.h > c.y + 0.5;
        for (let i = 0; i < B.length; i++) { for (let j = i + 1; j < B.length; j++) if (hit(B[i].r, B[j].r)) out.push(B[i].n + ' ทับ ' + B[j].n); if (sh && !sh.hidden && hit(B[i].r, S.rectOf(sh))) out.push(B[i].n + ' อยู่ใต้แผ่นข้อมูล'); if (B[i].r.x < -0.5 || B[i].r.y < -0.5 || B[i].r.x + B[i].r.w > S.layout.w + 0.5 || B[i].r.y + B[i].r.h > S.layout.h + 0.5) out.push(B[i].n + ' ล้นจอ'); }
        return out; });
      check(!over.length, `${tag}: ปุ่มหน้าแผนที่ซ้อนกัน: ${over.join(', ')}`);
      await p.screenshot({ path: path.join(shots, `map-small-${w}x${h}${hash === '#map' ? '' : '-sheet'}.png`) });
      await ctx.close();
    }

    // สองแท็บ: แท็บหนึ่งได้ดาว อีกแท็บกลับมาแสดง (visibilitychange) ต้องอ่านเซฟใหม่แล้วป้ายสถานีอัปเดต
    {
      const ctx = await b.newContext({ viewport: { width: 844, height: 390 }, reducedMotion: 'reduce' }), a = await ctx.newPage(), c = await ctx.newPage();
      for (const p of [a, c]) { await p.goto(URL0 + '#map', { waitUntil: 'load' }); await p.waitForFunction(() => window.__sjApp && window.__sjApp.map && window.__sjApp.map.camera()); }
      await c.evaluate(() => window.__sjApp.career.setStars('tk-1', 3, 450));
      const before = await a.evaluate(() => window.__sjApp.progress().totalStars);
      await a.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
      const lab = await a.evaluate(() => ({ total: window.__sjApp.progress().totalStars, label: document.querySelector('.mk[data-id="tha-kilen"]').getAttribute('aria-label') }));
      check(before === 0 && lab.total === 3 && lab.label.includes('ดาว 3 จาก 9'), `สองแท็บ: แท็บที่กลับมาแสดงไม่อ่านเซฟใหม่ ${JSON.stringify({ before, ...lab })}`);
      await ctx.close();
    }

    // prefers-reduced-motion: กล้องไม่เลื่อนเอง ปุ่มพาไปทันที และเปิดลิงก์ตรงเข้าสถานีได้
    const ctx = await b.newContext({ viewport: { width: 844, height: 390 }, reducedMotion: 'reduce' });
    const p = await ctx.newPage();
    p.on('pageerror', e => fail(`reduced-motion: page error: ${e.message}`));
    await p.goto(URL0 + '#map', { waitUntil: 'load' });
    await p.waitForFunction(() => window.__sjApp && window.__sjApp.map && window.__sjApp.map.camera());
    await sleep(1300);
    check(await p.evaluate(() => window.__sjApp.map.clustered()) === true, 'reduced-motion: กล้องเลื่อนเองทั้งที่ผู้เล่นขอลดการเคลื่อนไหว');
    await p.click('.map-top [data-act="route"]');
    await sleep(100);   // รอวาด 1 เฟรม (ถ้ามีแอนิเมชัน 1 วินาที ตอนนี้ยังไม่จบ)
    check(await p.evaluate(() => window.__sjApp.map.clustered() === false && !window.__sjApp.map.animating()), 'reduced-motion: ปุ่ม "ไปเส้นทางสอน" ต้องพาไปทันที');
    await p.goto(URL0 + '#play/wang-pho/wp-1', { waitUntil: 'load' }); await p.reload({ waitUntil: 'load' });
    await p.waitForFunction(() => window.__sjApp && window.__sjApp.map && window.__sjApp.map.openId() === 'wang-pho');
    check(await p.evaluate(() => location.hash) === '#map/wang-pho', 'ลิงก์ตรงเข้าภารกิจที่ยังล็อกต้องพากลับไปแผ่นข้อมูลสถานี');
    await ctx.close();
  } finally { await b.close(); game.close(); }
}

(async () => {
  await pure();
  if (!process.env.SJ_SKIP_BROWSER) await browser();
  if (fails.length) { console.error(`✗ หน้าแผนที่ไม่ผ่าน ${fails.length} ข้อ`); process.exit(1); }
  console.log(`✓ หน้าแผนที่ผ่าน${process.env.SJ_SKIP_BROWSER ? ' (เฉพาะส่วนที่ 1)' : `: ${VIEWS.length} ขนาดจอ × สว่าง/มืด ภาพอยู่ที่ test/screenshots/map-*.png`}`);
})().catch(e => { console.error(e); process.exit(1); });
