// QA ข้อ 2 (ด่านดาว, เซฟ), ข้อ 3 (ทางแพ้ พัก ย้อนกลับ) และกรณีเลวร้าย (localStorage พัง จอเล็ก หมุนจอ แท็บถูกพัก)
// ใช้: node test/qa-rules.js [ส่วน,...]   ส่วน = gates,best,nostore,back,fail,stall,pause,rotate,tiny
const L = require('./qa-lib.js');
const { IDS, stationOf, VIEWS, sleep, saveText } = L;
const want = process.argv[2] ? process.argv[2].split(',') : null;
const on = s => !want || want.includes(s);
const RECIPES = (() => { const dir = process.env.QA_RECIPES; const out = {}; if (!dir) return out; for (const f of ['recipes.json', 'recipes-x.json']) try { Object.assign(out, JSON.parse(L.fs.readFileSync(L.path.join(dir, f), 'utf8'))); } catch { /* ไม่มีไฟล์ */ } return out; })();
const V844 = VIEWS[0], V390 = VIEWS[1], V1280 = VIEWS[3];
const stars = (n, ids = IDS) => Object.fromEntries(ids.map(id => [id, n]));
const FULL = saveText(stars(3), { 'map-intro-seen': true });
const state = p => p.evaluate(() => ({ hash: location.hash, home: !document.getElementById('s-home').hidden, map: !document.getElementById('s-map').hidden, play: !document.getElementById('s-play').hidden, sheet: window.__sjApp.map ? window.__sjApp.map.openId() : null, playId: window.__sjApp.play ? window.__sjApp.play.id : null, gs: window.__sjApp.play ? window.__sjApp.play.g.state : null }));
const waitMap = async p => { await p.waitForFunction(() => window.__sjApp && window.__sjApp.map, null, { timeout: 8000 }); await L.mapSettled(p); await sleep(200); };
const sheetText = async p => ((await p.textContent('.sheet')) || '').replace(/\s+/g, ' ');

/* ---- ด่านดาวสะสม 12 และ 20 ---- */
async function gates(env, R) {
  const first8 = IDS.slice(0, 8), first11 = IDS.slice(0, 11);
  const mix = (ids, total) => { const s = stars(1, ids); let need = total - ids.length; for (const id of ids) { const add = Math.min(2, need); s[id] += add; need -= add; if (need <= 0) break; } return s; };
  const cases = [
    { name: '8 ภารกิจ x 1 ดาว = 8', save: stars(1, first8), kb: 'locked', np: 'locked', kbText: ['ต้องมีดาวสะสม 12 ดวง ตอนนี้มี 8 ขาดอีก 4', 'เก็บดาวเพิ่มได้ที่'] },
    { name: 'รวม 11', save: mix(first8, 11), kb: 'locked', np: 'locked', kbText: ['ตอนนี้มี 11 ขาดอีก 1'] },
    { name: 'รวม 12 พอดี', save: mix(first8, 12), kb: 'open', np: 'locked' },
    { name: 'ดาว 18 แต่ยังไม่ผ่านน้ำตก', save: stars(3, IDS.slice(0, 6)), kb: 'locked', np: 'locked', kbText: ['ผ่านภารกิจของสถานีน้ำตกให้ครบก่อน เหลืออีก 2 ภารกิจ', 'ดาวสะสมครบ 12 ดวงแล้ว'] },
    { name: '11 ภารกิจ รวม 19', save: mix(first11, 19), kb: 'done', np: 'locked', npText: ['ต้องมีดาวสะสม 20 ดวง ตอนนี้มี 19 ขาดอีก 1'] },
    { name: '11 ภารกิจ รวม 20 พอดี', save: mix(first11, 20), kb: 'done', np: 'open' },
    { name: 'ดาว 24 แต่กาญจนบุรีเหลือ 1 ภารกิจ', save: { ...stars(3, first8), 'kb-1': 1, 'kb-2': 1 }, kb: 'open', np: 'locked', npText: ['ผ่านภารกิจของสถานีกาญจนบุรีให้ครบก่อน เหลืออีก 1 ภารกิจ'] },
  ];
  for (const c of cases) {
    const tag = `ด่านดาว [${c.name}]`;
    const { ctx, p } = await L.open(env, V844, 'light', R, { tag, hash: '#map/kanchanaburi', save: saveText(c.save, { 'map-intro-seen': true }) });
    await waitMap(p);
    const P = await L.progress(p), kb = P.stations[3], np = P.stations[4];
    R.check(kb.state === c.kb && np.state === c.np, `${tag}: กาญจนบุรี ${kb.state} (ควร ${c.kb}) หนองปลาดุก ${np.state} (ควร ${c.np}) ดาวรวม ${P.total}`);
    const t = await sheetText(p);
    for (const s of c.kbText || []) R.check(t.includes(s), `${tag}: แผ่นข้อมูลกาญจนบุรีไม่มี "${s}" — ได้: ${t.slice(0, 260)}`);
    R.check(!!(await p.$('.sheet [data-mission="kb-1"]')) === (c.kb !== 'locked'), `${tag}: ปุ่มเล่น kb-1 ${c.kb === 'locked' ? 'โผล่ทั้งที่ล็อก' : 'ไม่มีทั้งที่เปิด'}`);
    await L.audit(p, V844, R, `${tag} แผ่นกาญจนบุรี`);
    if (c.kbText) await L.shot(p, `gate-kb-${cases.indexOf(c)}-844x390`);
    if (c.kbText && c.kbText.includes('เก็บดาวเพิ่มได้ที่')) {
      // ปุ่มชี้ภารกิจที่ยังได้ 1 ดาว: แตะแล้วต้องไปแผ่นของสถานีนั้น
      const btns = await p.$$eval('.sheet .lock-go [data-act="station"]', els => els.map(e => e.textContent));
      R.check(btns.length >= 1 && btns.every(b => b.includes('(1/3)')), `${tag}: ปุ่มชี้ภารกิจที่ควรเก็บดาวเพิ่มไม่ถูก ${JSON.stringify(btns)}`);
      await L.tapEl(p, V844, '.sheet .lock-go [data-act="station"]', R, `${tag} ปุ่มเก็บดาวเพิ่ม`);
      await sleep(700);
      R.check((await state(p)).sheet === 'tha-kilen', `${tag}: ปุ่มเก็บดาวเพิ่มไม่พาไปสถานีของภารกิจนั้น ${JSON.stringify(await state(p))}`);
    }
    // ลิงก์ตรง
    for (const [id, st] of [['kb-1', c.kb], ['np-1', c.np]]) {
      await p.goto(env.game.url + `#play/${stationOf(id)}/${id}`, { waitUntil: 'load' }); await p.waitForFunction(() => window.__sjApp && (window.__sjApp.map || window.__sjApp.play), null, { timeout: 8000 }); await sleep(300);
      const s = await state(p);
      if (st === 'locked') R.check(!s.play && s.map && s.hash === `#map/${stationOf(id)}`, `${tag}: ลิงก์ตรง ${id} ขณะล็อกเข้าได้ ${JSON.stringify(s)}`);
      else if (id === 'kb-1' || st === 'open') R.check(s.play && s.playId === id, `${tag}: ลิงก์ตรง ${id} ขณะเปิดแล้วเข้าไม่ได้ ${JSON.stringify(s)}`);
    }
    if (c.npText) {
      await p.goto(env.game.url + '#map/nong-pla-duk-jn', { waitUntil: 'load' }); await waitMap(p);
      const t2 = await sheetText(p);
      for (const s of c.npText) R.check(t2.includes(s), `${tag}: แผ่นข้อมูลหนองปลาดุกไม่มี "${s}" — ได้: ${t2.slice(0, 260)}`);
      await L.audit(p, V844, R, `${tag} แผ่นหนองปลาดุก`); await L.shot(p, `gate-np-${cases.indexOf(c)}-844x390`);
    }
    await ctx.close();
  }
  // ลิงก์แปลก ๆ
  const { ctx, p } = await L.open(env, V844, 'light', R, { tag: 'ลิงก์แปลก' });
  for (const h of ['#play/foo/bar', '#map/nowhere', '#play/tha-kilen/np-3', '#play/nong-pla-duk-jn/tk-1', '#play/tha-kilen', '#play//', '#xyz', '#map/../x', '#play/tha-kilen/tk-1/extra', '#dev/namtok/zz']) {
    await p.goto(env.game.url + h, { waitUntil: 'load' }); await p.waitForFunction(() => !!window.__sjApp); await sleep(500);
    const s = await state(p);
    const okPlay = h === '#play/tha-kilen/tk-1/extra';
    R.check(okPlay ? s.play : (!s.play || h.startsWith('#dev')) && (s.home || s.map || s.play), `ลิงก์ ${h}: ${JSON.stringify(s)}`);
    console.log(`  ลิงก์ ${h} -> ${s.hash || '(หน้าแรก)'} ${s.home ? 'หน้าแรก' : s.map ? 'แผนที่' + (s.sheet ? '+' + s.sheet : '') : 'หน้าเล่น ' + (s.playId || 'dev')}`);
  }
  await ctx.close();
  R.ok('ด่านดาวสะสม');
}

