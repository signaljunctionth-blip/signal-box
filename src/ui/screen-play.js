// หน้าจอเล่นด่านของโหมดอาชีพ (แผงผังเส้น 2 มิติ) — เสียบเข้า career-app.js ผ่านสัญญาเดียว:
//
//   mountPlay(host, { stationId, missionId }, ctx) -> { destroy(), api }
//
//   host  = element ว่างขนาดเต็มเวที อยู่ในพิกัดเวทีแนวนอนแล้ว (เวทีหมุนเองเมื่อถือเครื่องแนวตั้ง)
//   ctx   = {
//     game    : { pack, index } ชุดด่านจาก loadLevelPack ของ sim + ลำดับด่าน | null = ยังไม่มีข้อมูลเล่นจริง (ขึ้น "กำลังสร้าง")
//     mission : { id, name, teaches, stars }   station : { id, name_th, name_en, tier, order }
//     stage   : ตัวเวที (toStage, toClient, rectOf, onResize)   reducedMotion() : ผู้เล่นขอลดการเคลื่อนไหวไหม
//     finish({ stars, score }) : บันทึกผล คืน { saved, newlyUnlocked: [{ id, name }], next: { stationId, missionId } | null }
//     exit()  : กลับไปหน้าก่อน (แผ่นข้อมูลสถานี)      play(missionId, stationId?) : ไปเล่นภารกิจอื่นต่อ
//   }
//   api   = hook ของบอท (ดู return ท้ายไฟล์) ออกทาง window.__sjApp.play
//
// ตัวจำลองอยู่ใน sim/ ไฟล์นี้แค่ส่งคำสั่งเข้า (press, step) รับ event ออก (msg, fail, win) และวาดด้วย render/panel2d.js
import { FIXED_DT, createGame, startGame, step, press, hint, nextTarget, idle, snapshot } from '../sim/index.js';
import { createPanel } from '../render/panel2d.js';
import { hitTest, targetCenter, panelGeom, minTargetGap } from '../render/panel-geom.js';
import { esc, starIcon, TIER_NAME, NOTE_LAYOUT, NOTE_SIGNALLING, NOTE_UNOFFICIAL, NOTE_NOT_PROCEDURE } from './station-sheet.js';
import { fullscreenButton } from './stage.js';
import { scene, sfx } from '../audio/index.js';
import { soundButton } from '../audio/ui.js';
import { has3D, mountView3D, pref3D, savePref3D, tierButtons } from './view3d.js';
import './play.css';

