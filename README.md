# E-SARABAN SCHOOL

ระบบ E-สารบรรณโรงเรียนแบบ HTML + JavaScript + Firebase สำหรับโรงเรียนชุมชนบ้านหนองผึ้ง (ประพันธ์คุรุราษฎร์อุทิศ) รองรับผู้ใช้งานทั่วไปแบบไม่ต้อง Login และพร้อมเชื่อม Firebase Authentication, Firestore, Storage, Hosting

## โครงสร้างไฟล์

```text
/index.html
/css/style.css
/js/firebase-config.js
/js/auth.js
/js/app.js
/js/documents.js
/js/numbering.js
/js/render.js
/js/export.js
/fonts/TorsilpLamun.woff2
/README.md
```

ระบบใช้ฟอนต์ `Itim` เป็นฟอนต์หลักผ่าน Google Fonts และมีฟอนต์ `TorsilpLamun.woff2` เป็น fallback เมื่อเปิดแบบ offline

## วิธีใช้งานหน้าแรก

เปิด `index.html` ได้โดยตรง หรือเปิดผ่าน local server แล้วเลือก

- `ใช้งานทั่วไป`: เข้าระบบได้ทันที ลงทะเบียนเลขเอกสารและสร้างเอกสารได้ แต่แก้ไข/ลบ/ตั้งค่าระบบไม่ได้
- `Admin`: เข้าสู่ระบบด้วยรหัสผู้ดูแล เพื่อแก้ไข ลบ และตั้งค่าระบบ

ข้อมูลแบบไม่ต่อ Firebase จะเก็บใน `localStorage` ของ browser เครื่องนั้น

## วิธีรันในเครื่อง

สามารถดับเบิลคลิก `index.html` เพื่อใช้ Demo Mode ได้ทันที หากต้องการทดสอบ Firebase จริง แนะนำให้เปิดผ่าน server static เช่น Firebase Hosting Emulator หรือ VS Code Live Server

ตัวอย่างด้วย Firebase CLI:

```bash
firebase serve
```

หรือวางไฟล์ขึ้น Firebase Hosting ได้โดยตรง เพราะเป็นเว็บ static

## การตั้งค่า Firebase

เปิดไฟล์ `js/firebase-config.js` แล้วใส่ค่าจริงจาก Firebase Console

```js
export const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};
```

เมื่อใส่ config แล้ว ระบบจะบันทึกข้อมูลจริงลง Firestore collection `documents` และอัปโหลดไฟล์แนบเข้า Storage ตามโมดูล

## เปิดบริการ Firebase

1. Authentication: เปิด Email/Password provider สำหรับ Admin/ธุรการ
2. Authentication: เปิด Anonymous provider สำหรับครูทั่วไปที่ใช้รหัสง่าย ๆ
2. Firestore Database: สร้างฐานข้อมูลแบบ production mode แล้วเพิ่ม security rules
3. Storage: เปิด Firebase Storage แล้วเพิ่ม security rules
4. Hosting: เปิด Firebase Hosting แล้ว deploy โฟลเดอร์โปรเจกต์นี้

## การ Login และสิทธิ์

- ผู้ใช้งานทั่วไป: เปิดเว็บแล้วใช้งานได้ทันที ไม่ต้อง Login ระบบใช้ Firebase Anonymous Login เบื้องหลังเมื่อเปิด Firebase
- Admin local: ใช้รหัสที่กำหนดในระบบสำหรับผู้ดูแล ใช้ข้อมูลในเครื่องเมื่อยังไม่ต่อ Firebase
- Admin / ธุรการ: ใช้ Email + Password ที่สร้างไว้ใน Firebase Authentication

ผู้ใช้งานทั่วไปสร้างเอกสารและลงเลขได้ แต่ปุ่มแก้ไข/ลบและหน้า `ตั้งค่าระบบ` จะแสดงเฉพาะ `admin`

## ตัวอย่าง Firestore Security Rules

```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function signedIn() {
      return request.auth != null;
    }

    function isAdmin() {
      return signedIn() && request.auth.token.admin == true;
    }

    match /{document=**} {
      allow read, create: if signedIn();
      allow update, delete: if isAdmin();
    }
  }
}
```

