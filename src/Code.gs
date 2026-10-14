/** Google Apps Script backend for the SKB People web app.
 * Import the latest workbook as a Google Sheet, then initialize the admin
 * password using the setup instructions in README.md.
 */
const EMPLOYEE_SHEET = 'ทะเบียนพนักงาน 2569';
const UPDATE_SHEET = 'ContactUpdates';
const SESSION_SECONDS = 1800;

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

function updatesSheet_() {
  const book = spreadsheet_();
  let sheet = book.getSheetByName(UPDATE_SHEET);
  if (!sheet) {
    sheet = book.insertSheet(UPDATE_SHEET);
    sheet.appendRow(['รหัสพนักงาน', 'สถานะยืนยัน', 'เวลาที่แก้ไข', 'ผู้แก้ไข']);
  }
  return sheet;
}

function employeeRows_() {
  const sheet = employeeSheet_();
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
  if (last > 1) sheet.getRange(2, 1, last - 1, 4).getDisplayValues().forEach((r, i) => {
    if (r[0]) map[r[0]] = {confirmed: r[1] === 'YES', updatedAt: r[2], updatedBy: r[3], row: i + 2};
  });
  return map;
}

function findEmployee_(id) {
  return employeeRows_().find(e => e.id === String(id || '').trim());
}

function publicEmployee_(e) {
  return {id: e.id, name: e.name, department: e.department, position: e.position, phone: e.phone, email: e.email};
}

function lookupEmployee(id) {
  const employee = findEmployee_(id);
  return employee ? publicEmployee_(employee) : null;
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

function validateContact_(phone, email, required) {
  phone = String(phone || '').trim();
  email = String(email || '').trim();
  if ((required || phone) && (!/^0\d{9}$/.test(phone.replace(/[-\s]/g, '')) || !/^[\d\s-]+$/.test(phone))) throw new Error('เบอร์โทรศัพท์ต้องเป็นหมายเลขไทย 10 หลัก');
  if ((required || email) && !/^[A-Za-z0-9][A-Za-z0-9._%+-]*@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email)) throw new Error('รูปแบบอีเมลไม่ถูกต้อง');
  return {phone: phone, email: email};
}

function writeStatus_(id, confirmed, actor) {
  const sheet = updatesSheet_();
  const old = statuses_()[id];
  const row = [id, confirmed ? 'YES' : 'NO', new Date(), actor];
  if (old) sheet.getRange(old.row, 1, 1, 4).setValues([row]);
  else sheet.appendRow(row);
}

function updateContact(id, phone, email) {
  const contact = validateContact_(phone, email, true);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const employee = findEmployee_(id);
    if (!employee) throw new Error('ไม่พบรหัสพนักงาน');
    employeeSheet_().getRange(employee.row, 8, 1, 2).setValues([[contact.phone, contact.email]]);
    writeStatus_(employee.id, true, 'self-service (code only)');
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
    return Object.assign(publicEmployee_(e), {confirmed: !!status.confirmed, updatedAt: status.updatedAt || ''});
  });
  return {total: employees.length, confirmed: employees.filter(e => e.confirmed).length, employees: employees};
}

function adminSaveEmployee(token, id, phone, email, confirmed) {
  requireAdmin_(token);
  const contact = validateContact_(phone, email, confirmed === true);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const employee = findEmployee_(id);
    if (!employee) throw new Error('ไม่พบรหัสพนักงาน');
    employeeSheet_().getRange(employee.row, 8, 1, 2).setValues([[contact.phone, contact.email]]);
    writeStatus_(employee.id, confirmed === true, 'admin');
    return {ok: true};
  } finally { lock.releaseLock(); }
}
