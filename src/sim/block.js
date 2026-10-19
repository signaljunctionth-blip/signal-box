// ตอนระหว่างสถานี (block) ของขาแต่ละขา — SIGNALLING-RULES ข้อ 4
// สถานะ: free | permit(out) = ให้ทางสะดวกขาออกแล้ว รถยังไม่เข้าตอน | occupied(in/out)
// กฎเหล็ก: ทางสะดวกค้างได้ทีละรายการ และออกได้เฉพาะตอนที่ free
// ด่านปกติ (M1): ขอและให้ทางสะดวกอัตโนมัติ ไม่มีห่วงให้เห็น
// ด่านที่มี token: true (M2): ห่วงทางสะดวกแบบเครื่องทางสะดวกสองปลายตอน ออกห่วงได้จากปลายใดก็ได้ แต่ทีละอัน (ข้อ 4.6, การตัดสินใจคำถาม 2)
//   ขาออก: ผู้เล่นแตะเครื่อง (target token) ขอห่วง -> permit = TOKEN ห่วงอยู่ที่สถานี -> เปิดเสาออกได้ -> หัวขบวนเข้าตอน ห่วงไปกับขบวน
//   ขาเข้า: สถานีข้างเคียงขอทาง (ask) -> ผู้เล่นแตะ "ให้ทาง" (target accept) -> ขบวนมาพร้อมห่วง -> เข้าสถานีพ้นทั้งขบวน ห่วงคืนเครื่อง ตอนว่าง
import { T } from './messages.js';
import { emit, fail, msg } from './events.js';

// ห่วงที่ผู้เล่นขอออกมาแล้ว ยังอยู่ที่สถานี (ค่าของ b.permit ในด่านที่มีห่วง)
export const TOKEN = Object.freeze({ token: true });
export const tokenMode = g => !!g.lv.token;

export function createBlocks(L) {
  const B = {};
  for (const k in L.portals) if (L.portals[k].block)
    B[k] = { id: k, runTime: L.portals[k].runTime, permit: null, out: [], tails: [], in: null, inAt: 0, inTrain: null, held: {}, ask: null, askAt: 0, shown: 'free' };
  return B;
}

// คืน null ถ้าขานี้ไม่มีตอน (ผัง schema 1) หรือ { state, dir, train, at, token, ask }
// token (เฉพาะด่านที่มีห่วง) = ห่วงอยู่ไหน: 'station' ที่สถานีนี้ | 'train' บนขบวนในจอ | 'away' กับขบวนนอกจอ | null อยู่ในเครื่อง
// ask = เลขขบวนที่สถานีข้างเคียงขอทางสะดวกส่งมาและยังไม่ได้ให้ทาง หรือ null
export function blockState(g, k) {
  const b = g.block[k];
  if (!b) return null;
  const on = tokenMode(g), ask = on && b.ask !== null ? b.ask + 1 : null;
  if (b.inTrain || b.in !== null) return { state: 'occupied', dir: 'in', train: b.inTrain ? b.inTrain.id : b.in + 1, at: b.in !== null ? b.inAt : null, token: on ? (b.inTrain ? 'train' : 'away') : null, ask };
  if (b.out.length || b.tails.length) return { state: 'occupied', dir: 'out', train: b.out.length ? b.out[0].id : null, at: null, token: on ? (b.out.length ? 'train' : 'away') : null, ask };
  if (b.permit) return { state: 'permit', dir: 'out', train: null, at: null, token: on ? 'station' : null, ask };
  return { state: 'free', dir: null, train: null, at: null, token: null, ask };
}
export const blockFree = (g, k) => !g.block[k] || blockState(g, k).state === 'free';
// ด่านที่มีห่วง: ผู้เล่นถือห่วงของขา k อยู่ที่สถานี (เปิดเสาออกไปขานั้นได้)
export const hasToken = (g, k) => !!g.block[k] && g.block[k].permit === TOKEN;

// ขอทางสะดวก: dir 'out' holder = เส้นทางขาออก, dir 'in' holder = ลำดับขบวนในตาราง คืน true ถ้าได้
export function requestPermit(g, k, dir, holder, at = 0) {
  const b = g.block[k];
  if (!b) return true;
  if (!blockFree(g, k)) return false;
  if (dir === 'out') b.permit = holder; else { b.in = holder; b.inAt = at; }
  return true;
}
// คืนทางสะดวกขาออก (holder ไม่ตรง = ไม่คืน เช่น ห่วงของผู้เล่นยังอยู่ที่สถานีหลังยกเลิกเสาออก)
export function returnPermit(g, k, holder) {
  const b = g.block[k];
  if (b && (holder === undefined || b.permit === holder)) b.permit = null;
}

// สถานีข้างเคียงขอทางสะดวกส่งขบวนลำดับ idx (ด่านที่มีห่วง) คำขอค้างจนผู้เล่นให้ทาง
export function askPermit(g, k, idx) {
  const b = g.block[k];
  if (!b || b.ask !== null) return;
  b.ask = idx; b.askAt = g.time;
  msg(g, T.tokenAsk(idx + 1, g.L.portals[k].label));
}

