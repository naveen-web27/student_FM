// ui.js — small UI helpers: toasts, topbar, escape.
(function () {
  function el(tag, props, children) {
    const e = document.createElement(tag);
    if (props) for (const k in props) {
      if (k === "class") e.className = props[k];
      else if (k === "html") e.innerHTML = props[k];
      else if (k === "on") for (const ev in props.on) e.addEventListener(ev, props.on[ev]);
      else e.setAttribute(k, props[k]);
    }
    (children || []).forEach(c => e.appendChild(typeof c === "string" ? document.createTextNode(c) : c));
    return e;
  }
  function toast(msg, kind) {
    let wrap = document.querySelector(".toast-wrap");
    if (!wrap) { wrap = el("div", { class: "toast-wrap" }); document.body.appendChild(wrap); }
    const t = el("div", { class: "toast " + (kind || "") }, [msg]);
    wrap.appendChild(t);
    setTimeout(() => t.remove(), 2800);
  }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function fmtTime(iso) {
    if (!iso) return "";
    try {
      const d = new Date(iso);
      return d.toLocaleString([], { hour: "numeric", minute: "2-digit", hour12: true,
        day: "2-digit", month: "short" });
    } catch { return iso; }
  }
  function topbar(title, opts) {
    opts = opts || {};
    const u = SkoolAPI.getUser();
    const root = document.createElement("div");
    root.className = "topbar";
    root.innerHTML = `
      <div class="brand">📘 ${esc(window.SKOOL_CONFIG.SCHOOL_NAME)}</div>
      <div class="spacer"></div>
      <div class="who">${u ? esc(u.name || u.username) + " · " + esc(u.role) : ""}</div>
      ${u ? '<button class="secondary" id="__logout">Logout</button>' : ""}
    `;
    document.body.prepend(root);
    const btn = root.querySelector("#__logout");
    if (btn) btn.onclick = () => SkoolAuth.logout();
    if (title) document.title = title + " · SkoolMark";
  }
  window.SkoolUI = { el, toast, esc, fmtTime, topbar };
})();
