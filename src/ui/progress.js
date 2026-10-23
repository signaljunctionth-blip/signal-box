// สถานะความคืบหน้าของชุดภารกิจสำหรับหน้าแผนที่และแผ่นข้อมูลสถานี — ฟังก์ชันล้วน ทดสอบใน Node ได้
// กติกาปลดล็อก (GDD ข้อ 5, docs/MISSIONS-NAMTOK.md ข้อ 4) ไม่ได้คิดที่นี่: ใช้ unlockState ของ sim ตัวเดียวกับที่หน้าเล่นใช้
// ไฟล์นี้แค่จัดรูปให้หน้าจอ: ดาวรวมต่อสถานี ภารกิจถัดไป และ "ยังขาดอะไร" เมื่อสถานีล็อก
//   pack     = ชุดภารกิจ ({ stations:[{station,tier,needStars}], levels:[{ i, id, station, name, teaches, error }] })
//   starsOf  = lv => ดาวที่ดีที่สุดของด่านนั้น (อ่านจากเซฟด้วย levelKey(lv))
//   unlockState = ฟังก์ชันจาก src/sim (ส่งเข้ามาเพื่อให้ไฟล์นี้ไม่ผูกกับ sim)
//   opts.skip   = ผู้เล่นกด "ข้ามบทสอน" แล้ว (ธงในเซฟ) ทุกสถานีของเส้นทางสอนเปิด ไม่ได้ดาว
export function computeProgress(pack, starsOf, unlockState, { skip = false } = {}) {
  const U = unlockState(pack, starsOf, { skip });
  const stations = [];
  let prev = null;
  pack.stations.forEach((s, index) => {
    const u = U.stations[index];
    const missions = pack.levels.filter(l => l.station === s.station).map(l => ({ id: l.id, name: l.name, teaches: l.teaches || '', stars: U.levels[l.i].stars, unlocked: U.levels[l.i].open, playable: !l.error }));
    const passed = missions.filter(m => m.stars > 0).length, done = missions.length > 0 && passed === missions.length;
    const st = {
      id: s.station, index, order: index + 1, tier: s.tier, needStars: s.needStars || 0,
      missions, stars: u.stars, maxStars: u.max, passed, done, unlocked: u.open,
      state: !u.open ? 'locked' : done ? 'done' : 'open',
      // เงื่อนไขที่ยังขาด (null เมื่อเปิดแล้ว)
      lock: u.open ? null : { prevStation: prev ? prev.id : null, prevRemaining: prev ? prev.missions.length - prev.passed : 0, needStars: s.needStars || 0, haveStars: U.total, missingStars: Math.max(0, (s.needStars || 0) - U.total) },
      next: u.open ? (missions.find(m => m.unlocked && m.stars === 0) || null) : null,
    };
    stations.push(st);
    prev = st;
  });
  // ภารกิจที่ควรเล่นต่อ: อันแรกที่เปิดแล้วยังไม่ผ่าน ไล่ตามลำดับสถานี
  let next = null;
  for (const st of stations) if (st.next) { next = { stationId: st.id, missionId: st.next.id }; break; }
  const current = next ? next.stationId : (stations.filter(s => s.unlocked).pop() || stations[0] || {}).id || null;
  return {
    stations, byId: Object.fromEntries(stations.map(s => [s.id, s])),
    totalStars: U.total, maxStars: pack.levels.length * 3,
    next, current, hasProgress: U.total > 0, skipped: !!skip,
    // ปุ่ม "ข้ามบทสอน" ขึ้นเมื่อยังไม่ได้กดและยังมีสถานีล็อกอยู่
    canSkip: !skip && stations.some(s => !s.unlocked),
    // หน้าเลือกสายเปิดเมื่อผ่านสถานีขั้น 1–2 ของเส้นทางสอนครบ (ตอนนี้คือผ่านน้ำตกครบ)
    lineSelectOpen: stations.some(s => s.tier <= 2) && stations.filter(s => s.tier <= 2).every(s => s.done),
  };
}

// ภารกิจที่ผ่านแล้วแต่ยังไม่ได้ 3 ดาว เรียงจากดาวน้อยไปมาก ใช้ชี้ทางเมื่อดาวสะสมไม่พอ
export function improvable(progress, limit = 3) {
  const out = [];
  for (const st of progress.stations) for (const m of st.missions) if (m.stars > 0 && m.stars < 3) out.push({ stationId: st.id, missionId: m.id, name: m.name, stars: m.stars });
  return out.sort((a, b) => a.stars - b.stars).slice(0, limit);
}

// ตรวจว่าเปิดเล่นภารกิจนี้ได้ไหม (ใช้กับลิงก์ตรงเข้าหน้าจอเล่น)
export function canPlay(progress, stationId, missionId) {
  const st = progress.byId[stationId];
  const m = st && st.missions.find(x => x.id === missionId);
  return !!(m && m.unlocked);
}