/* ---- ดาวที่ดีที่สุดไม่ถูกเขียนทับ ---- */
async function best(env, R) {
  for (const v of [V844, V390]) {
    const tag = `ดาวดีที่สุด ${v.name}`, { ctx, p } = await L.open(env, v, 'light', R, { tag, hash: '#play/tha-kilen/tk-1' });
    await L.startTap(p, v, R, tag);
    const a = await L.playLevel(p, v, R, `${tag} รอบดี`);
    const s1 = await p.evaluate(() => window.__sjApp.save.getBest('namtok', 'tk-1'));
    R.check(a.state === 'win' && s1.stars === a.stars && s1.score === a.score, `${tag}: รอบแรก ${a.stars} ดาว ${a.score} เซฟ ${JSON.stringify(s1)}`);
    await L.tapEl(p, v, '.pl-card [data-act="retry"]', R, `${tag} เล่นซ้ำ`);
    await L.startTap(p, v, R, tag);
    let b = await L.playLevel(p, v, R, `${tag} รอบแย่`, { lag: 30 });
    const s2 = await p.evaluate(() => window.__sjApp.save.getBest('namtok', 'tk-1'));
    R.check(b.state === 'win' && (b.stars < a.stars || b.score < a.score), `${tag}: รอบถ่วงเวลาไม่ได้ผลแย่กว่า (${b.stars} ดาว ${b.score}) ทดสอบข้อนี้ไม่ได้`);
    R.check(s2.stars === a.stars && s2.score === a.score, `${tag}: ผลแย่ (${b.stars} ดาว ${b.score}) เขียนทับของดี (${a.stars} ดาว ${a.score}) -> เซฟ ${JSON.stringify(s2)}`);
    await sleep(80); await L.audit(p, v, R, `${tag} การ์ดชนะรอบแย่`); await L.shot(p, `win-low-${v.name}`);
    R.check(b.card.includes(`${b.score} จาก ${b.max} คะแนน`) && (b.stars === 3 || b.card.includes('ได้ 3 ดาวเมื่อทำคะแนนถึง')), `${tag}: การ์ดชนะรอบแย่ไม่บอกผลรอบนี้: ${b.card}`);
    await L.tapEl(p, v, '.pl-card [data-act="exit"]', R, `${tag} กลับแผนที่`);
    await waitMap(p);
    const row = await p.evaluate(() => document.querySelector('.sheet .ms .stars3').querySelectorAll('.star.on').length);
    R.check(row === a.stars, `${tag}: แผ่นข้อมูลแสดง ${row} ดาว หลังเล่นซ้ำได้ ${b.stars} (ดีที่สุด ${a.stars})`);
    console.log(`  ${tag}: รอบดี ${a.stars} ดาว ${a.score}/${a.max}, รอบแย่ ${b.stars} ดาว ${b.score}/${b.max}, เซฟ ${JSON.stringify(s2)}, แผ่นข้อมูล ${row} ดาว`);
    // ทางกลับ: เซฟ 1 ดาวแล้วเล่นได้ดีกว่า -> ต้องดีขึ้น
    await ctx.close();
  }
  const { ctx, p } = await L.open(env, V844, 'light', R, { tag: 'ดาวดีขึ้น', hash: '#play/tha-kilen/tk-1', save: saveText({ 'tk-1': 1 }) });
  await L.startTap(p, V844, R, 'ดาวดีขึ้น');
  const c = await L.playLevel(p, V844, R, 'ดาวดีขึ้น');
  const s3 = await p.evaluate(() => window.__sjApp.save.getBest('namtok', 'tk-1'));
  R.check(s3.stars === c.stars && s3.score === c.score && c.stars === 3, `ดาวดีขึ้น: เซฟเดิม 1 ดาว เล่นได้ ${c.stars} ดาว เซฟ ${JSON.stringify(s3)}`);
  await p.reload({ waitUntil: 'load' }); await p.waitForFunction(() => !!window.__sjApp);
  R.check((await p.evaluate(() => window.__sjApp.save.getBest('namtok', 'tk-1'))).stars === 3, 'ดาวดีขึ้น: รีโหลดแล้วไม่อยู่');
  await ctx.close();
  R.ok('ดาวที่ดีที่สุด');
}

