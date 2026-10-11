// บอทเล่นทุกด่านอัตโนมัติ ตรวจว่าทุกด่านชนะได้และไม่มี error
// ใช้: npm test   (ต้องมี playwright: npm i -D playwright && npx playwright install chromium)
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('file://' + path.resolve(__dirname, '../prototype/index.html'));
  await p.waitForTimeout(400);
  const res = await p.evaluate(() => {
    const B = window.__sjBox, out = [];
    const route = (G, sig, req) => {
      if (G.era.nx) B.autoRoute(sig, req);
      else { for (const [k, pos] of req) if (G.P[k].pos !== pos) B.tapPoint(k); B.tapSignal(sig); }
    };
    for (let lvl = 0; lvl < B.LEVELS.length; lvl++) {
      B.openLevel(lvl); const G = B.G; G.state = 'play'; document.getElementById('ov').hidden = true;
      for (let i = 0; i < 8000 && G.state === 'play'; i++) {
        for (const t of [...G.trains].sort((a, b) => a.id - b.id)) {
          const e = G.E[t.edge];
          if (t.state === 'ready' || (t.state === 'through' && e.plat)) {
            const s = 'T' + e.plat; if (G.S[s].aspect === 'R') route(G, s, G.L.REQ[s]);
          }
          if (t.edge === 'in' && t.stopped && G.S.S1.aspect === 'R' && !G.trains.some(o => o !== t && o.edge === 'in' && o.s > t.s)) {
            let k = t.plat;
            if (t.exp) k = G.L.plats.find(n => !B.edgeOccupied('p' + n) && !G.lockOf['p' + n]) || 0;
            if (k && !B.edgeOccupied('p' + k)) route(G, 'S1', G.L.REQ.S1[k]);
          }
        }
        B.step(0.05);
      }
      out.push({ level: lvl + 1, state: G.state, trains: `${G.done}/${G.lv.trains.length}`, pct: Math.round(100 * G.score / G.max) });
    }
    return out;
  });
  console.table(res);
  const bad = res.filter(r => r.state !== 'win');
  console.log('page errors:', errs.length ? errs : 'ไม่มี');
  await b.close();
  if (bad.length || errs.length) { console.error('✗ มีด่านที่บอทเล่นไม่ผ่าน หรือมี error'); process.exit(1); }
  console.log('✓ ผ่านทุกด่าน');
})();
