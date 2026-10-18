// เนื้อหาการ์ด: แนะนำด่าน / ชนะ / แพ้ (ข้อความเดิมของต้นแบบ v2) คืนเป็น HTML ให้ play.js วาง
export const starStr = n => '★'.repeat(n) + '☆'.repeat(3 - n);

// withStart = true: การ์ดก่อนเริ่มด่าน, false: เปิดจากปุ่ม "วิธีเล่น" ระหว่างเล่น
export function introHtml(g, pack, withStart) {
  const l = g.lv, era = g.era, firstOfEra = pack.levels.findIndex(x => x.era === l.era) === g.i;
  return `<span class="eyebrow">ด่าน ${g.i + 1} · ${era.yr} · ${era.name}</span><h3>${l.name}</h3>
    ${firstOfEra || !withStart ? `<p class="muted">${era.story}</p>` : ''}
    <p><b>เป้าหมาย:</b> ${l.goal}</p>
    <ul>${l.tips.map(t => `<li>${t}</li>`).join('')}</ul>
    <p class="tip">${l.trains.length} ขบวน · ขบวนธรรมดา: เข้าถูกชานชาลา +100 ส่งออก +50 · ขบวนด่วนผ่านไม่ต้องหยุด +150${l.maxWait ? ` · ห้ามรอเกิน ${l.maxWait} วินาที` : ''}</p>
    <div class="row">${withStart ? '<button class="btn go" type="button" data-act="start">เริ่มเดินรถ</button>' : '<button class="btn go" type="button" data-act="resume">เล่นต่อ</button>'}</div>`;
}

// ev = event 'fail' จาก sim
export function failHtml(ev) {
  return `<h3>${ev.title}</h3><p>${ev.why}</p><p class="muted">${ev.lesson}</p>
    <div class="row"><button class="btn" type="button" data-act="home">เลือกด่าน</button><button class="btn go" type="button" data-act="retry">ลองอีกครั้ง</button></div>`;
}

// ev = event 'win' จาก sim, last = เป็นด่านสุดท้ายของชุด, canNext = ด่านถัดไปเปิดเล่นได้
export function winHtml(g, ev, last, canNext = !last) {
  const st = ev.stars;
  return `<div class="stars" aria-label="${st} ดาว">${starStr(st)}</div>
    <h3 style="text-align:center">ส่งครบ ${g.lv.trains.length} ขบวน · ${ev.score} คะแนน</h3>
    <p class="muted" style="text-align:center">${st < 3 ? 'ได้ 3 ดาวเมื่อทำคะแนนถึง 80% ลดเวลารอของขบวนเพื่อเก็บคะแนน' : 'เดินรถได้ลื่นมาก'}${last ? ' · คุณผ่านครบ 4 ยุคของระบบอาณัติสัญญาณแล้ว' : ''}</p>
    <div class="row"><button class="btn" type="button" data-act="retry">เล่นอีกครั้ง</button>${!canNext ? '<button class="btn go" type="button" data-act="home">กลับหน้าด่าน</button>' : '<button class="btn go" type="button" data-act="next">ด่านถัดไป</button>'}</div>`;
}