/* ---- localStorage ใช้ไม่ได้ ---- */
async function nostore(env, R) {
  const kinds = {
    'ทุกคำสั่ง throw': () => { for (const k of ['getItem', 'setItem', 'removeItem', 'clear', 'key']) Storage.prototype[k] = () => { throw new DOMException('QuotaExceededError', 'QuotaExceededError'); }; },
    'อ่าน localStorage แล้ว throw (SecurityError)': () => { Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('The operation is insecure.', 'SecurityError'); } }); },
    'อ่านได้ เขียนไม่ได้ (เต็ม)': () => { Storage.prototype.setItem = () => { throw new DOMException('QuotaExceededError', 'QuotaExceededError'); }; },
  };
  for (const [name, init] of Object.entries(kinds)) for (const v of name.startsWith('ทุก') ? [V844, V390] : [V844]) {
    const tag = `ไม่มีที่เก็บ [${name}] ${v.name}`, { ctx, p } = await L.open(env, v, 'light', R, { tag, init });
    await L.tapEl(p, v, '#b-map', R, tag);
    await p.waitForFunction(() => window.__sjApp.map && window.__sjApp.map.clustered() === false && !window.__sjApp.map.animating(), null, { timeout: 9000 }).catch(() => R.fail(`${tag}: แผนที่ไม่เลื่อนเข้าเส้นทางสอน`));
    const c = await p.evaluate(() => window.__sjApp.map.markerClient('tha-kilen'));
    await L.tapXY(p, v, c.x, c.y); await sleep(900);
    await L.tapEl(p, v, '.sheet [data-mission="tk-1"]', R, tag);
    await L.startTap(p, v, R, tag);
    const r = await L.playLevel(p, v, R, tag);
    R.check(r.state === 'win', `${tag}: เล่น tk-1 ไม่ชนะ ${r.state}`);
    R.check(r.card.includes('เครื่องนี้บันทึกเกมไม่ได้'), `${tag}: การ์ดชนะไม่บอกว่าบันทึกไม่ได้: ${r.card}`);
    await sleep(80); await L.audit(p, v, R, `${tag} การ์ดชนะ`); await L.shot(p, `nostore-win-${Object.keys(kinds).indexOf(name)}-${v.name}`);
    await L.tapEl(p, v, '.pl-card [data-act="next"]', R, tag);
    const ok2 = await p.waitForFunction(() => window.__sjApp.play && window.__sjApp.play.id === 'tk-2' && window.__sjApp.play.g.state === 'intro', null, { timeout: 4000 }).then(() => true, () => false);
    R.check(ok2, `${tag}: ไป tk-2 ไม่ได้ (ความคืบหน้าในหน่วยความจำไม่ทำงาน)`);
    if (ok2) { await L.startTap(p, v, R, tag); const r2 = await L.playLevel(p, v, R, `${tag} tk-2`); R.check(r2.state === 'win', `${tag}: tk-2 ไม่ชนะ`); await L.tapEl(p, v, '.pl-card [data-act="exit"]', R, tag); await waitMap(p); }
    const P = await L.progress(p);
    R.check(P.total === 6 && P.stations[0].missions[2].unlocked, `${tag}: ความคืบหน้าในหน่วยความจำผิด รวม ${P.total}`);
    R.check((await p.evaluate(() => document.getElementById('map-total').textContent)) === '6/42', `${tag}: ดาวรวมบนแผนที่ไม่ขึ้น`);
    console.log(`  ${tag}: เล่นได้ ชนะ 2 ภารกิจ ดาวในหน่วยความจำ ${P.total}`);
    await ctx.close();
  }
  // หน้าอื่นกับที่เก็บพัง
  for (const page of ['history.html', 'prototype/']) {
    const ctx = await env.b.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true });
    await ctx.addInitScript(kinds['ทุกคำสั่ง throw']);
    const p = await ctx.newPage(); const errs = [];
    p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await p.goto(env.game.url + page, { waitUntil: 'load' }); await sleep(400);
    const ok = await p.evaluate(() => !!(window.__sjBox && window.__sjBox.LEVELS.length === 12));
    R.check(ok && !errs.length, `ไม่มีที่เก็บ: ${page} เปิดไม่ได้หรือมี error ${JSON.stringify(errs)}`);
    await ctx.close();
  }
  R.ok('localStorage ใช้ไม่ได้');
}

