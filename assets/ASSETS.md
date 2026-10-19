# ชิ้นงาน CC0 ในเกม (หลักฐานสัญญาอนุญาตและการดัดแปลง)

ทุกไฟล์ในโฟลเดอร์ `assets/` ต้องมีรายการในไฟล์นี้ (`npm test` ตรวจให้) ตามกฎใน `docs/LEGAL-AND-COST.md` ข้อ B
ชิ้นงานทั้ง 11 ชิ้นผ่าน `legal-guard` ตรวจรายชิ้นแล้วตอนเสนอ (`docs/ART-3D.md` ข้อ 3, เจอนุมัติ CC0 2026-10-11) ไฟล์นี้จดหลักฐานรอบนำเข้า

- **สัญญาอนุญาต:** CC0 1.0 Universal https://creativecommons.org/publicdomain/zero/1.0/
- **หลักฐานระดับเว็บ** (เปิดหน้าจริง 2026-10-11 ข้อความตาม `docs/ART-3D.md` ข้อ 3.1):
  - Poly Haven https://polyhaven.com/license ระบุว่าชิ้นงานทั้งหมด (HDRI, texture, โมเดล) เป็น CC0 หน้าชิ้นงานแต่ละชิ้นแสดง "CC0 License"
  - ambientCG https://docs.ambientcg.com/license/ ระบุว่าชิ้นงานทั้งหมดเป็น CC0 1.0 และนำไฟล์ดิบใส่ในเกมได้
- **วันที่ดึงไฟล์:** 2026-10-18 จาก URL ดาวน์โหลดของแหล่ง (Poly Haven ผ่าน `https://api.polyhaven.com/files/<ชื่อ>` แล้วโหลดจาก `dl.polyhaven.org`, ambientCG จาก `https://ambientcg.com/get?file=<ชื่อ>_1K-JPG.zip`) ไม่ต้องสมัครสมาชิก ไม่เสียเงิน
  - ไฟล์ของ Poly Haven ตรวจ md5 ตรงกับค่าที่ API ของแหล่งประกาศครบทุกไฟล์
- **การดัดแปลง** (ทำครั้งเดียวด้วย `tools/build-assets.mjs` ไฟล์ต้นฉบับไม่อยู่ใน repo):
  - texture: ย่อจาก 1024 เป็น 512×512 แปลงเป็น WebP (คุณภาพ 0.82) ไม่แก้สีหรือเนื้อภาพ
  - `leaf.webp`, `fol.webp`: รวมแผนที่ Opacity เป็นช่อง alpha ของภาพสี
  - ใช้เฉพาะแผนที่ตามตาราง แผนที่อื่นในแพ็กเกจ (Displacement, NormalDX, Roughness/AO แยก, ไฟล์ .blend/.usdc) ไม่ได้นำเข้า
  - ท้องฟ้า: หมุนภาพตามแนวนอนให้ดวงอาทิตย์อยู่ทิศที่ฉากต้องการ, `sky-env.hdr` ย่อเหลือ 256×128 (เฉลี่ยกลุ่ม 4×4) เก็บเป็น RGBE ไม่บีบอัด, `sky-bg.webp` แปลง 2048×1024 เป็นสีบนจอด้วยสูตร ACES เดียวกับตัววาด ตัดความสว่างจัด เพิ่มความอิ่มสีฟ้า 1.3 เท่า และแทนครึ่งล่าง (ใต้ขอบฟ้า) ด้วยสีพื้นดิน
- **ตรวจตอนนำเข้า (ผู้อำนวยการเกม 2026-10-18):** เปิดแผนที่สีเต็มแผ่นของ Weathered Brown Planks, Corrugated Iron, Painted Plaster Wall ที่ความละเอียดต้นฉบับ ไม่พบตรา ตัวอักษร หรือรอยขีดเขียน; Green Metal Rust ไม่ได้นำแผนที่สีเข้า (ใช้เฉพาะ normal + roughness)
- **ผลตรวจ legal-guard รอบนำเข้า:** ดูหัวข้อท้ายไฟล์

## รายการไฟล์

