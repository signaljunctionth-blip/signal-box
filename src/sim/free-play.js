// ภารกิจเดินรถอิสระของผังที่ผู้เล่นสร้าง (โหมดสร้าง M4): เดาตารางขบวนจากขาเข้าออกและทางจอดของผัง
// แล้วให้บอทตามคำใบ้ลองเล่นก่อน คืนตารางแรกที่บอทเล่นจบ ผู้เล่นจึงไม่เจอผังที่เล่นไม่จบเพราะตารางขบวนเดาผิด
// โมดูลล้วน รันใน Node ได้ (ใช้ในเทสต์และในหน้าจอโหมดสร้าง)
import { loadLevelPack } from './levels.js';
import { createGame, startGame, step } from './game.js';
import { nextTarget } from './hint.js';
import { press } from './control.js';

const BOT_DT = 0.05, BOT_STEPS = 12000;

// บอทตามคำใบ้แบบเดียวกับ test/lib/bot.js คืน 'win' | 'fail' | 'timeout'
export function botPlay(pack, i = 0) {
  const g = createGame(pack, i);
  startGame(g);
  for (let n = 0; n < BOT_STEPS && g.state === 'play'; n++) {
    for (let m = 0; m < 6 && g.state === 'play'; m++) { const t = nextTarget(g); if (!t) break; press(g, t); }
    step(g, BOT_DT);
  }
  return g.state === 'play' ? 'timeout' : g.state;
}

// opts.speed / opts.grace = ตัวคูณจากอัปเกรด (economy.js UPGRADES) ไม่ใส่ = 1
function packOf(station, eras, era, trains, { speed = 1, grace = 1 } = {}) {
  const j = { schema: 2, id: 'build', name_th: 'ผังของฉัน', eras, levels: [{
    id: 'free', station: station.id, era, name: 'เดินรถอิสระ', speed: Math.round(60 * speed), hints: true,
    waitGrace: { entry: Math.round(6 * grace * 10) / 10, ready: Math.round(4 * grace * 10) / 10 },
    goal: 'รับขบวนเข้าทางจอด แล้วปล่อยออกให้ครบทุกขบวน', teaches: 'ทดลองผังที่คุณสร้าง',
    tips: ['ผังนี้คุณสร้างเอง ตารางขบวนเกมจัดให้', 'ดูตารางอินเตอร์ล็อกในหน้าโหมดสร้างได้ว่าเส้นทางไหนขัดกัน'], trains,
  }] };
  const r = loadLevelPack(j, { [station.id]: station }, {});
  return r.ok && !r.pack.levels[0].error ? r.pack : null;
}

// คืน { ok: true, pack, trains } หรือ { ok: false, reason }
// eras = รายการยุคของชุดภารกิจ (เช่น pack.eras ของน้ำตก), era = ลำดับยุคที่จะเล่น
export function freePlayPack(station, eras, { era = 2, count = 4, speed = 1, grace = 1 } = {}) {
  const mul = { speed, grace };
  if (!station || !station.bidir) return { ok: false, reason: 'ผังนี้ยังเล่นไม่ได้' };
  const portals = Object.values(station.portals), ins = portals.filter(p => p.in), outs = portals.filter(p => p.out);
  const plats = station.plats.filter(n => !station.noPlatform.includes(n));
  if (!ins.length || !outs.length) return { ok: false, reason: 'ผังต้องมีขาที่รถเข้าได้และออกได้' };
  if (!plats.length) return { ok: false, reason: 'ผังต้องมีทางจอดที่มีชานชาลาอย่างน้อย 1 ทาง' };
  // ทิศของขบวน: สลับไปมาระหว่างขาสองฝั่ง (ผังปลายทางที่มีขาเดียว เข้าแล้วกลับออกขาเดิม)
  const pairs = [];
  for (const a of ins) for (const b of outs) if (a.id !== b.id) pairs.push([a.id, b.id]);
  if (!pairs.length) for (const a of ins) pairs.push([a.id, a.id]);
  const order = [pairs[0], ...pairs.slice(1).filter(([a, b]) => a === pairs[0][1] && b === pairs[0][0]), ...pairs.slice(1)];
  for (let n = Math.min(count, 6); n >= 1; n--) {
    const trains = [];
    for (let i = 0; i < n; i++) {
      const [from, to] = order[i % Math.min(order.length, 2)];
      // ขบวนแรกสองขบวนเข้ามาใกล้กัน (ได้หลีกกันถ้าผังมีทางหลีก) ขบวนถัดไปตามหลังเมื่อขบวนก่อนหน้าพ้นจอ
      const when = i < 2 ? { at: 1 + 2 * i } : { after: { train: i - 1, event: 'cleared', delay: 3 } };
      const pick = [...plats.slice(i % plats.length), ...plats.slice(0, i % plats.length)].find(no => packOf(station, eras, era, [...trains, { ...when, from, to, track: no }], mul));
      if (pick === undefined) break;
      trains.push({ ...when, from, to, track: pick });
    }
    if (trains.length < n) continue;
    const pack = packOf(station, eras, era, trains, mul);
    if (pack && botPlay(pack) === 'win') return { ok: true, pack, trains };
  }
  return { ok: false, reason: 'เกมหาตารางขบวนที่เล่นจบบนผังนี้ไม่ได้ ลองเพิ่มทางหลีกหรือเสาออก' };
}
