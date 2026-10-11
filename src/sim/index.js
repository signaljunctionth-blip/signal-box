// ตัวจำลองห้องสัญญาณ — โมดูลล้วน ไม่แตะ DOM, canvas, window, localStorage หรือเวลาจริง (รันใน Node ได้)
// วิธีใช้:
//   const { stations, errors } = loadStations([jsonA, jsonB]);
//   const { pack } = loadLevelPack(historyJson, stations, errors);
//   const g = createGame(pack, 0, { onEvent: ev => ... });
//   startGame(g); press(g, { kind: 'signal', id: 'S1' }); step(g, FIXED_DT);
export { prepEdges, posAt } from './geometry.js';
export { STATION_SCHEMA, validateStation, loadStation, loadStations } from './station.js';
export { LEVELS_SCHEMA, loadLevelPack, sched } from './levels.js';
export { FIXED_DT, createGame, startGame, step } from './game.js';
export { walk, release, tapSignal, tapPoint, autoRoute, edgeOccupied, occEdges, nearPoint } from './interlocking.js';
export { TL, spawn, moveTrain, checkCollisions } from './trains.js';
export { press } from './control.js';
export { hint } from './hint.js';
export { createRng } from './rng.js';
export { T as MESSAGES } from './messages.js';
