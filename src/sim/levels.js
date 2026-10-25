// ชุดด่านจาก JSON (data/levels/*.json): ยุค (กติกาที่เปิดใช้) + รายการด่าน (ผังไหน ตารางขบวนอะไร)
// schema 1 = ชุดด่านแบบต้นแบบ (history.json), schema 2 = ชุดภารกิจบนแผนที่: ด่านมี id คงที่ + stations[] ลำดับปลดล็อก
// ตารางขบวนเขียนได้ 3 แบบ (ทุก schema): { pattern, gap, start } | [[วินาที, ชานชาลา, ขอบขาเข้า?], ...] | [{ at | after, from, to, track, type, ... }, ...]
export const LEVELS_SCHEMA = 2;
export const LEVELS_SCHEMAS = [1, 2];
import { KINDS, DEFAULT_KIND, kindLen } from './consists.js';
const DWELL = 2.5;
const KIND_LIST = Object.keys(KINDS).join(', ');
const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const isNum = v => typeof v === 'number' && Number.isFinite(v);
const isStr = v => typeof v === 'string' && v.length > 0;

// ตารางขบวนแบบย่อ: ตัวอักษร 1–9 = ชานชาลา, E = ขบวนด่วนผ่าน, ห่างกัน gap วินาที เริ่มที่ start
export const sched = (pat, gap, start = 1) => [...pat].map((c, i) => [start + i * gap, c === 'E' ? 0 : +c]);

const objRow = r => isObj(r);
function trainsOf(t, at, bad) {
  if (isObj(t)) {
    if (typeof t.pattern !== 'string' || !/^[1-9E]+$/.test(t.pattern)) return bad(`${at}.pattern`, 'ต้องเป็นตัวเลขชานชาลา 1–9 หรือ E (ขบวนด่วน) เรียงกัน เช่น "21E3"');
    if (!isNum(t.gap) || t.gap <= 0) return bad(`${at}.gap`, 'ต้องเป็นจำนวนวินาทีที่มากกว่า 0');
    if (t.start !== undefined && (!isNum(t.start) || t.start < 0)) return bad(`${at}.start`, 'ต้องเป็นจำนวนวินาทีตั้งแต่ 0');
    return sched(t.pattern, t.gap, t.start);
  }
  if (Array.isArray(t) && t.length && t.every(r => Array.isArray(r) && isNum(r[0]) && Number.isInteger(r[1]) && r[1] >= 0 && (r[2] === undefined || isStr(r[2])))) {
    if (t.some((r, i) => i && r[0] < t[i - 1][0])) return bad(at, 'เวลาของขบวนต้องเรียงจากน้อยไปมาก');
    return t.map(r => [...r]);
  }
  if (Array.isArray(t) && t.length && t.every(objRow)) {
    let ok = true; const no = (w, m) => { ok = false; bad(w, m); };
    t.forEach((r, i) => {
      const w = `${at}[${i}]`, hasAt = r.at !== undefined, hasAfter = r.after !== undefined;
      if (hasAt === hasAfter) no(w, 'ต้องมี "at" (วินาที) หรือ "after" อย่างใดอย่างหนึ่ง');
      if (hasAt && !(isNum(r.at) && r.at >= 0)) no(`${w}.at`, 'ต้องเป็นจำนวนวินาทีตั้งแต่ 0');
      if (hasAfter) {
        const a = r.after;
        if (!isObj(a) || !Number.isInteger(a.train) || a.train < 1 || a.train > i) no(`${w}.after.train`, `ต้องเป็นเลขขบวนที่มาก่อน (1 ถึง ${i})`);
        else if (a.event !== undefined && a.event !== 'cleared') no(`${w}.after.event`, 'รองรับเฉพาะ "cleared" (ท้ายขบวนพ้นจอ)');
        else if (a.delay !== undefined && !(isNum(a.delay) && a.delay >= 0)) no(`${w}.after.delay`, 'ต้องเป็นจำนวนวินาทีตั้งแต่ 0');
      }
      if (r.type !== undefined && r.type !== 'local' && r.type !== 'express') no(`${w}.type`, 'ต้องเป็น "local" หรือ "express"');
      if (r.kind !== undefined && !Object.hasOwn(KINDS, r.kind)) no(`${w}.kind`, `ชนิดขบวนต้องเป็น ${KIND_LIST}`);
      if (r.stop !== undefined && typeof r.stop !== 'boolean') no(`${w}.stop`, 'ต้องเป็น true หรือ false');
      if (r.dwell !== undefined && !(isNum(r.dwell) && r.dwell >= 0)) no(`${w}.dwell`, 'ต้องเป็นจำนวนวินาทีตั้งแต่ 0');
      if (r.origin === undefined && !isStr(r.from)) no(`${w}.from`, 'ต้องเป็นชื่อขาที่ขบวนเข้ามา (หรือใช้ "origin" สำหรับขบวนต้นทาง)');
      if (r.origin !== undefined && r.from !== undefined) no(`${w}.from`, 'ขบวนต้นทาง (origin) ไม่ต้องมี from');
      if (!isStr(r.to)) no(`${w}.to`, 'ต้องเป็นชื่อขาที่ขบวนจะออก');
      const exp = r.type === 'express' || r.stop === false;
      if (!exp && r.origin === undefined && r.track === undefined) no(`${w}.track`, 'ขบวนที่จอดต้องระบุทางจอด (ชื่อบทบาทใน roles หรือเลขทาง)');
      if (exp && r.origin !== undefined) no(`${w}.origin`, 'ขบวนต้นทางต้องเป็นขบวนธรรมดา');
    });
    return ok ? t.map(r => ({ ...r })) : null;
  }
  return bad(at, 'ต้องเป็น { "pattern", "gap", "start" }, รายการ [[วินาที, ชานชาลา], ...] หรือรายการ [{ "at", "from", "to", "track" }, ...] ที่ไม่ว่าง');
}