| ไฟล์ในเกม | ขนาด | ชิ้นงาน (หน้าต้นทาง) | ผู้สร้างตามหน้าเว็บ | ไฟล์ต้นฉบับ | sha256 ของต้นฉบับ |
|---|---|---|---|---|---|
| `sky/sky-env.hdr` | 128 KB | Kloofendal 48d Partly Cloudy (Pure Sky) https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky | Greg Zaal, Jarod Guest | `kloofendal_48d_partly_cloudy_puresky_1k.hdr` | `fd94c84997b8a3c353b62c2125a9b44e19509956986a126e472684432a02d798` |
| `sky/sky-bg.webp` | 42 KB | (ชิ้นเดียวกับบรรทัดบน) | Greg Zaal, Jarod Guest | `kloofendal_48d_partly_cloudy_puresky_2k.hdr` | `5244534e9cf5b606f2ff513aa00ddb161b0a4826ffd88a0d3bd03ac29247d198` |
| `textures/rock_d.webp` | 101 KB | Rocks 006 https://ambientcg.com/a/Rocks006 | ambientCG (ไม่ระบุรายชิ้น) | `Rocks006_1K-JPG_Color.jpg` | `b84709a347606bf806da819ab1b29e4aae7502289b3056efa3d5c3c30dd44ace` |
| `textures/rock_n.webp` | 144 KB | Rocks 006 | ambientCG | `Rocks006_1K-JPG_NormalGL.jpg` | `faf80427b32620aeba89d65811223ae53876526efaab7662039234e8c6fd42b2` |
| `textures/soil_d.webp` | 43 KB | Red Laterite Soil Stones https://polyhaven.com/a/red_laterite_soil_stones | Amal Kumar | `red_laterite_soil_stones_diff_1k.jpg` | `949cd648409b30e2267d89066965605d22dba4ce73d601673e155046c41e1219` |
| `textures/soil_n.webp` | 109 KB | Red Laterite Soil Stones | Amal Kumar | `red_laterite_soil_stones_nor_gl_1k.jpg` | `05500e4daf8ce2d67ffaf1e5394453979cad016462c5aca917f2323b2b7cd11f` |
| `textures/grass_d.webp` | 89 KB | Leafy Grass https://polyhaven.com/a/leafy_grass | Charlotte Baglioni | `leafy_grass_diff_1k.jpg` | `cfa40bc9d9417d1852db8753a8d5917f110c40101179f63543c382e39bc05e4a` |
| `textures/grass_n.webp` | 108 KB | Leafy Grass | Charlotte Baglioni | `leafy_grass_nor_gl_1k.jpg` | `832328216adc0a7e1f70a31d5ee48c9ab7f2152d83816122736cf42ac4b2ebd6` |
| `textures/wood_d.webp` | 42 KB | Weathered Brown Planks https://polyhaven.com/a/weathered_brown_planks | Dimitrios Savva, Rico Cilliers | `weathered_brown_planks_diff_1k.jpg` | `94833feda44e025a9139f7b5723ea84e4f0258d3b54939a79e1013c133085e29` |
| `textures/wood_n.webp` | 26 KB | Weathered Brown Planks | Dimitrios Savva, Rico Cilliers | `weathered_brown_planks_nor_gl_1k.jpg` | `8d38f02f121c0e58eaedc19cd668faea21381ae3ff4d5332cd90de75e6683393` |
| `textures/wood_arm.webp` | 31 KB | Weathered Brown Planks | Dimitrios Savva, Rico Cilliers | `weathered_brown_planks_arm_1k.jpg` | `a428a3a6f89f7bb5c945c9668f2ac6ec268736fda7a4a421fd3ec80d3946929c` |
| `textures/conc_d.webp` | 86 KB | Concrete Floor 02 https://polyhaven.com/a/concrete_floor_02 | Rob Tuytel | `concrete_floor_02_diff_1k.jpg` | `6db84a6d87dc50508b9d134d6fbd2b7e876b8081a5f43a118a249ca18de73af5` |
| `textures/conc_n.webp` | 15 KB | Concrete Floor 02 | Rob Tuytel | `concrete_floor_02_nor_gl_1k.jpg` | `fcda391b57a816d646ae15544688be53790478da5cd48dbe514b3c6901415e61` |
| `textures/conc_arm.webp` | 16 KB | Concrete Floor 02 | Rob Tuytel | `concrete_floor_02_arm_1k.jpg` | `01d80e4cb4eb4605902d1c1362da1c309fdba5907039acddd9226d893bbd8946` |
| `textures/iron_d.webp` | 42 KB | Corrugated Iron https://polyhaven.com/a/corrugated_iron | Dimitrios Savva, Jenelle van Heerden | `corrugated_iron_diff_1k.jpg` | `7f3649dd0d056a55a910146f09b1d5298370696a90f511a255fb4c5715bb4b58` |
| `textures/iron_n.webp` | 10 KB | Corrugated Iron | Dimitrios Savva, Jenelle van Heerden | `corrugated_iron_nor_gl_1k.jpg` | `e98b839ae681ba929eb80f07348c70d0731b48239abe69268effab18420cd271` |
| `textures/iron_arm.webp` | 8 KB | Corrugated Iron | Dimitrios Savva, Jenelle van Heerden | `corrugated_iron_arm_1k.jpg` | `5502fae08a0b530cff8608951dc180d45c06b2f2f92f2f893c894710b7ee1792` |
| `textures/plaster_d.webp` | 16 KB | Painted Plaster Wall https://polyhaven.com/a/painted_plaster_wall | Amal Kumar | `painted_plaster_wall_diff_1k.jpg` | `440310f05af089f2c93353167573403cbc3f805948203237b5d26431eeb9e19c` |
| `textures/plaster_n.webp` | 18 KB | Painted Plaster Wall | Amal Kumar | `painted_plaster_wall_nor_gl_1k.jpg` | `8eb01647d126eb5341e2c325821ad48c8ca11349dbef53447c95422c5d91cc9d` |
| `textures/plaster_arm.webp` | 3 KB | Painted Plaster Wall | Amal Kumar | `painted_plaster_wall_arm_1k.jpg` | `2f13ed444e3e8f13087bca0890969d30795ed074bcfb11737d1ad6f5f0b53992` |
| `textures/metal_n.webp` | 2 KB | Green Metal Rust https://polyhaven.com/a/green_metal_rust | Rob Tuytel | `green_metal_rust_nor_gl_1k.jpg` | `8ecb28b0ea4026b740ce492e3f606f61a76bdce1f78cb2e29287bf9a56c54a80` |
| `textures/metal_r.webp` | 5 KB | Green Metal Rust | Rob Tuytel | `green_metal_rust_rough_1k.jpg` | `f214f22608dd75aa3e7b4da8bffac97c344cbacbc50f49ba0beb0236701a622c` |
| `textures/leaf.webp` | 27 KB | Leaf Set 024 https://ambientcg.com/a/LeafSet024 | ambientCG (ไม่ระบุรายชิ้น) | `LeafSet024_1K-JPG_Color.jpg` + `_Opacity.jpg` | `f5c6cbf36de217af8ae06cf5d7badd035e04c341594aa618abacc2a9d8dbb8c8` + `1b8e15edfc3b28f7f7607097499768cc7110345a3611d9b75d4bf70c54faef0b` |
| `textures/fol.webp` | 34 KB | Foliage 001 https://ambientcg.com/a/Foliage001 | ambientCG (ไม่ระบุรายชิ้น) | `Foliage001_1K-JPG_Color.jpg` + `_Opacity.jpg` | `f63f946a199b1853c9bc9dcd42cc742118dfc4fc26387cd0aee3a0eba0f65702` + `e99abbfc0c34a19c3d7dfe2ed8754494655e0f5a795943d2654d5201b6e3a6f6` |

