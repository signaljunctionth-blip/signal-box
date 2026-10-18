// QA ข้อ 5 (ข้อความที่ต้องเห็น), 6 (เกมเวอร์ชันเดิม/โหมดประวัติศาสตร์/เซฟไม่ปนกัน), 7 (คำขอ เวลาโหลด ขนาด), 8 (เฟรมเรต CPU ช้า 4 เท่า)
// ใช้: node test/qa-misc.js [text,legacy,load,perf]
const L = require('./qa-lib.js');
const { VIEWS, sleep, saveText, IDS } = L;
const zlib = require('zlib');
const { playAll } = require('./lib/bot.js');
const want = process.argv[2] ? process.argv[2].split(',') : null, on = s => !want || want.includes(s);
const FULL = saveText(Object.fromEntries(IDS.map(i => [i, 3])), { 'map-intro-seen': true });
const PHRASES = { unofficial: 'เกมนี้ไม่ใช่ผลงานทางการของการรถไฟแห่งประเทศไทย', layout: 'จำลองจากข้อมูลสาธารณะ', signalling: 'ระบบสัญญาณสมมุติ', names: 'ชื่อเสาในเกมนี้เกมตั้งเอง', procedure: 'ไม่ใช่ขั้นตอนปฏิบัติงานจริง' };

// ข้อความ t อยู่ใน element ที่มองเห็นจริงบนจอ (ไม่ถูกซ่อน ไม่ถูกบัง ไม่อยู่นอกจอ) หรือไม่
const seen = (p, t) => p.evaluate(t => {
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n, found = 'ไม่มีในหน้า';
  while ((n = w.nextNode())) {
    const el = n.parentElement; if (!el || !el.textContent.includes(t) && !n.nodeValue.includes(t.slice(0, 12))) continue;
    if (!n.nodeValue.includes(t.slice(0, 12))) continue;
    if (el.closest('[hidden]') || (el.closest('details:not([open])') && !el.closest('summary'))) { found = 'ซ่อนอยู่'; continue; }
    const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') { found = 'ซ่อนอยู่'; continue; }
    const rg = document.createRange(); rg.selectNodeContents(n); const r = rg.getBoundingClientRect();
    if (!r.width) { found = 'ซ่อนอยู่ (display none)'; continue; }
    if (r.right < 1 || r.bottom < 1 || r.left > innerWidth - 1 || r.top > innerHeight - 1) { found = 'อยู่นอกจอ ต้องเลื่อน'; continue; }
    const top = document.elementFromPoint(Math.max(1, Math.min(innerWidth - 2, r.left + Math.min(r.width / 2, 30))), Math.max(1, Math.min(innerHeight - 2, r.top + r.height / 2)));
    if (top && !(top === el || el.contains(top) || top.contains(el))) { found = `ถูกบังโดย .${String(top.className).slice(0, 20)}`; continue; }
    return `เห็น (ตัวอักษร ${parseFloat(cs.fontSize).toFixed(1)} px)`;
  }
  return found;
}, t);

