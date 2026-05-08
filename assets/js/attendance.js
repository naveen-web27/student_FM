// attendance.js — teacher attendance grid: optimistic UI + offline queue.
(function () {
  const QKEY = "skool_offline_queue";

  function loadQueue()      { try { return JSON.parse(localStorage.getItem(QKEY) || "[]"); } catch { return []; } }
  function saveQueue(q)     { localStorage.setItem(QKEY, JSON.stringify(q)); }
  function enqueue(payload) { const q = loadQueue(); q.push(payload); saveQueue(q); }

  async function flushQueue() {
    const q = loadQueue(); if (!q.length) return;
    const remaining = [];
    for (const p of q) {
      try { await SkoolAPI.api("attendance.submit", p); }
      catch (e) {
        if (e.message === "ALREADY_SUBMITTED") continue; // drop
        remaining.push(p);
      }
    }
    saveQueue(remaining);
    if (remaining.length === 0 && q.length) SkoolUI.toast("Synced " + q.length + " offline submission(s)", "ok");
  }

  window.addEventListener("online", flushQueue);
  document.addEventListener("DOMContentLoaded", flushQueue);

  window.SkoolAttendance = { enqueue, flushQueue };
})();