/* ---- ปุ่มย้อนกลับของเบราว์เซอร์ ---- */
async function back(env, R) {
  for (const v of [V844, V390, V1280]) {
    const tag = `ย้อนกลับ ${v.name}`, { ctx, p } = await L.open(env, v, 'light', R, { tag, save: saveText({}, { 'map-intro-seen': true }) });
    const expect = async (what, f, hint) => { await sleep(450); const s = await state(p); R.check(f(s), `${tag}: ${what} -> ${JSON.stringify(s)}${hint ? ' ' + hint : ''}`); return s; };
    await L.tapEl(p, v, '#b-map', R, tag); await waitMap(p);
    const c = await p.evaluate(() => window.__sjApp.map.markerClient('tha-kilen'));
    await L.tapXY(p, v, c.x, c.y); await expect('แตะสถานี', s => s.hash === '#map/tha-kilen' && s.sheet === 'tha-kilen');
    await L.mapSettled(p);
    await L.tapEl(p, v, '.sheet [data-mission="tk-1"]', R, tag); await expect('แตะเล่น', s => s.play && s.playId === 'tk-1' && s.gs === 'intro');
    await p.goBack(); await expect('ย้อนจากการ์ดเริ่ม', s => s.map && !s.play && s.sheet === 'tha-kilen' && s.playId === null);
    await p.goForward(); await expect('เดินหน้ากลับเข้าหน้าเล่น', s => s.play && s.playId === 'tk-1' && s.gs === 'intro');
    await L.startTap(p, v, R, tag);
    await p.evaluate(() => { window.__sjApp.play.setManual(true); window.__sjApp.play.step(8); });
    await p.goBack(); await expect('ย้อนกลางเกม', s => s.map && !s.play && s.sheet === 'tha-kilen' && s.playId === null);
    await p.goBack(); await expect('ย้อนจากแผ่นข้อมูล', s => s.map && s.sheet === null && s.hash === '#map');
    await p.goBack(); await expect('ย้อนจากแผนที่', s => s.home && s.hash === '');
    await p.goForward(); await expect('เดินหน้าไปแผนที่', s => s.map && s.sheet === null);
    await p.goForward(); await expect('เดินหน้าไปแผ่นข้อมูล', s => s.map && s.sheet === 'tha-kilen');
    await p.goForward(); await expect('เดินหน้าไปหน้าเล่น (เริ่มใหม่ที่การ์ดเริ่ม)', s => s.play && s.gs === 'intro');
    // ชนะแล้ว "ภารกิจถัดไป" (แทนที่ประวัติ) แล้วย้อน: ต้องกลับแผ่นข้อมูล ไม่ใช่ภารกิจก่อน
    await L.startTap(p, v, R, tag); await L.playLevel(p, v, R, tag);
    await L.tapEl(p, v, '.pl-card [data-act="next"]', R, tag); await expect('ภารกิจถัดไป', s => s.playId === 'tk-2');
    await p.goBack(); await expect('ย้อนหลังกดภารกิจถัดไป', s => s.map && s.sheet === 'tha-kilen');
    const rows = await p.evaluate(() => [...document.querySelectorAll('.sheet .ms')].map(li => li.querySelectorAll('.star.on').length));
    R.check(rows[0] === 3, `${tag}: ย้อนกลับมาแล้วแผ่นข้อมูลไม่แสดงดาวใหม่ ${JSON.stringify(rows)}`);
    // ปุ่มปิดแผ่นข้อมูล แล้วหน้าแรก
    await L.tapEl(p, v, '.sheet [data-act="close"]', R, tag); await expect('ปิดแผ่นข้อมูล', s => s.map && s.sheet === null && s.hash === '#map');
    await L.tapEl(p, v, '.map-top [data-act="home"]', R, tag); await expect('ปุ่มหน้าแรก', s => s.home);
    await p.goBack(); await expect('ย้อนจากหน้าแรกกลับแผนที่', s => s.map);
    // เปิดสถานี A แล้วสถานี B (แทนที่) แล้วย้อน
    for (const id of ['tha-kilen', 'wang-pho']) { const m = await p.evaluate(i => window.__sjApp.map.markerClient(i), id); await L.tapXY(p, v, m.x, m.y); await sleep(700); await L.mapSettled(p); }
    await expect('เปิดสองสถานีต่อกัน', s => s.sheet === 'wang-pho');
    await p.goBack(); await expect('ย้อนหลังเปิดสองสถานี', s => s.map && s.sheet === null);
    // ออกไปเกมเวอร์ชันเดิมแล้วย้อนกลับ
    await p.goto(env.game.url, { waitUntil: 'load' });
    await L.tapEl(p, v, '#b-proto', R, tag); await p.waitForURL(/prototype\/$/); await p.waitForFunction(() => !!window.__sjBox);
    await p.goBack({ waitUntil: 'load' }); await p.waitForFunction(() => !!window.__sjApp); await expect('ย้อนจากเกมเวอร์ชันเดิม', s => s.home);
    await ctx.close();
    // ลิงก์ตรงเข้าหน้าเล่น (ไม่มีประวัติ) แล้วกดออก
    const o = await L.open(env, v, 'light', R, { tag: tag + ' ลิงก์ตรง', hash: '#play/tha-kilen/tk-1' });
    await L.tapEl(o.p, v, '.pl-card [data-act="exit"]', R, tag); await sleep(500);
    const s = await state(o.p);
    R.check(s.map && s.sheet === 'tha-kilen', `${tag}: ลิงก์ตรงแล้วกด "กลับ" -> ${JSON.stringify(s)}`);
    // ข้ามสถานีด้วย "ภารกิจถัดไป" แล้วกด "กลับแผนที่": ไปแผ่นของสถานีไหน
    const q = await L.open(env, v, 'light', R, { tag: tag + ' ข้ามสถานี', save: saveText(stars(3, IDS.slice(0, 2)), { 'map-intro-seen': true }) });
    await L.tapEl(q.p, v, '#b-map', R, tag); await waitMap(q.p);
    const m = await q.p.evaluate(() => window.__sjApp.map.markerClient('tha-kilen')); await L.tapXY(q.p, v, m.x, m.y); await sleep(800);
    await L.tapEl(q.p, v, '.sheet [data-mission="tk-3"]', R, tag); await L.startTap(q.p, v, R, tag); await L.playLevel(q.p, v, R, tag);
    await L.tapEl(q.p, v, '.pl-card [data-act="next"]', R, tag); await sleep(400);
    const s1 = await state(q.p);
    R.check(s1.playId === 'wp-1', `${tag}: ภารกิจถัดไปหลัง tk-3 ไม่ใช่ wp-1 ${JSON.stringify(s1)}`);
    await L.tapEl(q.p, v, '.pl-card [data-act="exit"]', R, tag); await sleep(600);
    const s2 = await state(q.p);
    if (s2.sheet !== 'wang-pho') R.note(`${tag}: เล่น tk-3 ชนะ -> "ภารกิจถัดไป" (wp-1 ของวังโพ) -> "กลับ" แล้วกลับไปแผ่นข้อมูล ${s2.sheet} ไม่ใช่วังโพ (${s2.hash})`);
    await o.ctx.close(); await q.ctx.close();
  }
  R.ok('ปุ่มย้อนกลับ');
}

