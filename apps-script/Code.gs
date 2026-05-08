/**
 * Code.gs — main router. Single endpoint: doPost.
 * Request format:  { token?, action, payload }
 * Response format: { ok: bool, data?, error? }
 */

function doPost(e) {
  let body = {};
  try { body = JSON.parse(e.postData.contents || '{}'); }
  catch (_) { return json_({ ok: false, error: 'BAD_JSON' }); }

  const action  = String(body.action || '');
  const payload = body.payload || {};
  const token   = body.token || null;

  try {
    // Public actions (no token needed)
    if (action === 'auth.login')   return json_(authLogin_(payload));
    if (action === 'auth.ping')    return json_({ ok: true, data: { time: nowIso_() } });

    // Everything else needs a valid token
    const session = verifyToken_(token);
    if (!session.ok) return json_({ ok: false, error: 'UNAUTHORIZED' });

    rateLimit_(session.user.user_id);

    const handler = ROUTES[action];
    if (!handler) return json_({ ok: false, error: 'UNKNOWN_ACTION' });

    const result = handler(payload, session.user);
    audit_(session.user, action, payload);
    return json_(result);
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

function doGet(e) {
  // Used only as a health check from the browser.
  return json_({ ok: true, data: { service: 'school-fms', time: nowIso_() } });
}

const ROUTES = {
  // Auth
  'auth.logout':                authLogout_,
  'auth.me':                    authMe_,

  // Students / Staff
  'students.list':              studentsList_,
  'students.upsert':            studentsUpsert_,
  'students.delete':            studentsDelete_,
  'students.byParent':          studentsByParent_,
  'staff.list':                 staffList_,
  'staff.upsert':               staffUpsert_,
  'staff.delete':               staffDelete_,

  // Attendance
  'attendance.getClassRoster':  attGetRoster_,
  'attendance.submit':          attSubmit_,
  'attendance.edit':            attEdit_,
  'attendance.parentView':      attParentView_,
  'attendance.adminDaily':      attAdminDaily_,
  'attendance.notMarked':       attNotMarked_,

  // Marks / Fees (light v1)
  'marks.byStudent':            marksByStudent_,
  'marks.upsert':                marksUpsert_,
  'fees.byStudent':             feesByStudent_,
  'fees.upsert':                feesUpsert_,

  // Admin
  'admin.dashboardSummary':     adminDashboardSummary_
};

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