async function text(env, R) {
  for (const v of VIEWS) {
    const tag = `ข้อความ ${v.name}`;
    const { ctx, p } = await L.open(env, v, 'light', R, { tag, save: FULL });
    const row = {};
    row['หน้าแรก'] = {}; for (const k in PHRASES) row['หน้าแรก'][k] = await seen(p, PHRASES[k]);
    const links = await p.evaluate(() => [...document.querySelectorAll('.credits a')].map(a => a.href));
    R.check(links.some(h => h === 'https://www.openstreetmap.org/copyright') && links.some(h => h.includes('naturalearthdata.com')) && links.some(h => h.includes('opendatacommons.org/licenses/odbl')), `${tag}: เครดิตหน้าแรกไม่มีลิงก์ OSM copyright / ODbL / Natural Earth ${JSON.stringify(links)}`);
    row['หน้าแรก'].credits = await p.evaluate(() => { const d = document.querySelector('.credits'); return d.open ? 'เปิดอยู่' : 'พับอยู่ (ต้องแตะ "เครดิตและแหล่งข้อมูล")'; });
    const lead = (await p.textContent('.lead')).trim();
    row['หน้าแรก'].lead = lead;
    await p.goto(env.game.url + '#map', { waitUntil: 'load' }); await p.waitForFunction(() => window.__sjApp && window.__sjApp.map); await L.mapSettled(p); await sleep(300);
    const mapCheck = async () => { const o = {}; for (const k of ['unofficial']) o[k] = await seen(p, PHRASES[k]); o.osm = await seen(p, 'OpenStreetMap'); o.ne = await seen(p, 'Natural Earth'); return o; };
    row['แผนที่'] = await mapCheck();
    const ml = await p.evaluate(() => [...document.querySelectorAll('.map-credit a')].map(a => ({ t: a.textContent, h: a.href })));
    R.check(ml.some(a => a.h === 'https://www.openstreetmap.org/copyright') && ml.some(a => /naturalearth/i.test(a.h)), `${tag}: เครดิตบนแผนที่ลิงก์ไม่ครบ ${JSON.stringify(ml)}`);
    row['แผนที่'].links = ml.map(a => a.t).join(' | ');
    await p.goto(env.game.url + '#map/tha-kilen', { waitUntil: 'load' }); await p.waitForFunction(() => window.__sjApp && window.__sjApp.map && window.__sjApp.map.openId()); await L.mapSettled(p); await sleep(300);
    row['แผนที่+แผ่นข้อมูล'] = { ...(await mapCheck()), layout: await seen(p, PHRASES.layout), signalling: await seen(p, PHRASES.signalling), names: await seen(p, PHRASES.names), procedure: await seen(p, PHRASES.procedure) };
    await p.goto(env.game.url + '#play/tha-kilen/tk-1', { waitUntil: 'load' }); await p.waitForFunction(() => window.__sjApp && window.__sjApp.play); await sleep(200);
    row['การ์ดเริ่มภารกิจ'] = {}; for (const k in PHRASES) row['การ์ดเริ่มภารกิจ'][k] = await seen(p, PHRASES[k]);
    row['การ์ดเริ่มภารกิจ'].osm = await seen(p, 'OpenStreetMap');
    await L.tapEl(p, v, '.pl-card [data-act="start"]', R, tag); await sleep(200);
    row['ระหว่างเล่น'] = { unofficial: await seen(p, PHRASES.unofficial), osm: await seen(p, 'OpenStreetMap') };
    console.log(`\n${tag}`); for (const k in row) console.log(`  ${k}: ${JSON.stringify(row[k])}`);
    for (const s of ['หน้าแรก', 'แผนที่', 'การ์ดเริ่มภารกิจ']) R.check(String(row[s].unofficial).startsWith('เห็น'), `${tag}: "${PHRASES.unofficial}" บน${s}: ${row[s].unofficial}`);
    for (const k of ['layout', 'signalling', 'names', 'procedure']) R.check(String(row['การ์ดเริ่มภารกิจ'][k]).startsWith('เห็น'), `${tag}: "${PHRASES[k]}" บนการ์ดเริ่มภารกิจ: ${row['การ์ดเริ่มภารกิจ'][k]}`);
    for (const k of ['osm', 'ne']) if (!String(row['แผนที่'][k]).startsWith('เห็น')) R.fail(`${tag}: เครดิต ${k} บนแผนที่ (ไม่เปิดแผ่น): ${row['แผนที่'][k]}`);
    for (const k of ['unofficial', 'osm', 'ne']) if (!String(row['แผนที่+แผ่นข้อมูล'][k]).startsWith('เห็น')) R.note(`${tag}: เปิดแผ่นข้อมูลสถานีแล้ว ${k} ${row['แผนที่+แผ่นข้อมูล'][k]}`);
    await ctx.close();
  }
  R.ok('ข้อความ');
}

