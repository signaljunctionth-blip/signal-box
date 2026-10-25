// ตรวจเจาะจุด WP11 (ขบวนหลายชนิด + หินโรยทาง) — ใช้: node test/qa-wp11.js (ต้อง build ก่อน หรือตั้ง SJ_URL)
// งบการวาดหนองปลาดุกตอนมีขบวนยาวหลายขบวนพร้อมกัน ทุกระดับคุณภาพ, ไฟหน้ารถพลบค่ำ, ภาพหน้าจอขบวนแต่ละชนิด
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { serveGame } = require('./lib/serve.js');

const shots = path.join(__dirname, 'screenshots');
const fails = [];
const check = (ok, m) => { if (!ok) { fails.push(m); console.error('  ✗ ' + m); } return ok; };
const note = m => console.log('  - ' + m);
// งบระดับกลางตามชุดงาน WP11 (ระดับประหยัดที่หนองปลาดุกเกิน 50/90,000 มาตั้งแต่ก่อน WP11 จึงบันทึกค่าไว้ดูแนวโน้มเท่านั้น)
const BUDGET = { mid: [90, 180000] };

async function run(b, game, id, scheme, minTrains) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, colorScheme: scheme });
  const p = await ctx.newPage(), errs = [], tag = `${id} ${scheme}`;
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
  await p.goto(game.url + '#dev/namtok/' + id, { waitUntil: 'load' });
  const up = await p.waitForFunction(() => { const v = window.__sjApp && window.__sjApp.play && window.__sjApp.play.view3d; const s = v && v.active && v.stats(); return s && s.calls > 0; }, null, { timeout: 60000 }).then(() => true).catch(() => false);
  if (!check(up, `${tag}: ฉาก 3 มิติไม่ขึ้น`)) { await ctx.close(); return; }
  const kinds = await p.evaluate(n => { const a = window.__sjApp.play; a.start(); a.setManual(true); let best = null;
    for (let i = 0; i < 1500 && a.g.state === 'play'; i++) { const t = a.nextTarget(); if (t) a.press(t); a.step(0.1); if (a.g.trains.length >= n && a.g.trains.every(t => t.trail.length > 40)) { best = a.g.trains.map(t => t.kind); break; } }
    return best; }, minTrains);
  check(kinds, `${tag}: ไม่มีขบวนพร้อมกัน ${minTrains} ขบวน`);
  for (const tier of ['high', 'mid', 'low']) {
    const s = await p.evaluate(async t => { const v = window.__sjApp.play.view3d; v.setTier(t); for (let k = 0; k < 3; k++) { v.touch(); await new Promise(r => setTimeout(r, 350)); } return v.stats(true); }, tier);
    note(`${tag} ${tier}: ขบวน ${s.trains} ตัวรถ ${s.cars} ไฟหน้า ${s.lamps} calls ${s.calls} tris ${s.tris}`);
    if (BUDGET[tier]) check(s.calls <= BUDGET[tier][0] && s.tris <= BUDGET[tier][1], `${tag}: งบระดับ ${tier} เกิน calls ${s.calls} tris ${s.tris}`);
    check(scheme === 'dark' ? s.lamps === s.trains : s.lamps === 0, `${tag} ${tier}: ไฟหน้า ${s.lamps}/${s.trains}`);
    if (tier === 'mid') await p.screenshot({ path: path.join(shots, `wp11-${id}-${scheme}-1280x800.png`) });
  }
  check(!errs.length, `${tag}: error ${errs.slice(0, 3).join(' | ')}`);
  await ctx.close();
}

(async () => {
  fs.mkdirSync(shots, { recursive: true });
  const game = await serveGame(), b = await chromium.launch();
  try {
    await run(b, game, 'np-3', 'light', 3);
    await run(b, game, 'np-2', 'dark', 2);
    await run(b, game, 'kb-2', 'light', 2);
  } finally { await b.close(); await game.close(); }
  console.log(fails.length ? `\nไม่ผ่าน ${fails.length} ข้อ` : '\nผ่านทั้งหมด');
  process.exit(fails.length ? 1 : 0);
})();
