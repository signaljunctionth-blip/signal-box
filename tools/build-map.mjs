#!/usr/bin/env node
// สร้าง data/thailand-map.json (แผนที่ประเทศไทยของโหมดอาชีพ)
// รันตอนพัฒนาเท่านั้น: node tools/build-map.mjs
// - เส้นขอบประเทศ/จังหวัด: Natural Earth 1:10m (สาธารณสมบัติ)
// - ทางรถไฟและสถานี: OpenStreetMap ผ่าน Overpass API (ODbL 1.0)
// ไฟล์ดิบเก็บใน data/raw/ พร้อมวันที่ ถ้ามีไฟล์ดิบแล้วจะไม่ดึงซ้ำ (ลบไฟล์ดิบเองถ้าต้องการข้อมูลใหม่)
// ไม่มี dependency นอกจาก Node 18+ (ใช้ fetch ในตัว)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW = path.join(ROOT, 'data', 'raw');
const OUT = path.join(ROOT, 'data', 'thailand-map.json');
const NAMTOK_RAW = path.join(RAW, 'osm-2026-10-11-namtok-line.json');
const NAMTOK_RELATION = 13327676; // relation "สายกาญจนบุรี" (ดู data/sources.md)

const USER_AGENT = 'signal-junction/0.3 build-map (educational railway signalling web game, Signal Junction TH; one-off dev-time fetch)';
const NE_REF = 'v5.1.2'; // tag ของ repo nvkelso/natural-earth-vector
const NE_BASE = `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${NE_REF}/geojson/`;
// ใช้เฉพาะ overpass-api.de (ตรวจเงื่อนไขการใช้แล้ว ดู data/sources.md) ลองได้ไม่เกิน 3 ครั้ง เว้น 30 วินาที
// ยังไม่ใช้ mirror อื่นจนกว่าจะตรวจนโยบายของ mirror นั้น
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass-api.de/api/interpreter',
];
// คำขอเดียว: ทางรถไฟที่ไม่ใช่ทางในย่าน (ไม่มีแท็ก service) + relation สายที่ทางเหล่านั้นสังกัด + สถานี/ที่หยุดรถ
// ห้ามใช้ out meta (ดู data/README.md)
const OVERPASS_QUERY = `[out:json][timeout:180];
area["ISO3166-1"="TH"][admin_level=2]->.th;
way["railway"="rail"][!"service"](area.th)->.w;
.w out geom;
rel(bw.w)["route"~"^(railway|tracks)$"];
out body;
node["railway"~"^(station|halt)$"](area.th);
out body;`;
const BIG = 5 * 1024 * 1024; // เกินนี้ตั้งชื่อ *.big.json (ไม่เข้า repo ตาม .gitignore)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const today = () => new Date().toISOString().slice(0, 10);
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const rel = (f) => path.relative(ROOT, f);

function findRaw(re) {
  const hits = fs.readdirSync(RAW).filter((n) => re.test(n)).sort();
  return hits.length ? path.join(RAW, hits[hits.length - 1]) : null;
}
const dateOf = (file) => path.basename(file).match(/\d{4}-\d{2}-\d{2}/)[0];

// ---------- ดึงข้อมูล (มี cache) ----------

async function getNaturalEarth(kind, layer, keep) {
  const cached = findRaw(new RegExp(`^ne-\\d{4}-\\d{2}-\\d{2}-${kind}-th\\.geojson$`));
  if (cached) return cached;
  const url = `${NE_BASE}${layer}.geojson`;
  console.log(`ดาวน์โหลด Natural Earth ${layer} (ไฟล์ทั้งโลก เก็บเฉพาะ TH) ...`);
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`Natural Earth ${layer}: HTTP ${res.status}`);
  const world = await res.json();
  const features = world.features.filter(keep);
  if (!features.length) throw new Error(`Natural Earth ${layer}: ไม่พบ feature ของประเทศไทย`);
  const file = path.join(RAW, `ne-${today()}-${kind}-th.geojson`);
  fs.writeFileSync(file, JSON.stringify({
    type: 'FeatureCollection',
    name: `${layer} (filtered: Thailand only)`,
    source: url,
    license: 'Natural Earth, public domain (https://www.naturalearthdata.com/about/terms-of-use/)',
    fetched: today(),
    features,
  }));
  console.log(`  -> ${rel(file)} (${features.length} feature)`);
  return file;
}

