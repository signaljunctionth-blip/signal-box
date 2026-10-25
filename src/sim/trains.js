// ขบวนรถ: เกิด, วิ่งตามขอบราง, หยุดหน้าสัญญาณ, จอดชานชาลา, ตกราง, ชนกัน
import { posAt } from './geometry.js';
import { T, way } from './messages.js';
import { msg, fail, addScore, emit } from './events.js';
import { TL, STOP_GAP } from './station2.js';
import { DEFAULT_KIND } from './consists.js';
import { blockEnter, blockLeave, tokenMode, hasToken, takeToken } from './block.js';
import { walk } from './interlocking.js';

export { TL };
// วินาทีที่รอได้ก่อนเริ่มเสียคะแนน: ค่าเดิมของต้นแบบ 6 (รอเสาเข้า) / 4 (พร้อมออก) ด่านกำหนดเองได้ด้วย waitGrace: เลขเดียว หรือ { entry, ready }
export function graceOf(g, t) {
  const w = g.lv.waitGrace, ready = t.state === 'ready';
  return w === undefined ? (ready ? 4 : 6) : typeof w === 'number' ? w : ready ? w.ready : w.entry;
}
const DWELL = 2.5; // วินาทีที่ขบวนธรรมดาจอดรับผู้โดยสาร

// plat = ชานชาลาปลายทาง, 0 = ขบวนด่วนผ่าน; entry = ขอบรางขาเข้า
// เลขขบวน (id) = ลำดับในตารางขบวน เริ่มที่ 1
// sp = แถวในตารางขบวนที่แปลงแล้ว (lv.sched) ถ้ามี: กำหนดขาออก (exit) เวลาจอด (dwell) ทางที่ด่วนควรผ่าน (via) ขบวนต้นทาง (origin) และชนิดขบวน (kind, len)
export function spawn(g, plat, entry = g.L.entry, sp = null) {
  const t = { id: sp ? sp.i + 1 : g.nid++, plat, exp: sp ? sp.exp : plat === 0, entry, edge: entry, s: 0, state: (sp ? sp.exp : plat === 0) ? 'through' : 'arriving',
    dwell: 0, wait: 0, stopped: false, delayed: false, trail: [],
    exit: sp ? sp.exit : null, via: sp ? sp.via : null, dwellT: sp ? sp.dwell : DWELL, origin: false,
    kind: sp ? sp.kind : DEFAULT_KIND, len: sp ? sp.len : TL };
  if (sp && sp.origin !== null) { // ขบวนต้นทาง: ตั้งอยู่ที่ทางจอดแล้ว หันไปทางที่ไปถึงขาออกได้ รอครบเวลาจอดแล้วพร้อมออก
    const fw = g.L.platEdge[sp.origin], bw = g.E[fw].rev, want = sp.exit ? [sp.exit] : g.L.exits;
    const edge = [fw, bw].find(k => k && want.some(x => g.L.reach[k].has(x))) || fw, e = g.E[edge];
    Object.assign(t, { entry: null, edge, s: e.len - STOP_GAP, state: 'dwell', dwell: sp.dwell, origin: true, stopped: true });
    for (let d = t.len; d >= 0; d -= 0.8) { const p = posAt(e, t.s - d); t.trail.push({ x: p.x, y: p.y, e: edge }); }
    msg(g, T.originReady(t.id, sp.origin));
  } else { const p = posAt(g.E[entry], 0); t.trail.push({ x: p.x, y: p.y, e: entry }); }
  g.trains.push(t); g.spawned++;
  emit(g, { type: 'train', what: 'spawn', train: t.id });
  return t;
}

