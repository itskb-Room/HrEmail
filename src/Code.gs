/** Google Apps Script backend for the SKB People web app.
 * Import the latest workbook as a Google Sheet, then initialize the admin
 * password using the setup instructions in README.md.
 */
const EMPLOYEE_SHEET = 'ทะเบียนพนักงาน 2569';
const UPDATE_SHEET = 'ContactUpdates';
const SESSION_SECONDS = 1800;
const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'ไม่ทราบ'];

function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('อัปเดตข้อมูลติดต่อพนักงาน | SKB People');
}

function spreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) throw new Error('ยังไม่ได้ตั้งค่า Spreadsheet ID');
  return SpreadsheetApp.openById(id);
}

function employeeSheet_() {
  const sheet = spreadsheet_().getSheetByName(EMPLOYEE_SHEET);
  if (!sheet) throw new Error('ไม่พบชีต ' + EMPLOYEE_SHEET);
  return sheet;
}

function ensureEmployeeProfileHeaders_(sheet) {
  const expected = ['เคยบรรพชาหรืออุปสมบท', 'เคยไปอุมเราะห์/ฮัจญ์', 'กรุ๊ปเลือด', 'ยินยอม PDPA', 'เวลาที่ยินยอม'];
  const range = sheet.getRange(4, 10, 1, expected.length);
  const current = range.getDisplayValues()[0];
  current.forEach((value, i) => {
    if (value && value !== expected[i]) throw new Error('ไม่สามารถเพิ่มคอลัมน์ข้อมูลที่ ' + String.fromCharCode(74 + i) + ' ได้ เนื่องจากมีหัวคอลัมน์อื่นอยู่แล้ว');
  });
  range.setValues([expected]);
}

function updatesSheet_() {
  const book = spreadsheet_();
  let sheet = book.getSheetByName(UPDATE_SHEET);
  if (!sheet) {
    sheet = book.insertSheet(UPDATE_SHEET);
  }
  sheet.getRange(1, 1, 1, 9).setValues([['รหัสพนักงาน', 'สถานะยืนยัน', 'เวลาที่แก้ไข', 'ผู้แก้ไข', 'เคยบรรพชาหรืออุปสมบท', 'เคยไปอุมเราะห์/ฮัจญ์', 'กรุ๊ปเลือด', 'ยินยอม PDPA', 'เวลาที่ยินยอม']]);
  return sheet;
}

function employeeRows_() {
  const sheet = employeeSheet_();
  ensureEmployeeProfileHeaders_(sheet);
  const last = sheet.getLastRow();
  if (last < 5) return [];
  return sheet.getRange(5, 1, last - 4, 9).getDisplayValues()
    .map((r, i) => ({row: i + 5, id: String(r[1]).trim(), name: String(r[2]).trim(), department: String(r[3]).trim(), position: String(r[4]).trim(), phone: String(r[7]).trim(), email: String(r[8]).trim()}))
    .filter(e => e.id && e.name && /^\d+$/.test(e.id));
}

function statuses_() {
  const sheet = updatesSheet_();
  const last = sheet.getLastRow();
  const map = {};
  if (last > 1) sheet.getRange(2, 1, last - 1, 9).getDisplayValues().forEach((r, i) => {
    if (r[0]) map[r[0]] = {confirmed: r[1] === 'YES', updatedAt: r[2], updatedBy: r[3], ordination: r[4] === 'YES' ? true : r[4] === 'NO' ? false : null, pilgrimage: r[5] === 'YES' ? true : r[5] === 'NO' ? false : null, bloodGroup: r[6] || '', consent: r[7] === 'YES', consentAt: r[8] || '', row: i + 2};
  });
  return map;
}

function findEmployee_(id) {
  return employeeRows_().find(e => e.id === String(id || '').trim());
}

function publicEmployee_(e, status) {
  status = status || {};
  return {id: e.id, name: e.name, department: e.department, position: e.position, phone: e.phone, email: e.email, ordination: status.ordination === true ? true : status.ordination === false ? false : null, pilgrimage: status.pilgrimage === true ? true : status.pilgrimage === false ? false : null, bloodGroup: status.bloodGroup || '', consent: status.consent === true, consentAt: status.consentAt || ''};
}

function lookupEmployee(id) {
  const employee = findEmployee_(id);
  if (!employee) return null;
  return publicEmployee_(employee, statuses_()[employee.id]);
}