async function getOverpassRail() {
  const cached = findRaw(/^osm-\d{4}-\d{2}-\d{2}-thailand-rail(\.big)?\.json$/);
  if (cached) return cached;
  let lastErr;
  for (let i = 0; i < OVERPASS_ENDPOINTS.length; i++) {
    if (i > 0) { console.log('  รอ 30 วินาทีก่อนลองใหม่'); await sleep(30000); }
    const ep = OVERPASS_ENDPOINTS[i];
    console.log(`Overpass (${ep}) ครั้งที่ ${i + 1} ...`);
    try {
      const res = await fetch(ep, {
        method: 'POST',
        headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(OVERPASS_QUERY),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const json = JSON.parse(text);
      if (json.remark) throw new Error(`Overpass remark: ${json.remark}`);
      if (!json.elements?.some((e) => e.type === 'way')) throw new Error('ไม่มี way ในผลลัพธ์');
      const big = Buffer.byteLength(text) > BIG;
      const file = path.join(RAW, `osm-${today()}-thailand-rail${big ? '.big' : ''}.json`);
      fs.writeFileSync(file, text);
      console.log(`  -> ${rel(file)} (${(Buffer.byteLength(text) / 1e6).toFixed(1)} MB)`);
      return file;
    } catch (e) { lastErr = e; console.log(`  ล้มเหลว: ${e.message}`); }
  }
  throw new Error(`Overpass ล้มเหลวทุกครั้ง: ${lastErr?.message}`);
}

// ---------- เรขาคณิต ----------
// จุดทุกจุดในสคริปต์เป็น [lon, lat] องศา คิดระยะบนระนาบท้องถิ่น (เมตร) พอสำหรับประเทศไทย

const M_LAT = 110574;
const mLon = (lat) => 111320 * Math.cos((lat * Math.PI) / 180);
const dist = (a, b) => Math.hypot((b[0] - a[0]) * mLon((a[1] + b[1]) / 2), (b[1] - a[1]) * M_LAT);
const lengthOf = (pts) => { let s = 0; for (let i = 1; i < pts.length; i++) s += dist(pts[i - 1], pts[i]); return s; };
const round = (pts, dp) => {
  const out = [];
  for (const p of pts) {
    const q = [+p[0].toFixed(dp), +p[1].toFixed(dp)];
    const l = out[out.length - 1];
    if (!l || l[0] !== q[0] || l[1] !== q[1]) out.push(q);
  }
  return out;
};

// ระยะจากจุด p ถึงส่วนของเส้น a-b (เมตร) และสัดส่วน t ตามส่วนของเส้น
function segDist(p, a, b) {
  const k = mLon(p[1]);
  const ax = (a[0] - p[0]) * k, ay = (a[1] - p[1]) * M_LAT;
  const bx = (b[0] - p[0]) * k, by = (b[1] - p[1]) * M_LAT;
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0;
  return { d: Math.hypot(ax + t * dx, ay + t * dy), t };
}

// ฉายจุดลงบนเส้น: คืนระยะห่าง (เมตร) และระยะตามแนวเส้นจากจุดแรก (เมตร)
function project(p, pts) {
  let best = { d: Infinity, along: 0 }, acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const l = dist(pts[i - 1], pts[i]);
    const s = segDist(p, pts[i - 1], pts[i]);
    if (s.d < best.d) best = { d: s.d, along: acc + s.t * l };
    acc += l;
  }
  return best;
}

// Douglas–Peucker (ไม่เรียกซ้ำ กัน stack ล้นกับเส้นยาว) tol เป็นเมตร
function simplify(pts, tol) {
  if (pts.length < 3) return pts.slice();
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop();
    let max = 0, at = -1;
    for (let k = i + 1; k < j; k++) {
      const d = segDist(pts[k], pts[i], pts[j]).d;
      if (d > max) { max = d; at = k; }
    }
    if (at > 0 && max > tol) { keep[at] = 1; stack.push([i, at], [at, j]); }
  }
  return pts.filter((_, k) => keep[k]);
}

// วงปิด: ตัดเป็นสองครึ่งที่จุดไกลสุดจากจุดแรก แล้วลดรายละเอียดทีละครึ่ง
function simplifyRing(ring, tol) {
  const pts = ring.slice(0, -1);
  let far = 0, max = 0;
  pts.forEach((p, i) => { const d = dist(pts[0], p); if (d > max) { max = d; far = i; } });
  const a = simplify(pts.slice(0, far + 1), tol);
  const b = simplify([...pts.slice(far), pts[0]], tol);
  return [...a, ...b.slice(1)];
}

function ringAreaKm2(ring) {
  let s = 0;
  const k = mLon(ring[0][1]);
  for (let i = 1; i < ring.length; i++) s += (ring[i - 1][0] * ring[i][1] - ring[i][0] * ring[i - 1][1]) * k * M_LAT;
  return Math.abs(s) / 2e6;
}

// ---------- เส้นขอบ (Natural Earth) ----------

const BORDER_TOL = 300; // เมตร
const MIN_ISLAND_KM2 = 20;
const polysOf = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates);

function buildCountry(file) {
  const fc = readJson(file);
  const bbox = [Infinity, Infinity, -Infinity, -Infinity];
  const polygons = [];
  let rawPts = 0, dropped = 0;
  for (const f of fc.features) for (const poly of polysOf(f.geometry)) {
    for (const p of poly[0]) {
      bbox[0] = Math.min(bbox[0], p[0]); bbox[1] = Math.min(bbox[1], p[1]);
      bbox[2] = Math.max(bbox[2], p[0]); bbox[3] = Math.max(bbox[3], p[1]);
    }
    rawPts += poly[0].length;
    if (poly.length > 1) console.log('  หมายเหตุ: polygon มีรูด้านใน (ไม่ได้เก็บ)');
    if (ringAreaKm2(poly[0]) < MIN_ISLAND_KM2) { dropped++; continue; }
    const ring = round(simplifyRing(poly[0], BORDER_TOL), 4);
    if (ring.length >= 4) { ring.push(ring[0]); polygons.push(ring); } else dropped++;
  }
  polygons.sort((a, b) => b.length - a.length);
  return {
    polygons,
    bbox: [Math.floor(bbox[0] * 100) / 100, Math.floor(bbox[1] * 100) / 100, Math.ceil(bbox[2] * 100) / 100, Math.ceil(bbox[3] * 100) / 100],
    stats: { rawPts, dropped },
  };
}

