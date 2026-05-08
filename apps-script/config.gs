/**
 * config.gs
 * Central place for sheet names, secrets, constants.
 * Set HMAC_SECRET via: File → Project Settings → Script Properties.
 */

const SHEETS = {
  USERS:         'Users',
  STUDENTS:      'Students',
  STAFF:         'Staff',
  CLASS_TEACHER: 'ClassTeacher',
  ATTENDANCE:    'Attendance',
  ATT_SUMMARY:   'AttendanceSummary',
  MARKS:         'Marks',
  FEES:          'Fees',
  AUDIT:         'AuditLog',
  NOTIFY:        'NotifyLog'
};

const ROLES = { ADMIN: 'admin', TEACHER: 'teacher', PARENT: 'parent', STUDENT: 'student' };

const TOKEN_TTL_HOURS  = 8;
const RATE_LIMIT_PER_MIN = 60;
const TEACHER_EDIT_WINDOW_MIN = 30;
const ATTENDANCE_AUTOLOCK_HOUR = 10; // 10:30 AM auto-lock for teachers
const ATTENDANCE_AUTOLOCK_MIN  = 30;

function getSecret_() {
  const s = PropertiesService.getScriptProperties().getProperty('HMAC_SECRET');
  if (!s) throw new Error('HMAC_SECRET not set in Script Properties');
  return s;
}

function getSheet_(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(name);
  if (!sh) throw new Error('Missing sheet: ' + name);
  return sh;
}

function nowIso_() { return new Date().toISOString(); }
function todayIso_() {
  const tz = Session.getScriptTimeZone();
  return Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
}
function uid_(prefix) { return (prefix || '') + Utilities.getUuid().slice(0, 8); }
