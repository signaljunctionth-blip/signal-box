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
export { T_OVL, T_CANCEL, sigName, walk, release, tapSignal, tapPoint, autoRoute, setRoute, canRoute, routeConflict, edgeOccupied, occEdges, onTrack, nearPoint, pointBusy, underPoint, overlapPath, overlapFor, overlapAuto, overlapMoves } from './interlocking.js';
export { blockState, blockFree, requestPermit, returnPermit, tokenMode, hasToken, tapToken, acceptToken } from './block.js';
export { TL, spawn, moveTrain, checkCollisions, reverseTrain, graceOf } from './trains.js';
export { press, routeTo, needsDestination } from './control.js';
export { hint, nextTarget, idle, wantedRoute, isStatic, escapeRoutes, trapsItself, cannotReceive } from './hint.js';
export { trackState, trainInfo, snapshot } from './view.js';
export { createRng } from './rng.js';
export { M_PER_UNIT, CARS, KINDS, DEFAULT_KIND, kindLen } from './consists.js';
export { T as MESSAGES, way } from './messages.js';
export { PLAN_VERSION, GRID, MAX_COLS, MAX_ROWS, emptyPlan, starterPlan, normalizePlan, toggleSeg, toggleSignal, setPlatform, planCount, planCost, planToStation, buildPlan } from './editor.js';
export { routeTable, conflictOf } from './route-table.js';
export { encodePlan, decodeShare, shareLink } from './share.js';
export { botPlay, freePlayPack } from './free-play.js';
export { STAR_BONUS, budgetOf, mergeBest, payout, earnedOf, UPGRADES, upgradeOf, upgradeCost, PIECE_PRICE, REFUND, layoutCharge } from './economy.js';