// เส้นแบ่งจังหวัด: เก็บเฉพาะส่วนของเส้นที่จังหวัดสองจังหวัดใช้ร่วมกัน (ไม่ซ้ำกับเส้นขอบประเทศ)
// ต่อเป็นเส้นยาวระหว่าง "จุดสามแพร่ง" แล้วค่อยลดรายละเอียด เส้นจึงไม่ซ้อนหรือแยกจากกัน
function buildProvinces(file) {
  const fc = readJson(file);
  const key = (p) => p[0].toFixed(6) + ',' + p[1].toFixed(6);
  const seg = new Map(); // "a|b" -> { a, b, owners:Set }
  fc.features.forEach((f, fi) => {
    for (const poly of polysOf(f.geometry)) for (const ring of poly) for (let i = 1; i < ring.length; i++) {
      const ka = key(ring[i - 1]), kb = key(ring[i]);
      if (ka === kb) continue;
      const k = ka < kb ? ka + '|' + kb : kb + '|' + ka;
      if (!seg.has(k)) seg.set(k, { a: ring[i - 1], b: ring[i], owners: new Set() });
      seg.get(k).owners.add(fi);
    }
  });
  const adj = new Map(); // node -> [{ to, pair, seg }]
  const shared = [];
  for (const s of seg.values()) {
    if (s.owners.size !== 2) continue;
    s.pair = [...s.owners].sort((x, y) => x - y).join('-');
    shared.push(s);
    for (const [from, to] of [[s.a, s.b], [s.b, s.a]]) {
      const k = key(from);
      if (!adj.has(k)) adj.set(k, []);
      adj.get(k).push({ to, s });
    }
  }
  // จุดต่อ = จุดที่ไม่ได้มีเส้นร่วม 2 เส้นของคู่จังหวัดเดียวกันพอดี
  const isJoint = (k) => { const e = adj.get(k); return e.length !== 2 || e[0].s.pair !== e[1].s.pair; };
  const borders = [];
  const walk = (start, first) => {
    const pts = [start];
    let cur = start, edge = first;
    while (edge && !edge.s.used) {
      edge.s.used = true;
      pts.push(edge.to);
      cur = edge.to;
      const k = key(cur);
      if (isJoint(k)) break;
      edge = adj.get(k).find((e) => !e.s.used);
    }
    return pts;
  };
  for (const [k, edges] of adj) if (isJoint(k)) for (const e of edges) if (!e.s.used) borders.push(walk(e.s.a === e.to ? e.s.b : e.s.a, e));
  for (const s of shared) if (!s.used) borders.push(walk(s.a, adj.get(key(s.a)).find((e) => e.s === s))); // วงปิดที่ไม่มีจุดต่อ
  const out = borders.map((b) => round(simplify(b, BORDER_TOL), 4)).filter((b) => b.length >= 2);
  // ชื่อไทยใน Natural Earth (name_local) ผิดหลายจังหวัด จึงเก็บแค่รหัส ISO กับชื่ออังกฤษ
  const labels = fc.features.map((f) => ({
    iso: f.properties.iso_3166_2,
    name_en: f.properties.name,
    lon: +f.properties.longitude.toFixed(3),
    lat: +f.properties.latitude.toFixed(3),
  })).sort((a, b) => a.iso.localeCompare(b.iso));
  return { borders: out, labels, stats: { rawSegs: shared.length } };
}

// ---------- ทางรถไฟทั้งประเทศ (OSM) ----------

