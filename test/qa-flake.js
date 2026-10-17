// QA: พยายามทำซ้ำ "page error: a is not a function" ที่เคยเกิดครั้งเดียวใน test:build
// ทำลำดับเดียวกับ test/build-test.js ซ้ำหลายรอบ (หน่วงเวลาสุ่ม, หลายหน้าพร้อมกัน, CPU ช้าลง) และเก็บ stack ของ error
// ใช้: node test/qa-flake.js [รอบ=40] [ขนาน=6]
const { launch, sleep } = require('./qa-lib.js');
const rounds = +process.argv[2] || 40, par = +process.argv[3] || 6;

(async () => {
  const env = await launch(), base = env.game.url, errs = [];
  let n = 0;
  const one = async i => {
    const ctx = await env.b.newContext({ viewport: { width: 844, height: 390 } });
    for (const page of ['', 'history.html', 'prototype/']) {
      const p = await ctx.newPage();
      if (i % 3 === 0) { const c = await ctx.newCDPSession(p); await c.send('Emulation.setCPUThrottlingRate', { rate: 6 }); }
      p.on('pageerror', e => errs.push({ i, page, url: p.url(), msg: e.message, stack: e.stack }));
      p.on('console', m => { if (m.type() === 'error') errs.push({ i, page, url: p.url(), msg: 'console: ' + m.text() }); });
      try {
        await p.goto(base + page, { waitUntil: i % 2 ? 'load' : 'commit' });
        if (i % 4 === 1) await sleep(Math.random() * 60);
        if (page === '') {
          await Promise.all([p.waitForURL(base + 'history.html'), p.click('#b-history')]);
          if (i % 2) await p.waitForFunction(() => !!window.__sjBox);
          await p.goBack({ waitUntil: i % 2 ? 'load' : 'commit' });
          await Promise.all([p.waitForURL(base + 'prototype/'), p.click('#b-proto')]);
          if (i % 5 === 0) { await p.goBack({ waitUntil: 'commit' }); await p.click('#b-map').catch(() => {}); await sleep(Math.random() * 80); await p.goBack().catch(() => {}); }
        }
        await p.waitForTimeout(Math.random() * 300);
      } catch (e) { errs.push({ i, page, msg: 'driver: ' + e.message.split('\n')[0] }); }
      await p.close();
    }
    await ctx.close(); n++;
  };
  for (let r = 0; r < rounds; r += par) await Promise.all(Array.from({ length: Math.min(par, rounds - r) }, (_, k) => one(r + k)));
  await env.close();
  console.log(`รอบที่ทำ ${n} พบ error ${errs.length}`);
  for (const e of errs.slice(0, 12)) console.log(JSON.stringify(e, null, 1));
})();