/* ---- ทางแพ้ ---- */
const FAIL_TH = { HEAD_ON: 'ชนประสานงา', REAR_END: 'ชนท้าย', SIDE: 'ชนสีข้างที่ประแจ', HEAD_ON_BLOCK: 'ปล่อยรถเข้าตอนที่มีขบวนสวนมา', RUN_THROUGH: 'รถฝ่าประแจ', DERAIL_UNDER: 'สับประแจขณะรถทับอยู่', DEADLOCK: 'ทางตัน ไม่มีทางไหนตั้งได้', MAX_WAIT: 'ขบวนรอนานเกินกำหนด' };
async function replay(p, v, R, tag, rec, realTaps) {
  await p.evaluate(() => window.__sjApp.play.setManual(true));
  let cur = 0;
  for (const a of rec.actions) {
    if (a.step > cur) { await p.evaluate(n => { const P = window.__sjApp.play; for (let i = 0; i < n && P.g.state === 'play'; i++) P.step(0.0001); }, a.step - cur); cur = a.step; }
    const tap = realTaps && (a.target.kind === 'signal' || a.target.kind === 'point');
    if (tap) { const c = await p.evaluate(t => window.__sjApp.play.targetClient(t), a.target); await L.tapXY(p, v, c.x, c.y); } else await p.evaluate(t => window.__sjApp.play.press(t), a.target);
    if ((await p.evaluate(() => window.__sjApp.play.g.state)) !== 'play') break;
  }
  await p.evaluate(n => { const P = window.__sjApp.play; for (let i = 0; i < n && P.g.state === 'play'; i++) P.step(0.0001); }, Math.max(0, rec.steps - cur) + 5);
  return p.evaluate(() => { const g = window.__sjApp.play.g; return { state: g.state, code: g.result && g.result.code, time: +g.time.toFixed(1) }; });
}
async function failCard(p, v, R, tag, code, shotName) {
  await sleep(120);
  const c = await p.evaluate(() => { const el = document.querySelector('.pl-card'); return el ? { eyebrow: el.querySelector('.eyebrow') ? el.querySelector('.eyebrow').textContent : '', title: el.querySelector('h2').textContent, body: [...el.querySelectorAll('p')].map(x => x.textContent), btns: [...el.querySelectorAll('button')].map(b => b.textContent), stall: !document.querySelector('.pl-stall').hidden } : null; });
  if (!R.check(!!c, `${tag}: ไม่มีการ์ดแพ้`)) return;
  R.check(c.eyebrow.includes('ไม่ผ่าน') && c.eyebrow.includes(FAIL_TH[code]), `${tag}: หัวการ์ดแพ้ "${c.eyebrow}" ไม่ตรงกับสาเหตุ ${code} (${FAIL_TH[code]})`);
  R.check(c.btns.includes('ลองอีกครั้ง') && c.btns.some(b => b.startsWith('กลับ')), `${tag}: การ์ดแพ้ไม่มีปุ่มครบ ${JSON.stringify(c.btns)}`);
  R.check(!c.stall, `${tag}: แถบ stall ค้างอยู่บนการ์ดแพ้`);
  await L.audit(p, v, R, `${tag} การ์ดแพ้`); await L.shot(p, shotName);
  console.log(`  ${tag}: [${c.eyebrow}] ${c.title} — ${c.body.join(' / ')}`);
  // ไม่ค้าง: ลองอีกครั้ง -> การ์ดเริ่ม -> เริ่ม -> เวลาเดินจริง
  await L.tapEl(p, v, '.pl-card [data-act="retry"]', R, `${tag} ลองอีกครั้ง`);
  R.check((await p.evaluate(() => window.__sjApp.play.g.state)) === 'intro', `${tag}: ลองอีกครั้งแล้วไม่กลับการ์ดเริ่ม`);
  await L.startTap(p, v, R, tag);
  await p.evaluate(() => window.__sjApp.play.setManual(false)); await sleep(700);
  const t = await p.evaluate(() => ({ s: window.__sjApp.play.g.state, t: window.__sjApp.play.g.time, score: document.getElementById('pl-score').textContent, done: document.getElementById('pl-done').textContent }));
  R.check(t.s === 'play' && t.t > 0.2 && t.score === '0' && t.done.startsWith('0/'), `${tag}: หลังลองอีกครั้งเกมไม่เดิน/ไม่รีเซ็ต ${JSON.stringify(t)}`);
}
async function failPaths(env, R) {
  const list = [
    { key: 'RUN_THROUGH@tk-3', career: true }, { key: 'DERAIL_UNDER@tk-3', career: true },
    { key: 'HEAD_ON@x-4' }, { key: 'DEADLOCK@j-1' }, { key: 'DEADLOCK@j-2' },
  ];
  for (const v of [V844, V390]) {
    for (const it of list) {
      const rec = RECIPES[it.key], tag = `แพ้ ${it.key} ${v.name}`;
      if (!rec) { R.note(`${tag}: ไม่มีสูตร (รัน qa-fail-recipes.mjs ก่อน)`); continue; }
      const { ctx, p } = await L.open(env, v, 'light', R, { tag, save: FULL, hash: it.career ? `#play/${stationOf(rec.id)}/${rec.id}` : `#dev/${rec.pack}/${rec.id}` });
      await L.startTap(p, v, R, tag);
      const era = await p.evaluate(() => window.__sjApp.play.g.era.nx);
      const r = await replay(p, v, R, tag, rec, !era);
      if (R.check(r.state === 'fail' && r.code === rec.code, `${tag}: เล่นซ้ำสูตรแล้วได้ ${JSON.stringify(r)} (คาด ${rec.code})`)) await failCard(p, v, R, tag, rec.code, `fail-${rec.code}-${rec.id}-${v.name}`);
      // แพ้อีกรอบแล้วกด "กลับแผนที่/กลับ"
      await p.evaluate(() => { const P = window.__sjApp.play; P.setManual(true); P.restart(); P.start(); });
      const r2 = await replay(p, v, R, tag, rec, false);
      if (r2.state === 'fail') { await sleep(80); await L.tapEl(p, v, '.pl-card [data-act="exit"]', R, `${tag} กลับ`); await sleep(500); const s = await state(p); R.check(it.career ? s.map && s.sheet === stationOf(rec.id) : !s.playId, `${tag}: กดกลับจากการ์ดแพ้ -> ${JSON.stringify(s)}`); }
      await ctx.close();
    }
    // รอเกินเวลา (np-3): ปล่อยเฉย ๆ
    const tag = `แพ้ MAX_WAIT@np-3 ${v.name}`, { ctx, p } = await L.open(env, v, 'light', R, { tag, save: FULL, hash: '#play/nong-pla-duk-jn/np-3' });
    await L.startTap(p, v, R, tag);
    const r = await p.evaluate(() => { const P = window.__sjApp.play; P.setManual(true); let stall = null; for (let i = 0; i < 400 && P.g.state === 'play'; i++) { P.step(0.5); if (stall === null && !document.querySelector('.pl-stall').hidden) stall = P.g.time; } return { state: P.g.state, code: P.g.result && P.g.result.code, time: +P.g.time.toFixed(1), stallAt: stall }; });
    console.log(`  ${tag}: ปล่อยนิ่ง -> ${JSON.stringify(r)}`);
    if (R.check(r.state === 'fail' && r.code === 'MAX_WAIT', `${tag}: ปล่อยนิ่งแล้วได้ ${JSON.stringify(r)}`)) await failCard(p, v, R, tag, 'MAX_WAIT', `fail-MAX_WAIT-np-3-${v.name}`);
    await ctx.close();
  }
  R.ok('ทางแพ้');
}

/* ---- แถบ stall ---- */
async function stall(env, R) {
  for (const v of [V844, V390, V1280]) {
    const tag = `stall ${v.name}`, { ctx, p } = await L.open(env, v, v === V1280 ? 'dark' : 'light', R, { tag, hash: '#play/tha-kilen/tk-1' });
    await L.startTap(p, v, R, tag);
    const a = await p.evaluate(() => { const P = window.__sjApp.play; P.setManual(true); P.step(30); const early = !document.querySelector('.pl-stall').hidden; P.step(40); return { early, state: P.g.state, stalled: !!P.g.stalled, time: P.g.time, bar: !document.querySelector('.pl-stall').hidden, text: document.querySelector('.pl-stall p').textContent, hint: P.hint(), wait: P.g.trains.map(t => +(t.wait || 0).toFixed(0)) }; });
    R.check(!a.early && a.state === 'play' && a.stalled && a.bar && a.text.includes('45 วินาที') && !!a.hint, `${tag}: ทิ้งนิ่ง 70 วิ -> ${JSON.stringify(a)}`);
    await sleep(120); await L.audit(p, v, R, `${tag} แถบ`); await L.shot(p, `stall-${v.name}`);
    console.log(`  ${tag}: "${a.text}" คำใบ้ ${JSON.stringify(a.hint)}`);
    await L.tapEl(p, v, '.pl-stall [data-act="unstall"]', R, `${tag} เล่นต่อ`);
    R.check(await p.evaluate(() => document.querySelector('.pl-stall').hidden && window.__sjApp.play.g.state === 'play'), `${tag}: ปุ่ม "เล่นต่อ" บนแถบไม่ปิดแถบ`);
    // นิ่งต่ออีก 60 วิ: แถบกลับมาไหม (ผู้เล่นปิดแล้วยังไม่ทำอะไร)
    const again = await p.evaluate(() => { const P = window.__sjApp.play; P.step(60); return { bar: !document.querySelector('.pl-stall').hidden, stalled: !!P.g.stalled, hint: !!P.hint() }; });
    if (!again.bar) R.note(`${tag}: ปิดแถบด้วย "เล่นต่อ" แล้วนิ่งต่ออีก 60 วิ แถบไม่กลับมาอีก (คำใบ้บนแผง ${again.hint ? 'ยังอยู่' : 'หาย'})`);
    // ทำตามคำใบ้จนจบ: ต้องชนะได้
    const r = await L.playLevel(p, v, R, `${tag} เล่นต่อจนจบ`);
    R.check(r.state === 'win', `${tag}: หลัง stall เล่นต่อแล้วไม่ชนะ ${r.state} ${r.code}`);
    R.check(await p.evaluate(() => document.querySelector('.pl-stall').hidden), `${tag}: แถบ stall ค้างบนการ์ดชนะ`);
    // เริ่มใหม่จากแถบ
    await L.tapEl(p, v, '.pl-card [data-act="retry"]', R, tag); await L.startTap(p, v, R, tag);
    await p.evaluate(() => { const P = window.__sjApp.play; P.setManual(true); P.step(70); });
    await L.tapEl(p, v, '.pl-stall [data-act="retry"]', R, `${tag} เริ่มใหม่`);
    R.check(await p.evaluate(() => window.__sjApp.play.g.state === 'intro' && document.querySelector('.pl-stall').hidden), `${tag}: ปุ่ม "เริ่มใหม่" บนแถบไม่ทำงาน`);
    // เวลาจริง: stall แล้วทำตามคำใบ้ แถบต้องหายเอง
    await L.startTap(p, v, R, tag);
    await p.evaluate(() => { const P = window.__sjApp.play; P.setManual(true); P.step(70); P.setManual(false); });
    const h = await p.evaluate(() => { const P = window.__sjApp.play, t = P.nextTarget(); return t && P.targetClient(t); });
    if (h) { await L.tapXY(p, v, h.x, h.y); await sleep(900); R.check(await p.evaluate(() => document.querySelector('.pl-stall').hidden), `${tag}: ขบวนขยับแล้วแถบ stall ไม่หายเอง`); }
    await ctx.close();
  }
  R.ok('แถบ stall');
}

