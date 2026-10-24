// ตรวจหน้าจอโหมดสร้าง (M4) — ใช้: node test/build-ui-test.js (เปิด dist/ เอง ต้อง build ก่อน หรือตั้ง SJ_URL=http://localhost:5173/)
//   ทุกขนาดจอ (844×390, 390×844 เวทีหมุน, 1180×820, 1280×800): ลากรางทางหลีกด้วยเมาส์ที่พิกัดจริงบนจอ วางทางจอดและเสา -> ผังผ่านตัวตรวจ
//   ตารางอินเตอร์ล็อกขึ้นครบ 8 เส้นทาง, ปุ่มทุกปุ่มกว้าง/สูงอย่างน้อย 40 px และอยู่ในจอ, ไม่มี console error, ภาพ build-* ใน test/screenshots
//   844×390: ทดลองเดินรถจนชนะแล้วกลับมาผังยังอยู่, ลิงก์แชร์เปิดในหน้าใหม่ได้ผังเดิม, รหัสที่ถูกแก้ขึ้นข้อความและไม่พัง
const fs = require('fs');
const path = require('path');
const { serveGame } = require('./lib/serve.js');

const shots = path.join(__dirname, 'screenshots');
const fails = [];
const fail = m => { fails.push(m); console.error('  ✗ ' + m); };
const check = (ok, m) => { if (!ok) fail(m); };
const VIEWS = [
  { name: '844x390', width: 844, height: 390, dpr: 2, touch: true },
  { name: '390x844', width: 390, height: 844, dpr: 2, touch: true },
  { name: '1180x820', width: 1180, height: 820, dpr: 2, touch: true },
  { name: '1280x800', width: 1280, height: 800, dpr: 1, touch: false },
];
const NAMTOK = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/levels/namtok.json'), 'utf8'));
// เซฟที่ผ่านทุกภารกิจ 3 ดาว: งบ 16 × 190 และทุกสถานีผ่านครบ (เปิดเดินรถอิสระ)
const RICH = JSON.stringify({ v: 2, packs: { [NAMTOK.id]: { stars: [], best: Object.fromEntries(NAMTOK.levels.map(l => [l.id, { stars: 3, score: 900 }])) } } });
const LOOP = [[5, 4], [6, 3], [7, 2], [8, 2], [9, 2], [10, 2], [11, 2], [12, 3], [13, 4]];

