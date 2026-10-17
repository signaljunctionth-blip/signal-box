// QA ข้อ 4: ภาพทุกหน้าหลักที่ 4 ขนาดจอ x สว่าง/มืด + ตรวจเป้าแตะ/ปุ่มซ้อน/ล้นจอ/ข้อความถูกตัดทุกภาพ
// ภาพอยู่ที่ test/screenshots/qa-s-<หน้า>-<ขนาด>-<โหมด>.png   ใช้: node test/qa-shots.js [ขนาด,...] [light|dark]
const L = require('./qa-lib.js');
const { VIEWS, sleep, saveText, stationOf } = L;
const only = process.argv[2] && process.argv[2] !== 'all' ? process.argv[2].split(',') : null, onlyScheme = process.argv[3] || null;
const MID = saveText({ 'tk-1': 3, 'tk-2': 3, 'tk-3': 2, 'wp-1': 3, 'wp-2': 2, 'wp-3': 1, 'nt-1': 3, 'nt-2': 3, 'kb-1': 2, 'kb-2': 1, 'kb-3': 1, 'np-1': 3 }, { 'map-intro-seen': true });
const FRESH = saveText({}, { 'map-intro-seen': true });
const BOARDS = ['tk-3', 'wp-3', 'nt-2', 'kb-3', 'np-3'];
const emojiRe = /\p{Extended_Pictographic}/gu;

