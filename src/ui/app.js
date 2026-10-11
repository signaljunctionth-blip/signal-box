// ประกอบเกมโหมดประวัติศาสตร์: หน้าเลือกด่าน + หน้าเล่น + hook สำหรับบอท
import { tapSignal, tapPoint, autoRoute, step, edgeOccupied, press, hint, startGame } from '../sim/index.js';
import { hitTest } from '../render/hit.js';
import { createHome, renderLoadError } from './home.js';
import { createPlay } from './play.js';

const $ = id => document.getElementById(id);

export function startApp({ pack, save }) {
  const showHome = () => { home.render(); $('home').hidden = false; $('play').hidden = true; };
  const play = createPlay({ pack, save, onHome: showHome });
  const home = createHome({ pack, save, onOpen: i => play.open(i) });
  home.render();

  // hook ของบอท: รูปเดียวกับ window.__sjBox ของต้นแบบ v2 (G, LEVELS, tapSignal, tapPoint, autoRoute, step, openLevel, edgeOccupied)
  // ของใหม่: start, press, hint, hitTest, toClient (พิกัดผัง -> จุดบนจอ สำหรับบอทที่แตะจริง), pack, save
  return {
    get G() { return play.G; }, LEVELS: pack.levels, pack, save,
    openLevel: i => play.open(i),
    start: () => startGame(play.G),
    tapSignal: id => tapSignal(play.G, id), tapPoint: k => tapPoint(play.G, k), autoRoute: (sig, req) => autoRoute(play.G, sig, req),
    press: target => press(play.G, target), step: dt => step(play.G, dt),
    edgeOccupied: id => edgeOccupied(play.G, id), hint: () => hint(play.G),
    hitTest: (x, y) => hitTest(play.G, x, y), toClient: (x, y) => play.view.toClient(x, y),
  };
}

export { renderLoadError };
