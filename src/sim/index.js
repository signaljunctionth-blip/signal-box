// ตัวจำลองห้องสัญญาณ — โมดูลล้วน ไม่แตะ DOM, canvas, window, localStorage หรือเวลาจริง (รันใน Node ได้)
// วิธีใช้:
//   const { stations, errors } = loadStations([jsonA, jsonB]);
//   const { pack } = loadLevelPack(historyJson, stations, errors);
//   const g = createGame(pack, 0, { onEvent: ev => ... });
//   startGame(g); press(g, { kind: 'signal', id: 'S1' }); step(g, FIXED_DT);
//
// อ่านสถานะเพื่อวาด (ห้ามแก้): g.L ผังคงที่ (E ขอบราง, P ประแจ, S สัญญาณ, portals ขา, sections ตอนราง, roles, routes)
//   g.P[k].pos/lock/ovl, g.S[k].aspect/route, g.trains[], g.lockOf, g.ovlOf, blockState(g, portal), trackState(g, track)
// เหตุการณ์ออกทาง onEvent: msg (มี code เมื่อปฏิเสธ), score, fail (มี code), win, train, block — ดู events.js
// ผังสองทิศ (schema 2): ราง k มีขอบ k (ทิศ E) และ k~ (ทิศ W) ใน g.E วาดรางจาก g.L.tracks หรือขอบที่ dir === 'E' ก็พอ
export { prepEdges, posAt } from './geometry.js';
export { STATION_SCHEMA, STATION_SCHEMAS, validateStation, loadStation, loadStations } from './station.js';
export { STOP_GAP, FOUL_CLEAR, REV } from './station2.js';
export { LEVELS_SCHEMA, LEVELS_SCHEMAS, loadLevelPack, sched, levelKey, unlockState } from './levels.js';
export { FIXED_DT, createGame, startGame, step } from './game.js';
export { T_OVL, sigName, walk, release, tapSignal, tapPoint, autoRoute, setRoute, canRoute, routeConflict, edgeOccupied, occEdges, onTrack, nearPoint, pointBusy, underPoint, overlapPath, overlapFor, overlapAuto, overlapMoves } from './interlocking.js';
export { blockState, blockFree, requestPermit, returnPermit } from './block.js';
export { TL, spawn, moveTrain, checkCollisions, reverseTrain, graceOf } from './trains.js';
export { press, routeTo, needsDestination } from './control.js';
export { hint, nextTarget, wantedRoute, isStatic, escapeRoutes, trapsItself } from './hint.js';
export { trackState, trainInfo, snapshot } from './view.js';
export { createRng } from './rng.js';
export { T as MESSAGES, way } from './messages.js';
