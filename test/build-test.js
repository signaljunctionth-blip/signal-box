// ตรวจผลลัพธ์ build ใน dist/ (รันหลัง vite build — ใช้: npm run test:build)
// 1) มี dist/index.html, dist/history.html (เกมเวอร์ชันโมดูล) และ dist/prototype/index.html
// 2) ไม่มี URL แบบ absolute ขึ้นต้นด้วย "/" (จะพังเมื่อวางในโฟลเดอร์ย่อย เช่น GitHub Pages /ชื่อ-repo/)
// 3) ไม่มีการอ้าง Google Fonts หรือโหลดไฟล์จากโดเมนภายนอก
// 4) เปิดจริงจากโฟลเดอร์ย่อยด้วย Playwright: ไม่มี error ไม่มีคำขอล้มเหลว ไม่มีคำขอออกนอกเครื่อง ฟอนต์ที่ฝังโหลดได้
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');

const dist = path.resolve(__dirname, '../dist');
const fails = [];
const fail = (m) => fails.push(m);

const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap(e =>
  e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);

for (const f of ['index.html', 'history.html', 'prototype/index.html', 'prototype/fonts/fonts.css', 'prototype/fonts/OFL-Mitr.txt', 'prototype/fonts/OFL-Anuphan.txt']) {
  if (!fs.existsSync(path.join(dist, f))) fail(`ไม่พบ dist/${f}`);
}
if (fails.length) { console.error(fails.join('\n')); console.error('✗ build ไม่ครบ (รัน npm run build ก่อน)'); process.exit(1); }

