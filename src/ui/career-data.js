// ข้อมูลเกมของโหมดอาชีพ: ผังสถานีทุกไฟล์ + ชุดด่านทุกไฟล์ ผ่านตัวตรวจของ sim (loadStations, loadLevelPack)
// JSON ถูกรวมเข้าไฟล์ตอน build (ไม่มีคำขอเครือข่ายตอนเล่น) โมดูลนี้ถูกโหลดแบบ dynamic import พร้อมหน้าแผนที่
// ชุดภารกิจของแผนที่ = CAREER_PACKS ใน career-id.js (เส้นทางสอน namtok + สายถัดไป) เพิ่มสายที่นั่นจุดเดียว
// ชุดด่านอื่นในโฟลเดอร์ (history, test-crossing) เปิดเล่นได้ทางเข้าสำหรับนักพัฒนา #dev
import { loadStations, loadLevelPack, levelKey, unlockState } from '../sim/index.js';
import { CAREER_PACK_ID, CAREER_PACKS } from './career-id.js';

export { CAREER_PACK_ID, CAREER_PACKS };

const stationFiles = import.meta.glob('../../data/stations/*.json', { eager: true, import: 'default' });
const packFiles = import.meta.glob('../../data/levels/*.json', { eager: true, import: 'default' });

export function loadCareer() {
  const { stations, errors: stationErrors } = loadStations(Object.entries(stationFiles).map(([file, json]) => ({ name: file.split('/').pop(), json })));
  for (const name in stationErrors) console.warn(`ผัง ${name} ใช้ไม่ได้:\n  ` + stationErrors[name].join('\n  '));
  const byId = {}; for (const name in stationErrors) byId[name.replace(/\.json$/, '')] = stationErrors[name];
  const packs = {}, packErrors = {};
  for (const file in packFiles) {
    const json = packFiles[file], r = loadLevelPack(json, stations, byId), id = (json && json.id) || file.split('/').pop().replace(/\.json$/, '');
    if (r.ok) packs[r.pack.id] = r.pack; else { packErrors[id] = r.errors; console.warn(`ชุดด่าน ${id} ใช้ไม่ได้:\n  ` + r.errors.join('\n  ')); }
  }
  // ชื่อและพิกัดสถานีจากไฟล์ผัง (ใช้วางจุดบนแผนที่เมื่อสถานีไม่อยู่ใน map.namtok)
  const geo = {};
  for (const json of Object.values(stationFiles)) if (json && json.id) geo[json.id] = { id: json.id, name_th: json.name_th || json.id, name_en: json.name_en || '', lat: json.lat, lon: json.lon, line: json.line || null };
  // career = เส้นทางสอน (null เมื่อไฟล์ไม่มีหรือไม่ผ่านตัวตรวจ แอปขึ้นข้อความแทนแผนที่ ไม่พัง)
  // careers = ทุกชุดอาชีพที่ใช้ได้ ตามลำดับ CAREER_PACKS (ชุดสายถัดไปที่เสียข้ามไป เส้นทางสอนยังเล่นได้)
  const ok = id => packs[id] && packs[id].stations ? packs[id] : null;
  const career = ok(CAREER_PACK_ID), careers = CAREER_PACKS.map(ok).filter(Boolean);
  return { stations, stationErrors, packs, packErrors, career, careers, geo, levelKey, unlockState };
}