export const NOTE_SIGNAL_NAMES = 'ชื่อเสาในเกมนี้เกมตั้งเอง ไม่ใช่ชื่อจริงของสถานี เลขทางและตารางเดินรถเป็นของสมมุติ';
const NOTE_FICTIONAL = 'ผังสมมุติที่ทีมวาดเอง ไม่ได้อ้างอิงสถานีจริง';
// เครดิตข้อมูลผังรางของสถานีจริง (ODbL ต้องให้เครดิตใกล้จุดที่ใช้ข้อมูล) ผังสมมุติไม่ขึ้น
// ขบวนปรากฏ = กระดิ่งสถานีบอกว่ามีขบวนมา, เข้าจอด = เบรก, ออกพ้นสถานี = ล้อวิ่ง
const TRAIN_SFX = { spawn: 'bell', arrive: 'trainStop', exit: 'trainRun' };
export const OSM_CREDIT = { text: '© ผู้ร่วมพัฒนา OpenStreetMap', url: 'https://www.openstreetmap.org/copyright' };
// หัวข้อสาเหตุเมื่อแพ้ ตาม code ของ event fail
// เร่งเวลาอัตโนมัติ (WP4.5): ช่วงที่ไม่มีอะไรให้ผู้เล่นตัดสินใจ (sim idle) เวลาเดินเร็ว AUTO_RATE เท่า กลับเป็นปกติทันทีเมื่อมีเรื่องให้ตัดสินใจ
// ใช้ก้าว FIXED_DT เดิม แค่เดินหลายก้าวต่อเฟรม ผลของตัวจำลองจึงเหมือนเดิมทุกอย่าง
export const AUTO_RATE = 3;
const MAX_STEPS = 48; // ก้าวสูงสุดต่อเฟรม (กันเครื่องช้าค้าง)
// ค่า ×2 ที่ผู้เล่นเลือกไว้ จำข้ามภารกิจและข้ามการเปิดเกม (เก็บไม่ได้ก็เล่นได้ตามปกติ)
export const FAST_KEY = 'sj-play-fast';
const loadFast = () => { try { return globalThis.localStorage.getItem(FAST_KEY) === '1'; } catch { return false; } };
const saveFast = f => { try { globalThis.localStorage.setItem(FAST_KEY, f ? '1' : '0'); } catch { /* เก็บไม่ได้ ใช้ค่าในหน้านี้ไป */ } };
const STALL_AGAIN = 30; // วินาที (เวลาในเกม) หลังกด "เล่นต่อ" ที่แถบช่วยเหลือจะกลับมาถ้ายังไม่มีอะไรขยับ
const FAIL_TH = { HEAD_ON: 'ชนประสานงา', REAR_END: 'ชนท้าย', SIDE: 'ชนสีข้างที่ประแจ', HEAD_ON_BLOCK: 'ปล่อยรถเข้าตอนที่มีขบวนสวนมา', RUN_THROUGH: 'รถฝ่าประแจ', DERAIL_UNDER: 'สับประแจขณะรถทับอยู่', DEADLOCK: 'ทางตัน ไม่มีทางไหนตั้งได้', MAX_WAIT: 'ขบวนรอนานเกินกำหนด' };
const MASCOT = `<svg class="mascot" viewBox="0 0 96 160" aria-hidden="true"><rect class="m-post" x="43" y="96" width="10" height="52" rx="3"/><rect class="m-base" x="26" y="144" width="44" height="10" rx="5"/><rect class="m-head" x="22" y="6" width="52" height="98" rx="26"/><circle class="m-red" cx="48" cy="32" r="11"/><circle class="m-amber" cx="48" cy="56" r="11"/><circle class="m-green" cx="48" cy="80" r="11"/></svg>`;

// ตัวแทนเมื่อภารกิจยังไม่มีข้อมูลเล่นจริง
export function mountPlayPlaceholder(host, { stationId, missionId }, ctx) {
  const name = ctx.mission ? ctx.mission.name : missionId, st = ctx.station ? ctx.station.name_th : stationId;
  host.innerHTML = `
    <div class="wip">${MASCOT}
      <div class="wip-t">
        <span class="eyebrow">สถานี${esc(st)}</span>
        <h2 id="wip-title" tabindex="-1">กำลังสร้าง</h2>
        <p class="lead">หน้าจอเล่นภารกิจ “${esc(name)}” ยังสร้างไม่เสร็จ อีกไม่นานได้เล่นแน่นอน</p>
        ${ctx.mission && ctx.mission.teaches ? `<p class="wip-teach">ภารกิจนี้สอน: ${esc(ctx.mission.teaches)}</p>` : ''}
        ${ctx.reason ? `<p class="wip-teach">${esc(ctx.reason)}</p>` : ''}
        <div class="actions">
          <button class="btn go" type="button" data-act="exit">กลับไปแผนที่</button>
          <a class="btn" href="./prototype/">เล่นเกมเวอร์ชันเดิมไปก่อน</a>
        </div>
      </div>
    </div>`;
  const onClick = e => { if (e.target.closest('[data-act="exit"]')) ctx.exit(); };
  host.addEventListener('click', onClick);
  host.querySelector('#wip-title').focus({ preventScroll: true });
  return { destroy() { host.removeEventListener('click', onClick); }, api: null };
}

// ข้อความบอกว่าขบวนในตารางมาจากไหน เข้าทางไหน ไปไหน
const place = label => String(label).replace(/^ไป/, '');
export function queueText(L, sp) {
  if (!L.bidir || (sp.from === null && sp.origin === null)) return sp.exp ? 'ขบวนด่วน ไม่จอด' : `เข้าชานชาลา ${sp.plat}`;
  const P = L.portals, from = sp.origin !== null ? `ตั้งต้นที่ทาง ${sp.origin}` : `จาก${place(P[sp.from].label)}`;
  const mid = sp.origin !== null ? '' : sp.exp ? (sp.via ? `ผ่านทาง ${sp.via} ไม่จอด` : 'ด่วน ไม่จอด') : `เข้าทาง ${sp.plat}`;
  const to = sp.to && P[sp.to] ? (/^ไป/.test(P[sp.to].label) ? P[sp.to].label : `ไป${P[sp.to].label}`) : '';
  return [from, mid, to].filter(Boolean).join(' › ');
}
// เที่ยวขึ้น/เที่ยวล่อง ของขบวนตอนเข้าผัง (null ถ้าผังไม่ได้บอก upDir หรือเป็นขบวนต้นทาง)
export function runWord(L, sp) {
  if (!L.upDir || sp.from === null || !L.portals[sp.from]) return null;
  return (L.portals[sp.from].side === 'W' ? 'E' : 'W') === L.upDir ? 'เที่ยวขึ้น' : 'เที่ยวล่อง';
}

