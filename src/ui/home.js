// หน้าเลือกด่าน: รายการด่านแบ่งตามยุค ดาวที่ได้ และปุ่มเล่นต่อ
import { starStr } from './cards.js';

const $ = id => document.getElementById(id);

export function createHome({ pack, save, onOpen }) {
  const stars = i => save.getStars(pack.id, i);
  const unlocked = i => i === 0 || stars(i - 1) > 0;
  const playable = i => unlocked(i) && !pack.levels[i].error;
  const nextLevel = () => { for (let i = 0; i < pack.levels.length; i++) if (!stars(i)) return unlocked(i) ? i : Math.max(0, i - 1); return pack.levels.length - 1; };
  const status = (l, i) => l.error ? '<span class="lk">ด่านนี้ยังเปิดไม่ได้ ข้อมูลผังมีปัญหา</span>'
    : unlocked(i) ? `<span class="st" aria-label="${stars(i)} ดาว">${starStr(stars(i))}</span>` : '<span class="lk">ผ่านด่านก่อนหน้าเพื่อปลดล็อก</span>';

  function render() {
    const nx = nextLevel();
    $('chapters').innerHTML = pack.eras.map((era, ei) => `
    <section class="chapter">
      <div class="chapter-h"><span class="eyebrow">ยุคที่ ${ei + 1} · ${era.yr}</span><h2>${era.name}</h2></div>
      <div class="levels">${pack.levels.map((l, i) => l.era !== ei ? '' : `
        <button class="lv${i === nx ? ' next' : ''}" type="button" data-i="${i}" ${playable(i) ? '' : 'disabled'}>
          <span class="no">${i + 1}</span><span class="nm">${l.name}</span>
          ${status(l, i)}
        </button>`).join('')}</div>
    </section>`).join('');
    $('b-continue').textContent = save.hasProgress(pack.id) ? `เล่นต่อ ด่าน ${nx + 1}` : 'เริ่มด่านแรก';
    $('b-continue').disabled = !playable(nx);
  }
  $('chapters').addEventListener('click', e => { const b = e.target.closest('.lv'); if (b && !b.disabled) onOpen(+b.dataset.i); });
  $('b-continue').onclick = () => { const i = nextLevel(); if (playable(i)) onOpen(i); };
  return { render, nextLevel };
}

// ข้อมูลด่านทั้งชุดโหลดไม่ได้: บอกผู้เล่นตรง ๆ แทนหน้าขาว
export function renderLoadError(errors) {
  $('chapters').innerHTML = `<details open><summary>โหลดข้อมูลด่านไม่ได้</summary>
    <p class="muted">ลองเล่นต้นแบบ 12 ด่านจากหน้าแรกไปก่อน</p>
    <ul class="err">${errors.slice(0, 8).map(e => `<li>${String(e).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}</li>`).join('')}</ul></details>`;
  $('b-continue').hidden = true;
}
