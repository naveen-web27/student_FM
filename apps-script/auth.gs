/**
 * auth.gs — login, hashing, signed token, rate limit, lockout.
 */

function sha256_(input) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(input), Utilities.Charset.UTF_8);
  return bytes.map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
}
function hmac_(input) {
  const bytes = Utilities.computeHmacSha256Signature(String(input), getSecret_());
  return bytes.map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
}
function hashPassword_(password, salt) { return sha256_(salt + ':' + password); }

function makeToken_(user) {
  const exp = Date.now() + TOKEN_TTL_HOURS * 3600 * 1000;
  const head = [user.user_id, user.role, exp].join('|');
  const sig  = hmac_(head);
  return Utilities.base64EncodeWebSafe(head + '|' + sig);
}

function verifyToken_(token) {
  if (!token) return { ok: false };
  try {
    const raw = Utilities.newBlob(Utilities.base64DecodeWebSafe(token)).getDataAsString();
    const parts = raw.split('|');
    if (parts.length !== 4) return { ok: false };
    const [user_id, role, exp, sig] = parts;
    if (hmac_([user_id, role, exp].join('|')) !== sig) return { ok: false };
    if (Date.now() > Number(exp)) return { ok: false };
    const user = findUser_(user_id);
    if (!user || user.role !== role || user.status !== 'active') return { ok: false };
    return { ok: true, user };
  } catch (_) { return { ok: false }; }
}

function findUser_(userIdOrUsername) {
  const sh = getSheet_(SHEETS.USERS);
  const data = sh.getDataRange().getValues();
  const head = data[0];
  const idx = (k) => head.indexOf(k);
  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    if (r[idx('user_id')] == userIdOrUsername || r[idx('username')] == userIdOrUsername) {
      return {
        row: i + 1,
        user_id:  r[idx('user_id')],
        username: r[idx('username')],
        password_hash: r[idx('password_hash')],
        salt:     r[idx('salt')],
        role:     r[idx('role')],
        linked_id: r[idx('linked_id')],
        name:     r[idx('name')],
        status:   r[idx('status')] || 'active',
        fail_count: Number(r[idx('fail_count')] || 0),
        lock_until: r[idx('lock_until')] || ''
      };
    }
  }
  return null;
}

function setUserField_(rowNumber, field, value) {
  const sh = getSheet_(SHEETS.USERS);
  const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const col = head.indexOf(field) + 1;
  if (col > 0) sh.getRange(rowNumber, col).setValue(value);
}

/* -------------------- handlers -------------------- */

function authLogin_(p) {
  const username = String(p.username || '').trim();
  const password = String(p.password || '');
  if (!username || !password) return { ok: false, error: 'MISSING_FIELDS' };

  const user = findUser_(username);
  if (!user) return { ok: false, error: 'INVALID_CREDENTIALS' };

  // lockout check
  if (user.lock_until && new Date(user.lock_until).getTime() > Date.now()) {
    return { ok: false, error: 'LOCKED' };
  }

  const calc = hashPassword_(password, user.salt);
  if (calc !== user.password_hash) {
    const fail = user.fail_count + 1;
    setUserField_(user.row, 'fail_count', fail);
    if (fail >= 5) {
      const until = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      setUserField_(user.row, 'lock_until', until);
    }
    audit_({ user_id: username, role: '?' }, 'auth.loginFail', { username });
    return { ok: false, error: 'INVALID_CREDENTIALS' };
  }

  setUserField_(user.row, 'fail_count', 0);
  setUserField_(user.row, 'lock_until', '');

  const token = makeToken_(user);
  audit_(user, 'auth.loginOk', { username });
  return { ok: true, data: { token, user: publicUser_(user) } };
}

function authLogout_(p, user) {
  audit_(user, 'auth.logout', {});
  return { ok: true, data: { bye: true } };
}

function authMe_(p, user) {
  return { ok: true, data: { user: publicUser_(user) } };
}

function publicUser_(u) {
  return { user_id: u.user_id, username: u.username, role: u.role, name: u.name, linked_id: u.linked_id };
}

/* -------------------- rate limit -------------------- */

function rateLimit_(userId) {
  const cache = CacheService.getScriptCache();
  const key = 'rl:' + userId + ':' + Math.floor(Date.now() / 60000);
  const n = Number(cache.get(key) || 0) + 1;
  cache.put(key, String(n), 70);
  if (n > RATE_LIMIT_PER_MIN) throw new Error('RATE_LIMITED');
}

/* -------------------- helper to seed admin (run once) -------------------- */

function seedAdmin() {
  const sh = getSheet_(SHEETS.USERS);
  const salt = Utilities.getUuid();
  sh.appendRow([
    'U001', 'admin', hashPassword_('admin@123', salt), salt,
    'admin', '', 'School Admin', 'active', 0, ''
  ]);
}

/**
 * Create a new user row in the Users sheet.
 * Used by admin flows (create teacher / parent login from the dashboard).
 * Returns { ok: true } on success, { ok:false, error } on failure.
 */
function createUser_(u) {
  if (!u || !u.username || !u.password || !u.role || !u.user_id) {
    return { ok: false, error: 'MISSING_USER_FIELDS' };
  }
  if (findUser_(u.username)) return { ok: false, error: 'USERNAME_TAKEN' };
  const sh = getSheet_(SHEETS.USERS);
  const salt = Utilities.getUuid();
  sh.appendRow([
    u.user_id,
    u.username,
    hashPassword_(u.password, salt),
    salt,
    u.role,
    u.linked_id || '',
    u.name || u.username,
    'active',
    0,
    ''
  ]);
  return { ok: true };
}
