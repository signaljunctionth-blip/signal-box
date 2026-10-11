// ชุดด่านจาก JSON (data/levels/*.json): ยุค (กติกาที่เปิดใช้) + รายการด่าน (ผังไหน ตารางขบวนอะไร)
export const LEVELS_SCHEMA = 1;
const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const isNum = v => typeof v === 'number' && Number.isFinite(v);
const isStr = v => typeof v === 'string' && v.length > 0;

// ตารางขบวนแบบย่อ: ตัวอักษร 1–9 = ชานชาลา, E = ขบวนด่วนผ่าน, ห่างกัน gap วินาที เริ่มที่ start
export const sched = (pat, gap, start = 1) => [...pat].map((c, i) => [start + i * gap, c === 'E' ? 0 : +c]);

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
  return bad(at, 'ต้องเป็น { "pattern", "gap", "start" } หรือรายการ [[วินาที, ชานชาลา], ...] ที่ไม่ว่าง');
}

// stations = { id: station } จาก loadStations, stationErrors = { id: [ข้อความ] } ของผังที่เสีย
// ไม่ throw: คืน { ok: true, pack } หรือ { ok: false, errors }
// ด่านที่ผังเสียหรืออ้างชานชาลาที่ไม่มี จะยังอยู่ในชุด แต่มี lv.error (เล่นไม่ได้ ด่านอื่นไม่พัง)
export function loadLevelPack(j, stations, stationErrors = {}) {
  const errors = [], bad = (where, what) => { errors.push(`${where}: ${what}`); return null; };
  if (!isObj(j)) return { ok: false, errors: ['ไฟล์ชุดด่าน: ต้องเป็นอ็อบเจกต์ JSON'] };
  if (j.schema !== LEVELS_SCHEMA) bad('schema', `ต้องเป็น ${LEVELS_SCHEMA} (ได้ ${JSON.stringify(j.schema)})`);
  if (!isStr(j.id)) bad('id', 'ต้องเป็นข้อความ');
  if (!Array.isArray(j.eras) || !j.eras.length) bad('eras', 'ต้องมีอย่างน้อย 1 ยุค');
  if (!Array.isArray(j.levels) || !j.levels.length) bad('levels', 'ต้องมีอย่างน้อย 1 ด่าน');
  if (errors.length) return { ok: false, errors };

  const eras = j.eras.map((e, i) => {
    const at = `eras[${i}]`;
    if (!isObj(e)) return bad(at, 'ต้องเป็นอ็อบเจกต์');
    for (const f of ['yr', 'name', 'story']) if (!isStr(e[f])) bad(`${at}.${f}`, 'ต้องเป็นข้อความ');
    for (const f of ['interlock', 'sema', 'tc', 'nx']) if (typeof e[f] !== 'boolean') bad(`${at}.${f}`, 'ต้องเป็น true หรือ false');
    if (e.interlock === false && !isStr(e.lesson)) bad(`${at}.lesson`, 'ยุคที่ไม่มีอินเตอร์ล็อกต้องมีข้อความ lesson (แสดงเมื่อแพ้)');
    if (e.nx === true && e.interlock !== true) bad(`${at}.nx`, 'ยุค NX ต้องเปิด interlock ด้วย');
    return { ...e };
  });
  const levels = j.levels.map((l, i) => {
    const at = `levels[${i}]`;
    if (!isObj(l)) return bad(at, 'ต้องเป็นอ็อบเจกต์');
    if (!Number.isInteger(l.era) || !j.eras[l.era]) bad(`${at}.era`, `ไม่มียุคลำดับ ${JSON.stringify(l.era)} (นับจาก 0)`);
    for (const f of ['station', 'name', 'goal']) if (!isStr(l[f])) bad(`${at}.${f}`, 'ต้องเป็นข้อความ');
    if (!isNum(l.speed) || l.speed <= 0) bad(`${at}.speed`, 'ต้องเป็นตัวเลขที่มากกว่า 0');
    if (l.maxWait !== undefined && (!isNum(l.maxWait) || l.maxWait <= 0)) bad(`${at}.maxWait`, 'ต้องเป็นจำนวนวินาทีที่มากกว่า 0');
    if (l.hints !== undefined && typeof l.hints !== 'boolean') bad(`${at}.hints`, 'ต้องเป็น true หรือ false');
    if (!Array.isArray(l.tips) || !l.tips.every(isStr)) bad(`${at}.tips`, 'ต้องเป็นรายการข้อความ');
    const trains = trainsOf(l.trains, `${at}.trains`, bad) || [];
    const lv = { ...l, i, trains, L: null, error: null };
    const L = stations[l.station];
    if (!L) lv.error = stationErrors[l.station] ? `ผัง ${l.station} เสีย: ${stationErrors[l.station][0]}` : `ไม่พบผัง ${JSON.stringify(l.station)}`;
    else {
      lv.L = L;
      const miss = trains.find(r => (r[1] !== 0 && !L.plats.includes(r[1])) || (r[2] && !L.entries.includes(r[2])));
      if (miss) lv.error = `ตารางขบวนอ้างชานชาลาหรือขาเข้าที่ผัง ${L.id} ไม่มี: ${JSON.stringify(miss)}`;
    }
    return lv;
  });
  if (errors.length) return { ok: false, errors };
  return { ok: true, pack: { id: j.id, name: j.name_th || j.id, eras, levels } };
}
