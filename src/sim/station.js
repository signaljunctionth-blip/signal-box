// ผังสถานีจาก JSON (data/stations/*.json): ตรวจ (validate) แล้วแปลงเป็นผังที่ตัวจำลองใช้
// schema อธิบายไว้ที่ data/stations/README.md
// schema 1 = ผังทิศเดียวแบบต้นแบบ v2 (โหมดประวัติศาสตร์), schema 2 = รางสองทิศ หลายขา ทางตัน (ดู station2.js)
import { prepEdges } from './geometry.js';
import { validateLayout2, expandLayout2, checkLayout2 } from './station2.js';

export const STATION_SCHEMA = 2;           // schema ล่าสุดที่ควรใช้เขียนผังใหม่
export const STATION_SCHEMAS = [1, 2];     // schema ที่ยังโหลดได้
const DIRS = ['E', 'W'];
const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const isNum = v => typeof v === 'number' && Number.isFinite(v);

// คืนรายการข้อความ error (ว่าง = ผังใช้ได้) แต่ละข้อขึ้นต้นด้วยตำแหน่งในไฟล์ เช่น layout.edges.b.next
export function validateStation(j) {
  const err = [], bad = (where, what) => err.push(`${where}: ${what}`);
  if (!isObj(j)) return ['ไฟล์ผัง: ต้องเป็นอ็อบเจกต์ JSON'];
  if (!STATION_SCHEMAS.includes(j.schema)) bad('schema', `ต้องเป็น ${STATION_SCHEMAS.join(' หรือ ')} (ได้ ${JSON.stringify(j.schema)})`);
  if (typeof j.id !== 'string' || !/^[a-z0-9-]+$/.test(j.id)) bad('id', 'ต้องเป็นตัวพิมพ์เล็ก ตัวเลข และขีดกลาง เช่น "tha-kilen"');
  if (typeof j.fictional !== 'boolean') bad('fictional', 'ต้องเป็น true (ผังสมมุติ) หรือ false (อ้างอิงสถานีจริง)');
  if (!isObj(j.verified) || typeof j.verified.layout !== 'boolean' || typeof j.verified.signalling !== 'boolean') bad('verified', 'ต้องมี { "layout": true/false, "signalling": true/false }');
  if (!Array.isArray(j.sources)) bad('sources', 'ต้องเป็นรายการแหล่งอ้างอิง (ผังสมมุติใส่ [] ได้)');
  else if (j.fictional === false && !j.sources.length) bad('sources', 'สถานีจริงต้องมีแหล่งอ้างอิงอย่างน้อย 1 รายการ');
  const L = j.layout;
  if (!isObj(L)) { bad('layout', 'ไม่พบผัง (ต้องเป็นอ็อบเจกต์)'); return err; }
  if (L.size !== undefined && !(Array.isArray(L.size) && L.size.length === 2 && L.size.every(n => isNum(n) && n > 0))) bad('layout.size', 'ต้องเป็น [กว้าง, สูง] ที่มากกว่า 0');
  if (j.schema === 2) {
    if (j.upDir !== 'E' && j.upDir !== 'W') bad('upDir', 'ต้องเป็น "E" หรือ "W": ทิศของผังที่เป็นเที่ยวขึ้น (วิ่งออกจากกรุงเทพ) ผังสมมุติกำหนดเองได้');
    if (L.edges !== undefined) bad('layout.edges', 'schema 2 ใช้ layout.tracks (รางสองทิศ) ไม่ใช้ edges');
    const n = err.length;
    validateLayout2(L, bad);
    if (err.length === n) checkLayout2(expandLayout2(L), bad);
    return err;
  }

  const E = L.edges, P = isObj(L.points) ? L.points : {}, S = isObj(L.signals) ? L.signals : {};
  if (!isObj(E) || !Object.keys(E).length) { bad('layout.edges', 'ต้องมีขอบรางอย่างน้อย 1 เส้น'); return err; }
  if (L.points !== undefined && !isObj(L.points)) bad('layout.points', 'ต้องเป็นอ็อบเจกต์');
  if (!isObj(L.signals)) bad('layout.signals', 'ต้องเป็นอ็อบเจกต์');
  const hasEdge = id => typeof id === 'string' && Object.hasOwn(E, id);
  const edgeRef = (where, id) => { if (!hasEdge(id)) bad(where, `ไม่พบขอบราง ${JSON.stringify(id)}`); };
  const exits = Array.isArray(L.exits) ? L.exits : [], entries = Array.isArray(L.entries) ? L.entries : [];
  const usedBy = {}; // ประแจ -> ขอบรางที่อ้างถึง

  for (const k in E) {
    const e = E[k], at = `layout.edges.${k}`;
    if (!isObj(e)) { bad(at, 'ต้องเป็นอ็อบเจกต์'); continue; }
    if (!Array.isArray(e.pts) || e.pts.length < 2 || !e.pts.every(p => Array.isArray(p) && p.length === 2 && p.every(isNum))) bad(`${at}.pts`, 'ต้องเป็นรายการจุด [x, y] อย่างน้อย 2 จุด');
    else for (let i = 1; i < e.pts.length; i++) if (e.pts[i][0] === e.pts[i - 1][0] && e.pts[i][1] === e.pts[i - 1][1]) bad(`${at}.pts[${i}]`, 'จุดซ้ำกับจุดก่อนหน้า (ท่อนรางยาว 0)');
    if (e.dir !== undefined && !DIRS.includes(e.dir)) bad(`${at}.dir`, 'ต้องเป็น "E" หรือ "W"');
    if (e.sig !== undefined && !(isObj(S[e.sig]) && S[e.sig].edge === k)) bad(`${at}.sig`, `สัญญาณ ${JSON.stringify(e.sig)} ไม่มีใน layout.signals หรือไม่ได้ชี้กลับมาที่ขอบรางนี้`);
    const n = e.next;
    if (e.exit) {
      if (e.exit !== true) bad(`${at}.exit`, 'ต้องเป็น true');
      if (n !== undefined) bad(`${at}.next`, 'ขอบรางขาออก (exit) ต้องไม่มี next');
      if (!exits.includes(k)) bad(`${at}.exit`, 'ขอบรางนี้เป็นขาออก แต่ไม่อยู่ใน layout.exits');
    } else if (typeof n === 'string') edgeRef(`${at}.next`, n);
    else if (isObj(n) && n.pt !== undefined) {
      const p = P[n.pt];
      if (!isObj(p)) bad(`${at}.next.pt`, `ไม่พบประแจ ${JSON.stringify(n.pt)}`);
      else {
        (usedBy[n.pt] ||= []).push(k);
        if (p.facing !== true) bad(`${at}.next`, `ประแจ ${n.pt} ไม่ใช่ประแจสวน (facing) แต่ถูกใช้แบบ { pt }`);
        if (n.N !== p.N || n.R !== p.R) bad(`${at}.next`, `ทาง N/R ไม่ตรงกับ layout.points.${n.pt}`);
      }
      edgeRef(`${at}.next.N`, n.N); edgeRef(`${at}.next.R`, n.R);
    } else if (isObj(n) && n.trail !== undefined) {
      const p = P[n.trail];
      if (!isObj(p)) bad(`${at}.next.trail`, `ไม่พบประแจ ${JSON.stringify(n.trail)}`);
      else {
        (usedBy[n.trail] ||= []).push(k);
        if (p.facing !== false) bad(`${at}.next`, `ประแจ ${n.trail} ไม่ใช่ประแจตาม (trailing) แต่ถูกใช้แบบ { trail }`);
        if (n.as !== 'N' && n.as !== 'R') bad(`${at}.next.as`, 'ต้องเป็น "N" หรือ "R"');
        else if (p[n.as] !== k) bad(`${at}.next.as`, `layout.points.${n.trail}.${n.as} ไม่ได้ชี้มาที่ขอบรางนี้`);
      }
      edgeRef(`${at}.next.to`, n.to);
    } else bad(`${at}.next`, 'ต้องเป็นชื่อขอบรางถัดไป, { pt, N, R } (ประแจสวน), { trail, as, to } (ประแจตาม) หรือกำหนด "exit": true');
  }

  for (const k in P) {
    const p = P[k], at = `layout.points.${k}`;
    if (!isObj(p)) { bad(at, 'ต้องเป็นอ็อบเจกต์'); continue; }
    if (!isNum(p.x) || !isNum(p.y)) bad(at, 'ต้องมีตำแหน่ง x, y เป็นตัวเลข');
    if (typeof p.facing !== 'boolean') bad(`${at}.facing`, 'ต้องเป็น true (ประแจสวน) หรือ false (ประแจตาม)');
    edgeRef(`${at}.N`, p.N); edgeRef(`${at}.R`, p.R);
    if (p.N === p.R) bad(at, 'ทาง N กับ R ต้องเป็นคนละขอบราง');
    const n = (usedBy[k] || []).length;
    if (p.facing === true && n !== 1) bad(at, `ประแจสวนต้องมีขอบรางเข้าหา 1 เส้นที่ next เป็น { pt: "${k}" } (พบ ${n})`);
    if (p.facing === false && n !== 2) bad(at, `ประแจตามต้องมีขอบราง 2 เส้นที่ next เป็น { trail: "${k}" } (พบ ${n})`);
  }

  for (const k in S) {
    const s = S[k], at = `layout.signals.${k}`;
    if (!isObj(s)) { bad(at, 'ต้องเป็นอ็อบเจกต์'); continue; }
    if (!hasEdge(s.edge)) bad(`${at}.edge`, `ไม่พบขอบราง ${JSON.stringify(s.edge)}`);
    else if (isObj(E[s.edge])) {
      if (E[s.edge].sig !== undefined && E[s.edge].sig !== k) bad(`${at}.edge`, `ขอบราง ${s.edge} ระบุสัญญาณ ${E[s.edge].sig} ไม่ตรงกัน`);
      if (E[s.edge].exit) bad(`${at}.edge`, 'ตั้งสัญญาณที่ปลายขอบรางขาออกไม่ได้');
      if (Object.keys(S).some(o => o !== k && isObj(S[o]) && S[o].edge === s.edge)) bad(`${at}.edge`, `ขอบราง ${s.edge} มีสัญญาณมากกว่า 1 ต้น`);
      if (s.dir !== undefined && E[s.edge].dir !== undefined && s.dir !== E[s.edge].dir) bad(`${at}.dir`, `ทิศของสัญญาณ (${s.dir}) ไม่ตรงกับทิศของขอบราง ${s.edge} (${E[s.edge].dir})`);
    }
    if (!isNum(s.lx) || !isNum(s.ly)) bad(at, 'ต้องมีตำแหน่งเสา lx, ly เป็นตัวเลข');
    if (s.dir !== undefined && !DIRS.includes(s.dir)) bad(`${at}.dir`, 'ต้องเป็น "E" หรือ "W"');
  }

  if (!Array.isArray(L.platforms)) bad('layout.platforms', 'ต้องเป็นรายการ [{ "edge": ..., "no": ... }]');
  else {
    const seen = new Set();
    L.platforms.forEach((p, i) => {
      const at = `layout.platforms[${i}]`;
      if (!isObj(p)) return bad(at, 'ต้องเป็นอ็อบเจกต์');
      if (!Number.isInteger(p.no) || p.no < 1) bad(`${at}.no`, 'เลขชานชาลาต้องเป็นจำนวนเต็มตั้งแต่ 1');
      else if (seen.has(p.no)) bad(`${at}.no`, `เลขชานชาลา ${p.no} ซ้ำ`);
      seen.add(p.no);
      if (!hasEdge(p.edge)) return bad(`${at}.edge`, `ไม่พบขอบราง ${JSON.stringify(p.edge)}`);
      const e = E[p.edge];
      if (!isObj(e)) return;
      if (e.plat !== undefined && e.plat !== p.no) bad(`${at}.no`, `ขอบราง ${p.edge} ระบุ plat ${e.plat} ไม่ตรงกัน`);
      if (!Object.values(S).some(s => isObj(s) && s.edge === p.edge)) bad(`${at}.edge`, `ขอบรางชานชาลา ${p.edge} ต้องมีสัญญาณออกที่ปลายทาง`);
    });
    for (const k in E) if (isObj(E[k]) && E[k].plat !== undefined && !L.platforms.some(p => isObj(p) && p.edge === k)) bad(`layout.edges.${k}.plat`, 'ขอบรางนี้ระบุ plat แต่ไม่อยู่ใน layout.platforms');
  }

  if (!Array.isArray(L.entries) || !entries.length) bad('layout.entries', 'ต้องมีขอบรางขาเข้าอย่างน้อย 1 เส้น');
  entries.forEach((id, i) => edgeRef(`layout.entries[${i}]`, id));
  if (!Array.isArray(L.exits) || !exits.length) bad('layout.exits', 'ต้องมีขอบรางขาออกอย่างน้อย 1 เส้น');
  exits.forEach((id, i) => { if (!hasEdge(id)) edgeRef(`layout.exits[${i}]`, id); else if (isObj(E[id]) && E[id].exit !== true) bad(`layout.exits[${i}]`, `ขอบราง ${id} ต้องมี "exit": true`); });
  if (err.length) return err; // โครงสร้างยังผิด ไม่ตรวจกราฟต่อ

  // กราฟ: ทุกขอบต้องไปถึงได้จากขาเข้า, ไม่มีวงวน, ทุกขาเข้าไปถึงขาออกได้
  const succ = k => { const n = E[k].next; return E[k].exit ? [] : typeof n === 'string' ? [n] : n.pt ? [n.N, n.R] : [n.to]; };
  const seen = new Set(), state = {}; // state: 1 = กำลังเดิน, 2 = เดินจบ
  const dfs = (k, path) => {
    if (state[k] === 1) { bad('layout.edges', `รางวนเป็นวง: ${[...path.slice(path.indexOf(k)), k].join(' → ')}`); return false; }
    if (state[k] === 2) return canExit[k];
    state[k] = 1; seen.add(k);
    let ok = !!E[k].exit;
    for (const n of succ(k)) ok = dfs(n, [...path, k]) || ok;
    state[k] = 2; return (canExit[k] = ok);
  };
  const canExit = {};
  entries.forEach((id, i) => { if (!dfs(id, [])) bad(`layout.entries[${i}]`, `จากขาเข้า ${id} ไปไม่ถึงขาออกเลย`); });
  for (const k in E) if (!seen.has(k)) bad(`layout.edges.${k}`, 'ไปไม่ถึงจากขาเข้าใดเลย');
  return err;
}