// กลับหัว: ขบวนที่จอดอยู่ในรางเดียวทั้งขบวน สลับไปใช้ขอบรางทิศตรงข้าม (หัวใหม่ = ท้ายเดิม)
export function reverseTrain(g, t) {
  const e = g.E[t.edge], rev = e.rev;
  if (!rev || t.trail.some(p => g.E[p.e].track !== e.track)) return false;
  t.s = e.len - Math.max(0, t.s - t.len); t.edge = rev;
  t.trail = t.trail.reverse().map(p => ({ x: p.x, y: p.y, e: rev }));
  msg(g, T.reversed(t.id)); emit(g, { type: 'train', what: 'reverse', train: t.id });
  return true;
}
// ขบวนพร้อมออก: ถ้าวิ่งต่อทิศเดิมไปไม่ถึงขาออกที่ต้องไป แต่ทิศตรงข้ามไปถึง ให้กลับหัว (สถานีปลายทาง ทางตัน หรือ from = to)
function turnIfNeeded(g, t) {
  const R = g.L.reach, rev = g.E[t.edge].rev, want = t.exit ? [t.exit] : g.L.exits;
  if (rev && !want.some(x => R[t.edge].has(x)) && want.some(x => R[rev].has(x))) reverseTrain(g, t);
}

// ด่านที่มีห่วง: ขาที่มีตอนทางเดี่ยวซึ่งทางจากเสา sig พาไปตามท่าประแจตอนนี้ (null = ไม่ได้ออกไปตอนทางเดี่ยว)
// ทางข้างหน้ายังไม่ครบ (ประแจด้านหลังยังไม่ตั้ง) = ถือว่าไปขาออกตามตารางของขบวน t ไว้ก่อน ผู้เล่นอาจสับประแจทีหลังขณะขบวนวิ่ง
function exitBlockOf(g, sig, t = null) {
  const w = walk(g, sig), e = g.E[w.edges[w.edges.length - 1]];
  if (e && e.exit && e.portal && g.block[e.portal]) return e.portal;
  if (w.ok || !t || !t.exit) return null;
  const k = Object.keys(g.L.portals).find(x => g.L.portals[x].exit === t.exit);
  return k && g.block[k] ? k : null;
}

// ระยะบนขอบปัจจุบันที่ขบวนต้องหยุด (Infinity = วิ่งต่อได้)
function stopLimit(g, t) {
  const E = g.E, e = E[t.edge]; let lim = Infinity;
  if (e.sig) {
    const s = g.S[e.sig];
    if (s.aspect === 'R' || (e.plat && t.state === 'arriving')) lim = e.len - 6;
    // ด่านที่มีห่วง: คนขับไม่ผ่านเสาที่พาออกไปตอนทางเดี่ยวถ้ายังไม่มีห่วงของตอนนั้น (ยุคไม่มีอินเตอร์ล็อกเปิดเสาได้เสมอ จึงตรวจที่ตัวขบวนอีกชั้น)
    else if (tokenMode(g)) {
      const k = exitBlockOf(g, e.sig, t);
      if (k && !hasToken(g, k)) { lim = e.len - 6; if (t.noToken !== k && t.s >= e.len - 40) { t.noToken = k; msg(g, T.tokenNeededDriver(g.L.portals[k].label), 'bad', 'TOKEN_NEEDED'); } }
    }
  }
  if (e.plat && t.state === 'dwell') lim = t.s;
  if (e.buffer) lim = Math.min(lim, e.len - STOP_GAP); // ทางตัน
  if (t.edge === t.entry) for (const o of g.trains) { // ต่อคิวรอนอกสถานี ไม่ชนท้ายคันหน้า
    if (o === t) continue;
    if (o.edge === t.entry && o.s > t.s) lim = Math.min(lim, o.s - o.len - 14);
    if (o.edge === E[t.entry].next) lim = Math.min(lim, E[t.entry].len + o.s - o.len - 14);
  }
  return lim;
}