async function run(env, v, scheme, R) {
  const tag = `${v.name}-${scheme}`, name = s => `s-${s}-${v.name}-${scheme}`;
  const A = (p, where, o) => L.audit(p, v, R, `${tag} ${where}`, o);
  const texts = new Set();
  const grab = async p => { for (const m of (await p.evaluate(() => document.body.innerText)).match(emojiRe) || []) texts.add(m); };
  const waitMap = async p => { await p.waitForFunction(() => window.__sjApp && window.__sjApp.map, null, { timeout: 8000 }); await L.mapSettled(p); await sleep(250); };

  // หน้าแรก + เครดิต
  let o = await L.open(env, v, scheme, R, { tag });
  let p = o.p;
  await A(p, 'หน้าแรก'); await L.shot(p, name('home')); await grab(p);
  await L.tapEl(p, v, '.credits summary', R, `${tag} เครดิต`); await sleep(150);
  await A(p, 'หน้าแรก เครดิตเปิด'); await L.shot(p, name('home-credits')); await grab(p);
  const cr = await p.evaluate(() => { const d = document.querySelector('.credits'), r = d.getBoundingClientRect(), ul = d.querySelector('ul').getBoundingClientRect(), s = document.getElementById('s-home'); return { open: d.open, ulTop: ul.top, ulBottom: ul.bottom, ulLeft: ul.left, ulRight: ul.right, vw: innerWidth, vh: innerHeight, scrollable: s.scrollHeight > s.clientHeight + 1 || s.scrollWidth > s.clientWidth + 1, ov: getComputedStyle(s).overflowY }; });
  if (cr.ulTop < -1 || cr.ulLeft < -1 || cr.ulBottom > cr.vh + 1 || cr.ulRight > cr.vw + 1) R.note(`${tag}: เปิดเครดิตหน้าแรกแล้วรายการล้นขอบจอ ${JSON.stringify(cr)}`);
  await o.ctx.close();

  // แผนที่ เซฟเปล่า: ทั้งประเทศ + เส้นทางสอน + แผ่นข้อมูลที่ล็อก
  o = await L.open(env, v, scheme, R, { tag, hash: '#map', save: FRESH }); p = o.p; await waitMap(p);
  await p.evaluate(() => window.__sjApp.map.country()); await sleep(300);
  await A(p, 'แผนที่ทั้งประเทศ'); await L.shot(p, name('map-country')); await grab(p);
  await p.evaluate(() => window.__sjApp.map.route()); await sleep(300);
  await A(p, 'แผนที่เส้นทางสอน (เซฟเปล่า)'); await L.shot(p, name('map-route-fresh'));
  // รายการสายรถไฟ
  const linesOpen = await p.evaluate(() => !document.getElementById('map-lines-list').hidden);
  if (!linesOpen) { await L.tapEl(p, v, '.lines-toggle', R, `${tag} ปุ่มสายรถไฟ`); await sleep(200); await A(p, 'แผนที่ รายการสายเปิด'); await L.shot(p, name('map-lines')); await L.tapEl(p, v, '.lines-toggle', R, `${tag} ปุ่มสายรถไฟ`); }
  await p.goto(env.game.url + '#map/kanchanaburi', { waitUntil: 'load' }); await waitMap(p);
  await A(p, 'แผ่นกาญจนบุรี (ล็อก)'); await L.shot(p, name('sheet-kanchanaburi-locked')); await grab(p);
  await o.ctx.close();

  // แผนที่ เซฟกลางทาง: เส้นทางสอน + แผ่นข้อมูล 5 สถานี
  o = await L.open(env, v, scheme, R, { tag, hash: '#map', save: MID }); p = o.p; await waitMap(p);
  await A(p, 'แผนที่เส้นทางสอน'); await L.shot(p, name('map-route')); await grab(p);
  // เครดิตบนแผนที่
  const credit = async () => p.evaluate(() => [...document.querySelectorAll('.map-credit > *')].map(el => { const r = el.getBoundingClientRect(), cs = getComputedStyle(el), cx = r.left + r.width / 2, cy = r.top + r.height / 2, top = r.width ? document.elementFromPoint(cx, cy) : null; return { text: el.textContent.trim(), href: el.getAttribute('href'), shown: r.width > 0 && cs.display !== 'none' && cs.visibility !== 'hidden' && !!top && (top === el || el.contains(top) || top.contains(el)), w: Math.round(r.width), h: Math.round(r.height), clip: el.scrollWidth > el.clientWidth + 1 }; }));
  const c0 = await credit();
  for (const id of ['tha-kilen', 'wang-pho', 'nam-tok', 'kanchanaburi', 'nong-pla-duk-jn']) {
    await p.goto(env.game.url + '#map/' + id, { waitUntil: 'load' }); await waitMap(p);
    await A(p, `แผ่น ${id}`); await L.shot(p, name('sheet-' + id)); await grab(p);
    const sc = await p.evaluate(() => { const s = document.querySelector('.sheet'); return { scroll: s.scrollHeight > s.clientHeight + 1, sh: s.scrollHeight, ch: s.clientHeight, w: Math.round(s.getBoundingClientRect().width), h: Math.round(s.getBoundingClientRect().height) }; });
    if (id === 'tha-kilen') { const c1 = await credit(); console.log(`  ${tag}: เครดิตบนแผนที่ ปกติ ${JSON.stringify(c0.map(c => [c.text.slice(0, 28), c.shown]))} | เปิดแผ่นข้อมูล ${JSON.stringify(c1.map(c => [c.text.slice(0, 28), c.shown]))} แผ่น ${sc.w}x${sc.h} เลื่อน ${sc.scroll}`); R.credit[tag] = { normal: c0, sheet: c1 }; }
    // ปุ่มสถานีของแผ่นที่เปิดต้องยังเห็นและแตะได้
    const mk = await p.evaluate(i => { const c = window.__sjApp.map.markerClient(i), el = document.elementFromPoint(c.x, c.y); return { c, hit: el && el.closest('.mk') ? el.closest('.mk').dataset.id : (el ? String(el.className).slice(0, 30) : null) }; }, id);
    if (mk.hit !== id) R.fail(`${tag}: เปิดแผ่น ${id} แล้วปุ่มสถานีนั้นถูกบัง/อยู่นอกจอ (จุด ${mk.c.x.toFixed(0)},${mk.c.y.toFixed(0)} โดน ${mk.hit})`);
  }
  // แผ่นข้อมูลเลื่อนลงสุด
  await p.evaluate(() => { const s = document.querySelector('.sheet'); s.scrollTop = s.scrollHeight; }); await sleep(120);
  await A(p, 'แผ่นหนองปลาดุก เลื่อนลงสุด'); await L.shot(p, name('sheet-nong-pla-duk-jn-bottom'));
  await o.ctx.close();

  // หน้าเล่น: การ์ดเริ่ม แผงของ 5 สถานี การ์ดพัก ชนะ แพ้ stall
  o = await L.open(env, v, scheme, R, { tag, hash: '#play/tha-kilen/tk-1', save: saveText(Object.fromEntries(L.IDS.map(i => [i, 2])), { 'map-intro-seen': true }) }); p = o.p;
  const openM = async id => { await p.goto(env.game.url + `#play/${stationOf(id)}/${id}`, { waitUntil: 'load' }); await p.waitForFunction(i => window.__sjApp && window.__sjApp.play && window.__sjApp.play.id === i && window.__sjApp.play.g.state === 'intro', id); await p.evaluate(() => document.fonts.ready); await sleep(120); };
  for (const id of ['tk-1', 'kb-2', 'np-3']) {
    await openM(id); await A(p, `การ์ดเริ่ม ${id}`); await L.shot(p, name('intro-' + id)); await grab(p);
    const sc = await p.evaluate(() => { const c = document.querySelector('.pl-card'); return { scroll: c.scrollHeight > c.clientHeight + 1, sh: c.scrollHeight, ch: c.clientHeight }; });
    if (sc.scroll) { R.note(`${tag}: การ์ดเริ่ม ${id} ต้องเลื่อน (${sc.sh} > ${sc.ch})`); await p.evaluate(() => { const c = document.querySelector('.pl-card'); c.scrollTop = c.scrollHeight; }); await sleep(100); await L.shot(p, name('intro-' + id + '-bottom')); }
  }
  // tk-1 มีคำใบ้: ภาพตอนคำใบ้ชี้เป้า
  await openM('tk-1'); await L.startTap(p, v, R, tag);
  await p.evaluate(() => { const P = window.__sjApp.play; P.setManual(true); for (let i = 0; i < 400 && !P.nextTarget(); i++) P.step(0.05); P.step(0.5); P.setManual(false); });
  await sleep(500); await L.shot(p, name('board-tk-1-hint'));
  for (const id of BOARDS) {
    await openM(id); await L.startTap(p, v, R, tag);
    const b = await L.auditBoard(p, v, R, `${tag} แผง ${id}`);
    // เล่นไปจนมีขบวนอยู่ในผังอย่างน้อย 2 ขบวน (หรือขบวนเดียวจอดอยู่) แล้วรอให้ข้อความแจ้งหายก่อนถ่าย
    await p.evaluate(() => {
      const P = window.__sjApp.play, g = P.g; P.setManual(true);
      const busy = () => g.trains.length >= 2 && g.trains.some(t => t.stopped) && g.time > 14 || (g.lv.sched.length <= 4 && g.trains.length >= 1 && g.time > 30 && g.trains.some(t => !t.stopped));
      for (let i = 0; i < 6000 && g.state === 'play' && !busy(); i++) { const t = P.nextTarget(); if (t) P.press(t); P.step(0.05); }
    });
    await sleep(120); await L.shot(p, name(`board-${id}-toast`));
    await sleep(3500); await A(p, `แผง ${id}`, { allowClip: [] }); await L.shot(p, name(`board-${id}`)); await grab(p);
    const q = await p.evaluate(() => ({ trains: window.__sjApp.play.g.trains.length, t: +window.__sjApp.play.g.time.toFixed(0), queue: [...document.querySelectorAll('.pl-queue li')].map(li => ({ t: li.textContent, clip: li.querySelector('span') ? li.querySelector('span').scrollWidth > li.querySelector('span').clientWidth + 1 : false })), ttl: (() => { const e = document.querySelector('.pl-ttl span'); return e.scrollWidth > e.clientWidth + 1; })() }));
    for (const li of q.queue) if (li.clip) R.fail(`${tag} แผง ${id}: ข้อความคิวขบวนถูกตัดด้วย ... : "${li.t}"`);
    if (q.ttl) R.fail(`${tag} แผง ${id}: บรรทัดสถานี/ยุคใต้ชื่อภารกิจถูกตัด`);
    console.log(`  ${tag}: แผง ${id} ขบวนในผัง ${q.trains} เวลา ${q.t} scale ${b.scale.toFixed(2)} เป้า ${b.dia.toFixed(0)} px ใกล้สุด ${b.minGap.toFixed(0)} px (${b.pair}) คิว ${q.queue.length}`);
    if (id === 'np-3') {
      // ยุคแผงต้นทาง-ปลายทาง: ภาพตอนเลือกเสาต้นทางแล้ว (ปลายทางที่เลือกได้ขึ้น)
      const sel = await p.evaluate(() => { const P = window.__sjApp.play, g = P.g; for (let i = 0; i < 3000 && g.state === 'play'; i++) { const t = P.nextTarget(); if (t && t.kind === 'signal') { P.press(t); if (g.nxSel) return { sel: g.nxSel, next: P.nextTarget(), at: P.nextTarget() && P.targetClient(P.nextTarget()) }; } else if (t) P.press(t); P.step(0.05); } return null; });
      if (sel) { await sleep(150); await L.shot(p, name('board-np-3-nxsel')); if (sel.at) { await L.tapXY(p, v, sel.at.x, sel.at.y); const done = await p.evaluate(() => window.__sjApp.play.g.nxSel); R.check(!done, `${tag}: แตะปลายทาง ${JSON.stringify(sel.next)} ที่พิกัดจอแล้วไม่ตั้งทาง (nxSel ยังเป็น ${done})`); } } else R.note(`${tag}: np-3 ไม่เจอจังหวะเลือกปลายทาง`);
    }
    if (id === 'kb-3') {
      await L.tapEl(p, v, '.pl-bar [data-act="menu"]', R, `${tag} พัก`); await sleep(120); await A(p, 'การ์ดพัก kb-3'); await L.shot(p, name('pause')); await grab(p);
      await L.tapEl(p, v, '.pl-card [data-act="resume"]', R, `${tag} เล่นต่อ`);
    }
  }
  // การ์ดชนะ (3 ดาว และ 1 ดาว) จาก wp-1
  await openM('wp-1'); await L.startTap(p, v, R, tag);
  let r = await L.playLevel(p, v, R, `${tag} wp-1`); await sleep(120);
  await A(p, 'การ์ดชนะ'); await L.shot(p, name('win')); await grab(p);
  await L.tapEl(p, v, '.pl-card [data-act="retry"]', R, tag); await L.startTap(p, v, R, tag);
  r = await L.playLevel(p, v, R, `${tag} wp-1 ช้า`, { lag: 40 }); await sleep(120);
  await A(p, 'การ์ดชนะ (ดาวน้อย)'); await L.shot(p, name('win-low'));
  console.log(`  ${tag}: wp-1 เล่นช้า -> ${r.state} ${r.stars} ดาว ${r.score}/${r.max}`);
  // การ์ดแพ้: np-3 รอเกินเวลา และ stall บน tk-1
  await openM('np-3'); await L.startTap(p, v, R, tag);
  await p.evaluate(() => { const P = window.__sjApp.play; P.setManual(true); for (let i = 0; i < 400 && P.g.state === 'play'; i++) P.step(0.5); });
  await sleep(150); await A(p, 'การ์ดแพ้ np-3'); await L.shot(p, name('fail-maxwait')); await grab(p);
  await openM('tk-3'); await L.startTap(p, v, R, tag);
  await p.evaluate(() => { const P = window.__sjApp.play; P.setManual(true); P.step(75); });
  await sleep(150); await A(p, 'แถบ stall tk-3'); await L.shot(p, name('stall')); await grab(p);
  // หน้า "ทางเข้านักพัฒนา" (เปิดได้เพราะเบราว์เซอร์ถูกเครื่องมือทดสอบขับ ผู้เล่นทั่วไปเปิดไม่ได้)
  await p.goto(env.game.url + '#dev', { waitUntil: 'load' }); await sleep(500); await L.shot(p, name('dev'));
  await o.ctx.close();
  if (texts.size) R.fail(`${tag}: พบอีโมจิ/สัญลักษณ์ภาพในข้อความบนจอ: ${[...texts].join(' ')}`);
}

(async () => {
  const env = await L.launch(), R = L.createReport('qa-shots'); R.credit = {};
  try {
    for (const scheme of ['light', 'dark']) {
      if (onlyScheme && onlyScheme !== scheme) continue;
      await Promise.all(VIEWS.filter(v => !only || only.includes(v.name)).map(v => run(env, v, scheme, R).catch(e => R.fail(`${v.name}-${scheme}: สคริปต์ล้ม ${e.stack.split('\n').slice(0, 4).join(' | ')}`))));
    }
  } finally { await env.close(); }
  process.exit(R.done() ? 1 : 0);
})();
