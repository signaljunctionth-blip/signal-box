// ขบวนรถ: เกิด, วิ่งตามขอบราง, หยุดหน้าสัญญาณ, จอดชานชาลา, ตกราง, ชนกัน
import { posAt } from './geometry.js';
import { T } from './messages.js';
import { msg, fail, addScore } from './events.js';

export const TL = 72; // ความยาวขบวน (หน่วยของผัง)

// plat = ชานชาลาปลายทาง, 0 = ขบวนด่วนผ่าน; entry = ขอบรางขาเข้า
export function spawn(g, plat, entry = g.L.entry) {
  const t = { id: g.nid++, plat, exp: plat === 0, entry, edge: entry, s: 0, state: plat === 0 ? 'through' : 'arriving',
    dwell: 0, wait: 0, stopped: false, delayed: false, trail: [] };
  const p = posAt(g.E[entry], 0); t.trail.push({ x: p.x, y: p.y, e: entry });
  g.trains.push(t); g.spawned++;
  return t;
}

// ระยะบนขอบปัจจุบันที่ขบวนต้องหยุด (Infinity = วิ่งต่อได้)
function stopLimit(g, t) {
  const E = g.E, e = E[t.edge]; let lim = Infinity;
  if (e.sig) {
    const s = g.S[e.sig];
    if (s.aspect === 'R' || (e.plat && t.state === 'arriving')) lim = e.len - 6;
  }
  if (e.plat && t.state === 'dwell') lim = t.s;
  if (t.edge === t.entry) for (const o of g.trains) { // ต่อคิวรอนอกสถานี ไม่ชนท้ายคันหน้า
    if (o === t) continue;
    if (o.edge === t.entry && o.s > t.s) lim = Math.min(lim, o.s - TL - 14);
    if (o.edge === E[t.entry].next) lim = Math.min(lim, E[t.entry].len + o.s - TL - 14);
  }
  return lim;
}

// หัวขบวนพ้นปลายขอบ: คืน false ถ้าขบวนออกจากผังหรือตกราง
function passEdge(g, t) {
  const e = g.E[t.edge];
  if (e.sig) {
    const s = g.S[e.sig]; s.aspect = 'R';
    if (s.route) { s.route.passed = true; s.route.train = t; s.route = null; }
    if (e.plat) t.state = 'leaving';
  }
  if (e.exit) {
    g.trains = g.trains.filter(x => x !== t); g.done++;
    if (t.exp) {
      addScore(g, t.delayed ? 60 : 150, 'express', t);
      msg(g, t.delayed ? T.expressDelayed(t.id) : T.expressClear(t.id), t.delayed ? '' : 'good');
    } else addScore(g, 50, 'departed', t);
    return false;
  }
  const n = e.next; let nx;
  if (typeof n === 'string') nx = n;
  else if (n.pt) nx = n[g.P[n.pt].pos];
  else {
    if (g.P[n.trail].pos !== n.as) { fail(g, T.failDerail(), T.failDerailTrailed(n.trail)); return false; }
    nx = n.to;
  }
  t.s -= e.len; t.edge = nx; return true;
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
    if (L >= TL) { t.trail.splice(0, i - 1); break; }
  }
  const e = g.E[t.edge], atEnd = t.stopped && e.plat && t.s >= e.len - 7;
  if (t.state === 'arriving' && atEnd) {
    t.state = 'dwell'; t.dwell = 2.5;
    if (e.plat === t.plat) { addScore(g, 100, 'arrived', t); msg(g, T.arrivedRight(t.id, e.plat), 'good'); }
    else { addScore(g, 20, 'wrong-platform', t); msg(g, T.arrivedWrong(t.id, t.plat, e.plat), 'bad'); }
  }
  if (t.state === 'through' && atEnd) { t.state = 'ready'; t.delayed = true; msg(g, T.expressHeld(t.id), 'bad'); }
  if (t.state === 'dwell') { t.dwell -= dt; if (t.dwell <= 0) t.state = 'ready'; }
  const waiting = t.stopped && (t.edge === t.entry || t.state === 'ready');
  if (waiting) {
    t.wait += dt;
    if (t.wait > (t.state === 'ready' ? 4 : 6)) g.score -= 3 * dt;
    if (g.lv.maxWait && t.wait > g.lv.maxWait) fail(g, T.failComplaint(), T.failWaited(t.id, g.lv.maxWait));
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

export function checkCollisions(g) {
  const tr = g.trains, B = tr.map(t => bounds(t.trail));
  for (let i = 0; i < tr.length; i++) for (let j = i + 1; j < tr.length; j++) {
    const p = B[i], q = B[j];
    if (p.x0 - q.x1 > CRASH || q.x0 - p.x1 > CRASH || p.y0 - q.y1 > CRASH || q.y0 - p.y1 > CRASH) continue;
    const a = tr[i].trail, b = tr[j].trail;
    for (let m = 0; m < a.length; m += 2) for (let n = 0; n < b.length; n += 2)
      if (Math.hypot(a[m].x - b[n].x, a[m].y - b[n].y) < CRASH)
        return fail(g, T.failCrash(), T.failCrashWhy(tr[i].id, tr[j].id));
  }
}