รวม 24 ไฟล์ 1.12 MB (เพดาน 5 MB ทั้งเกม, ไฟล์ใหญ่สุด 144 KB จากเพดาน 500 KB)

ไฟล์ zip ของ ambientCG ทั้งแพ็กเกจ (sha256): `Rocks006_1K-JPG.zip` `f9b8b159fd68b378be9c52dcffed2bc45c003bb35f84911eac5c0e15d8f41cfe`, `LeafSet024_1K-JPG.zip` `5038f0dfb53647b2eed16adb9043f530f82a4fde3321f91ae59df74ba2f7ace1`, `Foliage001_1K-JPG.zip` `9d24074827b412adcf963b073943852a07324825df60796e85bb91e5d2aceee7`

## ผลตรวจ legal-guard รอบนำเข้า
- legal-guard ตรวจรอบนำเข้า 2026-10-18: **ผ่าน** ไฟล์ใน `assets/textures/` และ `assets/sky/` ครบ 24 ไฟล์ตรงกับตาราง รวมราว 1.2 MB ใหญ่สุด 148 KB
- sha256 ต้นฉบับตรงกับไฟล์ที่ดาวน์โหลดทั้ง 29 ค่า รวม zip ของ ambientCG 3 ไฟล์ ภาพสีเต็มแผ่นของไม้ สังกะสี และปูนฉาบไม่มีตราหรือตัวอักษร
- หน้า license ของ Poly Haven และ ambientCG ยืนยัน CC0 ในวันตรวจ three.js 0.185.1 เป็น MIT เครดิตใน `CREDITS.md` และ `index.html` ถูกต้อง ไม่มีการโหลดจากโดเมนภายนอกตอนเล่น
- เป็นการตรวจตามแนวปฏิบัติของทีม ไม่ใช่คำปรึกษาทางกฎหมาย ถ้าเกมจะหารายได้ในอนาคตให้ปรึกษาผู้รู้กฎหมายก่อน
