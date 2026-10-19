# Signal Junction: เครดิตและแหล่งข้อมูล

## ฟอนต์ (ฝังในเกม ไม่ดึงจาก Google Fonts ตอนเล่น)
- Mitr — Copyright (c) 2015, Cadson Demak (info@cadsondemak.com) — SIL Open Font License 1.1 — ข้อความสัญญาอนุญาต: `prototype/fonts/OFL-Mitr.txt`
- Anuphan — Copyright 2019 The Anuphan Project Authors (https://github.com/cadsondemak/Anuphan) — SIL Open Font License 1.1 — ข้อความสัญญาอนุญาต: `prototype/fonts/OFL-Anuphan.txt`
- ไฟล์ฟอนต์ (woff2 น้ำหนัก 400/500/600 ชุดอักขระไทย+ละติน) มาจากแพ็กเกจ npm `@fontsource/mitr` และ `@fontsource/anuphan` (OFL-1.1) คัดลอกด้วย `npm run fonts`

## ข้อมูล
- ข้อมูลแผนที่และผังราง — © ผู้ร่วมพัฒนา OpenStreetMap, Open Database License (ODbL) 1.0 https://opendatacommons.org/licenses/odbl/1-0/ , https://www.openstreetmap.org/copyright
  - ไฟล์ดิบจาก Overpass API อยู่ใน `data/raw/` ไฟล์ข้อมูลที่แปลงจาก OpenStreetMap เปิดเผยภายใต้ ODbL 1.0 ข้อความสัญญาอนุญาตฉบับเต็ม: `data/LICENSE-ODbL.txt`
  - ไฟล์ข้อมูลที่เราแปลงแล้วและสคริปต์ที่ใช้แปลง ดาวน์โหลดได้ฟรีที่ https://github.com/signaljunctionth-blip/signal-junction/tree/main/data
- เส้นขอบประเทศและเส้นแบ่งจังหวัดใน `data/thailand-map.json` — Made with Natural Earth (1:10m Admin 0 และ Admin 1, รุ่น v5.1.2), สาธารณสมบัติ (public domain), https://www.naturalearthdata.com/
  - ไฟล์ดิบที่กรองเฉพาะประเทศไทยอยู่ใน `data/raw/ne-*-th.geojson`
  - เส้นขอบเป็นแนวโดยประมาณตาม Natural Earth ไม่ใช่เส้นเขตแดนทางการ

## เพลงและเสียง
- เพลงประกอบ "ห้องสัญญาณยามบ่าย" และเสียงประกอบทั้งหมด สร้างขึ้นใหม่ด้วย Web Audio API จากโค้ดในเกม (`src/audio/`) โดยทีม Signal Junction ไม่มีไฟล์เสียงหรือเพลงจากภายนอก เผยแพร่ตามสัญญาอนุญาตเดียวกับโค้ดของเกม

## ไลบรารีและเครื่องมือ (ใช้ตอนพัฒนา ตัวเกมมีเพียงโค้ดช่วยโหลดขนาดเล็กที่ Vite ใส่ให้ตอน build)
- Vite — MIT
- Playwright — Apache-2.0

## ข้อความปฏิเสธความเป็นทางการ
เกมนี้ไม่ใช่ผลงานทางการของการรถไฟแห่งประเทศไทย ผังสถานีจำลองจากข้อมูลสาธารณะ อาจไม่ตรงกับสภาพจริง และไม่ใช่ขั้นตอนปฏิบัติงานจริง
