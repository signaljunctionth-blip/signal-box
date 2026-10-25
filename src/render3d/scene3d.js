// ฉากสถานี 3 มิติ (Three.js) สร้างจากผังของ sim (g.L) ด้วยชิ้นส่วนมาตรฐานที่เขียนด้วยโค้ด + พื้นผิว CC0 ใน assets/
// แนวภาพตาม docs/ART-3D.md (ภาพแนวคิดรุ่น 2.1) — ไฟล์นี้วาดอย่างเดียว อ่านสถานะจาก snapshot()/g ไม่แก้สถานะเกม
//
//   const view = await createScene3D(canvas, { L, era, stationName, tier, colors })
//   view.update(g, dt)  view.render()  view.resize(w, h)  view.anchors() -> [{ target, pos: [x,y,z] }]
//   view.project([x,y,z]) -> { x, y, on }   view.camera: pan(dx, dy, h) orbit(dx, dy, h) zoom(k) reset() zoomed   view.setTier(id)   view.setColors(c)   view.dispose()
import * as THREE from 'three';
import { world3d, trailPoint, pathAt, GAUGE, KX } from './layout3d.js';
import { CARS, KINDS, DEFAULT_KIND, COUPLER } from '../sim/consists.js';
import { tierOf } from './quality.js';

// ชิ้นงาน CC0 (ดู assets/ASSETS.md) Vite แปลงเป็น URL ของไฟล์ตอน build
const TEX_URL = import.meta.glob('../../assets/textures/*.webp', { eager: true, query: '?url', import: 'default' });
const SKY_ENV = new URL('../../assets/sky/sky-env.hdr', import.meta.url).href;
const SKY_BG = new URL('../../assets/sky/sky-bg.webp', import.meta.url).href;
const texUrl = name => TEX_URL[`../../assets/textures/${name}.webp`];

const BAL = 0.34, SLT = BAL + 0.05, RB = SLT + 0.02, RT = RB + 0.16;   // ระดับ: หลังหินโรยทาง, หลังหมอน, ฐานราง, สันราง
const PLAT = 0.55, SIG_SCALE = 1.35;                                   // ความสูงชานชาลา; เสาสัญญาณขยายให้อ่านท่าแขนได้ที่ระยะกล้อง
const ARM_CLEAR = 0.7;                                                 // มุมแขนหางปลาตอนทางเปิด (ราว 40° ยกเฉียงขึ้น ยังไม่ยืนยันกับแหล่งสาธารณะ)

/* ---------- ไฟล์ .hdr แบบไม่บีบอัดที่ tools/build-assets.mjs เขียน ---------- */
function parseFlatHdr(buf) {
  const u8 = new Uint8Array(buf); let p = 0, line = '';
  const next = () => { line = ''; while (u8[p] !== 10) line += String.fromCharCode(u8[p++]); p++; return line; };
  while (next() !== '');
  const m = /-Y (\d+) \+X (\d+)/.exec(next()), H = +m[1], W = +m[2], px = new Float32Array(W * H * 3);
  for (let i = 0; i < W * H; i++) { const e = u8[p + i * 4 + 3], f = e ? Math.pow(2, e - 136) : 0; px[i * 3] = u8[p + i * 4] * f; px[i * 3 + 1] = u8[p + i * 4 + 1] * f; px[i * 3 + 2] = u8[p + i * 4 + 2] * f; }
  return { W, H, px };
}

