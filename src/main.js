// หน้าแรกของเกมใหม่ (M0): ยังไม่มีเกมจริง มีแค่หน้าแบรนด์และลิงก์ไปต้นแบบ v2
import './fonts.css';
import './style.css';

/* global __APP_VERSION__ */
const ver = document.getElementById('ver');
if (ver) ver.textContent = `รุ่น ${__APP_VERSION__}`;
