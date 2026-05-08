// auth.js — guards a page; redirects to login if no session or wrong role.
(function () {
  function require(allowedRoles) {
    const u = SkoolAPI.getUser();
    const t = SkoolAPI.getToken();
    if (!u || !t) { location.href = SkoolAPI.pathToRoot() + "index.html"; return null; }
    if (allowedRoles && !allowedRoles.includes(u.role)) {
      location.href = SkoolAPI.pathToRoot() + "dashboard.html";
      return null;
    }
    return u;
  }
  async function logout() {
    try { await SkoolAPI.api("auth.logout", {}); } catch (_) {}
    SkoolAPI.clearSession();
    location.href = SkoolAPI.pathToRoot() + "index.html";
  }
  window.SkoolAuth = { require, logout };
})();