// Run from the Apps Script editor before deployment. Returns counts only,
// never employee names, phone numbers or email addresses.
function verifySetup() {
  const rows = employeeRows_();
  const codes = rows.map(e => e.id);
  const unique = new Set(codes);
  const statuses = statuses_();
  const props = PropertiesService.getScriptProperties();
  const report = {
    employees: rows.length,
    uniqueCodes: unique.size,
    duplicateCodes: rows.length - unique.size,
    adminPasswordReady: !!(props.getProperty('ADMIN_PASSWORD_SALT') && props.getProperty('ADMIN_PASSWORD_HASH')),
    confirmed: Object.keys(statuses).filter(id => unique.has(id) && statuses[id].confirmed).length
  };
  if (!report.employees || report.duplicateCodes || !report.adminPasswordReady) throw new Error('ตรวจสอบการตั้งค่าไม่ผ่าน: ' + JSON.stringify(report));
  Logger.log(JSON.stringify(report));
  return report;
}

function contactList_(value, type) {
  const separators = type === 'phone' ? /[\n,;|/]+/ : /[\n,;|]+/;
  const items = (Array.isArray(value) ? value : String(value || '').split(separators))
    .map(v => String(v || '').trim()).filter(Boolean);
  const seen = {};
  return items.filter(item => {
    const key = type === 'email' ? item.toLowerCase() : item.replace(/\D/g, '');
    if (seen[key]) return false;
    seen[key] = true;
    return true;
  });
}

function validateContact_(phone, email, required) {
  const phones = contactList_(phone, 'phone');
  const emails = contactList_(email, 'email');
  if (phones.length > 5 || emails.length > 5) throw new Error('กรอกเบอร์โทรศัพท์และอีเมลได้ไม่เกินประเภทละ 5 รายการ');
  if (required && !phones.length) throw new Error('กรุณากรอกเบอร์โทรศัพท์อย่างน้อย 1 เบอร์');
  if (required && !emails.length) throw new Error('กรุณากรอกอีเมลอย่างน้อย 1 อีเมล');
  phones.forEach((item, i) => {
    if (!/^0\d{9}$/.test(item.replace(/[-\s]/g, '')) || !/^[\d\s-]+$/.test(item)) throw new Error('เบอร์โทรศัพท์ลำดับที่ ' + (i + 1) + ' ต้องเป็นหมายเลขไทย 10 หลัก');
  });
  emails.forEach((item, i) => {
    if (!/^[A-Za-z0-9][A-Za-z0-9._%+-]*@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(item)) throw new Error('อีเมลลำดับที่ ' + (i + 1) + ' มีรูปแบบไม่ถูกต้อง');
  });
  return {phone: phones.join('\n'), email: emails.join('\n')};
}

function validateProfile_(ordination, pilgrimage, bloodGroup, required) {
  const hasOrdination = typeof ordination === 'boolean';
  const hasPilgrimage = typeof pilgrimage === 'boolean';
  bloodGroup = String(bloodGroup || '').trim().toUpperCase();
  if (required && !hasOrdination) throw new Error('กรุณาเลือกข้อมูลการบรรพชาหรืออุปสมบท');
  if (required && !hasPilgrimage) throw new Error('กรุณาเลือกข้อมูลการไปอุมเราะห์/ฮัจญ์');
  if (required && BLOOD_GROUPS.indexOf(bloodGroup) < 0) throw new Error('กรุณาเลือกกรุ๊ปเลือด');
  if (bloodGroup && BLOOD_GROUPS.indexOf(bloodGroup) < 0) throw new Error('กรุ๊ปเลือดไม่ถูกต้อง');
  return {ordination: hasOrdination ? ordination : null, pilgrimage: hasPilgrimage ? pilgrimage : null, bloodGroup: bloodGroup};
}

function writeStatus_(id, confirmed, actor, profile, consentAccepted) {
  const sheet = updatesSheet_();
  const old = statuses_()[id];
  profile = profile || old || {};
  const consent = consentAccepted === true || !!(old && old.consent);
  const consentAt = consentAccepted === true ? new Date() : old && old.consentAt ? old.consentAt : '';
  const row = [id, confirmed ? 'YES' : 'NO', new Date(), actor, profile.ordination === true ? 'YES' : profile.ordination === false ? 'NO' : '', profile.pilgrimage === true ? 'YES' : profile.pilgrimage === false ? 'NO' : '', profile.bloodGroup || '', consent ? 'YES' : 'NO', consentAt];
  if (old) sheet.getRange(old.row, 1, 1, 9).setValues([row]);
  else sheet.appendRow(row);
}

function writeEmployeeProfile_(employee, profile, consentAccepted) {
  const sheet = employeeSheet_();
  ensureEmployeeProfileHeaders_(sheet);
  const old = statuses_()[employee.id] || {};
  const consent = consentAccepted === true || old.consent === true;
  const consentAt = consentAccepted === true ? new Date() : old.consentAt || '';
  sheet.getRange(employee.row, 10, 1, 5).setValues([[
    profile.ordination === true ? 'YES' : profile.ordination === false ? 'NO' : '',
    profile.pilgrimage === true ? 'YES' : profile.pilgrimage === false ? 'NO' : '',
    profile.bloodGroup || '',
    consent ? 'YES' : 'NO',
    consentAt
  ]]);
}

