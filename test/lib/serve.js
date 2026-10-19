// ที่อยู่ของเกมสำหรับเทสต์หน้าจอ: ตั้ง SJ_URL (เช่น http://localhost:5173/) = ใช้ dev server ที่รันอยู่
// ไม่ตั้ง = เปิดเซิร์ฟเวอร์ไฟล์นิ่งเสิร์ฟ dist/ จากโฟลเดอร์ย่อย (ต้อง build ก่อน) แบบเดียวกับ build-test.js
const fs = require('fs');
const path = require('path');
const http = require('http');

const MIME = { '.html': 'text/html', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
const SUB = '/sub/folder/';

async function serveGame() {
  if (process.env.SJ_URL) return { url: process.env.SJ_URL, origin: new URL(process.env.SJ_URL).origin, close() {} };
  const dist = path.resolve(__dirname, '../../dist');
  if (!fs.existsSync(path.join(dist, 'index.html'))) throw new Error('ไม่พบ dist/index.html (รัน npm run build ก่อน หรือตั้ง SJ_URL ชี้ dev server)');
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    if (!url.startsWith(SUB)) { res.writeHead(404); return res.end(); }
    let file = path.join(dist, url.slice(SUB.length));
    if (!file.startsWith(dist)) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${server.address().port}`;
  return { url: origin + SUB, origin, close: () => server.close() };
}
module.exports = { serveGame };
