/**
 * notify.gs — append to NotifyLog so parent dashboards (which poll)
 * pick up the "reached school" event. SMS/WhatsApp providers can be
 * plugged in here later without changing any other file.
 */

function notifyParentsOnArrival_(rows, head) {
  const sh = getSheet_(SHEETS.NOTIFY);
  const ix = (k) => head.indexOf(k);
  const out = [];
  for (const r of rows) {
    const status = r[ix('status')];
    if (status !== 'P' && status !== 'L') continue;
    out.push([
      uid_('N'),
      r[ix('student_id')],
      'arrival',
      r[ix('marked_at')],
      'in-app',
      'queued'
    ]);
  }
  if (out.length) sh.getRange(sh.getLastRow() + 1, 1, out.length, 6).setValues(out);
}

function adminDashboardSummary_(p, user) {
  if (user.role !== ROLES.ADMIN) return { ok: false, error: 'FORBIDDEN' };
  return attAdminDaily_({ date: todayIso_() }, user);
}
