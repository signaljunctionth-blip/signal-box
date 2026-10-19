// QA WP2: ภาพสถานะเฉพาะของแผง (ป้ายขบวนทับเป้า) ใช้: node test/qa-wp2-probe.js [ขนาด,...]
const L = require('./qa-lib.js');
const { VIEWS, sleep, saveText, stationOf } = L;
const only = process.argv[2] ? process.argv[2].split(',') : null;
const ALL = saveText(Object.fromEntries(L.IDS.map(i => [i, 2])), { 'map-intro-seen': true });
// สถานะที่อยากเห็น: id ภารกิจ, เงื่อนไขหยุด (ตรวจใน evaluate)
const CASES = [
  ['kb-1', 'g.trains.some(t => t.id === 2 && t.state === "arriving" && t.trail.length > 12)'],
  ['np-1', 'g.trains.some(t => t.id === 1 && t.state === "dwell")'],
  ['wp-3', 'g.trains.some(t => t.id === 4 && t.exp && t.trail.length > 40)'],
];
(async () => {
  const env = await L.launch(), R = L.createReport('qa-wp2-probe');
  try {
    for (const v of VIEWS.filter(v => !only || only.includes(v.name))) {
      const o = await L.open(env, v, 'light', R, { hash: '#play/tha-kilen/tk-1', save: ALL }); const p = o.p;
      for (const [id, cond] of CASES) {
        await p.goto(env.game.url + `#play/${stationOf(id)}/${id}`, { waitUntil: 'load' });
        await p.waitForFunction(i => window.__sjApp && window.__sjApp.play && window.__sjApp.play.id === i, id);
        const r = await p.evaluate(c => { const P = window.__sjApp.play, g = P.g; P.start(); P.setManual(true); const done = new Function('g', 'return ' + c);
          for (let i = 0; i < 20000 && g.state === 'play' && !done(g); i++) { const t = P.nextTarget(); if (t) P.press(t); P.step(0.05); }
          return { ok: done(g), t: g.time }; }, cond);
        await sleep(3600); await L.shot(p, `wp2-${id}-${v.name}`); console.log(v.name, id, JSON.stringify(r));
      }
      await o.ctx.close();
    }
  } finally { await env.close(); }
  process.exit(R.done() ? 1 : 0);
})();
