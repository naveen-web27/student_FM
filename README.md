# SkoolMark — School Facility Management (Phase 1)

A lightweight, secure school management web app.
**Front-end:** static HTML/CSS/JS (host on GitHub Pages).
**Back-end / DB:** Google Apps Script Web App + Google Sheets.

Hero feature: **Real-time attendance** — teachers mark in 30 seconds,
parents instantly see "✅ Reached school at 8:42 AM".

---

## Folder layout

```
school_facility_management/
  index.html              → login
  dashboard.html          → role-based redirect
  teacher/
    classes.html, attendance.html
  parent/
    home.html, month.html
  admin/
    dashboard.html, students.html, staff.html
  shared/
    marks.html, fees.html, idcard.html
  assets/
    css/style.css
    js/  config.js  api.js  auth.js  ui.js  attendance.js
  apps-script/
    Code.gs  config.gs  auth.gs  attendance.gs
    students.gs  audit.gs  notify.gs
```

---

## One-time setup (≈ 30 minutes)

### 1. Create the Google Sheet
1. Go to <https://sheets.google.com> → blank sheet → name it e.g. `SkoolMark - Demo School`.
2. Extensions → Apps Script. Delete the default `Code.gs`.
3. Create files matching every file in `apps-script/` (same names, paste contents).
4. Save.

### 2. Set the HMAC secret
In the Apps Script editor:
**Project Settings (⚙️) → Script Properties → Add property**
- Name: `HMAC_SECRET`
- Value: any long random string (e.g. paste 40+ random chars)

### 3. Bootstrap the sheets
- In the editor, select the function `bootstrapSheets` → Run → grant permissions.
  This creates all the tabs (`Users`, `Students`, `Attendance`, …) with headers.
- Select `seedAdmin` → Run.
  This creates the first admin: **username `admin` / password `admin@123`** — change it later by editing the Users sheet (use `hashPassword_(password, salt)` in the editor and overwrite).

### 4. Deploy as Web App
1. Deploy → New deployment → Type: **Web app**.
2. Description: `SkoolMark API v1`.
3. Execute as: **Me**.
4. Who has access: **Anyone** (the security comes from our own token, not Google's auth).
5. Copy the **Web app URL**.

### 5. Wire the front-end
- Open `assets/js/config.js`.
- Replace `API_URL` with the URL from step 4.
- Set `SCHOOL_NAME`.

### 6. Host on GitHub Pages
1. Commit and push the `school_facility_management/` folder.
2. GitHub repo → Settings → Pages → Source: `main` branch, `/ (root)`.
3. Open: `https://<your-user>.github.io/<repo>/school_facility_management/index.html`.

### 7. Add data — all from the dashboard
Log in as **admin** (`admin` / `admin@123`) and use the admin pages.
No more script editing or sheet hacking.

1. **Add staff / teachers** → Admin → *Staff*
   - Fill name, role (`teacher`), subject, etc.
   - In the same form, set a **login username + initial password** to create the
     teacher's login automatically.
   - Set **class + section** to register them as that class's teacher.

2. **Add students** → Admin → *Students*
   - Fill name, class, section, roll no.
   - In the same form, set a **parent login username + initial password** to
     create the parent account and link it to the student automatically.
   - (If a parent already has a login, just enter the existing `parent_user_id`.)

That's it — teachers and parents can now log in from `index.html`.

### 8. (Recommended) Nightly summary trigger
In Apps Script: **Triggers (⏰) → Add Trigger**
- Function: `rebuildAttendanceSummary`
- Event: Time-driven → Day timer → 1–2 AM.

This keeps parent home page snappy on big schools.

---

## Logins to try after setup
| Role    | Username        | Password                   |
|---------|-----------------|----------------------------|
| Admin   | admin           | admin@123                  |
| Teacher | (create in Admin → Staff)    | (the one you set) |
| Parent  | (create in Admin → Students) | (the one you set) |

---

## Security highlights
- SHA-256 password hashing with per-user salt; never plain text.
- HMAC-signed tokens; secret stored in Apps Script `PropertiesService`.
- 8-hour token expiry, 5-fail lockout (15 min), rate limit 60 req/min.
- Role checks on every request (teacher → only assigned class, parent → only own child).
- Server-side timestamps; teachers can't backdate attendance.
- 30-min teacher edit window; otherwise admin only — both audit-logged.
- `AuditLog` sheet (protected) records every login/edit/export.
- HTTPS-only (GitHub Pages + Apps Script).
- One sheet + one Apps Script deployment per school = data isolation.

## Performance highlights
- `AttendanceSummary` precomputed table → parent dashboard loads in <1s.
- Optimistic UI on submit; rollback on failure.
- Offline mode: teacher submissions queued in `localStorage` and synced when back online.
- Lazy-loaded photos, mobile-first CSS.

## What to demo to a principal (2 minutes)
1. Open teacher screen on a tablet → mark 30 students → Submit.
2. Switch to parent screen on a phone → green hero card already shows
   "✅ Reached school at 8:42 AM".
3. Open admin dashboard → "Class 5-A not yet marked" alert.
4. Show ID card with QR.
5. Price: ₹1,500 / ₹3,000 / ₹7,500 a year. First 3 months free pilot.

---

## Phase 2 (after first 2-3 schools sign up)
Gate QR scanner, parking, library, certificate generator, WhatsApp/SMS automation,
visitor management. All add-ons; no rewrite of Phase 1 needed — same Apps Script,
new actions, new pages.
