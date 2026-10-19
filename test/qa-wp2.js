// QA ชุดงาน WP2 (หน้าจอแนวนอนครบทุกเครื่อง): ภาพทุกหน้าจอที่ 4 ขนาด × สว่าง/มืด + ขอบปลอดภัย (รอยบาก/แถบโฮม) + ปุ่มเต็มจอ
// ใช้: npm run build && node test/qa-wp2.js [ขนาด,...]   ภาพอยู่ที่ test/screenshots/wp2-*.png
//   มือถือ (844×390, 390×844) เปิดแบบ isMobile + hasTouch, ไอแพด 1180×820 hasTouch, คอม 1280×800 เมาส์
//   ขอบปลอดภัย: ฉีดค่า --sa-* ที่เวที (แทน env() ที่เบราว์เซอร์จำลองไม่มี) 3 แบบ: ถือนอนรอยบากซ้าย, ถือนอนรอยบากขวา, ถือตั้ง (เวทีหมุน)
//   แล้วตรวจว่าปุ่มและข้อความทุกชิ้นอยู่ในพื้นที่ปลอดภัย (พิกัดเวที)
const L = require('./qa-lib.js');
const { sleep, saveText, stationOf } = L;
const only = process.argv[2] ? process.argv[2].split(',') : null;
const VIEWS = [
  { name: '844x390', width: 844, height: 390, dpr: 2, touch: true, mobile: true },
  { name: '390x844', width: 390, height: 844, dpr: 2, touch: true, mobile: true },
  { name: '1180x820', width: 1180, height: 820, dpr: 2, touch: true },
  { name: '1280x800', width: 1280, height: 800, dpr: 1, touch: false },
].filter(v => !only || only.includes(v.name));
const ALL2 = saveText(Object.fromEntries(L.IDS.map(i => [i, 2])), { 'map-intro-seen': true });
// ผ่านถึง nt-2 แล้ว (กาญจนบุรีเปิด) แบบที่ qa รายงานเรื่องแผ่นข้อมูลบังสถานี
const TO_NT2 = saveText({ 'tk-1': 3, 'tk-2': 3, 'tk-3': 3, 'wp-1': 3, 'wp-2': 2, 'wp-3': 2, 'nt-1': 2, 'nt-2': 3 }, { 'map-intro-seen': true });

const newCtx = (env, v, scheme) => env.b.newContext({ viewport: { width: v.width, height: v.height }, deviceScaleFactor: v.dpr, hasTouch: v.touch, isMobile: !!v.mobile, colorScheme: scheme });
const shot = (p, name) => p.screenshot({ path: L.path.join(L.shots, `wp2-${name}.png`) });

