// ตัวสลับหน้าจอแบบง่าย ใช้ส่วน # ของ URL (ปุ่มย้อนกลับของเครื่องใช้ได้ และเปิดลิงก์ตรงเข้าหน้าได้)
//   ''                         หน้าแรก
//   '#map'                     แผนที่
//   '#map/<stationId>'         แผนที่ + แผ่นข้อมูลสถานี
//   '#play/<stationId>/<missionId>'  หน้าจอเล่นด่าน
//   '#dev' และ '#dev/<packId>/<missionId>'  ทางเข้าสำหรับนักพัฒนา: เล่นด่านของชุดด่านใดก็ได้โดยไม่ผ่านการปลดล็อก
// parseRoute / formatRoute เป็นฟังก์ชันล้วน ทดสอบใน Node ได้
const ID = /^[a-z0-9-]+$/;

export function parseRoute(hash) {
  const parts = String(hash || '').replace(/^#\/?/, '').split('/').filter(Boolean);
  const ok = s => typeof s === 'string' && ID.test(s);
  if (parts[0] === 'map') return ok(parts[1]) ? { screen: 'map', stationId: parts[1] } : { screen: 'map' };
  if (parts[0] === 'play' && ok(parts[1]) && ok(parts[2])) return { screen: 'play', stationId: parts[1], missionId: parts[2] };
  if (parts[0] === 'dev') return ok(parts[1]) && ok(parts[2]) ? { screen: 'dev', packId: parts[1], missionId: parts[2] } : { screen: 'dev' };
  return { screen: 'home' };
}
export function formatRoute(r) {
  if (!r || r.screen === 'home') return '';
  if (r.screen === 'map') return r.stationId ? `#map/${r.stationId}` : '#map';
  if (r.screen === 'play') return `#play/${r.stationId}/${r.missionId}`;
  if (r.screen === 'dev') return r.packId ? `#dev/${r.packId}/${r.missionId}` : '#dev';
  return '';
}

export function createRouter(onRoute, win = window) {
  const depth = () => (win.history.state && win.history.state.sj) || 0;
  const url = r => win.location.pathname + win.location.search + formatRoute(r);
  const emit = () => onRoute(parseRoute(win.location.hash));
  win.addEventListener('popstate', emit);
  return {
    current: () => parseRoute(win.location.hash),
    // ไปหน้าใหม่ (เพิ่มประวัติ 1 ขั้น)
    go(r) { win.history.pushState({ sj: depth() + 1 }, '', url(r)); emit(); },
    // แทนที่หน้าปัจจุบันโดยไม่เพิ่มประวัติ
    replace(r) { win.history.replaceState({ sj: depth() }, '', url(r)); emit(); },
    // ถอยกลับ 1 ขั้นถ้าขั้นก่อนหน้าเป็นของเกม ไม่งั้นแทนที่ด้วย fallback (กรณีเปิดลิงก์ตรงเข้ามา)
    back(fallback) { if (depth() > 0) win.history.back(); else this.replace(fallback); },
    start: emit,
  };
}
