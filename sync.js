"use strict";
/* Family sync over the Firestore REST API (no SDK, works with the app's offline cache).
   Data lives at families/{code}/items/{plan | log-YYYY-MM-DD | wk-YYYY-MM-DD}. The family code is the secret.
   Each item stores {json, ts}; the newest ts wins. */
const Sync = {
  code: null,
  since: 0,
  last: {},
  busy: false,
  again: false,
  seen: false,
  status: "off",
  lastOk: 0,
  err: "",
  timer: null,

  get ready() {
    return typeof FIREBASE_CONFIG !== "undefined" && !!(FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.projectId);
  },
  base() {
    const h = FIREBASE_CONFIG.host || "https://firestore.googleapis.com";
    return `${h}/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents`;
  },
  key() { return "?key=" + encodeURIComponent(FIREBASE_CONFIG.apiKey); },
  normalize(c) { return String(c || "").toLowerCase().replace(/[^a-z0-9]/g, ""); },
  pretty(c) { return (c || "").match(/.{1,4}/g)?.join("-") || ""; },
  newCode() {
    const abc = "abcdefghjkmnpqrstuvwxyz23456789";
    const b = new Uint32Array(20);
    crypto.getRandomValues(b);
    return [...b].map((n) => abc[n % abc.length]).join("");
  },
  hash(s) {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return h + ":" + s.length;
  },
  strip(o) { const c = { ...o }; delete c._ts; return JSON.stringify(c); },
  planJson() {
    const { days, videos, links, notes, rewards, profile, note } = S;
    return JSON.stringify({ days, videos, links, notes, rewards, profile, note });
  },

  load() {
    try {
      const o = JSON.parse(localStorage.getItem("tristan-sync"));
      if (o && o.code) { this.code = o.code; this.since = o.since || 0; this.last = o.last || {}; }
    } catch (e) {}
  },
  save() {
    try { localStorage.setItem("tristan-sync", JSON.stringify({ code: this.code, since: this.since, last: this.last })); } catch (e) {}
  },

  explain(e) {
    const m = /\b(\d{3})\b/.exec((e && e.message) || "");
    const code = m ? Number(m[1]) : 0;
    if (code === 403) return "The sync service refused access. The Firestore rules may not be published yet.";
    if (code === 400) return "The sync settings look wrong. Check the Firebase key and project.";
    if (code === 404) return "The sync database was not found. Check that Firestore is created in the Firebase project.";
    if (code === 429) return "Sync is busy right now. It will retry in a minute.";
    if (code >= 500) return "The sync service had a problem. It will retry.";
    return navigator.onLine === false ? "No connection. Changes will upload when you are back online." : "Could not reach the sync service. Check your connection.";
  },
  statusText() {
    if (!this.ready) return "Sync is not set up in this build.";
    if (!this.code) return "Not syncing. This device keeps its own copy.";
    const t = { ok: "Synced", syncing: "Syncing…", offline: "Offline. Changes will upload when you reconnect.", error: this.err ? this.err + " Will retry." : "Could not reach the sync service. Will retry." }[this.status] || "Waiting";
    return this.status === "ok" && this.lastOk ? `Synced at ${new Date(this.lastOk).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : t;
  },
  setStatus(s) {
    this.status = s;
    const el = document.querySelector("[data-sync-status]");
    if (el) el.textContent = this.statusText();
    document.querySelectorAll(".syncdot").forEach((d) => { d.className = "syncdot " + s; d.title = this.statusText(); });
  },

  async put(id, json, ts) {
    const r = await fetch(`${this.base()}/families/${this.code}/items/${id}${this.key()}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields: { json: { stringValue: json }, ts: { integerValue: String(ts) } } }),
    });
    if (!r.ok) throw new Error("put " + r.status);
  },

  async pull() {
    const body = { structuredQuery: { from: [{ collectionId: "items" }], where: { fieldFilter: { field: { fieldPath: "ts" }, op: "GREATER_THAN", value: { integerValue: String(this.since) } } }, orderBy: [{ field: { fieldPath: "ts" }, direction: "ASCENDING" }] } };
    const r = await fetch(`${this.base()}/families/${this.code}:runQuery${this.key()}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error("pull " + r.status);
    const rows = await r.json();
    let changed = false;
    for (const row of rows) {
      const d = row.document;
      if (!d) continue;
      this.seen = true;
      const id = d.name.split("/").pop();
      const json = d.fields.json.stringValue;
      const ts = Number(d.fields.ts.integerValue);
      this.since = Math.max(this.since, ts);
      if (this.apply(id, json, ts)) changed = true;
    }
    this.save();
    return changed;
  },

  apply(id, json, ts) {
    let o;
    try { o = JSON.parse(json); } catch (e) { return false; }
    if (id === "plan") {
      this.last.plan = this.hash(json);
      if (ts <= (S.planTs || 0)) return false;
      ["days", "videos", "links", "notes", "rewards", "profile", "note"].forEach((k) => { if (o[k] !== undefined) S[k] = o[k]; });
      S.planTs = ts;
      return true;
    }
    const m = id.match(/^(log|wk)-(.+)$/);
    if (!m) return false;
    const bag = m[1] === "log" ? S.logs : S.weekly;
    this.last[id] = this.hash(this.strip(o));
    if (ts <= ((bag[m[2]] && bag[m[2]]._ts) || 0)) return false;
    o._ts = ts;
    bag[m[2]] = o;
    return true;
  },

  async pushNow() {
    const ts = Date.now();
    const jobs = [];
    const plan = this.planJson();
    const ph = this.hash(plan);
    if (this.last.plan !== ph) jobs.push({ id: "plan", json: plan, h: ph, done: () => { S.planTs = ts; } });
    const scan = (bag, prefix) => {
      for (const k in bag) {
        const v = bag[k];
        const json = this.strip(v);
        if (json === '{"done":{}}' || json === "{}") continue;
        const h = this.hash(json);
        const id = prefix + k;
        if (this.last[id] !== h) jobs.push({ id, json, h, done: () => { v._ts = ts; } });
      }
    };
    // A device in Family view only reads progress. It never writes logs back.
    if (!(typeof Prefs !== "undefined" && Prefs.parent)) {
      scan(S.logs, "log-");
      scan(S.weekly, "wk-");
    }
    for (const j of jobs) {
      await this.put(j.id, j.json, ts);
      this.last[j.id] = j.h;
      j.done();
      this.since = Math.max(this.since, ts);
    }
    if (jobs.length) { this.save(); saveLocal(); }
  },

  async sync() {
    if (!this.code || !this.ready) return;
    if (this.busy) { this.again = true; return; }
    this.busy = true;
    this.setStatus("syncing");
    try {
      const changed = await this.pull();
      await this.pushNow();
      this.lastOk = Date.now();
      this.err = "";
      this.setStatus("ok");
      if (changed) { saveLocal(); if (!ui.form) render(); }
    } catch (e) {
      this.err = this.explain(e);
      this.setStatus(navigator.onLine ? "error" : "offline");
    } finally {
      this.busy = false;
      if (this.again) { this.again = false; this.schedule(); }
    }
  },
  schedule() {
    if (!this.code) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.sync(), 700);
  },

  async create() {
    const prev = { code: this.code, since: this.since, last: this.last };
    this.code = this.newCode(); this.since = 0; this.last = {}; this.seen = false; this.save();
    await this.sync();
    if (this.status === "error" || this.status === "offline") {
      const msg = this.err || this.explain();
      Object.assign(this, prev); this.save(); this.setStatus(this.code ? "ok" : "off");
      throw new Error(msg);
    }
    return this.code;
  },
  async join(input) {
    const code = this.normalize(input);
    if (code.length < 16) throw new Error("That code is too short.");
    const prev = { code: this.code, since: this.since, last: this.last };
    this.code = code; this.since = 0; this.last = {}; this.seen = false;
    try {
      const changed = await this.pull();
      if (!this.seen) throw new Error("No family found with that code.");
      this.save();
      if (changed) saveLocal();
      await this.sync();
    } catch (e) {
      Object.assign(this, prev);
      throw /^(put|pull) /.test(e.message) || e instanceof TypeError ? new Error(this.explain(e)) : e;
    }
  },
  off() { this.code = null; this.since = 0; this.last = {}; this.save(); this.setStatus("off"); },

  start() {
    this.load();
    if (!this.ready) return;
    if (this.code) this.sync();
    setInterval(() => { if (document.visibilityState === "visible") this.sync(); }, 15000);
    window.addEventListener("online", () => this.sync());
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") this.sync(); });
  },
};