// ฉีดขอบปลอดภัย (พิกัดเวที) แล้วให้หน้าจอจัดใหม่
const setSafe = (p, sa) => p.evaluate(sa => { const s = document.getElementById('stage'); for (const k of ['t', 'r', 'b', 'l']) s.style.setProperty('--sa-' + k, (sa[k] || 0) + 'px'); window.dispatchEvent(new Event('resize')); }, sa);
// ทุกปุ่มและทุกข้อความที่มองเห็นต้องอยู่ในพื้นที่ปลอดภัย (ยอมให้เกินขอบ 0.5 px) ไม่นับปุ่มสถานีบนแผนที่ (เลื่อนตามแผนที่) และของที่เลื่อนพ้นกล่องเลื่อน
async function safeAudit(p, R, where, sa) {
  const bad = await p.evaluate(sa => {
    const S = window.__sjApp.stage, W = S.layout.w, H = S.layout.h, out = [];
    const screen = [...document.querySelectorAll('#stage .screen')].find(s => !s.hidden);
    const vis = el => { if (el.closest('[hidden]') || el.closest('.mk') || el.closest('.markers')) return false; const d = el.closest('details:not([open])'); if (d && !el.closest('summary')) return false; const cs = getComputedStyle(el); return cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity !== 0 && el.getClientRects().length; };
    const hasText = el => [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    const els = [...screen.querySelectorAll('a,button,summary,h1,h2,h3,p,li,span,b,dt,dd')].filter(el => vis(el) && (el.matches('a,button,summary') || hasText(el)));
    const SA = sa;
    for (const el of els) {
      let r = S.rectOf(el); sa = SA;
      if (!r.w || !r.h) continue;
      // อยู่ในกล่องเลื่อน: ตัดตามกล่อง (ส่วนที่เลื่อนพ้นไปไม่นับ)
      for (let a = el.parentElement; a && a !== screen; a = a.parentElement) {
        const cs = getComputedStyle(a);
        if (/(auto|scroll|hidden)/.test(cs.overflowY + cs.overflowX)) {
          // กล่องเลื่อนที่ยังเลื่อนต่อได้: ของที่อยู่ใต้แถบโฮม/ขอบบนชั่วคราวระหว่างเลื่อนไม่นับ (เลื่อนสุดแล้วต้องพ้น)
          if (/(auto|scroll)/.test(cs.overflowY) && a.scrollHeight > a.clientHeight + 1) { if (a.scrollTop + a.clientHeight < a.scrollHeight - 1) sa = { ...sa, b: 0 }; if (a.scrollTop > 1) sa = { ...sa, t: 0 }; }
          const c = S.rectOf(a), x0 = Math.max(r.x, c.x), y0 = Math.max(r.y, c.y), x1 = Math.min(r.x + r.w, c.x + c.w), y1 = Math.min(r.y + r.h, c.y + c.h);
          if (x1 <= x0 || y1 <= y0) { r = null; break; }
          r = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
        }
      }
      if (!r) continue;
      const name = (el.getAttribute('aria-label') || el.textContent).trim().replace(/\s+/g, ' ').slice(0, 30);
      if (r.x < sa.l - 0.5 || r.y < sa.t - 0.5 || r.x + r.w > W - sa.r + 0.5 || r.y + r.h > H - sa.b + 0.5) out.push(`${el.tagName.toLowerCase()} "${name}" ${[r.x, r.y, r.x + r.w, r.y + r.h].map(n => n.toFixed(0))}`);
    }
    // แผงเล่น: เป้าแตะบน canvas ต้องอยู่ในพื้นที่ปลอดภัยด้วย
    const P = window.__sjApp.play;
    if (P && P.g && !document.querySelector('.pl-ov:not([hidden])')) {
      const G = P.geom();
      for (const t of [...Object.keys(G.signals).map(id => ({ kind: 'signal', id })), ...Object.keys(G.points).map(id => ({ kind: 'point', id })), ...Object.keys(G.portals).map(id => ({ kind: 'portal', id }))]) {
        const c = P.targetClient(t), s = S.toStage(c.x, c.y);
        if (s.x < sa.l + 10 || s.x > W - sa.r - 10) out.push(`เป้าบนแผง ${t.kind}:${t.id} x=${s.x.toFixed(0)}`);
      }
    }
    return [...new Set(out)];
  }, { t: 0, r: 0, b: 0, l: 0, ...sa });
  for (const m of bad) R.fail(`${where}: อยู่นอกพื้นที่ปลอดภัย: ${m}`);
  return bad;
}

async function openMission(p, env, id) {
  await p.goto(env.game.url + `#play/${stationOf(id)}/${id}`, { waitUntil: 'load' });
  await p.waitForFunction(i => window.__sjApp && window.__sjApp.play && window.__sjApp.play.id === i && window.__sjApp.play.g.state === 'intro', id);
}
// เดินเกมไปจนมีขบวนในผังและคิว (ภาพ "ระหว่างเล่น")
const playMid = p => p.evaluate(() => {
  const P = window.__sjApp.play, g = P.g; P.start(); P.setManual(true);
  for (let i = 0; i < 6000 && g.state === 'play' && !(g.trains.length >= 2 && g.time > 14); i++) { const t = P.nextTarget(); if (t) P.press(t); P.step(0.05); }
  return g.state;
});

async function screens(env, v, scheme, R) {
  const tag = `${v.name}-${scheme}`, ctx = await newCtx(env, v, scheme);
  const A = (p, where) => L.audit(p, v, R, `${tag} ${where}`);
  // หน้าแรก + เครดิต
  let o = await L.open(env, v, scheme, R, { tag, ctx }), p = o.p;
  await A(p, 'หน้าแรก'); await shot(p, `home-${tag}`);
  const fsBtn = await p.evaluate(() => { const b = document.getElementById('b-full'); return { can: !!(document.fullscreenEnabled || document.webkitFullscreenEnabled), shown: !b.hidden, label: b.getAttribute('aria-label') }; });
  R.check(fsBtn.shown === fsBtn.can, `${tag}: ปุ่มเต็มจอหน้าแรกแสดง ${fsBtn.shown} แต่เบราว์เซอร์รองรับ ${fsBtn.can}`);
  await L.tapEl(p, v, '.credits summary', R, `${tag} เครดิต`); await sleep(150);
  await shot(p, `credits-${tag}`); // แผ่นเครดิตทับหน้าแรก (ปุ่มหน้าแรกถูกบังโดยตั้งใจ) ตรวจลิงก์ในแผ่นด้านล่างแทน
  const cr = await p.evaluate(() => {
    const S = window.__sjApp.stage, pn = document.querySelector('.credits-panel'), r = S.rectOf(pn);
    const links = [...pn.querySelectorAll('li a')].map(a => ({ t: a.textContent.trim().slice(0, 20), h: a.getBoundingClientRect().height, w: a.getBoundingClientRect().width }));
    return { inside: r.x >= -0.5 && r.y >= -0.5 && r.x + r.w <= S.layout.w + 0.5 && r.y + r.h <= S.layout.h + 0.5, scroll: pn.scrollHeight > pn.clientHeight + 1, links, hrefs: [...pn.querySelectorAll('a')].map(a => a.href) };
  });
  R.check(cr.inside, `${tag}: แผ่นเครดิตล้นจอ`);
  for (const l of cr.links) R.check(Math.min(l.h, l.w) >= 39.5, `${tag}: ลิงก์เครดิต "${l.t}" เล็ก ${l.w.toFixed(0)}×${l.h.toFixed(0)}`);
  R.check(cr.hrefs.some(h => h.endsWith('/tree/main/data')) && cr.hrefs.some(h => h.endsWith('/tree/main/tools')), `${tag}: เครดิตไม่ชี้ทั้ง data/ และ tools/`);
  if (cr.scroll) {
    // เลื่อนลงสุด: หัวแผ่น (ปุ่มปิด) ยังอยู่ และเห็นบรรทัดท้าย
    await p.evaluate(() => { const pn = document.querySelector('.credits-panel'); pn.scrollTop = pn.scrollHeight; }); await sleep(100);
    const end = await p.evaluate(() => { const S = window.__sjApp.stage, pn = S.rectOf(document.querySelector('.credits-panel')), x = S.rectOf(document.querySelector('[data-act="close-credits"]')), v = S.rectOf(document.querySelector('.credits .fine')); return { close: x.y >= pn.y - 0.5, ver: v.y + v.h <= pn.y + pn.h + 0.5 }; });
    R.check(end.close && end.ver, `${tag}: เลื่อนแผ่นเครดิตลงสุดแล้วปุ่มปิดหายหรือไม่เห็นบรรทัดท้าย ${JSON.stringify(end)}`);
    await shot(p, `credits-bottom-${tag}`);
  }

  // แผนที่ + แผ่นน้ำตก (หลังชนะ nt-2): ทุกสถานีต้องแตะได้โดยไม่ต้องปิดแผ่น (จอที่กว้างพอ)
  await p.evaluate(t => { localStorage.setItem('sj-signalbox-save', t); }, TO_NT2);
  await p.goto(env.game.url + '#map/nam-tok', { waitUntil: 'load' }); await p.reload({ waitUntil: 'load' });
  await p.waitForFunction(() => window.__sjApp && window.__sjApp.map && window.__sjApp.map.openId() === 'nam-tok'); await L.mapSettled(p); await sleep(300);
  await A(p, 'แผ่นน้ำตก'); await shot(p, `sheet-namtok-${tag}`);
  const cov = await p.evaluate(() => ['tha-kilen', 'wang-pho', 'nam-tok', 'kanchanaburi', 'nong-pla-duk-jn'].filter(id => { const c = window.__sjApp.map.markerClient(id), el = document.elementFromPoint(c.x, c.y); return !(el && el.closest(`.mk[data-id="${id}"]`)); }));
  if (v.width >= 1000 && v.height >= 700) R.check(!cov.length, `${tag}: แผ่นน้ำตกเปิดอยู่ แตะสถานีไม่ได้: ${cov.join(', ')}`);
  else if (cov.length) R.note(`${tag}: จอเล็ก แผ่นน้ำตกเปิดอยู่ สถานีที่ต้องเลื่อนแผนที่ก่อนแตะ: ${cov.join(', ')}`);
  if (!cov.includes('kanchanaburi')) {
    const c = await p.evaluate(() => window.__sjApp.map.markerClient('kanchanaburi'));
    await L.tapXY(p, v, c.x, c.y); await L.mapSettled(p); await sleep(200);
    R.check(await p.evaluate(() => window.__sjApp.map.openId()) === 'kanchanaburi', `${tag}: แตะกาญจนบุรีตอนแผ่นน้ำตกเปิดแล้วไม่ได้เปิดแผ่นกาญจนบุรี`);
  }
  await p.evaluate(() => window.__sjApp.router.replace({ screen: 'map' })); await L.mapSettled(p); await sleep(200);
  await A(p, 'แผนที่'); await shot(p, `map-${tag}`);
  await o.ctx.close();

  // หน้าเล่น
  const ctx2 = await newCtx(env, v, scheme);
  o = await L.open(env, v, scheme, R, { tag, ctx: ctx2, hash: '#map', save: ALL2 }); p = o.p;
  await openMission(p, env, 'kb-1');
  await A(p, 'การ์ดเริ่ม kb-1'); await shot(p, `intro-kb-1-${tag}`);
  const intro = await p.evaluate(() => { const a = document.querySelector('.pl-card .osm a'); return a && { text: a.textContent, href: a.href, h: a.getBoundingClientRect().height }; });
  R.check(intro && /OpenStreetMap/.test(intro.text) && /openstreetmap\.org\/copyright/.test(intro.href) && intro.h >= 39.5, `${tag}: การ์ดเริ่มของสถานีจริงไม่มีเครดิต OSM ที่แตะได้ ${JSON.stringify(intro)}`);
  await playMid(p); await sleep(3600);
  await A(p, 'ระหว่างเล่น kb-1'); await shot(p, `mid-kb-1-${tag}`);
  const room = await p.evaluate(() => { const S = window.__sjApp.stage, b = S.rectOf(document.querySelector('.pl-board')), P = window.__sjApp.play, G = P.geom(), k = P.scale(); return { board: b.h, used: (G.view.y1 - G.view.y0) * k, queue: document.querySelectorAll('.pl-queue li').length }; });
  if (v.height >= 700 || v.width >= 1000) R.check(room.used / room.board > 0.8 || room.queue >= 4, `${tag}: แผงเล่นเหลือที่ว่างแนวตั้งมาก ${JSON.stringify(room)}`);
  console.log(`  ${tag}: แผง kb-1 สูง ${room.board.toFixed(0)} ใช้ ${room.used.toFixed(0)} คิว ${room.queue}`);
  await L.tapEl(p, v, '.pl-bar [data-act="menu"]', R, `${tag} พัก`); await sleep(120);
  await A(p, 'การ์ดพัก'); await shot(p, `pause-${tag}`);
  await openMission(p, env, 'tk-3'); await L.startTap(p, v, R, tag);
  await p.evaluate(() => { const P = window.__sjApp.play; P.setManual(true); P.step(75); }); await sleep(150);
  await A(p, 'แถบ stall'); await shot(p, `stall-${tag}`);
  await openMission(p, env, 'wp-1'); await L.startTap(p, v, R, tag);
  await L.playLevel(p, v, R, `${tag} wp-1`); await sleep(150);
  await A(p, 'การ์ดชนะ'); await shot(p, `win-${tag}`);
  await o.ctx.close();
}

// ขอบปลอดภัย: 3 แบบ ทุกหน้าจอหลัก
async function safeArea(env, R) {
  const CASES = [
    { name: 'notch-left', v: VIEWS.find(x => x.name === '844x390'), sa: { l: 47, b: 21 } },
    { name: 'notch-right', v: VIEWS.find(x => x.name === '844x390'), sa: { r: 47, b: 21 } },
    // ถือตั้ง: รอยบากบนจอจริง = ซ้ายของเวที, แถบโฮมล่างจอจริง = ขวาของเวที (style.css สลับ env() ให้เมื่อมี .rot)
    { name: 'portrait', v: VIEWS.find(x => x.name === '390x844'), sa: { l: 47, r: 34 } },
  ].filter(c => c.v);
  for (const c of CASES) {
    const tag = `safe-${c.name}`, ctx = await newCtx(env, c.v, 'light');
    const o = await L.open(env, c.v, 'light', R, { tag, ctx, save: ALL2 }), p = o.p;
    const step = async (where, name) => { await setSafe(p, c.sa); await sleep(250); await safeAudit(p, R, `${tag} ${where}`, c.sa); await shot(p, `${tag}-${name}`); };
    await step('หน้าแรก', 'home');
    await p.click('.credits summary'); await step('เครดิต', 'credits'); await p.click('[data-act="close-credits"]');
    await p.goto(env.game.url + '#map', { waitUntil: 'load' }); await p.waitForFunction(() => window.__sjApp && window.__sjApp.map && window.__sjApp.map.camera()); await setSafe(p, c.sa); await L.mapSettled(p);
    await step('แผนที่', 'map');
    await p.locator('.lines-toggle').click(); await step('แผนที่ รายการสาย', 'lines'); await p.locator('.lines-toggle').click();
    await p.evaluate(() => window.__sjApp.router.replace({ screen: 'map', stationId: 'nong-pla-duk-jn' })); await L.mapSettled(p);
    await step('แผ่นข้อมูล', 'sheet');
    await p.evaluate(() => { const s = document.querySelector('.sheet'); s.scrollTop = s.scrollHeight; }); await step('แผ่นข้อมูลเลื่อนลงสุด', 'sheet-bottom');
    await openMission(p, env, 'kb-1'); await step('การ์ดเริ่ม', 'intro');
    await playMid(p); await sleep(3600); await step('ระหว่างเล่น', 'mid');
    await openMission(p, env, 'tk-3'); await p.evaluate(() => { const P = window.__sjApp.play; P.start(); P.setManual(true); P.step(75); }); await step('แถบ stall', 'stall');
    await openMission(p, env, 'wp-1'); await p.evaluate(() => window.__sjApp.play.start());
    await L.playLevel(p, c.v, R, tag, { real: false }); await step('การ์ดชนะ', 'win');
    await o.ctx.close();
  }
}

(async () => {
  const env = await L.launch(), R = L.createReport('qa-wp2');
  try {
    if (!process.env.SAFE_ONLY) for (const scheme of ['light', 'dark']) await Promise.all(VIEWS.map(v => screens(env, v, scheme, R).catch(e => R.fail(`${v.name}-${scheme}: สคริปต์ล้ม ${e.stack.split('\n').slice(0, 4).join(' | ')}`))));
    await safeArea(env, R).catch(e => R.fail(`ขอบปลอดภัย: สคริปต์ล้ม ${e.stack.split('\n').slice(0, 4).join(' | ')}`));
  } finally { await env.close(); }
  process.exit(R.done() ? 1 : 0);
})();
