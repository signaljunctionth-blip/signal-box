// จุดเริ่มของเกมโหมดประวัติศาสตร์ 200 ปี (เวอร์ชันโมดูล): โหลดผังและด่านจาก JSON แล้วเริ่มหน้าจอ
// JSON ถูกรวมเข้าไฟล์ตอน build (ไม่มีคำขอเครือข่ายตอนเล่น) เพิ่มไฟล์ใน data/stations/ แล้วใช้ได้เลย ไม่ต้องแก้โค้ด
import './fonts.css';
import './ui/game.css';
import { loadStations, loadLevelPack } from './sim/index.js';
import { createSave } from './save/index.js';
import { startApp, renderLoadError } from './ui/app.js';
import historyJson from '../data/levels/history.json';

const files = import.meta.glob('../data/stations/*.json', { eager: true, import: 'default' });
const { stations, errors } = loadStations(Object.entries(files).map(([file, json]) => ({ name: file.split('/').pop(), json })));
for (const name in errors) console.warn(`ผัง ${name} ใช้ไม่ได้:\n  ` + errors[name].join('\n  '));

// errors ใช้ชื่อไฟล์เป็น key: ทำสำเนาที่ใช้ id (ชื่อไฟล์ตัด .json) เพื่อให้ด่านที่อ้างผังนั้นบอกสาเหตุได้
const byId = {}; for (const name in errors) byId[name.replace(/\.json$/, '')] = errors[name];
const res = loadLevelPack(historyJson, stations, byId);
if (!res.ok) {
  console.warn('ชุดด่าน history ใช้ไม่ได้:\n  ' + res.errors.join('\n  '));
  renderLoadError(res.errors);
} else {
  window.__sjBox = startApp({ pack: res.pack, save: createSave() });
}