## ตัวอย่าง Storage Security Rules

```js
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read, create: if request.auth != null;
      allow update, delete: if request.auth != null && request.auth.token.admin == true;
    }
  }
}
```

## ส่งออกใช้งานจริงบน Firebase Hosting

ติดตั้ง Firebase CLI แล้ว login:

```bash
npm install -g firebase-tools
firebase login
```

เลือกโปรเจกต์:

```bash
firebase use sarabun-d3ba6
```

Deploy Hosting, Firestore Rules และ Storage Rules:

```bash
firebase deploy
```

หลัง deploy ให้เปิด URL ที่ Firebase แสดง เช่น `https://sarabun-d3ba6.web.app`

ก่อนใช้งานจริงควรตรวจ:

- เปิด Authentication providers: Email/Password และ Anonymous
- สร้างผู้ใช้ Admin/ธุรการใน Firebase Authentication
- ตั้ง Firebase Custom Claim ให้ผู้ใช้ Admin เป็น `{ admin: true }`
- Publish Firestore rules และ Storage rules จากไฟล์ `firestore.rules` และ `storage.rules`
- ทดสอบอัปโหลดไฟล์แนบ 1 รายการ
- ทดสอบสร้างเอกสารย้อนหลังแล้วให้ระบบรันเลขต่อ

ตัวอย่างตั้ง custom claim ด้วย Firebase Admin SDK:

```js
import admin from "firebase-admin";

admin.initializeApp();
await admin.auth().setCustomUserClaims("ADMIN_UID", { admin: true });
```

หมายเหตุด้านสิทธิ์: หน้าเว็บซ่อนปุ่มแก้ไข/ลบสำหรับคนทั่วไป และ Security Rules บังคับซ้ำด้วย custom claim `admin`

## GitHub Actions + Firebase CI/CD

โปรเจกต์มี workflow ที่ `.github/workflows/firebase-hosting.yml`

- ทุกครั้งที่ `push` เข้า branch `main` ระบบจะตรวจ JavaScript แล้ว deploy ไป Firebase Hosting live อัตโนมัติ
- ทุก Pull Request เข้า `main` ระบบจะสร้าง Firebase Hosting preview channel สำหรับทดสอบก่อน merge

ก่อนใช้งาน CI/CD ให้เพิ่ม GitHub Secret ชื่อ:

```text
FIREBASE_SERVICE_ACCOUNT_SARABUN_D3BA6
```

วิธีสร้างค่า secret ที่ง่ายที่สุด:

```bash
firebase init hosting:github
```

เลือกโปรเจกต์ `sarabun-d3ba6` และ repo `nattakit2540-ops/SaRaBun` แล้ว Firebase CLI จะช่วยสร้าง service account และใส่ secret ให้ GitHub อัตโนมัติ หากต้องตั้งเอง ให้สร้าง Service Account JSON ใน Firebase/Google Cloud แล้วนำ JSON ทั้งก้อนใส่ใน GitHub repository settings > Secrets and variables > Actions

หลังตั้ง secret แล้ว การ deploy ปกติจะเหลือเพียง:

```bash
git add .
git commit -m "Update site"
git push
```

## ส่งขึ้น GitHub

เครื่องนี้ควรมี `git` และ `gh` หรือใช้ GitHub Desktop ก่อนส่งขึ้น GitHub

```bash
git init
git add .
git commit -m "Initial E-SARABAN SCHOOL"
git branch -M main
git remote add origin https://github.com/OWNER/REPOSITORY.git
git push -u origin main
```

ถ้าต้องการให้ Codex ส่งไฟล์ผ่าน GitHub connector ให้แจ้ง repo ในรูปแบบ `OWNER/REPOSITORY`

## หลักการเลขเอกสาร