// หัวขบวนพ้นปลายขอบ: คืน false ถ้าขบวนออกจากผังหรือตกราง
function passEdge(g, t) {
  const e = g.E[t.edge];
  if (e.sig) {
    // ด่านที่มีห่วง: หัวขบวนผ่านเสาที่พาออกไปตอนทางเดี่ยว = คนขับรับห่วงไป ตอนเป็น occupied(out) ตั้งแต่ตอนนี้ (ข้อ 4.2)
    if (tokenMode(g)) { const k = exitBlockOf(g, e.sig, t); if (k) takeToken(g, k, t); }
    const s = g.S[e.sig]; s.aspect = 'R';
    if (s.route) { s.route.passed = true; s.route.train = t; s.route = null; }
    if (e.plat) t.state = 'leaving';
  }
  if (e.exit) {
    g.trains = g.trains.filter(x => x !== t); g.done++; g.cleared[t.id] = g.time;
    emit(g, { type: 'train', what: 'exit', train: t.id });
    if (e.portal) blockLeave(g, e.portal, t);
    if (g.state !== 'play') return false;
    if (t.exit && t.exit !== t.edge) { // ออกผิดขา: ไม่ได้คะแนนขาออก
      addScore(g, t.exp ? 20 : 0, 'wrong-exit', t);
      const P = g.L.portals, want = Object.values(P).find(p => p.exit === t.exit);
      msg(g, T.wrongExit(t.id, want ? want.label : '?', e.portal ? P[e.portal].label : '?'), 'bad');
    } else if (t.origin) addScore(g, 150, 'departed-origin', t);
    else if (t.exp) {
      addScore(g, t.delayed ? 60 : 150, 'express', t);
      msg(g, t.delayed ? T.expressDelayed(t.id) : T.expressClear(t.id), t.delayed ? '' : 'good');
    } else addScore(g, 50, 'departed', t);
    return false;
  }
  const n = e.next; let nx;
  if (typeof n === 'string') nx = n;
  else if (n.pt) nx = n[g.P[n.pt].pos];
  else {
    if (g.P[n.trail].pos !== n.as) { fail(g, T.failRunThrough(), T.failDerailTrailed(n.trail), 'RUN_THROUGH'); return false; }
    nx = n.to;
  }
  t.s -= e.len; t.edge = nx;
  if (g.E[nx].exit && g.E[nx].portal) blockEnter(g, g.E[nx].portal, t);
  return true;
}

export function moveTrain(g, t, dt) {
  const lim = stopLimit(g, t);
  let ns = t.s + g.lv.speed * dt;
  if (ns >= lim) { ns = Math.max(t.s, lim); t.stopped = true; } else t.stopped = false;
  t.s = ns;
  while (t.s > g.E[t.edge].len) if (!passEdge(g, t)) return;
  const p = posAt(g.E[t.edge], t.s), last = t.trail[t.trail.length - 1];
  if (Math.hypot(p.x - last.x, p.y - last.y) > 0.5) t.trail.push({ x: p.x, y: p.y, e: t.edge });
  let L = 0;
  for (let i = t.trail.length - 1; i > 0; i--) {
    L += Math.hypot(t.trail[i].x - t.trail[i - 1].x, t.trail[i].y - t.trail[i - 1].y);
    if (L >= t.len) { t.trail.splice(0, i - 1); break; }
  }
  const e = g.E[t.edge], atEnd = t.stopped && e.plat && t.s >= e.len - 7;
  if (t.state === 'arriving' && atEnd) {
    t.state = 'dwell'; t.dwell = t.dwellT;
    emit(g, { type: 'train', what: 'arrive', train: t.id });
    if (e.plat === t.plat) { addScore(g, 100, 'arrived', t); msg(g, T.arrivedRight(t.id, e.plat, way(g)), 'good'); }
    else { addScore(g, 20, 'wrong-platform', t); msg(g, T.arrivedWrong(t.id, t.plat, e.plat, way(g)), 'bad'); }
  }
  if (t.state === 'through' && atEnd) { t.state = 'ready'; t.delayed = true; msg(g, T.expressHeld(t.id), 'bad'); }
  // เข้าทางตันที่ไม่ใช่ทางจอด: ไม่ได้คะแนนเข้าจอด รอกลับหัวออก
  if (!e.plat && e.buffer && t.stopped && t.s >= e.len - STOP_GAP - 1 && (t.state === 'arriving' || t.state === 'through')) {
    t.state = 'ready'; t.delayed = true; msg(g, T.wrongTrack(t.id), 'bad'); turnIfNeeded(g, t);
  }
  if (t.state === 'dwell') { t.dwell -= dt; if (t.dwell <= 0) { t.state = 'ready'; turnIfNeeded(g, t); } }
  const waiting = t.stopped && (t.edge === t.entry || t.state === 'ready');
  if (waiting) {
    t.wait += dt;
    if (t.wait > graceOf(g, t)) g.score -= 3 * dt;
    if (g.lv.maxWait && t.wait > g.lv.maxWait) fail(g, T.failComplaint(), T.failWaited(t.id, g.lv.maxWait), 'MAX_WAIT');
  } else t.wait = 0;
}