const files = walk(dist);
const CHECKS = [
  [/\b(?:src|href|action|poster|srcset|data)\s*=\s*["']?\/[^"'\s>]*/gi, 'attribute ชี้ path absolute'],
  [/url\(\s*["']?\/[^)]*\)/gi, 'url() ชี้ path absolute'],
  [/@import\s+["']\/[^"']*/gi, '@import ชี้ path absolute'],
  [/["'`]\/(?:assets|prototype|fonts|src|data)\/[^"'`]*/g, 'สตริงชี้ path absolute'],
  [/fonts\.(?:googleapis|gstatic)\.com/gi, 'อ้าง Google Fonts'],
  [/url\(\s*["']?(?:https?:)?\/\/[^)]*\)/gi, 'url() ชี้โดเมนภายนอก'],
  [/<(?:script|link|img|iframe|audio|video|source)\b[^>]*\b(?:src|href)\s*=\s*["']?(?:https?:)?\/\/[^"'\s>]*/gi, 'แท็กโหลดไฟล์จากโดเมนภายนอก'],
];
let scanned = 0;
for (const f of files) {
  if (!/\.(html|css|js|mjs|json|svg|webmanifest)$/.test(f)) continue;
  scanned++;
  const text = fs.readFileSync(f, 'utf8');
  for (const [re, label] of CHECKS) {
    for (const m of text.matchAll(re)) fail(`${path.relative(dist, f)}: ${label}: ${m[0].slice(0, 120)}`);
  }
}

// .html ส่งแบบไม่บอก charset โดยตั้งใจ: หน้าเว็บต้องประกาศ <meta charset> เอง (vite preview และเซิร์ฟเวอร์บางตัวไม่ส่ง charset ให้)
const MIME = { '.html': 'text/html', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml' };
const SUB = '/sub/folder/';
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (!url.startsWith(SUB)) { res.writeHead(404); return res.end('นอกโฟลเดอร์ย่อย'); }
  let file = path.join(dist, url.slice(SUB.length));
  if (!file.startsWith(dist)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const b = await chromium.launch();
  try {
    for (const page of ['', 'history.html', 'prototype/']) {
      const p = await b.newPage({ viewport: { width: 844, height: 390 } });
      const name = 'dist/' + page;
      p.on('pageerror', e => fail(`${name}: page error: ${e.message}`));
      p.on('console', m => { if (m.type() === 'error') fail(`${name}: console error: ${m.text()}`); });
      p.on('requestfailed', r => fail(`${name}: โหลดไม่ได้: ${r.url()}`));
      p.on('request', r => { if (!/^(data|blob):/.test(r.url()) && !r.url().startsWith(origin + SUB)) fail(`${name}: คำขอออกนอกโฟลเดอร์/ออกนอกเครื่อง: ${r.url()}`); });
      p.on('response', r => { if (r.status() >= 400) fail(`${name}: HTTP ${r.status()}: ${r.url()}`); });
      await p.goto(origin + SUB + page, { waitUntil: 'load' });
      const t = await p.title();
      if (t !== 'ห้องสัญญาณ 200 ปี') fail(`${name}: ชื่อหน้าอ่านไม่ออกหรือไม่ถูก (ลืม <meta charset="utf-8"> หรือเปล่า): ${t}`);
      const fonts = await p.evaluate(async () => {
        await Promise.all([document.fonts.load('500 20px Mitr', 'ห้อง A'), document.fonts.load('400 16px Anuphan', 'ห้อง A')]);
        await document.fonts.ready;
        return { mitr: document.fonts.check('500 20px Mitr', 'ห้อง A'), anuphan: document.fonts.check('400 16px Anuphan', 'ห้อง A'), loaded: [...document.fonts].filter(f => f.status === 'loaded').length };
      });
      if (!fonts.mitr || !fonts.anuphan || fonts.loaded < 4) fail(`${name}: ฟอนต์ที่ฝังโหลดไม่ครบ ${JSON.stringify(fonts)}`);
      if (page === '') {
        const title = await p.textContent('h1');
        if (title.trim() !== 'ห้องสัญญาณ 200 ปี') fail(`${name}: ชื่อเกมไม่ถูก: ${title}`);
        const href = await p.getAttribute('#b-proto', 'href');
        if (href !== './prototype/') fail(`${name}: ลิงก์ต้นแบบไม่ใช่ path relative: ${href}`);
        if (!(await p.textContent('#disclaimer')).includes('ไม่ใช่ผลงานทางการของการรถไฟแห่งประเทศไทย')) fail(`${name}: ไม่มีข้อความปฏิเสธความเป็นทางการ`);
        const hrefH = await p.getAttribute('#b-history', 'href');
        if (hrefH !== './history.html') fail(`${name}: ลิงก์โหมดประวัติศาสตร์ไม่ใช่ path relative: ${hrefH}`);
        if ((await p.textContent('#b-history')).trim() !== 'โหมดประวัติศาสตร์ 200 ปี') fail(`${name}: ไม่พบปุ่ม "โหมดประวัติศาสตร์ 200 ปี"`);
        await Promise.all([p.waitForURL(origin + SUB + 'history.html'), p.click('#b-history')]);
        if (!(await p.evaluate(() => !!(window.__sjBox && window.__sjBox.LEVELS.length === 12)))) fail(`${name}: กดปุ่มแล้วไปไม่ถึงเกมโหมดประวัติศาสตร์`);
        await p.goBack({ waitUntil: 'load' });
        await Promise.all([p.waitForURL(origin + SUB + 'prototype/'), p.click('#b-proto')]);
        if (!(await p.evaluate(() => !!window.__sjBox))) fail(`${name}: กดปุ่มแล้วไปไม่ถึงต้นแบบ`);
      } else if (!(await p.evaluate(() => !!(window.__sjBox && window.__sjBox.LEVELS.length === 12)))) {
        fail(`${name}: ${page === 'history.html' ? 'เกมโหมดประวัติศาสตร์' : 'ต้นแบบ'}ไม่ทำงาน (ไม่พบ __sjBox หรือไม่ครบ 12 ด่าน)`);
      }
      await p.waitForTimeout(300);
      await p.close();
    }
  } finally {
    await b.close();
    server.close();
  }
  const size = files.reduce((n, f) => n + fs.statSync(f).size, 0);
  console.log(`dist: ${files.length} ไฟล์ ${(size / 1024).toFixed(0)} KB, ตรวจข้อความ ${scanned} ไฟล์, เปิดจาก ${SUB}`);
  if (size > 20 * 1024 * 1024) fail(`dist ใหญ่เกิน 20 MB (${(size / 1048576).toFixed(1)} MB)`);
  if (fails.length) { console.error([...new Set(fails)].join('\n')); console.error('✗ ผลลัพธ์ build ไม่ผ่าน'); process.exit(1); }
  console.log('✓ build ผ่าน: path เป็น relative ทั้งหมด ไม่มีคำขอออกนอกเครื่อง');
})().catch(e => { console.error(e); process.exit(1); });