async function legacy(env, R) {
  const bot = (p, ...args) => p.evaluate(`(${playAll.toString()})(window.__sjBox, ...${JSON.stringify(args)})`);
  for (const v of [VIEWS[0], VIEWS[1], VIEWS[3]]) {
    const tag = `เกมเดิม ${v.name}`, { ctx, p } = await L.open(env, v, 'light', R, { tag, save: saveText({ 'tk-1': 3, 'tk-2': 2 }) });
    const career0 = await p.evaluate(() => localStorage.getItem('sj-signalbox-save'));
    // ต้นแบบ
    await L.tapEl(p, v, '#b-proto', R, tag); await p.waitForURL(/\/prototype\/$/); await p.waitForFunction(() => !!window.__sjBox); await p.evaluate(() => document.fonts.ready);
    await sleep(200); await L.shot(p, `legacy-proto-home-${v.name}`);
    const lv = await p.evaluate(() => ({ open: document.querySelectorAll('.lv:not([disabled])').length, all: document.querySelectorAll('.lv').length, btn: document.getElementById('b-continue').textContent.trim(), vw: innerWidth, sw: document.documentElement.scrollWidth }));
    R.check(lv.all === 12 && lv.open === 1, `${tag}: ต้นแบบเซฟเปล่าควรเปิดด่าน 1 จาก 12 (ดาวของเกมใหม่ต้องไม่ปน) ได้ ${JSON.stringify(lv)}`);
    await p.click('#b-continue'); await sleep(200); await p.click('[data-act="start"]');
    const r = await bot(p, 0, 1);
    await sleep(300); await L.shot(p, `legacy-proto-win-${v.name}`);
    const keys = await p.evaluate(() => ({ proto: localStorage.getItem('sj-signalbox-v2'), career: localStorage.getItem('sj-signalbox-save'), card: document.querySelector('#ov .card') ? document.querySelector('#ov .card').textContent.replace(/\s+/g, ' ').slice(0, 80) : '' }));
    R.check(r[0].state === 'win' && r[0].pct === 100, `${tag}: ต้นแบบด่าน 1 ${JSON.stringify(r[0])}`);
    R.check(keys.career === career0 && /"stars":\[3/.test(keys.proto || ''), `${tag}: เซฟปนกัน? ต้นแบบ=${keys.proto} เกมใหม่เปลี่ยน=${keys.career !== career0}`);
    console.log(`  ${tag}: ต้นแบบ ด่าน 1 ${r[0].state} ${r[0].pct}% การ์ด "${keys.card}" เซฟต้นแบบ ${keys.proto}`);
    await p.goBack({ waitUntil: 'load' }); await p.waitForFunction(() => !!window.__sjApp);
    R.check((await p.textContent('#b-map')).trim() === 'เล่นต่อ', `${tag}: กลับจากต้นแบบแล้วปุ่มหน้าแรกเปลี่ยน`);
    // โหมดประวัติศาสตร์
    await L.tapEl(p, v, '.credits summary', R, tag); await sleep(200);
    await L.tapEl(p, v, '#b-history', R, tag); await p.waitForURL(/history\.html$/); await p.waitForFunction(() => !!window.__sjBox); await p.evaluate(() => document.fonts.ready);
    await sleep(200); await L.shot(p, `legacy-history-home-${v.name}`);
    const hv = await p.evaluate(() => ({ open: document.querySelectorAll('.lv:not([disabled])').length, all: document.querySelectorAll('.lv').length }));
    R.check(hv.all === 12 && hv.open === 1, `${tag}: โหมดประวัติศาสตร์ควรเปิดแค่ด่าน 1 (ดาวของเส้นทางสอนและของต้นแบบต้องไม่ปน) ได้ ${JSON.stringify(hv)}`);
    await p.click('#b-continue'); await sleep(200); await p.click('[data-act="start"]');
    const h = await bot(p, 0, 1); await sleep(300); await L.shot(p, `legacy-history-win-${v.name}`);
    const after = await p.evaluate(() => JSON.parse(localStorage.getItem('sj-signalbox-save')));
    R.check(h[0].state === 'win', `${tag}: โหมดประวัติศาสตร์ด่าน 1 ${JSON.stringify(h[0])}`);
    R.check(after.packs.namtok && after.packs.namtok.best['tk-1'].stars === 3 && after.packs.namtok.best['tk-2'].stars === 2, `${tag}: เล่นโหมดประวัติศาสตร์แล้วดาวเส้นทางสอนเปลี่ยน ${JSON.stringify(after.packs.namtok)}`);
    console.log(`  ${tag}: ประวัติศาสตร์ ด่าน 1 ${h[0].state} ${h[0].pct}% เซฟรวม packs = ${Object.keys(after.packs).join(',')} history=${JSON.stringify(after.packs.history)}`);
    await p.goBack({ waitUntil: 'load' }); await p.waitForFunction(() => !!window.__sjApp);
    await p.evaluate(() => window.__sjApp.ready());
    const P = await L.progress(p);
    R.check(P.total === 5, `${tag}: กลับมาเกมใหม่ ดาวรวม ${P.total} (ควร 5)`);
    await ctx.close();
  }
  // สองแท็บพร้อมกัน: โหมดประวัติศาสตร์กับเส้นทางสอนเขียนเซฟ key เดียวกัน
  const ctx = await env.b.newContext({ viewport: { width: 1280, height: 800 } });
  const a = await ctx.newPage(), b = await ctx.newPage();
  await a.goto(env.game.url + '#play/tha-kilen/tk-1', { waitUntil: 'load' }); await a.waitForFunction(() => window.__sjApp && window.__sjApp.play);
  await b.goto(env.game.url + 'history.html', { waitUntil: 'load' }); await b.waitForFunction(() => !!window.__sjBox);
  await b.click('#b-continue'); await b.click('[data-act="start"]'); await bot(b, 0, 1);
  const mid = await b.evaluate(() => localStorage.getItem('sj-signalbox-save'));
  await a.click('.pl-card [data-act="start"]'); await L.playLevel(a, VIEWS[3], R, 'สองแท็บ tk-1', { real: false });
  const end = JSON.parse(await a.evaluate(() => localStorage.getItem('sj-signalbox-save')));
  const lost = !(end.packs.history && end.packs.history.stars && end.packs.history.stars[0] > 0);
  console.log(`  สองแท็บ: หลังชนะในแท็บประวัติศาสตร์ ${mid} | หลังชนะ tk-1 ในอีกแท็บ ${JSON.stringify(end.packs)}`);
  if (lost) R.fail('สองแท็บ: เปิดเส้นทางสอนค้างไว้ -> ชนะด่าน 1 ของโหมดประวัติศาสตร์ในอีกแท็บ -> กลับมาชนะ tk-1 ในแท็บแรก = ดาวโหมดประวัติศาสตร์หาย (เซฟทั้งก้อนถูกเขียนทับจากหน่วยความจำของแท็บแรก)');
  await ctx.close();
  R.ok('เกมเวอร์ชันเดิม');
}

async function load(env, R) {
  const dist = L.path.resolve(__dirname, '../dist');
  const walk = d => L.fs.readdirSync(d, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(L.path.join(d, e.name)) : [L.path.join(d, e.name)]));
  const files = walk(dist), size = files.reduce((n, f) => n + L.fs.statSync(f).size, 0);
  console.log(`  dist: ${files.length} ไฟล์ ${(size / 1024).toFixed(0)} KB (${(size / 1048576).toFixed(2)} MB) เกณฑ์ < 20 MB`);
  R.check(size < 20 * 1048576, 'dist ใหญ่เกิน 20 MB');
  const big = files.map(f => [L.path.relative(dist, f), L.fs.statSync(f).size]).sort((x, y) => y[1] - x[1]).slice(0, 6);
  console.log('  ไฟล์ใหญ่สุด: ' + big.map(([f, n]) => `${f} ${(n / 1024).toFixed(0)} KB`).join(', '));
  const gz = f => zlib.gzipSync(L.fs.readFileSync(f)).length;
  for (const [name, hash, ready] of [['หน้าแรก', '', () => !!window.__sjApp], ['หน้าแผนที่ (#map)', '#map', () => !!(window.__sjApp && window.__sjApp.map)], ['หน้าเล่น (#play/tha-kilen/tk-1)', '#play/tha-kilen/tk-1', () => !!(window.__sjApp && window.__sjApp.play)]]) {
    for (const [cond, rate, net] of [['ปกติ', 1, null], ['CPU ช้า 4 เท่า', 4, null], ['CPU ช้า 4 เท่า + เน็ต 1.6 Mbps หน่วง 150 ms', 4, { offline: false, downloadThroughput: 1.6e6 / 8, uploadThroughput: 750e3 / 8, latency: 150 }]]) {
      const times = [], fcp = []; let bytes = 0, nreq = 0, gzBytes = 0;
      for (let i = 0; i < (net ? 2 : 5); i++) {
        const ctx = await env.b.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true });
        const p = await ctx.newPage(), cdp = await ctx.newCDPSession(p);
        await cdp.send('Network.enable'); if (net) await cdp.send('Network.emulateNetworkConditions', net);
        await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
        if (rate > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate });
        const urls = []; p.on('requestfinished', r => urls.push(r.url()));
        await p.goto(env.game.url + hash, { waitUntil: 'commit' });
        await p.waitForFunction(ready, null, { polling: 'raf', timeout: 60000 });
        const t = await p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r({ now: performance.now(), fcp: (performance.getEntriesByName('first-contentful-paint')[0] || {}).startTime || 0 })))));
        times.push(t.now); fcp.push(t.fcp);
        await p.evaluate(() => document.fonts.ready); await sleep(150);
        if (i === 0) { nreq = urls.length; for (const u of urls) { const f = L.path.join(dist, decodeURIComponent(new URL(u).pathname).replace('/sub/folder/', '')), ff = L.fs.existsSync(f) && L.fs.statSync(f).isDirectory() ? L.path.join(f, 'index.html') : f; if (L.fs.existsSync(ff)) { bytes += L.fs.statSync(ff).size; gzBytes += /\.woff2$/.test(ff) ? L.fs.statSync(ff).size : gz(ff); } } }
        await ctx.close();
      }
      times.sort((x, y) => x - y); fcp.sort((x, y) => x - y);
      console.log(`  โหลด${name} [${cond}]: พร้อมใช้ มัธยฐาน ${times[Math.floor(times.length / 2)].toFixed(0)} ms (ต่ำสุด ${times[0].toFixed(0)} สูงสุด ${times[times.length - 1].toFixed(0)}; n=${times.length}) FCP ${fcp[Math.floor(fcp.length / 2)].toFixed(0)} ms | ${nreq} คำขอ ${(bytes / 1024).toFixed(0)} KB (gzip ประมาณ ${(gzBytes / 1024).toFixed(0)} KB)`);
    }
  }
  R.ok('โหลด/ขนาด');
}

