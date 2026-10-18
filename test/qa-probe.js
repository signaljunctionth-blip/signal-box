// QA: ตรวจเจาะ 2 เรื่อง — (1) แถบ stall บังเป้าแตะบนแผงไหม (2) ปุ่ม Esc หลังกด "เล่นต่อ"
const L = require('./qa-lib.js');
(async () => {
  const env = await L.launch(), R = L.createReport('qa-probe');
  const FULL = L.saveText(Object.fromEntries(L.IDS.map(i => [i, 3])), { 'map-intro-seen': true });
  for (const v of L.VIEWS) for (const id of L.IDS) {
    const { ctx, p } = await L.open(env, v, 'light', R, { tag: `${v.name} ${id}`, save: FULL, hash: `#play/${L.stationOf(id)}/${id}` });
    await L.startTap(p, v, R, id);
    const r = await p.evaluate(() => {
      const P = window.__sjApp.play, g = P.g; P.setManual(true);
      const bar = document.querySelector('.pl-stall'), out = { blocked: [], stalls: 0, state: '' };
      // เล่นตามคำใบ้แต่หน่วง 50 วิ ก่อนแตะทุกครั้ง: ทุกครั้งที่แถบขึ้น ดูว่าเป้าตามคำใบ้อยู่ใต้แถบไหม
      for (let i = 0; i < 60 && g.state === 'play'; i++) {
        let t = P.nextTarget(); for (let n = 0; !t && n < 200 && g.state === 'play'; n++) { P.step(0.05); t = P.nextTarget(); }
        if (!t) break; P.step(50); if (g.state !== 'play') break; t = P.nextTarget(); if (!t) continue;
        if (!bar.hidden) { out.stalls++; const c = P.targetClient(t), top = document.elementFromPoint(c.x, c.y); if (top && top.closest('.pl-stall')) { const b = bar.getBoundingClientRect(); out.blocked.push(`${t.kind}:${t.id ?? t.no} ที่ (${c.x.toFixed(0)},${c.y.toFixed(0)}) แถบ ${[b.left, b.top, b.right, b.bottom].map(n => n.toFixed(0))}`); } }
        P.press(t);
      }
      out.state = g.state + (g.result && g.result.code ? ' ' + g.result.code : ''); return out;
    });
    if (r.blocked.length) { R.fail(`${v.name} ${id}: แถบ stall บังเป้าที่คำใบ้ชี้ ${r.blocked.length}/${r.stalls} ครั้ง เช่น ${r.blocked[0]}`); }
    else console.log(`  ${v.name} ${id}: แถบขึ้น ${r.stalls} ครั้ง ไม่บังเป้า (${r.state})`);
    await ctx.close();
  }
  // ภาพตัวอย่าง: wp-1 ที่ 844x390 ตอนแถบบังเป้า แล้วแตะจริง
  { const v = L.VIEWS[0], { ctx, p } = await L.open(env, v, 'light', R, { tag: 'stall-block', save: FULL, hash: '#play/wang-pho/wp-1' });
    await L.startTap(p, v, R, 'wp-1');
    const c = await p.evaluate(() => { const P = window.__sjApp.play, g = P.g; P.setManual(true); const bar = document.querySelector('.pl-stall');
      for (let i = 0; i < 60 && g.state === 'play'; i++) { let t = P.nextTarget(); for (let n = 0; !t && n < 200; n++) { P.step(0.05); t = P.nextTarget(); } if (!t) break; P.step(50); t = P.nextTarget(); if (!t) continue; const c = P.targetClient(t), top = document.elementFromPoint(c.x, c.y); if (!bar.hidden && top && top.closest('.pl-stall')) return { t, c, time: g.time }; P.press(t); } return null; });
    if (c) { await L.sleep(150); await L.shot(p, 'stall-blocks-target-wp-1-844x390'); await L.tapXY(p, v, c.c.x, c.c.y); await L.sleep(100); const after = await p.evaluate(() => ({ next: window.__sjApp.play.nextTarget(), bar: !document.querySelector('.pl-stall').hidden })); console.log(`  wp-1 844x390: เวลา ${c.time.toFixed(0)} คำใบ้ ${JSON.stringify(c.t)} แตะจริงที่ (${c.c.x.toFixed(0)},${c.c.y.toFixed(0)}) -> คำใบ้หลังแตะ ${JSON.stringify(after.next)} แถบยังอยู่ ${after.bar}`); }
    await ctx.close(); }
  // Esc
  { const v = L.VIEWS[3], { ctx, p } = await L.open(env, v, 'light', R, { tag: 'esc', hash: '#play/tha-kilen/tk-1' });
    await L.tapEl(p, v, '.pl-card [data-act="start"]', R, 'esc'); await L.sleep(200);
    const paused = () => p.evaluate(() => ({ paused: window.__sjApp.play.paused, focus: document.activeElement.tagName + '.' + document.activeElement.className }));
    await p.keyboard.press('Escape'); await L.sleep(100); const a = await paused();
    await p.keyboard.press('Escape'); await L.sleep(100); const b = await paused();
    await p.click('.pl-bar [data-act="menu"]'); await L.sleep(100); await p.click('.pl-card [data-act="resume"]'); await L.sleep(100); const c0 = await paused();
    await p.keyboard.press('Escape'); await L.sleep(100); const c = await paused();
    await p.keyboard.press('p'); await L.sleep(100); const d = await paused();
    console.log(`  Esc หลังเริ่ม: ${JSON.stringify(a)} | Esc อีกครั้ง: ${JSON.stringify(b)} | หลังกดปุ่มพัก->เล่นต่อ: ${JSON.stringify(c0)} | แล้ว Esc: ${JSON.stringify(c)} | แล้ว p: ${JSON.stringify(d)}`);
    if (!c.paused) R.fail(`Esc/P ไม่ทำงานหลังกดปุ่ม "เล่นต่อ" ด้วยเมาส์ (โฟกัสอยู่ที่ ${c0.focus})`);
    await ctx.close(); }
  await env.close(); process.exit(R.done() ? 1 : 0);
})();
