/**
 * students.gs — Students & Staff handlers.
 */

function readAll_(sheetName) {
  const sh = getSheet_(sheetName);
  const data = sh.getDataRange().getValues();
  if (data.length < 2) return { head: data[0] || [], rows: [], sh };
  return { head: data[0], rows: data.slice(1), sh };
}

function rowsToObjects_(head, rows) {
  return rows.map(r => {
    const o = {};
    head.forEach((h, i) => o[h] = r[i]);
    return o;
  });
}

function studentsList_(p, user) {
  if (user.role !== ROLES.ADMIN && user.role !== ROLES.TEACHER) {
    return { ok: false, error: 'FORBIDDEN' };
  }
  const { head, rows } = readAll_(SHEETS.STUDENTS);
  let list = rowsToObjects_(head, rows).filter(s => s.status !== 'inactive');
  if (p && p.class)   list = list.filter(s => String(s.class)   === String(p.class));
  if (p && p.section) list = list.filter(s => String(s.section) === String(p.section));
  return { ok: true, data: { students: list } };
}

function studentsByParent_(p, user) {
  if (user.role !== ROLES.PARENT) return { ok: false, error: 'FORBIDDEN' };
  const { head, rows } = readAll_(SHEETS.STUDENTS);
  const list = rowsToObjects_(head, rows).filter(s => s.parent_user_id == user.user_id);
  return { ok: true, data: { students: list } };
}

function studentsUpsert_(p, user) {
  if (user.role !== ROLES.ADMIN) return { ok: false, error: 'FORBIDDEN' };
  const sh = getSheet_(SHEETS.STUDENTS);
  const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const s = p.student || {};
  const required = ['name', 'class', 'section', 'roll_no'];
  for (const k of required) if (!s[k]) return { ok: false, error: 'MISSING_' + k.toUpperCase() };
  if (!s.student_id) s.student_id = uid_('S');
  s.status = s.status || 'active';

  // find existing row
  const data = sh.getDataRange().getValues();
  const idCol = head.indexOf('student_id');
  let targetRow = -1;
  for (let i = 1; i < data.length; i++) {
    if (data[i][idCol] == s.student_id) { targetRow = i + 1; break; }
  }
  const row = head.map(h => s[h] !== undefined ? s[h] : '');
  if (targetRow === -1) sh.appendRow(row);
  else sh.getRange(targetRow, 1, 1, head.length).setValues([row]);
  return { ok: true, data: { student: s } };
}

function staffList_(p, user) {
  if (user.role !== ROLES.ADMIN) return { ok: false, error: 'FORBIDDEN' };
  const { head, rows } = readAll_(SHEETS.STAFF);
  return { ok: true, data: { staff: rowsToObjects_(head, rows) } };
}

function staffUpsert_(p, user) {
  if (user.role !== ROLES.ADMIN) return { ok: false, error: 'FORBIDDEN' };
  const sh = getSheet_(SHEETS.STAFF);
  const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const s = p.staff || {};
  if (!s.name) return { ok: false, error: 'MISSING_NAME' };
  if (!s.staff_id) s.staff_id = uid_('T');
  s.status = s.status || 'active';
  const row = head.map(h => s[h] !== undefined ? s[h] : '');
  sh.appendRow(row);
  return { ok: true, data: { staff: s } };
}

/* -------- light marks/fees handlers -------- */

function marksByStudent_(p, user) {
  const sid = p.student_id;
  if (!canSeeStudent_(user, sid)) return { ok: false, error: 'FORBIDDEN' };
  const { head, rows } = readAll_(SHEETS.MARKS);
  const list = rowsToObjects_(head, rows).filter(m => m.student_id == sid);
  return { ok: true, data: { marks: list } };
}

function marksUpsert_(p, user) {
  if (user.role !== ROLES.ADMIN && user.role !== ROLES.TEACHER) return { ok: false, error: 'FORBIDDEN' };
  const sh = getSheet_(SHEETS.MARKS);
  const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const m = p.mark || {};
  if (!m.student_id || !m.subject) return { ok: false, error: 'MISSING_FIELDS' };
  if (!m.exam_id) m.exam_id = uid_('E');
  m.updated_at = nowIso_();
  sh.appendRow(head.map(h => m[h] !== undefined ? m[h] : ''));
  return { ok: true, data: { mark: m } };
}

function feesByStudent_(p, user) {
  const sid = p.student_id;
  if (!canSeeStudent_(user, sid)) return { ok: false, error: 'FORBIDDEN' };
  const { head, rows } = readAll_(SHEETS.FEES);
  const list = rowsToObjects_(head, rows).filter(f => f.student_id == sid);
  return { ok: true, data: { fees: list } };
}

function feesUpsert_(p, user) {
  if (user.role !== ROLES.ADMIN) return { ok: false, error: 'FORBIDDEN' };
  const sh = getSheet_(SHEETS.FEES);
  const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const f = p.fee || {};
  if (!f.student_id || !f.term) return { ok: false, error: 'MISSING_FIELDS' };
  if (!f.fee_id) f.fee_id = uid_('F');
  if (!f.receipt_no && f.status === 'paid') f.receipt_no = 'R' + Date.now();
  sh.appendRow(head.map(h => f[h] !== undefined ? f[h] : ''));
  return { ok: true, data: { fee: f } };
}

function canSeeStudent_(user, student_id) {
  if (user.role === ROLES.ADMIN || user.role === ROLES.TEACHER) return true;
  if (user.role === ROLES.STUDENT) return user.linked_id == student_id;
  if (user.role === ROLES.PARENT) {
    const { head, rows } = readAll_(SHEETS.STUDENTS);
    return rowsToObjects_(head, rows).some(s => s.student_id == student_id && s.parent_user_id == user.user_id);
  }
  return false;
}
