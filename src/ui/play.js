// หน้าเล่น: แถบบน (HUD) การ์ด ข้อความแจ้ง การแตะ และวงรอบเวลา
// ตัวจำลองอยู่ใน sim/ ไฟล์นี้แค่ส่งคำสั่งเข้า (press, step) และรับ event ออก (msg, fail, win)
import { FIXED_DT, createGame, startGame, step, press, hint } from '../sim/index.js';
import { createRenderer } from '../render/canvas2d.js';
import { hitTest } from '../render/hit.js';
import { introHtml, failHtml, winHtml } from './cards.js';

const $ = id => document.getElementById(id);

export function createPlay({ pack, save, onHome }) {
  const cv = $('cv'), ov = $('ov'), view = createRenderer(cv);
  let G = null, fast = false, paused = false;

  /* ข้อความแจ้ง */
  let toastTimer = 0;
  function msg(text, kind = '') {
    const m = $('msg'); m.textContent = text; m.className = 'toast ' + kind;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => m.classList.add('hide'), kind === 'bad' ? 4500 : 3000);
  }

  /* การ์ดและ HUD */
  function card(html) { ov.innerHTML = `<div class="card">${html}</div>`; ov.hidden = false; }
  function hud() {
    if (!G) return;
    $('h-score').textContent = Math.max(0, Math.round(G.score));
    $('h-trains').textContent = `${G.done}/${G.lv.trains.length}`;
  }
  function setPaused(p) { paused = p; $('b-pause').textContent = p ? 'เล่นต่อ' : 'พัก'; }

  /* event จากตัวจำลอง */
  function onEvent(ev, g) {
    if (g !== G) return;
    if (ev.type === 'msg') msg(ev.text, ev.kind);
    else if (ev.type === 'fail') card(failHtml(ev));
    else if (ev.type === 'win') { save.setStars(pack.id, g.i, ev.stars); const next = pack.levels[g.i + 1]; card(winHtml(g, ev, !next, !!next && !next.error)); }
  }

  function open(i) {
    if (!pack.levels[i] || pack.levels[i].error) return onHome(); // ด่านที่ข้อมูลผังเสีย: กลับหน้าเลือกด่าน ไม่พัง
    G = createGame(pack, i, { onEvent }); setPaused(false); acc = 0;
    $('h-title').textContent = `ด่าน ${i + 1} · ${G.lv.name}`; $('h-era').textContent = `${G.era.yr} · ${G.era.name}`;
    $('home').hidden = true; $('play').hidden = false; hud(); card(introHtml(G, pack, true));
  }
  ov.addEventListener('click', e => {
    const a = e.target.closest('[data-act]'); if (!a) return;
    const act = a.dataset.act;
    if (act === 'start') { ov.hidden = true; startGame(G); }
    if (act === 'resume') { ov.hidden = true; setPaused(false); }
    if (act === 'retry') open(G.i);
    if (act === 'next') open(G.i + 1);
    if (act === 'home') onHome();
  });

  /* การแตะ */
  cv.addEventListener('pointerdown', ev => {
    if (!G || G.state !== 'play' || paused) return;
    const { x, y } = view.toBoard(ev.clientX, ev.clientY);
    press(G, hitTest(G, x, y));
  });

  /* ปุ่มแถบบน */
  $('b-home').onclick = () => { if (G && G.state === 'play') paused = true; onHome(); };
  $('b-pause').onclick = () => { if (!G || G.state !== 'play') return; setPaused(!paused); msg(paused ? 'หยุดเวลาไว้' : 'เดินรถต่อ'); };
  $('b-fast').onclick = () => { fast = !fast; $('b-fast').setAttribute('aria-pressed', fast); };
  $('b-help').onclick = () => { if (G && G.state === 'play') { setPaused(true); card(introHtml(G, pack, false)); } };
  const fsOK = !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen);
  if (!fsOK) $('b-full').hidden = true;
  $('b-full').onclick = async () => {
    try {
      if (document.fullscreenElement || document.webkitFullscreenElement) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); return; }
      const el = document.documentElement; await (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
      try { await screen.orientation.lock('landscape'); } catch {}
    } catch { msg('เบราว์เซอร์นี้ไม่ให้เปิดเต็มจอ ลองเปิดหน้านี้ในแท็บใหม่'); }
  };
  document.addEventListener('fullscreenchange', () => { $('b-full').textContent = document.fullscreenElement ? 'ออกเต็มจอ' : 'เต็มจอ'; });
  document.addEventListener('visibilitychange', () => { if (document.hidden && G && G.state === 'play' && !paused) setPaused(true); });

  /* วงรอบ: เวลาจริงสะสมแล้วเดินตัวจำลองทีละก้าวคงที่ FIXED_DT (×2 = สะสมเร็วเป็น 2 เท่า) */
  let lastT = 0, hudT = 0, acc = 0;
  function frame(ts) {
    const dt = Math.min(0.05, (ts - lastT) / 1000 || 0); lastT = ts;
    if (G && G.state === 'play' && !paused) {
      acc += dt * (fast ? 2 : 1);
      while (acc >= FIXED_DT && G.state === 'play') { acc -= FIXED_DT; step(G, FIXED_DT); }
    }
    if (G && !$('play').hidden) { hudT += dt; if (hudT > 0.15) { hudT = 0; hud(); } view.draw(G, ts / 1000, hint(G), $('board')); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return { open, view, get G() { return G; }, get paused() { return paused; } };
}
