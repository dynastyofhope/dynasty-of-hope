/* ============================================================
   Dynasty of Hope Foundation — Admin dashboard
   Online volunteer tracker WITH APPROVAL:
   - registrations arrive as "Pending"
   - only the logged-in admin sees them
   - admin approves or rejects each record; status syncs to the
     central Google Sheet
   ============================================================ */

const DOH_Admin = {
  sessionKey: "doh_admin_session",
  records: [],

  /* ---- auth ---- */
  getPass() { return localStorage.getItem(DOH_CONFIG.adminPassKey) || DOH_CONFIG.defaultAdminPass; },
  login(pass) {
    if (pass === this.getPass()) { sessionStorage.setItem(this.sessionKey, "1"); return true; }
    return false;
  },
  logout() { sessionStorage.removeItem(this.sessionKey); location.reload(); },
  isAuthed() { return sessionStorage.getItem(this.sessionKey) === "1"; },
  changePass(oldP, newP) {
    if (oldP !== this.getPass()) return false;
    localStorage.setItem(DOH_CONFIG.adminPassKey, newP);
    return true;
  },

  esc(s) { const d = document.createElement("div"); d.textContent = String(s); return d.innerHTML; },

  /* ---- load tracker ---- */
  load() {
    const db = DOH_GetDb();
    const status = document.getElementById("online-status");
    if (!db.url) {
      ["table-volunteer", "table-register", "table-pledge"].forEach(id => {
        document.getElementById(id).innerHTML = '<div class="empty-state">Tracker not configured.</div>';
      });
      return;
    }
    if (status) status.textContent = "Syncing…";
    fetch(db.url + "?key=" + encodeURIComponent(db.key))
      .then(r => r.json())
      .then(res => {
        if (!res.ok) throw new Error(res.error || "bad response");
        this.records = (res.records || []).map(r => {
          if (r.data && !r.data.name) r.data.name = r.data.fullname;
          return r;
        });
        const pending = this.records.filter(r => r.status === "Pending").length;
        if (status) status.textContent =
          this.records.length + " record(s) · " + pending + " awaiting approval · synced " + new Date().toLocaleTimeString();
        this.render();
      })
      .catch(err => {
        if (status) status.textContent = "Sync error: " + err.message;
        ["table-volunteer", "table-register", "table-pledge"].forEach(id => {
          document.getElementById(id).innerHTML = '<div class="empty-state">Could not reach the online tracker. Check your connection and press Refresh.</div>';
        });
      });
  },

  /* ---- approve / reject ---- */
  setStatus(id, status) {
    const db = DOH_GetDb();
    const rec = this.records.find(r => r.id === id);
    if (!rec) return;
    rec.status = status;               // optimistic update
    this.render();
    fetch(db.url, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ key: db.key, action: "setStatus", id: id, status: status })
    }).catch(() => {});
  },

  render() {
    const all = this.records;
    const vols = all.filter(r => r.type === "volunteer");
    const regs = all.filter(r => r.type === "register");
    const pledges = all.filter(r => r.type === "pledge");
    const total = pledges.reduce((s, r) => s + (parseFloat(r.data.amount) || 0), 0);
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set("stat-vol", vols.length);
    set("stat-reg", regs.length);
    set("stat-pledge", pledges.length);
    set("stat-total", "₦" + total.toLocaleString());

    this.renderTable("table-volunteer", vols, [
      ["name", "Name"], ["email", "Email"], ["phone", "Phone"],
      ["location", "Location"], ["interest", "Interest"], ["message", "Message"]
    ]);
    this.renderTable("table-register", regs, [
      ["name", "Name"], ["event", "Event"], ["category", "Category"],
      ["team", "Team / Org"], ["phone", "Phone"], ["email", "Email"], ["notes", "Notes"]
    ]);
    this.renderTable("table-pledge", pledges, [
      ["name", "Name"], ["email", "Email"], ["amount", "Amount (₦)"],
      ["method", "Method"], ["message", "Message"]
    ]);
  },

  statusBadge(s) {
    const cls = s === "Approved" ? "pledge" : s === "Rejected" ? "register" : "volunteer";
    return `<span class="badge ${cls}">${this.esc(s || "Pending")}</span>`;
  },

  renderTable(id, rows, cols) {
    const wrap = document.getElementById(id);
    if (!rows.length) {
      wrap.innerHTML = '<div class="empty-state">No records yet. Every new submission on the website appears here automatically, waiting for your approval.</div>';
      return;
    }
    let html = '<table class="admin-table"><thead><tr><th>ID</th><th>Date</th>';
    cols.forEach(c => (html += `<th>${c[1]}</th>`));
    html += "<th>Status</th><th>Your Decision</th></tr></thead><tbody>";
    rows.forEach(r => {
      html += `<tr><td><code>${this.esc(r.id)}</code></td><td>${this.esc(new Date(r.date).toLocaleString())}</td>`;
      cols.forEach(c => (html += `<td>${this.esc(r.data[c[0]] || "") || "—"}</td>`));
      html += `<td>${this.statusBadge(r.status)}</td>`;
      html += `<td style="white-space:nowrap">` +
        (r.status === "Approved"
          ? `<button class="btn btn-outline btn-sm" onclick="DOH_Admin.setStatus('${r.id}','Pending')">Undo</button>`
          : `<button class="btn btn-gold btn-sm" onclick="DOH_Admin.setStatus('${r.id}','Approved')">✓ Approve</button>
             <button class="btn btn-outline btn-sm" style="border-color:#c0392b;color:#c0392b" onclick="DOH_Admin.setStatus('${r.id}','Rejected')">Reject</button>`) +
        `</td></tr>`;
    });
    html += "</tbody></table>";
    wrap.innerHTML = html;
  },

  exportCSV(type) {
    const rows = type === "all" ? this.records : this.records.filter(r => r.type === type);
    if (!rows.length) { alert("No records to export."); return; }
    const keys = new Set(["id", "type", "date", "status"]);
    rows.forEach(r => Object.keys(r.data).forEach(k => keys.add(k)));
    const cols = [...keys];
    const q = v => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
    let csv = cols.map(q).join(",") + "\n";
    rows.forEach(r => {
      csv += cols.map(c => q(c === "id" ? r.id : c === "type" ? r.type : c === "date" ? r.date : c === "status" ? r.status : r.data[c])).join(",") + "\n";
    });
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `doh-${type}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
};

document.addEventListener("DOMContentLoaded", () => {
  const loginBox = document.getElementById("admin-login");
  const dash = document.getElementById("admin-dash");
  if (!loginBox || !dash) return;

  if (DOH_Admin.isAuthed()) {
    loginBox.style.display = "none";
    dash.style.display = "block";
    DOH_Admin.load();
  }

  document.getElementById("login-form").addEventListener("submit", e => {
    e.preventDefault();
    const pass = document.getElementById("login-pass").value;
    if (DOH_Admin.login(pass)) {
      loginBox.style.display = "none";
      dash.style.display = "block";
      DOH_Admin.load();
    } else {
      document.getElementById("login-error").textContent = "Incorrect password. Try again.";
    }
  });

  /* tabs */
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach(p => (p.style.display = "none"));
      btn.classList.add("active");
      document.getElementById("panel-" + btn.dataset.tab).style.display = "block";
    });
  });

  /* change password */
  document.getElementById("pass-form").addEventListener("submit", e => {
    e.preventDefault();
    const o = document.getElementById("pass-old").value;
    const n = document.getElementById("pass-new").value;
    const msg = document.getElementById("pass-msg");
    if (n.length < 6) { msg.textContent = "New password must be at least 6 characters."; return; }
    if (DOH_Admin.changePass(o, n)) {
      msg.textContent = "Password updated successfully ✓";
      document.getElementById("pass-form").reset();
    } else {
      msg.textContent = "Current password is incorrect.";
    }
  });
});