const LINE_ORDER = ['northeast', 'north', 'south', 'maeklong', 'east', 'west'];
const LINES = {
  northeast: { name_th: 'สายตะวันออกเฉียงเหนือ', short_th: 'อีสาน', name_en: 'Northeastern Line' },
  north: { name_th: 'สายเหนือ', short_th: 'เหนือ', name_en: 'Northern Line' },
  south: { name_th: 'สายใต้', short_th: 'ใต้', name_en: 'Southern Line' },
  maeklong: { name_th: 'สายแม่กลอง', short_th: 'แม่กลอง', name_en: 'Maeklong Line' },
  east: { name_th: 'สายตะวันออก', short_th: 'ตะวันออก', name_en: 'Eastern Line' },
  west: { name_th: 'สายตะวันตก', short_th: 'ตะวันตก', name_en: 'Western Line' },
};
// ป้ายสายมาจากแท็ก name ของ way และ relation route=railway ใน OSM เท่านั้น ชื่อที่ไม่อยู่ในตารางนี้ = ไม่ติดป้าย (line: null)
const NAME_TO_LINES = {
  'สายเหนือ': ['north'], 'ทางรถไฟสายเหนือ': ['north'], 'สายสวรรคโลก': ['north'], 'สายเลี่ยงเมืองลพบุรี': ['north'],
  'สายตะวันออกเฉียงเหนือ': ['northeast'], 'สายแก่งคอย - บัวใหญ่': ['northeast'],
  'ทางรถไฟสายเหนือ-ตะวันออกเฉียงเหนือ': ['north', 'northeast'], 'ทางรถไฟสายเหนือ/ตะวันออกเฉียงเหนือ': ['north', 'northeast'],
  'ทางรถไฟสายเหนือ/ตะวันออกฉียงเหนือ': ['north', 'northeast'], 'ทางรถไฟสายเหนือ/ตะวันออกเฉียงเหนือเดิม': ['north', 'northeast'],
  'สายใต้': ['south'], 'ทางรถไฟสายใต้': ['south'], 'สายใต้เดิม': ['south'], 'สายทางแยกกันตัง': ['south'],
  'สายนครศรีธรรมราช': ['south'], 'สายคีรีรัฐนิคม': ['south'], 'สายชุมทางหาดใหญ่–ปาดังเบซาร์': ['south'], 'Hat Yai-Padang Besar': ['south'],
  'ทางรถไฟสายตะวันออก': ['east'], 'ทางรถไฟสายชุมทางคลองสิบเก้า–ชุมทางแก่งคอย': ['east'], 'ทางรถไฟสายมาบตาพุด': ['east'],
  'ทางรถไฟสายแม่กลอง': ['maeklong'], 'ทางรถไฟสายมหาชัย': ['maeklong'],
  // สายตะวันตก: docs/STATIONS.md นับสายน้ำตก (OSM: สายกาญจนบุรี) และทางแยกสุพรรณบุรีเป็นสายนี้
  // ช่วงธนบุรี–หนองปลาดุกยังเป็น "south" ตามชื่อใน OSM จนกว่าเจจะยืนยันขอบเขตสายตะวันตก
  'สายกาญจนบุรี': ['west'], 'สายสุพรรณบุรี': ['west'],
};
const REL_TO_LINE = {
  1820650: 'north', 8425166: 'north', 21067324: 'north',
  1820651: 'northeast', 8425142: 'northeast', 13328007: 'northeast', 17458406: 'northeast',
  1820706: 'east',
  8342730: 'south', 8425164: 'south', 8425165: 'south', 8425163: 'south', 13195090: 'south', 13327778: 'south', 13327899: 'south',
  8425167: 'maeklong', 8425168: 'maeklong',
  13327648: 'west', 13327676: 'west',
};
// ยังไม่เปิดเดินรถ (ข่าว: ตั้งเป้าเปิดปี 2571 ดู data/sources.md) แต่ OSM แท็กเป็น railway=rail แล้ว
const REL_NOT_OPEN = new Set([13196611]);
const RAIL_TOL = 30; // เมตร
const MIN_CHAIN = 300; // เมตร: เส้นไม่มีป้ายสายที่สั้นกว่านี้และปลายข้างหนึ่งไม่ต่อกับทางอื่น ถือเป็นทางตันในย่าน ไม่ขึ้นแผนที่ประเทศ
const DUP_CELL = 0.0003; // องศา (~33 ม.): จุดที่อยู่ในช่องเดียวกันหรือช่องติดกันกับเส้นที่เก็บแล้ว ถือว่าซ้อน (รางคู่/ทางขนาน)
const DUP_STEP = 25; // เมตร: ระยะสุ่มจุดตามเส้น

function excludeReason(w, rels) {
  const t = w.tags || {};
  const name = t.name || '';
  if (/^รถไฟฟ้า/.test(name) || t.gauge === '1435' || t.network === 'ARL') return 'urban';
  if (t.construction || t['construction:railway']) return 'construction';
  if (rels.some((r) => REL_NOT_OPEN.has(r))) return 'not_open';
  return null;
}