(async () => {
  const { chromium } = require('playwright');
  fs.mkdirSync(shots, { recursive: true });
  const game = await serveGame(), b = await chromium.launch();
  const open = async (v, hash, tag, scheme = 'light') => {
    const ctx = await b.newContext({ viewport: { width: v.width, height: v.height }, deviceScaleFactor: v.dpr, hasTouch: v.touch, colorScheme: scheme });
    const p = await ctx.newPage();
    p.on('pageerror', e => fail(`${tag}: page error: ${e.message}`));
    p.on('console', m => { if (m.type() === 'error') fail(`${tag}: console error: ${m.text()}`); });
    p.on('request', r => { if (!/^(data|blob):/.test(r.url()) && !r.url().startsWith(game.origin)) fail(`${tag}: คำขอออกนอกเครื่อง: ${r.url()}`); });
    await p.goto(game.url + hash, { waitUntil: 'load' });
    await p.waitForFunction(() => !!document.querySelector('.bld canvas') && document.querySelector('.bld-chip').textContent, null, { timeout: 15000 });
    await p.evaluate(() => document.fonts.ready);
    await p.waitForTimeout(300);
    return { ctx, p };
  };
  // จุดกริด (i, j) -> พิกัดจริงบนจอ (เวทีหมุนเมื่อกรอบ canvas บนจอสลับด้านกับขนาดของมันเอง)
  const pointsOf = (p, list) => p.evaluate(list => {
    const cv = document.querySelector('.bld canvas'), R = cv.getBoundingClientRect(), w = cv.clientWidth, h = cv.clientHeight;
    const rot = Math.abs(R.width - h) < 2 && Math.abs(R.width - w) > 2;
    const k = Math.min((w - 28) / 720, (h - 28) / 320), ox = (w - 720 * k) / 2, oy = (h - 320 * k) / 2;
    return list.map(([i, j]) => { const lx = ox + i * 40 * k, ly = oy + (j + 0.5) * 40 * k; return rot ? [R.right - ly, R.top + lx] : [R.left + lx, R.top + ly]; });
  }, list);
  const drag = async (p, list) => {
    const pts = await pointsOf(p, list);
    await p.mouse.move(...pts[0]); await p.mouse.down();
    for (const q of pts.slice(1)) await p.mouse.move(...q, { steps: 4 });
    await p.mouse.up();
  };
  const tool = (p, id) => p.click(`[data-tool="${id}"]`);
  const chip = p => p.$eval('.bld-chip', e => e.textContent);
  async function drawLoop(p, saveText = RICH) {
    await p.evaluate(t => { try { localStorage.removeItem('sj-build-plan'); if (t) localStorage.setItem('sj-signalbox-save', t); else localStorage.removeItem('sj-signalbox-save'); } catch { /* ไม่มีที่เก็บ */ } }, saveText);
    await p.reload({ waitUntil: 'load' });
    await p.waitForFunction(() => !!document.querySelector('.bld-chip') && document.querySelector('.bld-chip').textContent);
    await p.waitForTimeout(300);
    await tool(p, 'track'); await drag(p, LOOP);
    await tool(p, 'plat'); await drag(p, [[7.5, 2], [8.5, 2], [9.5, 2], [10.5, 2]]);
    await tool(p, 'sigW'); await drag(p, [[7, 2]]);
    await tool(p, 'sigE'); await drag(p, [[11, 2]]);
  }
  const audit = async (p, v, where) => {
    const bad = await p.evaluate(({ W, H }) => [...document.querySelectorAll('#s-build :is(a,button)')].map(el => {
      const r = el.getBoundingClientRect();
      if (!r.width || el.closest('[hidden]')) return null;
      const name = (el.getAttribute('aria-label') || el.textContent).trim().slice(0, 24);
      if (r.width < 39.5 || r.height < 39.5) return `${name}: เป้าแตะ ${r.width.toFixed(0)}×${r.height.toFixed(0)}`;
      if (r.left < -0.5 || r.top < -0.5 || r.right > W + 0.5 || r.bottom > H + 0.5) return `${name}: ล้นจอ ${[r.left, r.top, r.right, r.bottom].map(n => n.toFixed(0))}`;
      return null;
    }).filter(Boolean), { W: v.width, H: v.height });
    bad.forEach(m => fail(`${where}: ${m}`));
  };

  for (const v of VIEWS) for (const scheme of ['light', 'dark']) {
    const tag = `${v.name} ${scheme}`, { ctx, p } = await open(v, '#build', tag, scheme);
    await drawLoop(p);
    check((await chip(p)) === 'ผังใช้ได้', `${tag}: ลากรางทางหลีกบนจอจริงแล้วผังต้องผ่าน (ได้ "${await chip(p)}": ${await p.$eval('.bld-msg', e => e.textContent)})`);
    await audit(p, v, tag);
    await p.screenshot({ path: path.join(shots, `build-${v.name}-${scheme}.png`) });
    if (scheme === 'light') {
      await p.click('[data-act="table"]');
      const rows = await p.$$eval('.bld-table tbody tr', r => r.length);
      check(rows === 8, `${tag}: ตารางอินเตอร์ล็อกต้องมี 8 เส้นทาง (ได้ ${rows})`);
      await audit(p, v, `${tag} ตาราง`);
      await p.screenshot({ path: path.join(shots, `build-${v.name}-table.png`) });
      await p.click('[data-act="close"]');
    }
    await ctx.close();
  }

  // ผู้เล่นใหม่ งบ 0: ผังทางหลีกมีค่าก่อสร้าง ทดลองเดินรถไม่ได้และบอกว่างบไม่พอ
  {
    const { ctx, p } = await open(VIEWS[0], '#build', 'งบ 0');
    await drawLoop(p, null);
    check((await p.$eval('[data-ref="budget"]', e => e.textContent)).startsWith('งบ 0 · ค่าก่อสร้าง'), 'หัวหน้าโหมดสร้างบอกงบและค่าก่อสร้าง');
    await p.click('[data-act="try"]');
    check((await p.$eval('.bld-card', e => e.textContent)).includes('งบไม่พอ'), 'งบ 0 ทดลองเดินรถผังใหม่ไม่ได้ และบอกว่างบไม่พอ');
    await p.click('[data-act="close"]');
    // วางรหัสของผังตัวเองต้องไม่กลายเป็น "ผังของเพื่อน" ที่เล่นฟรี
    await p.click('[data-act="share"]');
    const own = await p.$eval('[data-ref="link"]', e => e.value);
    await p.fill('[data-ref="paste"]', own); await p.click('[data-act="paste"]');
    await p.click('[data-act="try"]');
    check((await p.$eval('.bld-card', e => e.textContent)).includes('งบไม่พอ'), 'วางรหัสของผังตัวเองแล้วยังต้องจ่ายงบ');
    await p.click('[data-act="close"]');
    // ลากเร็ว (นิ้วกระโดดทีละ 2 ช่อง) และเริ่มลากนอกกริด: รางต้องครบทุกช่อง
    const segs = () => p.evaluate(() => JSON.parse(localStorage.getItem('sj-build-plan')).segs.length);
    const n0 = await segs(), pts = await pointsOf(p, [[1, 0], [3, 0], [5, 0], [-0.6, 7], [0, 7], [2, 7]]);
    await tool(p, 'track');
    await p.mouse.move(...pts[0]); await p.mouse.down(); await p.mouse.move(...pts[1]); await p.mouse.move(...pts[2]); await p.mouse.up();
    check((await segs()) === n0 + 4, `ลากเร็วทีละ 2 ช่องได้ราง 4 ช่อง (ได้ ${(await segs()) - n0})`);
    await p.mouse.move(...pts[3]); await p.mouse.down(); await p.mouse.move(...pts[4]); await p.mouse.move(...pts[5]); await p.mouse.up();
    check((await segs()) === n0 + 6, `เริ่มลากนอกกริดแล้วได้รางตั้งแต่ขอบ (ได้ ${(await segs()) - n0 - 4})`);
    await ctx.close();
  }

  // เดินรถอิสระบนแผ่นสถานี: อัปเกรดใช้งบกลาง แล้วเล่นได้จริง (1180×820)
  {
    const v = VIEWS[2], { ctx, p } = await open(v, '#build', 'เดินรถอิสระ');
    await p.evaluate(t => localStorage.setItem('sj-signalbox-save', t), RICH);
    await p.goto(game.url + '#map/tha-kilen', { waitUntil: 'load' });
    await p.waitForSelector('.freebox', { timeout: 15000 });
    const head = () => p.$eval('#free-title', e => e.textContent);
    check((await head()).includes(`งบคงเหลือ ${16 * 190}`), `แผ่นสถานีบอกงบกลาง (ได้ "${await head()}")`);
    await p.click('.freebox [data-act="era"][data-level="2"]');
    check((await head()).includes(`งบคงเหลือ ${16 * 190 - 550}`) && (await p.$eval('.fr-msg', e => e.textContent)).includes('ใช้งบ 550'), 'อัปเกรดขั้นไฟสีจ่าย 550 จากงบกลาง');
    await audit(p, v, 'แผ่นสถานี');
    await p.screenshot({ path: path.join(shots, 'build-free-sheet.png') });
    await p.click('.freebox [data-act="free"]');
    await p.waitForFunction(() => location.hash === '#free/tha-kilen' && window.__sjApp.play && window.__sjApp.play.g.lv.id === 'free');
    const r = await p.evaluate(() => {
      const P = window.__sjApp.play; P.start();
      for (let n = 0; n < 4000 && P.g.state === 'play'; n++) { for (let m = 0; m < 6; m++) { const t = P.nextTarget(); if (!t) break; P.press(t); } P.step(0.1); }
      return { state: P.g.state, era: P.g.era.name, speed: P.g.lv.speed };
    });
    check(r.state === 'win' && r.speed === 64 && /ไฟสี/.test(r.era), `เดินรถอิสระที่ท่ากิเลนด้วยขั้นไฟสี รถเร็วขึ้นและเล่นจบ (ได้ ${JSON.stringify(r)})`);
    await ctx.close();
  }

  // ทดลองเดินรถ แชร์ และรหัสเสีย (844×390)
  {
    const v = VIEWS[0], { ctx, p } = await open(v, '#build', 'flow');
    await drawLoop(p);
    await p.click('[data-act="try"]');
    await p.click('[data-act="era"][data-era="2"]');
    await p.waitForFunction(() => location.hash === '#build/play' && window.__sjApp.play && window.__sjApp.play.g.L.id === 'custom');
    const r = await p.evaluate(() => {
      const P = window.__sjApp.play; P.start();
      for (let n = 0; n < 4000 && P.g.state === 'play'; n++) { for (let m = 0; m < 6; m++) { const t = P.nextTarget(); if (!t) break; P.press(t); } P.step(0.1); }
      return { state: P.g.state, done: P.g.done };
    });
    check(r.state === 'win' && r.done === 4, `ทดลองเดินรถบนผังที่ลากเองต้องชนะ 4 ขบวน (ได้ ${JSON.stringify(r)})`);
    await p.goBack();
    await p.waitForFunction(() => location.hash === '#build' && document.querySelector('.bld-chip'));
    await p.waitForTimeout(200);
    check((await chip(p)) === 'ผังใช้ได้' && (await p.$eval('.bld-msg', e => e.textContent)).includes('ประแจ 2'), 'กลับจากทดลองเดินรถแล้วผังทางหลีกยังอยู่');
    await p.click('[data-act="share"]');
    const link = await p.$eval('[data-ref="link"]', e => e.value);
    check(/#share=SJ1\.[0-9A-Za-z._-]+$/.test(link) && link.length < 400, `ลิงก์แชร์ผิดรูป: ${link}`);
    await ctx.close();
    const hash = link.slice(link.indexOf('#'));
    const o = await open(VIEWS[3], hash, 'ผู้รับ');
    await o.p.evaluate(() => { try { localStorage.removeItem('sj-build-plan'); } catch { /* ไม่มีที่เก็บ */ } });
    check((await chip(o.p)) === 'ผังใช้ได้' && (await o.p.$eval('.bld-msg', e => e.textContent)).includes('ผังที่ได้รับ'), 'เปิดลิงก์แชร์บนอีกจอแล้วได้ผังเดิมที่ผ่านตัวตรวจ');
    await o.ctx.close();
    const bad = await open(VIEWS[0], hash.replace(/\.([0-9a-z])/, (m, c) => `.${c === '0' ? '1' : '0'}`), 'รหัสถูกแก้');
    check((await bad.p.$eval('.bld-msg', e => e.textContent)).includes('รหัสเสียหรือถูกแก้'), 'รหัสที่ถูกแก้ต้องขึ้นข้อความว่ารหัสเสีย');
    await bad.ctx.close();
  }

  await b.close(); await game.close();
  if (fails.length) { console.error(`\nหน้าจอโหมดสร้างไม่ผ่าน ${fails.length} ข้อ`); process.exit(1); }
  console.log('✓ หน้าจอโหมดสร้างผ่าน ภาพอยู่ที่ test/screenshots/build-*.png');
})().catch(e => { console.error(e); process.exit(1); });
