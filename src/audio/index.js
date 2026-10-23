// ตัวจัดการเสียงของเกม (ตัวเดียวทั้งแอป): เพลงประกอบตามหน้าจอ + เสียงประกอบ + ค่าเปิด/ปิดที่จำไว้
//
//   scene('map' | 'play' | null)   เลือกเพลงของหน้าจอ (null = เงียบ) เรียกซ้ำค่าเดิมได้ ไม่เริ่มเพลงใหม่
//   sfx(name)                      เล่นเสียงประกอบจาก SFX (เงียบถ้าปิดเสียงประกอบหรือยังไม่มีการแตะ)
//   setMusic(on), setSfx(on)       เปิด/ปิด แล้วจำใน localStorage
//
// เบราว์เซอร์ (โดยเฉพาะ iPhone) ไม่ให้มีเสียงก่อนผู้เล่นแตะ: สร้าง AudioContext ตอนแตะครั้งแรกเท่านั้น
// แท็บถูกซ่อน (สลับแอป เปิดคลิปของช่อง ล็อกจอ) หยุด AudioContext ทั้งตัว กลับมาค่อยเล่นต่อ เสียงจึงไม่ค้างและไม่ซ้อน
import { Sequencer } from './sequencer.js';
import { MUSIC } from './music.js';
import { SFX } from './sfx.js';

const KEY = 'sj-audio';
const MUSIC_VOL = 0.32;
const SFX_VOL = 0.55;
const SFX_GAP = 0.08; // วินาที: เสียงเดียวกันถี่กว่านี้ไม่เล่นซ้ำ (เช่น เสาหลายต้นเปลี่ยนในเฟรมเดียว)

function loadPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { music: p.music !== false, sfx: p.sfx !== false };
  } catch { return { music: true, sfx: true }; }
}

const prefs = loadPrefs();
const subs = new Set();
let ctx = null, musicBus = null, sfxBus = null, seq = null;
let want = null, playing = null;
const lastSfx = {};
const played = {}; // จำนวนครั้งที่เล่นเสียงประกอบแต่ละชื่อ (บอททดสอบอ่าน)

function savePrefs() {
  try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* โหมดส่วนตัว/ที่เก็บเต็ม: จำได้ถึงปิดหน้า */ }
}

const running = () => !!ctx && ctx.state === 'running';
const hidden = () => typeof document !== 'undefined' && document.hidden;

// เลือกเพลงให้ตรงกับที่ต้องการตอนนี้ (เรียกหลังทุกการเปลี่ยนแปลง)
function sync() {
  if (!seq) return;
  const target = prefs.music && !hidden() ? want : null;
  if (target === playing) return;
  if (target) seq.play(MUSIC[target]); else seq.stop();
  playing = target;
}

function create() {
  const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  if (!AC) return false;
  try {
    ctx = new AC();
  } catch { return false; }
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18; comp.ratio.value = 4;
  comp.connect(ctx.destination);
  musicBus = ctx.createGain(); musicBus.gain.value = MUSIC_VOL; musicBus.connect(comp);
  sfxBus = ctx.createGain(); sfxBus.gain.value = SFX_VOL; sfxBus.connect(comp);
  seq = new Sequencer(ctx, musicBus);
  ctx.onstatechange = sync;
  return true;
}

// แตะครั้งแรก (และทุกครั้งจนกว่าเสียงจะเปิดได้จริง): สร้าง/ปลุก AudioContext ภายใน event ของผู้เล่น
function unlock() {
  if (!ctx && !create()) return detach();
  if (ctx.state !== 'running' && !hidden()) ctx.resume().then(sync, () => {});
  if (running()) detach();
  sync();
}
const UNLOCK_EVENTS = ['pointerdown', 'touchend', 'click', 'keydown'];
let attached = false;
function attach() {
  if (attached || typeof window === 'undefined') return;
  attached = true;
  for (const e of UNLOCK_EVENTS) window.addEventListener(e, unlock, true);
}
function detach() {
  if (!attached) return;
  attached = false;
  for (const e of UNLOCK_EVENTS) window.removeEventListener(e, unlock, true);
}

function onVisibility() {
  if (!ctx) return;
  if (hidden()) { seq.stop(0.05); playing = null; ctx.suspend().catch(() => {}); } else { ctx.resume().then(sync, () => {}); attach(); }
}
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', () => { if (ctx) ctx.suspend().catch(() => {}); });
  attach();
}

export function scene(name) {
  want = name && MUSIC[name] ? name : null;
  sync();
}

export function sfx(name) {
  if (!prefs.sfx || !running() || hidden() || !SFX[name]) return;
  const now = ctx.currentTime;
  if (now - (lastSfx[name] ?? -1) < SFX_GAP) return;
  lastSfx[name] = now;
  played[name] = (played[name] || 0) + 1;
  SFX[name](ctx, sfxBus, now + 0.01);
}

function changed() { savePrefs(); sync(); for (const fn of subs) fn(state()); }
export function setMusic(on) { prefs.music = !!on; changed(); }
export function setSfx(on) {
  prefs.sfx = !!on; changed();
  if (on) sfx('signalClear'); // ให้ได้ยินว่าเปิดแล้ว
}
export function onChange(fn) { subs.add(fn); return () => subs.delete(fn); }

// สถานะสำหรับปุ่มและบอททดสอบ (window.__sjAudio)
export function state() {
  return { music: prefs.music, sfx: prefs.sfx, scene: want, playing, ctx: ctx ? ctx.state : 'none' };
}
if (typeof window !== 'undefined') window.__sjAudio = { state, scene, sfx, setMusic, setSfx, played };