// กรอบสี่เหลี่ยมรอบหางขบวน ใช้คัดคู่ที่อยู่ไกลกันออกก่อนเทียบทีละจุด (ผลเท่าเดิม แค่เร็วขึ้นเมื่อมีหลายขบวน)
function bounds(tr) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let m = 0; m < tr.length; m += 2) {
    const q = tr[m];
    if (q.x < x0) x0 = q.x; if (q.x > x1) x1 = q.x;
    if (q.y < y0) y0 = q.y; if (q.y > y1) y1 = q.y;
  }
  return { x0, y0, x1, y1 };
}
const CRASH = 10; // ระยะที่ถือว่าชน

// แยกชนิดการชน (SIGNALLING-RULES 6): ชนสีข้าง = อยู่บนขาคนละข้างของประแจเดียวกัน, ชนประสานงา = หันสวนกัน, ที่เหลือ = ชนท้าย
function crash(g, a, b, ea, eb) {
  const E = g.E, ta = E[ea].track, tb = E[eb].track;
  let code = E[a.edge].dir !== E[b.edge].dir ? 'HEAD_ON' : 'REAR_END';
  if (ta !== tb) for (const k in g.P) {
    const p = g.P[k], n = E[p.N].track, r = E[p.R].track, set = E[p[p.pos]].track;
    if ((ta === n && tb === r) || (ta === r && tb === n)) code = 'SIDE';
    // ขบวนหนึ่งอยู่บนโคนประแจ อีกขบวนอยู่บนขาที่ประแจไม่ได้ตั้งไปหา = ขบวนบนขานั้นล้ำหลักเขตปลอดภัย
    else if (p.stem && [ta, tb].includes(p.stem) && [ta, tb].some(x => (x === n || x === r) && x !== set)) code = 'SIDE';
  }
  const why = code === 'HEAD_ON' ? T.failHeadOn(a.id, b.id) : code === 'SIDE' ? T.failSide(a.id, b.id) : T.failCrashWhy(a.id, b.id);
  return fail(g, T.failCrash(), why, code);
}

export function checkCollisions(g) {
  const tr = g.trains, B = tr.map(t => bounds(t.trail));
  for (let i = 0; i < tr.length; i++) for (let j = i + 1; j < tr.length; j++) {
    const p = B[i], q = B[j];
    if (p.x0 - q.x1 > CRASH || q.x0 - p.x1 > CRASH || p.y0 - q.y1 > CRASH || q.y0 - p.y1 > CRASH) continue;
    const a = tr[i].trail, b = tr[j].trail;
    for (let m = 0; m < a.length; m += 2) for (let n = 0; n < b.length; n += 2)
      if (Math.hypot(a[m].x - b[n].x, a[m].y - b[n].y) < CRASH) return crash(g, tr[i], tr[j], a[m].e, b[n].e);
  }
}
