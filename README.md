# SKB People — Employee Contact Update

เว็บแอป Google Apps Script สำหรับให้พนักงานค้นหาข้อมูลจากรหัสพนักงาน อัปเดตเบอร์โทรศัพท์/อีเมล และให้ HR ตรวจสอบรายการที่ยังไม่ยืนยันผ่านแดชบอร์ดผู้ดูแล หน้า `index.html` ที่ root ใช้เป็น GitHub Pages wrapper ส่วน source ของ Apps Script อยู่ใน `src/`

> Repository นี้เก็บเฉพาะ source code ห้าม commit ทะเบียนพนักงาน ข้อมูลส่วนบุคคล Spreadsheet ID, Script ID, OAuth credentials หรือรหัสผ่าน ส่วน deployment URL ใน GitHub Pages เป็น URL สาธารณะ

## โครงสร้างข้อมูล Google Sheets

ชีตทะเบียนเริ่มข้อมูลที่แถว 5 และใช้คอลัมน์ดังนี้:

| คอลัมน์ | ข้อมูล |
|---|---|
| B | รหัสพนักงาน |
| C | ชื่อ–สกุล |
| D | หน่วยงาน |
| E | ตำแหน่ง |
| H | เบอร์โทรศัพท์ |
| I | อีเมล |
| J | เคยบรรพชาหรืออุปสมบท |
| K | เคยไปอุมเราะห์/ฮัจญ์ |
| L | กรุ๊ปเลือด |
| M | ยินยอม PDPA |
| N | เวลาที่ยินยอม |
| O | ประเภทที่พัก (บ้านตนเอง/บ้านเช่า/หอพัก) |
| P–X | ที่อยู่ปัจจุบันแบบแยกช่อง (อาคาร/หมู่บ้าน บ้านเลขที่ หมู่ ซอย ถนน ตำบล อำเภอ จังหวัด รหัสไปรษณีย์) |
| Y | ที่อยู่ปัจจุบัน (รวม) — บรรทัดเดียวอ่านง่าย สำหรับดู/พิมพ์/กรอง |

ระบบรองรับเบอร์โทรศัพท์และอีเมลประเภทละไม่เกิน 5 รายการ โดยเก็บหลายค่าในเซลล์ H/I แบบแยกบรรทัด ข้อมูลเพิ่มเติมและการยินยอมจะบันทึกในคอลัมน์ J–Y ของทะเบียนหลัก (รวมที่อยู่ปัจจุบันแบบแยกช่องและแบบรวมบรรทัดเดียวที่คอลัมน์ Y) และสำรองประวัติไว้ในชีต `ContactUpdates` พร้อมสถานะยืนยัน เวลา และผู้แก้ไข ระบบจะตรวจว่าคอลัมน์ J–Y ว่างหรือมีหัวคอลัมน์ตรงกันก่อนเขียน เพื่อป้องกันการทับข้อมูลเดิม

## การตั้งค่า Apps Script

1. สร้าง Google Sheet จากทะเบียนที่ได้รับอนุญาต และจำกัดสิทธิ์ไฟล์ให้เฉพาะผู้เกี่ยวข้อง
2. สร้าง Apps Script project และเพิ่มไฟล์จาก `src/`: `Code.gs`, `index.html`, `appsscript.json`
3. ที่ **Project Settings → Script properties** ตั้งค่า:
   - `SPREADSHEET_ID` — ID ของ Google Sheet (เก็บเฉพาะใน Script Properties)
   - `ADMIN_PASSWORD_SETUP` — รหัสเริ่มต้นที่ยาวและไม่ซ้ำ
4. ใน Editor รัน `initializeAdminPassword` หนึ่งครั้ง ระบบจะเก็บเฉพาะ salted hash และลบ `ADMIN_PASSWORD_SETUP` อัตโนมัติ
5. รัน `verifySetup` แล้วตรวจว่า `employees` ตรงกับทะเบียน, `duplicateCodes` เป็น `0` และ `adminPasswordReady` เป็น `true`
6. Deploy เป็น Web app โดยเลือก **Execute as: Me** และจำกัดผู้เข้าถึงให้แคบที่สุดตามนโยบายองค์กร

