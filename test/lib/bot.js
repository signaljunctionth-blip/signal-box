// บอทตัวเดียวที่ใช้เล่นทั้งต้นแบบ v2, เกมโมดูลในเบราว์เซอร์ และ src/sim ใน Node (ตรรกะเดียวกับ test/bot-test.js)
// playAll ต้องเป็นฟังก์ชันปิด ไม่อ้างตัวแปรนอกตัวเอง เพราะถูกส่งเป็นข้อความเข้าไปรันในหน้าเว็บด้วย
// B = hook แบบ window.__sjBox: { G, LEVELS, openLevel, tapSignal, tapPoint, autoRoute, step, edgeOccupied }
// from/to = ช่วงด่านที่เล่น (นับจาก 0, ไม่รวม to), maxSteps = จำนวนก้าวสูงสุดต่อด่าน (ก้าวละ 0.05 วินาที)
function playAll(B, from = 0, to = B.LEVELS.length, maxSteps = 8000) {
  const out = [];
  const route = (G, sig, req) => {
    if (G.era.nx) B.autoRoute(sig, req);
    else { for (const [k, pos] of req) if (G.P[k].pos !== pos) B.tapPoint(k); B.tapSignal(sig); }
  };
  for (let lvl = from; lvl < to; lvl++) {
    B.openLevel(lvl); const G = B.G; G.state = 'play';
    if (typeof document !== 'undefined' && document.getElementById('ov')) document.getElementById('ov').hidden = true;
    let steps = 0;
    for (; steps < maxSteps && G.state === 'play'; steps++) {
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
    out.push({ level: lvl + 1, state: G.state, trains: `${G.done}/${G.lv.trains.length}`, pct: Math.round(100 * G.score / G.max), score: G.score, time: G.time, steps });
  }
  return out;
}

// ผลของต้นแบบ v2 (วัดจาก prototype/index.html ด้วย test/bot-test.js) ห้ามแก้ให้เทสต์ผ่าน
const PROTOTYPE_PCT = [100, 100, 100, 100, 100, 100, 100, 76, 79, 100, 79, 86];

module.exports = { playAll, PROTOTYPE_PCT };
