// แปลงชิ้นงาน CC0 ต้นฉบับ (ดาวน์โหลดมาเก็บนอก repo) เป็นไฟล์ที่เกมใช้ใน assets/ — รันครั้งเดียวตอนพัฒนา
//   node tools/build-assets.mjs <โฟลเดอร์ต้นฉบับ>
// โฟลเดอร์ต้นฉบับต้องมีไฟล์ชื่อตามต้นทางตามตาราง SRC ข้างล่าง (zip ของ ambientCG แตกไว้ใน unz_<ชื่อ>/)
// ผลลัพธ์: assets/textures/*.webp (512×512), assets/sky/sky-env.hdr (256×128 RGBE), assets/sky/sky-bg.webp (2048×1024)
// และพิมพ์ sha256 ของต้นฉบับทุกไฟล์ เพื่อจดลง assets/ASSETS.md
// การดัดแปลงทั้งหมดอยู่ในไฟล์นี้: ย่อขนาด, แปลงเป็น WebP, รวมช่อง opacity เป็น alpha, หมุนท้องฟ้าตามแนวนอน, แปลงช่วงสีของภาพพื้นหลังท้องฟ้า
import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { chromium } from 'playwright';

const SRC_DIR = process.argv[2];
if (!SRC_DIR) { console.error('ใช้: node tools/build-assets.mjs <โฟลเดอร์ต้นฉบับ>'); process.exit(1); }
const ROOT = resolve(import.meta.dirname, '..'), OUT_T = join(ROOT, 'assets/textures'), OUT_S = join(ROOT, 'assets/sky');
mkdirSync(OUT_T, { recursive: true }); mkdirSync(OUT_S, { recursive: true });

// ชื่อไฟล์ในเกม: [ไฟล์ต้นฉบับ, ไฟล์ alpha (ถ้ามี)]
const SRC = {
  rock_d: ['unz_Rocks006/Rocks006_1K-JPG_Color.jpg'], rock_n: ['unz_Rocks006/Rocks006_1K-JPG_NormalGL.jpg'],
  soil_d: ['red_laterite_soil_stones_diff_1k.jpg'], soil_n: ['red_laterite_soil_stones_nor_gl_1k.jpg'],
  grass_d: ['leafy_grass_diff_1k.jpg'], grass_n: ['leafy_grass_nor_gl_1k.jpg'],
  wood_d: ['weathered_brown_planks_diff_1k.jpg'], wood_n: ['weathered_brown_planks_nor_gl_1k.jpg'], wood_arm: ['weathered_brown_planks_arm_1k.jpg'],
  conc_d: ['concrete_floor_02_diff_1k.jpg'], conc_n: ['concrete_floor_02_nor_gl_1k.jpg'], conc_arm: ['concrete_floor_02_arm_1k.jpg'],
  iron_d: ['corrugated_iron_diff_1k.jpg'], iron_n: ['corrugated_iron_nor_gl_1k.jpg'], iron_arm: ['corrugated_iron_arm_1k.jpg'],
  plaster_d: ['painted_plaster_wall_diff_1k.jpg'], plaster_n: ['painted_plaster_wall_nor_gl_1k.jpg'], plaster_arm: ['painted_plaster_wall_arm_1k.jpg'],
  metal_n: ['green_metal_rust_nor_gl_1k.jpg'], metal_r: ['green_metal_rust_rough_1k.jpg'],
  leaf: ['unz_LeafSet024/LeafSet024_1K-JPG_Color.jpg', 'unz_LeafSet024/LeafSet024_1K-JPG_Opacity.jpg'],
  fol: ['unz_Foliage001/Foliage001_1K-JPG_Color.jpg', 'unz_Foliage001/Foliage001_1K-JPG_Opacity.jpg'],
};
const SKY_1K = 'kloofendal_48d_partly_cloudy_puresky_1k.hdr', SKY_2K = 'kloofendal_48d_partly_cloudy_puresky_2k.hdr';
const MAX_BYTES = 500 * 1024; // เพดานต่อไฟล์ตาม docs/LEGAL-AND-COST.md
export const SUN_U = 0.869;    // ดวงอาทิตย์อยู่ที่ u = 0.869 ของภาพหลังหมุน: แดดส่องจากฝั่งกล้อง เฉียงแนวราง ~47° (ตัววาดหาทิศจริงจากจุดสว่างสุดของ sky-env.hdr เอง)

const sha = f => createHash('sha256').update(readFileSync(f)).digest('hex');