- คำสั่งโรงเรียน: `คส.001/2568`
- บันทึกข้อความ: `วช 001/2568`
- บันทึกข้อความกลุ่มงบประมาณ/การเงิน หรือพัสดุ: `งบ 001/2568 · งป2568`
- หนังสือส่ง: `ที่ ศธ 04122.014/001`
- เลขทะเบียน reset ตามปี พ.ศ. ปฏิทิน โดยแยก counter ตามประเภทเอกสารและกลุ่มงานที่จำเป็น
- สามารถกรอกเลขย้อนหลัง/เลขกำหนดเองได้ในฟอร์ม หากกรอกคำสั่งโรงเรียนเป็น `024/2568` ระบบจะแสดงเป็น `คส.024/2568` และปรับ counter ให้เลขอัตโนมัติครั้งถัดไปเป็น `คส.025/2568`
- หากไม่กรอกเลขกำหนดเอง ระบบจะถือว่าเป็นงานล่าสุดและออกเลขถัดไปให้อัตโนมัติ

แนวทางออกแบบอ้างอิงระเบียบสำนักนายกรัฐมนตรีว่าด้วยงานสารบรรณ พ.ศ. 2526 และที่แก้ไขเพิ่มเติมถึงฉบับที่ 4 พ.ศ. 2564 ในระดับรูปแบบทะเบียนและข้อมูลกำกับเอกสาร

## ฟีเจอร์ที่มี

- Dashboard สรุปจำนวนคำสั่ง บันทึกข้อความ หนังสือส่ง ไฟล์แนบ เอกสารล่าสุด และสถานะหลัก
- โมดูลคำสั่งโรงเรียน พร้อมร่างฉบับเต็ม metadata keywords และค้นหาย้อนหลัง
- โมดูลบันทึกข้อความ พร้อมสถานะอนุมัติและ audit log เมื่อเปลี่ยนสถานะ
- โมดูลหนังสือส่ง พร้อม checklist ก่อนส่ง ระบบยืนยันการรับ และ audit log
- Export CSV แยกแต่ละโมดูล
- Print preview สำหรับร่างเอกสาร
- Responsive สำหรับ Desktop, Tablet, Mobile
- ฟอร์มเอกสารปรับให้เหมาะกับงานโรงเรียน ลดช่องที่ไม่จำเป็นในคำสั่งโรงเรียนและบันทึกข้อความ และคงข้อมูลสำคัญสำหรับหนังสือส่ง
- แสดงชื่อโรงเรียนชุมชนบ้านหนองผึ้ง (ประพันธ์คุรุราษฎร์อุทิศ) และโลโก้ สพฐ.
- หน้า `ตั้งค่าระบบ` สำหรับชื่อโรงเรียน รหัสโรงเรียน prefix หนังสือส่ง ปีงบประมาณ และ role เริ่มต้น
- ปุ่มแก้ไข/ลบเอกสาร พร้อมบันทึก audit log เมื่อแก้ไข
- Import ข้อมูลย้อนหลังจาก CSV และ Excel `.xlsx`
- หน้า `ประวัติ` สำหรับดู audit log แยกตามเอกสาร
- หน้าค้นหามีตัวกรองประเภทเอกสาร สถานะ ปี พ.ศ. วันที่ และกลุ่มงาน
- ทะเบียนบันทึกข้อความมี dropdown แยกดูตามกลุ่มงาน เพื่อไม่ให้ข้อมูลแต่ละฝ่ายปนกัน
- รองรับ role เบื้องต้น: `admin`, `officer`, `approver`

## รูปแบบไฟล์ Import

ไฟล์ CSV/Excel ควรมีหัวคอลัมน์ เช่น

```text
module,number,subject,date,workGroup,recipientOrg,signer,status
orders,คส.2569/001,แต่งตั้งคณะกรรมการ,2026-05-09,,,ผู้อำนวยการ,approved
memos,วช 001/2569,ขออนุมัติโครงการ,2026-05-09,academic,,ครูผู้รับผิดชอบ,pending
outgoing,ที่ ศธ 04122.014/001,แจ้งกำหนดการ,2026-05-09,,สำนักงานเขตพื้นที่,ผู้อำนวยการ,sent
```

หากเปิดแบบ offline และนำเข้า Excel ไม่ได้ ให้บันทึกไฟล์ Excel เป็น CSV แล้วนำเข้าอีกครั้ง