/* ---- พัก / เล่นต่อ / เริ่มใหม่ / ออก / แท็บถูกพัก ---- */
async function pause(env, R) {
  for (const v of [V844, V390, V1280]) {
    const tag = `พัก ${v.name}`, { ctx, p } = await L.open(env, v, 'light', R, { tag, save: saveText({}, { 'map-intro-seen': true }) });
    await L.tapEl(p, v, '#b-map', R, tag); await waitMap(p);
    const m = await p.evaluate(() => window.__sjApp.map.markerClient('tha-kilen')); await L.tapXY(p, v, m.x, m.y); await sleep(900);
    await L.tapEl(p, v, '.sheet [data-mission="tk-1"]', R, tag);
    // ปุ่มพักตอนการ์ดเริ่มยังเปิด: ต้องไม่ทำอะไร
    await p.waitForFunction(() => window.__sjApp.play && window.__sjApp.play.g.state === 'intro');
    await L.startTap(p, v, R, tag);
    const T = () => p.evaluate(() => window.__sjApp.play.g.time);
    await sleep(600); const t0 = await T();
    R.check(t0 > 0.2, `${tag}: เวลาจริงไม่เดิน (${t0})`);
    await L.tapEl(p, v, '.pl-bar [data-act="menu"]', R, `${tag} ปุ่มพัก`);
    const t1 = await T(); await sleep(700); const t2 = await T();
    const card = (await p.textContent('.pl-card')).replace(/\s+/g, ' ');
    R.check(t2 === t1 && card.includes('หยุดเวลาไว้') && ['ออก', 'เริ่มใหม่', 'เล่นต่อ'].every(s => card.includes(s)), `${tag}: พักแล้วเวลายังเดิน (${t1} -> ${t2}) หรือการ์ดไม่ครบ`);
    await L.audit(p, v, R, `${tag} การ์ดพัก`); await L.shot(p, `pause-${v.name}`);
    // แตะแผงใต้การ์ดขณะพัก: ต้องไม่สั่งการ
    const sig = await p.evaluate(() => { const P = window.__sjApp.play, t = { kind: 'signal', id: Object.keys(P.g.L.S)[0] }; return { c: P.targetClient(t), a: P.g.S[t.id].aspect, id: t.id }; });
    await L.tapXY(p, v, sig.c.x, sig.c.y);
    R.check((await p.evaluate(i => window.__sjApp.play.g.S[i].aspect, sig.id)) === sig.a, `${tag}: แตะแผงขณะพักแล้วเสาเปลี่ยน`);
    await L.tapEl(p, v, '.pl-card [data-act="resume"]', R, `${tag} เล่นต่อ`); await sleep(600);
    const t3 = await T();
    R.check(t3 > t2 + 0.2 && t3 < t2 + 1.5 && await p.evaluate(() => document.querySelector('.pl-ov').hidden), `${tag}: เล่นต่อแล้วเวลาไม่เดินตามปกติ (${t2} -> ${t3})`);
    if (!v.touch) { await p.keyboard.press('Escape'); await sleep(150); R.check(await p.evaluate(() => window.__sjApp.play.paused), `${tag}: Esc ไม่พัก`); await p.keyboard.press('Escape'); await sleep(150); R.check(!(await p.evaluate(() => window.__sjApp.play.paused)), `${tag}: Esc ไม่เล่นต่อ`); }
    // แท็บถูกซ่อน: ต้องพักเอง กลับมาแล้วยังพักอยู่จนกดเล่นต่อ
    await p.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
    const h1 = await T(); await sleep(500);
    await p.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });
    await sleep(300); const h2 = await T();
    R.check(h2 === h1 && await p.evaluate(() => window.__sjApp.play.paused && !!document.querySelector('.pl-card')), `${tag}: แท็บถูกซ่อนแล้วเกมไม่พักเอง (${h1} -> ${h2})`);
    await L.tapEl(p, v, '.pl-card [data-act="resume"]', R, `${tag} เล่นต่อหลังกลับมา`);
    // แท็บถูกแช่แข็ง (CDP frozen) 2.5 วินาทีแล้วกลับมา: เวลาในเกมต้องไม่กระโดด และเกมยังเดิน
    const cdp = await ctx.newCDPSession(p); const f1 = await T();
    let frozen = true;
    try { await cdp.send('Page.setWebLifecycleState', { state: 'frozen' }); await sleep(2500); await cdp.send('Page.setWebLifecycleState', { state: 'active' }); } catch (e) { frozen = false; R.note(`${tag}: จำลองแท็บแช่แข็งผ่าน CDP ไม่ได้ (${e.message.split('\n')[0]})`); }
    await sleep(500); const f2 = await T(), st = await p.evaluate(() => ({ s: window.__sjApp.play.g.state, paused: window.__sjApp.play.paused }));
    if (frozen) { if (st.s !== 'play') R.fail(`${tag}: หลังแช่แข็งแท็บ เกมไม่อยู่ในสถานะเล่น`); R.note(`${tag}: ข้าม — CDP frozen ใน headless ไม่หยุด rAF จริง วัดการกระโดดของเวลาไม่ได้ (${f1.toFixed(1)} -> ${f2.toFixed(1)})`); if (0) R.check(st.s === 'play' && f2 - f1 < 1.6, `${tag}: แท็บแช่แข็ง 2.5 วิแล้วกลับมา เวลาในเกมกระโดด ${f1.toFixed(1)} -> ${f2.toFixed(1)} ${JSON.stringify(st)}`); console.log(`  ${tag}: แช่แข็ง 2.5 วิ เวลาในเกม ${f1.toFixed(2)} -> ${f2.toFixed(2)} สถานะ ${JSON.stringify(st)}`); }
    if (st.paused) await L.tapEl(p, v, '.pl-card [data-act="resume"]', R, tag);
    await sleep(300); const f3 = await T(); await sleep(400); R.check((await T()) > f3, `${tag}: หลังแท็บกลับมา เกมไม่เดินต่อ`);
    // พัก -> เริ่มใหม่
    await L.tapEl(p, v, '.pl-bar [data-act="menu"]', R, tag); await L.tapEl(p, v, '.pl-card [data-act="retry"]', R, `${tag} เริ่มใหม่`);
    R.check(await p.evaluate(() => window.__sjApp.play.g.state === 'intro' && window.__sjApp.play.g.time === 0 && !window.__sjApp.play.paused), `${tag}: พัก -> เริ่มใหม่ ไม่กลับการ์ดเริ่ม`);
    // ปุ่มพักขณะการ์ดเริ่ม
    await p.evaluate(() => document.querySelector('.pl-bar [data-act="menu"]').click());
    R.check((await p.textContent('.pl-card')).includes('เริ่มเดินรถ'), `${tag}: กดพักตอนการ์ดเริ่มแล้วการ์ดเปลี่ยน`);
    await L.startTap(p, v, R, tag); await sleep(300);
    // ×2
    await L.tapEl(p, v, '.pl-bar [data-act="fast"]', R, tag); const x1 = await T(); await sleep(1000); const x2 = await T();
    R.check(x2 - x1 > 1.5 && x2 - x1 < 2.6, `${tag}: ×2 เดิน ${(x2 - x1).toFixed(2)} วิ ใน 1 วิจริง`);
    // พัก -> ออก
    await L.tapEl(p, v, '.pl-bar [data-act="menu"]', R, tag); await L.tapEl(p, v, '.pl-card [data-act="exit"]', R, `${tag} ออก`); await sleep(500);
    const s = await state(p);
    R.check(s.map && s.sheet === 'tha-kilen' && s.playId === null, `${tag}: พัก -> ออก -> ${JSON.stringify(s)}`);
    R.check((await L.progress(p)).total === 0, `${tag}: ออกกลางคันแล้วได้ดาว`);
    // เข้าใหม่: ต้องเริ่มที่การ์ดเริ่ม ไม่ใช่เกมค้าง
    await L.tapEl(p, v, '.sheet [data-mission="tk-1"]', R, tag); await sleep(300);
    R.check((await state(p)).gs === 'intro', `${tag}: เข้าใหม่หลังออกกลางคันไม่เริ่มที่การ์ดเริ่ม`);
    await ctx.close();
  }
  R.ok('พัก/เล่นต่อ/เริ่มใหม่/ออก/แท็บถูกพัก');
}

