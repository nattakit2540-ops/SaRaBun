# SKILL.md

## E-SARABAN SCHOOL Development Skill

ใช้ skill นี้เมื่อพัฒนา แก้ไข หรือ deploy ระบบ E-SARABAN SCHOOL

## Workflow

1. อ่าน `AGENTS.md` ก่อนแก้โค้ด
2. แก้แบบคงความสามารถเปิด `index.html` ได้โดยตรง
3. ถ้าเพิ่มฟอร์มใหม่ ต้องบันทึกลง document object, draft, metadata, keywords และ audit log ตามสมควร
4. ถ้าเกี่ยวกับเลขเอกสาร ต้องตรวจทั้ง manual number และ auto counter
5. ถ้าเกี่ยวกับ Firebase ต้องตรวจ `firebase-config.js`, `firestore.rules`, `storage.rules`, `README.md`
6. ตรวจ syntax ด้วย `node --check` หลังแก้ JavaScript

## Rules

- Public user เข้าผ่านปุ่ม `ใช้งานทั่วไป` ได้ทันที สร้างเอกสารได้ แต่แก้ไข/ลบ/ตั้งค่าระบบไม่ได้
- Admin เท่านั้นที่แก้ไข/ลบเอกสารได้
- Admin local เข้าผ่านปุ่ม `Admin` ด้วยรหัสที่กำหนด และไม่แสดงรหัสผ่านบนหน้าแรก
- Anonymous Login ใช้เพื่อให้ Firestore/Storage Rules รับรู้ว่าเป็นผู้ใช้งานที่ signed in
- ห้าม hard-code ค่าโรงเรียนในหลายจุด ให้ใช้ settings และ `firebase-config.js`
- ฟอนต์หลักคือ Itim และ fallback เป็น TorsilpLamun

## Deploy

ใช้ Firebase Hosting เป็นปลายทางหลัก

```bash
firebase use sarabun-d3ba6
firebase deploy
```

ถ้าต้องส่งขึ้น GitHub ให้ commit เฉพาะไฟล์โปรเจกต์ ไม่รวมข้อมูลส่วนตัวหรือไฟล์จากนอก workspace
