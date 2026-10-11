// คำใบ้: บอกสิ่งถัดไปที่ควรแตะ (เฉพาะด่านที่เปิด hints) คืน null หรือ { k, kind: 'p'|'s'|'plat', text }
import { edgeOccupied } from './interlocking.js';
import { T } from './messages.js';

export function hint(g) {
  const L = g.L;
  if (!g.lv.hints || g.state !== 'play') return null;
  const ordered = [...g.trains].sort((a, b) => a.id - b.id);
  for (const t of ordered) {
    if (t.state === 'ready') {
      const sig = L.platSig[g.E[t.edge].plat];
      if (g.S[sig].aspect === 'G') continue;
      if (!g.era.nx) for (const [k, pos] of L.REQ[sig]) if (g.P[k].pos !== pos) return { k, kind: 'p', text: T.hintSetTrailing(k) };
      return { k: sig, kind: 's', text: T.hintRelease() };
    }
  }
  for (const t of ordered) {
    const sig = g.E[t.entry].sig;
    if (sig && t.edge === t.entry && t.stopped && g.S[sig].aspect === 'R' && !g.trains.some(o => o !== t && o.edge === t.entry && o.s > t.s)) {
      const busy = !t.exp && edgeOccupied(g, L.platEdge[t.plat]);
      if (busy) return null;
      if (g.era.nx) return g.nxSel === sig ? { k: t.plat || L.plats[0], kind: 'plat', text: T.hintNxPlatform() } : { k: sig, kind: 's', text: T.hintNxEntrance(sig) };
      if (!t.exp) for (const [k, pos] of L.REQ[sig][t.plat]) if (g.P[k].pos !== pos) return { k, kind: 'p', text: T.hintSetFacing(k, t.plat) };
      return { k: sig, kind: 's', text: T.hintAdmit() };
    }
  }
  return null;
}