// ด่านที่มีห่วง: หัวขบวน t ผ่านเสาที่พาออกไปขา k คนขับรับห่วงไป (ผู้เล่นคืนห่วงไม่ได้อีก) ตอนเป็น occupied(out)
export function takeToken(g, k, t) {
  const b = g.block[k];
  if (!b || b.permit !== TOKEN) return;
  b.permit = null; t.token = k; t.noToken = null;
  if (!b.out.includes(t)) b.out.push(t);
}

// หัวขบวนเข้ารางของขา k ในทิศออก = เข้าตอน
export function blockEnter(g, k, t) {
  const b = g.block[k];
  if (!b) return;
  if (b.permit === TOKEN) t.token = k; // คนขับรับห่วงไปด้วย
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

const askGrace = g => { const w = g.lv.waitGrace; return w === undefined ? 6 : typeof w === 'number' ? w : w.entry; };

export function stepBlocks(g, dt) {
  for (const k in g.block) {
    const b = g.block[k];
    if (b.tails.length) b.tails = b.tails.map(x => x - dt).filter(x => x > 0);
    if (b.inTrain) {
      const t = b.inTrain, tk = g.L.portals[k].track;
      if (!g.trains.includes(t) || !(g.E[t.edge].track === tk || t.trail.some(p => g.E[p.e].track === tk))) {
        b.inTrain = null;
        // ขบวนเข้าสถานีพ้นทั้งขบวน: ห่วงคืนเข้าเครื่อง (ในเกมนี้คืนเอง ผู้เล่นไม่ต้องแตะ)
        if (t.token === k) { t.token = null; if (g.trains.includes(t)) msg(g, T.tokenReturned(t.id, g.L.portals[k].label)); }
      }
    }
    // สถานีข้างเคียงรอให้ทางนานเกินช่วงผ่อน: เสียคะแนนเท่ากับขบวนที่รอหน้าเสา
    if (b.ask !== null && g.time - b.askAt > askGrace(g)) g.score -= 3 * dt;
    const s = blockState(g, k), sig = s.state + (s.dir || '') + (s.ask || '');
    if (sig !== b.shown) { b.shown = sig; emit(g, { type: 'block', portal: k, state: s.state, dir: s.dir, train: s.train, token: s.token, ask: s.ask }); }
  }
}

// มีเสาที่ตั้งพาขบวนออกทางขา k อยู่ไหม (ยุคไม่มีอินเตอร์ล็อกไม่มีวัตถุเส้นทาง จึงดูจากเสาที่เปิดอยู่ด้วย) walkOf = walk จาก interlocking.js
function exitInUse(g, k, walkOf) {
  if (g.routes.some(r => r.portal === k && !r.passed)) return true;
  if (g.era.interlock) return false;
  for (const s in g.S) if (g.S[s].aspect === 'G') { const w = walkOf(g, s), e = g.E[w.edges[w.edges.length - 1]]; if (e && e.exit && e.portal === k) return true; }
  return false;
}

// แตะเครื่องทางสะดวกของขา k: ห่วงอยู่ในเครื่อง = ขอห่วงออกมา (ตอนต้องว่าง), ห่วงอยู่ที่สถานี = คืนเข้าเครื่อง (ถ้ายังไม่ได้เปิดเสาออกด้วยห่วงนี้)
export function tapToken(g, k, walkOf) {
  const b = g.block[k], side = b ? g.L.portals[k].label : '';
  if (!b || !tokenMode(g)) return msg(g, T.tokenNone(), '', 'NO_TOKEN');
  if (b.permit === TOKEN) {
    if (exitInUse(g, k, walkOf)) return msg(g, T.tokenInUse(side), 'bad', 'TOKEN_IN_USE');
    b.permit = null; msg(g, T.tokenPutBack(side)); return true;
  }
  const s = blockState(g, k);
  if (s.state !== 'free') return msg(g, s.dir === 'in' ? T.tokenBusyIn(side) : T.tokenBusyOut(side), 'bad', 'BLOCK_NOT_FREE');
  b.permit = TOKEN; msg(g, T.tokenTaken(side), 'good'); return true;
}

// แตะ "ให้ทาง" ของขา k: ตอบรับคำขอของสถานีข้างเคียง ขบวนออกมาพร้อมห่วงและถึงขอบจอหลัง runTime วินาที
export function acceptToken(g, k) {
  const b = g.block[k], side = b ? g.L.portals[k].label : '';
  if (!b || !tokenMode(g) || b.ask === null) return msg(g, T.tokenNoAsk(), '', 'NO_ASK');
  const s = blockState(g, k);
  if (s.state !== 'free') return msg(g, s.state === 'permit' ? T.acceptTokenHere(side) : s.dir === 'in' ? T.acceptBusyIn(side) : T.acceptBusyOut(side), 'bad', 'BLOCK_NOT_FREE');
  const idx = b.ask;
  b.ask = null; b.in = idx; b.inAt = g.time + b.runTime;
  msg(g, T.tokenAccepted(idx + 1, side), 'good');
  return true;
}
