// ปุ่มเสียง (ไอคอนลำโพง) ใช้ทุกหน้าจอ แตะแล้วเปิดแผงเล็กที่มีสวิตช์ "เพลง" กับ "เสียงประกอบ" แยกกัน
// ทุกปุ่มใช้ data-act="sound" ตัวเดียวกัน แล้วดักที่เวทีที่เดียว (installSoundMenu) แบบเดียวกับปุ่มเต็มจอ
import { state, setMusic, setSfx, onChange } from './index.js';

const ICON_ON = '<svg class="ic-snd-on" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>';
const ICON_OFF = '<svg class="ic-snd-off" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/></svg>';

export const soundButton = (cls = 'iconbtn') =>
  `<button class="${cls} snd-btn" type="button" data-act="sound" aria-label="เพลงและเสียง" aria-haspopup="true" aria-expanded="false">${ICON_ON}${ICON_OFF}</button>`;

const row = (act, label, on) =>
  `<button class="snd-row" type="button" role="switch" data-snd="${act}" aria-checked="${on}"><span>${label}</span><i aria-hidden="true"></i></button>`;

export function installSoundMenu(stage) {
  const root = document.documentElement;
  const pop = document.createElement('div');
  pop.className = 'snd-pop';
  pop.setAttribute('role', 'dialog');
  pop.setAttribute('aria-label', 'เพลงและเสียง');
  pop.hidden = true;
  stage.el.append(pop);
  let anchor = null;

  const paint = () => {
    const s = state();
    root.classList.toggle('snd-mute', !s.music && !s.sfx);
    if (!pop.hidden) pop.innerHTML = row('music', 'เพลง', s.music) + row('sfx', 'เสียงประกอบ', s.sfx);
  };
  const place = () => {
    if (!anchor || pop.hidden) return;
    const r = stage.rectOf(anchor), W = stage.layout.w, pw = pop.offsetWidth;
    pop.style.left = Math.max(8, Math.min(W - pw - 8, r.x + r.w - pw)) + 'px';
    pop.style.top = r.y + r.h + 8 + 'px';
  };
  const close = (refocus) => {
    if (pop.hidden) return;
    pop.hidden = true;
    if (anchor) { anchor.setAttribute('aria-expanded', 'false'); if (refocus) anchor.focus({ preventScroll: true }); }
    anchor = null;
  };
  const open = (btn) => {
    anchor = btn; pop.hidden = false; btn.setAttribute('aria-expanded', 'true');
    paint(); place();
    pop.querySelector('.snd-row').focus({ preventScroll: true });
  };

  stage.el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act="sound"]');
    if (b) { if (anchor === b) close(); else { close(); open(b); } return; }
    const r = e.target.closest('[data-snd]');
    if (r) {
      const s = state();
      if (r.dataset.snd === 'music') setMusic(!s.music); else setSfx(!s.sfx);
      pop.querySelector(`[data-snd="${r.dataset.snd}"]`)?.focus({ preventScroll: true });
    }
  });
  // แตะที่อื่น/กด Esc/เปลี่ยนหน้า = ปิดแผง
  stage.el.addEventListener('pointerdown', (e) => { if (!pop.hidden && !e.target.closest('.snd-pop, [data-act="sound"]')) close(); }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !pop.hidden) { e.stopPropagation(); close(true); } }, true);
  window.addEventListener('hashchange', () => close());
  window.addEventListener('popstate', () => close());
  stage.onResize(() => close());
  onChange(paint);
  paint();
  return { close };
}
