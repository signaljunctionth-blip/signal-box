// คำสั่งจากผู้เล่น: ตัววาด (2 มิติ/3 มิติ) หาเองว่าแตะโดนอะไร แล้วส่งมาเป็น target
//   { kind: 'signal', id } | { kind: 'point', id } | { kind: 'platform', no } | { kind: 'portal', id } | { kind: 'track', id } | null (แตะที่ว่าง)
//   ด่านที่มีห่วง: { kind: 'token', id: ขา } = เครื่องทางสะดวก (ขอ/คืนห่วง), { kind: 'accept', id: ขา } = ให้ทางสถานีข้างเคียง
// portal = ป้ายขาออก, track = รางปลายทางที่ไม่ใช่ทางจอด (ใช้เลือกปลายทางในยุค NX)
import { T, way } from './messages.js';
import { msg } from './events.js';
import { tapSignal, tapPoint, autoRoute, walk } from './interlocking.js';
import { tapToken, acceptToken } from './block.js';

// สัญญาณที่ต้องเลือกปลายทาง (ยุค NX): มีเส้นทางมากกว่า 1 หรือเส้นทางไปจบที่ชานชาลา (แบบต้นแบบ)
export const needsDestination = (g, sig) => !Array.isArray(g.L.REQ[sig]) || g.L.routes[sig].length > 1;

// เส้นทางจากสัญญาณ sig ที่ไปจบที่ target (ไม่มี = null)
export function routeTo(g, sig, target) {
  if (!target) return null;
  return g.L.routes[sig].find(r => (target.kind === 'platform' && r.plat === target.no) || (target.kind === 'portal' && r.exit && r.portal === target.id)
    || (target.kind === 'track' && r.track === target.id)) || null;
}

export function press(g, target) {
  if (g.state !== 'play') return false;
  if (target && (target.kind === 'token' || target.kind === 'accept')) { if (g.nxSel) g.nxSel = null; return target.kind === 'token' ? tapToken(g, target.id, walk) : acceptToken(g, target.id); }
  if (target && target.kind === 'point') return tapPoint(g, target.id);
  if (target && target.kind === 'signal') {
    const k = target.id;
    if (!g.era.nx) return tapSignal(g, k);
    if (g.S[k].aspect === 'G') { g.nxSel = null; return tapSignal(g, k); }
    if (needsDestination(g, k)) { g.nxSel = k; msg(g, g.L.routes[k].every(r => r.plat !== null) ? T.nxChoosePlatform(way(g)) : T.nxChooseDest()); return true; }
    g.nxSel = null; return autoRoute(g, k, g.L.REQ[k]);
  }
  if (g.era.nx && g.nxSel) {
    const sig = g.nxSel, r = routeTo(g, sig, target);
    if (r) { g.nxSel = null; return autoRoute(g, sig, r.req); }
  }
  if (g.nxSel) { g.nxSel = null; msg(g, T.nxCancel()); }
  return false;
}