/* ---- หมุนจอระหว่างเล่น ---- */
async function rotate(env, R) {
  const v = V844, tag = 'หมุนจอ', { ctx, p } = await L.open(env, v, 'light', R, { tag, save: FULL, hash: '#play/kanchanaburi/kb-2' });
  await L.startTap(p, v, R, tag);
  await p.evaluate(() => { const P = window.__sjApp.play; P.setManual(true); });
  const some = async (n, vv) => { for (let i = 0; i < n; i++) { const s = await p.evaluate(() => { const P = window.__sjApp.play; let t = P.nextTarget(); for (let k = 0; !t && k < 60 && P.g.state === 'play'; k++) { P.step(0.05); t = P.nextTarget(); } return t ? { t, c: P.targetClient(t), before: JSON.stringify(P.snapshot().signals || null) } : null; }); if (!s) continue; await L.tapXY(p, vv, s.c.x, s.c.y); const nx = await p.evaluate(() => window.__sjApp.play.nextTarget()); if (JSON.stringify(nx) === JSON.stringify(s.t)) { await sleep(30); const again = await p.evaluate(() => window.__sjApp.play.nextTarget()); if (JSON.stringify(again) === JSON.stringify(s.t)) R.note(`${tag} ${vv.name}: แตะ ${JSON.stringify(s.t)} แล้วคำใบ้ยังเป็นอันเดิม`); } } };
  await some(5, v);
  const before = await p.evaluate(() => ({ t: window.__sjApp.play.g.time, score: window.__sjApp.play.g.score, n: window.__sjApp.play.g.trains.length }));
  const vp = { ...V390 };
  await p.setViewportSize({ width: 390, height: 844 }); await sleep(400);
  const lay = await p.evaluate(() => ({ ...window.__sjApp.stage.layout, t: window.__sjApp.play.g.time, n: window.__sjApp.play.g.trains.length, state: window.__sjApp.play.g.state }));
  R.check(lay.rotated && lay.w === 844 && lay.h === 390 && lay.state === 'play' && lay.n === before.n, `${tag}: หมุนเป็นแนวตั้งระหว่างเล่น -> ${JSON.stringify(lay)}`);
  await L.auditBoard(p, vp, R, `${tag} แนวตั้ง`); await L.audit(p, vp, R, `${tag} แนวตั้ง`, { allowClip: ['pl-queue'] }); await L.shot(p, 'rotate-mid-390x844');
  await some(5, vp);
  await p.setViewportSize({ width: 1180, height: 820 }); await sleep(400);
  await L.auditBoard(p, VIEWS[2], R, `${tag} เป็น 1180x820`); await L.shot(p, 'rotate-mid-1180x820');
  await some(4, VIEWS[2]);
  await p.setViewportSize({ width: 844, height: 390 }); await sleep(400);
  R.check(!(await p.evaluate(() => window.__sjApp.stage.layout.rotated)), `${tag}: หมุนกลับแล้วเวทียังหมุน`);
  await L.shot(p, 'rotate-mid-back-844x390');
  const r = await L.playLevel(p, v, R, `${tag} เล่นต่อจนจบ`);
  R.check(r.state === 'win', `${tag}: หมุนจอ 3 ครั้งแล้วเล่นต่อไม่ชนะ ${r.state} ${r.code || ''}`);
  console.log(`  ${tag}: kb-2 หมุน 844x390 -> 390x844 -> 1180x820 -> 844x390 แล้วเล่นจบ ${r.state} ${r.score}/${r.max}`);
  // หมุนขณะการ์ดเปิด และบนแผนที่ตอนแผ่นข้อมูลเปิด
  await p.setViewportSize({ width: 390, height: 844 }); await sleep(300); await L.audit(p, vp, R, `${tag} การ์ดชนะหลังหมุน`); await L.shot(p, 'rotate-win-390x844');
  await p.goto(env.game.url + '#map/kanchanaburi', { waitUntil: 'load' }); await waitMap(p);
  await p.setViewportSize({ width: 844, height: 390 }); await sleep(500); await L.mapSettled(p);
  await L.audit(p, v, R, `${tag} แผนที่+แผ่นหลังหมุน`); await L.shot(p, 'rotate-map-844x390');
  const mk = await p.evaluate(() => { const c = window.__sjApp.map.markerClient('kanchanaburi'), el = document.elementFromPoint(c.x, c.y); return { c, hit: el && el.closest('.mk') ? el.closest('.mk').dataset.id : (el ? el.className : null) }; });
  R.check(mk.hit === 'kanchanaburi', `${tag}: หลังหมุน ปุ่มสถานีที่เปิดแผ่นอยู่ไม่อยู่ในส่วนที่มองเห็น/แตะไม่โดน ${JSON.stringify(mk)}`);
  await ctx.close();
  R.ok('หมุนจอระหว่างเล่น');
}

