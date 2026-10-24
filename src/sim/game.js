// สถานะเกม 1 ด่าน และการเดินเวลา — ไม่มีตัวแปร global: ทุกอย่างอยู่ในอ็อบเจกต์ g ที่ createGame คืนมา
import { createRng } from './rng.js';
import { TL, spawn, moveTrain, checkCollisions, maxScoreOf } from './trains.js';
import { occEdges, release, edgeOccupied, stepOverlaps, stepCancels } from './interlocking.js';
import { isStatic, escapeRoutes, cannotReceive } from './hint.js';
import { createBlocks, blockState, requestPermit, stepBlocks, tokenMode, askPermit } from './block.js';
import { T } from './messages.js';
import { msg, win, fail, emit } from './events.js';

// สถานีข้างเคียงขอทางได้เมื่อห่วงทั้งสองอันอยู่ในเครื่อง (ตอนว่าง ไม่มีห่วงออกมาค้างที่สถานีเรา)
const requestable = (g, k) => blockState(g, k).state === 'free';
const DEADLOCK_T = 3; // วินาทีที่ทุกอย่างนิ่งและไม่มีเส้นทางใดตั้งได้ ก่อนตัดสินว่าทางตัน

export const FIXED_DT = 1 / 120; // ช่วงเวลามาตรฐานของ 1 ก้าว (ผู้เรียกควรใช้ค่านี้เสมอเพื่อให้ผลซ้ำได้)

// pack = ชุดด่านจาก loadLevelPack, i = ลำดับด่าน (เริ่ม 0)
// opts: { onEvent(ev, g), seed }
export function createGame(pack, i, { onEvent = null, seed = 1 } = {}) {
  const lv = pack.levels[i];
  if (!lv) throw new Error(`ไม่มีด่านลำดับ ${i} ในชุด ${pack.id}`);
  if (lv.error) throw new Error(`ด่าน ${i + 1} เล่นไม่ได้: ${lv.error}`);
  const era = pack.eras[lv.era], L = lv.L;
  const P = {}, S = {};
  for (const k in L.P) P[k] = { ...L.P[k], pos: 'N', lock: null, ovl: null };
  for (const k in L.S) S[k] = { ...L.S[k], aspect: 'R', route: null };
  return {
    i, lv, era, L, E: L.E, P, S,       // ด่าน ยุค ผัง (L, E คงที่) ประแจ (pos, lock) สัญญาณ (aspect, route)
    trains: [], routes: [], lockOf: {}, // ขบวนในผัง, เส้นทางที่ล็อกอยู่, ขอบราง -> เส้นทางที่ล็อก
    overlaps: [], ovlOf: {},            // overlap ที่ค้างอยู่, รางกายภาพ -> overlap ที่จองไว้
    block: createBlocks(L),             // ตอนทางเดี่ยวของแต่ละขา (ว่างเปล่าในผัง schema 1)
    pend: lv.sched.map(sp => sp.i),     // ลำดับขบวนในตารางที่ยังไม่เข้าผัง
    stall: 0, stalled: false, stallSeen: 0, // ตัวเฝ้า: วินาทีที่ไม่มีอะไรขยับ, ส่ง event 'stall' ไปแล้วหรือยัง
    cleared: {}, stuck: 0, lastCode: null, // เวลาที่แต่ละขบวนพ้นจอ, ตัวจับทางตัน, รหัสเหตุผลของ msg ล่าสุด
    time: 0, spawned: 0, done: 0, score: 0, max: lv.sched.reduce((a, sp) => a + maxScoreOf(sp), 0), // คะแนนเต็มตามชนิดขบวน (โดยสาร 150 สินค้า 100)
    state: 'intro',                     // 'intro' | 'play' | 'win' | 'fail'
    nxSel: null, nid: 1, result: null,
    seed, rng: createRng(seed), onEvent,
  };
}

export function startGame(g) {
  if (g.state !== 'intro') return;
  g.state = 'play'; msg(g, g.lv.goal);
}

// เวลาที่ขบวนในตารางควรเข้าผัง (null = ยังไม่รู้ เพราะรอขบวนก่อนหน้าพ้นจอ)
function dueTime(g, sp) {
  if (!sp.after) return sp.at;
  const c = g.cleared[sp.after.train];
  return c === undefined ? null : c + sp.after.delay;
}

