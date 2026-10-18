// บอทเบราว์เซอร์ของเกมเวอร์ชันโมดูล (dist/history.html) เทียบกับต้นแบบ v2 — ใช้: npm run test:game (ต้อง build ก่อน)
// 1) บอทตัวเดียวกันเล่นครบ 12 ด่านบนต้นแบบ, เกมโมดูลในเบราว์เซอร์ และ src/sim ใน Node: ผลต้องเท่ากันทุกค่า (รวมคะแนนดิบ)
// 2) ภาพบน canvas ของเกมโมดูลต้องตรงกับต้นแบบ ณ สถานะเดียวกัน ที่ 844×390 และ 1280×800
// 3) เล่นด่าน 1, 2 (ประแจ), 10 (NX แตะชานชาลา) ด้วยการแตะจริงตามคำใบ้ ที่ 844×390 และ 1280×800 จนชนะ ดาวถูกเซฟด้วย key ใหม่ และไม่แตะเซฟของต้นแบบ
// 4) ไม่มี page error, console error, คำขอล้มเหลว หรือคำขอออกนอกเครื่อง
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');
const { playAll, PROTOTYPE_PCT } = require('./lib/bot.js');
const { nodeHook } = require('./lib/node-hook.js');

const root = path.resolve(__dirname, '..'), dist = path.join(root, 'dist'), shots = path.join(__dirname, 'screenshots');
const fails = [];
const fail = m => { fails.push(m); console.error('  ✗ ' + m); };
if (!fs.existsSync(path.join(dist, 'history.html'))) { console.error('✗ ไม่พบ dist/history.html (รัน npm run build ก่อน)'); process.exit(1); }

