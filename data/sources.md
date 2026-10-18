# แหล่งอ้างอิงข้อมูล

| หัวข้อ | แหล่ง | วันที่ตรวจ | ใช้ที่ไหน |
|---|---|---|---|
| สัดส่วนระบบสัญญาณของ รฟท. (ภาพรวมปี 2557) | https://thaipublica.org/2014/11/the-truth-of-thailand-rail-system-6-2/ | 2026-10-11 | GDD, การ์ดความรู้ |
| การรับ-ส่งห่วงบนทางเดี่ยว / เปิดทางคู่ด้วยระบบเดิมระหว่างรอระบบใหม่ | https://www.dailynews.co.th/articles/2248042/ | 2026-10-11 | ภารกิจขั้น 1–2, ภารกิจช่วงเปลี่ยนผ่าน |
| ขอนแก่น–หนองคาย: CBI + ETCS L1 + ระบบบริหารการเดินรถ | https://www.railjournal.com/infrastructure/progress-rail-to-resignal-thai-main-line/ | 2026-10-11 | ขั้น 6 CTC |
| เงื่อนไข ODbL / Produced Work / Derivative Database | https://osmfoundation.org/wiki/Licence_and_Legal_FAQ | 2026-10-11 | LEGAL-AND-COST |

## สายน้ำตก (ชุมทางหนองปลาดุก–กาญจนบุรี–น้ำตก) — สำรวจความเป็นไปได้ 2026-10-11

ข้อมูลดิบ: `data/raw/osm-2026-10-11-namtok-line.json` (Overpass API 1 คำขอ, bbox 13.70,98.90,14.45,100.05, ข้อมูล OSM ณ 2026-10-11T15:42:06Z) © ผู้ร่วมพัฒนา OpenStreetMap, ODbL 1.0
ยังไม่ได้สร้าง `data/stations/*.json` ผังทุกแห่งยังเป็น `verified.layout: false` และ `verified.signalling: false`

| หัวข้อ | แหล่ง | วันที่ตรวจ | ใช้ที่ไหน |
|---|---|---|---|
| แนวทางรถไฟทั้งสาย (relation "สายกาญจนบุรี", ทาง 31 เส้น) | https://www.openstreetmap.org/relation/13327676 | 2026-10-11 | ลำดับสถานี, แผนที่เส้นทางสอน |
| น้ำตก | https://www.openstreetmap.org/node/5558367598 | 2026-10-11 | STATIONS ลำดับ 1 |
| น้ำตกไทรโยคน้อย (ปลายรางจริงใน OSM) | https://www.openstreetmap.org/node/1953833262 | 2026-10-11 | หมายเหตุลำดับ 1 |
| วังโพ | https://www.openstreetmap.org/node/272304779 | 2026-10-11 | ตัวเลือกลำดับ 3 |
| ท่ากิเลน | https://www.openstreetmap.org/node/272303917 | 2026-10-11 | ตัวเลือกลำดับ 2 |
| วังเย็น | https://www.openstreetmap.org/node/2683354074 | 2026-10-11 | ตัวเลือกลำดับ 3 |
| กาญจนบุรี | https://www.openstreetmap.org/node/528735648 | 2026-10-11 | STATIONS ลำดับ 4 |
| ท่าเรือน้อย | https://www.openstreetmap.org/node/2453876304 | 2026-10-11 | ตัวสำรองลำดับ 3 |
| สระโกสินารายณ์ | https://www.openstreetmap.org/node/4604984594 | 2026-10-11 | ตัวเลือกลำดับ 2 |
| ลูกแก | https://www.openstreetmap.org/node/4604984592 | 2026-10-11 | ตัวสำรองลำดับ 2 |
| ชุมทางหนองปลาดุก | https://www.openstreetmap.org/node/9207427072 | 2026-10-11 | STATIONS ลำดับ 5 |
| ทางคู่นครปฐม–ชุมพร: สัญญาอาณัติสัญญาณ อินเตอร์ล็อกคอมพิวเตอร์ 59 สถานี + ระบบป้องกันขบวนรถอัตโนมัติ (ข่าว 28 ธ.ค. 2562; ข่าวไม่ได้ระบุชื่อชุมทางหนองปลาดุกและไม่พูดถึงสายน้ำตก) | https://thaipublica.org/?p=185667 | 2026-10-11 | บริบทเท่านั้น ยังใช้ยืนยันสถานีใดไม่ได้ |