// เส้นทางทั้งหมดที่ตั้งได้จากสัญญาณ 1 ต้น: เดินจากขอบถัดจากสัญญาณจนเจอขอบที่มีสัญญาณถัดไปหรือขาออก
// req = ประแจที่ต้องตั้ง [[ชื่อประแจ, 'N'|'R'], ...] ตามลำดับที่รถผ่าน
function routesFrom(E, sig, sigEdge) {
  const out = [];
  const follow = (n, edges, req) => {
    if (typeof n === 'string') visit(n, edges, req);
    else if (n.pt) { visit(n.N, edges, [...req, [n.pt, 'N']]); visit(n.R, edges, [...req, [n.pt, 'R']]); }
    else visit(n.to, edges, [...req, [n.trail, n.as]]);
  };
  const visit = (cur, edges, req) => {
    edges = [...edges, cur];
    const e = E[cur];
    if (e.sig || e.exit || !e.next) out.push({ sig, to: cur, plat: e.plat ?? null, exit: !!e.exit, portal: e.portal || null, track: e.track, edges, req });
    else follow(e.next, edges, req);
  };
  follow(E[sigEdge].next, [], []);
  return out;
}

// แปลง JSON ที่ตรวจผ่านแล้วเป็นผังที่ตัวจำลองใช้ (ค่าคงที่ตลอดเกม ห้ามแก้ระหว่างเล่น)
function buildStation(j) {
  const bidir = j.schema === 2, L = bidir ? expandLayout2(j.layout) : j.layout, src = {};
  for (const k in L.edges) src[k] = { dir: 'E', ...L.edges[k] };
  for (const k in L.signals) src[L.signals[k].edge].sig = k;
  for (const p of L.platforms) { src[p.edge].plat = p.no; if (bidir) src[src[p.edge].rev].plat = p.no; }
  const E = prepEdges(src), P = {}, S = {};
  for (const k in E) if (!E[k].track) E[k].track = k; // schema 1: ขอบราง 1 เส้น = รางกายภาพ 1 เส้น
  for (const k in L.points || {}) P[k] = { ...L.points[k] };
  for (const k in L.signals) S[k] = { dir: E[L.signals[k].edge].dir, ...L.signals[k] };

  const plats = L.platforms.map(p => p.no), platEdge = {}, platSig = {};
  for (const p of L.platforms) { platEdge[p.no] = p.edge; platSig[p.no] = E[p.edge].sig; }
  const routes = {}, REQ = {};
  for (const k in S) {
    routes[k] = routesFrom(E, k, S[k].edge);
    // REQ: รูปเดียวกับต้นแบบ v2 — สัญญาณเข้า (ปลายทางเป็นชานชาลา) เป็น { เลขชานชาลา: req }, สัญญาณอื่นเป็น req ของเส้นทางแรก
    if (routes[k].length && routes[k].every(r => r.plat !== null)) { REQ[k] = {}; for (const r of routes[k]) REQ[k][r.plat] = r.req; }
    else REQ[k] = routes[k].length ? routes[k][0].req : [];
  }
  // reach[ขอบ] = ขอบรางทั้งหมดที่วิ่งต่อไปถึงได้โดยไม่กลับทิศ (รวมตัวเอง)
  const reach = {};
  const reachOf = k => {
    if (reach[k]) return reach[k];
    const set = (reach[k] = new Set([k])), n = E[k].next;
    for (const x of !n ? [] : typeof n === 'string' ? [n] : n.pt ? [n.N, n.R] : [n.to]) for (const y of reachOf(x)) set.add(y);
    return set;
  };
  for (const k in E) reachOf(k);
  const noPlatform = L.platforms.filter(p => p.noPlatform).map(p => p.no); // ทางจอดที่ไม่มีชานชาลา (ขบวนโดยสารไม่ควรจอด)
  const roles = { ...(L.roles || {}) }, roleOf = {}, rolePlat = {};
  for (const r in roles) { roleOf[roles[r]] = r; rolePlat[r] = E[roles[r]].plat; }
  const entry = L.entries[0];
  return {
    id: j.id, name: j.name_th || j.id, fictional: j.fictional, verified: { ...j.verified }, sources: [...j.sources],
    schema: j.schema, bidir, upDir: j.upDir || null,
    size: L.size ? [...L.size] : [960, 480],
    E, edgeCount: Object.keys(E).length, P, S, plats, platEdge, platSig, routes, REQ, reach,
    entries: [...L.entries], exits: [...L.exits],
    portals: bidir ? L.portals : {}, buffers: bidir ? L.buffers : [], sections: bidir ? L.sections : {}, sectionOf: bidir ? L.sectionOf : {},
    roles, roleOf, rolePlat, noPlatform,
    entry, entrySig: E[entry].sig || null, inY: E[entry].pts[0][1],
  };
}

// ตรวจแล้วสร้างผัง ไม่ throw: คืน { ok: true, station } หรือ { ok: false, errors: [ข้อความ] }
export function loadStation(json) {
  let errors;
  try { errors = validateStation(json); } catch (e) { errors = [`ตรวจผังไม่สำเร็จ: ${e.message}`]; }
  if (errors.length) return { ok: false, errors };
  try { return { ok: true, station: buildStation(json) }; } catch (e) { return { ok: false, errors: [`สร้างผังไม่สำเร็จ: ${e.message}`] }; }
}

// โหลดหลายไฟล์พร้อมกัน: คืน { stations: { id: station }, errors: { id หรือชื่อไฟล์: [ข้อความ] } }
export function loadStations(list) {
  const stations = {}, errors = {};
  for (const item of list) {
    const json = item && item.json !== undefined ? item.json : item, name = (item && item.name) || (json && json.id) || '?';
    const r = loadStation(json);
    if (!r.ok) errors[name] = r.errors;
    else if (stations[r.station.id]) errors[name] = [`id: ซ้ำกับผังอื่น (${r.station.id})`];
    else stations[r.station.id] = r.station;
  }
  return { stations, errors };
}