function buildRail(file) {
  const raw = readJson(file);
  const relsOf = new Map();
  for (const r of raw.elements) if (r.type === 'relation') for (const m of r.members) if (m.type === 'way') {
    if (!relsOf.has(m.ref)) relsOf.set(m.ref, []);
    relsOf.get(m.ref).push(r.id);
  }
  const excluded = { urban: 0, construction: 0, not_open: 0 };
  const ways = [];
  for (const w of raw.elements) {
    if (w.type !== 'way') continue;
    const rels = relsOf.get(w.id) || [];
    const pts = w.geometry.map((g) => [g.lon, g.lat]);
    const why = excludeReason(w, rels);
    if (why) { excluded[why] += lengthOf(pts) / 1000; continue; }
    const set = new Set(NAME_TO_LINES[w.tags.name] || []);
    for (const r of rels) if (REL_TO_LINE[r]) set.add(REL_TO_LINE[r]);
    const lines = LINE_ORDER.filter((l) => set.has(l));
    const name = w.tags['name:th'] || w.tags.name || null;
    ways.push({ pts, lines, name, a: w.nodes[0], b: w.nodes[w.nodes.length - 1], nodes: w.nodes, key: lines.join('+'), len: lengthOf(pts) });
  }
  // ต่อ way เป็นเส้นยาว: ต่อได้เมื่อ node ปลายมี way มาชนกัน 2 เส้นพอดี ป้ายเหมือนกัน และไม่ใช่ node กลางของ way อื่น
  const ends = new Map(), interior = new Set();
  for (const w of ways) {
    for (const n of [w.a, w.b]) { if (!ends.has(n)) ends.set(n, []); ends.get(n).push(w); }
    for (let i = 1; i < w.nodes.length - 1; i++) interior.add(w.nodes[i]);
  }
  const partner = (w, n) => {
    const e = ends.get(n);
    if (e.length !== 2 || interior.has(n) || e[0] === e[1]) return null;
    const o = e[0] === w ? e[1] : e[0];
    return o.key === w.key ? o : null;
  };
  const chains = [];
  for (const w of ways) {
    if (w.used) continue;
    w.used = true;
    let pts = w.pts.slice(), head = w.a, tail = w.b;
    const names = new Map([[w.name, w.len]]);
    const note = (o) => names.set(o.name, (names.get(o.name) || 0) + o.len);
    for (let cur = w, o; (o = partner(cur, tail)) && !o.used; cur = o) {
      o.used = true; note(o);
      const fwd = o.a === tail;
      pts = pts.concat((fwd ? o.pts : o.pts.slice().reverse()).slice(1));
      tail = fwd ? o.b : o.a;
    }
    for (let cur = w, o; (o = partner(cur, head)) && !o.used; cur = o) {
      o.used = true; note(o);
      const fwd = o.b === head;
      pts = (fwd ? o.pts : o.pts.slice().reverse()).slice(0, -1).concat(pts);
      head = fwd ? o.a : o.b;
    }
    // ชื่อของเส้น = ชื่อ way ใน OSM ที่ยาวรวมมากที่สุดในเส้นนั้น
    const name = [...names].filter(([n]) => n).sort((x, y) => y[1] - x[1])[0]?.[0] || null;
    chains.push({ lines: w.lines, name, pts, len: lengthOf(pts), stub: [head, tail].some((n) => ends.get(n).length < 2 && !interior.has(n)) });
  }
  const stats = { ways: ways.length, wayKm: ways.reduce((s, w) => s + lengthOf(w.pts), 0) / 1000, chains: chains.length, excluded, short: 0, shortKm: 0, dup: 0, dupKm: 0 };
  // ตัดเส้นสั้น แล้วตัดเส้นที่ซ้อนกับเส้นที่เก็บไว้แล้ว (รางคู่) โดยเก็บเส้นที่มีป้ายและยาวกว่าไว้ก่อน
  const cell = (p) => [Math.floor(p[0] / DUP_CELL), Math.floor(p[1] / DUP_CELL)];
  const seen = new Set();
  const samples = (pts) => {
    const out = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const n = Math.ceil(dist(pts[i - 1], pts[i]) / DUP_STEP);
      for (let k = 1; k <= n; k++) out.push([pts[i - 1][0] + ((pts[i][0] - pts[i - 1][0]) * k) / n, pts[i - 1][1] + ((pts[i][1] - pts[i - 1][1]) * k) / n]);
    }
    return out;
  };
  chains.sort((x, y) => (y.lines.length > 0) - (x.lines.length > 0) || y.len - x.len);
  const kept = [];
  for (const c of chains) {
    if (!c.lines.length && c.stub && c.len < MIN_CHAIN) { stats.short++; stats.shortKm += c.len / 1000; continue; }
    const sm = samples(c.pts);
    let hit = 0;
    for (const p of sm) {
      const [cx, cy] = cell(p);
      search: for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) if (seen.has((cx + dx) + ':' + (cy + dy))) { hit++; break search; }
    }
    if (hit / sm.length > 0.9) { stats.dup++; stats.dupKm += c.len / 1000; continue; }
    for (const p of sm) { const [cx, cy] = cell(p); seen.add(cx + ':' + cy); }
    kept.push(c);
  }
  const order = (c) => (c.lines.length ? LINE_ORDER.indexOf(c.lines[0]) : 99);
  kept.sort((x, y) => order(x) - order(y) || y.len - x.len);
  const rail = kept.map((c) => {
    const o = { line: c.lines[0] || null };
    if (c.lines.length > 1) o.also = c.lines.slice(1);
    o.name = c.name;
    o.km = +(c.len / 1000).toFixed(1);
    o.pts = round(simplify(c.pts, RAIL_TOL), 4);
    return o;
  });
  stats.kept = rail.length;
  stats.keptKm = kept.reduce((s, c) => s + c.len, 0) / 1000;
  stats.nullKm = kept.filter((c) => !c.lines.length).reduce((s, c) => s + c.len, 0) / 1000;
  return { rail, stats, raw, timestamp: raw.osm3s?.timestamp_osm_base || null };
}

// ---------- สถานีอ้างอิงทั่วประเทศ (OSM) ----------

// ชื่อไทยตามแท็ก name:th/name ใน OSM ต้องตรงทั้งคำ (รายชื่อจาก docs/STATIONS.md และคำสั่งงาน)
const LANDMARKS = [
  'กรุงเทพอภิวัฒน์', 'กรุงเทพ', 'ธนบุรี', 'วงเวียนใหญ่', 'มหาชัย', 'บ้านแหลม', 'แม่กลอง',
  'ชุมทางบ้านภาชี', 'ลพบุรี', 'ปากน้ำโพ', 'นครสวรรค์', 'พิษณุโลก', 'ชุมทางบ้านดารา', 'เด่นชัย', 'นครลำปาง', 'เชียงใหม่',
  'ชุมทางแก่งคอย', 'มาบกะเบา', 'นครราชสีมา', 'ชุมทางถนนจิระ', 'ชุมทางบัวใหญ่', 'ขอนแก่น', 'อุดรธานี', 'หนองคาย', 'สุรินทร์', 'อุบลราชธานี',
  'ชุมทางตลิ่งชัน', 'นครปฐม', 'สุพรรณบุรี', 'ราชบุรี', 'เพชรบุรี', 'หัวหิน', 'ชุมพร', 'สุราษฎร์ธานี', 'ชุมทางทุ่งสง', 'นครศรีธรรมราช',
  'ชุมทางเขาชุมทอง', 'ตรัง', 'กันตัง', 'ชุมทางหาดใหญ่', 'ปาดังเบซาร์ (ไทย)', 'ยะลา', 'สุไหงโก-ลก',
  'ชุมทางฉะเชิงเทรา', 'ชุมทางคลองสิบเก้า', 'ชุมทางศรีราชา', 'พัทยา', 'อรัญประเทศ',
];
const NEAR_RAIL = 150; // เมตร

