// QA ข้อ 2: ผู้เล่นใหม่จากเซฟเปล่า เล่นด้วยการแตะที่พิกัดจอจริง (เวลาจริง ไม่ใช้ hook สั่ง press)
//   หน้าแรก -> แผนที่ -> ท่ากิเลน -> tk-1 จนจบ -> ดาวขึ้นบนแผนที่ -> ภารกิจถัดไปเปิด -> รีโหลดแล้วยังอยู่
//   แล้วเล่นต่อให้ครบ 14 ภารกิจตามลำดับปลดล็อก (แตะจริง เวลาเดินด้วย step) ตรวจลิงก์ตรงเข้าของที่ล็อกทุกขั้น
// ใช้: node test/qa-walk.js [ชื่อขนาดจอ,...]
const L = require('./qa-lib.js');
const { IDS, stationOf, VIEWS, sleep } = L;
const SCHEME = { '844x390': 'light', '390x844': 'dark', '1180x820': 'dark', '1280x800': 'light' };
const only = process.argv[2] ? process.argv[2].split(',') : null;

async function walk(env, v, R, table) {
  const scheme = SCHEME[v.name], tag = `${v.name}-${scheme}`;
  const { ctx, p, log } = await L.open(env, v, scheme, R, { tag });
  const where = s => `${tag} ${s}`;
  const lay = await p.evaluate(() => window.__sjApp.stage.layout);
  R.check(lay.rotated === (v.height > v.width), where(`การหมุนเวทีผิด ${JSON.stringify(lay)}`));

  // หน้าแรก
  R.check((await p.textContent('#b-map')).trim() === 'เริ่มเล่น', where('ปุ่มหน้าแรกของเซฟเปล่าไม่ใช่ "เริ่มเล่น"'));
  await L.audit(p, v, R, where('หน้าแรก'));
  await L.shot(p, `walk-${tag}-1home`);
  await L.tapEl(p, v, '#b-map', R, where('หน้าแรก'));
  await p.waitForFunction(() => window.__sjApp.map && !document.getElementById('s-map').hidden, null, { timeout: 15000 });
  R.check((await p.evaluate(() => location.hash)) === '#map', where('แตะปุ่มแล้ว hash ไม่ใช่ #map'));
  // ครั้งแรก: เห็นทั้งประเทศแล้วกล้องเลื่อนเข้าเส้นทางสอนเอง
  await sleep(300); await L.shot(p, `walk-${tag}-2map-first`);
  await p.waitForFunction(() => window.__sjApp.map.clustered() === false && !window.__sjApp.map.animating(), null, { timeout: 8000 }).catch(() => R.fail(where('กล้องไม่เลื่อนเข้าเส้นทางสอนเองใน 8 วินาที (ปุ่มสถานียังรวมกลุ่ม)')));
  await sleep(150); await L.audit(p, v, R, where('แผนที่เส้นทางสอน')); await L.shot(p, `walk-${tag}-3map-route`);
  const P0 = await L.progress(p);
  R.check(P0.total === 0 && P0.stations[0].state === 'open' && P0.stations.slice(1).every(s => s.state === 'locked'), where(`สถานะเริ่มต้นผิด ${JSON.stringify(P0.stations.map(s => s.state))}`));

  // แตะสถานีที่ล็อก (วังโพ) ก่อน: แผ่นข้อมูลต้องบอกเงื่อนไข ไม่มีปุ่มเล่น
  const tapMarker = async id => {
    const c = await p.evaluate(i => { const c = window.__sjApp.map.markerClient(i), top = document.elementFromPoint(c.x, c.y), mk = top && top.closest('.mk'); return { ...c, hit: mk ? mk.dataset.id || 'cluster' : (top ? top.tagName + '.' + top.className : null) }; }, id);
    R.check(c.hit === id, where(`จุดแตะของปุ่มสถานี ${id} (${c.x.toFixed(0)},${c.y.toFixed(0)}) ไปโดน ${c.hit}`));
    await L.tapXY(p, v, c.x, c.y);
    await p.waitForFunction(i => window.__sjApp.map.openId() === i, id, { timeout: 4000 }).catch(() => R.fail(where(`แตะปุ่มสถานี ${id} แล้วแผ่นข้อมูลไม่เปิด`)));
    await L.mapSettled(p); await sleep(120);
  };
  await tapMarker('wang-pho');
  const lockTxt = (await p.textContent('.sheet')).replace(/\s+/g, ' ');
  R.check(lockTxt.includes('ยังล็อกอยู่') && lockTxt.includes('ท่ากิเลน') && !(await p.$('.sheet [data-act="play"]')), where(`แผ่นข้อมูลสถานีล็อก (วังโพ) ไม่ถูก: ${lockTxt.slice(0, 160)}`));
  await L.audit(p, v, R, where('แผ่นข้อมูลวังโพ (ล็อก)')); await L.shot(p, `walk-${tag}-4sheet-locked`);
  // ปุ่ม "ไปสถานีท่ากิเลน" ในกล่องล็อก
  await L.tapEl(p, v, '.sheet .lockbox [data-act="station"]', R, where('กล่องล็อกวังโพ'));
  await p.waitForFunction(() => window.__sjApp.map.openId() === 'tha-kilen', null, { timeout: 4000 }).catch(() => R.fail(where('ปุ่ม "ไปสถานีท่ากิเลน" ไม่เปิดแผ่นข้อมูลท่ากิเลน')));
  await L.mapSettled(p); await sleep(150);
  const sh = await p.evaluate(() => [...document.querySelectorAll('.sheet .ms')].map(li => ({ t: li.querySelector('b').textContent, locked: li.classList.contains('locked'), btn: (li.querySelector('button') || {}).textContent || '' })));
  R.check(sh.length === 3 && sh[0].btn === 'เล่น' && sh[1].locked && sh[2].locked, where(`รายการภารกิจท่ากิเลนของเซฟเปล่าผิด ${JSON.stringify(sh)}`));
  await L.audit(p, v, R, where('แผ่นข้อมูลท่ากิเลน')); await L.shot(p, `walk-${tag}-5sheet-thakilen`);

  // เล่น tk-1 เวลาจริง แตะจริง
  await L.tapEl(p, v, '.sheet [data-mission="tk-1"]', R, where('ปุ่มเล่น tk-1'));
  await p.waitForFunction(() => window.__sjApp.play && window.__sjApp.play.g.state === 'intro', null, { timeout: 5000 });
  const intro = (await p.textContent('.pl-card')).replace(/\s+/g, ' ');
  for (const t of ['เกมนี้ไม่ใช่ผลงานทางการของการรถไฟแห่งประเทศไทย', 'ไม่ใช่ขั้นตอนปฏิบัติงานจริง', 'ผังจำลองจากข้อมูลสาธารณะ', 'ระบบสัญญาณสมมุติ', 'ชื่อเสาในเกมนี้เกมตั้งเอง', 'เป้าหมาย', 'เริ่มเดินรถ']) R.check(intro.includes(t), where(`การ์ดเริ่ม tk-1 ไม่มี "${t}"`));
  await sleep(100); await L.audit(p, v, R, where('การ์ดเริ่ม tk-1')); await L.shot(p, `walk-${tag}-6intro`);
  await L.startTap(p, v, R, where('การ์ดเริ่ม tk-1'));
  R.check(await p.evaluate(() => window.__sjApp.play.g.state) === 'play', where('แตะ "เริ่มเดินรถ" แล้วเกมไม่เริ่ม'));
  await L.tapEl(p, v, '.pl-bar [data-act="fast"]', R, where('ปุ่ม ×2'));
  R.check(await p.evaluate(() => document.querySelector('[data-act="fast"]').getAttribute('aria-pressed')) === 'true', where('ปุ่ม ×2 ไม่ติด'));
  const bd = await L.auditBoard(p, v, R, where('แผง tk-1'));
  const r = await L.playLevel(p, v, R, where('tk-1 เวลาจริง'), { manual: false, real: true, onMid: async () => { await L.audit(p, v, R, where('ระหว่างเล่น tk-1')); await L.shot(p, `walk-${tag}-7play`); } });
  R.check(r.state === 'win' && r.done === r.total, where(`tk-1 แตะจริงเวลาจริงไม่ชนะ: ${r.state} ${r.code || ''} ${r.done}/${r.total}`));
  R.check(r.missed === 0, where(`tk-1: มีการแตะที่ไม่เกิดผล ${r.missed} ช่วง`));
  await sleep(150); await L.audit(p, v, R, where('การ์ดชนะ tk-1')); await L.shot(p, `walk-${tag}-8win`);
  R.check(r.card.includes('ส่งครบ 3 ขบวน') && r.card.includes(`${r.score} จาก ${r.max} คะแนน`) && r.card.includes('ภารกิจถัดไป'), where(`การ์ดชนะไม่ครบ: ${r.card}`));
  console.log(`  ${tag}: tk-1 เวลาจริง แตะ ${r.taps} ครั้ง ${r.score}/${r.max} ${r.stars} ดาว ใช้เวลาจริง ${(r.realMs / 1000).toFixed(0)} วิ (เวลาในเกม ${r.time}) เป้าแผง ${bd.dia.toFixed(0)} px ระยะใกล้สุด ${bd.minGap.toFixed(0)} px (${bd.pair})`);
  table.push({ view: tag, id: 'tk-1', mode: 'แตะจริง เวลาจริง', ...r });

  // กลับแผนที่: ดาวขึ้น ภารกิจถัดไปเปิด
  await L.tapEl(p, v, '.pl-card [data-act="exit"]', R, where('การ์ดชนะ'));
  await p.waitForFunction(() => !document.getElementById('s-map').hidden && window.__sjApp.map.openId() === 'tha-kilen', null, { timeout: 4000 }).catch(() => R.fail(where('กด "กลับแผนที่" แล้วไม่กลับไปแผ่นข้อมูลท่ากิเลน')));
  await L.mapSettled(p); await sleep(150);
  const after = await p.evaluate(() => ({ hash: location.hash, rows: [...document.querySelectorAll('.sheet .ms')].map(li => ({ on: li.querySelectorAll('.star.on').length, locked: li.classList.contains('locked'), btn: (li.querySelector('button') || {}).textContent || '' })), mk: document.querySelector('.mk[data-id="tha-kilen"] .mk-s').textContent, total: document.getElementById('map-total').textContent, head: document.querySelector('.sheet .starcount').textContent }));
  R.check(after.hash === '#map/tha-kilen' && after.rows[0].on === r.stars && after.rows[0].btn === 'เล่นซ้ำ' && after.rows[1].btn === 'เล่น' && after.rows[2].locked, where(`หลังชนะ tk-1 แผ่นข้อมูลไม่ถูก ${JSON.stringify(after)}`));
  R.check(after.mk === `${r.stars}/9` && after.total === `${r.stars}/42` && after.head === `${r.stars}/9`, where(`ดาวบนแผนที่ไม่ตรง: ป้ายสถานี ${after.mk} รวม ${after.total} หัวแผ่น ${after.head}`));
  await L.shot(p, `walk-${tag}-9map-after`);

  // ลิงก์ตรงเข้าของที่ล็อก ตอนมีแค่ tk-1
  const directLocked0 = async id => {
    await p.goto(env.game.url + `#play/${stationOf(id)}/${id}`, { waitUntil: 'load' });
    await p.waitForFunction(() => window.__sjApp && window.__sjApp.map, null, { timeout: 8000 }).catch(() => {});
    await sleep(250);
    const s = await p.evaluate(() => ({ hash: location.hash, play: !!window.__sjApp.play, playShown: !document.getElementById('s-play').hidden, mapShown: !document.getElementById('s-map').hidden, sheet: window.__sjApp.map.openId() }));
    R.check(!s.play && !s.playShown && s.mapShown && s.hash === `#map/${stationOf(id)}` && s.sheet === stationOf(id), where(`ลิงก์ตรง #play/${stationOf(id)}/${id} ขณะล็อก (มีแค่ tk-1): ${JSON.stringify(s)}`));
  };
  // รีโหลด: ความคืบหน้ายังอยู่ (ทั้งหน้าแผนที่และหน้าแรก)
  await p.reload({ waitUntil: 'load' }); await p.waitForFunction(() => window.__sjApp && window.__sjApp.map && window.__sjApp.map.openId() === 'tha-kilen', null, { timeout: 8000 }).catch(() => R.fail(where('รีโหลดที่ #map/tha-kilen แล้วแผ่นข้อมูลไม่กลับมา')));
  const P1 = await L.progress(p);
  await L.mapSettled(p); await sleep(200); await L.shot(p, `walk-${tag}-10reload`);
  for (const id of ['tk-3', 'wp-1', 'kb-1', 'np-3']) await directLocked0(id);
  R.check(P1 && P1.total === r.stars && P1.stations[0].missions[1].unlocked && !P1.stations[0].missions[2].unlocked && P1.stations[1].state === 'locked', where(`รีโหลดแล้วความคืบหน้าหาย ${JSON.stringify(P1)}`));
  await p.goto(env.game.url, { waitUntil: 'load' }); await p.waitForFunction(() => !!window.__sjApp);
  R.check((await p.textContent('#b-map')).trim() === 'เล่นต่อ', where('หน้าแรกหลังมีความคืบหน้าไม่ขึ้น "เล่นต่อ"'));

  // ---- เล่นต่อให้ครบ 14 ภารกิจตามลำดับปลดล็อก ----
  await p.evaluate(() => window.__sjApp.ready());
  const directLocked = async (id, why) => {
    // ลิงก์ตรงเข้าภารกิจที่ยังล็อก: ต้องไม่เปิดหน้าเล่น
    await p.goto(env.game.url + `#play/${stationOf(id)}/${id}`, { waitUntil: 'load' });
    await p.waitForFunction(() => window.__sjApp && window.__sjApp.map, null, { timeout: 8000 }).catch(() => {});
    await sleep(250);
    const s = await p.evaluate(() => ({ hash: location.hash, play: !!window.__sjApp.play, playShown: !document.getElementById('s-play').hidden, mapShown: !document.getElementById('s-map').hidden }));
    R.check(!s.play && !s.playShown && s.mapShown && s.hash.startsWith('#map'), where(`ลิงก์ตรง #play/${stationOf(id)}/${id} ขณะล็อก (${why}) เข้าได้: ${JSON.stringify(s)}`));
    return s;
  };
  for (let i = 0; i < IDS.length; i++) {
    const id = IDS[i], st = stationOf(id), nextId = IDS[i + 1];
    if (nextId && i > 0) await directLocked(nextId, `ยังไม่ผ่าน ${id}`);
    if (i + 2 < IDS.length && i % 3 === 0 && i > 0) await directLocked(IDS[i + 2], `ยังไม่ผ่าน ${id}`);
    if (i === 0) { /* tk-1 ผ่านแล้วจากรอบเวลาจริง: เล่นซ้ำผ่านลิงก์ตรงเพื่อเก็บในตาราง */ }
    await p.goto(env.game.url + `#play/${st}/${id}`, { waitUntil: 'load' });
    const okOpen = await p.waitForFunction(i2 => window.__sjApp && window.__sjApp.play && window.__sjApp.play.id === i2 && window.__sjApp.play.g.state === 'intro', id, { timeout: 8000 }).then(() => true, () => false);
    if (!R.check(okOpen, where(`เปิด #play/${st}/${id} ไม่ได้ทั้งที่ควรปลดล็อกแล้ว (hash ตอนนี้ ${await p.evaluate(() => location.hash)})`))) break;
    await p.evaluate(() => document.fonts.ready);
    const card = (await p.textContent('.pl-card')).replace(/\s+/g, ' ');
    R.check(card.includes('เกมนี้ไม่ใช่ผลงานทางการของการรถไฟแห่งประเทศไทย') && card.includes('ชื่อเสาในเกมนี้เกมตั้งเอง'), where(`${id}: การ์ดเริ่ม (เข้าทางลิงก์ตรง) ไม่มีข้อความปฏิเสธ`));
    await L.audit(p, v, R, where(`การ์ดเริ่ม ${id}`));
    if (id.endsWith('-1') || id === 'np-3') { await sleep(80); await L.shot(p, `intro-${id}-${tag}`); }
    await L.startTap(p, v, R, where(`การ์ดเริ่ม ${id}`));
    const b = await L.auditBoard(p, v, R, where(`แผง ${id}`));
    const before = await L.progress(p);
    const lastOfStation = !nextId || stationOf(nextId) !== st;
    const g = await L.playLevel(p, v, R, where(id), { manual: true, real: true, onMid: lastOfStation ? async () => { await L.audit(p, v, R, where(`ระหว่างเล่น ${id}`), { allowClip: ['pl-queue'] }); await L.shot(p, `board-${st}-${tag}`); } : null });
    R.check(g.state === 'win' && g.done === g.total, where(`${id}: ไม่ชนะ ${g.state} ${g.code || ''} ${g.done}/${g.total} เวลา ${g.time}`));
    const now = await L.progress(p), saved = await p.evaluate(i2 => window.__sjApp.career.stars(i2), id);
    R.check(saved === Math.max(g.stars || 0, id === 'tk-1' ? r.stars : 0), where(`${id}: ดาวในเซฟ ${saved} ไม่ตรงกับผล ${g.stars}`));
    await sleep(60); await L.audit(p, v, R, where(`การ์ดชนะ ${id}`));
    // การปลดล็อก: ภารกิจถัดไป/สถานีถัดไป และด่านดาวสะสม
    let unlockNote = '';
    if (nextId) {
      const ns = now.stations.find(s => s.id === stationOf(nextId)), nm = ns.missions.find(m => m.id === nextId);
      R.check(nm.unlocked, where(`ผ่าน ${id} (${g.stars} ดาว รวม ${now.total}) แล้ว ${nextId} ยังล็อก`));
      if (lastOfStation) {
        const was = before.stations.find(s => s.id === ns.id).state;
        R.check(was === 'locked' && ns.state === 'open', where(`สถานี ${ns.id}: ก่อน ${was} หลัง ${ns.state}`));
        const nm2 = await p.evaluate(() => (document.querySelector('.pl-news') || {}).textContent || '');
        R.check(nm2.includes('ปลดล็อกสถานี'), where(`${id}: การ์ดชนะไม่บอกว่าปลดล็อกสถานีถัดไป (${g.card})`));
        unlockNote = `${nm2} (ดาวรวม ${now.total})`;
        await L.shot(p, `win-unlock-${id}-${tag}`);
      }
      R.check(g.card.includes('ภารกิจถัดไป'), where(`${id}: การ์ดชนะไม่มีปุ่มภารกิจถัดไป`));
    } else {
      R.check(!g.card.includes('ภารกิจถัดไป'), where(`np-3: การ์ดชนะสุดท้ายยังมีปุ่มภารกิจถัดไป (${g.card})`));
      await L.shot(p, `win-last-${tag}`);
    }
    table.push({ view: tag, id, mode: 'แตะจริง เวลา step', ...g, total: now.total, dia: b.dia, gap: b.minGap, pair: b.pair, unlockNote });
    // ทดสอบปุ่ม "ภารกิจถัดไป" ด้วยการแตะ (สลับกับการเข้าทางลิงก์ตรง)
    if (nextId && i % 2 === 0) {
      await L.tapEl(p, v, '.pl-card [data-act="next"]', R, where(`การ์ดชนะ ${id}`));
      const okNext = await p.waitForFunction(i2 => window.__sjApp.play && window.__sjApp.play.id === i2 && window.__sjApp.play.g.state === 'intro', nextId, { timeout: 4000 }).then(() => true, () => false);
      R.check(okNext && (await p.evaluate(() => location.hash)) === `#play/${stationOf(nextId)}/${nextId}`, where(`ปุ่ม "ภารกิจถัดไป" หลัง ${id} ไม่พาไป ${nextId} (hash ${await p.evaluate(() => location.hash)})`));
    }
  }
  // จบ: แผนที่ต้องตรงกับผล
  await p.goto(env.game.url + '#map', { waitUntil: 'load' });
  await p.waitForFunction(() => window.__sjApp && window.__sjApp.map, null, { timeout: 8000 });
  await L.mapSettled(p); await sleep(300);
  const fin = await L.progress(p), sum = table.filter(t => t.view === tag && t.mode !== 'แตะจริง เวลาจริง').reduce((a, t) => a + (t.stars || 0), 0);
  const tk1 = Math.max(r.stars, table.find(t => t.view === tag && t.id === 'tk-1' && t.mode !== 'แตะจริง เวลาจริง').stars);
  R.check(fin.stations.every(s => s.state === 'done'), where(`จบ 14 ภารกิจแล้วสถานะสถานีไม่ใช่ผ่านทั้งหมด ${JSON.stringify(fin.stations.map(s => s.state))}`));
  const mapTotal = await p.evaluate(() => document.getElementById('map-total').textContent);
  R.check(mapTotal === `${fin.total}/42`, where(`ดาวรวมบนแผนที่ ${mapTotal} ไม่ตรงกับ ${fin.total}`));
  await L.audit(p, v, R, where('แผนที่หลังจบ')); await L.shot(p, `map-done-${tag}`);
  console.log(`  ${tag}: จบ 14 ภารกิจ ดาวรวม ${fin.total}/42 (ผลรอบนี้ ${sum}, tk-1 ดีที่สุด ${tk1}) คำขอ ${log.requests.length} ออกนอกเครื่อง ${log.external.length} console error ${log.errors.length} warning ${log.warnings.length}`);
  await ctx.close();
}

(async () => {
  const env = await L.launch(), R = L.createReport('qa-walk'), table = [];
  try {
    await Promise.all(VIEWS.filter(v => !only || only.includes(v.name)).map(v => walk(env, v, R, table).catch(e => R.fail(`${v.name}: สคริปต์ล้ม ${e.stack.split('\n').slice(0, 3).join(' | ')}`))));
  } finally { await env.close(); }
  console.log('\nตาราง (ขนาดจอ | ภารกิจ | วิธี | ผล | ขบวน | คะแนน | ดาว | เวลาในเกม | แตะ | เป้า px | ระยะใกล้สุด px)');
  for (const t of table) console.log([t.view, t.id, t.mode, t.state, `${t.done}/${t.total === undefined ? '' : ''}${t.done !== undefined ? '' : ''}`, `${t.score}/${t.max}`, t.stars, t.time, t.taps, t.dia ? t.dia.toFixed(0) : '', t.gap ? `${t.gap.toFixed(0)} (${t.pair})` : '', t.unlockNote || ''].join(' | '));
  process.exit(R.done() ? 1 : 0);
})();