// ภารกิจห่วงทางสะดวกยังไม่มีปุ่มขอห่วง/ให้ทางในฉาก 3 มิติ จึงเล่นในแผงผังเส้นเท่านั้น (ไม่แสดงปุ่ม 3 มิติ)
export function mountPlay(host, params, ctx) {
  const G0 = ctx.game, lv0 = G0 && G0.pack.levels[G0.index];
  if (!lv0 || lv0.error) return mountPlayPlaceholder(host, params, { ...ctx, reason: lv0 && lv0.error && ctx.dev ? lv0.error : '' });
  const { pack, index } = G0, stage = ctx.stage, calm = () => !!(ctx.reducedMotion && ctx.reducedMotion());

  host.innerHTML = `
    <div class="pl">
      <header class="pl-bar">
        <button class="btn sm" type="button" data-act="menu">พัก</button>
        <div class="pl-ttl"><b></b><span></span><p class="pl-msg hide" role="status" aria-live="polite"></p></div>
        <dl class="pl-stats"><div><dt>คะแนน</dt><dd id="pl-score">0</dd></div><div><dt>ส่งแล้ว</dt><dd id="pl-done">0/0</dd></div></dl>
        ${has3D(params.stationId) && !lv0.token ? '<button class="btn sm pl-view" type="button" data-act="view" aria-label="สลับเป็นฉาก 3 มิติ">3 มิติ</button>' : ''}
        <button class="btn sm" type="button" data-act="fast" aria-pressed="false" aria-label="เร่งเวลา 2 เท่า">×2</button>
        ${soundButton()}
        ${fullscreenButton()}
      </header>
      <div class="pl-board">
        <canvas tabindex="-1" aria-label="แผงควบคุมสถานี แตะเสา ประแจ หรือทางจอดเพื่อสั่งการ"></canvas>
        <span class="pl-auto" hidden>เร่งเวลา ×${AUTO_RATE}</span>
        <div class="pl-ov" hidden></div>
      </div>
      <footer class="pl-foot"><span class="pl-next">คันถัดไป</span><ol class="pl-queue"></ol>
        <div class="pl-stall" role="alert" hidden><p></p><button class="btn sm" type="button" data-act="retry">เริ่มใหม่</button><button class="btn sm go" type="button" data-act="unstall">เล่นต่อ</button></div>
      </footer>
    </div>`;
  const $ = s => host.querySelector(s);
  const stallEl = $('.pl-stall'), cv = $('canvas'), board = $('.pl-board'), ov = $('.pl-ov'), msgEl = $('.pl-msg'), queueEl = $('.pl-queue'), fastBtn = $('[data-act="fast"]'), autoEl = $('.pl-auto');
  const panel = createPanel(cv, stage.el);
  // ฉาก 3 มิติ (เฉพาะสถานีที่มีฉากแล้ว) วางทับแผงผังเส้นในกล่องเดียวกัน สลับกลับได้เสมอ
  const viewBtn = $('[data-act="view"]');
  const v3d = viewBtn ? mountView3D(board, { stage, getGame: () => g, onPress: t => { if (g && g.state === 'play' && !paused) { if (press(g, t) && t && t.kind === 'point') sfx('lever'); watchSignals(); } }, getHint: () => (g && g.state === 'play' && !paused ? curHint() : null), say: (t, k) => say(t, k), station: ctx.station || {} }) : null;
  async function setView(on) {
    if (!v3d) return;
    viewBtn.disabled = true;
    const ok = await v3d.setActive(on);
    if (!alive) return;
    viewBtn.disabled = false;
    if (v3d.failed) viewBtn.hidden = true;
    viewBtn.textContent = ok ? 'ผังเส้น' : '3 มิติ';
    viewBtn.setAttribute('aria-label', ok ? 'สลับเป็นแผงผังเส้น' : 'สลับเป็นฉาก 3 มิติ');
    savePref3D({ on: ok });
    dirty = true;
  }
  let g = null, paused = false, manual = false, fast = false, auto = false, alive = true, raf = 0, lastT = 0, acc = 0, hudT = 1, dirty = true, result = null, queueKey = '';

  /* ข้อความแจ้งจากตัวจำลอง */
  let toastT = 0;
  const ttlEl = $('.pl-ttl'), footEl = $('.pl-foot');
  const hideMsg = () => { msgEl.classList.add('hide'); ttlEl.classList.remove('has-msg'); };
  function say(text, kind = '') {
    msgEl.textContent = text; msgEl.className = 'pl-msg ' + kind; ttlEl.classList.add('has-msg');
    clearTimeout(toastT); toastT = setTimeout(hideMsg, kind === 'bad' ? 4800 : 3200);
  }

  /* การ์ด */
  const lv = () => g.lv, L = () => g.L;
  // ข้อความปฏิเสธและข้อจำกัดของข้อมูล: 4 ข้อแรกเป็นค่าคงที่ ขึ้นทุกภารกิจไม่ว่าเข้ามาทางไหน (รวมลิงก์ตรง) ไม่พึ่งข้อความในไฟล์ชุดด่าน
  // ครอบคลุม: ไม่ใช่ผลงานทางการ, ไม่ใช่ขั้นตอนปฏิบัติงานจริง, ผังจำลองจากข้อมูลสาธารณะ, ระบบสัญญาณสมมุติ, ชื่อเสา/เลขทาง/ตารางเดินรถเกมตั้งเอง
  // ตามด้วยหมายเหตุผังย่อของสถานี (stations[].note_th) ส่วน signalling_note_th ของชุดภารกิจจริงพูดเรื่องเดียวกับ 4 ข้อนี้จึงไม่ขึ้นซ้ำ (ชุดด่านอื่นใน #dev ยังขึ้น)
  const osm = () => (L().fictional === false ? `<li class="osm">ข้อมูลผังราง <a href="${OSM_CREDIT.url}" target="_blank" rel="noopener">${esc(OSM_CREDIT.text)}</a> (ODbL)</li>` : '');
  const notes = () => `<ul class="notes">${[`${NOTE_UNOFFICIAL} ${NOTE_NOT_PROCEDURE}`, L().fictional ? NOTE_FICTIONAL : NOTE_LAYOUT, NOTE_SIGNALLING, NOTE_SIGNAL_NAMES].concat(ctx.stationNote || [], ctx.dev && pack.note ? pack.note : []).map(t => `<li>${esc(t)}</li>`).join('')}${osm()}</ul>`;
  // หัวการ์ด: ชื่อสถานี · ยุคของระบบสัญญาณ (ชื่อยุคขึ้นต้นด้วย "ขั้น N" อยู่แล้ว ขั้นของสถานีดูได้บนแผนที่ จึงไม่ใส่ซ้ำ)
  const eyebrow = () => `${esc(ctx.station && ctx.station.name_th ? `สถานี${ctx.station.name_th}` : L().name)} · ${esc(g.era.name)}`;
  const brief = () => `
    ${lv().teaches ? `<p><b>สิ่งที่สอน</b> ${esc(lv().teaches)}</p>` : ''}
    <p><b>เป้าหมาย</b> ${esc(lv().goal)}</p>
    ${lv().tips.length ? `<ul class="tips">${lv().tips.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
    <p class="rule">${lv().sched.length} ขบวน · เข้าทางถูก +100 ส่งออก +50 · ขบวนด่วนผ่านไม่ต้องหยุด +150${lv().maxWait ? ` · ห้ามรอเกิน ${lv().maxWait} วินาที` : ''}${lv().pointsLocked ? ' · ภารกิจนี้ประแจล็อกไว้' : ''}</p>`;
  function card(html, cls = '') {
    ov.innerHTML = `<div class="pl-card ${cls}" role="dialog" aria-modal="true" aria-labelledby="pl-card-title">${html}</div>`;
    ov.hidden = false; dirty = true;
    const t = ov.querySelector('#pl-card-title'); if (t) t.focus({ preventScroll: true });
    ov.querySelector('.pl-card').scrollTop = 0;
  }
  const closeCard = () => { ov.hidden = true; ov.innerHTML = ''; };
  const introCard = () => card(`
    <div class="pl-cols"><div class="pl-main">
      <span class="eyebrow">${eyebrow()}</span>
      <h2 id="pl-card-title" tabindex="-1">${esc(lv().name)}</h2>
      ${brief()}
    </div><div class="pl-side">${notes()}
      <div class="row"><button class="btn sm" type="button" data-act="exit">กลับ</button><button class="btn go" type="button" data-act="start">เริ่มเดินรถ</button></div>
    </div></div>`, 'wide');
  const menuCard = () => card(`
    <div class="pl-cols"><div class="pl-main">
      <span class="eyebrow">หยุดเวลาไว้ · ${eyebrow()}</span>
      <h2 id="pl-card-title" tabindex="-1">${esc(lv().name)}</h2>
      ${brief()}
    </div><div class="pl-side">${notes()}
      ${v3d && v3d.active ? `<div class="row pl-tier"><span>ภาพ 3 มิติ</span>${tierButtons(v3d.tier)}</div>` : ''}
      <div class="row"><button class="btn sm" type="button" data-act="exit">ออก</button><button class="btn sm" type="button" data-act="retry">เริ่มใหม่</button><button class="btn sm go" type="button" data-act="resume">เล่นต่อ</button></div>
    </div></div>`, 'wide');
  function winCard(ev) {
    const r = result || {}, news = (r.newlyUnlocked || []).map(s => `ปลดล็อกสถานี${esc(s.name)}แล้ว`);
    card(`
    <div class="pl-stars" role="img" aria-label="ได้ ${ev.stars} จาก 3 ดาว">${[0, 1, 2].map(i => starIcon(i < ev.stars)).join('')}</div>
    <h2 id="pl-card-title" tabindex="-1">ส่งครบ ${lv().sched.length} ขบวน</h2>
    <p class="pl-score">${ev.score} จาก ${ev.max} คะแนน</p>
    <p class="muted">${ev.stars < 3 ? `ได้ 3 ดาวเมื่อทำคะแนนถึง ${Math.ceil(ev.max * 0.8)} ลดเวลารอของขบวนเพื่อเก็บคะแนน` : 'เดินรถได้ลื่นมาก'}</p>
    ${news.map(t => `<p class="pl-news">${t}</p>`).join('')}
    ${lv().card ? `<aside class="pl-know"><b>${esc(lv().card.title)}</b><p>${esc(lv().card.text)}</p><a href="${esc(lv().card.source)}" target="_blank" rel="noopener">แหล่งข้อมูล</a></aside>` : ''}
    ${r.note ? `<p class="muted">${esc(r.note)}</p>` : ''}
    ${r.saved === false ? '<p class="muted">เครื่องนี้บันทึกเกมไม่ได้ ดาวจะอยู่ถึงแค่ปิดหน้านี้</p>' : ''}
    <div class="row"><button class="btn sm" type="button" data-act="retry">เล่นซ้ำ</button><button class="btn sm${r.next ? '' : ' go'}" type="button" data-act="exit">${ctx.dev ? 'กลับ' : 'กลับแผนที่'}</button>${r.next ? '<button class="btn go" type="button" data-act="next">ภารกิจถัดไป</button>' : ''}</div>`, 'end');
  }
  const failCard = ev => card(`
    <span class="eyebrow bad">ไม่ผ่าน · ${esc(FAIL_TH[ev.code] || 'เกิดเหตุ')}</span>
    <h2 id="pl-card-title" tabindex="-1">${esc(ev.title)}</h2>
    <p>${esc(ev.why)}</p>
    ${ev.lesson ? `<p class="muted">${esc(ev.lesson)}</p>` : ''}
    <div class="row"><button class="btn sm" type="button" data-act="exit">${ctx.dev ? 'กลับ' : 'กลับแผนที่'}</button><button class="btn go" type="button" data-act="retry">ลองอีกครั้ง</button></div>`, 'end');

  /* HUD และคิวขบวน */
  function hud() {
    $('#pl-score').textContent = Math.max(0, Math.round(g.score));
    $('#pl-done').textContent = `${g.done}/${g.lv.sched.length}`;
    watchStall();
    const key = g.pend.join(',');
    if (key === queueKey) return;
    queueKey = key;
    const shown = g.pend.slice(0, stage.layout.h >= 600 ? 4 : stage.layout.w < 1000 ? 2 : 3), more = g.pend.length - shown.length;
    queueEl.innerHTML = shown.map(i => { const sp = g.lv.sched[i], run = runWord(g.L, sp); return `<li><b style="--c:var(${sp.exp ? '--exp' : `--t${1 + (sp.plat - 1) % 3}`})">${i + 1}</b><span>${run ? `${run} · ` : ''}${esc(queueText(g.L, sp))}</span></li>`; }).join('')
      + (more > 0 ? `<li class="more">อีก ${more} ขบวน</li>` : '') || '<li class="more">มาครบทุกขบวนแล้ว</li>';
  }
  // พักเกม = เพลงเงียบ (ตอนกลับจากแท็บอื่นเกมค้างที่เมนูพัก เพลงจึงไม่ดังขึ้นเอง)
  function setPaused(p) { paused = p; dirty = true; if (g && g.state === 'play') scene(p ? null : 'play'); }
  function setFast(f, remember = false) { fast = f; fastBtn.setAttribute('aria-pressed', String(f)); if (remember) saveFast(f); }
  function setAuto(a) { if (a === auto) return; auto = a; autoEl.hidden = !a; }

  /* ไม่มีขบวนขยับนานผิดปกติ (event 'stall' ไม่ใช่การแพ้): ขึ้นแถบบอก เปิดคำใบ้บนแผงให้ทุกด่าน และให้เริ่มใหม่ได้ */
  let helped = false, dismissedAt = 0;
  function showStall(ev) {
    helped = true; dirty = true;
    stallEl.querySelector('p').textContent = `ไม่มีขบวนขยับมา ${Math.round(ev.seconds || 45)} วินาทีแล้ว ทำตามคำใบ้สีเหลืองบนแผง หรือเริ่มใหม่ก็ได้`;
    stallEl.hidden = false; footEl.classList.add('stalled');
  }
  const hideStall = () => { stallEl.hidden = true; footEl.classList.remove('stalled'); };
  const curHint = () => hint(g, { force: helped && !!g.stalled });
  // เรียกทุกครั้งที่อัปเดต HUD: ขบวนขยับแล้วแถบหาย; กด "เล่นต่อ" แล้วยังนิ่งต่ออีก STALL_AGAIN วินาที แถบกลับมา
  function watchStall() {
    if (g.state !== 'play' || !g.stalled) { if (!stallEl.hidden) hideStall(); return; }
    if (stallEl.hidden && helped && g.time - dismissedAt >= STALL_AGAIN) showStall({ seconds: g.stall });
  }

  /* เสียง: เสาเปลี่ยนท่าดูจากสถานะเสาที่เปลี่ยนไป (ตัวจำลองไม่ส่ง event นี้) หลายต้นในเฟรมเดียวเล่นครั้งเดียว */
  let aspects = {};
  function watchSignals(quiet = false) {
    let open = false, shut = false;
    for (const k in g.S) {
      const a = g.S[k].aspect, was = aspects[k];
      if (was !== undefined && a !== was) { if (a === 'R') shut = true; else open = true; }
      aspects[k] = a;
    }
    if (quiet) return;
    if (open) sfx('signalClear'); else if (shut) sfx('signalStop');
  }

  /* event จากตัวจำลอง */
  function onEvent(ev, game) {
    if (game !== g || !alive) return;
    if (ev.type === 'msg') { say(ev.text, ev.kind); if (ev.code) sfx('deny'); } else if (ev.type === 'train') sfx(TRAIN_SFX[ev.what]);
    else if (ev.type === 'stall') showStall(ev);
    else if (ev.type === 'fail') { hideStall(); hud(); scene(null); sfx('lose'); failCard(ev); } else if (ev.type === 'win') {
      hideStall(); scene(null); sfx('win');
      result = ctx.finish({ stars: ev.stars, score: ev.score }) || {};
      hud(); winCard(ev);
    }
  }
  function open() {
    g = createGame(pack, index, { onEvent });
    aspects = {}; watchSignals(true); scene('play');
    result = null; acc = 0; queueKey = ''; helped = false; dismissedAt = 0; hideStall(); setPaused(false); hideMsg();
    $('.pl-ttl b').textContent = g.lv.name;
    $('.pl-ttl span').textContent = `${ctx.station && ctx.station.name_th ? ctx.station.name_th : g.L.name} · ${g.era.name}`;
    hud(); introCard();
  }

  /* ปุ่ม */
  const onClick = e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const act = b.dataset.act;
    if (act === 'start') { closeCard(); startGame(g); cv.focus({ preventScroll: true }); } else if (act === 'resume') { closeCard(); setPaused(false); } else if (act === 'retry') open();
    else if (act === 'exit') ctx.exit();
    else if (act === 'next' && result && result.next) ctx.play(result.next.missionId, result.next.stationId);
    else if (act === 'unstall') { hideStall(); dismissedAt = g.time; }
    else if (act === 'menu') { if (g.state === 'play') { setPaused(true); menuCard(); } } else if (act === 'fast') setFast(!fast, true);
    else if (act === 'view') setView(!(v3d && v3d.active));
    else if (act === 'tier' && v3d) { v3d.setTier(b.dataset.tier); ov.querySelectorAll('[data-act="tier"]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); }
  };
  host.addEventListener('click', onClick);
  const onKey = e => {
    if (e.ctrlKey || e.metaKey || e.altKey || !g || /^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || '')) return;
    if ((e.key === 'Escape' || e.key === 'p' || e.key === 'P') && g.state === 'play') {
      e.preventDefault();
      if (paused) { closeCard(); setPaused(false); } else { setPaused(true); menuCard(); }
    }
  };
  document.addEventListener('keydown', onKey);
  const onHide = () => { if (document.hidden && g && g.state === 'play' && !paused) { setPaused(true); menuCard(); } };
  document.addEventListener('visibilitychange', onHide);

  /* การแตะ: จุดบนจอจริง -> พิกัดเวที (รวมตอนเวทีหมุน 90°) -> พิกัดในกล่อง canvas -> พิกัดแผง */
  // มาตราส่วนของแผงต้องตรงกับขนาดกล่องตอนนี้เสมอ (หมุนเครื่องแล้วแตะก่อนเฟรมวาดถัดไปก็ยังแตะถูก)
  const fresh = () => { if (g) { const z = size(); if (z.w !== lastSize.w || z.h !== lastSize.h || lastSize.L !== g.L) { panel.fitTo(g.L, z); lastSize = { ...z, L: g.L }; dirty = true; } } };
  const toBoard = (clientX, clientY) => { fresh(); const p = stage.toStage(clientX, clientY), r = stage.rectOf(cv); return panel.toBoard(p.x - r.x, p.y - r.y); };
  const toClient = (bx, by) => { fresh(); const l = panel.toLocal(bx, by), r = stage.rectOf(cv); return stage.toClient(r.x + l.x, r.y + l.y); };
  const onDown = e => {
    if (!g || g.state !== 'play' || paused || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    const p = toBoard(e.clientX, e.clientY);
    const t = hitTest(g, p.x, p.y);
    if (press(g, t) && t && t.kind === 'point') sfx('lever');
    watchSignals();
    dirty = true;
  };
  cv.addEventListener('pointerdown', onDown);

  /* วงรอบ: เวลาจริงสะสมแล้วเดินตัวจำลองทีละก้าวคงที่ FIXED_DT วาดเมื่อมีอะไรเปลี่ยน
     แต่ละก้าวกินเวลาจริง FIXED_DT / อัตรา: ปกติ 1, ×2 = 2, ไม่มีอะไรให้ตัดสินใจ = AUTO_RATE (ตรวจทุกก้าว จึงช้าลงทันทีที่มีเรื่อง) */
  let lastSize = { w: -1, h: -1, L: null }; // ขนาดกล่องและผังที่แผงคิดมาตราส่วนไว้ล่าสุด
  const size = () => ({ w: cv.clientWidth, h: cv.clientHeight });
  function frame(ts) {
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (ts - lastT) / 1000 || 0); lastT = ts;
    const running = g.state === 'play' && !paused;
    if (running && !manual) {
      acc += dt;
      for (let n = 0; n < MAX_STEPS && g.state === 'play'; n++) {
        const quiet = idle(g), cost = FIXED_DT / Math.max(fast ? 2 : 1, quiet ? AUTO_RATE : 1);
        setAuto(quiet);
        if (acc < cost) break;
        acc -= cost; step(g, FIXED_DT);
      }
      if (acc > FIXED_DT) acc = FIXED_DT; // เครื่องช้าเกิน MAX_STEPS: ทิ้งส่วนเกิน ไม่เร่งไล่ทีหลัง
      watchSignals();
    } else setAuto(false);
    if (running) { hudT += dt; if (hudT > 0.15) { hudT = 0; hud(); } }
    if (v3d && v3d.active) { if (dirty) v3d.touch(); dirty = false; v3d.frame(dt, running); }
    else if (running || dirty) { dirty = false; lastSize = { ...size(), L: g.L }; panel.draw(g, ts / 1000, running ? curHint() : null, lastSize, { calm: calm() }); }
  }
  // หมุนเครื่อง/ย่อขยายหน้าต่างกลางเกม: สถานะเกมไม่เปลี่ยน แค่วาดใหม่
  const offResize = stage.onResize(() => { dirty = true; queueKey = ''; if (g) hud(); });
  const recolor = () => { panel.refreshColors(); if (v3d) v3d.recolor(); dirty = true; };
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', recolor);
  const mo = new MutationObserver(recolor); mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  if (document.fonts) document.fonts.ready.then(() => { dirty = true; });

  setFast(loadFast());
  open();
  raf = requestAnimationFrame(frame);
  if (v3d && pref3D().on) setView(true);

  return {
    destroy() {
      alive = false; cancelAnimationFrame(raf); clearTimeout(toastT);
      scene(null);
      host.removeEventListener('click', onClick); document.removeEventListener('keydown', onKey); cv.removeEventListener('pointerdown', onDown);
      document.removeEventListener('visibilitychange', onHide); mq.removeEventListener('change', recolor); mo.disconnect(); offResize();
      if (v3d) v3d.destroy();
    },
    // hook ของบอท (แบบเดียวกับ window.__sjBox ของต้นแบบ): อ่านสถานะ เดินเวลาเร็ว สั่งการ และหาจุดแตะบนจอจริง
    api: {
      get g() { return g; }, get paused() { return paused; }, get fast() { return fast; }, get auto() { return auto; }, pack, index, id: lv0.id ?? String(index),
      snapshot: () => snapshot(g),
      start() { if (g.state === 'intro') { closeCard(); startGame(g); } return g.state; },
      restart: open,
      setPaused(p) { if (!p) closeCard(); setPaused(!!p); },
      // true = เวลาเดินเฉพาะเมื่อบอทเรียก step() (ยังแตะจอได้ตามปกติ) ใช้ให้ผลทดสอบซ้ำได้
      setManual(m) { manual = !!m; },
      // เดินตัวจำลองตรง ๆ ทีละก้าวคงที่ (ไม่รอเวลาจริง) คืนสถานะเกม
      step(seconds = FIXED_DT) { for (let n = Math.max(1, Math.round(seconds / FIXED_DT)); n > 0 && g.state === 'play'; n--) step(g, FIXED_DT); watchSignals(); hud(); dirty = true; return g.state; },
      press(target) { const r = press(g, target); if (r && target && target.kind === 'point') sfx('lever'); watchSignals(); dirty = true; return r; },
      hint: () => curHint(), nextTarget: () => nextTarget(g),
      hitTest: (bx, by) => hitTest(g, bx, by),
      // ระยะบนจอจริง (px) ระหว่างศูนย์กลางเป้าแตะ (เสา ปุ่มประแจ) คู่ที่ใกล้กันที่สุดของผังนี้
      minGapPx: () => { const m = minTargetGap(g.L); return { px: m.min * panel.scale, pair: m.pair }; },
      toBoard, toClient,
      // จุดกลางเป้าแตะของ target บนจอจริง (หลังหมุน) และขนาดเป้าเป็น px จริง
      targetClient(target) { const c = targetCenter(g.L, target); return c ? toClient(c.x, c.y) : null; },
      scale: () => panel.scale, geom: () => panelGeom(g.L),
      // ฉาก 3 มิติ: เปิด/ปิด สถิติการวาด และจุดกลางป้ายแตะบนจอจริง
      view3d: v3d && { setActive: setView, get active() { return v3d.active; }, stats: d => v3d.stats(d), camera: () => v3d.camera(), touch: () => v3d.touch(), targetClient: t => v3d.targetClient(t), setTier: id => v3d.setTier(id) },
    },
  };
}