// แปลงตารางขบวนเป็นรูปเดียวที่ตัวจำลองใช้ (lv.sched) โดยเทียบกับผัง L โยน Error พร้อมเหตุผลถ้าอ้างสิ่งที่ผังไม่มี
// kind0 = ชนิดขบวนของภารกิจ (trainKind) ใช้กับขบวนที่ไม่ระบุ kind เอง
function schedOf(trains, L, kind0 = DEFAULT_KIND) {
  const platOf = v => (Number.isInteger(v) ? (L.plats.includes(v) ? v : null) : L.rolePlat[v] ?? null);
  const twin = k => [k, L.E[k].rev].filter(Boolean);
  const reaches = (from, to) => from.some(a => to.some(b => L.reach[a].has(b)));
  return trains.map((r, i) => {
    const say = m => { throw new Error(`ขบวน ${i + 1}: ${m}`); };
    if (Array.isArray(r)) {
      if (r[1] !== 0 && !L.plats.includes(r[1])) say(`ตารางขบวนอ้างชานชาลาที่ผัง ${L.id} ไม่มี: ${JSON.stringify(r)}`);
      if (r[2] && !L.entries.includes(r[2])) say(`ตารางขบวนอ้างขาเข้าที่ผัง ${L.id} ไม่มี: ${JSON.stringify(r)}`);
      const len = kindLen(kind0);
      if (r[1] && L.platFit && len > L.platFit[r[1]]) say(`${KINDS[kind0].name} ยาว ${len} จอดทาง ${r[1]} ไม่พอ (รับได้ ${L.platFit[r[1]]})`);
      return { i, at: r[0], after: null, plat: r[1], exp: r[1] === 0, via: null, entry: r[2] || L.entry, exit: null, from: null, to: null, origin: null, dwell: DWELL, kind: kind0, len };
    }
    const exp = r.type === 'express' || r.stop === false, to = L.portals[r.to];
    if (!to) say(`ผัง ${L.id} ไม่มีขา ${JSON.stringify(r.to)} (มี ${Object.keys(L.portals).join(', ') || 'ไม่มีขาแบบมีชื่อ ต้องใช้ผัง schema 2'})`);
    if (!to.out) say(`ขา ${r.to} เป็นขาเข้าอย่างเดียว ออกไม่ได้`);
    let plat = 0, via = null, origin = null, entry = null;
    if (r.track !== undefined) { const n = platOf(r.track); if (n === null) say(`ผัง ${L.id} ไม่มีทางจอด ${JSON.stringify(r.track)} (roles: ${Object.keys(L.roles).join(', ') || '-'}; เลขทาง: ${L.plats.join(', ')})`); if (exp) via = n; else plat = n; }
    if (r.origin !== undefined) {
      origin = platOf(r.origin); if (origin === null) say(`ผัง ${L.id} ไม่มีทางจอด ${JSON.stringify(r.origin)}`);
      plat = origin;
      if (!reaches(twin(L.platEdge[origin]), [to.exit])) say(`จากทางจอด ${r.origin} ไปไม่ถึงขา ${r.to}`);
    } else {
      const from = L.portals[r.from];
      if (!from) say(`ผัง ${L.id} ไม่มีขา ${JSON.stringify(r.from)} (มี ${Object.keys(L.portals).join(', ') || '-'})`);
      if (!from.in) say(`ขา ${r.from} เป็นขาออกอย่างเดียว เข้าไม่ได้`);
      entry = from.entry;
      if (exp) { if (!reaches([entry], [to.exit])) say(`ขบวนด่วนจากขา ${r.from} ไปขา ${r.to} ไม่ได้โดยไม่กลับหัว`); if (via !== null && !(reaches([entry], twin(L.platEdge[via])) && reaches(twin(L.platEdge[via]), [to.exit]))) say(`ขบวนด่วนผ่านทาง ${r.track} ไปขา ${r.to} ไม่ได้`); }
      else {
        if (!reaches([entry], twin(L.platEdge[plat]))) say(`จากขา ${r.from} เข้าทางจอด ${r.track} ไม่ได้`);
        if (!reaches(twin(L.platEdge[plat]), [to.exit])) say(`จากทางจอด ${r.track} ไปไม่ถึงขา ${r.to}`);
      }
    }
    // ขบวนต้องจอดได้ทั้งขบวนในทางที่จอดหรือผ่าน (ท้ายไม่ค้างคอสถานี) ดู platFit ใน station.js
    const kind = r.kind ?? kind0, len = kindLen(kind), at = origin ?? (exp ? via : plat);
    // ขบวนด่วนที่ไม่กำหนดทางผ่าน: ต้องมีอย่างน้อย 1 ทางที่จอดได้ทั้งขบวน (ถูกกักหน้าเสาออกแล้วท้ายไม่ค้างคอสถานีจนติดตาย)
    if (!at && L.platFit && len > Math.max(...Object.values(L.platFit))) say(`${KINDS[kind].name} ยาว ${len} ไม่มีทางไหนในผังจอดได้ทั้งขบวน`);
    if (at && L.platFit && len > L.platFit[at]) say(`${KINDS[kind].name} ยาว ${len} จอดทาง ${r.origin ?? r.track} ไม่พอ (รับได้ ${L.platFit[at]})`);
    return { i, at: r.at ?? null, after: r.after ? { train: r.after.train, delay: r.after.delay ?? 0 } : null, plat, exp, via, entry, exit: to.exit,
      from: r.from ?? null, to: r.to, origin, dwell: r.dwell ?? DWELL, kind, len };
  });
}

