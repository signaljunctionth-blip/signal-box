// แผ่นข้อมูลสถานี: ชื่อ ขั้น ป้ายข้อจำกัดของข้อมูล รายการภารกิจพร้อมดาว และปุ่มเล่น สถานีล็อกบอกเงื่อนไขปลดล็อก
// คืนเป็น HTML ให้ screen-map.js วาง (ปุ่มใช้ data-act: close, play + data-mission, station + data-station)
import { improvable } from './progress.js';

export const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ชื่อขั้นแบบสั้น (GDD ข้อ 4)
export const TIER_NAME = { 1: 'สถานีเล็ก', 2: 'สถานีทางหลีก', 3: 'สถานีประจำจังหวัด', 4: 'สถานีชุมทาง', 5: 'แขวงการเดินรถ', 6: 'ศูนย์ควบคุม' };
export const NOTE_LAYOUT = 'ผังจำลองจากข้อมูลสาธารณะ อาจไม่ตรงกับสภาพจริง';
export const NOTE_SIGNALLING = 'ระบบสัญญาณสมมุติตามขนาดสถานี';
export const NOTE_UNOFFICIAL = 'เกมนี้ไม่ใช่ผลงานทางการของการรถไฟแห่งประเทศไทย';
export const NOTE_NOT_PROCEDURE = 'ไม่ใช่ขั้นตอนปฏิบัติงานจริง';

const STAR = 'M12 2.6l2.8 6 6.5.7-4.9 4.4 1.4 6.4L12 16.9 6.2 20.1l1.4-6.4L2.7 9.3l6.5-.7z';
export const starIcon = on => `<svg class="star${on ? ' on' : ''}" viewBox="0 0 24 24" aria-hidden="true"><path d="${STAR}"/></svg>`;
// ดาว 3 ดวงของภารกิจ
export const stars3 = n => `<span class="stars3" role="img" aria-label="${n} จาก 3 ดาว">${[0, 1, 2].map(i => starIcon(i < n)).join('')}</span>`;
// ดาวรวม เช่น 7/9
export const starCount = (n, max) => `<span class="starcount" role="img" aria-label="ดาว ${n} จาก ${max}">${starIcon(n > 0)}<span aria-hidden="true">${n}/${max}</span></span>`;
export const LOCK_ICON = '<svg class="ic-lock" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10V8a5 5 0 0110 0v2h1a1 1 0 011 1v9a1 1 0 01-1 1H6a1 1 0 01-1-1v-9a1 1 0 011-1zm2 0h6V8a3 3 0 00-6 0z"/></svg>';

// st = สถานะสถานีจาก computeProgress, info = ข้อมูลสถานีจากไฟล์แผนที่, nameOf = id -> ชื่อไทย
export function sheetHtml(st, info, progress, nameOf, stationNote = '') {
  const head = `
    <header class="sheet-h">
      <div class="sheet-ht">
        <span class="eyebrow">สถานีที่ ${st.order} · ขั้น ${st.tier} ${esc(TIER_NAME[st.tier] || '')}</span>
        <h2 id="sheet-title" tabindex="-1">${esc(info.name_th)}</h2>
        <span class="sheet-en" lang="en">${esc(info.name_en)}</span>
      </div>
      ${starCount(st.stars, st.maxStars)}
      <button class="iconbtn" type="button" data-act="close" aria-label="ปิดแผ่นข้อมูลสถานี"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
    </header>
    <ul class="notes"><li>${NOTE_LAYOUT}</li><li>${NOTE_SIGNALLING}</li>${stationNote ? `<li>${esc(stationNote)}</li>` : ''}</ul>`;

  let lock = '';
  if (st.lock) {
    const L = st.lock, lines = [];
    if (L.prevRemaining > 0) lines.push(`ผ่านภารกิจของสถานี${esc(nameOf(L.prevStation))}ให้ครบก่อน เหลืออีก ${L.prevRemaining} ภารกิจ (ได้ 1 ดาวก็นับว่าผ่าน)`);
    if (L.needStars > 0) lines.push(L.missingStars > 0
      ? `ต้องมีดาวสะสม ${L.needStars} ดวง ตอนนี้มี ${L.haveStars} ขาดอีก ${L.missingStars}`
      : `ดาวสะสมครบ ${L.needStars} ดวงแล้ว`);
    const more = L.missingStars > 0 ? improvable(progress) : [];
    lock = `
    <div class="lockbox">
      <h3>${LOCK_ICON}ยังล็อกอยู่</h3>
      <ul>${lines.map(t => `<li>${t}</li>`).join('')}</ul>
      ${more.length ? `<p class="muted">เก็บดาวเพิ่มได้ที่</p><div class="lock-go">${more.map(m => `<button class="btn sm" type="button" data-act="station" data-station="${esc(m.stationId)}">${esc(m.name)} (${m.stars}/3)</button>`).join('')}</div>` : ''}
      ${L.prevRemaining > 0 ? `<div class="lock-go"><button class="btn go sm" type="button" data-act="station" data-station="${esc(L.prevStation)}">ไปสถานี${esc(nameOf(L.prevStation))}</button></div>` : ''}
    </div>`;
  }

  const next = st.next && st.next.id;
  const rows = st.missions.map((m, i) => `
      <li class="ms${m.unlocked ? '' : ' locked'}">
        <span class="ms-n" aria-hidden="true">${i + 1}</span>
        <div class="ms-t"><b>${esc(m.name)}</b><span>สอน: ${esc(m.teaches)}</span></div>
        ${m.unlocked
    ? `${stars3(m.stars)}<button class="btn sm${m.id === next ? ' go' : ''}" type="button" data-act="play" data-mission="${esc(m.id)}" aria-label="${m.stars ? 'เล่นซ้ำ' : 'เล่น'}ภารกิจ ${i + 1} ${esc(m.name)}">${m.stars ? 'เล่นซ้ำ' : 'เล่น'}</button>`
    : `<span class="ms-lock">${LOCK_ICON}<span>ยังล็อก</span></span>`}
      </li>`).join('');

  // ข้ามบทสอน (WP4.5) สำหรับคนที่รู้เรื่องรถไฟ: กดแล้วต้องยืนยันอีกครั้งในกล่องเดียวกัน
  const skip = progress.canSkip ? `
    <details class="skipbox">
      <summary class="btn sm">รู้เรื่องรถไฟอยู่แล้ว? ข้ามบทสอน</summary>
      <p>เปิดทุกสถานีและทุกภารกิจของเส้นทางสอนทันที ข้ามแล้วไม่ได้ดาว ดาวได้จากการเล่นแต่ละภารกิจเหมือนเดิม</p>
      <button class="btn sm go" type="button" data-act="skip">เปิดทุกสถานี</button>
    </details>` : '';

  return `${head}${lock}
    <h3 class="sheet-sub">ภารกิจ ${st.passed}/${st.missions.length} · ชนะได้ 1 ดาวก็เปิดภารกิจถัดไป</h3>
    <ol class="missions">${rows}</ol>${skip}`;
}