function updateContact(id, phone, email, ordination, pilgrimage, bloodGroup, consentAccepted) {
  const contact = validateContact_(phone, email, true);
  const profile = validateProfile_(ordination, pilgrimage, bloodGroup, true);
  if (consentAccepted !== true) throw new Error('กรุณายินยอมการเก็บและใช้ข้อมูลส่วนบุคคลตาม PDPA ก่อนยืนยัน');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const employee = findEmployee_(id);
    if (!employee) throw new Error('ไม่พบรหัสพนักงาน');
    employeeSheet_().getRange(employee.row, 8, 1, 2).setValues([[contact.phone, contact.email]]);
    writeEmployeeProfile_(employee, profile, true);
    writeStatus_(employee.id, true, 'self-service (code only)', profile, true);
    return {ok: true};
  } finally { lock.releaseLock(); }
}

// Set ADMIN_PASSWORD_SETUP in Script Properties, then run this function once.
// The setup property is removed after hashing.
function initializeAdminPassword_() {
  const props = PropertiesService.getScriptProperties();
  const password = props.getProperty('ADMIN_PASSWORD_SETUP');
  if (!password) throw new Error('ตั้งค่า ADMIN_PASSWORD_SETUP ก่อน');
  setAdminPassword_(password);
  props.deleteProperty('ADMIN_PASSWORD_SETUP');
}

// Editor entry point. It can initialize only while ADMIN_PASSWORD_SETUP exists,
// and that one-time property is deleted immediately after successful setup.
function initializeAdminPassword() {
  initializeAdminPassword_();
  return 'ตั้งรหัสผ่านผู้ดูแลเรียบร้อยแล้ว';
}

function setAdminPassword_(password) {
  password = String(password || '').trim();
  if (password.length < 5) throw new Error('รหัสผ่านสั้นเกินไป');
  const salt = Utilities.getUuid();
  PropertiesService.getScriptProperties().setProperties({
    ADMIN_PASSWORD_SALT: salt,
    ADMIN_PASSWORD_HASH: hash_(salt + password)
  });
}

function hash_(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8)
    .map(b => ('0' + (b & 255).toString(16)).slice(-2)).join('');
}

function adminLogin(password) {
  const cache = CacheService.getScriptCache();
  const attempts = Number(cache.get('admin:failedAttempts') || 0);
  const props = PropertiesService.getScriptProperties();
  const salt = props.getProperty('ADMIN_PASSWORD_SALT');
  const expected = props.getProperty('ADMIN_PASSWORD_HASH');
  if (!salt || !expected) throw new Error('ยังไม่ได้ตั้งรหัสผู้ดูแล กรุณาให้ HR ตั้งรหัสใน Apps Script ก่อน');
  const matches = hash_(salt + String(password || '').trim()) === expected;
  if (matches) {
    cache.remove('admin:failedAttempts');
  } else {
    if (attempts >= 5) throw new Error('ลองรหัสผิดหลายครั้ง กรุณารอ 15 นาที');
    cache.put('admin:failedAttempts', String(attempts + 1), 900);
    throw new Error('รหัสผ่านไม่ถูกต้อง');
  }
  const token = Utilities.getUuid() + Utilities.getUuid();
  cache.put('admin:' + token, '1', SESSION_SECONDS);
  return token;
}

function requireAdmin_(token) {
  if (!token || !CacheService.getScriptCache().get('admin:' + String(token))) throw new Error('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');
}

function adminLogout(token) {
  requireAdmin_(token);
  CacheService.getScriptCache().remove('admin:' + String(token));
  return true;
}

function adminDashboard(token) {
  requireAdmin_(token);
  const statuses = statuses_();
  const employees = employeeRows_().map(e => {
    const status = statuses[e.id] || {};
    return Object.assign(publicEmployee_(e, status), {confirmed: !!status.confirmed, updatedAt: status.updatedAt || ''});
  });
  return {total: employees.length, confirmed: employees.filter(e => e.confirmed).length, employees: employees};
}

function adminSaveEmployee(token, id, phone, email, confirmed, ordination, pilgrimage, bloodGroup) {
  requireAdmin_(token);
  const contact = validateContact_(phone, email, confirmed === true);
  const profile = validateProfile_(ordination, pilgrimage, bloodGroup, confirmed === true);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const employee = findEmployee_(id);
    if (!employee) throw new Error('ไม่พบรหัสพนักงาน');
    employeeSheet_().getRange(employee.row, 8, 1, 2).setValues([[contact.phone, contact.email]]);
    writeEmployeeProfile_(employee, profile, false);
    writeStatus_(employee.id, confirmed === true, 'admin', profile);
    return {ok: true};
  } finally { lock.releaseLock(); }
}