function buildLandmarks(raw, rail) {
  const nodes = raw.elements.filter((e) => e.type === 'node' && /^(station|halt)$/.test(e.tags?.railway || '') && !e.tags.station);
  const linesNear = (p) => {
    const set = new Set();
    let near = false;
    for (const r of rail) {
      if (project(p, r.pts).d > NEAR_RAIL) continue;
      near = true;
      if (r.line) set.add(r.line);
      for (const l of r.also || []) set.add(l);
    }
    return near ? LINE_ORDER.filter((l) => set.has(l)) : null;
  };
  const out = [], missing = [];
  for (const name of LANDMARKS) {
    const hits = nodes
      .filter((n) => (n.tags['name:th'] || n.tags.name) === name)
      .map((n) => ({ n, lines: linesNear([n.lon, n.lat]) }))
      .filter((h) => h.lines);
    if (hits.length !== 1) { missing.push(`${name} (พบ ${hits.length} จุดที่อยู่ติดแนวราง)`); continue; }
    const { n, lines } = hits[0];
    out.push({
      name_th: name,
      name_en: n.tags['name:en'] || null,
      kind: n.tags.railway,
      lon: +n.lon.toFixed(5),
      lat: +n.lat.toFixed(5),
      lines,
      osm: `https://www.openstreetmap.org/node/${n.id}`,
    });
  }
  return { landmarks: out, missing, stationNodes: nodes.length };
}

// ---------- สายน้ำตก (เส้นทางสอน) ----------

// ลำดับและขั้นตาม docs/STATIONS.md (เจยืนยันลำดับ 2026-10-11) id ใช้เป็นชื่อไฟล์ data/stations/<id>.json
const TUTORIAL = [
  { osm: 272303917, id: 'tha-kilen', order: 1, tier: 1 },
  { osm: 272304779, id: 'wang-pho', order: 2, tier: 2 },
  { osm: 5558367598, id: 'nam-tok', order: 3, tier: 2 },
  { osm: 528735648, id: 'kanchanaburi', order: 4, tier: 3 },
  { osm: 9207427072, id: 'nong-pla-duk-jn', order: 5, tier: 4 },
];
const NAMTOK_TOL = 3; // เมตร
const STATION_MAX_OFF = 50; // เมตร: สถานีที่ห่างแนวเส้นเกินนี้ถือว่าไม่ได้อยู่บนสายน้ำตก
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function buildNamtok(file) {
  const raw = readJson(file);
  const byId = new Map(raw.elements.map((e) => [e.type + e.id, e]));
  const relation = byId.get('relation' + NAMTOK_RELATION);
  if (!relation) throw new Error('ไม่พบ relation สายกาญจนบุรีในไฟล์ดิบ');
  // ทางประธานของ relation (ไม่เอาทางในย่าน) ต่อกันด้วย node id จากปลายฝั่งชุมทางหนองปลาดุก
  const ways = relation.members.filter((m) => m.type === 'way').map((m) => byId.get('way' + m.ref)).filter((w) => w && !w.tags.service);
  const ends = new Map();
  for (const w of ways) for (const n of [w.nodes[0], w.nodes[w.nodes.length - 1]]) { if (!ends.has(n)) ends.set(n, []); ends.get(n).push(w); }
  const npd = byId.get('node' + 9207427072);
  const tips = [...ends].filter(([, e]) => e.length === 1).map(([n, e]) => ({ n, w: e[0] }));
  if (tips.length !== 2) throw new Error(`แนวเส้นสายน้ำตกไม่ต่อเนื่อง (ปลายเปิด ${tips.length} จุด)`);
  const tipPt = (t) => { const g = t.w.geometry[t.w.nodes[0] === t.n ? 0 : t.w.geometry.length - 1]; return [g.lon, g.lat]; };
  tips.sort((x, y) => dist(tipPt(x), [npd.lon, npd.lat]) - dist(tipPt(y), [npd.lon, npd.lat]));
  const main = [], ext = [];
  let at = tips[0].n, w = tips[0].w;
  const done = new Set();
  while (w) {
    done.add(w);
    const fwd = w.nodes[0] === at;
    const g = (fwd ? w.geometry : w.geometry.slice().reverse()).map((p) => [p.lon, p.lat]);
    const target = w.tags.usage === 'tourism' ? ext : main; // usage=tourism = ช่วงน้ำตก–น้ำตกไทรโยคน้อย ไม่อยู่ในเกม
    if (target === main && ext.length) throw new Error('ลำดับ way ของสายน้ำตกไม่เป็นไปตามที่คาด');
    target.push(...(target.length ? g.slice(1) : g));
    at = fwd ? w.nodes[w.nodes.length - 1] : w.nodes[0];
    w = ends.get(at).find((o) => !done.has(o));
  }
  if (done.size !== ways.length) throw new Error('ต่อ way ของสายน้ำตกได้ไม่ครบ');
  if (ext.length) ext.unshift(main[main.length - 1]);
  const full = main.concat(ext.slice(1));
  const km0 = project([npd.lon, npd.lat], full).along;
  const tut = new Map(TUTORIAL.map((t) => [t.osm, t]));
  const mainLen = lengthOf(main);
  const stations = [];
  for (const n of raw.elements) {
    if (n.type !== 'node' || !/^(station|halt)$/.test(n.tags?.railway || '') || n.tags.station) continue;
    const pr = project([n.lon, n.lat], full);
    if (pr.d > STATION_MAX_OFF) continue;
    const t = tut.get(n.id);
    const s = {
      id: t ? t.id : slug(n.tags['name:en'] || ''),
      name_th: n.tags['name:th'] || n.tags.name,
      name_en: n.tags['name:en'] || null,
      kind: n.tags.railway,
      lon: +n.lon.toFixed(5),
      lat: +n.lat.toFixed(5),
      km: +((pr.along - km0) / 1000).toFixed(2),
      off_m: Math.round(pr.d),
      osm: `https://www.openstreetmap.org/node/${n.id}`,
    };
    if (t) { s.order = t.order; s.tier = t.tier; }
    if (pr.along > mainLen + 1) s.beyond_terminus = true;
    stations.push(s);
  }
  stations.sort((x, y) => x.km - y.km);
  const ids = stations.map((s) => s.id);
  if (ids.some((id) => !id) || new Set(ids).size !== ids.length) throw new Error('id สถานีสายน้ำตกว่างหรือซ้ำ: ' + ids.join(', '));
  for (const t of TUTORIAL) if (!stations.some((s) => s.id === t.id)) throw new Error(`สถานีเส้นทางสอน ${t.id} ไม่อยู่บนแนวเส้น`);
  return {
    path: round(simplify(main, NAMTOK_TOL), 5),
    extension: round(simplify(ext, NAMTOK_TOL), 5),
    stations,
    km0: km0 / 1000,
    mainKm: mainLen / 1000,
    extKm: lengthOf(ext) / 1000,
    rawPts: full.length,
    timestamp: raw.osm3s?.timestamp_osm_base || null,
  };
}