/* ---- จอเล็กมาก ---- */
async function tiny(env, R) {
  const sizes = [[568, 320], [320, 568], [480, 320], [667, 375], [360, 640], [740, 360]];
  for (const [w, h] of sizes) {
    const v = { name: `${w}x${h}`, width: w, height: h, dpr: 2, touch: true }, tag = `จอเล็ก ${v.name}`;
    const { ctx, p } = await L.open(env, v, 'light', R, { tag, save: FULL });
    await L.audit(p, v, R, `${tag} หน้าแรก`); await L.shot(p, `tiny-home-${v.name}`);
    const scroll = await p.evaluate(() => { const s = document.getElementById('s-home'); return { sh: s.scrollHeight, ch: s.clientHeight, ov: getComputedStyle(s).overflowY }; });
    if (scroll.sh > scroll.ch + 1) R.note(`${tag}: หน้าแรกสูงเกินจอ ${scroll.sh} > ${scroll.ch} (overflow-y ${scroll.ov})`);
    await L.tapEl(p, v, '#b-map', R, tag); await waitMap(p);
    await L.audit(p, v, R, `${tag} แผนที่`); await L.shot(p, `tiny-map-${v.name}`);
    const m = await p.evaluate(() => { const c = window.__sjApp.map.markerClient('kanchanaburi'), el = document.elementFromPoint(c.x, c.y); return { ...c, hit: el && el.closest('.mk') ? el.closest('.mk').dataset.id || 'cluster' : null }; });
    if (m.hit !== 'kanchanaburi') R.note(`${tag}: ปุ่มสถานีกาญจนบุรีแตะไม่ได้ทันทีที่เปิดแผนที่ (โดน ${m.hit})`);
    await p.goto(env.game.url + '#map/nong-pla-duk-jn', { waitUntil: 'load' }); await waitMap(p);
    await L.audit(p, v, R, `${tag} แผ่นข้อมูล`); await L.shot(p, `tiny-sheet-${v.name}`);
    // แผ่นข้อมูลตั้งใจให้เลื่อนได้: เลื่อนถึงปุ่มเล่นอันสุดท้ายแล้วต้องเห็นเต็มปุ่มและแตะได้จริง
    const last = await p.evaluate(() => { const bs = [...document.querySelectorAll('.sheet [data-act="play"]')], b = bs[bs.length - 1]; b.closest('.sheet').scrollTop = 1e6; return b.dataset.mission; });
    await sleep(300);
    const vis2 = await p.evaluate(m => { const b = document.querySelector(`.sheet [data-mission="${m}"]`).getBoundingClientRect(); return b.top >= 0 && b.left >= 0 && b.bottom <= innerHeight && b.right <= innerWidth; }, last);
    R.check(vis2, `${tag}: เลื่อนแผ่นข้อมูลแล้วปุ่มเล่น ${last} ยังไม่อยู่ในจอเต็มปุ่ม`);
    await L.tapEl(p, v, `.sheet [data-mission="${last}"]`, R, `${tag} ปุ่มเล่นหลังเลื่อน`);
    const okp = await p.waitForFunction(m => window.__sjApp.play && window.__sjApp.play.id === m, last, { timeout: 4000 }).then(() => true, () => false);
    R.check(okp, `${tag}: เลื่อนแผ่นข้อมูลแล้วแตะปุ่มเล่น ${last} ไม่เปิดภารกิจ`);
    for (const id of ['kb-3', 'np-3']) {
      await p.goto(env.game.url + `#play/${stationOf(id)}/${id}`, { waitUntil: 'load' });
      await p.waitForFunction(i => window.__sjApp && window.__sjApp.play && window.__sjApp.play.id === i, id);
      await sleep(150); await L.audit(p, v, R, `${tag} การ์ดเริ่ม ${id}`); if (id === 'np-3') await L.shot(p, `tiny-intro-${v.name}`);
      // ปุ่มเริ่มต้องเห็นได้โดยไม่ต้องเลื่อนการ์ด
      const vis = await p.evaluate(() => { const b = document.querySelector('.pl-card [data-act="start"]').getBoundingClientRect(), c = document.querySelector('.pl-card'); return { inView: b.top >= 0 && b.left >= 0 && b.bottom <= innerHeight && b.right <= innerWidth, scroll: c.scrollHeight > c.clientHeight + 1 }; });
      R.check(vis.inView, `${tag}: ปุ่ม "เริ่มเดินรถ" ของ ${id} ไม่อยู่ในจอ`);
      await L.startTap(p, v, R, tag);
      const b = await L.auditBoard(p, v, R, `${tag} แผง ${id}`);
      const r = await L.playLevel(p, v, R, `${tag} ${id}`, { onMid: async () => { await L.audit(p, v, R, `${tag} ระหว่างเล่น ${id}`, { allowClip: ['pl-queue'] }); await L.shot(p, `tiny-board-${id}-${v.name}`); } });
      R.check(r.state === 'win', `${tag}: ${id} แตะจริงไม่ชนะ ${r.state} ${r.code || ''}`);
      await sleep(80); await L.audit(p, v, R, `${tag} การ์ดชนะ ${id}`);
      console.log(`  ${tag}: ${id} ${r.state} เป้า ${b.dia.toFixed(0)} px ระยะใกล้สุด ${b.minGap.toFixed(0)} px (${b.pair}) scale ${b.scale.toFixed(2)}`);
    }
    await L.shot(p, `tiny-win-${v.name}`);
    await ctx.close();
  }
  R.ok('จอเล็กมาก');
}

(async () => {
  const env = await L.launch(), R = L.createReport('qa-rules');
  const run = async (name, fn) => { if (!on(name)) return; console.log(`\n# ${name}`); try { await fn(env, R); } catch (e) { R.fail(`${name}: สคริปต์ล้ม ${e.stack.split('\n').slice(0, 4).join(' | ')}`); } };
  try {
    await run('gates', gates); await run('best', best); await run('nostore', nostore); await run('back', back);
    await run('fail', failPaths); await run('stall', stall); await run('pause', pause); await run('rotate', rotate); await run('tiny', tiny);
  } finally { await env.close(); }
  process.exit(R.done() ? 1 : 0);
})();
