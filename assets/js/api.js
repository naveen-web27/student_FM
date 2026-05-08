// api.js — single fetch wrapper. All calls go through api(action, payload).
(function () {
  const KEY_TOKEN = "skool_token";
  const KEY_USER  = "skool_user";

  function getToken() { return localStorage.getItem(KEY_TOKEN) || null; }
  function setSession(token, user) {
    localStorage.setItem(KEY_TOKEN, token);
    localStorage.setItem(KEY_USER, JSON.stringify(user));
  }
  function getUser() {
    try { return JSON.parse(localStorage.getItem(KEY_USER) || "null"); }
    catch { return null; }
  }
  function clearSession() {
    localStorage.removeItem(KEY_TOKEN);
    localStorage.removeItem(KEY_USER);
  }

  async function api(action, payload) {
    const url = window.SKOOL_CONFIG.API_URL;
    if (!url || url.includes("REPLACE_WITH")) {
      throw new Error("API_URL not configured in assets/js/config.js");
    }
    const body = JSON.stringify({ token: getToken(), action, payload: payload || {} });
    let res;
    try {
      // text/plain avoids Apps Script CORS preflight.
      res = await fetch(url, { method: "POST", body, headers: { "Content-Type": "text/plain;charset=utf-8" } });
    } catch (e) {
      throw new Error("NETWORK");
    }
    const json = await res.json();
    if (json.ok === false) {
      if (json.error === "UNAUTHORIZED") {
        clearSession();
        if (!location.pathname.endsWith("/index.html") && !location.pathname.endsWith("/")) {
          location.href = pathToRoot() + "index.html";
        }
      }
      throw new Error(json.error || "ERROR");
    }
    return json.data;
  }

  function pathToRoot() {
    // depth from /school_facility_management/<sub>/file.html
    const p = location.pathname.replace(/\/[^/]*$/, "/");
    if (p.endsWith("/teacher/") || p.endsWith("/parent/") || p.endsWith("/admin/") || p.endsWith("/shared/")) return "../";
    return "";
  }

  window.SkoolAPI = { api, getToken, getUser, setSession, clearSession, pathToRoot };
})();
