// QA: หน้าแรกใหม่ 4 ขนาด x สว่าง/มืด (ปิด/เปิดแผ่นเครดิต) + รายการสายรถไฟบนแผนที่ + ข้อความแจ้งบนแผง
const L = require('./qa-lib.js');
(async () => {
  const env = await L.launch(), R = L.createReport('qa-home');
  for (const v of L.VIEWS) for (const scheme of ['light', 'dark']) {
    const tag = `${v.name}-${scheme}`, { ctx, p } = await L.open(env, v, scheme, R, { tag });
    const m = await p.evaluate(() => { const s = document.getElementById('s-home'); return { sh: s.scrollHeight, ch: s.clientHeight, sw: s.scrollWidth, cw: s.clientWidth, disc: (() => { const d = document.getElementById('disclaimer').getBoundingClientRect(); return [d.top, d.bottom, d.left, d.right].map(Math.round); })() }; });
    if (m.sh > m.ch + 1 || m.sw > m.cw + 1) R.fail(`${tag}: หน้าแรกต้องเลื่อน ${JSON.stringify(m)}`);
    await L.audit(p, v, R, `${tag} หน้าแรก`); await L.shot(p, `home-${tag}`);
    await L.tapEl(p, v, '.credits summary', R, `${tag} ปุ่มเครดิต`); await L.sleep(250);
    const c = await p.evaluate(() => ({ open: document.querySelector('.credits').open, links: [...document.querySelectorAll('.credits-panel a')].map(a => a.href), hist: !!document.querySelector('#b-history') }));
    R.check(c.open && c.links.includes('https://www.openstreetmap.org/copyright') && c.links.some(h => h.includes('naturalearthdata')) && c.links.some(h => h.includes('odbl')) && c.hist, `${tag}: แผ่นเครดิต ${JSON.stringify(c)}`);
    await L.audit(p, v, R, `${tag} แผ่นเครดิต`); await L.shot(p, `home-credits-${tag}`);
    await L.tapEl(p, v, '.credits [data-act="close-credits"]', R, `${tag} ปิดเครดิต`); await L.sleep(200);
    R.check(!(await p.evaluate(() => document.querySelector('.credits').open)), `${tag}: ปิดแผ่นเครดิตไม่ได้`);
    if (scheme === 'light' && v.width < 1000) {
      await L.tapEl(p, v, '#b-map', R, tag); await p.waitForFunction(() => window.__sjApp.map); await L.mapSettled(p); await L.sleep(2600); await L.mapSettled(p);
      await L.tapEl(p, v, '.lines-toggle', R, `${tag} สายรถไฟ`); await L.sleep(300);
      await L.audit(p, v, R, `${tag} รายการสายเปิด`); await L.shot(p, `map-lines-${tag}`);
    }
    await ctx.close();
  }
  await env.close(); process.exit(R.done() ? 1 : 0);
})();
