// คัดลอกฟอนต์ Mitr + Anuphan (400/500/600, ไทย+ละติน, woff2) จากแพ็กเกจ @fontsource
// ไปไว้ที่ prototype/fonts/ เพื่อให้ต้นแบบเปิดผ่าน file:// ได้โดยไม่ต้อง build
// และสร้าง src/fonts.css ให้หน้าเกมใหม่ (Vite จะดึงไฟล์จาก node_modules เอง)
// ใช้: npm run fonts   (รันใหม่เมื่ออัปเดตแพ็กเกจฟอนต์ แล้ว commit ผลลัพธ์)
import { readFileSync, writeFileSync, copyFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const FAMILIES = [['mitr', 'Mitr'], ['anuphan', 'Anuphan']];
const WEIGHTS = [400, 500, 600];
const SUBSETS = ['thai', 'latin'];
const outDir = join(root, 'prototype/fonts');

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const faces = [];
for (const [id, family] of FAMILIES) {
  const pkg = join(root, 'node_modules/@fontsource', id);
  const { version, license } = JSON.parse(readFileSync(join(pkg, 'package.json'), 'utf8'));
  if (license !== 'OFL-1.1') throw new Error(`${id}: license เป็น ${license} ไม่ใช่ OFL-1.1`);
  copyFileSync(join(pkg, 'LICENSE'), join(outDir, `OFL-${family}.txt`));
  for (const w of WEIGHTS) {
    const css = readFileSync(join(pkg, `${w}.css`), 'utf8');
    for (const sub of SUBSETS) {
      const name = `${id}-${sub}-${w}-normal`;
      // ช่วงอักขระ (unicode-range) อ่านจาก CSS ของแพ็กเกจ ไม่เขียนเอง
      const m = css.match(new RegExp(`/\\* ${name} \\*/[^}]*unicode-range:\\s*([^;]+);`));
      if (!m) throw new Error(`ไม่พบ unicode-range ของ ${name}`);
      copyFileSync(join(pkg, 'files', `${name}.woff2`), join(outDir, `${name}.woff2`));
      faces.push({ id, family, w, name, range: m[1].trim(), version });
    }
  }
}

const render = (urlOf) => faces.map(f =>
  `@font-face{font-family:'${f.family}';font-style:normal;font-display:swap;font-weight:${f.w};` +
  `src:url(${urlOf(f)}) format('woff2');unicode-range:${f.range}}`).join('\n') + '\n';
const head = `/* สร้างโดย tools/sync-fonts.mjs ห้ามแก้ด้วยมือ\n   Mitr, Anuphan — SIL Open Font License 1.1 (ดู OFL-Mitr.txt, OFL-Anuphan.txt ใน prototype/fonts/)\n   ที่มา: ${FAMILIES.map(([id]) => `@fontsource/${id}@${faces.find(f => f.id === id).version}`).join(', ')} */\n`;

writeFileSync(join(outDir, 'fonts.css'), head + render(f => `./${f.name}.woff2`));
writeFileSync(join(root, 'src/fonts.css'), head + render(f => `@fontsource/${f.id}/files/${f.name}.woff2`));
console.log(`ฟอนต์ ${faces.length} ไฟล์ -> prototype/fonts/ และ src/fonts.css`);
