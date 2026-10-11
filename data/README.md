# ข้อมูลในโฟลเดอร์นี้

ไฟล์ใน `data/raw/` และไฟล์ที่แปลงมาจาก OpenStreetMap (เช่น `data/stations/*.json`, `data/thailand-map.json`) เป็น
**© ผู้ร่วมพัฒนา OpenStreetMap** เผยแพร่ภายใต้ Open Database License (ODbL) 1.0
ดู https://www.openstreetmap.org/copyright และข้อความสัญญาฉบับเต็มที่ `LICENSE-ODbL.txt`

- สัญญา ODbL ครอบเฉพาะข้อมูลในโฟลเดอร์นี้ที่มาจาก OpenStreetMap ไม่ครอบโค้ดเกมและฟอนต์
- ไฟล์ `data/stations/fictional-*.json` และ `data/levels/*.json` เป็นผังสมมุติและด่านที่ทีมเขียนเอง ไม่มีข้อมูลจาก OpenStreetMap จึงอยู่ใต้ข้อความสงวนลิขสิทธิ์ใน `LICENSE` ที่รากโปรเจกต์ ไม่ใช่ ODbL
- ห้ามลบบล็อก `osm3s.copyright` ที่หัวไฟล์ดิบ
- ดึงข้อมูลจาก Overpass ตอนพัฒนาเท่านั้น และห้ามใช้ `out meta` (จะได้ชื่อผู้แก้ไข OSM ติดมา)
- วันที่ดึง ขอบเขต และแหล่งอ้างอิงของแต่ละไฟล์จดไว้ใน `sources.md`
