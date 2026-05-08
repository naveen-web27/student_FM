/**
 * audit.gs — audit log + sheet bootstrap helpers.
 */

function audit_(user, action, payload) {
  try {
    const sh = getSheet_(SHEETS.AUDIT);
    sh.appendRow([
      nowIso_(),
      user && user.user_id || 'anon',
      user && user.role    || '?',
      action,
      JSON.stringify(payload || {}).slice(0, 500)
    ]);
  } catch (_) {}
}

/**
 * Run ONCE from the Apps Script editor to create all tabs with headers.
 * Safe to re-run: it skips tabs that already exist.
 */
function bootstrapSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const defs = {
    [SHEETS.USERS]:        ['user_id','username','password_hash','salt','role','linked_id','name','status','fail_count','lock_until'],
    [SHEETS.STUDENTS]:     ['student_id','name','class','section','roll_no','dob','parent_user_id','parent_name','parent_phone','photo_url','address','status'],
    [SHEETS.STAFF]:        ['staff_id','name','role','subject','phone','email','photo_url','status'],
    [SHEETS.CLASS_TEACHER]:['staff_id','class','section'],
    [SHEETS.ATTENDANCE]:   ['attendance_id','date','class','section','student_id','status','reason','marked_by','marked_at','edited_by','edited_at'],
    [SHEETS.ATT_SUMMARY]:  ['student_id','month','present_days','absent_days','late_days','total_days','percentage'],
    [SHEETS.MARKS]:        ['exam_id','student_id','subject','marks','max_marks','grade','term','updated_at'],
    [SHEETS.FEES]:         ['fee_id','student_id','term','amount_due','amount_paid','status','paid_on','receipt_no'],
    [SHEETS.AUDIT]:        ['timestamp','user_id','role','action','payload'],
    [SHEETS.NOTIFY]:       ['notify_id','student_id','event','sent_at','channel','status']
  };
  Object.keys(defs).forEach(name => {
    let sh = ss.getSheetByName(name);
    if (!sh) {
      sh = ss.insertSheet(name);
      sh.getRange(1, 1, 1, defs[name].length).setValues([defs[name]]).setFontWeight('bold');
      sh.setFrozenRows(1);
    }
  });
  // Protect AuditLog from accidental edits
  const audit = ss.getSheetByName(SHEETS.AUDIT);
  if (audit) {
    const prot = audit.protect().setDescription('Audit log: do not edit');
    prot.setWarningOnly(true);
  }
}

/**
 * Nightly trigger: rebuilds AttendanceSummary so parent view loads fast.
 * Add a time-driven trigger: bootstrapSummaryTrigger -> daily at 1 AM.
 */
function rebuildAttendanceSummary() {
  const sh = getSheet_(SHEETS.ATTENDANCE);
  const out = getSheet_(SHEETS.ATT_SUMMARY);
  const data = sh.getDataRange().getValues();
  if (data.length < 2) return;
  const head = data[0];
  const ix = (k) => head.indexOf(k);
  const map = {}; // key = student_id|YYYY-MM
  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    const date = String(r[ix('date')]);
    const month = date.slice(0, 7);
    const sid = r[ix('student_id')];
    const status = r[ix('status')];
    const k = sid + '|' + month;
    if (!map[k]) map[k] = { student_id: sid, month, P: 0, A: 0, L: 0, T: 0 };
    map[k].T++;
    if (status === 'P' || status === 'L') map[k].P++;
    if (status === 'A') map[k].A++;
    if (status === 'L') map[k].L++;
  }
  const rows = Object.values(map).map(o => [
    o.student_id, o.month, o.P, o.A, o.L, o.T,
    o.T === 0 ? 0 : Math.round((o.P / o.T) * 1000) / 10
  ]);
  out.getRange(2, 1, Math.max(out.getLastRow() - 1, 1), 7).clearContent();
  if (rows.length) out.getRange(2, 1, rows.length, 7).setValues(rows);
}
