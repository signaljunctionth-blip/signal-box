// สถานะความคืบหน้าของชุดภารกิจสำหรับหน้าแผนที่และแผ่นข้อมูลสถานี — ฟังก์ชันล้วน ทดสอบใน Node ได้
// กติกาปลดล็อก (GDD ข้อ 5, docs/MISSIONS-NAMTOK.md ข้อ 4) ไม่ได้คิดที่นี่: ใช้ unlockState ของ sim ตัวเดียวกับที่หน้าเล่นใช้
// ไฟล์นี้แค่จัดรูปให้หน้าจอ: ดาวรวมต่อสถานี ภารกิจถัดไป และ "ยังขาดอะไร" เมื่อสถานีล็อก
//   pack     = ชุดภารกิจ ({ stations:[{station,tier,needStars}], levels:[{ i, id, station, name, teaches, error }] })
//   starsOf  = lv => ดาวที่ดีที่สุดของด่านนั้น (อ่านจากเซฟด้วย levelKey(lv))
//   unlockState = ฟังก์ชันจาก src/sim (ส่งเข้ามาเพื่อให้ไฟล์นี้ไม่ผูกกับ sim)
//   opts.skip   = ผู้เล่นกด "ข้ามบทสอน" แล้ว (ธงในเซฟ) ทุกสถานีของเส้นทางสอนเปิด ไม่ได้ดาว
//   opts.locked = ทั้งสายยังไม่เปิด (สายถัดไปก่อนผ่านเส้นทางสอน) ทุกสถานีล็อก lock.line = true (ไม่แก้ unlockState ของ sim)
//   opts.tutorial = false สำหรับชุดที่ไม่ใช่เส้นทางสอน: ไม่มีปุ่มข้ามบทสอน ไม่มีหน้าเลือกสาย
export function computeProgress(pack, starsOf, unlockState, { skip = false, locked = false, tutorial = true } = {}) {
  const U = unlockState(pack, starsOf, { skip });
  if (locked) { U.levels.forEach(l => { l.open = false; }); U.stations.forEach(s => { s.open = false; }); }
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
      lock: u.open ? null : { ...(locked ? { line: true } : {}), prevStation: prev && !locked ? prev.id : null, prevRemaining: prev && !locked ? prev.missions.length - prev.passed : 0, needStars: locked ? 0 : s.needStars || 0, haveStars: U.total, missingStars: locked ? 0 : Math.max(0, (s.needStars || 0) - U.total) },
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
    canSkip: tutorial && !skip && stations.some(s => !s.unlocked),
    // หน้าเลือกสายเปิดเมื่อผ่านสถานีขั้น 1–2 ของเส้นทางสอนครบ (ตอนนี้คือผ่านน้ำตกครบ)
    lineSelectOpen: tutorial && stations.some(s => s.tier <= 2) && stations.filter(s => s.tier <= 2).every(s => s.done),
    locked,
  };
}

// ความคืบหน้าของทุกชุดอาชีพ (ชุดแรก = เส้นทางสอน) สำหรับหน้าแผนที่ หน้าเลือกสาย และหน้าเล่น
//   packs   = ชุดภารกิจตามลำดับ CAREER_PACKS, starsOf = (packId, lv) => ดาวดีสุด
//   opts.active = id ชุดที่ผู้เล่นเลือกในหน้าเลือกสายล่าสุด (ธงในเซฟ) ใช้ตั้งปุ่มบนสุดของแผนที่
// สายถัดไปเปิดเมื่อเส้นทางสอนถึงหน้าเลือกสาย (lineSelectOpen) หรือผู้เล่นกดข้ามบทสอน
export function computeCareer(packs, starsOf, unlockState, { skip = false, active = null } = {}) {
  const [tut, ...rest] = packs;
  const T = computeProgress(tut, lv => starsOf(tut.id, lv), unlockState, { skip });
  const lineOpen = T.lineSelectOpen || T.skipped;
  const gate = (T.stations.filter(s => s.tier <= 2).pop() || {}).id || null; // สถานีที่ต้องผ่านก่อนเปิดสายอื่น (น้ำตก)
  const byPack = {}, stationPack = {}, byId = {}, lines = {};
  for (const p of packs) {
    const P = p === tut ? T : computeProgress(p, lv => starsOf(p.id, lv), unlockState, { locked: !lineOpen, tutorial: false });
    P.packId = p.id; P.line = p.line || null; P.tutorial = p === tut; P.name = p.name;
    for (const st of P.stations) { st.packId = p.id; if (st.lock && st.lock.line) st.lock.gate = gate; if (!stationPack[st.id]) { stationPack[st.id] = p.id; byId[st.id] = st; } }
    if (P.line && !lines[P.line]) lines[P.line] = p.id;
    byPack[p.id] = P;
  }
  const open = id => byPack[id] && !byPack[id].locked;
  let act = active && open(active) ? active : null;
  if (!act) act = !lineOpen || T.next ? tut.id : ((rest.find(p => open(p.id) && byPack[p.id].next) || {}).id || tut.id);
  return {
    packs: byPack, order: packs.map(p => p.id), tutorial: T, lineOpen, gate, stationPack, byId, lines, active: act,
    totalStars: packs.reduce((n, p) => n + byPack[p.id].totalStars, 0), maxStars: packs.reduce((n, p) => n + byPack[p.id].maxStars, 0),
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
