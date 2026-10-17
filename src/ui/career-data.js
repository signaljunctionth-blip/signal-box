// ข้อมูลเกมของโหมดอาชีพ: ผังสถานีทุกไฟล์ + ชุดด่านทุกไฟล์ ผ่านตัวตรวจของ sim (loadStations, loadLevelPack)
// JSON ถูกรวมเข้าไฟล์ตอน build (ไม่มีคำขอเครือข่ายตอนเล่น) โมดูลนี้ถูกโหลดแบบ dynamic import พร้อมหน้าแผนที่
// ชุดภารกิจของแผนที่ = ไฟล์ data/levels/<CAREER_PACK_ID>.json (ตอนนี้ namtok.json) เปลี่ยนชุดได้ที่ career-id.js จุดเดียว
// ชุดด่านอื่นในโฟลเดอร์ (history, test-crossing) เปิดเล่นได้ทางเข้าสำหรับนักพัฒนา #dev
import { loadStations, loadLevelPack, levelKey, unlockState } from '../sim/index.js';
import { CAREER_PACK_ID } from './career-id.js';

export { CAREER_PACK_ID };

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
  // career = null เมื่อไฟล์ชุดภารกิจไม่มีหรือไม่ผ่านตัวตรวจ (แอปขึ้นข้อความแทนแผนที่ ไม่พัง)
  const real = packs[CAREER_PACK_ID], career = real && real.stations ? real : null;
  return { stations, stationErrors, packs, packErrors, career, levelKey, unlockState };
}
