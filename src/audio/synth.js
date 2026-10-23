// เครื่องดนตรีสังเคราะห์ด้วย Web Audio ล้วน ไม่มีไฟล์เสียงจากภายนอก (LEGAL-AND-COST ข้อ C)
// ทุกฟังก์ชันรับ (ctx, out, t, ...) แล้วสร้างโหนดชั่วคราวที่หยุดเองเมื่อเสียงจบ

export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

let noiseBuf = null;
function noise(ctx) {
  if (!noiseBuf || noiseBuf.sampleRate !== ctx.sampleRate) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  return s;
}

function env(ctx, out, t, peak, attack, decay) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  g.connect(out);
  return g;
}

function osc(ctx, type, freq, dest, t, stop) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.connect(dest);
  o.start(t);
  o.stop(stop);
  return o;
}

// กล่องดนตรี: ไซน์ + ฮาร์มอนิกสูงที่จางเร็ว
export function musicBox(ctx, out, t, midi, vel = 1) {
  const f = mtof(midi);
  const g1 = env(ctx, out, t, 0.22 * vel, 0.004, 1.4);
  osc(ctx, 'sine', f, g1, t, t + 1.5);
  const g2 = env(ctx, out, t, 0.06 * vel, 0.002, 0.25);
  osc(ctx, 'sine', f * 4, g2, t, t + 0.3);
}

// เปียโนไฟฟ้า (FM แบบง่าย) สำหรับคอร์ด
export function ePiano(ctx, out, t, midi, dur, vel = 1) {
  const f = mtof(midi);
  const g = env(ctx, out, t, 0.09 * vel, 0.008, dur);
  const car = osc(ctx, 'sine', f, g, t, t + dur + 0.1);
  const modG = ctx.createGain();
  modG.gain.setValueAtTime(f * 1.2, t);
  modG.gain.exponentialRampToValueAtTime(f * 0.05, t + 0.4);
  modG.connect(car.frequency);
  osc(ctx, 'sine', f * 2, modG, t, t + dur + 0.1);
}

export function bass(ctx, out, t, midi, dur, vel = 1) {
  const g = env(ctx, out, t, 0.28 * vel, 0.01, dur);
  osc(ctx, 'triangle', mtof(midi), g, t, t + dur + 0.05);
}

export function kick(ctx, out, t, vel = 1) {
  const g = env(ctx, out, t, 0.5 * vel, 0.002, 0.22);
  const o = osc(ctx, 'sine', 110, g, t, t + 0.25);
  o.frequency.exponentialRampToValueAtTime(42, t + 0.15);
}

function noiseHit(ctx, out, t, type, freq, q, peak, decay) {
  const s = noise(ctx);
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  s.connect(f);
  f.connect(env(ctx, out, t, peak, 0.002, decay));
  s.start(t, Math.random() * 0.5);
  s.stop(t + decay + 0.05);
}

export const hat = (ctx, out, t, vel = 1) => noiseHit(ctx, out, t, 'highpass', 7000, 0.7, 0.06 * vel, 0.04);
export const shaker = (ctx, out, t, vel = 1) => noiseHit(ctx, out, t, 'bandpass', 5200, 1.2, 0.09 * vel, 0.06);
export const rim = (ctx, out, t, vel = 1) => noiseHit(ctx, out, t, 'bandpass', 1800, 2, 0.12 * vel, 0.07);

// ระฆัง/กระดิ่ง: พาร์เชียลไม่ลงตัวแบบโลหะ
export function bell(ctx, out, t, freq, vel = 1, len = 1.6) {
  for (const [r, a, d] of [[1, 1, 1], [2.76, 0.5, 0.6], [5.4, 0.25, 0.35], [8.93, 0.12, 0.2]]) {
    const g = env(ctx, out, t, 0.12 * a * vel, 0.002, len * d);
    osc(ctx, 'sine', freq * r, g, t, t + len * d + 0.05);
  }
}

// กึก: เสียงกลไก (คันโยก/ประแจ)
export function clunk(ctx, out, t, vel = 1) {
  const g = env(ctx, out, t, 0.4 * vel, 0.002, 0.12);
  const o = osc(ctx, 'sine', 140, g, t, t + 0.15);
  o.frequency.exponentialRampToValueAtTime(60, t + 0.1);
  noiseHit(ctx, out, t, 'lowpass', 900, 0.8, 0.25 * vel, 0.08);
}

export const click = (ctx, out, t, vel = 1) => noiseHit(ctx, out, t, 'bandpass', 3200, 3, 0.2 * vel, 0.03);

// เสียงเลื่อนขึ้น/ลงนุ่ม ๆ
export function blip(ctx, out, t, f0, f1, dur = 0.12, vel = 1) {
  const g = env(ctx, out, t, 0.14 * vel, 0.005, dur);
  const o = osc(ctx, 'sine', f0, g, t, t + dur + 0.05);
  o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.8);
}