// ปล่อยขบวนตามตาราง: ขาที่มีตอนทางเดี่ยวต้องได้ตอนว่างก่อน (ข้อ 4.3), ขาแบบเดิมต่อคิวตามลำดับเหมือนต้นแบบ
function spawnDue(g) {
  let queueBlocked = false; const waitingAt = {};
  for (const idx of [...g.pend]) {
    const sp = g.lv.sched[idx], due = dueTime(g, sp), go = () => { g.pend = g.pend.filter(x => x !== idx); return spawn(g, sp.plat, sp.entry, sp); };
    if (sp.origin !== null) { // ขบวนต้นทาง: ตั้งที่ทางจอดเมื่อถึงเวลาและทางว่าง
      const e = g.L.platEdge[sp.origin];
      if (due !== null && g.time >= due && !edgeOccupied(g, e) && !g.lockOf[e] && !g.ovlOf[e]) go();
      continue;
    }
    const b = sp.from !== null ? g.block[sp.from] : null;
    if (!b) {
      if (queueBlocked) continue;
      if (due !== null && g.time >= due && !g.trains.some(t => t.edge === sp.entry && t.s < (t.len || TL) + 24)) go(); else queueBlocked = true;
      continue;
    }
    if (b.in === idx) { if (g.time >= b.inAt) { b.in = null; b.inTrain = go(); if (tokenMode(g)) b.inTrain.token = sp.from; } continue; }
    if (due === null || waitingAt[sp.from]) { waitingAt[sp.from] = true; continue; }
    waitingAt[sp.from] = true;
    if (g.time < due - b.runTime) continue;
    // ด่านที่มีห่วง: สถานีข้างเคียงขอทางสะดวก ผู้เล่นเป็นคนให้ทางเอง (ไม่กักแทนผู้เล่น ให้ทางผิดจังหวะก็ติดเอง)
    if (tokenMode(g)) { if (requestable(g, sp.from)) askPermit(g, sp.from, idx); continue; }
    // สถานีข้างเคียงขอทาง: ได้ทันที = มาตรงเวลา, ต้องรอ = ถูกกักไว้ แล้วใช้เวลาวิ่ง runTime หลังตอนว่าง
    if (cannotReceive(g, sp, sp.from)) { b.held[idx] = true; continue; }
    if (!requestPermit(g, sp.from, 'in', idx, b.held[idx] ? g.time + b.runTime : Math.max(due, g.time))) b.held[idx] = true;
  }
}

// ทางตัน (ข้อ 3.5): ทุกอย่างหยุดนิ่ง (isStatic) และไม่มีเส้นทางที่เป็นประโยชน์เหลือเลย
// เส้นทางที่ตั้งได้แต่พาขบวนออกผิดขา หรือขังตัวเอง ไม่นับเป็นทางออก (ดู escapeRoutes ใน hint.js)
// ใช้เงื่อนไขเดียวกันทุกยุค: ยุคไม่มีอินเตอร์ล็อกผู้เล่นยังเปิดเสาได้ แต่ทางที่เหลือคือทางที่ปล่อยไปแล้วชน จึงแจ้งว่าติดขัดแทนการค้างเงียบ
const deadlocked = g => isStatic(g) && !escapeRoutes(g).length;
const STALL_T = 45; // วินาทีที่ไม่มีขบวนขยับและไม่มีขบวนใหม่ ก่อนส่ง event 'stall' (ไม่ตัดสินแพ้)

// เดินเวลา dt วินาที (ไม่อ่านนาฬิกาจริง) ไม่ทำอะไรถ้าเกมไม่ได้อยู่ในสถานะ 'play'
export function step(g, dt = FIXED_DT) {
  if (g.state !== 'play') return;
  g.time += dt;
  if (g.pend.length) spawnDue(g);
  for (const t of [...g.trains]) { moveTrain(g, t, dt); if (g.state !== 'play') return; }
  for (const r of [...g.routes]) if (r.passed) {
    const occ = g.trains.includes(r.train) ? occEdges(r.train) : new Set();
    if (!r.edges.slice(0, -1).some(e => occ.has(e))) release(g, r);
  }
  stepOverlaps(g, dt);
  stepCancels(g);
  stepBlocks(g, dt);
  checkCollisions(g);
  if (g.state === 'play' && g.L.bidir) {
    g.stuck = deadlocked(g) ? g.stuck + dt : 0;
    if (g.stuck >= DEADLOCK_T) g.era.interlock ? fail(g, T.failDeadlock(), T.failDeadlockWhy(), 'DEADLOCK') : fail(g, T.failStuck(), T.failStuckWhy(), 'DEADLOCK');
    // ตัวเฝ้าเสริม: นิ่งนานผิดปกติแต่ยังไม่เข้าเงื่อนไขทางตัน (เช่น เปิดเส้นทางค้างไว้) แจ้ง UI ให้ขึ้นคำใบ้หรือปุ่มเริ่มใหม่
    const moving = g.trains.some(t => !t.stopped) || g.spawned !== g.stallSeen;
    g.stallSeen = g.spawned;
    if (moving || !g.trains.length) { g.stall = 0; g.stalled = false; }
    else if ((g.stall += dt) >= STALL_T && !g.stalled) { g.stalled = true; emit(g, { type: 'stall', seconds: STALL_T }); }
  }
  if (g.state === 'play' && g.spawned === g.lv.trains.length && g.trains.length === 0) win(g);
}
