// โครงแอปของเกมใหม่ (โหมดอาชีพ): เวทีแนวนอน + ตัวสลับหน้าจอ หน้าแรก -> แผนที่ -> แผ่นข้อมูลสถานี -> หน้าจอเล่นด่าน
// หน้าแรกโหลดเบา: แผนที่ ตัวจำลอง ผังสถานี และชุดด่าน โหลดครั้งเดียวตอนออกจากหน้าแรก (dynamic import)
// ดาวอ่าน/เขียนผ่าน src/save ด้วย key = levelKey(lv) ของ sim และสถานะปลดล็อกใช้ unlockState ของ sim: แผนที่กับหน้าเล่นจึงตรงกันเสมอ
import { createStage, canFullscreen, toggleFullscreen, watchFullscreen } from './stage.js';
import { createRouter } from './router.js';
import { computeProgress, canPlay } from './progress.js';
import { createCareerSave } from './career-save.js';
import { CAREER_PACK_ID } from './career-id.js';
import { scene } from '../audio/index.js';
import { installSoundMenu } from '../audio/ui.js';

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// opts: { save (จาก src/save), loadMap: () => Promise<ข้อมูลแผนที่>, mountPlay? (แทนหน้าจอเล่นทั้งตัว ใช้ในเทสต์) }
export function startCareerApp({ save, loadMap, mountPlay = null }) {
  const $ = id => document.getElementById(id);
  const stage = createStage($('stage'));
  installSoundMenu(stage);
  const screens = { home: $('s-home'), map: $('s-map'), play: $('s-play') };
  const career = createCareerSave(save, CAREER_PACK_ID);
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const memFlags = {};
  let sheetStation = null; // สถานีของแผ่นข้อมูลที่เปิดล่าสุดบนแผนที่ (หน้าที่อยู่ก่อนหน้าจอเล่นในประวัติ)
  // ทางเข้า #dev: เปิดเฉพาะ dev server (import.meta.env.DEV) และเบราว์เซอร์ที่เครื่องมือทดสอบขับอยู่ (navigator.webdriver ตั้งโดย Playwright/WebDriver เท่านั้น)
  // build สำหรับผู้เล่นไม่มีทางเปิดจาก URL (เลิกรับ ?dev แล้ว) ผู้เล่นพิมพ์ #dev แล้วถูกพาไปแผนที่
  const devAllowed = () => !!(import.meta.env && import.meta.env.DEV) || navigator.webdriver === true;
  let D = null, mapData = null, mapScreen = null, loading = null, play = null, shown = null, keyboardNav = false;
  window.addEventListener('keydown', () => { keyboardNav = true; }, true);
  window.addEventListener('pointerdown', () => { keyboardNav = false; }, true);

  // อ่านเซฟจากที่เก็บใหม่ (อีกแท็บอาจเขียนไปแล้ว) ถ้าอ่านแล้วดาวน้อยกว่าที่มีในหน่วยความจำ แปลว่าที่เก็บใช้ไม่ได้ (โหมดส่วนตัว/เต็ม)
  // ให้คงความคืบหน้าในหน่วยความจำไว้ ไม่งั้นผู้เล่นที่เซฟไม่ได้จะเห็นดาวหายทุกครั้งที่กลับแผนที่
  function reloadSave() {
    const before = save.totalStars(CAREER_PACK_ID), code = save.exportCode();
    save.reload();
    if (save.totalStars(CAREER_PACK_ID) < before) save.importCode(code);
  }
  const starsOf = lv => career.stars(D.levelKey(lv));
  // ธง "ข้ามบทสอน" (WP4.5) อยู่ในเซฟ: เปิดทุกสถานีของเส้นทางสอน ไม่ให้ดาว
  const SKIP_FLAG = 'skipTutorial';
  const progress = () => computeProgress(D.career, starsOf, D.unlockState, { skip: memFlags[SKIP_FLAG] === true || (!!save.getFlag && save.getFlag(SKIP_FLAG) === true) });

  function closePlay() { if (play) { play.destroy(); play = null; } screens.play.innerHTML = ''; }
  function showOnly(name) {
    for (const k in screens) screens[k].hidden = k !== name;
    if (name !== 'map' && mapScreen) mapScreen.hide();
    if (name !== 'play') closePlay();
    stage.el.scrollTop = 0; stage.el.scrollLeft = 0;
    // เพลงหน้าแผนที่เล่นทั้งหน้าแรกและแผนที่ หน้าเล่นเลือกเพลงเอง (screen-play.js)
    if (name !== 'play') scene('map');
    shown = name;
  }
  function paintHome() {
    const b = $('b-map');
    if (b) b.textContent = save.hasProgress(CAREER_PACK_ID) ? 'เล่นต่อ' : 'เริ่มเล่น';
  }

  // โหลดของเกมครั้งเดียว: ไฟล์แผนที่ หน้าแผนที่ ข้อมูลผัง+ชุดด่าน (ผ่านตัวตรวจของ sim) และหน้าจอเล่น
  function ensureGame() {
    if (mapScreen) return Promise.resolve();
    loading ||= Promise.all([loadMap(), import('./screen-map.js'), import('./career-data.js'), import('./screen-play.js')]).then(([data, mapMod, dataMod, playMod]) => {
      mapData = data; D = dataMod.loadCareer(); D.mountPlay = mountPlay || playMod.mountPlay;
      if (!D.career) throw new Error(`ชุดภารกิจ ${CAREER_PACK_ID} ใช้ไม่ได้: ${(D.packErrors[CAREER_PACK_ID] || ['ไม่พบไฟล์'])[0]}`);
      screens.map.classList.remove('loading');
      mapScreen = mapMod.createMapScreen({
        root: screens.map, stage, map: data, pack: D.career, getProgress: progress, reducedMotion: () => motion.matches,
        // ธงเล็ก ๆ ในเซฟ (เช่น เคยดูกล้องเลื่อนเข้าเส้นทางสอนแล้ว) ถ้า src/save ยังไม่มี getFlag/setFlag จะจำแค่ในหน่วยความจำ
        flags: { get: k => (save.getFlag ? !!save.getFlag(k) : !!memFlags[k]), set: k => { memFlags[k] = true; if (save.setFlag) save.setFlag(k, true); } },
        onHome: () => router.go({ screen: 'home' }),
        onStation: id => {
          const cur = router.current();
          if (id) (cur.stationId ? router.replace : router.go).call(router, { screen: 'map', stationId: id });
          else if (cur.stationId) router.back({ screen: 'map' });
        },
        onPlay: (stationId, missionId) => router.go({ screen: 'play', stationId, missionId }),
        onSkip: () => { memFlags[SKIP_FLAG] = true; if (save.setFlag) save.setFlag(SKIP_FLAG, true); },
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
    const s = mapData && mapData.namtok.stations.find(x => x.id === id), p = D.career.stations.findIndex(x => x.station === id), L = D.stations[id];
    return { id, name_th: s ? s.name_th : L ? L.name : id, name_en: s ? s.name_en : '', tier: p < 0 ? null : D.career.stations[p].tier, order: p + 1 };
  }
  const base = () => ({ stage, reducedMotion: () => motion.matches });

  // ภารกิจของแผนที่: ต้องปลดล็อกแล้ว ถ้ายังไม่มีข้อมูลเล่นจริง หน้าจอเล่นขึ้น "กำลังสร้าง" เอง
  function openPlay({ stationId, missionId }) {
    const P = progress(), pack = D.career;
    if (!canPlay(P, stationId, missionId)) return router.replace({ screen: 'map', stationId: P.byId[stationId] ? stationId : undefined });
    showOnly('play'); closePlay();
    const index = pack.levels.findIndex(l => D.levelKey(l) === missionId), lv = pack.levels[index];
    const ctx = {
      ...base(), pack, mission: P.byId[stationId].missions.find(m => m.id === missionId), station: stationInfo(stationId),
      game: !lv || lv.error ? null : { pack, index }, stationNote: (pack.stations.find(s => s.station === stationId) || {}).note_th || '',
      finish({ stars = 0, score = 0 } = {}) {
        const before = progress(), saved = stars > 0 ? career.setStars(missionId, stars, score) : true, after = progress();
        paintHome();
        if (mapScreen) mapScreen.refresh();
        // ภารกิจถัดไปที่เสนอ: อันถัดไปในสถานีเดียวกันถ้าเปิดแล้ว ไม่งั้นอันแรกที่ยังไม่ผ่านของทั้งเส้นทาง
        const mine = after.byId[stationId].missions, at = mine.findIndex(m => m.id === missionId), nx = mine[at + 1];
        const next = nx && nx.unlocked ? { stationId, missionId: nx.id } : after.next && after.next.missionId !== missionId ? after.next : null;
        return { saved, next, newlyUnlocked: after.stations.filter(s => s.unlocked && !before.byId[s.id].unlocked).map(s => ({ id: s.id, name: stationInfo(s.id).name_th })) };
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
        const real = packId === CAREER_PACK_ID, saved = real || stars <= 0 ? true : save.setBest(packId, missionId, { stars, score }), nx = pack.levels[index + 1];
        return { saved, note: real ? 'เข้าทางนักพัฒนา ดาวของภารกิจนี้ไม่ถูกบันทึก' : '', newlyUnlocked: [], next: nx && !nx.error ? { stationId: null, missionId: D.levelKey(nx) } : null };
      },
      exit: () => router.back({ screen: 'dev' }),
      play: mId => router.replace({ screen: 'dev', packId, missionId: mId }),
    };
    play = D.mountPlay(screens.play, { stationId: lv.station, missionId }, ctx) || { destroy() {} };
  }

  const same = (a, b) => a.screen === b.screen && a.stationId === b.stationId && a.missionId === b.missionId && a.packId === b.packId;
  function onRoute(r) {
    if (r.screen === 'home') { showOnly('home'); paintHome(); return; }
    if (!mapScreen) { showOnly('map'); screens.map.classList.add('loading'); }
    ensureGame().then(() => {
      if (!same(router.current(), r)) return; // ผู้เล่นไปหน้าอื่นแล้ว
      if (r.screen === 'play') return openPlay(r);
      if (r.screen === 'dev') return devAllowed() ? openDev(r) : router.replace({ screen: 'map' });
      if (r.stationId && !progress().byId[r.stationId]) return router.replace({ screen: 'map' });
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
    stage, router, save, career,
    ready: () => ensureGame(),
    progress: () => (D ? progress() : null),
    get data() { return D; }, get pack() { return D && D.career; },
    get map() { return mapScreen && mapScreen.debug; },
    get play() { return play && play.api ? play.api : null; },
    async openMission(stationId, missionId) { await ensureGame(); router.go({ screen: 'play', stationId, missionId }); await settle(); await settle(); return this.play; },
    async openDev(packId, missionId) { await ensureGame(); router.go({ screen: 'dev', packId, missionId }); await settle(); await settle(); return this.play; },
    refresh() { paintHome(); if (mapScreen) mapScreen.refresh(); },
  };
}
