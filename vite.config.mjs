// Vite: เว็บล้วน ไม่มีเฟรมเวิร์ก ทุก path เป็น relative (base './') เพื่อวางในโฟลเดอร์ย่อยหรือห่อเป็นแอปได้
import { defineConfig } from 'vite';
import { cpSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const pkg = JSON.parse(readFileSync(resolve(import.meta.dirname, 'package.json'), 'utf8'));

// คัดลอกต้นแบบ v2 ทั้งโฟลเดอร์ไป dist/prototype/ แบบไม่แตะเนื้อไฟล์ (ต้นแบบต้องเปิดผ่าน file:// ได้เหมือนเดิม)
const copyPrototype = () => {
  let outDir;
  return {
    name: 'copy-prototype',
    apply: 'build',
    configResolved(c) { outDir = resolve(c.root, c.build.outDir); },
    closeBundle() {
      cpSync(resolve(import.meta.dirname, 'prototype'), resolve(outDir, 'prototype'), { recursive: true });
    },
  };
};

export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  build: {
    outDir: 'dist', emptyOutDir: true,
    // หน้าแรก + เกมโหมดประวัติศาสตร์ (เวอร์ชันโมดูล)
    rollupOptions: { input: { main: resolve(import.meta.dirname, 'index.html'), history: resolve(import.meta.dirname, 'history.html') } },
  },
  plugins: [copyPrototype()],
});
