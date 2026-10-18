// ตอนระหว่างสถานี (block) ของขาแต่ละขา — SIGNALLING-RULES ข้อ 4 (M1: ขอและให้ทางสะดวกอัตโนมัติ ยังไม่มีห่วง)
// สถานะ: free | permit(out) = ให้ทางสะดวกขาออกแล้ว รถยังไม่เข้าตอน | occupied(in/out)
// กฎเหล็ก: ทางสะดวกค้างได้ทีละรายการ และออกได้เฉพาะตอนที่ free
// M2 จะเปลี่ยน permit เป็น "ห่วง" ที่มองเห็นและให้ผู้เล่นเป็นคนขอ โดยใช้ requestPermit / returnPermit ชุดเดิม
import { T } from './messages.js';
import { emit, fail } from './events.js';

export function createBlocks(L) {
  const B = {};
  for (const k in L.portals) if (L.portals[k].block)
    B[k] = { id: k, runTime: L.portals[k].runTime, permit: null, out: [], tails: [], in: null, inAt: 0, inTrain: null, held: {}, shown: 'free' };
  return B;
}

// คืน null ถ้าขานี้ไม่มีตอน (ผัง schema 1) หรือ { state, dir, train, at }
export function blockState(g, k) {
  const b = g.block[k];
  if (!b) return null;
  if (b.inTrain || b.in !== null) return { state: 'occupied', dir: 'in', train: b.inTrain ? b.inTrain.id : null, at: b.in !== null ? b.inAt : null };
  if (b.out.length || b.tails.length) return { state: 'occupied', dir: 'out', train: b.out.length ? b.out[0].id : null, at: null };
  if (b.permit) return { state: 'permit', dir: 'out', train: null, at: null };
  return { state: 'free', dir: null, train: null, at: null };
}
export const blockFree = (g, k) => !g.block[k] || blockState(g, k).state === 'free';

// ขอทางสะดวก: dir 'out' holder = เส้นทางขาออก, dir 'in' holder = ลำดับขบวนในตาราง คืน true ถ้าได้
export function requestPermit(g, k, dir, holder, at = 0) {
  const b = g.block[k];
  if (!b) return true;
  if (!blockFree(g, k)) return false;
  if (dir === 'out') b.permit = holder; else { b.in = holder; b.inAt = at; }
  return true;
}
export function returnPermit(g, k, holder) {
  const b = g.block[k];
  if (b && (holder === undefined || b.permit === holder)) b.permit = null;
}

// หัวขบวนเข้ารางของขา k ในทิศออก = เข้าตอน
export function blockEnter(g, k, t) {
  const b = g.block[k];
  if (!b) return;
  b.permit = null;
  if (!b.out.includes(t)) b.out.push(t);
}
// ท้ายขบวนพ้นขอบจอ: ยังนับว่าอยู่ในตอนอีก runTime วินาที ถ้ามีขบวนสวนได้ทางสะดวกเข้ามาแล้ว = ชนประสานงาในตอน
export function blockLeave(g, k, t) {
  const b = g.block[k];
  if (!b) return;
  b.out = b.out.filter(x => x !== t);
  if (b.in !== null || b.inTrain) return fail(g, T.failCrash(), T.failHeadOnBlock(t.id, g.L.portals[k].label), 'HEAD_ON_BLOCK');
  if (b.runTime > 0) b.tails.push(b.runTime);
}

export function stepBlocks(g, dt) {
  for (const k in g.block) {
    const b = g.block[k];
    if (b.tails.length) b.tails = b.tails.map(x => x - dt).filter(x => x > 0);
    if (b.inTrain) {
      const t = b.inTrain, tk = g.L.portals[k].track;
      if (!g.trains.includes(t) || !(g.E[t.edge].track === tk || t.trail.some(p => g.E[p.e].track === tk))) b.inTrain = null;
    }
    const s = blockState(g, k), sig = s.state + (s.dir || '');
    if (sig !== b.shown) { b.shown = sig; emit(g, { type: 'block', portal: k, state: s.state, dir: s.dir, train: s.train }); }
  }
}