ยืนยันแล้วจาก OSM (ณ วันที่ดึง): ลำดับและพิกัดสถานี/ที่หยุดรถ 31 แห่ง, ชื่อไทย/อังกฤษ, ทั้งสายเป็นทางเดี่ยว (`passenger_lines=1`), จำนวนรางและรูปทรงทางหลีกของแต่ละสถานี
ยังไม่ยืนยัน:
- ระบบอาณัติสัญญาณของทุกสถานีในสายนี้: OSM ไม่มี `railway=signal` แม้แต่จุดเดียวในพื้นที่ที่ดึง และค้นข่าว/เอกสารสาธารณะแล้วไม่พบแหล่งที่ระบุระบบของสายนี้ → ใช้ค่าตามขั้นของสถานี ติด `signalling: false` และต้องถามเจ
- ตำแหน่งประแจที่กาญจนบุรี น้ำตก วังเย็น ท่าเรือน้อย ท่าม่วง: OSM ไม่ได้แท็ก `railway=switch` ต้องอนุมานจากจุดที่ทางมาต่อกัน
- เลขชานชาลา: ไม่มีแท็ก `ref` บนชานชาลาใดเลย; น้ำตก ท่าม่วง ปากแพรก สะพานแควใหญ่ ท่าตาเสือ วิทยาลัยเกษตร ไม่มีชานชาลาใน OSM
- ระยะ กม. ที่ใช้เป็นระยะวัดตามแนวเส้นใน OSM นับจากหมุดสถานีชุมทางหนองปลาดุก ไม่ใช่หลัก กม. ทางการ
- `railway:station_category` ใน OSM เป็นค่าที่อาสาสมัครใส่ ไม่ใช่แหล่งทางการ

