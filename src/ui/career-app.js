// โครงแอปของเกมใหม่ (โหมดอาชีพ): เวทีแนวนอน + ตัวสลับหน้าจอ หน้าแรก -> แผนที่ -> แผ่นข้อมูลสถานี -> หน้าจอเล่นด่าน
// หน้าแรกโหลดเบา: แผนที่ ตัวจำลอง ผังสถานี และชุดด่าน โหลดครั้งเดียวตอนออกจากหน้าแรก (dynamic import)
// ดาวอ่าน/เขียนผ่าน src/save ด้วย key = levelKey(lv) ของ sim และสถานะปลดล็อกใช้ unlockState ของ sim: แผนที่กับหน้าเล่นจึงตรงกันเสมอ
import { createStage, canFullscreen, toggleFullscreen, watchFullscreen } from './stage.js';
import { createRouter } from './router.js';
import { computeCareer, canPlay } from './progress.js';
import { createCareerSave } from './career-save.js';
import { CAREER_PACK_ID, CAREER_PACKS } from './career-id.js';
import { scene } from '../audio/index.js';
import { installSoundMenu } from '../audio/ui.js';

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// opts: { save (จาก src/save), loadMap: () => Promise<ข้อมูลแผนที่>, mountPlay? (แทนหน้าจอเล่นทั้งตัว ใช้ในเทสต์) }
export function startCareerApp({ save, loadMap, mountPlay = null }) {
  const $ = id => document.getElementById(id);
  const stage = createStage($('stage'));
  installSoundMenu(stage);
  const screens = { home: $('s-home'), map: $('s-map'), play: $('s-play'), build: $('s-build') };
  // ดาวเก็บแยกตาม id ชุด (เซฟเดิมของเส้นทางสอนอยู่ที่ 'namtok' เหมือนเดิม) career = ตัวห่อของเส้นทางสอน
  const saves = Object.fromEntries(CAREER_PACKS.map(id => [id, createCareerSave(save, id)])), career = saves[CAREER_PACK_ID];
  const allStars = () => CAREER_PACKS.reduce((n, id) => n + save.totalStars(id), 0);
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const memFlags = {};
  let sheetStation = null; // สถานีของแผ่นข้อมูลที่เปิดล่าสุดบนแผนที่ (หน้าที่อยู่ก่อนหน้าจอเล่นในประวัติ)
  // ทางเข้า #dev: เปิดเฉพาะ dev server (import.meta.env.DEV) และเบราว์เซอร์ที่เครื่องมือทดสอบขับอยู่ (navigator.webdriver ตั้งโดย Playwright/WebDriver เท่านั้น)
  // build สำหรับผู้เล่นไม่มีทางเปิดจาก URL (เลิกรับ ?dev แล้ว) ผู้เล่นพิมพ์ #dev แล้วถูกพาไปแผนที่
  const devAllowed = () => !!(import.meta.env && import.meta.env.DEV) || navigator.webdriver === true;
  let D = null, mapData = null, mapScreen = null, loading = null, play = null, shown = null, keyboardNav = false;
  let build = null, buildPack = null, buildMem = null; // หน้าโหมดสร้าง (โหลดเมื่อเปิดครั้งแรก) และชุดด่านทดลองเดินรถล่าสุด
  window.addEventListener('keydown', () => { keyboardNav = true; }, true);
  window.addEventListener('pointerdown', () => { keyboardNav = false; }, true);

  // อ่านเซฟจากที่เก็บใหม่ (อีกแท็บอาจเขียนไปแล้ว) ถ้าอ่านแล้วดาวน้อยกว่าที่มีในหน่วยความจำ แปลว่าที่เก็บใช้ไม่ได้ (โหมดส่วนตัว/เต็ม)
  // ให้คงความคืบหน้าในหน่วยความจำไว้ ไม่งั้นผู้เล่นที่เซฟไม่ได้จะเห็นดาวหายทุกครั้งที่กลับแผนที่
  function reloadSave() {
    const before = allStars(), code = save.exportCode();
    save.reload();
    if (allStars() < before) save.importCode(code);
  }
  const starsOf = (packId, lv) => saves[packId].stars(D.levelKey(lv));
  // ธง "ข้ามบทสอน" (WP4.5) อยู่ในเซฟ: เปิดทุกสถานีของเส้นทางสอน และเปิดสายถัดไป ไม่ให้ดาว
  const SKIP_FLAG = 'skipTutorial', LINE_FLAG = 'careerLine';
  const flagVal = (k, d) => (Object.hasOwn(memFlags, k) ? memFlags[k] : save.getFlag ? save.getFlag(k, d) : d);
  const putFlag = (k, v) => { memFlags[k] = v; if (save.setFlag) save.setFlag(k, v); };
  // ความคืบหน้าของทุกชุดอาชีพ (หน้าแผนที่ หน้าเลือกสาย) และของเส้นทางสอนอย่างเดียว (โหมดสร้าง hook เดิมของเทสต์)
  const careerP = () => computeCareer(D.careers, starsOf, D.unlockState, { skip: flagVal(SKIP_FLAG, false) === true, active: flagVal(LINE_FLAG, null) });
  const progress = () => careerP().tutorial;
  const packById = id => D.careers.find(p => p.id === id) || null;
  const packOfStation = id => packById(careerP().stationPack[id]);
  // ขั้นอัปเกรดเริ่มต้นของสถานี: ชุดที่มียุคน้อยกว่าขั้นอัปเกรดทั้งหมด เริ่มจากยุคท้าย ๆ (สายอีสานเริ่มที่ไฟสี)
  const baseOf = id => { const p = D && D.careers.find(x => x.stations.some(s => s.station === id)); return p ? Math.max(0, D.econ.UPGRADES.length - p.eras.length) : 0; };

  function closePlay() { if (play) { play.destroy(); play = null; } screens.play.innerHTML = ''; }
  function showOnly(name) {
    for (const k in screens) screens[k].hidden = k !== name;
    if (name !== 'map' && mapScreen) mapScreen.hide();
    if (name !== 'play') closePlay();
    if (name !== 'build' && build) { build.destroy(); build = null; }
    if (name !== 'build' && name !== 'play') buildMem = null;
    stage.el.scrollTop = 0; stage.el.scrollLeft = 0;
    // เพลงหน้าแผนที่เล่นทั้งหน้าแรกและแผนที่ หน้าเล่นเลือกเพลงเอง (screen-play.js)
    if (name !== 'play') scene('map');
    shown = name;
  }
  function paintHome() {
    const b = $('b-map');
    if (b) b.textContent = CAREER_PACKS.some(id => save.hasProgress(id)) ? 'เล่นต่อ' : 'เริ่มเล่น';
  }

  // โหลดของเกมครั้งเดียว: ไฟล์แผนที่ หน้าแผนที่ ข้อมูลผัง+ชุดด่าน (ผ่านตัวตรวจของ sim) และหน้าจอเล่น
  function ensureGame() {
    if (mapScreen) return Promise.resolve();
    loading ||= Promise.all([loadMap(), import('./screen-map.js'), import('./career-data.js'), import('./screen-play.js'), import('./wallet.js')]).then(([data, mapMod, dataMod, playMod, walletMod]) => {
      mapData = data; D = dataMod.loadCareer(); D.mountPlay = mountPlay || playMod.mountPlay;
      if (!D.career) throw new Error(`ชุดภารกิจ ${CAREER_PACK_ID} ใช้ไม่ได้: ${(D.packErrors[CAREER_PACK_ID] || ['ไม่พบไฟล์'])[0]}`);
      // กระเป๋างบกลาง (WP7): งบที่ได้คิดจากผลดีสุดของทุกภารกิจในทุกชุดอาชีพทุกครั้ง
      D.econ = walletMod;
      D.wallet = walletMod.createWallet(save, () => D.careers.flatMap(p => p.levels.map(l => save.getBest(p.id, D.levelKey(l)))), undefined, baseOf);
      screens.map.classList.remove('loading');
      mapScreen = mapMod.createMapScreen({
        root: screens.map, stage, map: data, packs: D.careers, geo: D.geo, getProgress: careerP, reducedMotion: () => motion.matches,
        // ธงเล็ก ๆ ในเซฟ (เช่น เคยดูกล้องเลื่อนเข้าเส้นทางสอนแล้ว) ถ้า src/save ยังไม่มี getFlag/setFlag จะจำแค่ในหน่วยความจำ
        flags: { get: k => !!flagVal(k, false), set: k => putFlag(k, true) },
        // เลือกสายในหน้าเลือกสาย: จำไว้เป็นสายที่เล่นอยู่ (ปุ่มบนสุดของแผนที่พาไปสายนี้)
        onLine: packId => putFlag(LINE_FLAG, packId),
        onHome: () => router.go({ screen: 'home' }),
        onStation: id => {
          const cur = router.current();
          if (id) (cur.stationId ? router.replace : router.go).call(router, { screen: 'map', stationId: id });
          else if (cur.stationId) router.back({ screen: 'map' });
        },
        onPlay: (stationId, missionId) => router.go({ screen: 'play', stationId, missionId }),
        onSkip: () => putFlag(SKIP_FLAG, true),
        // เดินรถอิสระและอัปเกรดระบบสัญญาณของสถานีที่ผ่านครบแล้ว
        getFree: (id, msg) => freeInfo(id, msg),
        onEra: (id, level) => {
          const r = D.wallet.choose(id, level), era = packOfStation(id).eras[level - D.wallet.base(id)], name = era ? era.name : '';
          return r.ok ? (r.cost ? `อัปเกรดเป็น${name}แล้ว ใช้งบ ${r.cost}` : `เปลี่ยนเป็น${name}แล้ว`) : r.reason;
        },
        onFree: id => router.go({ screen: 'free', stationId: id }),
      });
    });
    return loading;
  }
  function loadError(err) {
    console.error(err);
    showOnly('map');
    screens.map.classList.remove('loading');
    screens.map.innerHTML = '<div class="wip"><div class="wip-t"><h2>โหลดเกมไม่ได้</h2><p class="lead">ลองโหลดหน้านี้ใหม่อีกครั้ง</p><div class="actions"><a class="btn go" href="./">กลับหน้าแรก</a></div></div></div>';
    loading = null;
  }

  function stationInfo(id) {
    const s = (mapData && mapData.namtok.stations.find(x => x.id === id)) || D.geo[id], pk = packOfStation(id), p = pk ? pk.stations.findIndex(x => x.station === id) : -1, L = D.stations[id];
    return { id, name_th: s ? s.name_th : L ? L.name : id, name_en: s ? s.name_en : '', tier: p < 0 ? null : pk.stations[p].tier, order: p + 1 };
  }
  const base = () => ({ stage, reducedMotion: () => motion.matches });

  // ภารกิจของแผนที่: ต้องปลดล็อกแล้ว ถ้ายังไม่มีข้อมูลเล่นจริง หน้าจอเล่นขึ้น "กำลังสร้าง" เอง
  function openPlay({ stationId, missionId }) {
    const CP = careerP(), packId = CP.stationPack[stationId], P = CP.packs[packId], pack = packById(packId);
    if (!P || !canPlay(P, stationId, missionId)) return router.replace({ screen: 'map', stationId: CP.byId[stationId] ? stationId : undefined });
    showOnly('play'); closePlay();
    const index = pack.levels.findIndex(l => D.levelKey(l) === missionId), lv = pack.levels[index];
    const ctx = {
      ...base(), pack, mission: P.byId[stationId].missions.find(m => m.id === missionId), station: stationInfo(stationId),
      game: !lv || lv.error ? null : { pack, index }, stationNote: (pack.stations.find(s => s.station === stationId) || {}).note_th || '',
      finish({ stars = 0, score = 0 } = {}) {
        // งบจ่ายเฉพาะส่วนที่ดีกว่าผลดีสุดเดิม คิดก่อนบันทึกผลรอบนี้ (0 ดาวไม่ได้งบ)
        const pay = D.econ.payout(save.getBest(packId, missionId), { stars, score });
        const note = stars > 0 ? (pay > 0 ? `ได้งบ +${pay} (ส่วนที่ดีกว่าผลเดิม)` : 'งบเท่าเดิม ได้งบเพิ่มเมื่อทำได้ดีกว่าผลเดิม') : '';
        const before = careerP(), saved = stars > 0 ? saves[packId].setStars(missionId, stars, score) : true, after = careerP(), mineP = after.packs[packId];
        paintHome();
        if (mapScreen) mapScreen.refresh();
        // ภารกิจถัดไปที่เสนอ: อันถัดไปในสถานีเดียวกันถ้าเปิดแล้ว ไม่งั้นอันแรกที่ยังไม่ผ่านของทั้งเส้นทาง
        const mine = after.byId[stationId].missions, at = mine.findIndex(m => m.id === missionId), nx = mine[at + 1];
        const next = nx && nx.unlocked ? { stationId, missionId: nx.id } : mineP.next && mineP.next.missionId !== missionId ? mineP.next : null;
        // สถานีที่เพิ่งเปิดของทุกสาย (ผ่านน้ำตกครบ = สถานีแรกของสายอีสานเปิดด้วย)
        return { saved, next, note, newlyUnlocked: Object.values(after.byId).filter(s => s.unlocked && before.byId[s.id] && !before.byId[s.id].unlocked).map(s => ({ id: s.id, name: stationInfo(s.id).name_th })) };
      },
      // กลับไปแผ่นข้อมูลของสถานีของภารกิจนี้เสมอ: ถ้าหน้าก่อนในประวัติคือแผ่นของสถานีนี้ ถอย 1 ขั้น ไม่งั้น (เช่น มาจาก "ภารกิจถัดไป" ข้ามสถานี) แทนที่หน้า
      exit: () => (sheetStation === stationId ? router.back({ screen: 'map', stationId }) : router.replace({ screen: 'map', stationId })),
      play: (mId, sId = stationId) => router.replace({ screen: 'play', stationId: sId, missionId: mId }),
    };
    play = D.mountPlay(screens.play, { stationId, missionId }, ctx) || { destroy() {} };
  }

  // ทางเข้าสำหรับนักพัฒนา: #dev = รายการทุกชุดด่าน, #dev/<pack>/<key> = เล่นด่านนั้นเลยโดยไม่ดูการปลดล็อก (ดาวเก็บแยกตาม id ของชุดนั้น)
  function openDev({ packId, missionId }) {
    showOnly('play'); closePlay();
    const pack = packId && D.packs[packId], index = pack ? pack.levels.findIndex(l => D.levelKey(l) === missionId) : -1;
    if (index < 0) {
      const rows = Object.values(D.packs).map(p => `<section><h3>${esc(p.name)} <small>${esc(p.id)}</small></h3><ul>${p.levels.map(l => `<li><a class="btn sm" href="#dev/${esc(p.id)}/${esc(D.levelKey(l))}">${esc(D.levelKey(l))} · ${esc(l.name)}</a>${l.error ? `<span class="bad">${esc(l.error)}</span>` : `<span>${esc(l.station)} · ${save.getBest(p.id, D.levelKey(l)).stars || save.getStars(p.id, l.i)} ดาว</span>`}</li>`).join('')}</ul></section>`).join('');
      const errs = Object.entries({ ...D.stationErrors, ...D.packErrors }).map(([k, v]) => `<li class="bad">${esc(k)}: ${esc(v[0])}</li>`).join('');
      screens.play.innerHTML = `<div class="dev"><header><a class="btn sm" href="#map">แผนที่</a><h2>ทางเข้าสำหรับนักพัฒนา</h2></header><p class="muted">เล่นด่านของชุดด่านใดก็ได้โดยไม่ผ่านการปลดล็อก ใช้ทดสอบเท่านั้น</p>${errs ? `<ul>${errs}</ul>` : ''}${rows}</div>`;
      return;
    }
    const lv = pack.levels[index], st = (pack.stations || []).find(s => s.station === lv.station), L = D.stations[lv.station];
    const ctx = {
      ...base(), dev: true, pack, game: { pack, index }, stationNote: (st && st.note_th) || '',
      mission: { id: missionId, name: lv.name, teaches: lv.teaches || '', stars: save.getBest(packId, missionId).stars },
      station: { id: lv.station, name_th: L ? L.name : lv.station, name_en: '', tier: st ? st.tier : null, order: 0 },
      finish({ stars = 0, score = 0 } = {}) {
        // ชุดภารกิจจริงของแผนที่: ทางเข้านักพัฒนาไม่เขียนเซฟ (ข้ามการปลดล็อกมาได้ ดาวจึงไม่นับ) ชุดทดสอบอื่นเก็บแยกตาม id ของชุดนั้น
        const real = CAREER_PACKS.includes(packId), saved = real || stars <= 0 ? true : save.setBest(packId, missionId, { stars, score }), nx = pack.levels[index + 1];
        return { saved, note: real ? 'เข้าทางนักพัฒนา ดาวของภารกิจนี้ไม่ถูกบันทึก' : '', newlyUnlocked: [], next: nx && !nx.error ? { stationId: null, missionId: D.levelKey(nx) } : null };
      },
      exit: () => router.back({ screen: 'dev' }),
      play: mId => router.replace({ screen: 'dev', packId, missionId: mId }),
    };
    play = D.mountPlay(screens.play, { stationId: lv.station, missionId }, ctx) || { destroy() {} };
  }

  // ข้อมูลกล่องเดินรถอิสระบนแผ่นสถานี (station-sheet.js freeHtml)
  // ขั้นอัปเกรด = ดัชนี UPGRADES (ทั้งเกม) ยุคที่เลือกได้ = eras ของชุดของสถานี เริ่มที่ขั้น base ของสถานี
  function freeInfo(id, msg = '') {
    const W = D.wallet, owned = W.owned(id), base = W.base(id), pk = packOfStation(id);
    return { balance: W.balance(), owned, selected: W.selected(id), msg,
      levels: pk.eras.map((e, i) => ({ level: base + i, name: e.name, cost: D.econ.upgradeCost(owned, base + i), gain: (D.econ.UPGRADES[base + i] || {}).gain || '' })) };
  }
  // เดินรถอิสระของสถานีที่ผ่านครบ: ระบบสัญญาณตามขั้นที่เลือก ตารางขบวนเกมจัดให้ ไม่นับดาวและงบ (อัปเกรดไม่แตะภารกิจสอน)
  function openFree({ stationId }) {
    const st = careerP().byId[stationId], L = D.stations[stationId], pk = packOfStation(stationId);
    if (!st || !st.done || !L || !pk) return router.replace({ screen: 'map', stationId: st ? stationId : undefined });
    const level = D.wallet.selected(stationId), up = D.econ.upgradeOf(level), era = Math.min(pk.eras.length - 1, level - D.wallet.base(stationId));
    const r = D.econ.freePlayPack(L, pk.eras, { era, speed: up.speed, grace: up.grace });
    if (!r.ok) return router.replace({ screen: 'map', stationId });
    showOnly('play'); closePlay();
    const pack = r.pack, lv = pack.levels[0];
    const ctx = {
      // dev: true ทำให้ปุ่มท้ายด่านเขียนว่า "กลับ" ชุดด่านนี้ไม่มี note จึงไม่มีผลอื่น
      ...base(), dev: true, pack, game: { pack, index: 0 }, stationNote: (pk.stations.find(s => s.station === stationId) || {}).note_th || '',
      mission: { id: 'free', name: `เดินรถอิสระ · ${pk.eras[era].name}`, teaches: lv.teaches || '', stars: 0 },
      station: stationInfo(stationId),
      finish: ({ score = 0, stars = 0 } = {}) => {
        const rec = stars > 0 ? D.wallet.freeRecord(stationId, level, score) : null;
        const best = rec ? (rec.isNew ? ` · สถิติใหม่ของขั้นนี้ ${rec.best}` : ` · สถิติดีสุดของขั้นนี้ ${rec.best}`) : '';
        return { saved: true, note: `เดินรถอิสระไม่นับดาวและงบ${best}`, newlyUnlocked: [], next: null };
      },
      exit: () => router.back({ screen: 'map', stationId }),
      play: () => router.replace({ screen: 'free', stationId }),
    };
    play = D.mountPlay(screens.play, { stationId, missionId: 'free' }, ctx) || { destroy() {} };
  }

  // โหมดสร้าง (GDD ข้อ 7): ปลดล็อกเมื่อผ่านสถานีขั้น 1–2 ของเส้นทางสอนครบ (เกณฑ์เดียวกับหน้าเลือกสาย)
  // ลิงก์แชร์ผัง (#share=) เปิดได้เสมอ เพื่อนที่เพิ่งเริ่มเกมก็เล่นผังที่ได้รับได้ทันที (GDD ข้อ 11)
  const buildOpen = () => { const P = progress(); return P.lineSelectOpen || P.skipped || devAllowed(); };
  function openBuild(r) {
    if (r.play) return openBuildPlay();
    if (!r.share && !buildOpen()) {
      showOnly('build');
      const st = D.career.stations.filter(s => s.tier <= 2).map(s => stationInfo(s.station).name_th).join(' ');
      screens.build.innerHTML = `<div class="wip"><div class="wip-t"><h2>โหมดสร้างยังล็อกอยู่</h2><p class="lead">ผ่านทุกภารกิจของสถานี ${esc(st)} ก่อน แล้วจะสร้างผังสถานีเองได้</p><div class="actions"><a class="btn go" href="#map">ไปแผนที่</a></div></div></div>`;
      return;
    }
    return import('./screen-build.js').then(mod => {
      if (!same(router.current(), r)) return;
      showOnly('build');
      build = mod.createBuildScreen({
        root: screens.build, stage, eras: D.career.eras, wallet: D.wallet, econ: D.econ,
        onExit: () => router.back({ screen: 'home' }),
        onPlay: (pack, name) => { buildPack = { pack, name }; buildMem = build.memo(); router.go({ screen: 'build', play: true }); },
      });
      // เปิดจากลิงก์แชร์: โหลดผังของเพื่อน (ที่อยู่ยังเป็น #share= โหลดหน้าใหม่ก็ได้ผังเดิม)
      // กลับมาจากทดลองเดินรถ: ใช้ผังที่ค้างในหน่วยความจำ (ผังที่ได้รับยังไม่ได้บันทึกทับผังของผู้เล่น)
      if (r.share && !buildMem) build.openShared(r.share);
      else if (buildMem) build.restore(buildMem);
    });
  }
  // ทดลองเดินรถบนผังที่สร้าง: ใช้หน้าจอเล่นเดิมทั้งตัว (ส่งชุดด่านผ่าน ctx.game) ไม่บันทึกดาว
  function openBuildPlay() {
    if (!buildPack) return router.back({ screen: 'build' }); // โหลดหน้าใหม่: ชุดด่านทดลองไม่ได้เก็บไว้ ถอยกลับหน้าโหมดสร้าง (ไม่ซ้อน #build ในประวัติ)
    showOnly('play'); closePlay();
    const { pack, name } = buildPack, lv = pack.levels[0];
    const ctx = {
      // dev: true ทำให้ปุ่มท้ายด่านเขียนว่า "กลับ" (กลับหน้าโหมดสร้าง ไม่ใช่แผนที่) ชุดด่านนี้ไม่มี note จึงไม่มีผลอื่น
      ...base(), dev: true, pack, game: { pack, index: 0 }, stationNote: 'ผังนี้ผู้เล่นสร้างเองในโหมดสร้าง ตารางขบวนเกมจัดให้',
      mission: { id: 'free', name: lv.name, teaches: lv.teaches || '', stars: 0 },
      station: { id: lv.station, name_th: name, name_en: '', tier: null, order: 0 },
      finish: () => ({ saved: true, note: 'ผังที่สร้างเองไม่นับดาว', newlyUnlocked: [], next: null }),
      exit: () => router.back({ screen: 'build' }),
      play: () => router.replace({ screen: 'build', play: true }),
    };
    play = D.mountPlay(screens.play, { stationId: lv.station, missionId: 'free' }, ctx) || { destroy() {} };
  }

  const same = (a, b) => a.screen === b.screen && a.stationId === b.stationId && a.missionId === b.missionId && a.packId === b.packId && a.share === b.share && a.play === b.play;
  function onRoute(r) {
    if (r.screen === 'home') { showOnly('home'); paintHome(); return; }
    if (!mapScreen) { showOnly('map'); screens.map.classList.add('loading'); }
    ensureGame().then(() => {
      if (!same(router.current(), r)) return; // ผู้เล่นไปหน้าอื่นแล้ว
      if (r.screen === 'play') return openPlay(r);
      if (r.screen === 'build') return openBuild(r);
      if (r.screen === 'free') return openFree(r);
      if (r.screen === 'dev') return devAllowed() ? openDev(r) : router.replace({ screen: 'map' });
      if (r.stationId && !careerP().byId[r.stationId]) return router.replace({ screen: 'map' });
      reloadSave(); // อีกแท็บอาจเพิ่งได้ดาว: อ่านเซฟล่าสุดทุกครั้งที่กลับเข้าแผนที่
      sheetStation = r.stationId || null;
      showOnly('map');
      mapScreen.show(r.stationId, { focus: keyboardNav });
    }).catch(loadError);
  }
  const router = createRouter(onRoute);

  // หน้าแรก: ปุ่มหลักเป็นลิงก์ #map อยู่แล้ว ดักไว้เพื่อให้ปุ่มย้อนกลับพากลับหน้าแรกถูก
  const bMap = $('b-map');
  if (bMap) bMap.addEventListener('click', e => { if (e.ctrlKey || e.metaKey || e.shiftKey || e.button) return; e.preventDefault(); router.go({ screen: 'map' }); });
  // แผ่นเครดิตของหน้าแรก: ปิดด้วยปุ่มปิดหรือ Esc แล้วคืนโฟกัสให้ปุ่ม "เครดิต"
  const credits = document.querySelector('#s-home .credits');
  if (credits) {
    const close = () => { if (credits.open) { credits.open = false; credits.querySelector('summary').focus({ preventScroll: true }); } };
    credits.addEventListener('click', e => { if (e.target.closest('[data-act="close-credits"]')) { e.preventDefault(); close(); } });
    credits.addEventListener('toggle', () => { if (credits.open) credits.querySelector('#credits-title').setAttribute('tabindex', '-1'), credits.querySelector('#credits-title').focus({ preventScroll: true }); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && shown !== 'map' && shown !== 'play') close(); });
  }
  // ปุ่มเต็มจอทุกหน้าจอ (หน้าแรก แผนที่ หน้าเล่น) ใช้ data-act="full" ตัวเดียวกัน: ดักที่เวทีที่เดียว
  const bFull = $('b-full');
  if (bFull) bFull.hidden = !canFullscreen();
  stage.el.addEventListener('click', e => { if (e.target.closest('[data-act="full"]')) toggleFullscreen(); });
  watchFullscreen();

  // แท็บกลับมาแสดง: อีกแท็บอาจเขียนเซฟไปแล้ว อ่านใหม่แล้ววาดความคืบหน้า (หน้าแรก ป้ายสถานี แผ่นข้อมูล)
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { reloadSave(); paintHome(); if (mapScreen && shown === 'map') mapScreen.refresh(); } });

  router.start();

  // hook สำหรับบอททดสอบ (แบบเดียวกับ window.__sjBox ของโหมดประวัติศาสตร์)
  //   await __sjApp.ready()                         โหลดข้อมูลเกม
  //   await __sjApp.openMission(stationId, id)      เปิดภารกิจของแผนที่ (ต้องปลดล็อกแล้ว)
  //   await __sjApp.openDev(packId, key)            เปิดด่านของชุดใดก็ได้ เช่น ('test-crossing', 'x-1')
  //   __sjApp.play                                  hook ของด่านที่เปิดอยู่: g, snapshot(), start(), step(วินาที), press(target), nextTarget(), hint(), targetClient(target), hitTest(x, y)
  const settle = () => new Promise(r => setTimeout(r, 0));
  return {
    stage, router, save, career, careers: saves,
    ready: () => ensureGame(),
    progress: () => (D ? progress() : null),
    careerProgress: () => (D ? careerP() : null),
    get data() { return D; }, get pack() { return D && D.career; },
    get map() { return mapScreen && mapScreen.debug; },
    get play() { return play && play.api ? play.api : null; },
    async openMission(stationId, missionId) { await ensureGame(); router.go({ screen: 'play', stationId, missionId }); await settle(); await settle(); return this.play; },
    async openDev(packId, missionId) { await ensureGame(); router.go({ screen: 'dev', packId, missionId }); await settle(); await settle(); return this.play; },
    refresh() { paintHome(); if (mapScreen) mapScreen.refresh(); },
  };
}
