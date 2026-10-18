// hook รูปเดียวกับ window.__sjBox ของต้นแบบ แต่ต่อกับ src/sim ตรง ๆ ใน Node (ไม่มีเบราว์เซอร์)
// sim = โมดูล src/sim/index.js, pack = ชุดด่านจาก loadLevelPack, events = อาร์เรย์เก็บ event (ไม่ใส่ก็ได้)
function nodeHook(sim, pack, events) {
  let G = null;
  return {
    get G() { return G; }, LEVELS: pack.levels,
    openLevel(i) { G = sim.createGame(pack, i, { onEvent: ev => events && events.push(ev) }); },
    tapSignal: id => sim.tapSignal(G, id), tapPoint: k => sim.tapPoint(G, k), autoRoute: (s, req) => sim.autoRoute(G, s, req),
    step: dt => sim.step(G, dt), edgeOccupied: id => sim.edgeOccupied(G, id),
  };
}
module.exports = { nodeHook };