## WP6 ปีเปิดเดินรถ สถานะทางแยก และ OSM สายอีสาน — ตรวจ 2026-10-17/18 (ผ่าน legal-guard, signalling-engineer แบบมีเงื่อนไข)
หน้าเว็บอ่านผ่านเครื่องมือดึงหน้าที่สรุปให้ ไม่ได้อ่านข้อความดิบทั้งหน้า
| หัวข้อ | แหล่ง | วันที่ตรวจ | ใช้ที่ไหน |
|---|---|---|---|
| กรุงเทพ–กรุงเก่า 26 มี.ค. 2439, ถึงนครราชสีมา 21 ธ.ค. 2443 | https://www.silpa-mag.com/?p=7765 ; https://www.thaipbs.or.th/now/content/599 ; https://en.wikipedia.org/wiki/History_of_rail_transport_in_Thailand | 2026-10-17 | ลำดับสาย STATIONS |
| ช่วงต่าง ๆ ของสายอีสาน, บุ่งหวาย–บ้านโพธิ์มูล ปิด 1954, หนองคาย–ท่านาแล้ง | https://en.wikipedia.org/wiki/Northeastern_Line_(Thailand) | 2026-10-17 | ลำดับสาย, ทางแยก |
| สายเหนือ บ้านภาชี–ลพบุรี 1 เม.ย. 1901, เชียงใหม่ 1 ม.ค. 1922, เด่นชัย–เชียงของ ก่อสร้าง | https://en.wikipedia.org/wiki/Northern_Line_(Thailand) | 2026-10-17 | ลำดับสาย |
| สายใต้ เปิด 19 มิ.ย. 1903 (เดินรถ 1 เม.ย. 1903) | https://en.wikipedia.org/wiki/Southern_Line_(Thailand) ; https://www.silpa-mag.com/?p=10278 | 2026-10-17 | ลำดับสาย |
| แม่กลอง: ท่าจีนเปิด 29 ธ.ค. 2447 ปฏิทินเดิม = ค.ศ. 1904 (ราชกิจจาฯ เล่ม 21 ตอน 40), บ้านแหลม–แม่กลอง 10 มิ.ย. 2448, ยุบคลองสาน 2504 | https://th.wikipedia.org/wiki/ทางรถไฟสายแม่กลอง ; https://en.wikipedia.org/wiki/Maeklong_Railway | 2026-10-17 | ลำดับสาย |
| ตะวันออก ฉะเชิงเทรา 24 ม.ค. 1907, อรัญฯ 1926, คลองลึก 2019, ชุกเสม็ด 2023, สถานะทางสินค้า | https://en.wikipedia.org/wiki/Eastern_Line_(Thailand) ; https://th.wikipedia.org/wiki/ทางรถไฟสายตะวันออก | 2026-10-17 | ลำดับสาย, ทางแยก |
| สุพรรณบุรี 16 มิ.ย. 1963; น้ำตก เปิดใหม่ถึงวังโพ 1 เม.ย. 1952 ถึงน้ำตก 1 ก.ค. 1958 | https://en.wikipedia.org/wiki/Suphan_Buri_Line ; https://en.wikipedia.org/wiki/Burma_Railway ; https://en.wikipedia.org/wiki/Wang_Pho_railway_station | 2026-10-17 | ลำดับสาย |
| ทางคู่คลองขนานจิตร–ถนนจิระ ปรับเป็นยกระดับ เปิด 2574 (ข่าว 27 ส.ค. 2569) | https://www.bangkokbiznews.com/news/news-update/1249367 | 2026-10-17 | หมายเหตุผังนครราชสีมา/ถนนจิระ |
| ทางคู่ขอนแก่น–หนองคาย ก่อสร้างถึง 2028; ถนนจิระ–อุบลฯ ยังรอ ครม. | https://www.nationthailand.com/business/economy/40069329 | 2026-10-17 | หมายเหตุผังอุดรฯ/สายอีสานใต้ |
| น้ำท่วมทางแก่งคอย–บัวใหญ่ หยุดเดินรถที่บำเหน็จณรงค์ (ข่าว 2 ต.ค. 2565) | https://www.thaipbs.or.th/news/content/320067 | 2026-10-17 | สถานะทางแยก |
| ปีเปิดสถานีหนองคายปัจจุบัน (2008) และปิดช่วงตลาดหนองคาย; สายปากน้ำเปิด 11 เม.ย. 1893 (ปิดแล้ว ไม่ได้ตรวจปีปิด) | https://en.wikipedia.org/wiki/Northeastern_Line_(Thailand) ; https://en.wikipedia.org/wiki/History_of_rail_transport_in_Thailand | 2026-10-17 | ตาราง OSM, สรุปลำดับสาย |
| สถานีขอนแก่นสร้างใหม่เป็นสถานียกระดับปี 2019 (วิกิพีเดียไม่มีอ้างอิงกำกับ) และข่าวกำหนดเปิดใช้สถานียกระดับ 13 มี.ค. 2562 (ผลค้น เปิดอ่านข่าวเต็มไม่ได้ 403) | https://en.wikipedia.org/wiki/Khon_Kaen_railway_station ; https://www.prachachat.net/?p=299561 | 2026-10-18 | ตาราง OSM |
| แนวรางทางแยกยังใช้งาน: สวรรคโลก, คีรีรัฐนิคม, กันตัง, นครศรีธรรมราช, ปาดังเบซาร์, สุพรรณบุรี (relation `route=railway` และทาง `railway=rail`) | `data/raw/osm-2026-10-11-thailand-rail.json` (ไฟล์ของ WP1) relation 8425166, 13327778, 8425163, 13327899, 13195090, 13327648 ; https://en.wikipedia.org/wiki/Southern_Line_(Thailand) ; https://en.wikipedia.org/wiki/Northern_Line_(Thailand) | 2026-10-18 | ทางแยก (ยืนยันแค่ว่าแนวรางยังใช้งาน ไม่ยืนยันรถโดยสาร) |
| ทางสินค้า คลองสิบเก้า–แก่งคอย, ศรีราชา–แหลมฉบัง, เขาชีจรรย์–มาบตาพุด, บ้านคลองลึก–ปอยเปต | https://en.wikipedia.org/wiki/Eastern_Line_(Thailand) | 2026-10-17 | ทางแยก |
| ทางแยกเขากระโดง (บุรีรัมย์) แท็ก `usage=industrial` ยังไม่มีแหล่งยืนยันว่ามีขบวนสินค้า | https://www.openstreetmap.org/way/172262286 | 2026-10-17 | ทางแยก, ตัวเลือก A |
| หาดใหญ่–สงขลา หยุดเดินรถ มิ.ย. 2521 (บล็อกส่วนตัว ความมั่นใจต่ำ) | https://www.gotoknow.org/posts/201589 | 2026-10-18 | ทางแยก |
| ทางสายใหม่บ้านไผ่–นครพนม กำลังก่อสร้าง (คืบหน้า 22.89 เปอร์เซ็นต์ ณ ก.ค. 2568) | https://www.dailynews.co.th/news/5030455/ | 2026-10-18 | ทางแยก |
| OSM รอบสถานีอีสาน 12 แห่ง (Overpass overpass-api.de, คำขอละสถานี เว้น 5 วินาที, ได้ 502 แล้วลองใหม่แบบรอ 30/60/120 วินาที, ข้อมูล OSM ณ 2026-10-17 09:46:06Z–09:56:21Z) | `data/raw/osm-2026-10-17-*.json` ขอบเขตด้านล่าง | 2026-10-17 | ตัวเลือกสถานีใน docs/STATIONS.md (WP6) สำหรับทำผังใน WP8 |
| OSM รอบชุมทางถนนจิระรัศมีกว้าง (1 คำขอ, ข้อมูล OSM ณ 2026-10-18T04:11:27Z) เพื่อดูจุดแยกทางไปขอนแก่น/อุบลฯ | `data/raw/osm-2026-10-18-thanon-chira-jn-r5000.json` (https://www.openstreetmap.org/node/11809204381 รัศมี 5000 ม.) | 2026-10-18 | หมายเหตุถนนจิระ: ทางที่ 2 ไปขอนแก่น (way 1416285349, 969566827) ปลายไม่ต่อกับรางใดใน OSM |

ขอบเขตไฟล์ดิบ (จุดศูนย์กลาง = หมุดสถานี OSM, คำขอ `around:<รัศมี>` ดึง rail/siding/spur/yard/construction/disused, switch/signal/railway_crossing/buffer_stop/station/halt และชานชาลา):
- `osm-2026-10-17-saraburi.json`: https://www.openstreetmap.org/node/5394772572 รัศมี 1500 ม.
- `osm-2026-10-17-kaeng-khoi-jn.json`: https://www.openstreetmap.org/node/3442502719 รัศมี 2000 ม.
- `osm-2026-10-17-nakhon-ratchasima.json`: https://www.openstreetmap.org/node/1384419468 รัศมี 1500 ม.
- `osm-2026-10-17-thanon-chira-jn.json`: https://www.openstreetmap.org/node/11809204381 รัศมี 2000 ม.
- `osm-2026-10-17-bua-yai-jn.json`: https://www.openstreetmap.org/node/9218290525 รัศมี 2000 ม.
- `osm-2026-10-17-khon-kaen.json`: https://www.openstreetmap.org/node/387743020 รัศมี 1500 ม.
- `osm-2026-10-17-udon-thani.json`: https://www.openstreetmap.org/node/675458495 รัศมี 1500 ม.
- `osm-2026-10-17-nong-khai.json`: https://www.openstreetmap.org/node/675449145 รัศมี 1500 ม.
- `osm-2026-10-17-buri-ram.json`: https://www.openstreetmap.org/node/2389968745 รัศมี 1500 ม.
- `osm-2026-10-17-surin.json`: https://www.openstreetmap.org/node/3107829713 รัศมี 1500 ม.
- `osm-2026-10-17-si-sa-ket.json`: https://www.openstreetmap.org/node/9218290523 รัศมี 1500 ม.
- `osm-2026-10-17-ubon-ratchathani.json`: https://www.openstreetmap.org/node/324255698 รัศมี 1500 ม.

ข้อมูล OSM © ผู้ร่วมพัฒนา OpenStreetMap, ODbL 1.0