async function perf(env, R) {
  const v = VIEWS[0];
  const stats = arr => { const d = []; for (let i = 1; i < arr.length; i++) d.push(arr[i] - arr[i - 1]); d.sort((a, b) => a - b); const sum = d.reduce((a, b) => a + b, 0); return { frames: d.length, fps: +(1000 * d.length / sum).toFixed(1), median: +d[Math.floor(d.length / 2)].toFixed(1), p95: +d[Math.floor(d.length * 0.95)].toFixed(1), max: +d[d.length - 1].toFixed(1), over33: d.filter(x => x > 34).length, over50: d.filter(x => x > 50).length }; };
  const rec = p => p.evaluate(() => { window.__qaF = []; window.__qaLong = []; if (!window.__qaRun) { window.__qaRun = true; const f = t => { window.__qaF.push(t); requestAnimationFrame(f); }; requestAnimationFrame(f); try { new PerformanceObserver(l => { for (const e of l.getEntries()) window.__qaLong.push(Math.round(e.duration)); }).observe({ entryTypes: ['longtask'] }); } catch { /* ไม่รองรับ */ } } });
  const take = p => p.evaluate(() => ({ f: window.__qaF.slice(), long: window.__qaLong.slice() }));
  for (const rate of [1, 4]) for (const scheme of ['light']) {
    const tag = `perf CPU x${rate}`;
    // ---- หน้าเล่น np-3 เวลาจริง บอทแตะจริง 15 วินาที ----
    let o = await L.open(env, v, scheme, R, { tag, save: FULL, hash: '#play/nong-pla-duk-jn/np-3' }), p = o.p;
    let cdp = await o.ctx.newCDPSession(p); if (rate > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate });
    await L.startTap(p, v, R, tag);
    // เร่งให้มีขบวนในผังก่อนเริ่มวัด
    await p.evaluate(() => { const P = window.__sjApp.play; P.setManual(true); for (let i = 0; i < 400 && P.g.trains.length < 2; i++) { const t = P.nextTarget(); if (t) P.press(t); P.step(0.05); } P.setManual(false); });
    await sleep(500); await rec(p);
    const t0 = Date.now(); let taps = 0, maxTrains = 0;
    while (Date.now() - t0 < 15000) {
      const s = await p.evaluate(() => { const P = window.__sjApp.play, t = P.g.state === 'play' ? P.nextTarget() : null; return { n: P.g.trains.length, at: t ? P.targetClient(t) : null, state: P.g.state }; });
      maxTrains = Math.max(maxTrains, s.n); if (s.state !== 'play') break;
      if (s.at) { await L.tapXY(p, v, s.at.x, s.at.y); taps++; }
      await sleep(250);
    }
    const a = await take(p), sa = stats(a.f);
    console.log(`  ${tag} หน้าเล่น np-3 (เวลาจริง 15 วิ แตะ ${taps} ครั้ง ขบวนในผังสูงสุด ${maxTrains}): ${JSON.stringify(sa)} long tasks ${a.long.length} (นานสุด ${Math.max(0, ...a.long)} ms)`);
    // ×2
    await L.tapEl(p, v, '.pl-bar [data-act="fast"]', R, tag); await rec(p); await sleep(6000);
    const a2 = await take(p); console.log(`  ${tag} หน้าเล่น np-3 ที่ ×2 (6 วิ ไม่แตะ): ${JSON.stringify(stats(a2.f))}`);
    await o.ctx.close();
    if (rate === 4 && sa.fps < 30) R.fail(`${tag}: หน้าเล่น np-3 ได้ ${sa.fps} fps (< 30)`);

    // ---- แผนที่: ลากนิ้วเดียว 4 วิ + บีบซูมสองนิ้ว 4 วิ + ปุ่มซูม ----
    o = await L.open(env, v, scheme, R, { tag, save: FULL, hash: '#map' }); p = o.p;
    cdp = await o.ctx.newCDPSession(p); if (rate > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate });
    await p.waitForFunction(() => window.__sjApp && window.__sjApp.map); await L.mapSettled(p); await sleep(400);
    const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((q, i) => ({ x: q[0], y: q[1], id: i + 1, radiusX: 8, radiusY: 8, force: 1 })) });
    for (const [label, zoom] of [['ซูมเส้นทางสอน', () => window.__sjApp.map.route()], ['ทั้งประเทศ (ซูมเข้า 1 ขั้น)', () => { window.__sjApp.map.country(); }]]) {
      await p.evaluate(zoom); await sleep(300);
      if (label.startsWith('ทั้ง')) { await L.tapEl(p, v, '.map-side [data-act="zin"]', R, tag); await sleep(500); }
      const cam0 = await p.evaluate(() => window.__sjApp.map.camera());
      await rec(p);
      await touch('touchStart', [[300, 200]]);
      const s0 = Date.now(); let moves = 0;
      while (Date.now() - s0 < 4000) { const t = (Date.now() - s0) / 1000; await touch('touchMove', [[300 + 150 * Math.sin(t * 2.2), 200 + 70 * Math.sin(t * 3.1)]]); moves++; await sleep(8); }
      await touch('touchEnd', []);
      const d = await take(p), cam1 = await p.evaluate(() => window.__sjApp.map.camera());
      const sd = stats(d.f);
      console.log(`  ${tag} แผนที่ ${label} ลากนิ้วเดียว 4 วิ (${moves} touchmove): ${JSON.stringify(sd)} long tasks ${d.long.length} (นานสุด ${Math.max(0, ...d.long)} ms) กล้องขยับ ${JSON.stringify(cam0) !== JSON.stringify(cam1)}`);
      if (rate === 4 && sd.fps < 30) R.fail(`${tag}: ลากแผนที่ (${label}) ได้ ${sd.fps} fps (< 30)`);
      await sleep(200); await rec(p);
      await touch('touchStart', [[300, 200], [420, 200]]);
      const s1 = Date.now(); moves = 0;
      while (Date.now() - s1 < 4000) { const t = (Date.now() - s1) / 1000, g = 60 + 50 * Math.sin(t * 2.5) + 60; await touch('touchMove', [[360 - g, 200], [360 + g, 200]]); moves++; await sleep(8); }
      await touch('touchEnd', []);
      const z = await take(p), sz = stats(z.f), cam2 = await p.evaluate(() => window.__sjApp.map.camera());
      console.log(`  ${tag} แผนที่ ${label} บีบซูมสองนิ้ว 4 วิ (${moves} touchmove): ${JSON.stringify(sz)} long tasks ${z.long.length} (นานสุด ${Math.max(0, ...z.long)} ms) ซูมเปลี่ยน ${cam1.k !== cam2.k}`);
      if (rate === 4 && sz.fps < 30) R.fail(`${tag}: บีบซูมแผนที่ (${label}) ได้ ${sz.fps} fps (< 30)`);
    }
    // กล้องบินเข้าเส้นทางสอน (ปุ่ม "ไปเส้นทางสอน")
    await p.evaluate(() => window.__sjApp.map.country()); await sleep(300); await rec(p);
    await L.tapEl(p, v, '.map-top [data-act="route"]', R, tag); await sleep(1300);
    const f = await take(p); console.log(`  ${tag} แผนที่ กล้องบินเข้าเส้นทางสอน 1.3 วิ: ${JSON.stringify(stats(f.f))}`);
    await o.ctx.close();
  }
  R.ok('ประสิทธิภาพ');
}

(async () => {
  const env = await L.launch(), R = L.createReport('qa-misc');
  const run = async (name, fn) => { if (!on(name)) return; console.log(`\n# ${name}`); try { await fn(env, R); } catch (e) { R.fail(`${name}: สคริปต์ล้ม ${e.stack.split('\n').slice(0, 4).join(' | ')}`); } };
  try { await run('text', text); await run('legacy', legacy); await run('load', load); await run('perf', perf); } finally { await env.close(); }
  process.exit(R.done() ? 1 : 0);
})();