/* ---------- RGBE (.hdr) ---------- */
function readHdr(buf) {
  let p = 0; const line = () => { let s = ''; while (buf[p] !== 10) s += String.fromCharCode(buf[p++]); p++; return s; };
  if (!line().startsWith('#?')) throw new Error('ไม่ใช่ไฟล์ .hdr');
  for (let l = line(); l !== ''; l = line()) if (l.startsWith('FORMAT') && !l.includes('32-bit_rle_rgbe')) throw new Error('รูปแบบ ' + l);
  const m = /-Y (\d+) \+X (\d+)/.exec(line()), H = +m[1], W = +m[2], px = new Float32Array(W * H * 3), sc = new Uint8Array(W * 4);
  for (let y = 0; y < H; y++) {
    if (buf[p] !== 2 || buf[p + 1] !== 2) throw new Error('รองรับเฉพาะ RLE แบบใหม่');
    p += 4;
    for (let c = 0; c < 4; c++) for (let x = 0; x < W;) {
      let n = buf[p++];
      if (n > 128) { n -= 128; const v = buf[p++]; while (n--) sc[(x++) * 4 + c] = v; } else while (n--) sc[(x++) * 4 + c] = buf[p++];
    }
    for (let x = 0; x < W; x++) { const e = sc[x * 4 + 3], f = e ? Math.pow(2, e - 136) : 0, o = (y * W + x) * 3; px[o] = sc[x * 4] * f; px[o + 1] = sc[x * 4 + 1] * f; px[o + 2] = sc[x * 4 + 2] * f; }
  }
  return { W, H, px };
}
function writeHdrFlat(W, H, px) {             // ไม่บีบอัด (scanline แบบเรียบ) อ่านง่ายในตัวเกม
  const head = Buffer.from(`#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y ${H} +X ${W}\n`), out = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    const r = px[i * 3], g = px[i * 3 + 1], b = px[i * 3 + 2], v = Math.max(r, g, b);
    if (v < 1e-32) continue;
    const e = Math.ceil(Math.log2(v) + 1e-9), f = 256 / Math.pow(2, e);
    out[i * 4] = Math.min(255, r * f); out[i * 4 + 1] = Math.min(255, g * f); out[i * 4 + 2] = Math.min(255, b * f); out[i * 4 + 3] = e + 128;
  }
  return Buffer.concat([head, out]);
}
const lum = (px, i) => px[i * 3] * 0.2126 + px[i * 3 + 1] * 0.7152 + px[i * 3 + 2] * 0.0722;
// หมุนตามแนวนอนให้จุดสว่างสุด (ดวงอาทิตย์) อยู่ที่ u = SUN_U
function rotate({ W, H, px }) {
  let mi = 0; for (let i = 1; i < W * H; i++) if (lum(px, i) > lum(px, mi)) mi = i;
  const shift = Math.round(SUN_U * W - (mi % W + 0.5)), out = new Float32Array(px.length);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const o = (y * W + ((x + shift) % W + W) % W) * 3, i = (y * W + x) * 3; out[o] = px[i]; out[o + 1] = px[i + 1]; out[o + 2] = px[i + 2]; }
  return { W, H, px: out };
}
function shrink({ W, H, px }, f) {
  const w = W / f, h = H / f, out = new Float32Array(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 3; c++) {
    let s = 0; for (let j = 0; j < f; j++) for (let i = 0; i < f; i++) s += px[((y * f + j) * W + x * f + i) * 3 + c];
    out[(y * w + x) * 3 + c] = s / (f * f);
  }
  return { W: w, H: h, px: out };
}
// ภาพพื้นหลัง: แปลงเป็นสีบนจอด้วยสูตรเดียวกับ ACESFilmicToneMapping ของ Three.js (exposure เท่ากับในตัววาด) จึงต่อกับฉากได้สนิท
const EXPOSURE = 0.96, CLAMP = 7, SAT = 1.3, GND = [0.17, 0.15, 0.12];
const fit = v => (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.4329510) + 0.238081);
const toSrgb = v => (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
const smooth = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
export function grade(r, g, b) {               // ใช้ร่วมกับตัววาด: ตัดความสว่างจัด และเพิ่มความอิ่มสีฟ้าเล็กน้อย
  const L = r * 0.2126 + g * 0.7152 + b * 0.0722;
  if (L > CLAMP) { const k = CLAMP / L; return [r * k, g * k, b * k]; }
  return [Math.max(0, L + (r - L) * SAT), Math.max(0, L + (g - L) * SAT), Math.max(0, L + (b - L) * SAT)];
}
function bgPixels({ W, H, px }) {
  const out = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    const below = smooth((y - H / 2) / (H / 51.2));
    for (let x = 0; x < W; x++) {
      const i = y * W + x; let [r, g, b] = grade(px[i * 3], px[i * 3 + 1], px[i * 3 + 2]);
      r += (GND[0] - r) * below; g += (GND[1] - g) * below; b += (GND[2] - b) * below;
      const k = EXPOSURE / 0.6; r *= k; g *= k; b *= k;
      const a = [fit(0.59719 * r + 0.35458 * g + 0.04823 * b), fit(0.07600 * r + 0.90834 * g + 0.01566 * b), fit(0.02840 * r + 0.13383 * g + 0.83777 * b)];
      const o = [1.60475 * a[0] - 0.53108 * a[1] - 0.07367 * a[2], -0.10208 * a[0] + 1.10813 * a[1] - 0.00605 * a[2], -0.00327 * a[0] - 0.07276 * a[1] + 1.07602 * a[2]];
      for (let c = 0; c < 3; c++) out[i * 4 + c] = Math.round(toSrgb(Math.max(0, Math.min(1, o[c]))) * 255);
      out[i * 4 + 3] = 255;
    }
  }
  return out;
}

