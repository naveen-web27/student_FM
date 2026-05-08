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
  const s = Object.assign({}, p.student || {});
  const required = ['name', 'class', 'section', 'roll_no'];
  for (const k of required) if (!s[k]) return { ok: false, error: 'MISSING_' + k.toUpperCase() };
  if (!s.student_id) s.student_id = uid_('S');
  s.status = s.status || 'active';

  // Optional: create a parent login on the fly.
  // payload may include parent_username + parent_password.
  const parentUsername = (p.parent_username || '').toString().trim();
  const parentPassword = (p.parent_password || '').toString();
  if (parentUsername && parentPassword) {
    const existing = findUser_(parentUsername);
    if (existing) {
      if (existing.role !== ROLES.PARENT) return { ok: false, error: 'USERNAME_TAKEN' };
      s.parent_user_id = existing.user_id;
    } else {
      const newUserId = uid_('U');
      const created = createUser_({
        user_id:  newUserId,
        username: parentUsername,
        password: parentPassword,
        role:     ROLES.PARENT,
        linked_id: s.student_id,
        name:     s.parent_name || parentUsername
      });
      if (!created.ok) return created;
      s.parent_user_id = newUserId;
    }
  }

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
  const s = Object.assign({}, p.staff || {});
  if (!s.name) return { ok: false, error: 'MISSING_NAME' };
  if (!s.staff_id) s.staff_id = uid_('T');
  s.status = s.status || 'active';

  // Upsert the staff row (replace if same staff_id, else append).
  const data = sh.getDataRange().getValues();
  const idCol = head.indexOf('staff_id');
  let targetRow = -1;
  for (let i = 1; i < data.length; i++) {
    if (data[i][idCol] == s.staff_id) { targetRow = i + 1; break; }
  }
  const row = head.map(h => s[h] !== undefined ? s[h] : '');
  if (targetRow === -1) sh.appendRow(row);
  else sh.getRange(targetRow, 1, 1, head.length).setValues([row]);

  // Optional: create a teacher login on the fly.
  // payload may include username + password (+ class + section for ClassTeacher mapping).
  const username = (p.username || '').toString().trim();
  const password = (p.password || '').toString();
  if (username && password) {
    const existing = findUser_(username);
    if (existing && existing.linked_id != s.staff_id) {
      return { ok: false, error: 'USERNAME_TAKEN' };
    }
    if (!existing) {
      const created = createUser_({
        user_id:  uid_('U'),
        username: username,
        password: password,
        role:     s.role === 'admin' ? ROLES.ADMIN : ROLES.TEACHER,
        linked_id: s.staff_id,
        name:     s.name
      });
      if (!created.ok) return created;
    }
  }

  // Optional: assign class teacher (class + section).
  const cls = (p.class || '').toString().trim();
  const sec = (p.section || '').toString().trim();
  if (cls && sec) {
    const ct = getSheet_(SHEETS.CLASS_TEACHER);
    const ctData = ct.getDataRange().getValues();
    let found = false;
    for (let i = 1; i < ctData.length; i++) {
      if (ctData[i][0] == s.staff_id) {
        ct.getRange(i + 1, 1, 1, 3).setValues([[s.staff_id, cls, sec]]);
        found = true; break;
      }
    }
    if (!found) ct.appendRow([s.staff_id, cls, sec]);
  }

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
