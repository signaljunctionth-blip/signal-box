---
name: release
description: ปล่อยเกมเวอร์ชันใหม่ขึ้น GitHub Pages อย่างปลอดภัย ใช้เมื่อเจสั่ง "ปล่อยเวอร์ชัน" หรือ /release
---
# ปล่อยเวอร์ชัน

1. `/playtest` ต้องผ่านทุกข้อ
2. **legal-guard** ตรวจเช็กลิสต์ส่วน E ใน `docs/LEGAL-AND-COST.md`
3. **release-manager**: เลขเวอร์ชัน, CHANGELOG.md, commit, tag, push แล้วรอ GitHub Actions deploy
4. ตรวจลิงก์จริง แล้วบอกเจ: ลิงก์เกม, มีอะไรใหม่ 3 ข้อ, ข้อความโพสต์แจ้งผู้ติดตาม 1 ย่อหน้า
ถ้าครั้งแรกยังไม่มี repo หรือยังไม่ได้ login GitHub ให้บอกเจทีละขั้น (gh auth login, สร้าง repo) แล้วรอ