หากต้องเปลี่ยนรหัสผู้ดูแล ให้ตั้ง `ADMIN_PASSWORD_SETUP` ใหม่และรัน `initializeAdminPassword` อีกครั้ง ห้ามใส่รหัสผ่านจริงใน source code, README, issue หรือ commit history

## ใช้งานผ่าน clasp

ต้องมี Node.js และ `@google/clasp`:

```powershell
npm install -g @google/clasp
clasp login
```

เปิด Google Apps Script API ที่ <https://script.google.com/home/usersettings> แล้วสร้าง `.clasp.json` เฉพาะบนเครื่อง:

```json
{
  "scriptId": "YOUR_SCRIPT_ID"
}
```

ตรวจไฟล์ก่อนอัปโหลดทุกครั้ง:

```powershell
clasp show-file-status
clasp push
```

`.clasp.json` ใช้ `rootDir: "src"` และ `.claspignore` อนุญาตให้ส่งเฉพาะ `src/Code.gs`, `src/index.html` และ `src/appsscript.json` ส่วน `.gitignore` ป้องกันไฟล์ทะเบียน, exports, credentials และ `.clasp.json` ไม่ให้เข้า Git โดยไม่ตั้งใจ

## GitHub Pages

ไฟล์ `index.html` ที่ root เปลี่ยนเส้นทางไปยัง Web app ที่เผยแพร่จาก Apps Script โดยตรง เนื่องจาก Apps Script ใช้ `X-Frame-Options: sameorigin` และไม่อนุญาตให้ GitHub Pages ฝังผ่าน iframe URL ของ deployment จะมองเห็นได้ใน source และ Network inspector ตามธรรมชาติ จึงต้องถือว่าเป็น URL สาธารณะ ไม่ใช้ URL เป็นกลไกยืนยันตัวตน และห้ามใส่ Spreadsheet ID, Script ID, รหัสผ่าน หรือข้อมูลรับรองลงในหน้า redirect

## คำเตือนด้านความปลอดภัย

- รูปแบบปัจจุบันใช้รหัสพนักงานสำหรับค้นหา แต่ไม่ได้พิสูจน์ว่าเป็นเจ้าของรหัสจริง ผู้รู้รหัสอาจดูหรือแก้ข้อมูลแทนกันได้ ควรเพิ่ม Google Workspace authentication หรือ OTP ก่อนเปิดใช้นอกวงจำกัด
- กรุ๊ปเลือดเป็นข้อมูลสุขภาพ และคำถามด้านศาสนกิจอาจบ่งชี้ความเชื่อทางศาสนา ซึ่งเป็นข้อมูลส่วนบุคคลอ่อนไหว ควรให้ฝ่ายกฎหมาย/DPO ตรวจข้อความแจ้งความเป็นส่วนตัว วัตถุประสงค์ ฐานกฎหมาย ระยะเวลาเก็บรักษา และกระบวนการถอนความยินยอมก่อนใช้งานจริง
- สถานะ “ยืนยันแล้ว” หมายถึงมีการกดยืนยันผ่านแบบฟอร์ม ไม่ใช่หลักฐานยืนยันตัวบุคคล
- ห้ามทำ Google Sheet เป็นสาธารณะ และให้สิทธิ์แก้ไขเฉพาะ HR/เจ้าของสคริปต์
- Repository แบบ Public ต้องไม่มีข้อมูลพนักงาน Spreadsheet ID, Script ID, รหัสผ่าน หรือข้อมูลรับรองทุกชนิด ส่วน deployment URL ที่ใช้โดย GitHub Pages เป็น URL สาธารณะโดยธรรมชาติ
- ก่อน commit ใช้ `git status --short` และตรวจ staged files ด้วย `git diff --cached --name-only`

## ไฟล์ที่เผยแพร่ได้

- `src/Code.gs`
- `src/index.html`
- `src/appsscript.json`
- `index.html` (GitHub Pages wrapper)
- `.claspignore`
- `.gitignore`
- `README.md`

ไฟล์ข้อมูลจริงและค่าตั้งค่าของแต่ละ deployment ต้องอยู่นอก GitHub เสมอ
