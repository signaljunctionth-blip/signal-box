// ตัวเล่นเพลงแบบมองล่วงหน้า: ตั้งเวลาโน้ตล่วงหน้า 0.15 วินาที เพื่อให้จังหวะไม่สะดุดเมื่อเบราว์เซอร์ช้า
// เพลงหนึ่งท่อน = bars ห้อง ห้องละ 16 ช่อง (โน้ตตัวละ 1/16)

const LOOKAHEAD = 0.15;
const TICK_MS = 25;

export class Sequencer {
  constructor(ctx, out) {
    this.ctx = ctx;
    this.out = out;
    this.song = null;
    this.timer = null;
    this.bus = null;
  }

  play(song) {
    this.stop();
    const { ctx } = this;
    // บัสของเพลงนี้ ใส่ฟิลเตอร์โทนรวม แล้วค่อย ๆ ดังขึ้น
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = song.tone ?? 12000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(1, ctx.currentTime + 0.8);
    lp.connect(g);
    g.connect(this.out);
    this.bus = { lp, g };
    this.song = song;
    this.step = 0;
    this.next = ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.tick(), TICK_MS);
    this.tick();
  }

  tick() {
    const { ctx, song } = this;
    const stepDur = 60 / song.bpm / 4;
    const total = song.bars * 16;
    while (this.next < ctx.currentTime + LOOKAHEAD) {
      const s = this.step % total;
      const loop = Math.floor(this.step / total);
      // สวิง: เลื่อนโน้ตตกจังหวะ (ช่องที่ 2 ของทุกจังหวะ) ไปช้าลงเล็กน้อย
      const swing = s % 4 === 2 ? (song.swing ?? 0) * stepDur : 0;
      song.step({ ctx, out: this.bus.lp, s, bar: s >> 4, pos: s & 15, loop, t: this.next + swing, stepDur });
      this.next += stepDur;
      this.step++;
    }
  }

  stop(fade = 0.4) {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.bus) {
      const { g, lp } = this.bus;
      const t = this.ctx.currentTime;
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(Math.max(g.gain.value, 0.0001), t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + fade);
      setTimeout(() => { try { g.disconnect(); lp.disconnect(); } catch { /* ตัดแล้ว */ } }, (fade + 0.3) * 1000 + LOOKAHEAD * 1000);
    }
    this.bus = null;
    this.song = null;
  }
}