// stations = { id: station } จาก loadStations, stationErrors = { id: [ข้อความ] } ของผังที่เสีย
// ไม่ throw: คืน { ok: true, pack } หรือ { ok: false, errors }
// ด่านที่ผังเสียหรืออ้างชานชาลาที่ไม่มี จะยังอยู่ในชุด แต่มี lv.error (เล่นไม่ได้ ด่านอื่นไม่พัง)
export function loadLevelPack(j, stations, stationErrors = {}) {
  const errors = [], bad = (where, what) => { errors.push(`${where}: ${what}`); return null; };
  if (!isObj(j)) return { ok: false, errors: ['ไฟล์ชุดด่าน: ต้องเป็นอ็อบเจกต์ JSON'] };
  if (!LEVELS_SCHEMAS.includes(j.schema)) bad('schema', `ต้องเป็น ${LEVELS_SCHEMAS.join(' หรือ ')} (ได้ ${JSON.stringify(j.schema)})`);
  const v2 = j.schema === 2;
  if (!isStr(j.id)) bad('id', 'ต้องเป็นข้อความ');
  if (!Array.isArray(j.eras) || !j.eras.length) bad('eras', 'ต้องมีอย่างน้อย 1 ยุค');
  if (!Array.isArray(j.levels) || !j.levels.length) bad('levels', 'ต้องมีอย่างน้อย 1 ด่าน');
  if (errors.length) return { ok: false, errors };

  const eras = j.eras.map((e, i) => {
    const at = `eras[${i}]`;
    if (!isObj(e)) return bad(at, 'ต้องเป็นอ็อบเจกต์');
    for (const f of v2 ? ['name'] : ['yr', 'name', 'story']) if (!isStr(e[f])) bad(`${at}.${f}`, 'ต้องเป็นข้อความ');
    for (const f of ['interlock', 'sema', 'tc', 'nx']) if (typeof e[f] !== 'boolean') bad(`${at}.${f}`, 'ต้องเป็น true หรือ false');
    if (e.interlock === false && !isStr(e.lesson)) bad(`${at}.lesson`, 'ยุคที่ไม่มีอินเตอร์ล็อกต้องมีข้อความ lesson (แสดงเมื่อแพ้)');
    if (e.nx === true && e.interlock !== true) bad(`${at}.nx`, 'ยุค NX ต้องเปิด interlock ด้วย');
    // ประแจบนทางหยุดเลย: true = ระบบตั้งให้, false = ผู้เล่นสับเอง, ไม่ใส่ = ตั้งให้เฉพาะยุคที่มี tc หรือ nx (ดู overlapAuto)
    if (e.overlapPointsAuto !== undefined && typeof e.overlapPointsAuto !== 'boolean') bad(`${at}.overlapPointsAuto`, 'ต้องเป็น true หรือ false');
    // approach locking (2.10): ยกเลิกเสาที่มีขบวนเข้าใกล้แล้วเส้นทางยังล็อกอีก T_CANCEL วินาที ไม่ใส่ = ไม่มี (12 ด่านเดิมไม่เปลี่ยน)
    if (e.approachLock !== undefined && typeof e.approachLock !== 'boolean') bad(`${at}.approachLock`, 'ต้องเป็น true หรือ false');
    if (e.approachLock === true && e.interlock !== true) bad(`${at}.approachLock`, 'ยุคที่ไม่มีอินเตอร์ล็อกไม่มี approach locking');
    if (e.overlapPointsAuto === false && e.nx === true) bad(`${at}.overlapPointsAuto`, 'ยุค NX ผู้เล่นกดประแจเองไม่ได้ ต้องให้ระบบตั้งประแจปลายไกลให้ (true หรือไม่ใส่)');
    return v2 ? { yr: '', story: '', ...e } : { ...e };
  });
  const ids = new Set();
  if (j.stations !== undefined) {
    if (!Array.isArray(j.stations) || !j.stations.length) bad('stations', 'ต้องเป็นรายการ [{ "station", "tier", "needStars" }]');
    else {
      let before = 0; const seen = new Set();
      j.stations.forEach((s, i) => {
        const at = `stations[${i}]`;
        if (!isObj(s) || !isStr(s.station)) return bad(`${at}.station`, 'ต้องเป็น id ของผัง');
        if (seen.has(s.station)) bad(`${at}.station`, `สถานี ${s.station} ซ้ำ`);
        seen.add(s.station);
        if (s.tier !== undefined && !Number.isInteger(s.tier)) bad(`${at}.tier`, 'ต้องเป็นจำนวนเต็ม');
        if (s.needStars !== undefined && !(Number.isInteger(s.needStars) && s.needStars >= 0)) bad(`${at}.needStars`, 'ต้องเป็นจำนวนเต็มตั้งแต่ 0');
        else if ((s.needStars || 0) > before) bad(`${at}.needStars`, `ต้องการ ${s.needStars} ดาว แต่ก่อนถึงสถานีนี้เก็บได้มากสุด ${before} ดาว`);
        before += 3 * j.levels.filter(l => isObj(l) && l.station === s.station).length;
      });
      j.levels.forEach((l, i) => { if (isObj(l) && isStr(l.station) && !seen.has(l.station)) bad(`levels[${i}].station`, `สถานี ${l.station} ไม่อยู่ใน stations[]`); });
    }
  }
  const levels = j.levels.map((l, i) => {
    const at = `levels[${i}]`;
    if (!isObj(l)) return bad(at, 'ต้องเป็นอ็อบเจกต์');
    if (!Number.isInteger(l.era) || !j.eras[l.era]) bad(`${at}.era`, `ไม่มียุคลำดับ ${JSON.stringify(l.era)} (นับจาก 0)`);
    for (const f of ['station', 'name', 'goal']) if (!isStr(l[f])) bad(`${at}.${f}`, 'ต้องเป็นข้อความ');
    if (!isNum(l.speed) || l.speed <= 0) bad(`${at}.speed`, 'ต้องเป็นตัวเลขที่มากกว่า 0');
    if (l.maxWait !== undefined && (!isNum(l.maxWait) || l.maxWait <= 0)) bad(`${at}.maxWait`, 'ต้องเป็นจำนวนวินาทีที่มากกว่า 0');
    if (l.hints !== undefined && typeof l.hints !== 'boolean') bad(`${at}.hints`, 'ต้องเป็น true หรือ false');
    if (v2 && !(isStr(l.id) && /^[a-z0-9-]+$/.test(l.id))) bad(`${at}.id`, 'ชุดด่าน schema 2 ต้องมี id คงที่ต่อภารกิจ (ตัวพิมพ์เล็ก ตัวเลข ขีดกลาง) ใช้เป็น key เซฟ');
    if (l.id !== undefined) { if (ids.has(l.id)) bad(`${at}.id`, `id ${JSON.stringify(l.id)} ซ้ำ`); ids.add(l.id); }
    const sec = v => isNum(v) && v >= 0;
    if (l.waitGrace !== undefined && !(sec(l.waitGrace) || (isObj(l.waitGrace) && sec(l.waitGrace.entry) && sec(l.waitGrace.ready)))) bad(`${at}.waitGrace`, 'ต้องเป็นจำนวนวินาทีตั้งแต่ 0 หรือ { "entry": วินาที, "ready": วินาที }');
    if (l.holdGrace !== undefined && l.holdGrace !== null && !sec(l.holdGrace)) bad(`${at}.holdGrace`, 'ต้องเป็นจำนวนวินาทีตั้งแต่ 0 หรือ null (กักขบวนที่สถานีข้างเคียงตลอด)');
    if (l.trainKind !== undefined && !Object.hasOwn(KINDS, l.trainKind)) bad(`${at}.trainKind`, `ชนิดขบวนต้องเป็น ${KIND_LIST}`);
    if (l.pointsLocked !== undefined && typeof l.pointsLocked !== 'boolean') bad(`${at}.pointsLocked`, 'ต้องเป็น true หรือ false');
    if (!Array.isArray(l.tips) || !l.tips.every(isStr)) bad(`${at}.tips`, 'ต้องเป็นรายการข้อความ');
    // ห่วงทางสะดวก (M2): ผู้เล่นขอห่วงขาออกและให้ทางขาเข้าเอง ผังต้องมีตอนทางเดี่ยว
    if (l.token !== undefined && typeof l.token !== 'boolean') bad(`${at}.token`, 'ต้องเป็น true หรือ false');
    // การ์ดความรู้ "รู้หรือไม่" หลังชนะ: ข้อเท็จจริงต้องมีแหล่งใน data/sources.md
    if (l.card !== undefined && !(isObj(l.card) && isStr(l.card.title) && isStr(l.card.text) && isStr(l.card.source) && /^https?:\/\//.test(l.card.source)))
      bad(`${at}.card`, 'ต้องเป็น { "title", "text", "source": ลิงก์ http(s) }');
    const trains = trainsOf(l.trains, `${at}.trains`, bad) || [];
    const lv = { ...l, i, trains, L: null, sched: [], error: null };
    const L = stations[l.station];
    if (!L) lv.error = stationErrors[l.station] ? `ผัง ${l.station} เสีย: ${stationErrors[l.station][0]}` : `ไม่พบผัง ${JSON.stringify(l.station)}`;
    else {
      lv.L = L;
      if (l.token && !Object.values(L.portals || {}).some(p => p.block)) lv.error = `ภารกิจมีห่วงทางสะดวก แต่ผัง ${l.station} ไม่มีตอนทางเดี่ยว`;
      try { lv.sched = schedOf(trains, L, Object.hasOwn(KINDS, l.trainKind) ? l.trainKind : DEFAULT_KIND); } catch (e) { lv.error = e.message; }
    }
    return lv;
  });
  if (errors.length) return { ok: false, errors };
  return { ok: true, pack: { id: j.id, schema: j.schema, kind: j.kind || null, line: j.line || null, name: j.name_th || j.id, note: j.signalling_note_th || null,
    eras, levels, stations: Array.isArray(j.stations) ? j.stations.map(s => ({ tier: 0, needStars: 0, ...s })) : null } };
}

// key เซฟของด่าน: id คงที่ถ้ามี ไม่งั้นใช้ลำดับ (ชุด history เดิม)
export const levelKey = lv => lv.id ?? String(lv.i);

// สถานะปลดล็อกของชุดภารกิจ (MISSIONS-NAMTOK ข้อ 4): starsOf(lv) = ดาวที่ดีที่สุดของด่านนั้น
// คืน { total, levels: [{ open, stars }], stations: [{ station, open, need, stars, max }] }
// - ด่านในสถานีเดียวกันเปิดตามลำดับ  - สถานีถัดไปเปิดเมื่อผ่านทุกด่านของสถานีก่อนหน้า และดาวสะสมถึง needStars
// - ที่เคยได้ดาวแล้วเปิดเสมอ (เซฟเก่าก่อนแทรกภารกิจใหม่)
// - opts.skip = ผู้เล่นกด "ข้ามบทสอน" (WP4.5): ทุกสถานีและทุกภารกิจของชุดเปิดหมด ไม่ให้ดาว (total นับเฉพาะดาวที่เล่นได้จริง)
export function unlockState(pack, starsOf, { skip = false } = {}) {
  const stars = pack.levels.map(l => starsOf(l) || 0), total = stars.reduce((a, b) => a + b, 0);
  const levels = pack.levels.map((l, i) => ({ open: false, stars: stars[i] }));
  if (!pack.stations) { pack.levels.forEach((l, i) => { levels[i].open = i === 0 || stars[i - 1] > 0; }); return { total, levels, stations: [] }; }
  let prevDone = true;
  const stations = pack.stations.map(s => {
    // ภารกิจหรือสถานีที่เคยเล่นผ่านแล้วเปิดค้างไว้เสมอ: แทรกภารกิจใหม่ (เช่น ภารกิจห่วงใน M2) แล้วผู้เล่นเดิมไม่ถูกล็อกย้อนหลัง
    const mine = pack.levels.filter(l => l.station === s.station), open = skip || (prevDone && total >= s.needStars) || mine.some(l => stars[l.i] > 0);
    mine.forEach((l, n) => { levels[l.i].open = skip || (open && (n === 0 || stars[mine[n - 1].i] > 0 || stars[l.i] > 0)); });
    prevDone = prevDone && mine.every(l => stars[l.i] > 0);
    return { station: s.station, tier: s.tier, open, need: s.needStars, stars: mine.reduce((a, l) => a + stars[l.i], 0), max: 3 * mine.length };
  });
  return { total, levels, stations };
}