/* ---------- ภาพ → WebP ด้วย canvas ของ Chromium (Playwright มีอยู่แล้วในเครื่องมือของทีม) ---------- */
const browser = await chromium.launch(), page = await browser.newPage();
const b64 = f => readFileSync(join(SRC_DIR, f)).toString('base64');
async function webp(name, files, size, q) {
  const url = await page.evaluate(async ([srcs, size, q]) => {
    const load = s => new Promise((ok, no) => { const im = new Image(); im.onload = () => ok(im); im.onerror = no; im.src = 'data:image/jpeg;base64,' + s; });
    const ims = await Promise.all(srcs.map(load)), c = document.createElement('canvas'); c.width = c.height = size;
    const g = c.getContext('2d', { willReadFrequently: true }); g.imageSmoothingQuality = 'high';
    g.drawImage(ims[0], 0, 0, size, size);
    if (ims[1]) {                              // รวม opacity เป็นช่อง alpha
      const a = g.getImageData(0, 0, size, size); g.drawImage(ims[1], 0, 0, size, size); const m = g.getImageData(0, 0, size, size);
      for (let i = 0; i < a.data.length; i += 4) a.data[i + 3] = m.data[i];
      g.clearRect(0, 0, size, size); g.putImageData(a, 0, 0);
    }
    return c.toDataURL('image/webp', q);
  }, [files.map(b64), size, q]);
  const buf = Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
  if (!url.startsWith('data:image/webp')) throw new Error('เบราว์เซอร์แปลง WebP ไม่ได้');
  return buf;
}
async function rawWebp(W, H, rgba, q) {
  const url = await page.evaluate(([W, H, s, q]) => {
    const bin = atob(s), u = new Uint8ClampedArray(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    const c = document.createElement('canvas'); c.width = W; c.height = H; c.getContext('2d').putImageData(new ImageData(u, W, H), 0, 0);
    return c.toDataURL('image/webp', q);
  }, [W, H, Buffer.from(rgba.buffer).toString('base64'), q]);
  return Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
}

const report = [];
for (const [name, files] of Object.entries(SRC)) {
  let q = 0.82, buf;
  do { buf = await webp(name, files, 512, q); q -= 0.08; } while (buf.length > MAX_BYTES && q > 0.3);
  if (buf.length > MAX_BYTES) throw new Error(`${name} เกิน 500 KB`);
  writeFileSync(join(OUT_T, name + '.webp'), buf);
  report.push([`textures/${name}.webp`, buf.length, files.map(f => `${f.split('/').pop()} sha256:${sha(join(SRC_DIR, f))}`).join(' + ')]);
}
const env = shrink(rotate(readHdr(readFileSync(join(SRC_DIR, SKY_1K)))), 4), envBuf = writeHdrFlat(env.W, env.H, env.px);
writeFileSync(join(OUT_S, 'sky-env.hdr'), envBuf);
report.push(['sky/sky-env.hdr', envBuf.length, `${SKY_1K} sha256:${sha(join(SRC_DIR, SKY_1K))}`]);
const big = rotate(readHdr(readFileSync(join(SRC_DIR, SKY_2K))));
let bq = 0.8, bgBuf; do { bgBuf = await rawWebp(big.W, big.H, bgPixels(big), bq); bq -= 0.08; } while (bgBuf.length > MAX_BYTES && bq > 0.3);
writeFileSync(join(OUT_S, 'sky-bg.webp'), bgBuf);
report.push(['sky/sky-bg.webp', bgBuf.length, `${SKY_2K} sha256:${sha(join(SRC_DIR, SKY_2K))}`]);
await browser.close();

let total = 0;
for (const [f, n, src] of report) { total += n; console.log(`${f}\t${(n / 1024).toFixed(1)} KB\t${src}`); }
for (const z of ['Rocks006', 'LeafSet024', 'Foliage001']) { try { statSync(join(SRC_DIR, `${z}_1K-JPG.zip`)); console.log(`${z}_1K-JPG.zip sha256:${sha(join(SRC_DIR, `${z}_1K-JPG.zip`))}`); } catch (e) { /* ไม่มี zip ก็ข้าม */ } }
console.log(`รวม ${report.length} ไฟล์ ${(total / 1024 / 1024).toFixed(2)} MB`);