const MIME = { '.html': 'text/html', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.json': 'application/json' };
const SUB = '/sub/folder/';
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (!url.startsWith(SUB)) { res.writeHead(404); return res.end(); }
  let file = path.join(dist, url.slice(SUB.length));
  if (!file.startsWith(dist)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

const VIEWS = [{ name: 'มือถือ 844×390', width: 844, height: 390, dpr: 2 }, { name: 'คอม 1280×800', width: 1280, height: 800, dpr: 1 }];
// [ด่าน (นับจาก 0), จำนวนก้าวของบอทก่อนหยุดภาพ] เลือกให้ครบ 4 ยุค: แขนสัญญาณ, ทางล็อกสีเขียว, ตอนรางสีแดง + ขบวนด่วน, NX
const FREEZE = [[0, 180], [2, 420], [4, 300], [7, 560], [11, 700]];

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const PROTO = origin + SUB + 'prototype/', GAME = origin + SUB + 'history.html';
  fs.mkdirSync(shots, { recursive: true });
  const b = await chromium.launch();
  const open = async (url, view, label) => {
    const ctx = await b.newContext({ viewport: { width: view.width, height: view.height }, deviceScaleFactor: view.dpr });
    const p = await ctx.newPage();
    p.on('pageerror', e => fail(`${label}: page error: ${e.message}`));
    p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') fail(`${label}: console ${m.type()}: ${m.text()}`); });
    p.on('requestfailed', r => fail(`${label}: โหลดไม่ได้: ${r.url()}`));
    p.on('request', r => { if (!/^(data|blob):/.test(r.url()) && !r.url().startsWith(origin + SUB)) fail(`${label}: คำขอออกนอกโฟลเดอร์/ออกนอกเครื่อง: ${r.url()}`); });
    p.on('response', r => { if (r.status() >= 400) fail(`${label}: HTTP ${r.status()}: ${r.url()}`); });
    await p.goto(url, { waitUntil: 'load' });
    await p.evaluate(() => document.fonts.ready);
    if (!(await p.evaluate(() => !!window.__sjBox))) fail(`${label}: ไม่พบ window.__sjBox`);
    return p;
  };
  const bot = (p, ...args) => p.evaluate(`(${playAll.toString()})(window.__sjBox, ...${JSON.stringify(args)})`);
  // เล่นด่านที่เปิดอยู่ด้วยการแตะจริงตามคำใบ้ของเกม (สัญญาณ ประแจ ชานชาลา) ช่วงที่ไม่มีอะไรให้แตะจะเร่งเวลาผ่าน hook คืนจำนวนครั้งที่แตะ
  const tapThrough = async (p, view, shotFile) => {
    let taps = 0;
    for (let i = 0; i < 1500; i++) {
      const s = await p.evaluate(() => {
        const B = window.__sjBox, G = B.G, h = B.hint();
        if (!h) { for (let n = 0; n < 30 && G.state === 'play'; n++) B.step(1 / 120); return { state: G.state }; }
        const e = h.kind === 'plat' ? G.E[G.L.platEdge[h.k]] : null;
        const at = h.kind === 's' ? { x: G.S[h.k].lx, y: G.S[h.k].ly } : h.kind === 'p' ? { x: G.P[h.k].x, y: G.P[h.k].y + 34 } : { x: e.pts[0][0] + e.len / 2, y: e.pts[0][1] + 26 };
        const hit = B.hitTest(at.x, at.y), r = document.getElementById('cv').getBoundingClientRect();
        return { state: G.state, tap: B.toClient(at.x, at.y), k: h.k, kind: h.kind, hit, reach: 44 * r.width / G.L.size[0] };
      });
      if (s.state !== 'play') break;
      if (!s.tap) continue;
      if (h2k(s.hit) !== String(s.k)) fail(`${view.name}: จุดแตะของ ${s.kind} ${s.k} ไปโดน ${JSON.stringify(s.hit)}`);
      if (s.kind !== 'plat' && 2 * s.reach < 40) fail(`${view.name}: เป้าแตะ ${s.k} เล็กกว่า 40 px (${(2 * s.reach).toFixed(0)} px)`);
      if (shotFile && taps === 2) await p.screenshot({ path: shotFile });
      await p.mouse.click(s.tap.x, s.tap.y); taps++;
      // เดินเวลาต่ออีกนิด: ถ้าระบบปฏิเสธคำสั่ง (เช่น ประแจยังถูกล็อก) คำใบ้จะค้างที่เดิมจนรถเคลื่อน
      await p.evaluate(() => { const B = window.__sjBox; for (let n = 0; n < 12 && B.G.state === 'play'; n++) B.step(1 / 120); });
    }
    return taps;
  };
  const h2k = hit => String(hit ? (hit.kind === 'platform' ? hit.no : hit.id) : null);
  try {
    /* ---------- 1) บอท 12 ด่าน 3 ที่ ---------- */
    console.log('\n== บอทเล่น 12 ด่าน: ต้นแบบ v2 / เกมโมดูล (เบราว์เซอร์) / src/sim (Node)');
    const pp = await open(PROTO, VIEWS[1], 'ต้นแบบ'), gp = await open(GAME, VIEWS[1], 'เกมโมดูล');
    const proto = await bot(pp), game = await bot(gp);
    const sim = await import('../src/sim/index.js');
    const readJson = f => JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));
    const st = sim.loadStations(fs.readdirSync(path.join(root, 'data/stations')).filter(f => f.endsWith('.json')).map(f => readJson('data/stations/' + f)));
    const node = playAll(nodeHook(sim, sim.loadLevelPack(readJson('data/levels/history.json'), st.stations, st.errors).pack));
    console.table(proto.map((r, i) => ({ ด่าน: r.level, ต้นแบบ: `${r.state} ${r.trains} ${r.pct}%`, เกมโมดูล: `${game[i].state} ${game[i].trains} ${game[i].pct}%`, 'sim (Node)': `${node[i].state} ${node[i].trains} ${node[i].pct}%`,
      'คะแนนดิบต้นแบบ': r.score, 'คะแนนดิบโมดูล': game[i].score, เท่ากัน: JSON.stringify(r) === JSON.stringify(game[i]) && JSON.stringify(r) === JSON.stringify(node[i]) })));
    proto.forEach((r, i) => {
      if (r.pct !== PROTOTYPE_PCT[i]) fail(`ด่าน ${r.level}: ต้นแบบได้ ${r.pct}% ไม่ตรงกับค่าที่จดไว้ ${PROTOTYPE_PCT[i]}% (ต้นแบบถูกแก้หรือเปล่า)`);
      for (const [who, x] of [['เกมโมดูล', game[i]], ['sim (Node)', node[i]]]) {
        if (x.state !== 'win') fail(`ด่าน ${r.level}: ${who} ไม่ชนะ (${x.state})`);
        for (const k of ['state', 'trains', 'pct', 'score', 'time', 'steps']) if (x[k] !== r[k]) fail(`ด่าน ${r.level}: ${who} ${k} = ${x[k]} ไม่เท่าต้นแบบ ${r[k]}`);
      }
    });
    await pp.close(); await gp.close();

    /* ---------- 2) ภาพ canvas เทียบกับต้นแบบ ---------- */
    console.log('\n== ภาพบน canvas เทียบกับต้นแบบ ณ สถานะเดียวกัน');
    const cmp = await b.newPage();
    for (const view of VIEWS) {
      const pp = await open(PROTO, view, `ต้นแบบ ${view.name}`), gp = await open(GAME, view, `เกมโมดูล ${view.name}`);
      for (const [lvl, steps] of FREEZE) {
        const grab = async p => {
          // เล่นถึงก้าวที่กำหนดแล้วหยุดเวลาทันทีในคำสั่งเดียวกัน (state ที่ไม่ใช่ 'play' = วงรอบไม่เดินตัวจำลอง แต่ยังวาดอยู่)
          const was = await p.evaluate(`(() => { (${playAll.toString()})(window.__sjBox, ${lvl}, ${lvl + 1}, ${steps}); const G = window.__sjBox.G, was = G.state; G.state = 'frozen'; return was; })()`);
          // รอ 3 เฟรมให้วาดสถานะนี้แน่ ๆ แล้วเก็บภาพ
          return p.evaluate(was => new Promise(done => {
            const G = window.__sjBox.G, cv = document.getElementById('cv');
            let n = 0; const tick = () => (++n < 3 ? requestAnimationFrame(tick) : done({
              was, time: G.time, score: G.score, trains: G.trains.length, png: cv.toDataURL(), w: cv.width, h: cv.height, css: cv.style.width + '×' + cv.style.height,
            })); requestAnimationFrame(tick);
          }), was);
        };
        const a = await grab(pp), g = await grab(gp), tag = `${view.name} ด่าน ${lvl + 1} ก้าวที่ ${steps}`;
        if (a.was !== 'play' || g.was !== 'play') fail(`${tag}: เกมจบก่อนถึงจุดหยุดภาพ (${a.was}/${g.was})`);
        if (a.time !== g.time || a.score !== g.score || a.trains !== g.trains) fail(`${tag}: สถานะเกมไม่เท่ากัน (เวลา ${a.time}/${g.time}, คะแนน ${a.score}/${g.score})`);
        if (a.w !== g.w || a.h !== g.h || a.css !== g.css) fail(`${tag}: ขนาด canvas ไม่เท่ากัน ต้นแบบ ${a.w}×${a.h} (${a.css}) โมดูล ${g.w}×${g.h} (${g.css})`);
        const diff = a.png === g.png ? { n: 0, max: 0 } : await cmp.evaluate(async ([x, y]) => {
          const load = src => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; });
          const px = async src => { const i = await load(src), c = document.createElement('canvas'); c.width = i.width; c.height = i.height; const k = c.getContext('2d'); k.drawImage(i, 0, 0); return k.getImageData(0, 0, c.width, c.height).data; };
          const p = await px(x), q = await px(y); let n = 0, max = 0;
          if (p.length !== q.length) return { n: -1, max: 255 };
          for (let i = 0; i < p.length; i += 4) { const d = Math.max(Math.abs(p[i] - q[i]), Math.abs(p[i + 1] - q[i + 1]), Math.abs(p[i + 2] - q[i + 2])); if (d) { n++; if (d > max) max = d; } }
          return { n, max };
        }, [a.png, g.png]);
        console.log(`  ${tag}: canvas ${g.w}×${g.h}, ${g.trains} ขบวนในผัง, พิกเซลที่ต่างจากต้นแบบ ${diff.n}${diff.n ? ` (ต่างสูงสุด ${diff.max}/255)` : ''}`);
        if (diff.n !== 0) {
          fail(`${tag}: ภาพ canvas ต่างจากต้นแบบ ${diff.n} พิกเซล`);
          const f = `diff-${view.width}-lv${lvl + 1}`;
          fs.writeFileSync(path.join(shots, f + '-prototype.png'), Buffer.from(a.png.split(',')[1], 'base64'));
          fs.writeFileSync(path.join(shots, f + '-module.png'), Buffer.from(g.png.split(',')[1], 'base64'));
        }
        if (lvl === 7) { await pp.screenshot({ path: path.join(shots, `m1a-${view.width}x${view.height}-prototype-lv8.png`) }); await gp.screenshot({ path: path.join(shots, `m1a-${view.width}x${view.height}-module-lv8.png`) }); }
      }
      await pp.close(); await gp.close();
    }
    await cmp.close();

    /* ---------- 3) เล่นด่าน 1 ด้วยการแตะจริง ---------- */
    for (const view of VIEWS) {
      console.log(`\n== ${view.name}: เล่นด่าน 1 ด้วยการแตะจริง`);
      const p = await open(GAME, view, `แตะจริง ${view.name}`);
      await p.evaluate(() => { try { localStorage.clear(); } catch {} });
      await p.reload({ waitUntil: 'load' });
      if ((await p.textContent('#b-continue')).trim() !== 'เริ่มด่านแรก') fail(`${view.name}: ปุ่มเริ่มไม่ใช่ "เริ่มด่านแรก"`);
      if (await p.locator('.lv:not([disabled])').count() !== 1) fail(`${view.name}: เซฟเปล่าควรเปิดแค่ด่าน 1`);
      await p.screenshot({ path: path.join(shots, `m1a-${view.width}x${view.height}-levels.png`) });
      await p.click('#b-continue');
      await p.screenshot({ path: path.join(shots, `m1a-${view.width}x${view.height}-intro.png`) });
      await p.click('[data-act="start"]');
      const taps = await tapThrough(p, view, path.join(shots, `m1a-${view.width}x${view.height}-play.png`));
      const end = await p.evaluate(() => { const G = window.__sjBox.G; return { state: G.state, done: G.done, score: G.score, card: document.querySelector('#ov .card') ? document.querySelector('#ov .card').textContent : '', hud: document.getElementById('h-trains').textContent,
        saved: localStorage.getItem('sj-signalbox-save'), protoKey: localStorage.getItem('sj-signalbox-v2') }; });
      console.log(`  แตะ ${taps} ครั้ง -> ${end.state}, ส่งออก ${end.done}/3, คะแนน ${end.score}, เซฟ: ${end.saved}`);
      await p.screenshot({ path: path.join(shots, `m1a-${view.width}x${view.height}-win.png`) });
      if (end.state !== 'win' || end.done !== 3) fail(`${view.name}: แตะจริงแล้วไม่ชนะด่าน 1 (${end.state}, ${end.done}/3)`);
      if (taps !== 6) fail(`${view.name}: ด่าน 1 ควรแตะ 6 ครั้ง (S1 กับ T1 อย่างละ 3) แต่แตะ ${taps}`);
      if (!/ส่งครบ 3 ขบวน · 450 คะแนน/.test(end.card) || !/★★★/.test(end.card)) fail(`${view.name}: การ์ดชนะไม่ถูก: ${end.card.replace(/\s+/g, ' ').slice(0, 120)}`);
      if (end.saved !== '{"v":2,"packs":{"history":{"stars":[3],"best":{}}}}') fail(`${view.name}: เซฟไม่ถูก: ${end.saved}`);
      if (end.protoKey !== null) fail(`${view.name}: เกมโมดูลไปแตะ key เซฟของต้นแบบ`);
      await p.click('[data-act="home"], [data-act="next"]'); // ด่านถัดไป
      if ((await p.textContent('#h-title')).trim() !== 'ด่าน 2 · ประแจตัวแรก') fail(`${view.name}: กด "ด่านถัดไป" แล้วไม่เข้าด่าน 2`);
      await p.click('#b-home');
      if (await p.locator('.lv:not([disabled])').count() !== 2) fail(`${view.name}: ชนะด่าน 1 แล้วด่าน 2 ควรปลดล็อก`);
      await p.reload({ waitUntil: 'load' });
      if ((await p.textContent('#b-continue')).trim() !== 'เล่นต่อ ด่าน 2') fail(`${view.name}: เปิดใหม่แล้วความคืบหน้าหาย: ${await p.textContent('#b-continue')}`);
      // ด่านที่ต้องแตะประแจ (ด่าน 2) และด่าน NX ที่ต้องแตะชานชาลาปลายทาง (ด่าน 10)
      for (const lvl of [1, 9]) {
        await p.evaluate(i => window.__sjBox.openLevel(i), lvl);
        await p.click('[data-act="start"]');
        const n = await tapThrough(p, view, path.join(shots, `m1a-${view.width}x${view.height}-play-lv${lvl + 1}.png`));
        const r = await p.evaluate(() => { const G = window.__sjBox.G; return { state: G.state, done: G.done, total: G.lv.trains.length, pct: Math.round(100 * G.score / G.max) }; });
        console.log(`  ด่าน ${lvl + 1}: แตะ ${n} ครั้ง -> ${r.state}, ส่งออก ${r.done}/${r.total}, ${r.pct}%`);
        if (r.state !== 'win' || r.done !== r.total) fail(`${view.name}: แตะจริงแล้วไม่ชนะด่าน ${lvl + 1} (${r.state}, ${r.done}/${r.total})`);
      }
      // เซฟเสีย: ต้องเริ่มเปล่า ไม่พัง
      await p.evaluate(() => localStorage.setItem('sj-signalbox-save', '{เสีย'));
      await p.reload({ waitUntil: 'load' });
      if ((await p.textContent('#b-continue')).trim() !== 'เริ่มด่านแรก') fail(`${view.name}: เซฟเสียแล้วหน้าเลือกด่านไม่กลับเป็นค่าเริ่มต้น`);
      await p.close();
    }
  } finally {
    await b.close(); server.close();
  }
  if (fails.length) { console.error(`\n✗ game-bot-test ไม่ผ่าน ${fails.length} ข้อ`); process.exit(1); }
  console.log('\n✓ เกมโมดูลผ่าน: 12 ด่านเท่าต้นแบบ ภาพ canvas ตรงกัน แตะจริงชนะด่าน 1 ไม่มี error');
})().catch(e => { console.error(e); process.exit(1); });
