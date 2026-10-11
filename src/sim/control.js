// คำสั่งจากผู้เล่น: ตัววาด (2 มิติ/3 มิติ) หาเองว่าแตะโดนอะไร แล้วส่งมาเป็น target
//   { kind: 'signal', id } | { kind: 'point', id } | { kind: 'platform', no } | null (แตะที่ว่าง)
import { T } from './messages.js';
import { msg } from './events.js';
import { tapSignal, tapPoint, autoRoute } from './interlocking.js';

// สัญญาณที่ต้องเลือกปลายทาง (ยุค NX): เส้นทางของมันไปจบที่ชานชาลา
const needsDestination = (g, sig) => !Array.isArray(g.L.REQ[sig]);

export function press(g, target) {
  if (g.state !== 'play') return false;
  if (target && target.kind === 'point') return tapPoint(g, target.id);
  if (target && target.kind === 'signal') {
    const k = target.id;
    if (!g.era.nx) return tapSignal(g, k);
    if (g.S[k].aspect === 'G') { g.nxSel = null; return tapSignal(g, k); }
    if (needsDestination(g, k)) { g.nxSel = k; msg(g, T.nxChoosePlatform()); return true; }
    g.nxSel = null; return autoRoute(g, k, g.L.REQ[k]);
  }
  if (g.era.nx && g.nxSel && target && target.kind === 'platform') {
    const sig = g.nxSel, req = g.L.REQ[sig][target.no];
    if (req) { g.nxSel = null; return autoRoute(g, sig, req); }
  }
  if (g.nxSel) { g.nxSel = null; msg(g, T.nxCancel()); }
  return false;
}
