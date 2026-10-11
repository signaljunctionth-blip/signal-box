# ท่อข้อมูล: จากแผนที่จริงสู่ผังในเกม

## ภาพรวม
```
Natural Earth (เส้นขอบ) ─┐
                          ├─ tools/build-map.mjs ─→ data/thailand-map.json  (แผนที่ประเทศ, เส้นทางสายหลัก, จุดสถานี)
Overpass API (OSM) ───────┤
                          └─ tools/build-station.mjs <ชื่อ> ─→ data/stations/<id>.json  (ผังสถานีแบบ schematic)
```
- สคริปต์รันบนเครื่องเจตอนพัฒนาเท่านั้น ผลลัพธ์ commit ลง repo เกมไม่ดึงข้อมูลสดตอนเล่น
- ไฟล์ดิบเก็บใน `data/raw/` พร้อมวันที่ดึง (เช่น `data/raw/osm-2026-10-12-kanchanaburi.json`)
- ใช้ Overpass อย่างสุภาพ: รอ 5 วินาทีระหว่างคำขอ, cache ทุกผล, ใส่ User-Agent ระบุโปรเจกต์

## 1. แผนที่ประเทศไทย
- เส้นขอบประเทศและจังหวัด: Natural Earth 1:10m Admin 0 และ Admin 1 (กรองเฉพาะ TH) ลดรายละเอียดด้วย `mapshaper -simplify 5%`
- เส้นทางรถไฟ: Overpass
  ```
  [out:json][timeout:180];
  area["ISO3166-1"="TH"][admin_level=2]->.th;
  way["railway"="rail"]["usage"="main"](area.th);
  out geom;
  ```
  (ถ้าไม่มีแท็ก usage ให้ดึง `railway=rail` ทั้งหมดแล้วกรองทางในย่าน/ทางแยกเล็กออกด้วยความยาว)
- สถานี:
  ```
  [out:json][timeout:120];
  area["ISO3166-1"="TH"][admin_level=2]->.th;
  ( node["railway"~"^(station|halt)$"](area.th); );
  out body;
  ```
  เก็บ `name:th`, `name`, `name:en`, พิกัด, `railway` (station/halt), `ref` ถ้ามี
- โปรเจกชัน: equirectangular ปรับ cos(lat 13°) เพียงพอสำหรับประเทศไทย

## 2. ผังสถานี
1. หา node สถานีจาก `data/thailand-map.json`
2. Overpass ดึงรอบสถานี (รัศมีเริ่ม 1500 ม. ปรับได้)
   ```
   [out:json][timeout:60];
   (
     way["railway"~"^(rail|siding|spur|yard)$"](around:1500,LAT,LON);
     node["railway"~"^(switch|signal|railway_crossing|buffer_stop)$"](around:1500,LAT,LON);
     way["railway"="platform"](around:1500,LAT,LON);
     way["public_transport"="platform"]["train"="yes"](around:1500,LAT,LON);
   );
   out geom;
   ```
3. สร้างกราฟ: จุดต่อของ way = node, ประแจ = node ที่มีราง 3 ทาง
4. **ทำ schematic**: จัดรางหลักเป็นเส้นนอน, ทางหลีกเป็นเส้นขนานห่าง 90 หน่วย, มุมเฉียง 45° รวบตำแหน่งให้พอดีกริด 960×480 (แนวเดียวกับ LAYOUTS ใน v2)
5. ให้ `signalling-engineer` ตรวจว่าผังเล่นได้และสมเหตุสมผล แล้วให้เจดูรอบสุดท้าย
6. บันทึกที่มาใน `data/sources.md`

## 3. รูปแบบไฟล์สถานี (`data/stations/<id>.json`)
```json
{
  "id": "nong-pla-duk-jn",
  "name_th": "ชุมทางหนองปลาดุก",
  "name_en": "Nong Pla Duk Junction",
  "tier": 4,
  "line": ["south", "namtok"],
  "lat": 0, "lon": 0,
  "source": { "osm": "https://www.openstreetmap.org/node/…", "fetched": "2026-10-12" },
  "verified": { "layout": false, "signalling": false, "notes": "" },
  "signalling": { "level": "colour_light", "block": "tablet" },
  "neighbors": [{ "id": "…", "via": "out_west", "km": 0, "track": "single" }],
  "layout": {
    "edges": { "in_w": { "pts": [[-100,250],[150,250]], "sig": "S_W", "next": "ap_w" } },
    "points": { "P1": { "x": 190, "y": 250, "N": "a", "R": "b", "facing": true } },
    "signals": { "S_W": { "edge": "in_w", "lx": 132, "ly": 206, "type": "home" } },
    "platforms": [{ "edge": "p1", "no": 1 }],
    "entries": ["in_w", "in_e"], "exits": ["out_w", "out_e"]
  }
}
```
- `edges` ใช้รูปแบบเดียวกับ `LAYOUTS` ในต้นแบบ v2 (polyline, `next` แบบ string / facing / trailing) เพื่อให้เอนจินเดิมใช้ได้ทันที
- เอนจินต้องรองรับ **ขบวนสองทิศ** (เข้าได้ทั้งฝั่งตะวันตกและตะวันออก) ซึ่ง v2 ยังไม่มี ต้องทำใน M1
- ค่าพิกัดจริงที่ใส่ต้องตรงกับ OSM; ค่า 0 ในตัวอย่างเป็นแค่โครง

## 4. ระดับ "ตรวจแล้ว"
| สถานะ | ความหมาย | แสดงในเกม |
|---|---|---|
| `layout: false` | ผังมาจาก OSM แต่ยังไม่มีคนตรวจ | "ผังจำลองจากข้อมูลสาธารณะ" |
| `layout: true` | ทีม + เจตรวจกับภาพถ่ายดาวเทียมสาธารณะ/OSM แล้ว | "ผังจำลองจากข้อมูลสาธารณะ ตรวจแล้ว" |
| `signalling: false` | ระบบสัญญาณใช้ค่าตามขั้นของสถานี | "ระบบสัญญาณสมมุติตามขนาดสถานี" |
| `signalling: true` | มีแหล่งข้อมูลสาธารณะยืนยัน (ลิงก์ใน sources.md) | — |
