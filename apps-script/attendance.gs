/**
 * attendance.gs — the heart of Phase 1.
 * - Teacher submits attendance for their class+section+date.
 * - Server enforces: assigned class only, no double submit,
 *   30-min edit window, server-side timestamps, valid status.
 * - Parent view returns today + month summary in O(1).
 */

function teacherCanMark_(user, klass, section) {
  if (user.role === ROLES.ADMIN) return true;
  if (user.role !== ROLES.TEACHER) return false;
  const { head, rows } = readAll_(SHEETS.CLASS_TEACHER);
  return rowsToObjects_(head, rows).some(r =>
    String(r.staff_id)  === String(user.linked_id) &&
    String(r.class)     === String(klass) &&
    String(r.section)   === String(section)
  );
}

function attGetRoster_(p, user) {
  const klass = String(p.class || '');
  const section = String(p.section || '');
  const date = String(p.date || todayIso_());
  if (!klass || !section) return { ok: false, error: 'MISSING_CLASS' };
  if (!teacherCanMark_(user, klass, section)) return { ok: false, error: 'FORBIDDEN' };

  const sList = studentsList_({ class: klass, section }, { role: ROLES.ADMIN }).data.students;

  // existing attendance for that day, if any
  const { head, rows } = readAll_(SHEETS.ATTENDANCE);
  const existing = rowsToObjects_(head, rows).filter(r =>
    String(r.date) === date && String(r.class) === klass && String(r.section) === section
  );
  const byId = {};
  existing.forEach(e => byId[e.student_id] = e);

  const roster = sList.map(s => ({
    student_id: s.student_id,
    name: s.name,
    roll_no: s.roll_no,
    photo_url: s.photo_url || '',
    status: byId[s.student_id] ? byId[s.student_id].status : 'P',
    attendance_id: byId[s.student_id] ? byId[s.student_id].attendance_id : null,
    locked: !!byId[s.student_id]
  }));

  return { ok: true, data: { date, class: klass, section, roster, alreadySubmitted: existing.length > 0 } };
}

function attSubmit_(p, user) {
  const klass = String(p.class || '');
  const section = String(p.section || '');
  const date = String(p.date || todayIso_());
  const rowsIn = Array.isArray(p.rows) ? p.rows : [];
  if (!klass || !section || !rowsIn.length) return { ok: false, error: 'MISSING_FIELDS' };
  if (!teacherCanMark_(user, klass, section)) return { ok: false, error: 'FORBIDDEN' };
  if (date !== todayIso_() && user.role !== ROLES.ADMIN) return { ok: false, error: 'DATE_NOT_TODAY' };

  // auto-lock check (teachers only)
  if (user.role === ROLES.TEACHER) {
    const now = new Date();
    const tz = Session.getScriptTimeZone();
    const hh = Number(Utilities.formatDate(now, tz, 'HH'));
    const mm = Number(Utilities.formatDate(now, tz, 'mm'));
    if (hh > ATTENDANCE_AUTOLOCK_HOUR || (hh === ATTENDANCE_AUTOLOCK_HOUR && mm > ATTENDANCE_AUTOLOCK_MIN)) {
      return { ok: false, error: 'AUTO_LOCKED' };
    }
  }

  const sh = getSheet_(SHEETS.ATTENDANCE);
  const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];

  // reject if already submitted (idempotency)
  const all = sh.getDataRange().getValues();
  const ix = (k) => head.indexOf(k);
  for (let i = 1; i < all.length; i++) {
    if (String(all[i][ix('date')])    === date &&
        String(all[i][ix('class')])   === klass &&
        String(all[i][ix('section')]) === section) {
      return { ok: false, error: 'ALREADY_SUBMITTED' };
    }
  }

  const validStatus = { P: 1, A: 1, L: 1, H: 1 };
  const stamp = nowIso_();
  const out = [];
  for (const r of rowsIn) {
    const status = validStatus[r.status] ? r.status : 'P';
    const reason = String(r.reason || '').slice(0, 50);
    const sid = String(r.student_id || '');
    if (!sid) continue;
    out.push([
      uid_('A'), date, klass, section, sid, status, reason,
      user.user_id, stamp, '', ''
    ]);
  }
  if (!out.length) return { ok: false, error: 'NO_ROWS' };
  sh.getRange(sh.getLastRow() + 1, 1, out.length, head.length).setValues(out);

  // Notify parents of present / late students (in-app + log)
  notifyParentsOnArrival_(out, head);

  return { ok: true, data: { saved: out.length, date, class: klass, section } };
}

