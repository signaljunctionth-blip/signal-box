// จุดเริ่มของเกมใหม่ (โหมดอาชีพ): หน้าแรก -> แผนที่ประเทศไทย -> สถานี -> เล่นภารกิจ
// ไฟล์แผนที่ (data/thailand-map.json) โหลดครั้งเดียวตอนเปิดหน้าแผนที่ครั้งแรก ถูกรวมเป็นไฟล์แยกตอน build ไม่มีคำขอออกนอกเครื่อง
import './fonts.css';
import './style.css';
import './ui/map.css';
import { createSave } from './save/index.js';
import { startCareerApp } from './ui/career-app.js';

/* global __APP_VERSION__ */
const ver = document.getElementById('ver');
if (ver) ver.textContent = `รุ่น ${__APP_VERSION__}`;

// ชุดภารกิจของแผนที่ ผังสถานี และหน้าจอเล่น โหลดใน ui/career-data.js (ดูหัวไฟล์นั้นเรื่อง data/levels/namtok.json)
window.__sjApp = startCareerApp({
  save: createSave(),
  loadMap: () => import('../data/thailand-map.json').then(m => m.default),
});