// ---------- ประกอบไฟล์ ----------

// JSON แบบอ่านง่าย: โครงย่อหน้า 1 ช่อง แต่เส้น (อาร์เรย์ของคู่พิกัด) และรายการสั้นอยู่บรรทัดเดียว
function stringify(v, ind = '') {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  const flat = JSON.stringify(v);
  const isPts = Array.isArray(v) && v.length && Array.isArray(v[0]) && typeof v[0][0] === 'number';
  if (isPts || (flat.length <= 110 && !/[[{].*[[{]/.test(flat.slice(1)))) return flat;
  const n = ind + ' ';
  if (Array.isArray(v)) return '[\n' + v.map((x) => n + stringify(x, n)).join(',\n') + '\n' + ind + ']';
  return '{\n' + Object.entries(v).map(([k, x]) => n + JSON.stringify(k) + ':' + stringify(x, n)).join(',\n') + '\n' + ind + '}';
}

const countPts = (lines) => lines.reduce((s, l) => s + l.length, 0);

async function main() {
  const neCountry = await getNaturalEarth('admin0', 'ne_10m_admin_0_countries', (f) => f.properties.ADM0_A3 === 'THA');
  const neProv = await getNaturalEarth('admin1', 'ne_10m_admin_1_states_provinces', (f) => f.properties.iso_a2 === 'TH');
  const hadRail = !!findRaw(/^osm-\d{4}-\d{2}-\d{2}-thailand-rail(\.big)?\.json$/);
  if (!hadRail) await sleep(5000);
  const osmRail = await getOverpassRail();

  const country = buildCountry(neCountry);
  const prov = buildProvinces(neProv);
  const R = buildRail(osmRail);
  const L = buildLandmarks(R.raw, R.rail);
  const N = buildNamtok(NAMTOK_RAW);

  const map = {
    schema: 1,
    generated_by: 'tools/build-map.mjs',
    coords: '[lon, lat] องศา WGS84',
    projection: 'equirectangular: x = (lon - bbox[0]) * cos(13°) * k, y = (bbox[3] - lat) * k',
    bbox: country.bbox,
    fetched: {
      natural_earth: dateOf(neCountry),
      natural_earth_version: NE_REF,
      osm_rail: R.timestamp,
      osm_namtok: N.timestamp,
    },
    credits: {
      osm: {
        text: 'ข้อมูลแผนที่ © ผู้ร่วมพัฒนา OpenStreetMap (ODbL)',
        url: 'https://www.openstreetmap.org/copyright',
        license: 'ODbL 1.0',
        license_url: 'https://opendatacommons.org/licenses/odbl/1-0/',
        covers: ['rail', 'landmarks', 'namtok'],
      },
      natural_earth: {
        text: 'เส้นขอบประเทศและจังหวัด: Natural Earth',
        url: 'https://www.naturalearthdata.com/',
        license: 'public domain',
        covers: ['country', 'provinces'],
      },
    },
    country: { polygons: country.polygons },
    provinces: { borders: prov.borders, labels: prov.labels },
    lines: LINES,
    rail: R.rail,
    landmarks: L.landmarks,
    namtok: {
      line: 'west',
      name_th: 'สายน้ำตก',
      name_en: 'Nam Tok Line',
      osm: `https://www.openstreetmap.org/relation/${NAMTOK_RELATION}`,
      km_note: 'km วัดตามแนวเส้นใน OSM นับจากหมุดสถานีชุมทางหนองปลาดุก ไม่ใช่หลัก กม. ทางการ',
      tutorial_route: TUTORIAL.map((t) => t.id),
      path: N.path,
      extension: N.extension,
      stations: N.stations,
    },
  };
  const text = stringify(map) + '\n';
  JSON.parse(text);
  fs.writeFileSync(OUT, text);

  // ---------- ตรวจผล ----------
  const bytes = Buffer.byteLength(text);
  const [x0, y0, x1, y1] = map.bbox;
  const all = [...map.country.polygons, ...map.provinces.borders, ...map.rail.map((r) => r.pts), map.namtok.path, map.namtok.extension].flat()
    .concat(map.landmarks.map((s) => [s.lon, s.lat]), map.namtok.stations.map((s) => [s.lon, s.lat]));
  const outside = all.filter((p) => p[0] < x0 || p[0] > x1 || p[1] < y0 || p[1] > y1).length;
  const byLine = {};
  for (const r of map.rail) { const k = r.line || 'null'; byLine[k] = byLine[k] || [0, 0]; byLine[k][0]++; byLine[k][1] += r.km; }
  const s = R.stats;
  console.log(`\n${rel(OUT)}: ${(bytes / 1024).toFixed(1)} KB`);
  console.log(`bbox ${JSON.stringify(map.bbox)} จุดนอก bbox: ${outside}`);
  console.log(`ประเทศ: ${map.country.polygons.length} polygon ${countPts(map.country.polygons)} จุด (ดิบ ${country.stats.rawPts} จุด, ตัดเกาะเล็ก ${country.stats.dropped})`);
  console.log(`จังหวัด: เส้นแบ่ง ${map.provinces.borders.length} เส้น ${countPts(map.provinces.borders)} จุด (ดิบ ${prov.stats.rawSegs} ส่วน), ป้าย ${map.provinces.labels.length}`);
  console.log(`ราง OSM: ${s.ways} way ${s.wayKm.toFixed(0)} กม. -> ${s.chains} เส้นต่อเนื่อง -> เก็บ ${s.kept} เส้น ${s.keptKm.toFixed(0)} กม. ${countPts(map.rail.map((r) => r.pts))} จุด`);
  console.log(`  ตัดออก: รถไฟฟ้าในเมือง ${s.excluded.urban.toFixed(0)} กม., กำลังก่อสร้าง ${s.excluded.construction.toFixed(0)} กม., ยังไม่เปิด ${s.excluded.not_open.toFixed(0)} กม., ทางตันสั้น ${s.short} เส้น ${s.shortKm.toFixed(0)} กม., รางขนานซ้อน ${s.dup} เส้น ${s.dupKm.toFixed(0)} กม.`);
  console.log('  ตามสาย: ' + Object.entries(byLine).map(([k, v]) => `${k} ${v[0]} เส้น ${v[1].toFixed(0)} กม.`).join(', '));
  console.log(`สถานีอ้างอิง: ${map.landmarks.length}/${LANDMARKS.length} (จากสถานี/ที่หยุดรถรถไฟ ${L.stationNodes} จุดใน OSM)`);
  if (L.missing.length) console.log('  ไม่ได้ใส่: ' + L.missing.join(', '));
  console.log(`สายน้ำตก: path ${map.namtok.path.length} จุด ${N.mainKm.toFixed(2)} กม. (ดิบ ${N.rawPts} จุด), extension ${map.namtok.extension.length} จุด ${N.extKm.toFixed(2)} กม., สถานี ${map.namtok.stations.length} (station ${map.namtok.stations.filter((x) => x.kind === 'station').length}, halt ${map.namtok.stations.filter((x) => x.kind === 'halt').length}), หมุดหนองปลาดุกอยู่ที่ ${N.km0.toFixed(2)} กม. จากต้น path`);
  let bad = outside > 0 || bytes > 1.5 * 1024 * 1024;
  for (const id of map.namtok.tutorial_route) {
    const st = map.namtok.stations.find((x) => x.id === id);
    const d = project([st.lon, st.lat], map.namtok.path).d;
    const dCountry = Math.min(...map.rail.map((r) => project([st.lon, st.lat], r.pts).d));
    console.log(`  ${st.order}. ${id} (${st.name_th}) ขั้น ${st.tier} กม. ${st.km} ห่าง path ${d.toFixed(1)} ม., ห่างเส้นทั้งประเทศ ${dCountry.toFixed(0)} ม.`);
    if (d > 30) bad = true;
  }
  if (bad) { console.error('ตรวจผลไม่ผ่าน'); process.exit(1); }
  console.log('ตรวจผลผ่าน');
}

main().catch((e) => { console.error(e); process.exit(1); });