export async function createScene3D(canvas, opts) {
  const { L, era, stationName = '', colors = {} } = opts;
  let tier = tierOf(opts.tier);
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: tier.id !== 'low', powerPreference: 'high-performance' }); }
  catch (e) { throw new Error('webgl'); }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, tier.ratio));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.96;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;      // r185: PCFSoftShadowMap เลิกใช้แล้ว (สลับเองตอนวาดเงาครั้งแรก ทำให้ shader ไม่ตรงกันในเฟรมที่ข้ามการวาดเงา)
  renderer.shadowMap.autoUpdate = false;
  const MAXANI = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const W = world3d(L), B = W.bounds;
  const scene = new THREE.Scene();
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const rr = (a, b) => a + rnd() * (b - a);
  const smooth = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
  const disposables = [];
  const keep = o => { disposables.push(o); return o; };

  /* ================= พื้นผิว ================= */
  const loader = new THREE.TextureLoader();
  const NAMES = ['rock_d', 'rock_n', 'soil_d', 'soil_n', 'grass_d', 'grass_n', 'wood_d', 'wood_n', 'wood_arm', 'conc_d', 'conc_n', 'conc_arm', 'iron_d', 'iron_n', 'iron_arm', 'plaster_d', 'plaster_n', 'plaster_arm', 'metal_n', 'metal_r', 'leaf', 'fol'];
  const T = {};
  const [envBuf, bgTex] = await Promise.all([
    fetch(SKY_ENV).then(r => { if (!r.ok) throw new Error('sky'); return r.arrayBuffer(); }),
    loader.loadAsync(SKY_BG),
    ...NAMES.map(k => loader.loadAsync(texUrl(k)).then(t => { T[k] = t; })),
  ]);
  NAMES.forEach(k => {
    const t = keep(T[k]); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = MAXANI;
    t.colorSpace = /_d$/.test(k) || k === 'leaf' || k === 'fol' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  });
  const lowTex = () => tier.id === 'low';
  function canvasTex(w, h, paint) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; paint(c.getContext('2d'), w, h);
    const t = keep(new THREE.CanvasTexture(c)); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = MAXANI; return t;
  }
  function pbr(name, o) {
    const m = new THREE.MeshStandardMaterial(Object.assign({ map: T[name + '_d'], normalMap: lowTex() ? null : T[name + '_n'], roughness: 1, metalness: 0 }, o || {}));
    if (T[name + '_arm'] && tier.id === 'high') { m.aoMap = T[name + '_arm']; m.roughnessMap = T[name + '_arm']; }
    return keep(m);
  }
  const flat = (color, rough, o) => keep(new THREE.MeshStandardMaterial(Object.assign({ color: new THREE.Color(color), roughness: rough == null ? 0.85 : rough, metalness: 0 }, o || {})));
  const paint = (color, o) => keep(new THREE.MeshStandardMaterial(Object.assign({ color: new THREE.Color(color), roughness: 0.62, metalness: 0, normalMap: lowTex() ? null : T.metal_n, roughnessMap: T.metal_r, normalScale: new THREE.Vector2(0.35, 0.35) }, o || {})));
  const C = (r, g, b) => new THREE.Color(r, g, b);
  const M = {
    ballast: null,                                  // หินโรยทาง: พื้นผิววาดด้วยโค้ด ดูหัวข้อ "หินโรยทาง"
    ballastLoad: pbr('rock', { color: C(0.8, 0.78, 0.74) }),
    sleeper: pbr('wood', { vertexColors: true }),
    woodWall: keep(new THREE.MeshStandardMaterial({ color: new THREE.Color(0xd8c79c), normalMap: lowTex() ? null : T.wood_n, roughnessMap: T.wood_arm, roughness: 1, normalScale: new THREE.Vector2(1.6, 1.6) })),
    woodDado: pbr('wood', { color: C(0.95, 0.72, 0.6) }),
    woodTrim: pbr('wood', { color: C(0.62, 0.45, 0.38) }),
    woodPale: keep(new THREE.MeshStandardMaterial({ color: new THREE.Color(0xd9d6c8), normalMap: lowTex() ? null : T.wood_n, roughness: 0.8 })),
    woodPole: pbr('wood', { color: C(0.8, 0.72, 0.66) }),
    conc: pbr('conc', { color: C(1.12, 1.1, 1.05) }),
    iron: pbr('iron', { color: C(0.92, 0.9, 0.86), metalnessMap: T.iron_arm, metalness: 1, envMapIntensity: 0.9 }),
    plaster: pbr('plaster', { color: C(1.1, 1.05, 0.92) }),
    railHead: flat(0xc9cdd2, 0.22, { metalness: 1, envMapIntensity: 1.3 }),
    railSide: flat(0x5a3a2a, 0.82, { metalness: 0.25 }),
    dark: flat(0x26282b, 0.75, { metalness: 0.2 }),
    steel: flat(0x8d9296, 0.38, { metalness: 0.9 }),
    wheel: flat(0x4d4a48, 0.5, { metalness: 0.7 }),
    glass: flat(0x18222b, 0.06, { envMapIntensity: 1.8, userData: { keep: true } }),
    frame: flat(0xb9bbb6, 0.45, { metalness: 0.6 }),
    white: flat(0xe6e3d8, 0.7),
    black: flat(0x1c1d1f, 0.7),
    yellow: flat(0xd6ae35, 0.75),
    lampOff: flat(0xe9e4cf, 0.3, { userData: { keep: true } }),
    roofGrey: paint(0x6f7376, { roughness: 0.8 }),
    poleGreen: paint(0x3d5446),
    armRed: flat(0xc8392f, 0.6),
  };

  /* ================= ตัวช่วยเรขาคณิต ================= */
  function boxGeo(w, h, d, tile, swap) {
    const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv, t = tile || 1, ou = rnd(), ov = rnd();
    const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) {
      const k = f * 4 + i; let u = uv.getX(k) * dims[f][0] / t + ou, v = uv.getY(k) * dims[f][1] / t + ov;
      if (swap) { const s = u; u = v; v = s; } uv.setXY(k, u, v);
    }
    return g;
  }
  const UP = new THREE.Vector3(0, 1, 0);
  const _v = new THREE.Vector3(), _m3 = new THREE.Matrix3(), _e = new THREE.Euler(), _q = new THREE.Quaternion(), _one = new THREE.Vector3(1, 1, 1);
  // รวมชิ้นเล็กหลายชิ้นเป็น mesh เดียวต่อวัสดุ (ลด draw call)
  class Merger {
    constructor(flat) { this.b = new Map(); this.flat = flat || null; }   // flat: VMerger ที่รับชิ้นสีเรียบ (ไม่มีพื้นผิว) รวมเป็น mesh เดียว
    add(geo, mat, mtx, uvs) {
      if (this.flat && mat && mat.isMaterial && !mat.map && !mat.userData.keep) return this.flat.add(geo, mat, mtx, uvs);
      const g = geo.index ? geo.toNonIndexed() : geo, p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv, s = uvs || 1;
      let e = this.b.get(mat); if (!e) { e = { p: [], n: [], u: [] }; this.b.set(mat, e); }
      if (mtx) _m3.getNormalMatrix(mtx);
      for (let i = 0; i < p.count; i++) {
        _v.fromBufferAttribute(p, i); if (mtx) _v.applyMatrix4(mtx); e.p.push(_v.x, _v.y, _v.z);
        _v.fromBufferAttribute(n, i); if (mtx) _v.applyMatrix3(_m3).normalize(); e.n.push(_v.x, _v.y, _v.z);
        e.u.push(uv ? uv.getX(i) * s : 0, uv ? uv.getY(i) * s : 0);
      }
      g.dispose(); if (g !== geo) geo.dispose();
      return this;
    }
    bx(mat, w, h, d, x, y, z, o = {}) { return this.add(boxGeo(w, h, d, o.tile, o.swap), mat, mtx(x, y, z, o.rx, o.ry, o.rz)); }
    cy(mat, rt, rb, h, seg, x, y, z, o = {}) { return this.add(new THREE.CylinderGeometry(rt, rb, h, seg), mat, mtx(x, y, z, o.rx, o.ry, o.rz)); }
    build(parent, o = {}) {
      const out = this.flat && this.flat.count() ? this.flat.build(parent, o) : [];
      this.b.forEach((e, mat) => {
        const g = keep(new THREE.BufferGeometry());
        g.setAttribute('position', new THREE.Float32BufferAttribute(e.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(e.n, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(e.u, 2));
        const m = new THREE.Mesh(g, mat); m.castShadow = o.cast !== false; m.receiveShadow = true; parent.add(m); out.push(m);
      });
      return out;
    }
  }
  const mtx = (x, y, z, rx, ry, rz, sx, sy, sz) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), _q.setFromEuler(_e.set(rx || 0, ry || 0, rz || 0)), sx == null ? _one : new THREE.Vector3(sx, sy, sz));
  function prism(shape, len, seg) {                    // หน้าตัดในระนาบ (z,y) ยืดตามแกน x กึ่งกลางที่ x=0
    const g = new THREE.ExtrudeGeometry(shape, { depth: len, bevelEnabled: false, curveSegments: seg || 6 });
    g.rotateY(Math.PI / 2); g.translate(-len / 2, 0, 0); return g;
  }
  function rrShape(hw, y0, y1, rb, rt) {
    const s = new THREE.Shape();
    s.moveTo(-hw + rb, y0); s.lineTo(hw - rb, y0); s.quadraticCurveTo(hw, y0, hw, y0 + rb); s.lineTo(hw, y1 - rt);
    s.quadraticCurveTo(hw, y1, hw - rt, y1); s.lineTo(-hw + rt, y1); s.quadraticCurveTo(-hw, y1, -hw, y1 - rt); s.lineTo(-hw, y0 + rb); s.quadraticCurveTo(-hw, y0, -hw + rb, y0);
    return s;
  }
  function archShape(hw, y, rise) { const s = new THREE.Shape(); s.moveTo(hw, y); s.absellipse(0, y, hw, rise, 0, Math.PI, false); s.lineTo(hw, y); return s; }

  /* ================= ท้องฟ้า แสง หมอก ================= */
  const sunDir = new THREE.Vector3(); let HORIZON = C(0.43, 0.46, 0.56);
  {
    const d = parseFlatHdr(envBuf), { W: w, H: h, px } = d;
    let mx = 0, mi = 0;
    for (let i = 0; i < w * h; i++) { const L_ = px[i * 3] * 0.2126 + px[i * 3 + 1] * 0.7152 + px[i * 3 + 2] * 0.0722; if (L_ > mx) { mx = L_; mi = i; } }
    // ทิศดวงอาทิตย์ตามสูตร equirect ของ Three.js: u = atan(z, x) / 2π + 0.5, v = asin(y) / π + 0.5 (แถวแรกของไฟล์ = ขอบบน)
    const u = (mi % w + 0.5) / w, v = 1 - (Math.floor(mi / w) + 0.5) / h, phi = (u - 0.5) * Math.PI * 2, elev = (v - 0.5) * Math.PI;
    sunDir.set(Math.cos(elev) * Math.cos(phi), Math.sin(elev), Math.cos(elev) * Math.sin(phi)).normalize();
    const out = new Uint16Array(w * h * 4), half = THREE.DataUtils.toHalfFloat, CLAMP = 7, SAT = 1.3, GND = [0.17, 0.15, 0.12], hz = [0, 0, 0];
    for (let y = 0; y < h; y++) {
      const gy = h - 1 - y, below = smooth((y - h / 2) / (h / 51.2));
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 3, o = (gy * w + x) * 4;
        let r = px[i], g = px[i + 1], b = px[i + 2];
        const L_ = r * 0.2126 + g * 0.7152 + b * 0.0722;
        if (L_ > CLAMP) { const k = CLAMP / L_; r *= k; g *= k; b *= k; } else { r = Math.max(0, L_ + (r - L_) * SAT); g = Math.max(0, L_ + (g - L_) * SAT); b = Math.max(0, L_ + (b - L_) * SAT); }
        if (y === (h >> 1) - Math.round(h / 57)) { hz[0] += r / w; hz[1] += g / w; hz[2] += b / w; }
        r += (GND[0] - r) * below; g += (GND[1] - g) * below; b += (GND[2] - b) * below;
        out[o] = half(r); out[o + 1] = half(g); out[o + 2] = half(b); out[o + 3] = half(1);
      }
    }
    HORIZON = C(hz[0], hz[1], hz[2]);
    const tex = new THREE.DataTexture(out, w, h, THREE.RGBAFormat, THREE.HalfFloatType, THREE.EquirectangularReflectionMapping);
    tex.minFilter = tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = false; tex.needsUpdate = true;
    const pm = new THREE.PMREMGenerator(renderer);
    const envRT = pm.fromEquirectangular(tex); scene.environment = envRT.texture; pm.dispose(); tex.dispose(); keep(envRT);
    bgTex.mapping = THREE.EquirectangularReflectionMapping; bgTex.colorSpace = THREE.SRGBColorSpace; keep(bgTex);
    scene.background = bgTex;                      // ภาพพื้นหลังแปลงสีบนจอไว้แล้ว Three.js จึงไม่ tone map ซ้ำ
  }
  // หมอกผสมหลัง tone mapping: แปลงสีขอบฟ้าเป็นสีที่แสดงบนจอก่อน (สูตรเดียวกับ ACESFilmicToneMapping)
  function displayColor(c) {
    const k = renderer.toneMappingExposure / 0.6, r = c.r * k, g = c.g * k, b = c.b * k, fit = v => (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.4329510) + 0.238081);
    const a = [fit(0.59719 * r + 0.35458 * g + 0.04823 * b), fit(0.07600 * r + 0.90834 * g + 0.01566 * b), fit(0.02840 * r + 0.13383 * g + 0.83777 * b)];
    const o = [1.60475 * a[0] - 0.53108 * a[1] - 0.07367 * a[2], -0.10208 * a[0] + 1.10813 * a[1] - 0.00605 * a[2], -0.00327 * a[0] - 0.07276 * a[1] + 1.07602 * a[2]].map(v => Math.max(0, Math.min(1, v)));
    return new THREE.Color().setRGB(o[0], o[1], o[2], THREE.LinearSRGBColorSpace);
  }
  scene.fog = new THREE.FogExp2(0xffffff, 0.0017);
  const sun = new THREE.DirectionalLight(C(1.0, 0.94, 0.84), 2.5);
  sun.position.copy(sunDir).multiplyScalar(220); sun.castShadow = true;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.06; sun.shadow.radius = 3;
  scene.add(sun, sun.target);
  // กรอบเงาขนานแนวราง ครอบย่านสถานี (จุดบนกล้องมาตรฐาน) ใช้ทั้งฉากเพราะกล้องเลื่อนได้แค่ในย่านนี้
  function fitShadow() {
    const z = sunDir.clone(), x = new THREE.Vector3(1, 0, 0).addScaledVector(z, -z.x).normalize(), up = new THREE.Vector3().crossVectors(z, x);
    const cam = sun.shadow.camera; cam.up.copy(up);
    let l = 1e9, r = -1e9, b = 1e9, t = -1e9;
    [B.x0 - 30, B.x1 + 30].forEach(px => [0, 12].forEach(py => [B.z0 - 30, B.z1 + 12].forEach(pz => { _v.set(px, py, pz); const a = _v.dot(x), c = _v.dot(up); l = Math.min(l, a); r = Math.max(r, a); b = Math.min(b, c); t = Math.max(t, c); })));
    cam.left = l; cam.right = r; cam.bottom = b; cam.top = t; cam.near = 60; cam.far = 420; cam.updateProjectionMatrix();
  }
  fitShadow();

  /* ================= พื้นที่สถานี (ใช้ทั้ง shader พื้นและการวางของ) ================= */
  const trackList = Object.values(W.tracks);
  const corridor = x => {                         // ขอบบน/ล่างของแนวรางทั้งหมดที่ x (null = ไม่มีราง)
    let a = Infinity, b = -Infinity;
    for (const t of trackList) if (x >= t.x0 - 0.5 && x <= t.x1 + 0.5) { const z = t.zAt(x); a = Math.min(a, z); b = Math.max(b, z); }
    if (a === Infinity) { a = 0; b = 0; }       // นอกผัง: ทางประธานต่อไปตรง ๆ
    return [a, b];
  };
  // ชานชาลาที่มีอาคารสถานี: ต้องอยู่ฝั่งบนของแผง (-z) เพราะกล้องอยู่ฝั่งล่างเสมอ ซ้ายขวาจึงตรงกับแผงผังเส้น
  // ชานชาลาที่อยู่ฝั่งกล้อง (เช่น วังโพ) ไม่วางอาคาร ไม่ให้บังราง (วาดเป็นชานชาลาเปล่าแบบเดียวกับชานชาลาอื่น)
  const realPlat = W.platforms.find(p => !p.none && p.side < 0) || null;
  const PS = realPlat ? realPlat.side : -1;       // ด้านอาคารสถานี (-1 = บนของแผง)
  const PZ = realPlat ? realPlat.z + PS * 4.025 : B.z0 - 4.025;
  const BZ = PZ + PS * 5.175;                     // แนวกลางอาคารสถานี
  const farZ = PS < 0 ? B.z1 : B.z0;              // ขอบรางฝั่งไกลจากอาคาร (ฝั่งกล้อง)
  const camSide = -PS;                            // กล้องอยู่ฝั่งตรงข้ามอาคาร มองข้ามรางไปเห็นชานชาลา
  const lotZ = BZ - PS * 1.3;
  const hash = (i, j) => { const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return s - Math.floor(s); };
  function vnoise(x, y) { const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    return (hash(i, j) * (1 - u) + hash(i + 1, j) * u) * (1 - v) + (hash(i, j + 1) * (1 - u) + hash(i + 1, j + 1) * u) * v; }
  const fbm = (x, y) => vnoise(x, y) * 0.5 + vnoise(x * 2.03 + 7.1, y * 2.03 + 1.7) * 0.3 + vnoise(x * 4.1 + 3.3, y * 4.1 + 9.2) * 0.2;
  const CORR_SPAN = 600, CORR_N = 1024;           // ตารางขอบแนวรางสำหรับ shader (x จาก -300 ถึง 300 ม.)
  const corrTab = Array.from({ length: CORR_N }, (_, i) => corridor((i + 0.5) / CORR_N * CORR_SPAN - CORR_SPAN / 2));
  const corrAt = x => corrTab[Math.max(0, Math.min(CORR_N - 1, Math.floor((x + CORR_SPAN / 2) / CORR_SPAN * CORR_N)))];
  const sdBox = (x, z, cx, cz, bx, bz, r) => { const dx = Math.abs(x - cx) - bx + r, dz = Math.abs(z - cz) - bz + r; return Math.hypot(Math.max(dx, 0), Math.max(dz, 0)) + Math.min(Math.max(dx, dz), 0) - r; };
  const LOT = [0, lotZ, Math.min(31, (realPlat ? (realPlat.x1 - realPlat.x0) / 2 : 31)), 7, 4];
  const drive = z => 11 + Math.sin(z * 0.05) * 4;
  function soilDist(x, z) {                       // ระยะถึงเขตดินลูกรัง (ลบ = อยู่ในเขตดิน) สูตรเดียวกับ shader
    const [a, b] = corrAt(x), dT = Math.max(a - z, z - b) - 2.9;
    const along = PS * (z - lotZ) > 0 ? sdBox(x, z, drive(z), lotZ + PS * 50, 1.7, 46, 1) : 99;
    return Math.min(dT, realPlat ? sdBox(x, z, LOT[0], LOT[1], LOT[2], LOT[3], LOT[4]) : 99, realPlat ? along : 99);
  }
  const groundH = (x, z) => { const [a, b] = corrAt(x), d = Math.max(a - z, z - b, 0); return smooth((d - 22) / 70) * (fbm(x * 0.011, z * 0.011) - 0.42) * 8; };
  const segD = (px, pz, ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz))); return Math.hypot(px - ax - dx * t, pz - az - dz * t); };
  const walkZ = farZ + camSide * 5.4, crossX = (W.points.P1 ? W.points.P1.x : B.x0) + 5;
  function pathDist(x, z) {
    const a = Math.abs(x) < 170 ? Math.abs(z - (walkZ + camSide * (2.2 * Math.sin(x * 0.035) + 1.1 * Math.sin(x * 0.11 + 1)))) : 99;   // ทางเดินเลียบทางฝั่งกล้อง
    const [c0, c1] = corrAt(crossX), b = (z > c0 - 4.5 && z < c1 + 6.5) ? Math.abs(x - (crossX + 0.8 * Math.sin(z * 0.3))) : 99;         // ทางข้ามราง
    const wob = Math.sin((x + z) * 0.06) * 3;
    return Math.min(a, b, segD(x, z + wob, -30, lotZ + PS * 3.5, -160, lotZ + PS * 74), segD(x + wob * 0.6, z, 38, walkZ, 130, walkZ + camSide * 82), segD(x, z + wob * 0.5, 30, lotZ + PS * 1.5, 150, lotZ + PS * 30));
  }
  const isOpen = (x, z) => { const d = camSide * (z - farZ); return d > 4 && d < 320 && Math.abs(x - (B.x0 + B.x1) / 2) < (B.x1 - B.x0) / 2 + 30 + d * 0.5; };   // แนวมองของกล้อง (ลิ่มกว้างขึ้นตามระยะ) เว้นไม่ให้มีป่า
  function groveF(x, z) {                         // ความหนาแน่นป่า 0..1 เว้นย่านสถานีและแนวมองของกล้อง
    let f = smooth((fbm(x * 0.0105 + 2.2, z * 0.0105 + 6.1) - 0.46) / 0.1);
    f = Math.max(f, smooth(1.15 - Math.hypot((x + 14) / 70, (z - (BZ + PS * 43)) / 22)), smooth(1.1 - Math.hypot((x - 78) / 30, (z - (BZ + PS * 35)) / 24)));
    const [a, b] = corrAt(x); f *= smooth((soilDist(x, z) - 3.5) / 6) * smooth((Math.max(a - z, z - b) - 6.5) / 5);
    { const d = camSide * (z - farZ), half = (B.x1 - B.x0) / 2 + 30 + Math.max(0, d) * 0.5; if (d > 0) f *= 1 - smooth(d / 5) * smooth((330 - d) / 30) * smooth((half - Math.abs(x - (B.x0 + B.x1) / 2)) / 14); }
    return f;
  }
  function field(x, z) {
    const g = groveF(x, z);
    const soil = Math.max(smooth(1 - pathDist(x, z) / 1.5), smooth((fbm(x * 0.07 + 31, z * 0.07 + 5) - 0.74) / 0.07) * (1 - g) * 0.75);
    const tall = smooth((fbm(x * 0.03 + 11, z * 0.03 + 3) * 0.7 + fbm(x * 0.11, z * 0.11 + 8) * 0.3 - 0.45) / 0.14) * (1 - soil);
    const dry = smooth((fbm(x * 0.022 + 40, z * 0.022 + 17) - 0.5) / 0.16);
    return [soil, tall, dry, g];
  }
  const MASK_M = 640, maskTex = (() => {          // R ดินโผล่/ทางเดิน, G หญ้าสูง, B หญ้าแห้ง, A ใต้ป่า
    const n = tier.mask, px = new Uint8Array(n * n * 4);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const f = field((i + 0.5) / n * MASK_M - MASK_M / 2, (j + 0.5) / n * MASK_M - MASK_M / 2), o = (j * n + i) * 4; px[o] = f[0] * 255; px[o + 1] = f[1] * 255; px[o + 2] = f[2] * 255; px[o + 3] = f[3] * 255; }
    const t = keep(new THREE.DataTexture(px, n, n, THREE.RGBAFormat)); t.minFilter = t.magFilter = THREE.LinearFilter; t.generateMipmaps = false; t.needsUpdate = true; return t;
  })();
  const corrTex = (() => {                        // ขอบแนวราง (บน, ล่าง) และลานหน้าสถานี ให้ shader ทำขอบดินลูกรังที่คม
    const px = new Uint16Array(CORR_N * 4), half = THREE.DataUtils.toHalfFloat;
    corrTab.forEach(([a, b], i) => { px[i * 4] = half(a); px[i * 4 + 1] = half(b); px[i * 4 + 2] = half(0); px[i * 4 + 3] = half(1); });
    const t = keep(new THREE.DataTexture(px, CORR_N, 1, THREE.RGBAFormat, THREE.HalfFloatType)); t.minFilter = t.magFilter = THREE.LinearFilter; t.generateMipmaps = false; t.needsUpdate = true; return t;
  })();

  /* ================= พื้นดิน ================= */
  {
    const N = tier.id === 'high' ? 120 : 84, pos = [], uv = [], idx = [], f = s => Math.sign(s) * s * s * 1200;
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) { const x = f(i / N * 2 - 1), z = f(j / N * 2 - 1); pos.push(x, groundH(x, z), z); uv.push(x * 0.5, z * 0.5); }
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const a = j * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
    const g = keep(new THREE.BufferGeometry()); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    const m = keep(new THREE.MeshStandardMaterial({ map: T.grass_d, normalMap: lowTex() ? null : T.grass_n, roughness: 1, metalness: 0 }));
    const LOTV = `vec4(${LOT.map(v => v.toFixed(2)).slice(0, 4).join(', ')})`, real = realPlat ? '1.0' : '0.0';
    m.onBeforeCompile = sh => {
      sh.uniforms.soilMap = { value: T.soil_d }; sh.uniforms.soilN = { value: T.soil_n }; sh.uniforms.maskTex = { value: maskTex }; sh.uniforms.corrTex = { value: corrTex };
      sh.vertexShader = 'varying vec2 vWxz;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vWxz = (modelMatrix * vec4(transformed, 1.0)).xz;');
      sh.fragmentShader = `varying vec2 vWxz; uniform sampler2D soilMap; uniform sampler2D soilN; uniform sampler2D maskTex; uniform sampler2D corrTex; float gSoil;
        float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
        float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + 1.0), f.x), f.y); }
        float fbm(vec2 p){ return vn(p) * 0.5 + vn(p * 2.03 + 7.1) * 0.3 + vn(p * 4.1 + 3.3) * 0.2; }
        float sdB(vec2 p, vec2 c, vec2 b, float r){ vec2 d = abs(p - c) - b + r; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r; }
        ` + sh.fragmentShader.replace('#include <map_fragment>', `
        vec2 gu = vWxz * 0.5;
        vec2 cr = texture2D(corrTex, vec2(clamp((vWxz.x + ${(CORR_SPAN / 2).toFixed(1)}) / ${CORR_SPAN.toFixed(1)}, 0.0, 1.0), 0.5)).xy;
        float dT = max(cr.x - vWxz.y, vWxz.y - cr.y) - 2.9;
        vec4 lot = ${LOTV};
        float dS = min(dT, mix(99.0, sdB(vWxz, lot.xy, lot.zw, 4.0), ${real}));
        float n1 = fbm(vWxz * 0.33) * 2.0 - 1.0, n2 = fbm(vWxz * 1.9 + 5.0) * 2.0 - 1.0;
        vec4 mk = texture2D(maskTex, vWxz / ${MASK_M.toFixed(1)} + 0.5);
        mk = mix(vec4(0.0, 0.4, 0.35, 0.0), mk, 1.0 - smoothstep(265.0, 315.0, max(abs(vWxz.x), abs(vWxz.y))));
        gSoil = max(smoothstep(0.9, -0.6, dS + n1 * 1.5 + n2 * 0.6), smoothstep(0.36, 0.62, mk.r + n2 * 0.22 + n1 * 0.08));
        float grain = fbm(vWxz * 1.5 + 1.0) * 0.55 + fbm(vWxz * 4.7 + 3.0) * 0.45;
        float tall = smoothstep(0.26, 0.78, mk.g + n1 * 0.14 + (grain - 0.5) * 0.7);
        float dry = smoothstep(0.36, 0.82, mk.b + n1 * 0.14 + (grain - 0.5) * 0.5) * (1.0 - tall);
        vec3 raw = mix(texture2D(map, gu).rgb, texture2D(map, gu * 0.31 + 0.37).rgb, 0.5);
        float gl = dot(raw, vec3(0.3, 0.6, 0.1));
        vec3 gc = mix(gl * vec3(0.42, 0.78, 0.14) * 0.8, raw * 0.62, 0.36);
        gc = mix(gc, gl * vec3(0.9, 0.84, 0.32), dry * 0.6);
        gc = mix(gc, gl * vec3(0.22, 0.6, 0.08) * mix(0.65, 1.3, vn(vWxz * vec2(2.6, 0.8) + 7.0)), tall * 0.9);
        gc *= mix(0.6, 1.32, grain) * mix(0.72, 1.2, fbm(vWxz * 0.045)) * mix(0.82, 1.12, fbm(vWxz * 0.17 + 4.0));
        gc = mix(gc, raw * vec3(0.62, 0.52, 0.4) * mix(0.7, 1.15, grain), smoothstep(0.25, 0.75, mk.a + n1 * 0.15) * 0.8);
        vec3 sc = mix(texture2D(soilMap, gu).rgb, texture2D(soilMap, gu * 0.27 + 0.11).rgb, 0.5) * mix(0.8, 1.18, fbm(vWxz * 0.09 + 3.0));
        sc = mix(sc, vec3(dot(sc, vec3(0.33))), 0.28); sc = mix(sc, sc * vec3(0.8, 0.82, 0.86), smoothstep(-1.0, -4.0, dT));
        sc *= mix(0.8, 1.1, grain);
        diffuseColor.rgb *= mix(gc, sc, gSoil);`);
      if (m.normalMap) sh.fragmentShader = sh.fragmentShader.replace('texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0', 'mix(texture2D( normalMap, vNormalMapUv ).xyz, texture2D( soilN, vNormalMapUv ).xyz, gSoil) * 2.0 - 1.0');
    };
    const mesh = new THREE.Mesh(g, m); mesh.receiveShadow = true; scene.add(mesh);
  }
  // สันเขา 3 ชั้น จางตามระยะ
  { const HP = [], HI = [], HN = [], HC = [];
  [[430, 6, 22, 0x3d5a34, 1.3], [640, 16, 50, 0x44613a, 2.7], [900, 34, 96, 0x4a6742, 5.1]].forEach(([R, h0, h1, col, off]) => {
    const n = 220, pos = [], idx = [], nor = [], c = new THREE.Color(col), base = HP.length / 3;
    for (let i = 0; i <= n; i++) {
      const a = i / n * Math.PI * 2, c = Math.cos(a), s = Math.sin(a), k = (i % n) / n * 40;
      const w = Math.min(1, vnoise(k * 0.6 + off, off) * 0.6 + vnoise(k * 1.7 + off, 3.1) * 0.3 + vnoise(k * 4.3, off) * 0.18), h = h0 + (h1 - h0) * w * w * 1.6;
      pos.push(c * (R + 60), -6, s * (R + 60), c * R, h * 0.55, s * R, c * (R + 50), h, s * (R + 50));
      nor.push(-c * 0.6, 0.8, -s * 0.6, -c * 0.7, 0.7, -s * 0.7, -c * 0.4, 0.9, -s * 0.4);
    }
    for (let i = 0; i < n; i++) for (let k = 0; k < 2; k++) { const a = i * 3 + k, b = a + 1, c2 = a + 3, d = c2 + 1; idx.push(a, b, c2, b, d, c2); }
    HP.push(...pos); HN.push(...nor); idx.forEach(i => HI.push(i + base)); for (let i = 0; i < pos.length / 3; i++) HC.push(c.r, c.g, c.b);
  });
  const g = keep(new THREE.BufferGeometry()); g.setAttribute('position', new THREE.Float32BufferAttribute(HP, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(HN, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(HC, 3)); g.setIndex(HI);
  scene.add(new THREE.Mesh(g, keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide })))); }

  /* ================= ทางรถไฟ: หินโรยทาง ราง หมอน (จากไฟล์ผัง) ================= */
  const EXT = 900;                                 // ทางประธานต่อออกไปนอกผังจนสุดสายตา
  const lineOf = t => {                            // จุดของรางในโลก ต่อปลายรางที่เป็นขาออกนอกผังให้ยาวถึงขอบฟ้า
    const pts = t.pts.map(p => [p[0], p[1]]);
    if (W.buffers.some(b => b.track === t.id)) return pts;   // รางสุดทาง (มีหลักกันชน) ไม่ต่อออกไป
    if (t.x0 <= B.x0 - 1 && t.x0 === Math.min(...trackList.map(o => o.x0))) pts.unshift([-EXT, pts[0][1]]);
    if (t.x1 >= B.x1 + 1 && t.x1 === Math.max(...trackList.map(o => o.x1))) pts.push([EXT, pts[pts.length - 1][1]]);
    return pts;
  };
  const LINES = trackList.map(t => ({ id: t.id, pts: lineOf(t) }));
  const frames = pts => pts.map((p, i) => { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1; return { x: p[0], z: p[1], tx: dx / l, tz: dz / l, nx: -dz / l, nz: dx / l }; });
  const dense = pts => {                           // แบ่งช่วงยาวเป็นช่วงละไม่เกิน 4 ม. ใกล้สถานี
    const out = [pts[0]];
    for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i], d = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.abs(a[0]) > 220 && Math.abs(b[0]) > 220 ? 1 : Math.max(1, Math.ceil(d / 4)); for (let j = 1; j <= n; j++) out.push([a[0] + (b[0] - a[0]) * j / n, a[1] + (b[1] - a[1]) * j / n]); }
    return out;
  };
  // หินโรยทาง (WP11): หินแกรนิตย่อยสีเทา พื้นผิววาดด้วยโค้ด (ก้อนหินเหลี่ยมหลายเฉดบนร่องเงา ต่อขอบได้) ใช้ normal ของหิน CC0 เดิมให้ผิวขรุขระ
  // หน้าตัด: บ่าหินเสมอหลังหมอน ลาดไหล่ทางลงถึงตีนลาดที่จมดินเล็กน้อย สีไหล่ทางหม่นลงเพราะฝุ่นดิน ใช้สุ่มชุดของตัวเอง ไม่กระทบตำแหน่งต้นไม้
  let bseed = 911; const brnd = () => (bseed = (bseed * 16807) % 2147483647) / 2147483647;
  const ballastTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#3c3f42'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 700; i++) {
      const x = brnd() * w, y = brnd() * h, r = 4.5 + brnd() * 6.5, n = 5 + Math.floor(brnd() * 3), a0 = brnd() * 6.28;
      const v = 92 + brnd() * 92, warm = (brnd() - 0.5) * 14, pts = [];
      for (let k = 0; k < n; k++) { const a = a0 + k / n * 6.28, rk = r * (0.7 + brnd() * 0.45); pts.push([Math.cos(a) * rk, Math.sin(a) * rk * (0.75 + brnd() * 0.3)]); }
      const speck = brnd() < 0.5;
      for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) {
        if (x + ox < -12 || x + ox > w + 12 || y + oy < -12 || y + oy > h + 12) continue;
        const shape = d => { g.beginPath(); pts.forEach(([px, py], k) => (k ? g.lineTo : g.moveTo).call(g, x + ox + px * d, y + oy + py * d)); g.closePath(); };
        g.fillStyle = 'rgba(30,32,35,0.45)'; g.save(); g.translate(1.2, 1.4); shape(1.02); g.fill(); g.restore();   // เงาใต้ก้อน
        g.fillStyle = `rgb(${v + warm | 0},${v + warm * 0.4 | 0},${v - warm * 0.3 + 3 | 0})`; shape(1); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.13)'; g.save(); g.translate(-0.8, -0.9); shape(0.55); g.fill(); g.restore();   // หน้าหินรับแสง
        if (speck) { g.fillStyle = 'rgba(25,25,28,0.5)'; g.fillRect(x + ox - 0.6, y + oy + 0.4, 1.2, 1.2); }   // เม็ดแร่สีเข้มของหินแกรนิต
      }
    }
  });
  ballastTex.wrapS = ballastTex.wrapT = THREE.RepeatWrapping;
  M.ballast = keep(new THREE.MeshStandardMaterial({ map: ballastTex, normalMap: lowTex() ? null : T.rock_n, normalScale: new THREE.Vector2(1.1, 1.1), vertexColors: true, roughness: 0.95, metalness: 0 }));
  {
    const pos = [], col = [], uv = [], nor = [], idx = []; let base = 0;
    // [ระยะจากศูนย์กลางราง, ความสูง, ความสว่าง, ลาดของ normal, ฝุ่นดิน 0..1]
    const PR = [[-3.1, -0.03, 0.62, -0.5, 1], [-2.55, 0.1, 0.8, -0.55, 0.6], [-1.68, BAL - 0.02, 0.96, -0.2, 0.15], [-1.45, BAL, 1, 0, 0], [-0.62, BAL, 0.98, 0, 0], [0, BAL - 0.012, 0.7, 0, 0],
      [0.62, BAL, 0.98, 0, 0], [1.45, BAL, 1, 0, 0], [1.68, BAL - 0.02, 0.96, 0.2, 0.15], [2.55, 0.1, 0.8, 0.55, 0.6], [3.1, -0.03, 0.62, 0.5, 1]];
    LINES.forEach((ln, li) => {
      const fr = frames(dense(ln.pts)), lift = li * 0.004;   // รางขนานกันไหล่ทางซ้อนกัน: ยกทีละนิดกันผิวกะพริบ
      fr.forEach(f => PR.forEach(([o, y, c, nz, dust]) => {
        const x = f.x + f.nx * o, z = f.z + f.nz * o, j = 0.9 + vnoise(x * 0.37, z * 0.5) * 0.2, cc = c * j;
        pos.push(x, y + lift, z);
        // เทาเย็นเล็กน้อยบนบ่าหิน ไหล่ทางผสมสีฝุ่นดินลูกรัง
        col.push(cc * (0.9 + dust * 0.12), cc * 0.91, cc * (0.93 - dust * 0.12)); uv.push(x / 1.25, z / 1.25);
        nor.push(f.nx * nz, 1, f.nz * nz);
      }));
      // หันหน้าขึ้น (เดิมเรียงจุดกลับด้าน หน้าหินหันลงดินจึงถูกตัดทิ้ง เห็นแต่ดินลูกรังข้างใต้)
      for (let i = 0; i < fr.length - 1; i++) for (let k = 0; k < PR.length - 1; k++) { const a = base + i * PR.length + k, b = a + 1, c = a + PR.length, d = c + 1; idx.push(a, b, c, b, d, c); }
      base += fr.length * PR.length;
    });
    const g = keep(new THREE.BufferGeometry()); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setIndex(idx);
    const m = new THREE.Mesh(g, M.ballast); m.receiveShadow = true; scene.add(m);
  }
  // เม็ดหินบนไหล่ทาง: ก้อนเหลี่ยม (icosahedron) instanced เดียว กระจายบนลาดและตีนลาดในย่านสถานี ระดับคุณภาพคุมจำนวนด้วย count
  let stoneInst = null;
  {
    const geo = keep(new THREE.IcosahedronGeometry(1, 0)), spots = [];
    const near = LINES.map(ln => frames(dense(ln.pts)).filter(f => f.x > B.x0 - 60 && f.x < B.x1 + 60));
    const total = near.reduce((n, l) => n + l.length, 0);
    for (let k = 0; k < 2400 && total; k++) {
      let r = Math.floor(brnd() * total), l = 0; while (r >= near[l].length) r -= near[l++].length;
      const f = near[l][r], side = brnd() < 0.5 ? -1 : 1, o = side * (1.6 + brnd() * 1.6), t = (Math.abs(o) - 1.6) / 1.55;
      const y = t < 0.6 ? BAL - 0.02 - t / 0.6 * (BAL - 0.12) : 0.1 - (t - 0.6) / 0.4 * 0.13, a = brnd() * 6.28, along = (brnd() - 0.5) * 4;
      spots.push([f.x + f.nx * o + f.tx * along, y, f.z + f.nz * o + f.tz * along, 0.035 + brnd() * 0.05, a, brnd()]);
    }
    const inst = new THREE.InstancedMesh(geo, keep(new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0, flatShading: true })), Math.max(1, spots.length)), d = new THREE.Object3D(), c = new THREE.Color();
    spots.forEach(([x, y, z, s_, a, v], i) => { d.position.set(x, y, z); d.rotation.set(a, a * 1.7, a * 0.6); d.scale.set(s_ * 1.2, s_ * 0.75, s_); d.updateMatrix(); inst.setMatrixAt(i, d.matrix); const g_ = 0.26 + v * 0.22; inst.setColorAt(i, c.setRGB(g_ * 1.01, g_, g_ * 1.03)); });
    inst.receiveShadow = true; inst.frustumCulled = false; scene.add(inst); stoneInst = inst; inst.userData.max = spots.length;
  }
  // ราง: หน้าตัดตัวไอ (ฐาน เอว หัว) ลากตามแนวราง หัวรางมันวาว ข้างรางสีสนิม
  const SIDE = [[-0.075, 0], [-0.075, 0.018], [-0.014, 0.04], [-0.014, 0.112], [-0.038, 0.122], [-0.038, 0.15]];
  const HEAD = [[-0.038, 0.15], [-0.03, 0.16], [0.03, 0.16], [0.038, 0.15]];
  const SIDE_R = SIDE.map(([o, y]) => [-o, y]).reverse();
  function sweep(fr, poly, off, out) {
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), d = new THREE.Vector3(), nn = new THREE.Vector3(), fn = new THREE.Vector3();
    for (let k = 0; k < poly.length - 1; k++) {
      const [o0, y0] = poly[k], [o1, y1] = poly[k + 1], eo = o1 - o0, ey = y1 - y0, el = Math.hypot(eo, ey), n2o = -ey / el, n2y = eo / el;
      for (let i = 0; i < fr.length - 1; i++) {
        const f0 = fr[i], f1 = fr[i + 1];
        a.set(f0.x + f0.nx * (off + o0), RB + y0, f0.z + f0.nz * (off + o0)); b.set(f0.x + f0.nx * (off + o1), RB + y1, f0.z + f0.nz * (off + o1));
        c.set(f1.x + f1.nx * (off + o0), RB + y0, f1.z + f1.nz * (off + o0)); d.set(f1.x + f1.nx * (off + o1), RB + y1, f1.z + f1.nz * (off + o1));
        nn.set(f0.nx * n2o, n2y, f0.nz * n2o);
        fn.subVectors(b, a).cross(_v.subVectors(c, a));
        const q = fn.dot(nn) > 0 ? [a, b, c, b, d, c] : [a, c, b, b, c, d];
        q.forEach(v => { out.p.push(v.x, v.y, v.z); out.n.push(nn.x, nn.y, nn.z); });
      }
    }
  }
  const railMesh = (o, mat, cast) => { const g = keep(new THREE.BufferGeometry()); g.setAttribute('position', new THREE.Float32BufferAttribute(o.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(o.n, 3)); const m = new THREE.Mesh(g, mat); m.receiveShadow = true; m.castShadow = cast; return m; };
  {
    const A = { p: [], n: [] }, Bs = { p: [], n: [] };
    for (const ln of LINES) {
      const fr = frames(ln.pts);                   // ทางโค้งแบ่งทุก 1 ม. มาจาก layout3d แล้ว ทางตรงไม่ต้องแบ่ง
      [-1, 1].forEach(s => { const off = s * (GAUGE / 2 + 0.038); sweep(fr, SIDE, off, Bs); sweep(fr, SIDE_R, off, Bs); sweep(fr, HEAD, off, A); });
    }
    scene.add(railMesh(A, M.railHead, false), railMesh(Bs, M.railSide, true));
  }
  // ไม้หมอน (+ แผ่นรองรางและเครื่องยึดในระดับสูง) instanced สุ่มสีรายท่อน
  const sleeperSets = [];
  {
    const parts = new Merger(), WD = {}, PD = {};
    parts.add(boxGeo(0.23, 0.15, 1.95, 3, true), WD, mtx(0, 0, 0));
    [-1, 1].forEach(s => { const z = s * (GAUGE / 2 + 0.038);
      parts.add(boxGeo(0.17, 0.02, 0.3, 1), PD, mtx(0, 0.085, z));
      [-1, 1].forEach(t => parts.add(boxGeo(0.05, 0.035, 0.05, 1), PD, mtx(0.05 * t, 0.105, z + t * 0.105)).add(boxGeo(0.05, 0.035, 0.05, 1), PD, mtx(-0.05 * t, 0.105, z + t * 0.105))); });
    const p = [], n = [], u = [], c = [];
    parts.b.forEach((e, key) => { p.push(...e.p); n.push(...e.n); u.push(...e.u); const cc = key === WD ? [0.5, 0.44, 0.4] : [0.42, 0.25, 0.17]; for (let i = 0; i < e.p.length / 3; i++) c.push(...cc); });
    const gNear = keep(new THREE.BufferGeometry()); gNear.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); gNear.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
    gNear.setAttribute('uv', new THREE.Float32BufferAttribute(u, 2)); gNear.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
    const gPlain = keep(boxGeo(0.23, 0.15, 1.95, 3, true));
    gPlain.setAttribute('color', new THREE.Float32BufferAttribute(new Array(gPlain.attributes.position.count * 3).fill(0).map((_, i) => [0.5, 0.44, 0.4][i % 3]), 3));
    const near = [], far = [];
    for (const ln of LINES) {
      const pts = dense(ln.pts); let carry = 0.31;
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i], d = Math.hypot(b[0] - a[0], b[1] - a[1]), ry = Math.atan2(-(b[1] - a[1]), b[0] - a[0]);
        for (let s = carry; s < d; s += 0.62) { const x = a[0] + (b[0] - a[0]) * s / d, z = a[1] + (b[1] - a[1]) * s / d; if (Math.abs(x) < 70) near.push([x, z, ry]); else if (Math.abs(x) < 360) far.push([x, z, ry]); }
        carry = (carry - d) % 0.62; if (carry < 0) carry += 0.62;
      }
    }
    const d = new THREE.Object3D(), col = new THREE.Color();
    for (const [plain, geo, list, all] of [[false, gNear, near], [true, gPlain, far], [true, gPlain, near.concat(far), true]]) {
      const inst = new THREE.InstancedMesh(geo, M.sleeper, list.length);
      list.forEach(([x, z, ry], i) => {
        d.position.set(x, SLT - 0.075 - rnd() * 0.012, z); d.rotation.set(0, ry + (rnd() - 0.5) * 0.02, 0); d.updateMatrix(); inst.setMatrixAt(i, d.matrix);
        const v = 0.72 + rnd() * 0.5, w = rnd() * 0.12; inst.setColorAt(i, col.setRGB(v + w, v, v - w * 0.5));
      });
      inst.receiveShadow = true; inst.frustumCulled = false; scene.add(inst);
      sleeperSets.push({ inst, mode: !plain ? 'detail' : all ? 'all' : 'far' });
    }
  }

  /* ================= เงามืดตรงโคน (แผ่นเงานุ่ม) ================= */
  const blobTex = canvasTex(128, 128, g => { const gr = g.createRadialGradient(64, 64, 4, 64, 64, 64); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.55, 'rgba(0,0,0,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); });
  const padTex = canvasTex(256, 64, g => { g.clearRect(0, 0, 256, 64); for (let i = 0; i < 20; i++) { g.fillStyle = 'rgba(0,0,0,0.085)'; const r = i * 1.5; g.beginPath(); const x = r, y = r, w = 256 - 2 * r, h = 64 - 2 * r, c = Math.max(1, 26 - r);
    g.moveTo(x + c, y); g.arcTo(x + w, y, x + w, y + h, c); g.arcTo(x + w, y + h, x, y + h, c); g.arcTo(x, y + h, x, y, c); g.arcTo(x, y, x + w, y, c); g.fill(); } });
  const shadowMat = (tex, op) => keep(new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: op, color: 0x0b1016, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, toneMapped: false, fog: false }));
  const padMat = shadowMat(padTex, 0.42), blobMat = shadowMat(blobTex, 0.5);
  const planeY = keep(new THREE.PlaneGeometry(1, 1)); planeY.rotateX(-Math.PI / 2);
  // แผ่นเงาที่อยู่กับที่รวมเป็น mesh เดียว (pad) และ instanced เดียว (blob) ตอนท้ายการสร้างฉาก
  const padList = [], blobList = [];
  function pad(w, d, x, y, z, parent, ry) {
    if (!parent) { padList.push([w, d, x, y, z, ry || 0]); return null; }
    const m = new THREE.Mesh(planeY, padMat); m.scale.set(w, 1, d); m.rotation.y = ry || 0; m.position.set(x, y, z); m.renderOrder = 2; parent.add(m); return m;
  }
  const blob = (s, x, y, z) => blobList.push([s, x, y, z]);

  // ของที่อยู่กับที่ทั้งฉากรวมใน Wm (1 mesh ต่อวัสดุ) ส่วนที่ขยับได้ใช้ VMerger (สีที่จุดยอด 1 mesh ต่อชิ้น)
  class Sub {                                       // ใส่ชิ้นลง Merger อื่นโดยคูณเมทริกซ์ของกลุ่ม (ของที่อยู่กับที่ในกลุ่มที่หมุน/ย่อขยาย)
    constructor(target, base) { this.t = target; this.m = base; }
    add(geo, mat, m4, uvs) { this.t.add(geo, mat, new THREE.Matrix4().multiplyMatrices(this.m, m4 || new THREE.Matrix4()), uvs); return this; }
    bx(mat, w, h, d, x, y, z, o = {}) { return this.add(boxGeo(w, h, d, o.tile, o.swap), mat, mtx(x, y, z, o.rx, o.ry, o.rz)); }
    cy(mat, rt, rb, h, seg, x, y, z, o = {}) { return this.add(new THREE.CylinderGeometry(rt, rb, h, seg), mat, mtx(x, y, z, o.rx, o.ry, o.rz)); }
  }
  const vcMat = keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.58, metalness: 0.12 }));
  const vcOf = mat => (mat.userData.vc ? mat.userData.vc : mat.map ? new THREE.Color(0.42, 0.41, 0.39) : mat.color);
  class VMerger extends Merger {                    // รวมทุกวัสดุเป็นเรขาคณิตเดียว แยกสีด้วยสีที่จุดยอด
    constructor() { super(); this.c = []; }
    add(geo, mat, m4, uvs) { const before = this.count(); super.add(geo, '_', m4, uvs); const c = vcOf(mat), n = this.count() - before; for (let i = 0; i < n; i++) this.c.push(c.r, c.g, c.b); return this; }
    count() { const e = this.b.get('_'); return e ? e.p.length / 3 : 0; }
    geometry() { const e = this.b.get('_'), g = keep(new THREE.BufferGeometry()); g.setAttribute('position', new THREE.Float32BufferAttribute(e.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(e.n, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(e.u, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3)); return g; }
    build(parent, o = {}) { const m = new THREE.Mesh(this.geometry(), o.mat || vcMat); m.castShadow = o.cast !== false; m.receiveShadow = true; parent.add(m); return [m]; }
  }
  const Wm = new Merger(new VMerger()), pendingBlobs = [];
  const groupMatrix = (x, y, z, ry, sc) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(UP, ry || 0), new THREE.Vector3(sc || 1, sc || 1, sc || 1));
  M.signalPole = paint(0x9aa0a3); M.relayBox = paint(0x6e7a80); M.pointMotor = paint(0x5d6a72);
  M.lensRed = flat(0xb5262b, 0.25); M.lensGreen = flat(0x1f9a6a, 0.25);

  /* ================= ประแจ: ลิ้นประแจขยับตามสถานะ + คันกลับประแจ (ยุคกล) หรือเครื่องกลับประแจไฟฟ้า ================= */
  const points = {};
  for (const k in W.points) {
    const p = W.points[k], g = new THREE.Group(); g.position.set(p.x, 0, p.z); scene.add(g);
    // ลิ้นประแจ 2 เส้น ยาว 4.5 ม. ปลายลิ้นอยู่ที่จุดแยก โคนลิ้นยึดไว้ สร้างไว้สองท่า (ตรง/แยก) แล้วสลับการมองเห็น
    const pose = pos => {
      const ang = (pos === 'R' ? -1 : 1) * 0.018 * p.side * p.away, v = new VMerger();   // ท่าแยกไปฝั่ง +side: ลิ้นฝั่ง -side ชิดรางพิง ปลายลิ้นจึงเลื่อนไปทาง -side
      [-1, 1].forEach(s => { const base = new THREE.Matrix4().compose(new THREE.Vector3(p.away * 4.6, 0, s * (GAUGE / 2 + 0.038)), new THREE.Quaternion().setFromAxisAngle(UP, ang), _one), sub = new Sub(v, base);
        sub.bx(M.railHead, 4.5, 0.05, 0.06, -p.away * 2.25, RB + 0.13, 0); sub.bx(M.railSide, 4.5, 0.11, 0.05, -p.away * 2.25, RB + 0.055, 0); });
      const m = v.build(g, { cast: false })[0]; m.visible = false; return m;
    };
    const blades = { N: pose('N'), R: pose('R') };
    const lx = p.away * -2.2, lz = -p.side * 1.75, lever = new THREE.Group(); lever.position.set(lx, SLT, lz); g.add(lever);
    const base = new Sub(Wm, groupMatrix(p.x + lx, SLT, p.z + lz, 0));
    base.bx(M.woodTrim, 0.62, 0.1, 2.6, 0, 0, p.side * 0.6, { tile: 3 }); base.bx(M.dark, 0.3, 0.22, 0.3, 0, 0.15, 0); base.bx(M.steel, 0.04, 0.04, 1.4, 0, 0.07, p.side * 0.85);
    const arm = new THREE.Group(); arm.position.set(0, 0.2, 0); lever.add(arm);
    const a = new VMerger();
    const kind = !era.interlock ? 'lever' : !era.tc ? 'rod' : 'motor';
    if (kind === 'lever') { a.bx(M.dark, 0.05, 0.9, 0.05, 0, 0.45, 0); a.cy(M.white, 0.14, 0.14, 0.1, 12, 0, 0.88, 0, { rx: Math.PI / 2 }); }
    else if (kind === 'rod') { a.bx(M.dark, 0.08, 0.28, 0.08, 0, 0.12, 0); base.bx(M.steel, Math.abs(p.x - (B.x0 + B.x1) / 2) - 3, 0.04, 0.04, -p.away * -((Math.abs(p.x - (B.x0 + B.x1) / 2) - 3) / 2), 0.05, -p.side * 0.15); }   // ก้านโยงไปทางห้องสัญญาณกลางสถานี
    else a.bx(M.pointMotor, 0.55, 0.42, 0.8, 0, 0.1, 0);
    a.build(arm, { cast: false });   // ชิ้นเล็กเตี้ย เงาแทบไม่เห็น ไม่ทอดเงาเพื่อประหยัด draw call ในรอบวาดเงา (สถานีที่มีประแจมาก)
    points[k] = { blades, arm, p, kind, pos: null, anchor: new THREE.Vector3(p.x + lx, 1.6, p.z + lz) };
  }
  function setPoint(k, pos) {
    const o = points[k]; if (!o || o.pos === pos) return; o.pos = pos;
    // ท่าตรง: ลิ้นชิดรางตามแนวตรง ท่าแยก: ลิ้นเบนไปทางขาแยก (มุมเล็กมากในของจริง ขยายให้เห็น)
    o.blades.N.visible = pos !== 'R'; o.blades.R.visible = pos === 'R';
    if (o.kind === 'motor') o.arm.position.y = pos === 'R' ? 0.24 : 0.2; else o.arm.rotation.x = (pos === 'R' ? 0.55 : -0.55) * o.p.side * (o.kind === 'rod' ? 0.5 : 1);
    shadowDirty = true;
  }

  /* ================= สิ่งปลูกสร้าง: ชานชาลา อาคาร ของประกอบ ================= */
  const sz = d => PS * d;                          // ระยะจากแนวราง ไปทางอาคาร (บวก = ห่างรางไปทางอาคาร)
  const PLX0 = realPlat ? realPlat.x0 : -22, PLX1 = realPlat ? realPlat.x1 : 22, PLL = PLX1 - PLX0, PLC = (PLX0 + PLX1) / 2;
  const plates = {};                               // ป้ายเลขชานชาลา (canvas) ต่อเลข
  const BRAND = ['--t1', '--t2', '--t3'], BRAND_DEF = ['#EF7FA9', '#4FA9DE', '#EE9A2E'], EXP_DEF = '#8C7BDB';
  const brand = n => (n ? (colors[BRAND[(n - 1) % 3]] || BRAND_DEF[(n - 1) % 3]) : (colors['--exp'] || EXP_DEF));
  function plateTex(n) {
    if (plates[n]) return plates[n];
    const t = canvasTex(128, 128, () => {}); t.userData = { n }; plates[n] = t; paintPlate(t); return t;
  }
  function paintPlate(t) {
    const g = t.image.getContext('2d'), n = t.userData.n; g.clearRect(0, 0, 128, 128);
    g.fillStyle = '#f4f1e8'; g.fillRect(0, 0, 128, 128); g.fillStyle = brand(n); g.fillRect(9, 9, 110, 110);
    g.fillStyle = '#1e2a35'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `500 ${n ? 92 : 64}px Mitr, Anuphan, sans-serif`; g.fillText(n ? String(n) : 'ด่วน', 64, 70); t.needsUpdate = true;
  }
  const plateMats = {};
  const plateMat = n => plateMats[n] || (plateMats[n] = keep(new THREE.MeshStandardMaterial({ map: plateTex(n), roughness: 0.6 })));
  const signTex = canvasTex(512, 176, () => {});
  function paintSign() {
    const g = signTex.image.getContext('2d'); g.fillStyle = '#efece2'; g.fillRect(0, 0, 512, 176); g.strokeStyle = '#1e2a35'; g.lineWidth = 8; g.strokeRect(8, 8, 496, 160);
    g.fillStyle = '#1e2a35'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '500 82px Mitr, Anuphan, sans-serif'; g.fillText(stationName.th || '', 256, 76, 480); g.font = '400 30px Mitr, Anuphan, sans-serif'; g.fillText((stationName.en || '').toUpperCase(), 256, 138, 480); signTex.needsUpdate = true;
  }
  paintSign();
  const signMat = keep(new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.7 }));
  if (realPlat) {
    const pz = realPlat.z + sz(4.025);
    // ชานชาลา: ตัวพื้น แผ่นขอบยื่น แถบเตือน ทางลาดหัวท้าย
    Wm.bx(M.conc, PLL, PLAT - 0.06, 3.95, PLC, (PLAT - 0.06) / 2, pz, { tile: 2 });
    Wm.bx(M.conc, PLL + 0.1, 0.07, 4.08, PLC, PLAT - 0.035, pz + sz(0.035), { tile: 2 });
    Wm.bx(M.yellow, PLL, 0.012, 0.16, PLC, PLAT + 0.004, realPlat.z + sz(2.55));
    [-1, 1].forEach(s => {
      const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(3.2, 0); sh.lineTo(0, PLAT); sh.lineTo(0, 0);
      const g = new THREE.ExtrudeGeometry(sh, { depth: 3.95, bevelEnabled: false }); g.translate(0, 0, -1.975);
      Wm.add(g, M.conc, mtx(s > 0 ? PLX1 : PLX0, 0, pz, 0, s > 0 ? 0 : Math.PI, 0), 0.5);
    });
    // อาคารสถานีไม้ชั้นเดียว (แบบกลาง ๆ ไม่ลอกอาคารจริงหลังใด) หันหน้าเข้าหาราง
    const bld = new THREE.Group(); bld.position.set(PLC, 0, BZ); bld.rotation.y = PS < 0 ? 0 : Math.PI; bld.updateMatrix();
    const B_ = (mat, w, h, d, x, y, z, o = {}) => Wm.add(boxGeo(w, h, d, o.tile, o.swap), mat, new THREE.Matrix4().multiplyMatrices(bld.matrix, mtx(x, y, z, o.rx, o.ry, o.rz)));
    const BA = (geo, mat, m4, s) => Wm.add(geo, mat, new THREE.Matrix4().multiplyMatrices(bld.matrix, m4), s);
    const WT = 3.95;
    B_(M.conc, 16.6, PLAT, 6.4, 0, PLAT / 2, 0, { tile: 2 });
    B_(M.woodWall, 15, WT - PLAT, 5, 0, (WT + PLAT) / 2, 0, { tile: 1.8 });
    B_(M.woodDado, 15.08, 1.0, 5.08, 0, PLAT + 0.5, 0, { tile: 1.8 });
    B_(M.woodTrim, 15.14, 0.09, 5.14, 0, PLAT + 1.03, 0, { tile: 1.8 });
    [-1, 1].forEach(ax => [-1, 1].forEach(az => B_(M.woodTrim, 0.2, WT - PLAT, 0.2, ax * 7.5, (WT + PLAT) / 2, az * 2.5, { tile: 1.8, swap: true })));
    const win = (x, y, z, w, h, ry) => {
      const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry || 0; g.updateMatrix();
      const put = (mat, bw, bh, bd, bx, by, bz) => BA(boxGeo(bw, bh, bd, 1.8, true), mat, new THREE.Matrix4().multiplyMatrices(g.matrix, mtx(bx, by, bz)));
      put(M.woodTrim, w + 0.2, h + 0.2, 0.1, 0, 0, 0); put(M.glass, w, h, 0.12, 0, 0, 0);
      put(M.woodTrim, 0.05, h, 0.14, 0, 0, 0); put(M.woodTrim, w, 0.05, 0.14, 0, 0.08, 0); put(M.woodTrim, w + 0.3, 0.06, 0.2, 0, -h / 2 - 0.12, 0.03);
    };
    for (let i = -3; i <= 3; i++) if (i !== 0) { win(i * 2.05, 2.55, 2.5, 1.0, 1.25); if (Math.abs(i) !== 2) win(i * 2.05, 2.55, -2.5, 1.0, 1.25, Math.PI); }
    win(-7.5, 2.55, 0, 1.0, 1.25, -Math.PI / 2); win(7.5, 2.55, 0, 1.0, 1.25, Math.PI / 2);
    B_(M.woodTrim, 1.5, 2.45, 0.1, 0, PLAT + 1.2, 2.5, { tile: 1.8, swap: true });
    B_(M.woodDado, 0.6, 2.2, 0.13, -0.32, PLAT + 1.12, 2.5, { tile: 1.8, swap: true }); B_(M.woodDado, 0.6, 2.2, 0.13, 0.32, PLAT + 1.12, 2.5, { tile: 1.8, swap: true });
    const RISE = 1.9, HALF = 3.25, SL = Math.hypot(RISE, HALF), RA = Math.atan(RISE / HALF), RIDGE = WT + RISE * (2.5 / HALF) + 0.42;
    [-1, 1].forEach(s => {
      B_(M.iron, 17, 0.05, SL, 0, RIDGE - RISE / 2, s * HALF / 2, { tile: 1.12, rx: s * RA });
      [-1, 1].forEach(e => B_(M.woodTrim, 0.07, 0.2, SL + 0.05, e * 8.5, RIDGE - RISE / 2 - 0.1, s * HALF / 2, { tile: 1.8, rx: s * RA }));
    });
    B_(M.iron, 17.1, 0.07, 0.34, 0, RIDGE + 0.03, 0, { tile: 1.12 });
    [-1, 1].forEach(e => { const sh = new THREE.Shape(); sh.moveTo(-2.5, WT); sh.lineTo(2.5, WT); sh.lineTo(0, WT + RISE * (2.5 / HALF) + 0.38); sh.lineTo(-2.5, WT);
      const g = new THREE.ExtrudeGeometry(sh, { depth: 0.12, bevelEnabled: false }); g.rotateY(Math.PI / 2); BA(g, M.woodWall, mtx(e * 7.5 - 0.06, 0, 0), 1 / 1.8); });
    // ชายคาคลุมชานชาลา เสา คาน ค้ำยัน
    const CA = 0.15, CZ0 = 2.5, CZ1 = 6.4, CL = (CZ1 - CZ0) / Math.cos(CA), CY0 = 3.62, cy = z => CY0 - (z - CZ0) * Math.tan(CA), PZc = 5.9;
    B_(M.iron, 22.6, 0.05, CL, 0, cy((CZ0 + CZ1) / 2), (CZ0 + CZ1) / 2, { tile: 1.12, rx: CA });
    B_(M.woodTrim, 22.6, 0.18, 0.05, 0, cy(CZ1) - 0.08, CZ1, { tile: 1.8 });
    B_(M.woodTrim, 22.2, 0.16, 0.12, 0, cy(PZc) - 0.14, PZc, { tile: 1.8 });
    for (let i = -4; i <= 4; i++) {
      const x = i * 2.72;
      B_(M.woodTrim, 0.15, cy(PZc) - 0.2 - PLAT, 0.15, x, (cy(PZc) - 0.2 + PLAT) / 2, PZc, { tile: 1.8, swap: true });
      B_(M.conc, 0.3, 0.14, 0.3, x, PLAT + 0.07, PZc);
      B_(M.woodTrim, 0.08, 0.13, CL - 0.1, x, cy((CZ0 + CZ1) / 2) - 0.1, (CZ0 + CZ1) / 2, { tile: 1.8, rx: CA });
      [-1, 1].forEach(s => B_(M.woodTrim, 0.07, 0.07, 0.75, x + s * 0.27, cy(PZc) - 0.42, PZc, { ry: Math.PI / 2, rx: s * 0.8 }));
    }
    [-5.1, 5.1, 9.6].forEach(x => {                // ม้านั่ง
      B_(M.woodDado, 1.7, 0.06, 0.42, x, PLAT + 0.45, 3.0, { tile: 1.8 }); B_(M.woodDado, 1.7, 0.34, 0.05, x, PLAT + 0.78, 2.8, { tile: 1.8, rx: -0.12 });
      [-0.75, 0.75].forEach(o => { B_(M.dark, 0.06, 0.45, 0.4, x + o, PLAT + 0.225, 3.0); B_(M.dark, 0.06, 0.5, 0.05, x + o, PLAT + 0.7, 2.79); });
    });
    // ป้ายเลขชานชาลาใต้ชายคา
    // กรอบขาวรวมกับชิ้นสีเรียบ หน้าป้ายสองด้านรวมตามวัสดุ (เดิมเป็นกล่อง 6 วัสดุ = 6 draw call และอีก 6 ในรอบวาดเงา)
    { const x = PLC - 9.5, y = cy(PZc) - 0.5, z = BZ + sz(-PZc), ry = PS < 0 ? 0 : Math.PI;
      Wm.bx(M.white, 0.46, 0.46, 0.04, x, y, z, { ry });
      [0.021, -0.021].forEach((o, i) => Wm.add(new THREE.PlaneGeometry(0.46, 0.46), plateMat(realPlat.no), mtx(x, y, z + (PS < 0 ? o : -o), 0, ry + (i ? Math.PI : 0), 0))); }
    // อาคารเล็กผนังปูน (ห้องเก็บของ)
    const sxh = PLC - Math.min(25, PLL / 2 - 2), shz = BZ + sz(2.2);
    Wm.bx(M.conc, 4.6, 0.2, 3.6, sxh, 0.1, shz, { tile: 2 }); Wm.bx(M.plaster, 4.2, 2.7, 3.2, sxh, 1.55, shz, { tile: 2 }); Wm.bx(M.iron, 5.0, 0.05, 4.1, sxh, 3.05, shz, { tile: 1.12, rx: -PS * 0.14 });
    Wm.bx(M.woodTrim, 0.85, 1.95, 0.08, sxh - 0.6, 1.18, shz - sz(1.6), { tile: 1.8, swap: true }); Wm.bx(M.woodTrim, 0.7, 0.5, 0.08, sxh + 0.8, 2.2, shz - sz(1.6), { tile: 1.8 }); Wm.bx(M.glass, 0.56, 0.36, 0.1, sxh + 0.8, 2.2, shz - sz(1.6));
    // ป้ายชื่อสถานี (ชื่อสถานีเป็นข้อเท็จจริง ไม่ใช่ตราของหน่วยงานใด)
    const nb = (x, z) => {
      Wm.bx(M.white, 4.3, 1.52, 0.07, x, PLAT + 1.95, z);
      [0.045, -0.045].forEach((o, i) => Wm.add(new THREE.PlaneGeometry(4.2, 1.44), signMat, mtx(x, PLAT + 1.95, z + o, 0, i ? Math.PI : 0, 0)));
      [-1.9, 1.9].forEach(o => { Wm.bx(M.white, 0.13, 2.75, 0.13, x + o, PLAT + 1.37, z); Wm.bx(M.black, 0.14, 0.4, 0.14, x + o, PLAT + 0.2, z); });
    };
    nb(PLX0 + 5.4, realPlat.z + sz(3.0)); nb(PLX1 - 4.8, realPlat.z + sz(3.0));
    // รั้วท้ายชานชาลา และรั้วหลังลาน
    const fence = (x0, x1, z, y0) => { const n = Math.round(Math.abs(x1 - x0) / 2); for (let i = 0; i <= n; i++) Wm.bx(M.woodPale, 0.1, 1.1, 0.1, x0 + (x1 - x0) * i / n, y0 + 0.55, z, { tile: 1.8, swap: true });
      [0.45, 0.9].forEach(h => Wm.bx(M.woodPale, Math.abs(x1 - x0), 0.09, 0.04, (x0 + x1) / 2, y0 + h, z + sz(0.06), { tile: 1.8 })); };
    const fz = realPlat.z + sz(5.92);
    fence(PLC - 21.8, PLC - 11.6, fz, PLAT); fence(PLC + 11.6, PLC + 21.8, fz, PLAT);
    fence(PLC - 30, PLC + 6, BZ + sz(8.6), 0); fence(PLC + 16, PLC + 30, BZ + sz(8.6), 0);
    // เสาไฟชานชาลา
    [-20.5, -13, 13, 20.5].forEach(o => { const x = PLC + o, z = realPlat.z + sz(3.6); Wm.cy(M.poleGreen, 0.045, 0.07, 4.2, 8, x, PLAT + 2.1, z); Wm.bx(M.conc, 0.3, 0.2, 0.3, x, PLAT + 0.1, z);
      Wm.bx(M.poleGreen, 0.04, 0.04, 0.9, x, PLAT + 4.15, z - sz(0.4)); Wm.bx(M.poleGreen, 0.26, 0.09, 0.42, x, PLAT + 4.12, z - sz(0.85)); Wm.bx(M.lampOff, 0.2, 0.03, 0.34, x, PLAT + 4.065, z - sz(0.85)); });
  }
  // ชานชาลาอื่นนอกจากชานชาลาหลัก (เช่น ทาง 2 ที่น้ำตก ทาง 3 ที่หนองปลาดุก): พื้น ขอบยื่น แถบเตือน ทางลาด ป้ายเลข ไม่มีอาคาร
  const plateGeo = keep(new THREE.PlaneGeometry(0.46, 0.46));
  for (const p of W.platforms) {
    if (p === realPlat || p.none) continue;
    const s = d => p.side * d, len = p.x1 - p.x0, c = (p.x0 + p.x1) / 2, pz = p.z + s(4.025);
    Wm.bx(M.conc, len, PLAT - 0.06, 3.95, c, (PLAT - 0.06) / 2, pz, { tile: 2 });
    Wm.bx(M.conc, len + 0.1, 0.07, 4.08, c, PLAT - 0.035, pz + s(0.035), { tile: 2 });
    Wm.bx(M.yellow, len, 0.012, 0.16, c, PLAT + 0.004, p.z + s(2.55));
    [-1, 1].forEach(e => {
      const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(3.2, 0); sh.lineTo(0, PLAT); sh.lineTo(0, 0);
      const g = new THREE.ExtrudeGeometry(sh, { depth: 3.95, bevelEnabled: false }); g.translate(0, 0, -1.975);
      Wm.add(g, M.conc, mtx(e > 0 ? p.x1 : p.x0, 0, pz, 0, e > 0 ? 0 : Math.PI, 0), 0.5);
    });
    { const x = p.x0 + 5.4, z = p.z + s(3.0);   // ป้ายชื่อสถานีหัวชานชาลา
      Wm.bx(M.white, 4.3, 1.52, 0.07, x, PLAT + 1.95, z);
      [0.045, -0.045].forEach((o, i) => Wm.add(new THREE.PlaneGeometry(4.2, 1.44), signMat, mtx(x, PLAT + 1.95, z + o, 0, i ? Math.PI : 0, 0)));
      [-1.9, 1.9].forEach(o => { Wm.bx(M.white, 0.13, 2.75, 0.13, x + o, PLAT + 1.37, z); Wm.bx(M.black, 0.14, 0.4, 0.14, x + o, PLAT + 0.2, z); }); }
    [-0.3, 0.3].forEach(f => { const x = c + f * len; Wm.bx(M.poleGreen, 0.08, 2.3, 0.08, x, PLAT + 1.15, pz + s(1.2)); Wm.bx(M.white, 0.5, 0.5, 0.05, x, PLAT + 2.3, pz + s(1.2));
      // ป้ายเลขแผ่นเดียวหันหาฝั่งกล้อง รวมเข้า mesh ตามวัสดุ (ไม่เพิ่ม draw call ต่อป้าย งบการวาดของสถานีใหญ่ตึง)
      Wm.add(plateGeo.clone(), plateMat(p.no), mtx(x, PLAT + 2.3, pz + s(1.2) + camSide * 0.03, 0, camSide > 0 ? 0 : Math.PI, 0)); });
  }
  // หลักกันชนปลายทางตัน: ฐานปูน คานขวางสีแดงคาดขาว ค้ำเหล็กสองข้าง
  for (const b of W.buffers) {
    const x = b.x - b.dir * 0.6;
    Wm.bx(M.conc, 1.4, 0.7, 2.8, x + b.dir * 0.9, 0.35, b.z, { tile: 2 });
    [-0.75, 0.75].forEach(o => { Wm.bx(M.steel, 1.9, 0.14, 0.14, x + b.dir * 0.45, RT + 0.45, b.z + o, { rz: b.dir * 0.42 }); Wm.bx(M.steel, 0.16, 0.9, 0.16, x, RT + 0.45, b.z + o); });
    Wm.bx(M.lensRed, 0.3, 0.34, 2.3, x - b.dir * 0.1, RT + 0.72, b.z);
    [-0.6, 0, 0.6].forEach(o => Wm.bx(M.white, 0.31, 0.35, 0.22, x - b.dir * 0.1, RT + 0.72, b.z + o));
  }
  // หลักเขตปลอดภัยใกล้ประแจ (หลักเตี้ยสีขาวปลายดำ) ระหว่างรางสองเส้นที่แยกจากกัน
  for (const k in W.points) {
    const p = W.points[k], R = W.tracks[p.R]; if (!R) continue;
    for (let s = 6; s < 40; s += 0.5) { const x = p.x + p.away * s, gap = Math.abs(R.zAt(x) - p.z); if (gap > 2 * 1.36 + 0.8) { const z = p.z + p.side * gap / 2; Wm.bx(M.white, 0.14, 0.5, 0.14, x, BAL + 0.22, z); Wm.bx(M.black, 0.145, 0.1, 0.145, x, BAL + 0.42, z); break; } }
  }
  // กองไม้หมอนสำรองข้างทาง
  [[B.x0 + 15, farZ + camSide * 4.2, 0.1], [B.x1 - 20, farZ + camSide * 5, -0.15], [B.x0 + 9, BZ + sz(6.3), 1.2]].forEach(([x, z, ry]) => {
    for (let l = 0; l < 3; l++) for (let k = 0; k < 4 - l; k++) { const m4 = new THREE.Matrix4().multiplyMatrices(mtx(x, 0, z, 0, ry), mtx((l % 2 ? 0.12 : 0) + (rnd() - 0.5) * 0.1, 0.09 + l * 0.16, (k - (3 - l) / 2) * 0.27)); Wm.add(boxGeo(1.95, 0.15, 0.23, 3), M.woodTrim, m4); }
    pendingBlobs.push([3.4, x, groundH(x, z) + 0.04, z]);
  });
  // เสาโทรเลขเลียบทาง ฝั่งกล้อง
  for (let x = -520; x <= 520; x += 47) { const z = walkZ + camSide * (1.0 + (Math.abs(x) < 48 ? 3.5 : 0)); Wm.cy(M.woodPole, 0.09, 0.13, 7.4, 7, x, 3.7, z); Wm.bx(M.woodPole, 0.09, 0.09, 1.7, x, 6.9, z); Wm.bx(M.woodPole, 0.09, 0.09, 1.3, x, 6.4, z);
    [-0.75, -0.3, 0.3, 0.75].forEach(o => Wm.cy(M.white, 0.035, 0.045, 0.12, 6, x, 7.0, z + o)); }
  pendingBlobs.forEach(a => blob(a[0], a[1], a[2], a[3]));
  if (realPlat) { pad(19.5, 9.5, PLC, 0.03, BZ - sz(0.4)); pad(PLL + 2, 1.6, PLC, BAL + 0.02, realPlat.z + sz(1.75)); pad(24, 5, PLC, PLAT + 0.02, BZ + sz(-4.3)); }

  /* ================= สัญญาณ: หางปลา (ยุคกล) หรือไฟสี ================= */
  const signals = {};
  const lampGeo = keep(new THREE.SphereGeometry(0.1, 12, 8)), lampSpots = [];   // ไฟสัญญาณทุกดวงรวมเป็น instanced เดียว (ไม่รับแสง สีตามท่า)
  const lampAt = (k, role, x, y, z, sc) => { lampSpots.push({ k, role, m: new THREE.Matrix4().multiplyMatrices(groupMatrix(W.signals[k].x, 0, W.signals[k].z, W.signals[k].rotY, SIG_SCALE), mtx(x, y, z, 0, 0, 0, sc, sc, sc)) }); return lampSpots.length - 1; };
  for (const k in W.signals) {
    const s = W.signals[k], g = new THREE.Group(); g.position.set(s.x, 0, s.z); g.rotation.y = s.rotY; g.scale.setScalar(SIG_SCALE); scene.add(g);
    const m = new Sub(Wm, groupMatrix(s.x, 0, s.z, s.rotY, SIG_SCALE));
    if (era.sema) {
      m.bx(M.conc, 0.7, 0.3, 0.7, 0, 0.15, 0); m.cy(M.white, 0.085, 0.12, 6.6, 10, 0, 3.6, 0); m.cy(M.black, 0.122, 0.13, 1.0, 10, 0, 0.8, 0);
      m.cy(M.dark, 0.0, 0.11, 0.32, 8, 0, 7.06, 0);
      [-0.19, 0.19].forEach(o => m.bx(M.dark, 0.035, 5.6, 0.035, o, 3.0, -0.3));
      for (let y = 0.5; y < 5.8; y += 0.33) m.bx(M.dark, 0.38, 0.025, 0.025, 0, y, -0.3);
      m.bx(M.dark, 0.6, 0.04, 0.5, 0, 5.75, -0.2); m.bx(M.dark, 0.22, 0.3, 0.22, -0.3, 5.95, 0.02); m.bx(M.dark, 0.5, 0.06, 0.06, -0.16, 5.83, 0.02);
      m.bx(M.dark, 0.5, 0.05, 0.05, 0.15, 0.55, 0.14, { rz: 0.35 }); m.cy(M.dark, 0.13, 0.13, 0.1, 10, 0.4, 0.64, 0.14, { rx: Math.PI / 2 });
      m.bx(M.steel, 0.02, 5.2, 0.02, 0.12, 3.2, 0.14);
      const pivot = new THREE.Group(); pivot.position.set(0, 6.0, 0.16); g.add(pivot);
      const a = new VMerger();
      a.bx(M.armRed, 2.0, 0.34, 0.05, 0.85, 0, 0); a.bx(M.white, 0.22, 0.345, 0.056, 1.35, 0, 0);
      a.bx(M.dark, 0.3, 0.5, 0.04, -0.27, 0.07, -0.05); a.cy(M.dark, 0.07, 0.07, 0.2, 8, 0, 0, -0.05, { rx: Math.PI / 2 });
      { const c = Math.cos(ARM_CLEAR), sn = Math.sin(ARM_CLEAR), lx = -0.3, ly = -0.03, gx = lx * c + ly * sn, gy = -lx * sn + ly * c;   // จุดที่หมุน ARM_CLEAR แล้วมาอยู่ที่ตำแหน่งโคม
        a.cy(M.lensRed, 0.1, 0.1, 0.05, 12, lx, ly, -0.02, { rx: Math.PI / 2 }); a.cy(M.lensGreen, 0.1, 0.1, 0.05, 12, gx, gy, -0.02, { rx: Math.PI / 2 }); }
      a.build(pivot);
      const lamp = lampAt(k, 'sema', -0.3, 5.97, 0.09, 1.3);   // โคมอยู่หลังเลนส์ (ด้านเสา) ขอบแสงเห็นรอบเลนส์
      signals[k] = { kind: 'sema', pivot, lamp, angle: 0, want: 0, aspect: 'R', anchor: new THREE.Vector3(s.x, 9.4 * SIG_SCALE, s.z) };   // ป้ายแตะอยู่เหนือปลายแขนตอนยก ไม่บังท่าแขน
    } else {
      m.bx(M.conc, 0.6, 0.3, 0.6, 0, 0.15, 0); m.cy(M.signalPole, 0.07, 0.09, 4.4, 10, 0, 2.5, 0);
      m.bx(M.black, 0.5, 1.0, 0.18, 0, 4.65, 0.05); m.bx(M.dark, 0.62, 1.15, 0.03, 0, 4.65, -0.06);
      [4.92, 4.42].forEach(y => m.cy(M.dark, 0.17, 0.17, 0.22, 12, 0, y + 0.12, 0.22, { rx: Math.PI / 2 }));
      m.bx(M.relayBox, 0.5, 0.8, 0.4, 0, 0.7, -0.6);
      const red = lampAt(k, 'red', 0, 4.92, 0.16, 1.4), green = lampAt(k, 'green', 0, 4.42, 0.16, 1.4);
      signals[k] = { kind: 'light', red, green, aspect: null, anchor: new THREE.Vector3(s.x, 6.2 * SIG_SCALE, s.z) };
    }
    blob(1.6, s.x, 0.04, s.z);
  }
  Wm.build(scene);
  if (padList.length) {                             // แผ่นเงาอยู่กับที่รวมเป็น mesh เดียว
    const pm = new Merger(); padList.forEach(([w, d, x, y, z, ry]) => pm.add(planeY.clone(), padMat, mtx(x, y, z, 0, ry, 0, w, 1, d)));
    pm.build(scene, { cast: false }).forEach(m => { m.receiveShadow = false; m.renderOrder = 2; });
  }
  const LAMP_R = new THREE.Color(0xff3b30).multiplyScalar(2.2), LAMP_G = new THREE.Color(0x2fd27a).multiplyScalar(2.2), LAMP_OFF = new THREE.Color(0x1a1c1e);
  const lamps = new THREE.InstancedMesh(lampGeo, keep(new THREE.MeshBasicMaterial({ toneMapped: false })), Math.max(1, lampSpots.length));
  lampSpots.forEach((l, i) => { lamps.setMatrixAt(i, l.m); lamps.setColorAt(i, LAMP_R); });
  lamps.frustumCulled = false; scene.add(lamps);
  const lampColor = (i, c) => { lamps.setColorAt(i, c); lamps.instanceColor.needsUpdate = true; };
  function setSignal(k, aspect) {
    const o = signals[k]; if (!o || o.aspect === aspect) return; o.aspect = aspect;
    if (o.kind === 'sema') { o.want = aspect === 'G' ? ARM_CLEAR : 0; lampColor(o.lamp, aspect === 'G' ? LAMP_G : LAMP_R); }
    else { lampColor(o.red, aspect === 'G' ? LAMP_OFF : LAMP_R); lampColor(o.green, aspect === 'G' ? LAMP_G : LAMP_OFF); }
  }

  /* ================= เส้นทางที่ตั้ง/รางมีรถ (แถบระหว่างราง แบบเดียวกับแผงผังเส้น) ================= */
  const strips = {};
  for (const t of trackList) {
    const fr = frames(t.pts.length > 1 ? dense(t.pts) : t.pts), pos = [], idx = [];
    fr.forEach(f => { [-0.32, 0.32].forEach(o => pos.push(f.x + f.nx * o, SLT + 0.012, f.z + f.nz * o)); });
    for (let i = 0; i < fr.length - 1; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    const g = keep(new THREE.BufferGeometry()); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
    const mat = keep(new THREE.MeshBasicMaterial({ color: 0x2fa872, transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false, fog: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
    const mesh = new THREE.Mesh(g, mat); mesh.visible = false; mesh.renderOrder = 3; scene.add(mesh);
    strips[t.id] = { mesh, mat, state: '' };
  }
  let stripCol = { route: new THREE.Color(colors['--route'] || '#2FA872'), occ: new THREE.Color(colors['--occ'] || '#E9525A') };
  function setStrip(id, st) {
    const o = strips[id]; if (!o) return;
    const key = !st ? '' : st.occupied && era.tc ? 'occ' : st.locked && era.interlock ? 'route' : st.overlap && era.interlock ? 'ovl' : '';
    if (key === o.state) return; o.state = key;
    o.mesh.visible = !!key;
    if (key === 'occ') { o.mat.color.copy(stripCol.occ); o.mat.opacity = 0.85; } else if (key === 'route') { o.mat.color.copy(stripCol.route); o.mat.opacity = 0.85; } else if (key === 'ovl') { o.mat.color.copy(stripCol.route); o.mat.opacity = 0.4; }
  }

  /* ================= ขบวนรถ (WP11): ตัวรถ 4 ชนิดสร้างด้วยโค้ด แบบกลาง ๆ ไม่อิงรุ่นจริง ไม่มีตัวอักษรหรือตรา =================
     ชนิดขบวนและลำดับตัวรถมาจาก sim/consists.js ตัวรถแต่ละคันวางตามทางวิ่งแยกกัน จึงโค้งตามรางและประแจได้
     ตัวรถชนิดเดียวกันสีเดียวกันรวมเป็น InstancedMesh เดียว (draw call ไม่เพิ่มตามจำนวนคัน) */
  const WR = 0.42, AX = RT + WR;
  const wheelGeo = keep(new THREE.CylinderGeometry(WR, WR, 0.12, 12)), flangeGeo = keep(new THREE.CylinderGeometry(WR + 0.035, WR + 0.035, 0.03, 12, 1, true));
  function bogie(m, x, wb, axles = 2) {
    const xs = axles === 3 ? [-wb, 0, wb] : [-wb, wb];
    xs.forEach(dx => { [-1, 1].forEach(s => { m.add(wheelGeo.clone(), M.wheel, mtx(x + dx, AX, s * (GAUGE / 2 + 0.04), Math.PI / 2)); m.add(flangeGeo.clone(), M.wheel, mtx(x + dx, AX, s * (GAUGE / 2 - 0.035), Math.PI / 2));
        m.bx(M.dark, 0.34, 0.3, 0.14, x + dx, AX, s * 0.74); m.bx(M.dark, 0.2, 0.32, 0.1, x + dx, AX + 0.3, s * 0.74); });
      m.cy(M.dark, 0.06, 0.06, 1.4, 6, x + dx, AX, 0, { rx: Math.PI / 2 }); });
    [-1, 1].forEach(s => m.bx(M.dark, wb * 2 + 0.9, 0.2, 0.12, x, AX + 0.2, s * 0.74)); m.bx(M.dark, 0.55, 0.3, 1.5, x, AX + 0.2, 0);
  }
  // สีตัวถังธรรมชาติ (DECISIONS: ใช้สีแบรนด์เป็นแถบคาดเท่านั้น) แถบสีขบวนเป็นสีที่จุดยอดชุดเฉพาะ (BANDC) แทนที่ด้วยสีขบวนทีหลัง
  const BODY = new THREE.Color(0xcfc4a6), COACH = new THREE.Color(0xd8d0bb), LOCO = new THREE.Color(0x58625f), LOCO_HI = new THREE.Color(0xc9b98f), VAN = new THREE.Color(0x7d5642), BANDC = new THREE.Color(1, 0, 1);
  const bodyMat = keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.12, normalMap: lowTex() ? null : T.metal_n, normalScale: new THREE.Vector2(0.3, 0.3) }));
  const tag = c => ({ color: c, userData: { vc: c } });
  const geoOf = (e, uv) => { const g = keep(new THREE.BufferGeometry()); g.setAttribute('position', new THREE.Float32BufferAttribute(e.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(e.n, 3)); if (uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(e.u, 2)); return g; };
  // ปิดงานตัวรถ 1 แบบ: เรขาคณิตตัวถัง กระจก ป้ายเลขทาง (ถ้ามี) และตำแหน่งสีแถบในอาร์เรย์สี
  function finish(m, gl, pl, len) {
    const body = m.geometry(), col = body.attributes.color.array, band = [];
    for (let i = 0; i < col.length; i += 3) if (col[i] === 1 && col[i + 1] === 0 && col[i + 2] === 1) band.push(i);
    const ge = gl.b.get(M.glass), pe = pl && pl.b.get('_p');
    return { len, body, band, glass: ge ? geoOf(ge) : null, plates: pe ? geoOf(pe, true) : null };
  }
  // ป้ายเลขทางข้างตู้ 4 ป้าย + บนหลังคา 1 ป้าย (มองจากมุมสูงก็รู้ว่าขบวนไปทางไหน)
  function sidePlates(L_, hw, y, roofY) {
    const pl = new Merger();
    [-1, 1].forEach(s => [-1, 1].forEach(e => pl.add(new THREE.PlaneGeometry(0.62, 0.62), '_p', mtx(e * (L_ / 2 - 2.9), y, s * (hw + 0.022), 0, s > 0 ? 0 : Math.PI, 0))));
    pl.add(new THREE.PlaneGeometry(1.25, 1.25), '_p', mtx(0, roofY, 0, -Math.PI / 2, 0, 0));
    return pl;
  }
  // ตัวถังรถโดยสาร (รถดีเซลรางและตู้โดยสาร): หน้าตัดมุมมน หลังคาโค้ง แถบสี หน้าต่างเรียง ประตูใกล้หัวท้าย
  function shell(m, gl, L_, B_, nW, sp) {
    const hw = 1.36, y0 = 1.17, y1 = 3.4, BAND = tag(BANDC);
    m.add(prism(rrShape(hw, y0, y1, 0.1, 0.06), L_ - 0.6), B_, null, 0.5);
    [-1, 1].forEach(e => m.add(prism(rrShape(hw - 0.02, y0, y1 - 0.02, 0.1, 0.2), 0.4), B_, mtx(e * (L_ / 2 - 0.4), 0, 0), 0.5));
    m.add(prism(archShape(hw + 0.03, y1 - 0.02, 0.5), L_ - 0.4, 10), M.roofGrey, null, 0.5);
    m.bx(BAND, L_ - 0.1, 0.2, hw * 2 + 0.024, 0, 1.92, 0);
    m.bx(M.dark, L_ - 0.8, 0.16, 2.3, 0, y0 - 0.06, 0); m.bx(M.dark, 2.4, 0.5, 1.7, 0.6, 0.86, 0);
    const x0 = -(nW - 1) * sp / 2;
    [-1, 1].forEach(s => {
      for (let i = 0; i < nW; i++) { const x = x0 + i * sp; m.bx(M.frame, 1.1, 0.92, 0.03, x, 2.68, s * (hw + 0.003)); gl.bx(M.glass, 0.98, 0.8, 0.03, x, 2.68, s * (hw + 0.012)); m.bx(M.frame, 0.98, 0.035, 0.035, x, 2.74, s * (hw + 0.015)); }
      [-1, 1].forEach(e => { const x = e * (L_ / 2 - 1.75); m.bx(M.dark, 0.86, 2.02, 0.03, x, 2.26, s * (hw + 0.004)); m.bx(B_, 0.74, 1.9, 0.03, x, 2.26, s * (hw + 0.012)); gl.bx(M.glass, 0.46, 0.6, 0.03, x, 2.72, s * (hw + 0.02));
        m.bx(M.dark, 0.8, 0.05, 0.3, x, y0 - 0.2, s * (hw - 0.05)); m.bx(M.steel, 0.03, 0.9, 0.03, x + e * -0.46, 2.3, s * (hw + 0.04)); });
    });
    const nv = Math.max(2, Math.round(L_ / 3.6));
    for (let i = 0; i < nv; i++) m.bx(M.roofGrey, 0.7, 0.1, 0.45, (i - (nv - 1) / 2) * 2.8, y1 + 0.49, 0);
    bogie(m, -L_ / 2 + 3.2, 1.0); bogie(m, L_ / 2 - 3.2, 1.0);
    return { hw, y0, y1 };
  }
  // ขอพ่วงและกันชนที่ปลายตัวรถ (ทุกชนิด)
  const coupler = (m, L_, e) => { m.bx(M.dark, 0.25, 0.3, 2.3, e * (L_ / 2 + 0.05), 1.15, 0); m.bx(M.dark, 0.5, 0.2, 0.22, e * (L_ / 2 + 0.25), 1.12, 0); };
  function buildDmu() {                             // รถดีเซลราง: ห้องขับทั้งสองปลาย กระจกหน้า ไฟท้าย
    const m = new VMerger(), gl = new Merger(), L_ = CARS.dmu, B_ = tag(BODY), { hw } = shell(m, gl, L_, B_, 7, 1.42);
    m.bx(M.dark, 1.2, 0.4, 0.6, -2.2, 0.9, 0.6);
    [-1, 1].forEach(e => {
      const xe = e * (L_ / 2 - 0.02);
      gl.bx(M.glass, 0.04, 0.7, 2.1, xe, 2.75, 0); m.bx(M.frame, 0.05, 0.08, 2.2, xe, 3.12, 0); m.bx(M.frame, 0.05, 0.06, 2.2, xe, 2.38, 0);
      coupler(m, L_, e);
      [0.55, -0.55].forEach(z => m.add(new THREE.SphereGeometry(0.11, 8, 6), M.lampOff, mtx(xe - e * 0.03, 1.7, z, 0, 0, 0, 0.4, 1, 1)));
    });
    return finish(m, gl, sidePlates(L_, hw, 2.62, 3.93), L_);
  }
  function buildCoach() {                           // ตู้โดยสาร: หน้าต่างถี่กว่า ปลายตู้มีทางเดินเชื่อมระหว่างตู้ (ผ้าใบสีเข้ม) ไม่มีห้องขับ
    const m = new VMerger(), gl = new Merger(), L_ = CARS.coach, B_ = tag(COACH), { hw, y0 } = shell(m, gl, L_, B_, 9, 1.38);
    [-1, 1].forEach(e => {
      const xe = e * (L_ / 2 + 0.08);
      m.bx(M.dark, 0.2, 2.1, 1.1, xe, y0 + 1.15, 0); m.bx(B_, 0.04, 1.9, 0.9, e * (L_ / 2 - 0.01), y0 + 1.0, 0);
      coupler(m, L_, e);
    });
    m.bx(M.dark, 3.2, 0.42, 1.6, -3.4, 0.88, 0);
    return finish(m, gl, sidePlates(L_, hw, 2.62, 3.93), L_);
  }
  function buildLoco() {                            // หัวรถจักรดีเซลแบบฝากระโปรง: ห้องขับค่อนไปทางหน้า (+x) ฝาเครื่องยาวด้านหลัง จมูกสั้นด้านหน้า โบกี้ 3 เพลา
    const m = new VMerger(), gl = new Merger(), L_ = CARS.loco, B_ = tag(LOCO), H_ = tag(LOCO_HI), BAND = tag(BANDC);
    const deck = 1.42, cab0 = L_ / 2 - 4.3, cab1 = L_ / 2 - 1.7, hood = 1.05, cabW = 1.38;
    m.bx(M.dark, L_ - 0.2, 0.34, 2.75, 0, deck - 0.17, 0);                     // โครงล่าง
    m.bx(H_, L_ - 0.2, 0.08, 2.8, 0, deck + 0.02, 0);                           // ขอบพื้นสีอ่อน
    const hl = cab0 - (-L_ / 2 + 0.5);                                         // ฝาเครื่องยาว
    m.add(prism(rrShape(hood, deck, 3.3, 0.04, 0.22), hl), B_, mtx(-L_ / 2 + 0.5 + hl / 2, 0, 0), 0.5);
    m.bx(BAND, hl + 0.02, 0.22, hood * 2 + 0.024, -L_ / 2 + 0.5 + hl / 2, 2.0, 0);
    for (let i = 0; i < 4; i++) [-1, 1].forEach(s => m.bx(M.dark, 1.3, 0.9, 0.03, -L_ / 2 + 1.6 + i * 2.15, 2.65, s * (hood + 0.005)));   // ช่องลมข้างฝาเครื่อง
    m.cy(M.dark, 0.2, 0.22, 0.35, 10, -L_ / 2 + 3.2, 3.45, 0); m.bx(M.roofGrey, 2.2, 0.12, 1.5, -L_ / 2 + 5.6, 3.36, 0);   // ปล่องไอเสีย พัดลมหลังคา
    m.add(prism(rrShape(cabW, deck, 3.75, 0.04, 0.16), cab1 - cab0), B_, mtx((cab0 + cab1) / 2, 0, 0), 0.5);   // ห้องขับ
    m.bx(M.roofGrey, cab1 - cab0 + 0.1, 0.1, cabW * 2 + 0.1, (cab0 + cab1) / 2, 3.8, 0);
    m.bx(BAND, cab1 - cab0 + 0.02, 0.22, cabW * 2 + 0.024, (cab0 + cab1) / 2, 2.0, 0);
    [-1, 1].forEach(s => { gl.bx(M.glass, 1.2, 0.75, 0.03, (cab0 + cab1) / 2 + 0.3, 3.0, s * (cabW + 0.012)); m.bx(M.dark, 0.7, 1.5, 0.03, cab0 + 0.55, 2.3, s * (cabW + 0.006)); });
    [-1, 1].forEach(e => gl.bx(M.glass, 0.03, 0.62, 1.05, e > 0 ? cab1 + 0.01 : cab0 - 0.01, 3.1, 0));   // กระจกหน้าห้องขับ (และด้านหลัง)
    const nl = L_ / 2 - 0.35 - cab1;                                           // จมูกสั้น
    m.add(prism(rrShape(0.95, deck, 2.55, 0.04, 0.18), nl), B_, mtx(cab1 + nl / 2, 0, 0), 0.5);
    m.bx(H_, 0.04, 0.5, 1.6, L_ / 2 - 0.33, 1.95, 0);
    [-1, 1].forEach(s => { m.bx(M.steel, L_ - 0.8, 0.035, 0.035, 0, deck + 0.95, s * 1.36); for (let i = 0; i < 7; i++) m.bx(M.steel, 0.035, 0.95, 0.035, -L_ / 2 + 0.6 + i * (L_ - 1.2) / 6, deck + 0.48, s * 1.36); });   // ราวจับข้างทางเดิน
    m.bx(M.dark, 3.6, 0.7, 1.8, 0, 0.95, 0);                                   // ถังน้ำมัน
    [-1, 1].forEach(e => coupler(m, L_, e));
    bogie(m, -L_ / 2 + 3.1, 1.25, 3); bogie(m, L_ / 2 - 3.1, 1.25, 3);
    return finish(m, gl, null, L_);
  }
  function buildWagon() {                           // ตู้สินค้าแบบตู้ปิด: ตู้ไม้สีน้ำตาลแดง ซี่เสริมแนวตั้ง ประตูเลื่อนกลางตู้ แถบสีขบวนเส้นบางล่าง
    const m = new VMerger(), gl = new Merger(), L_ = CARS.wagon, B_ = tag(VAN), BAND = tag(BANDC), hw = 1.38, y0 = 1.2, y1 = 3.3;
    m.bx(M.dark, L_ - 0.3, 0.3, 2.5, 0, y0 - 0.12, 0);
    m.bx(B_, L_ - 0.2, y1 - y0, hw * 2, 0, (y0 + y1) / 2, 0);
    m.add(prism(archShape(hw + 0.04, y1, 0.32), L_ - 0.1, 8), M.roofGrey, null, 0.5);
    m.bx(BAND, L_ - 0.18, 0.14, hw * 2 + 0.024, 0, y0 + 0.22, 0);
    [-1, 1].forEach(s => {
      for (let i = 0; i <= 8; i++) m.bx(M.dark, 0.08, y1 - y0, 0.04, -L_ / 2 + 0.15 + i * (L_ - 0.3) / 8, (y0 + y1) / 2, s * (hw + 0.01));
      m.bx(B_, 2.0, y1 - y0 - 0.25, 0.06, 0, (y0 + y1) / 2 - 0.05, s * (hw + 0.04)); m.bx(M.dark, 2.2, 0.08, 0.08, 0, y1 - 0.1, s * (hw + 0.06));
    });
    [-1, 1].forEach(e => coupler(m, L_, e));
    bogie(m, -L_ / 2 + 2.2, 0.85); bogie(m, L_ / 2 - 2.2, 0.85);
    return finish(m, gl, null, L_);
  }
  const CAR3D = { dmu: buildDmu(), coach: buildCoach(), loco: buildLoco(), wagon: buildWagon() };
  const bodies = {};                                // เรขาคณิตตัวถังต่อชนิดรถ × สีขบวน (ใช้ตำแหน่งร่วมกัน สีที่จุดยอดแยก)
  const paintBand = (type, n, attr) => { const c = attr.array, bc = new THREE.Color(brand(n)); for (const i of CAR3D[type].band) { c[i] = bc.r; c[i + 1] = bc.g; c[i + 2] = bc.b; } attr.needsUpdate = true; };
  function bodyFor(type, n) {
    const k = `${type}|${n}`; if (bodies[k]) return bodies[k];
    const src = CAR3D[type].body, g = keep(new THREE.BufferGeometry()); for (const a of ['position', 'normal', 'uv']) g.setAttribute(a, src.attributes[a]);
    g.setAttribute('color', new THREE.Float32BufferAttribute(src.attributes.color.array.slice(), 3)); paintBand(type, n, g.attributes.color);
    g.userData = { type, n }; return (bodies[k] = g);
  }
  const headLamp = keep(new THREE.MeshStandardMaterial({ color: 0x332200, emissive: new THREE.Color(0xffe9a0), emissiveIntensity: 3.2 }));
  const headGeo = (() => { const lm = new Merger(); [0.55, -0.55].forEach(z => lm.add(new THREE.SphereGeometry(0.11, 10, 8), '_l', mtx(0.03, 1.7, z, 0, 0, 0, 0.4, 1, 1))); return geoOf(lm.b.get('_l')); })();
  // กองของ InstancedMesh: key = ชนิดชิ้น|ชนิดรถ|สี ใช้ซ้ำทุกเฟรม (count = จำนวนคันที่วาดเฟรมนี้)
  const CAP = 40, pools = new Map();
  function pool(key, geo, mat, o = {}) {
    let p = pools.get(key);
    if (!p) {
      p = new THREE.InstancedMesh(geo, mat, CAP); p.frustumCulled = false; p.castShadow = !!o.cast; p.receiveShadow = o.receive !== false; p.count = 0;
      if (o.order) p.renderOrder = o.order; p.userData.kind = o.kind || 'train'; scene.add(p); pools.set(key, p);
    }
    return p;
  }
  const _tm = new THREE.Matrix4(), _tp = new THREE.Vector3(), _tq = new THREE.Quaternion(), _ts = new THREE.Vector3(1, 1, 1), _ty = new THREE.Vector3(0, 1, 0);
  function put(p, x, y, z, ry, sx = 1, sz = 1) {
    if (p.count >= CAP) return;
    _tp.set(x, y, z); _tq.setFromAxisAngle(_ty, ry); _ts.set(sx, 1, sz);
    p.setMatrixAt(p.count++, _tm.compose(_tp, _tq, _ts));
  }
  const trains = new Map();                         // id -> { path, cars, rev, n, ghost } ขบวนที่ออกพ้นผังแล้ววาดต่ออีกครู่ (ghost) ไม่ให้หายวับกลางจอ
  const dusk = () => (parseFloat(colors['--scene-sun']) || 1) < 0.8;
  let trainGame = null, trainCount = 0, lampCount = 0;
  // วางตัวรถทุกคันของขบวน o ตามทางวิ่ง: คันแรกต่อจากหัว ระยะห่างตามความยาวตัวรถ + ข้อต่อ
  function placeTrain(o, shift) {
    const list = o.rev ? [...o.cars].reverse() : o.cars;
    let d = -shift;
    list.forEach((type, i) => {
      const c = CAR3D[type], a = pathAt(o.path, d), b = pathAt(o.path, d + c.len);
      d += c.len + COUPLER;
      const dx = a[0] - b[0], dz = a[1] - b[1], ry = Math.atan2(-dz, dx) + (o.rev ? Math.PI : 0), cx = (a[0] + b[0]) / 2, cz = (a[1] + b[1]) / 2;
      put(pool(`b|${type}|${o.n}`, bodyFor(type, o.n), bodyMat, { cast: true }), cx, 0, cz, ry);
      if (c.glass) put(pool(`g|${type}`, c.glass, M.glass), cx, 0, cz, ry);
      if (c.plates) put(pool(`p|${type}|${o.n}`, c.plates, plateMat(o.n)), cx, 0, cz, ry);
      if (!(tier.shadow > 0)) put(pool('shade', planeY, padMat, { order: 2, receive: false }), cx, SLT + 0.03, cz, ry, c.len + 1.6, 4.3);
      if (i === 0 && dusk()) { put(pool('lamp', headGeo, headLamp, { receive: false }), a[0], 0, a[1], Math.atan2(-dz, dx)); lampCount++; }
    });
    trainCount++;
  }
  function setTrains(game, dt = 0) {
    if (game !== trainGame) { trains.clear(); trainGame = game; }
    for (const p of pools.values()) p.count = 0;
    trainCount = lampCount = 0;
    const seen = new Set();
    for (const t of game.trains) {
      if (t.trail.length < 2) continue;
      seen.add(t.id);
      const kind = KINDS[t.kind] ? t.kind : DEFAULT_KIND;
      const o = { path: t.trail.map(q => trailPoint(W, L, q)), cars: KINDS[kind].cars, rev: !!t.rev, n: t.exp ? 0 : t.plat || 0, ghost: 0 };
      trains.set(t.id, o);
      placeTrain(o, 0);
    }
    // ขบวนที่ออกพ้นผัง: วิ่งต่อตามแนวรางด้วยความเร็วของภารกิจจนพ้นสายตา (ราว 6 วินาที) แล้วจึงลบ
    const v = (game.lv && game.lv.speed ? game.lv.speed : 56) * KX;
    for (const [id, o] of trains) {
      if (seen.has(id)) continue;
      o.ghost += v * dt;
      if (game.state !== 'play' && game.state !== 'win' || o.ghost > 120) { trains.delete(id); continue; }
      placeTrain(o, o.ghost);
    }
    for (const p of pools.values()) { p.visible = p.count > 0; p.instanceMatrix.needsUpdate = true; }
  }

  /* ================= ต้นไม้และกอหญ้า จาก atlas ใบไม้ CC0 ================= */
  const imgOf = t => t.image;
  function alphaCanvas(img) { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; c.getContext('2d').drawImage(img, 0, 0); return c; }
  function tinted(src, style) { const c = document.createElement('canvas'); c.width = src.width; c.height = src.height; const g = c.getContext('2d'); g.drawImage(src, 0, 0); g.globalCompositeOperation = 'source-atop'; g.fillStyle = style; g.fillRect(0, 0, c.width, c.height); return c; }
  function alphaTex(c, fill) {                     // เติมสีใต้พิกเซลโปร่ง กันขอบดำเมื่อย่อภาพ
    const d = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, c.width, c.height), px = new Uint8Array(d.data.length);
    for (let i = 0; i < px.length; i += 4) { const a = d.data[i + 3]; if (a < 8) { px[i] = fill[0]; px[i + 1] = fill[1]; px[i + 2] = fill[2]; px[i + 3] = 0; } else { px[i] = d.data[i]; px[i + 1] = d.data[i + 1]; px[i + 2] = d.data[i + 2]; px[i + 3] = a; } }
    const t = keep(new THREE.DataTexture(px, c.width, c.height, THREE.RGBAFormat)); t.colorSpace = THREE.SRGBColorSpace; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.anisotropy = 4; t.flipY = false; t.needsUpdate = true; return t;
  }
  const leafBase = alphaCanvas(imgOf(T.leaf)), S_ = leafBase.width / 512;
  const leafSets = [tinted(leafBase, 'rgba(4,16,6,0.8)'), tinted(leafBase, 'rgba(8,36,8,0.56)'), tinted(leafBase, 'rgba(10,52,8,0.3)'), tinted(leafBase, 'rgba(150,190,40,0.16)')];
  const crownCanvas = document.createElement('canvas'); crownCanvas.width = crownCanvas.height = 512;
  { const g = crownCanvas.getContext('2d', { willReadFrequently: true });
    [[150, 140, 46], [110, 190, 46], [80, 208, 44], [34, 214, 42]].forEach(([n, R, size], Lr) => { for (let i = 0; i < n; i++) {
      const a = rnd() * 6.283, r = Math.pow(rnd(), 0.62) * R * 0.94, x = 278 + Math.cos(a) * r, y = 278 + Math.sin(a) * r * 0.95, s = size * rr(0.75, 1.25), cell = (rnd() * 9) | 0;
      g.save(); g.translate(x, y); g.rotate(a + Math.PI / 2 + rr(-0.9, 0.9)); g.drawImage(leafSets[Lr], (cell % 3) * 170.67 * S_, ((cell / 3) | 0) * 170.67 * S_, 170 * S_, 170 * S_, -s / 2, -s / 2, s, s); g.restore(); } });
    g.clearRect(0, 0, 66, 66); g.fillStyle = '#cfc8bd'; g.fillRect(0, 0, 64, 64); for (let i = 0; i < 40; i++) { g.fillStyle = rnd() < 0.5 ? 'rgba(90,80,70,0.35)' : 'rgba(235,230,220,0.3)'; g.fillRect(rnd() * 62, 0, 1 + rnd() * 2, 64); } }
  const crownTex = alphaTex(crownCanvas, [30, 54, 22]);
  const folBase = alphaCanvas(imgOf(T.fol)), F_ = folBase.width / 512, tuftCanvas = document.createElement('canvas'); tuftCanvas.width = tuftCanvas.height = 256;
  { const g = tuftCanvas.getContext('2d', { willReadFrequently: true }), cxs = [33, 84, 137, 184, 237, 286, 337, 387], sets = [tinted(folBase, 'rgba(20,40,10,0.35)'), folBase, tinted(folBase, 'rgba(215,200,110,0.3)')];
    for (let i = 0; i < 34; i++) { const b = cxs[(rnd() * 8) | 0], h = rr(110, 240), w = rr(13, 20); g.save(); g.translate(128 + rr(-46, 46), 256); g.rotate(rr(-0.62, 0.62)); g.drawImage(sets[(rnd() * 3) | 0], (b - 22) * F_, 26 * F_, 44 * F_, 444 * F_, -w / 2, -h, w, h); g.restore(); } }
  const tuftTex = alphaTex(tuftCanvas, [70, 100, 40]);
  function foliageMat(tex, o) {
    const m = keep(new THREE.MeshStandardMaterial(Object.assign({ map: tex, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.85, metalness: 0 }, o || {})));
    m.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n normal = normalize( vNormal );'); };   // ไม่กลับ normal ด้านหลัง ให้พุ่มใบรับแสงเป็นก้อน
    return m;
  }
  function treeGeo(sp) {
    const P = [], N = [], U = [], K = [], q = new THREE.Quaternion(), a = new THREE.Vector3(), b = new THREE.Vector3(), dir = new THREE.Vector3(), pos = new THREE.Vector3(), nn = new THREE.Vector3();
    (sp.limbs || []).forEach(([p0, p1, r0, r1]) => {
      a.fromArray(p0); b.fromArray(p1); dir.subVectors(b, a); const len = dir.length(); dir.normalize(); q.setFromUnitVectors(UP, dir);
      const g = new THREE.CylinderGeometry(r1, r0, len, 5, 1, true).toNonIndexed(), gp = g.attributes.position, gn = g.attributes.normal, sh = rr(0.82, 1.08);
      for (let i = 0; i < gp.count; i++) { pos.fromBufferAttribute(gp, i).applyQuaternion(q).addScaledVector(dir, len / 2).add(a); nn.fromBufferAttribute(gn, i).applyQuaternion(q);
        P.push(pos.x, pos.y, pos.z); N.push(nn.x, nn.y, nn.z); U.push(0.03 + rnd() * 0.06, 0.02 + gp.getY(i) / len * 0.04 + 0.05); K.push(0.62 * sh, 0.5 * sh, 0.4 * sh); }
      g.dispose();
    });
    const lobes = sp.lobes || []; let y0 = 1e9, y1 = -1e9; const cc = new THREE.Vector3(); lobes.forEach(l => { y0 = Math.min(y0, l[1] - l[3] * (l[4] || 1)); y1 = Math.max(y1, l[1] + l[3] * (l[4] || 1)); cc.x += l[0] / lobes.length; cc.y += l[1] / lobes.length; cc.z += l[2] / lobes.length; });
    const R = Math.max(1, (y1 - y0) / 2), corners = [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]], lc = new THREE.Vector3();
    lobes.forEach(([lx, ly, lz, r, fl]) => {
      lc.set(lx, ly, lz); const flatk = fl || 1;
      for (let i = 0; i < sp.cards; i++) {
        dir.set(rr(-1, 1), rr(-0.4, 1), rr(-1, 1)).normalize(); const dist = i === 0 ? 0.1 : rr(0.35, 0.8), hs = r * rr(0.5, 0.74), fu = rnd() < 0.5 ? 1 : -1, fv = rnd() < 0.5 ? 1 : -1, sh = rr(0.86, 1.1);
        nn.copy(dir).add(a.set(rr(-0.6, 0.6), rr(-0.6, 0.6), rr(-0.6, 0.6))).normalize(); q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), nn); q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), rnd() * 6.28));
        corners.forEach(([cx, cy]) => {
          pos.set(cx * hs, cy * hs, 0).applyQuaternion(q).addScaledVector(dir, dist * r); pos.y *= flatk; const lr = pos.length() / r; pos.add(lc);
          nn.copy(pos).sub(lc).multiplyScalar(1 / r).addScaledVector(b.copy(pos).sub(cc), 0.7 / R); nn.y += 0.4; nn.normalize();
          const k = (0.36 + 0.64 * smooth((pos.y - y0) / (y1 - y0) * 1.15)) * (0.7 + 0.3 * smooth(lr)) * sh;
          P.push(pos.x, pos.y, pos.z); N.push(nn.x, nn.y, nn.z); U.push(0.565 + cx * fu * 0.435, 0.565 + cy * fv * 0.435); K.push(k * 0.96, k, k * 0.9);
        });
      }
    });
    const g = keep(new THREE.BufferGeometry()); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(K, 3)); return g;
  }
  const ring = (n, rad, y, r, fl, jy) => { const o = [], a0 = rnd() * 6.28; for (let i = 0; i < n; i++) { const a = a0 + i / n * 6.283 + rr(-0.25, 0.25), d = rad * rr(0.85, 1.12); o.push([Math.cos(a) * d, y + rr(-jy, jy), Math.sin(a) * d, r * rr(0.88, 1.12), fl]); } return o; };
  const forks = (n, y, rad, yt, r0) => { const o = [], a0 = rnd() * 6.28; for (let i = 0; i < n; i++) { const a = a0 + i / n * 6.283 + rr(-0.3, 0.3); o.push([[0, y, 0], [Math.cos(a) * rad, yt + rr(-0.4, 0.4), Math.sin(a) * rad], r0, r0 * 0.38]); } return o; };
  const TREES = [
    { geo: treeGeo({ cards: 7, limbs: [[[0, -0.3, 0], [0.15, 3.6, 0], 0.46, 0.33]].concat(forks(4, 3.3, 4.6, 6.4, 0.2)), lobes: [[0, 8.3, 0, 3.1, 0.62]].concat(ring(6, 4.9, 7.4, 2.9, 0.6, 0.4)) }), h: 10, r: 7.6, cast: true },
    { geo: treeGeo({ cards: 8, limbs: [[[0, -0.3, 0], [0.25, 6.2, 0.1], 0.3, 0.2], [[0.25, 6.2, 0.1], [0.1, 11.0, -0.1], 0.2, 0.09]].concat(forks(3, 7.2, 2.0, 9.2, 0.1)), lobes: [[0.1, 12.6, -0.1, 2.1, 0.9]].concat(ring(3, 1.8, 10.4, 2.2, 0.8, 0.5), ring(2, 1.5, 8.4, 1.7, 0.7, 0.3)) }), h: 14, r: 3.6, cast: true },
    { geo: treeGeo({ cards: 8, limbs: [[[0, -0.3, 0], [0, 2.5, 0], 0.34, 0.26]].concat(forks(3, 2.2, 2.0, 4.4, 0.16)), lobes: [[0, 6.3, 0, 2.6, 0.9]].concat(ring(5, 2.4, 4.9, 2.4, 0.85, 0.5)) }), h: 8.5, r: 4.6, cast: true },
    { geo: treeGeo({ cards: 7, limbs: [[[0, -0.2, 0], [0.5, 2.3, 0.2], 0.15, 0.11], [[0.5, 2.3, 0.2], [0.9, 4.3, 0.3], 0.11, 0.05], [[0.5, 2.3, 0.2], [-0.7, 3.9, -0.4], 0.07, 0.03]], lobes: [[0.9, 5.0, 0.3, 1.5, 0.9], [-0.7, 4.3, -0.4, 1.3, 0.85], [1.6, 4.0, 1.1, 1.2, 0.8], [0.2, 3.6, 1.2, 1.0, 0.8]] }), h: 6, r: 2.6, cast: true },
    { geo: treeGeo({ cards: 6, lobes: [[0, 0.75, 0, 1.0, 0.75], [0.9, 0.6, 0.3, 0.85, 0.7], [-0.5, 0.55, 0.8, 0.8, 0.7]] }), h: 1.5, r: 1.6, cast: true },
    { geo: treeGeo({ cards: 6, limbs: [[[0, -0.3, 0], [0.1, 5.2, 0], 0.3, 0.16]], lobes: [[0, 8.2, 0, 2.7, 0.85], [1.9, 6.4, 0.6, 2.4, 0.8], [-1.6, 6.6, -1.1, 2.4, 0.8]] }), h: 10, r: 4.2, cast: false },
  ];
  const MAXT = { near: 170, far: 190, bushes: 70 };
  const treeInst = [];
  {
    const spots = [], keepXZ = [];
    const free = (x, z, d) => { for (let i = 0; i < keepXZ.length; i++) { const k = keepXZ[i]; if (Math.abs(k[0] - x) < d && Math.abs(k[1] - z) < d && Math.hypot(k[0] - x, k[1] - z) < d) return false; } return true; };
    const put = (x, z, v, s, cls) => { spots.push([x, z, v, s, cls]); keepXZ.push([x, z]); };
    const awayTrack = (x, z) => { const [a, b] = corrAt(x); return Math.max(a - z, z - b); };
    // ไม้ร่มเงาใกล้สถานี
    if (realPlat) [[PLC - 19, BZ + sz(14.3), 1.05], [PLC + 23, BZ + sz(14.8), 0.95], [B.x0 + 4, BZ + sz(6.3), 0.85], [B.x1 - 2, BZ + sz(7.8), 0.9]].forEach(([x, z, s]) => put(x, z, 0, s, 0));
    // แนวต้นไม้ริมทางดินออกจากลาน และริมทางรถไฟนอกย่านสถานี
    if (realPlat) for (let d = 15; d < 103; d += rr(8, 11)) { const z = BZ + sz(d), side = keepXZ.length % 2 ? 1 : -1, x = drive(z) + side * rr(4.6, 6.2); if (free(x, z, 6)) put(x, z, rnd() < 0.6 ? 2 : 1, rr(0.85, 1.15), 0); }
    [-1, 1].forEach(e => { for (let x = 62; x < 190; x += rr(9, 14)) { const X = e * x + (e > 0 ? B.x1 - 46 : B.x0 + 46), z = (PS < 0 ? corrAt(X)[0] : corrAt(X)[1]) + sz(13 + rr(0, 3)); if (soilDist(X, z) > 4 && free(X, z, 6)) put(X, z, rnd() < 0.5 ? 1 : 3, rr(0.8, 1.2), 0); } });
    const pick = (x, z) => { const v = fbm(x * 0.021 + 50, z * 0.021 + 13) + rr(-0.08, 0.08); return v < 0.44 ? 1 : v < 0.58 ? 2 : rnd() < 0.5 ? 3 : 1; };
    let guard = 0, nearN = 0;
    while (nearN < MAXT.near && guard++ < 30000) {   // กลุ่มป่าใกล้ (ทอดเงา)
      const x = rr(B.x0 - 85, B.x1 + 85), z = rr(-80, 80), g = groveF(x, z);
      if (rnd() > Math.pow(g, 1.3) * 0.95 + (isOpen(x, z) || soilDist(x, z) < 6 || awayTrack(x, z) < 8 ? 0 : 0.012)) continue; if (!free(x, z, g > 0.5 ? 4.2 : 9)) continue;
      put(x, z, g < 0.15 ? (rnd() < 0.5 ? 2 : 0) : pick(x, z), rr(0.75, 1.25), 1); nearN++;
    }
    guard = 0; let farN = 0;
    while (farN < MAXT.far && guard++ < 40000) {     // ป่าไกล
      const x = rr(-470, 470), z = rr(-380, 380); if (x > B.x0 - 85 && x < B.x1 + 85 && Math.abs(z) < 80) continue; const g = groveF(x, z);
      if (rnd() > Math.pow(g, 1.2) + 0.02 || soilDist(x, z) < 6 || awayTrack(x, z) < 10 || isOpen(x, z) || !free(x, z, 6)) continue; put(x, z, 5, rr(0.8, 1.35), 2); farN++;
    }
    guard = 0; let bushN = 0;
    while (bushN < MAXT.bushes && guard++ < 20000) { // พุ่มเตี้ยเป็นกลุ่ม ตามชายป่าและหย่อมหญ้าสูง
      const x = rr(B.x0 - 85, B.x1 + 85), z = rr(-40, 40), f = field(x, z); if (soilDist(x, z) < 1.6 || f[0] > 0.3 || awayTrack(x, z) < 6) continue;
      if (rnd() > Math.max(f[1] * 0.5, (f[3] > 0.08 && f[3] < 0.6) ? 0.8 : 0)) continue;
      const n = 2 + ((rnd() * 4) | 0); for (let i = 0; i < n && bushN < MAXT.bushes; i++) { const bx = x + rr(-3.2, 3.2), bz = z + rr(-3.2, 3.2); if (soilDist(bx, bz) > 1.4 && awayTrack(bx, bz) > 5.5) { spots.push([bx, bz, 4, rr(0.6, 1.5), 3]); bushN++; } }
    }
    const mat = foliageMat(crownTex, { vertexColors: true }), depth = keep(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: crownTex, alphaTest: 0.42 }));
    const d = new THREE.Object3D(), col = new THREE.Color(), sxs = -sunDir.x / sunDir.y, szs = -sunDir.z / sunDir.y;
    TREES.forEach((T_, v) => {
      // เรียงให้ต้นสำคัญ (ใกล้สถานี) อยู่ต้นรายการ ระดับคุณภาพตัดท้ายรายการด้วย inst.count
      const list = spots.filter(sp => sp[2] === v).sort((a, b) => a[4] - b[4]); if (!list.length) return;
      const inst = new THREE.InstancedMesh(T_.geo, mat, list.length), blobs = [];
      list.forEach(([x, z, , s], i) => {
        const y = groundH(x, z), sy = s * rr(0.9, 1.15);
        d.position.set(x, y, z); d.rotation.set(0, rnd() * 6.28, 0); d.scale.set(s, sy, s); d.updateMatrix(); inst.setMatrixAt(i, d.matrix);
        const b = rr(0.5, 0.82), w = rr(-0.06, 0.09); inst.setColorAt(i, col.setRGB(b * 0.92 + w, b, b * 0.62 - w * 0.4));
        const off = v === 4 ? 0.3 : T_.h * sy * 0.42, bs = T_.r * s * (v === 4 ? 2.4 : 2.5);
        blobs.push([bs, x + sxs * off, y + 0.07, z + szs * off]);
      });
      if (T_.cast) { inst.castShadow = true; inst.customDepthMaterial = depth; } inst.receiveShadow = true; inst.frustumCulled = false; scene.add(inst);
      treeInst.push({ inst, blobs, list, v });
    });
  }
  // มะพร้าวและกอกล้วยแบบง่าย สร้างด้วยโค้ดล้วน สีที่จุดยอด
  if (realPlat) {
    const P = [], N = [], K = [], a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(), q = new THREE.Quaternion(), dir = new THREE.Vector3(), pos = new THREE.Vector3();
    const tri = (p0, p1, p2, col, sh) => { n.subVectors(p1, p0).cross(c.subVectors(p2, p0)).normalize(); const fl = n.y < 0; if (fl) n.negate(); (fl ? [p0, p2, p1] : [p0, p1, p2]).forEach(p => { P.push(p.x, p.y, p.z); N.push(n.x * 0.6, n.y * 0.6 + 0.4, n.z * 0.6); K.push(col[0] * sh, col[1] * sh, col[2] * sh); }); };
    const limb = (p0, p1, r0, r1, col) => { dir.subVectors(p1, p0); const len = dir.length(); dir.normalize(); q.setFromUnitVectors(UP, dir); const g = new THREE.CylinderGeometry(r1, r0, len, 6, 1, true).toNonIndexed(), gp = g.attributes.position, gn = g.attributes.normal, sh = rr(0.85, 1.1);
      for (let i = 0; i < gp.count; i++) { pos.fromBufferAttribute(gp, i).applyQuaternion(q).addScaledVector(dir, len / 2).add(p0); n.fromBufferAttribute(gn, i).applyQuaternion(q); P.push(pos.x, pos.y, pos.z); N.push(n.x, n.y, n.z); K.push(col[0] * sh, col[1] * sh, col[2] * sh); } g.dispose(); };
    const BARKC = [0.2, 0.17, 0.14], FROND = [0.034, 0.105, 0.016], BAN = [0.06, 0.17, 0.022], STEM = [0.13, 0.17, 0.05];
    const coconut = (x, z, H, lean, la) => {
      const y0 = groundH(x, z), pts = []; for (let i = 0; i <= 5; i++) { const t = i / 5; pts.push(new THREE.Vector3(x + Math.cos(la) * lean * t * t, y0 - 0.2 + (H + 0.2) * t, z + Math.sin(la) * lean * t * t)); }
      for (let i = 0; i < 5; i++) limb(pts[i], pts[i + 1], 0.24 - i * 0.022, 0.24 - (i + 1) * 0.022, BARKC);
      const top = pts[5];
      for (let f = 0; f < 14; f++) {
        const az = f / 14 * 6.283 + rr(-0.2, 0.2), el = rr(-0.25, 1.05), Lf = rr(3.4, 4.5), droop = 0.55 + (1.05 - el) * 0.75, hx = Math.cos(az), hz = Math.sin(az), sdx = -hz, sdz = hx, rib = [], sh = rr(0.8, 1.15);
        for (let i = 0; i <= 6; i++) { const t = i / 6; rib.push(new THREE.Vector3(top.x + hx * Lf * t * Math.cos(el * (1 - t * 0.5)), top.y + Lf * (Math.sin(el) * t - droop * t * t * 0.55), top.z + hz * Lf * t * Math.cos(el * (1 - t * 0.5)))); }
        for (let i = 0; i < 6; i++) { const t = (i + 0.5) / 6, w = 0.28 + 0.75 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.05)), 0.7); [-1, 1].forEach(sd => { a.copy(rib[i]).lerp(rib[i + 1], 0.75); a.x += sdx * sd * w + hx * 0.25; a.z += sdz * sd * w + hz * 0.25; a.y -= w * 0.42; tri(rib[i], rib[i + 1], a.clone(), FROND, sh * (0.85 + t * 0.3)); }); }
      }
    };
    const banana = (x, z, H) => {
      const y0 = groundH(x, z), base = new THREE.Vector3(x, y0 - 0.1, z), top = new THREE.Vector3(x + rr(-0.12, 0.12), y0 + H, z + rr(-0.12, 0.12)); limb(base, top, 0.15, 0.09, STEM);
      for (let f = 0; f < 6; f++) {
        const az = f / 6 * 6.283 + rr(-0.4, 0.4), el = rr(0.55, 1.2), Lf = rr(1.7, 2.5), hx = Math.cos(az), hz = Math.sin(az), sdx = -hz, sdz = hx, rib = [], sh = rr(0.8, 1.15);
        for (let i = 0; i <= 5; i++) { const t = i / 5; rib.push(new THREE.Vector3(top.x + hx * Lf * t * Math.cos(el * (1 - t * 0.7)), top.y - 0.15 + Lf * (Math.sin(el) * t - 0.62 * t * t), top.z + hz * Lf * t * Math.cos(el * (1 - t * 0.7)))); }
        const wd = t => 0.05 + 0.36 * Math.pow(Math.sin(Math.PI * Math.min(1, 0.12 + t * 0.9)), 0.6);
        for (let i = 0; i < 5; i++) { const w0 = wd(i / 5), w1 = wd((i + 1) / 5); [-1, 1].forEach(sd => { a.copy(rib[i]); a.x += sdx * sd * w0; a.z += sdz * sd * w0; a.y -= 0.07; b.copy(rib[i + 1]); b.x += sdx * sd * w1; b.z += sdz * sd * w1; b.y -= 0.07;
          tri(rib[i], rib[i + 1], b.clone(), BAN, sh); tri(rib[i], b.clone(), a.clone(), BAN, sh * 0.92); }); }
      }
    };
    [[PLC + 31.5, BZ + sz(4.0), 9.5, 1.6, 0.6], [PLC + 34.8, BZ + sz(6.4), 8.2, 1.2, 2.4], [B.x0 + 9, BZ, 9.0, 1.4, 3.6]].forEach(p => { coconut(...p); blob(4.5, p[0], groundH(p[0], p[1]) + 0.05, p[1]); });
    [[PLC - 21.3, BZ + sz(5.2)], [PLC + 27.4, BZ + sz(6.0)], [PLC - 29.6, BZ + sz(6.4)]].forEach(([x, z]) => { for (let i = 0; i < 3; i++) banana(x + rr(-0.7, 0.7), z + rr(-0.7, 0.7), rr(1.5, 2.3)); blob(3.6, x, groundH(x, z) + 0.05, z); });
    const g = keep(new THREE.BufferGeometry()); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(K, 3));
    const m = new THREE.Mesh(g, keep(new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 1, metalness: 0, envMapIntensity: 0.45 }))); m.castShadow = m.receiveShadow = true; scene.add(m);
  }
  // กอหญ้าริมทาง (แผ่นไขว้ 3 แผ่น) ระดับคุณภาพคุมจำนวนด้วย inst.count
  let tuftInst = null;
  {
    const p = [], n = [], u = [], k = [];
    for (let j = 0; j < 3; j++) { const a = j * Math.PI / 3 + 0.2, c = Math.cos(a) * 0.5, s = Math.sin(a) * 0.5;
      [[-1, 0, 0, 0], [1, 0, 1, 0], [1, 1, 1, 1], [-1, 0, 0, 0], [1, 1, 1, 1], [-1, 1, 0, 1]].forEach(([e, y, uu, vv]) => { p.push(e * c, y, e * s); n.push(e * c * 0.25, 1, e * s * 0.25); u.push(uu, 1 - vv); const q = 0.5 + 0.5 * y; k.push(q, q, q); }); }
    const g = keep(new THREE.BufferGeometry()); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(u, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(k, 3));
    const spots = []; let guard = 0;
    const plZ = realPlat ? [Math.min(realPlat.z, BZ + sz(9)), Math.max(realPlat.z, BZ + sz(9))] : null;
    while (spots.length < 1600 && guard++ < 200000) {   // กระจายเป็นกลุ่มตามหย่อมหญ้าสูง ริมทาง และชายดิน (ใกล้ก่อนไกล)
      const nearP = spots.length < 1100, x = nearP ? rr(B.x0 - 80, B.x1 + 80) : rr(-200, 200), z = nearP ? rr(-42, 42) : rr(-90, 90), dS = soilDist(x, z);
      const [ca, cb] = corrAt(x);
      if (dS < 0.15 || (z > ca - 2.6 && z < cb + 2.6)) continue;
      if (plZ && x > PLX0 - 2 && x < PLX1 + 2 && z > plZ[0] - 1 && z < plZ[1] + 1) continue;
      const f = field(x, z); if (f[0] > 0.35) continue;
      const pr = Math.max(dS < 2.0 ? 0.7 : 0, f[1] * f[1] * 0.95, f[0] > 0.05 ? 0.5 : 0, 0.02); if (rnd() > pr) continue;
      spots.push([x, z, f[1]]);
    }
    const inst = new THREE.InstancedMesh(g, foliageMat(tuftTex, { alphaTest: 0.35, vertexColors: true }), Math.max(1, spots.length)), d = new THREE.Object3D(), col = new THREE.Color();
    spots.forEach(([x, z, t], i) => { const s = rr(0.55, 1.2) * (0.8 + t * 0.7); d.position.set(x, groundH(x, z) - 0.03, z); d.rotation.set(0, rnd() * 6.28, 0); d.scale.set(s * 0.95, s * rr(0.45, 0.95), s * 0.95); d.updateMatrix(); inst.setMatrixAt(i, d.matrix);
      const v = rr(0.5, 0.85) * (1 - t * 0.25); inst.setColorAt(i, col.setRGB(v * rr(0.8, 1.15), v, v * 0.42)); });
    inst.receiveShadow = true; inst.frustumCulled = false; scene.add(inst); tuftInst = inst; tuftInst.userData.max = spots.length;
  }

  const allBlobs = new THREE.InstancedMesh(planeY, blobMat, blobList.length + treeInst.reduce((n, t) => n + t.list.length, 0));
  allBlobs.renderOrder = 2; allBlobs.frustumCulled = false; scene.add(allBlobs);
  function fillBlobs() {
    const d = new THREE.Object3D(); let i = 0;
    const put = ([s_, x, y, z]) => { d.position.set(x, y, z); d.scale.set(s_, 1, s_); d.updateMatrix(); allBlobs.setMatrixAt(i++, d.matrix); };
    blobList.forEach(put); for (const t of treeInst) for (let k = 0; k < t.inst.count; k++) put(t.blobs[k]);
    allBlobs.count = i; allBlobs.instanceMatrix.needsUpdate = true;
  }

  /* ================= ระดับคุณภาพ ================= */
  let shadowDirty = true, frameNo = 0;
  function applyTier() {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, tier.ratio));
    const shadows = tier.shadow > 0;
    if (sun.castShadow !== shadows) { sun.castShadow = shadows; scene.traverse(o => { if (o.material) [].concat(o.material).forEach(m => { m.needsUpdate = true; }); }); }
    if (shadows && sun.shadow.mapSize.x !== tier.shadow) { sun.shadow.mapSize.set(tier.shadow, tier.shadow); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
    tuftInst.count = Math.min(tuftInst.userData.max, tier.tufts); tuftInst.visible = tuftInst.count > 0;
    stoneInst.count = Math.min(stoneInst.userData.max, tier.stones || 0); stoneInst.visible = stoneInst.count > 0;
    for (const t of treeInst) {
      const lim = t.v === 5 ? tier.far : t.v === 4 ? tier.bushes : Math.round(tier.near * t.list.length / Math.max(1, treeInst.filter(o => o.v < 4).reduce((s, o) => s + o.list.length, 0)) * 1.0 + 4);
      t.inst.count = Math.min(t.list.length, Math.max(0, lim));
    }
    fillBlobs();
    for (const s of sleeperSets) s.inst.visible = s.mode === 'all' ? !tier.fasteners : tier.fasteners;
    shadowDirty = true;
  }
  applyTier();

  /* ================= กล้อง ================= */
  const camera = new THREE.PerspectiveCamera(32, 16 / 9, 0.5, 2600);
  const cam = { tx: (B.x0 + B.x1) / 2, tz: (B.z0 + B.z1) / 2 + PS * 2, dist: 120, el: 0.3, az: 0.14 * camSide, fitDist: 120, minDist: 25 };
  // มุมมาตรฐานเห็นทั้งย่านสถานี ตั้งแต่เสาเข้าซ้ายสุดถึงขวาสุด (ขบวนที่รอหน้าเสาเข้าอยู่ในจอ) ซูมเข้าดูใกล้ได้ถึง 25 ม.
  const FX0 = B.x0 - 10, FX1 = B.x1 + 10;
  const fitCamera = () => {
    const span = (FX1 - FX0), hTan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect;
    cam.fitDist = Math.max(40, Math.min(300, (span / 2) / hTan * 1.02 + 6));
  };
  // จอสูง (ไอแพด คอม) มุมก้มต่ำลงและเล็งต่ำกว่ากลางสถานี ไม่ให้เห็นแต่พื้นหญ้าด้านหน้า
  const elFor = () => (camera.aspect >= 2.2 ? 0.3 : camera.aspect >= 1.7 ? 0.25 : 0.21);
  // กล้องอิสระ (WP10): หมุนรอบจุดเล็ง เอียงขึ้นลง ซูม เลื่อน — จำกัดไม่ให้มุดดิน ไม่ออกไกลจนหลง และไม่หมุนอ้อมไปฝั่งตรงข้าม (ซ้ายขวาจะกลับกับแผงผังเส้น)
  const EL_MIN = 0.07, EL_MAX = 1.35, AZ_MAX = 1.1;
  const home = { tx: 0, tz: 0, el: 0, az: 0, dist: 0 };
  const reset = () => { fitCamera(); cam.el = elFor(); cam.az = 0.14 * camSide; cam.tx = (B.x0 + B.x1) / 2; cam.tz = (B.z0 + B.z1) / 2 + PS * 2; cam.dist = cam.fitDist; Object.assign(home, { tx: cam.tx, tz: cam.tz, el: cam.el, az: cam.az, dist: cam.dist }); };
  function placeCamera() {
    const a = cam.az, el = cam.el, r = cam.dist;
    const x = cam.tx + Math.sin(a) * Math.cos(el) * r, z = cam.tz + camSide * Math.cos(a) * Math.cos(el) * r;
    camera.position.set(x, Math.max(1.5 + Math.sin(el) * r, groundH(x, z) + 2.5), z);   // ไม่ต่ำกว่าพื้นเนินใต้กล้อง
    camera.lookAt(cam.tx, 1.5, cam.tz);
  }
  const clampT = () => { cam.tx = Math.max(B.x0 - 20, Math.min(B.x1 + 20, cam.tx)); cam.tz = Math.max(B.z0 - 25, Math.min(B.z1 + 25, cam.tz)); };
  const camApi = {
    pan(dxPx, dyPx, hPx) {                         // ลากบนจอ: ฉากเลื่อนตามนิ้ว ตามแกนของจอที่หมุนอยู่
      const k = 2 * cam.dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / Math.max(1, hPx);
      const rx = camSide * Math.cos(cam.az), rz = -Math.sin(cam.az), fx = -Math.sin(cam.az), fz = -camSide * Math.cos(cam.az), f = dyPx * k / Math.max(0.3, Math.sin(cam.el));
      cam.tx += -dxPx * k * rx + f * fx; cam.tz += -dxPx * k * rz + f * fz; clampT();
    },
    orbit(dxPx, dyPx, hPx) {                       // ลากนิ้วเดียว: หมุนรอบจุดเล็ง (ลากเต็มความสูงจอ ≈ 115°)
      const k = 2 / Math.max(1, hPx);
      cam.az = Math.max(-AZ_MAX, Math.min(AZ_MAX, cam.az - camSide * dxPx * k));
      cam.el = Math.max(EL_MIN, Math.min(EL_MAX, cam.el + dyPx * k * 0.6));
    },
    zoom(f) { cam.dist = Math.max(cam.minDist, Math.min(cam.fitDist * 1.25, cam.dist * f)); },
    focus(x, z, dist, az) { cam.tx = x; cam.tz = z; cam.dist = Math.max(cam.minDist, dist); if (az !== undefined) cam.az = az; },   // ใช้ในเทสต์และภาพตรวจ
    reset,
    get state() { return { ...cam }; },
    get zoomed() { return Math.abs(cam.dist - home.dist) > 1 || Math.hypot(cam.tx - home.tx, cam.tz - home.tz) > 1 || Math.abs(cam.az - home.az) > 0.02 || Math.abs(cam.el - home.el) > 0.02; },
  };

  /* ================= ธีม (โหมดมืดเป็นพลบค่ำแบบง่าย: ค่าจาก CSS variable) ================= */
  function setColors(c) {
    Object.assign(colors, c);
    const exp = parseFloat(colors['--scene-exposure']) || 0.96, fogK = parseFloat(colors['--scene-fog']) || 0.86, sunK = parseFloat(colors['--scene-sun']) || 1, envK = parseFloat(colors['--scene-env']) || 1;
    renderer.toneMappingExposure = exp; sun.intensity = 2.5 * sunK; scene.environmentIntensity = envK; scene.backgroundIntensity = envK;
    scene.fog.color.copy(displayColor(HORIZON.clone().multiplyScalar(fogK)));   // ค่าดิบ = สีบนจอก่อนเข้ารหัส sRGB (หมอกผสมหลังแปลงสี)
    const tint = colors['--scene-tint']; if (tint) scene.fog.color.lerp(new THREE.Color(tint), 0.35);
    stripCol = { route: new THREE.Color(colors['--route'] || '#2FA872'), occ: new THREE.Color(colors['--occ'] || '#E9525A') };
    for (const k in strips) strips[k].state = '__';
    Object.values(plates).forEach(paintPlate);
    for (const k in bodies) paintBand(bodies[k].userData.type, bodies[k].userData.n, bodies[k].attributes.color);
    const glow = exp < 0.7;                        // พลบค่ำ: ไฟหน้าต่างและโคมชานชาลาเรือง (ชื่อห้ามซ้ำ dusk() ด้านนอกที่เรียกไว้ด้านบน)
    M.lampOff.emissive.set(glow ? 0xffd27a : 0x000000); M.lampOff.emissiveIntensity = glow ? 1.6 : 0;
    M.glass.emissive.set(glow ? 0x3a2a12 : 0x000000);
    shadowDirty = true;
  }
  setColors({});
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { paintSign(); Object.values(plates).forEach(paintPlate); });

  /* ================= สถานะเกม → ฉาก ================= */
  let lastStates = '';
  function update(game, dt) {
    for (const k in game.P) setPoint(k, game.P[k].pos);
    for (const k in game.S) setSignal(k, game.S[k].aspect);
    for (const k in signals) {                    // แขนหางปลาค่อย ๆ ยก/ลด
      const o = signals[k]; if (o.kind !== 'sema' || Math.abs(o.want - o.angle) < 1e-3) continue;
      o.angle += (o.want - o.angle) * Math.min(1, dt * 6); if (Math.abs(o.want - o.angle) < 1e-3) o.angle = o.want; o.pivot.rotation.z = o.angle; shadowDirty = true;
    }
    const st = []; for (const id in strips) { const s = trackState(game, id); setStrip(id, s); st.push(strips[id].state); }
    const key = st.join(); if (key !== lastStates) lastStates = key;
    setTrains(game, dt);
    if (trains.size) shadowDirty = true;
  }
  // trackState แบบเบา (ไม่ import sim ทั้งก้อนเข้ามาในไฟล์วาด): ใช้ข้อมูลเดียวกับ sim/view.js
  const trackState = (game, id) => ({ locked: game.lockOf[id] ? 1 : null, overlap: game.ovlOf[id] ? 1 : null, occupied: game.trains.some(t => t.trail.some(q => L.E[q.e] && L.E[q.e].track === id)) });

  function render() {
    placeCamera();
    frameNo++;
    if (sun.castShadow) {
      const every = tier.shadowEvery || 1;
      if ((shadowDirty && frameNo % every === 0) || !sun.shadow.map) { renderer.shadowMap.needsUpdate = true; shadowDirty = false; }
    }
    renderer.render(scene, camera);
  }
  function resize(w, h) {
    if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    // อยู่มุมมาตรฐาน = จัดมุมใหม่ให้พอดีจอ, ผู้เล่นหมุน/ซูมไว้ = คงมุมของผู้เล่น แค่ไม่ให้ไกลเกินขอบใหม่
    const atHome = !camApi.zoomed; fitCamera();
    if (atHome) reset(); else { home.dist = cam.fitDist; home.el = elFor(); cam.dist = Math.min(cam.dist, cam.fitDist * 1.25); }
  }
  const _p = new THREE.Vector3();
  function project(v, w, h) {
    _p.set(v[0], v[1], v[2]).project(camera);
    return { x: (_p.x + 1) / 2 * w, y: (1 - _p.y) / 2 * h, on: _p.z < 1 && _p.z > -1 };
  }
  // จุดที่แตะได้ในฉาก: เสา (หัวเสา) ประแจ (คันกลับประแจ) ทางจอด (กลางชานชาลา/ทาง) ขา และราง (ยุคเลือกปลายทาง)
  function anchors() {
    const out = [];
    for (const k in signals) { const a = signals[k].anchor, s = W.signals[k]; out.push({ target: { kind: 'signal', id: k }, label: s.label, pos: [a.x, a.y, a.z], base: [s.x, 0.4, s.z] }); }
    for (const k in points) { const a = points[k].anchor; out.push({ target: { kind: 'point', id: k }, label: k, pos: [a.x, a.y, a.z], base: [a.x, 0.4, a.z] }); }
    for (const p of W.platforms) out.push({ target: { kind: 'platform', no: p.no }, label: `ทาง ${p.no}`, pos: [(p.x0 + p.x1) / 2, 1.2, p.z], base: [(p.x0 + p.x1) / 2, 0.4, p.z], wide: true });
    for (const k in L.portals) { const pt = L.portals[k], t = W.tracks[pt.track]; if (!t) continue; const x = pt.side === 'E' ? Math.min(t.x1, B.x1 + 14) : Math.max(t.x0, B.x0 - 14); out.push({ target: { kind: 'portal', id: k }, label: pt.label, pos: [x, 1.2, t.zAt(x)], base: [x, 0.4, t.zAt(x)], portal: true }); }
    for (const id in W.tracks) { const t = W.tracks[id], x = (t.x0 + t.x1) / 2; out.push({ target: { kind: 'track', id }, label: id, pos: [x, 0.8, t.zAt(x)], base: [x, 0.4, t.zAt(x)], track: true }); }
    return out;
  }
  function stats(detail) {
    const i = renderer.info.render, out = { calls: i.calls, tris: i.triangles, tier: tier.id, dist: cam.dist };
    if (detail) {                                   // รายการ mesh ที่กินสามเหลี่ยมมากสุด (ใช้ตอนปรับงบ)
      const list = []; scene.traverseVisible(o => { if (!o.isMesh) return; const g = o.geometry, n = (g.index ? g.index.count : g.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1); list.push([o.material.type + (o.isInstancedMesh ? '×' + o.count : ''), Math.round(n)]); });
      out.top = list.sort((a, b) => b[1] - a[1]).slice(0, 14); out.meshes = list.length;
      const cast = []; scene.traverseVisible(o => { if (o.isMesh && o.castShadow) cast.push(o.parent && o.parent !== scene ? (o.parent.userData.kind || 'group') : o.material.type); }); out.casters = cast.reduce((m, k) => ((m[k] = (m[k] || 0) + 1), m), {});
      out.lamps = lampCount; out.trains = trainCount; out.cars = [...pools.entries()].filter(([k]) => k[0] === 'b').reduce((n, [, p]) => n + p.count, 0);
    }
    return out;
  }
  function setTier(id) { tier = tierOf(id); applyTier(); }
  function dispose() {
    for (const o of disposables) { try { o.dispose(); } catch { /* ไม่เป็นไร */ } }
    renderer.dispose(); renderer.forceContextLoss && renderer.forceContextLoss();
  }
  reset();
  return { update, render, resize, project, anchors, camera: camApi, setTier, setColors, stats, dispose, get tier() { return tier.id; } };
}