function attEdit_(p, user) {
  const sh = getSheet_(SHEETS.ATTENDANCE);
  const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const data = sh.getDataRange().getValues();
  const ix = (k) => head.indexOf(k);
  const id = String(p.attendance_id || '');
  if (!id) return { ok: false, error: 'MISSING_ID' };

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][ix('attendance_id')]) === id) {
      const klass = data[i][ix('class')];
      const section = data[i][ix('section')];
      const markedAt = new Date(data[i][ix('marked_at')]).getTime();

      const isAdmin = user.role === ROLES.ADMIN;
      const inWindow = (Date.now() - markedAt) < TEACHER_EDIT_WINDOW_MIN * 60 * 1000;
      if (!isAdmin) {
        if (!teacherCanMark_(user, klass, section)) return { ok: false, error: 'FORBIDDEN' };
        if (!inWindow) return { ok: false, error: 'EDIT_WINDOW_CLOSED' };
      }

      const validStatus = { P: 1, A: 1, L: 1, H: 1 };
      const status = validStatus[p.status] ? p.status : data[i][ix('status')];
      sh.getRange(i + 1, ix('status')   + 1).setValue(status);
      sh.getRange(i + 1, ix('reason')   + 1).setValue(String(p.reason || '').slice(0, 50));
      sh.getRange(i + 1, ix('edited_by')+ 1).setValue(user.user_id);
      sh.getRange(i + 1, ix('edited_at')+ 1).setValue(nowIso_());
      return { ok: true, data: { attendance_id: id, status } };
    }
  }
  return { ok: false, error: 'NOT_FOUND' };
}

function attParentView_(p, user) {
  const sid = String(p.student_id || '');
  if (!canSeeStudent_(user, sid)) return { ok: false, error: 'FORBIDDEN' };
  const month = String(p.month || todayIso_().slice(0, 7));
  const today = todayIso_();

  // today's record
  const { head, rows } = readAll_(SHEETS.ATTENDANCE);
  const recs = rowsToObjects_(head, rows).filter(r => r.student_id == sid);
  const todayRec = recs.find(r => String(r.date) === today) || null;
  const monthRecs = recs.filter(r => String(r.date).slice(0, 7) === month);

  // monthly summary (use AttendanceSummary if present; fallback to compute)
  let summary = null;
  try {
    const sum = readAll_(SHEETS.ATT_SUMMARY);
    const found = rowsToObjects_(sum.head, sum.rows).find(r => r.student_id == sid && r.month == month);
    if (found) summary = found;
  } catch (_) {}
  if (!summary) {
    let P = 0, A = 0, L = 0;
    monthRecs.forEach(r => {
      if (r.status === 'P' || r.status === 'L') P++;
      if (r.status === 'A') A++;
      if (r.status === 'L') L++;
    });
    const T = monthRecs.length;
    summary = { student_id: sid, month, present_days: P, absent_days: A, late_days: L,
                total_days: T, percentage: T ? Math.round((P / T) * 1000) / 10 : 0 };
  }

  return { ok: true, data: {
    today: todayRec ? { status: todayRec.status, marked_at: todayRec.marked_at, reason: todayRec.reason } : null,
    month,
    summary,
    days: monthRecs.map(r => ({ date: r.date, status: r.status }))
  }};
}

function attAdminDaily_(p, user) {
  if (user.role !== ROLES.ADMIN) return { ok: false, error: 'FORBIDDEN' };
  const date = String(p.date || todayIso_());
  const att  = readAll_(SHEETS.ATTENDANCE);
  const stu  = readAll_(SHEETS.STUDENTS);
  const todays = rowsToObjects_(att.head, att.rows).filter(r => String(r.date) === date);
  const total = rowsToObjects_(stu.head, stu.rows).filter(s => s.status !== 'inactive').length;

  let P = 0, A = 0, L = 0;
  const byClass = {};
  todays.forEach(r => {
    const k = r.class + '-' + r.section;
    byClass[k] = byClass[k] || { class: r.class, section: r.section, P: 0, A: 0, L: 0, T: 0 };
    byClass[k].T++;
    if (r.status === 'P' || r.status === 'L') { P++; byClass[k].P++; }
    if (r.status === 'A') { A++; byClass[k].A++; }
    if (r.status === 'L') { L++; byClass[k].L++; }
  });
  const absentees = todays.filter(r => r.status === 'A').map(r => r.student_id);

  return { ok: true, data: {
    date, totalStudents: total, present: P, absent: A, late: L,
    percentage: total ? Math.round((P / total) * 1000) / 10 : 0,
    byClass: Object.values(byClass),
    absentees
  }};
}

function attNotMarked_(p, user) {
  if (user.role !== ROLES.ADMIN) return { ok: false, error: 'FORBIDDEN' };
  const date = String(p.date || todayIso_());
  const ct  = readAll_(SHEETS.CLASS_TEACHER);
  const att = readAll_(SHEETS.ATTENDANCE);
  const marked = new Set();
  rowsToObjects_(att.head, att.rows)
    .filter(r => String(r.date) === date)
    .forEach(r => marked.add(r.class + '-' + r.section));
  const pending = rowsToObjects_(ct.head, ct.rows)
    .filter(r => !marked.has(r.class + '-' + r.section));
  return { ok: true, data: { date, pending } };
}
