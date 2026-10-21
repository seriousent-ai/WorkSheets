"use strict";
const KEY = "tristan-plan-v1";
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const uid = (p) => p + Math.random().toString(36).slice(2, 9);
const pad = (n) => String(n).padStart(2, "0");
const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseKey = (k) => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const mondayOf = (d) => addDays(new Date(d.getFullYear(), d.getMonth(), d.getDate()), -((d.getDay() + 6) % 7));
const fmtShort = (d) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
const firstName = (n) => String(n || "").trim().split(/\s+/)[0] || "Tristan";
const todayIdx = () => (new Date().getDay() + 6) % 7;

/* ---------- storage ---------- */
function load() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
  if (!s || !Array.isArray(s.days)) s = JSON.parse(JSON.stringify(DEFAULT_DATA));
  s.logs ||= {}; s.weekly ||= {}; s.videos ||= []; s.links ||= []; s.notes ||= [];
  s.rewards ||= JSON.parse(JSON.stringify(DEFAULT_DATA.rewards));
  s.planTs ||= 0;
  s.profile.cycleStart ||= dateKey(mondayOf(new Date()));
  s.profile ||= {};
  s.profile.why ??= "I'm a point guard. I make my teammates better and I get better every single day.";
  s.profile.name ||= "Tristan";
  s.profile.team ??= "NY Rens";
  s.profile.league ??= "12U Jr. EYBL";
  return s;
}
let S = load();
function saveLocal() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast("Storage is full. Export a backup in Guide."); }
}
function persist() {
  saveLocal();
  Sync.schedule();
}

/* video files live in IndexedDB so big clips don't fill localStorage */
const idb = {
  db: null,
  open() {
    if (this.db) return Promise.resolve(this.db);
    return new Promise((res, rej) => {
      const r = indexedDB.open("tristan-files", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("files");
      r.onsuccess = () => res((this.db = r.result));
      r.onerror = () => rej(r.error);
    });
  },
  async tx(mode, fn) {
    const db = await this.open();
    return new Promise((res, rej) => {
      const t = db.transaction("files", mode);
      const req = fn(t.objectStore("files"));
      t.oncomplete = () => res(req && req.result);
      t.onerror = () => rej(t.error);
    });
  },
  put(id, blob) { return this.tx("readwrite", (s) => s.put(blob, id)); },
  get(id) { return this.tx("readonly", (s) => s.get(id)); },
  del(id) { return this.tx("readwrite", (s) => s.delete(id)); },
};

/* ---------- state ---------- */
const ui = { overview: false, card: false, chartRange: "4w", chartSpot: null, film: null, welcome: null, summary: null, tab: "today", day: todayIdx(), openVideo: null, weekOffset: 0, guided: null, openBlocks: {}, form: null };
const dateOf = (i) => dateKey(addDays(mondayOf(new Date()), i));
const logOf = (date) => (S.logs[date] ||= { done: {} });

/* ---------- motivation ---------- */
const MESSAGES = [
  "Great point guards are built in quiet gyms. This one is yours.",
  "Eyes up. See the floor. Make everyone around you better.",
  "Small reps, big results. Show up today.",
  "Control first, then speed.",
  "Beat the player you were yesterday.",
  "Every pass you perfect is a bucket for your team.",
  "Be the smartest player on the floor.",
  "Your weaker hand is a stronger hand that hasn't happened yet.",
  "Confidence is built one rep at a time.",
  "Leaders talk early and play balanced.",
  "Consistency beats intensity. Keep stacking days.",
  "Today's effort is next week's skill.",
  "Dream big. Train smart. Rest well.",
  "Read the defender, then make the play.",
];
const ICON_PATHS = {
  sprout: '<path d="M12 20v-8"/><path d="M12 12c0-3.5-2.5-5.5-6-5.5 0 3.5 2.5 5.5 6 5.5z"/><path d="M12 14c0-3 2-5 5.5-5 0 3-2 5-5.5 5z"/>',
  ball: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17M3.5 12h17"/><path d="M6 6c3 2.5 3 9.5 0 12M18 6c-3 2.5-3 9.5 0 12"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
  shield: '<path d="M12 3l7 2.5v5.5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V5.5z"/><path d="M9 12l2.2 2.2L15 10"/>',
  star: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.7l5.9-.8z"/>',
  crown: '<path d="M4 17l-1-9 5 4 4-7 4 7 5-4-1 9z"/><path d="M5 20h14"/>',
  flame: '<path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 01-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9z"/>',
  gift: '<rect x="4" y="9" width="16" height="11" rx="2"/><path d="M12 9v11M4 13h16"/><path d="M12 9c-2-4-6-3-5-1 .8 1.5 3.5 1 5 1zM12 9c2-4 6-3 5-1-.8 1.5-3.5 1-5 1z"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>',
  bolt: '<path d="M13 3L5 13.5h6L10 21l8-10.5h-6z"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
  hoop: '<path d="M4 4h16v6H4z"/><ellipse cx="12" cy="14" rx="5" ry="1.6"/><path d="M7.5 15l1.5 5M16.5 15L15 20M12 15.6V20"/>',
  pass: '<path d="M3.5 9h14M14 5l4 4-4 4"/><path d="M20.5 16h-14M10 12l-4 4 4 4"/>',
  trend: '<path d="M3.5 17l5.5-5.5 3.5 3.5 7-8"/><path d="M15 7h5.5v5.5"/>',
  trophy: '<path d="M7.5 4h9v5a4.5 4.5 0 01-9 0z"/><path d="M7.5 6H4.5c0 3 1.5 4 3 4M16.5 6h3c0 3-1.5 4-3 4"/><path d="M12 13.5V17M8.5 20h7M9.5 17h5"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M21 20H3"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.6-7 10-7 10z"/>',
  moon: '<path d="M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z"/>',
  card: '<rect x="5" y="3" width="14" height="18" rx="2.5"/><circle cx="12" cy="10" r="2.5"/><path d="M8 17c.8-2 2.2-3 4-3s3.2 1 4 3"/>',
  book: '<path d="M5 4h12a2 2 0 012 2v14H7a2 2 0 01-2-2z"/><path d="M5 18a2 2 0 012-2h12"/>',
  flag: '<path d="M5 21V4M5 5h12l-2 4 2 4H5"/>',
};
function badge(name, cls = "") {
  return `<span class="badge ${cls}"><svg viewBox="0 0 24 24" aria-hidden="true">${ICON_PATHS[name] || ""}</svg></span>`;
}
const LEVELS = [[0, "Rookie", "sprout"], [5, "Ball Handler", "ball"], [15, "Playmaker", "target"], [30, "Floor General", "shield"], [60, "All-Star", "star"], [100, "Franchise PG", "crown"]];
const dayOfYear = () => Math.floor((new Date() - new Date(new Date().getFullYear(), 0, 0)) / 864e5);

function xpOfLog(l) {
  let x = Object.keys(l.done || {}).length * 10;
  if (l.complete) x += 50;
  if (l.energy) x += 5;
  if (l.learned || l.improve || l.challenge) x += 5;
  x += Object.keys(l.watched || {}).length * 5;
  if (l.film) x += 20;
  if (l.body) x += 5;
  if (l.sleep) x += 5;
  return x;
}
function xpTotal() {
  let x = 0;
  for (const k in S.logs) x += xpOfLog(S.logs[k]);
  for (const k in S.weekly) {
    const w = S.weekly[k];
    if (w.right || w.shoot) x += 25;
    if (w.improved || w.adjust) x += 15;
    if (w.challenge && w.challenge.done) x += 25;
  }
  return x;
}
const SKILLS = [["handle", "Ball handling", "ball", /handl/], ["pass", "Passing and reads", "pass", /pass/], ["shoot", "Shooting", "hoop", /shoot/], ["finish", "Finishing and defense", "bolt", /finish|defen/], ["iq", "Court IQ", "eye", /film|discuss|review|check-in|decision/]];
const SK_LV = [0, 30, 80, 150, 250, 400, 600];
function skillPoints() {
  const titles = {}, pts = {};
  S.days.forEach((d) => d.blocks.forEach((b) => (titles[b.id] = b.title.toLowerCase())));
  for (const k in S.logs) for (const id in S.logs[k].done || {}) {
    const sk = SKILLS.find((s) => s[3].test(titles[id] || ""));
    if (sk) pts[sk[0]] = (pts[sk[0]] || 0) + 10;
  }
  return pts;
}
function skillLevel(p) {
  let l = 1;
  SK_LV.forEach((t, i) => { if (p >= t) l = i + 1; });
  const nxt = SK_LV[l];
  return { l, pct: nxt ? ((p - SK_LV[l - 1]) / (nxt - SK_LV[l - 1])) * 100 : 100 };
}
const sortedRewards = () => [...S.rewards].sort((p, q) => p.xp - q.xp);
function nextReward(xp) {
  const list = sortedRewards();
  const next = list.find((r) => r.xp > xp);
  const prev = [...list].reverse().find((r) => r.xp <= xp);
  return next ? { next, pct: ((xp - (prev ? prev.xp : 0)) / (next.xp - (prev ? prev.xp : 0))) * 100 } : null;
}
const completeDates = () => Object.keys(S.logs).filter((k) => S.logs[k].complete);
function sessionsInWeek(monKey) {
  const mon = parseKey(monKey);
  let n = 0;
  for (let i = 0; i < 7; i++) if (S.logs[dateKey(addDays(mon, i))]?.complete) n++;
  return n;
}
function weekStreak() {
  let mon = mondayOf(new Date());
  let streak = 0;
  if (sessionsInWeek(dateKey(mon)) >= 4) streak++;
  for (let i = 0; i < 520; i++) {
    mon = addDays(mon, -7);
    if (sessionsInWeek(dateKey(mon)) >= 4) streak++; else break;
  }
  return streak;
}
function levelInfo(total) {
  let idx = 0;
  LEVELS.forEach((l, i) => { if (total >= l[0]) idx = i; });
  const next = LEVELS[idx + 1];
  return { cur: LEVELS[idx], next, pct: next ? ((total - LEVELS[idx][0]) / (next[0] - LEVELS[idx][0])) * 100 : 100, toGo: next ? next[0] - total : 0 };
}
function weeksWithSessions() {
  const m = {};
  completeDates().forEach((k) => { const w = dateKey(mondayOf(parseKey(k))); m[w] = (m[w] || 0) + 1; });
  return m;
}
function achievements() {
  const total = completeDates().length;
  const weeks = Object.values(weeksWithSessions());
  const skill = Object.values(S.weekly).some((w) => w.right !== undefined && w.right !== "" || w.shoot !== undefined && w.shoot !== "");
  const streak = weekStreak();
  return [
    ["ball", "First session", "Finish one full session.", total >= 1],
    ["flame", "Five sessions", "Finish 5 sessions.", total >= 5],
    ["target", "Ten sessions", "Finish 10 sessions.", total >= 10],
    ["star", "Twenty-five sessions", "Finish 25 sessions.", total >= 25],
    ["bolt", "Big week", "Finish 6 sessions in one week.", weeks.some((n) => n >= 6)],
    ["trend", "Two-week streak", "4+ sessions two weeks in a row.", streak >= 2],
    ["trophy", "Four-week streak", "Complete a full development cycle.", streak >= 4],
    ["chart", "Skill check logged", "Record a Saturday skill check.", skill],
  ];
}

/* ---------- video helpers ---------- */
function embed(url) {
  let m;
  if ((m = url.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/))) return { kind: "iframe", src: `https://www.youtube.com/embed/${m[1]}?playsinline=1` };
  if ((m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/))) return { kind: "iframe", src: `https://player.vimeo.com/video/${m[1]}` };
  if (/\.(mp4|webm|mov|m4v)(\?|$)/i.test(url)) return { kind: "video", src: url };
  return null;
}
const normUrl = (u) => { u = (u || "").trim(); return u && !/^https?:\/\//i.test(u) ? "https://" + u : u; };
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return ""; } };

/* ---------- icons ---------- */
const ICONS = {
  today: '<circle cx="12" cy="12" r="9"/><path d="M12 3v18M3 12h18"/><path d="M6 5.5c3 2.5 3 10.5 0 13M18 5.5c-3 2.5-3 10.5 0 13"/>',
  week: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  videos: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M10 9l5 3-5 3z"/>',
  log: '<path d="M4 20V10M10 20V4M16 20v-8M21 20H3"/>',
  guide: '<path d="M5 4h12a2 2 0 012 2v14H7a2 2 0 01-2-2z"/><path d="M5 18a2 2 0 012-2h12"/>',
};
const TABS = [["today", "Today"], ["week", "Week"], ["videos", "Videos"], ["log", "Log"], ["guide", "Guide"]];

/* ---------- views ---------- */
function blockTimes(day) {
  let t = 0;
  return day.blocks.map((b) => { const s = t; t += Number(b.minutes) || 0; return `${s}–${t} min`; });
}
function fmtTime(sec) { return `${Math.floor(sec / 60)}:${pad(Math.max(0, sec % 60))}`; }

function brand() {
  const p = S.profile;
  const logo = p.logo || "icons/team-logo.png";
  const dot = Sync.code ? `<span class="syncdot ${Sync.status}" title="${esc(Sync.statusText())}"></span>` : "";
  return `<div class="brand"><img src="${esc(logo)}" alt="${esc(p.team)} logo" onerror="this.outerHTML='<button class=&quot;logo-add&quot; data-a=&quot;editProfile&quot;>Add<br>logo</button>'"><div><b>${esc(p.team)}</b><span>${dot}${esc(p.league)}</span></div></div>`;
}

/* ---------- film study (self-scored) ---------- */
const FILM_QS = [["Who is open?", "Pause before the point guard decides. Name every teammate who could get the ball."], ["What did the defender do?", "Did the defender stay home, help, or commit to the ball?"], ["Where should the pass arrive?", "Into the receiver's path, away from the defender."], ["Was there a scoring opportunity?", "Could the point guard have scored, or was passing right?"], ["What is one practical adjustment?", "One thing to do differently next time."]];
const newFilm = () => ({ step: 0, clip: "", answers: ["", "", "", "", ""], scores: [null, null, null, null, null] });
function filmScore(f) { return f.scores.slice(0, 4).filter(Boolean).length + (f.answers[4].trim() ? 1 : 0); }
function renderFilm() {
  const el = $("#film");
  const f = ui.film;
  if (!f) { el.innerHTML = ""; return; }
  const dots = FILM_QS.map((_, i) => `<i class="${i < f.step - 1 || f.step > 5 ? "d" : ""} ${i === f.step - 1 ? "c" : ""}"></i>`).join("");
  const top = `<div class="g-top"><button data-a="filmClose">Close</button><span>Film study</span><span class="g-sp"></span></div><div class="g-dots">${dots}</div>`;
  let body = "";
  if (f.step === 0) {
    const vids = S.videos.filter((v) => v.url);
    const cur = S.videos.find((v) => v.id === f.clip);
    body = `<div class="g-main film-main"><div class="g-eyebrow">Read the floor</div><h2>Film study</h2>
      <p class="g-text">Watch a short game clip or a training video. Pause before the point guard decides. Then answer five questions. You score yourself, so be honest. +20 XP when you finish.</p>
      <label class="f-label" for="film-clip">Which clip?</label>
      <select id="film-clip" class="f-input" data-film-clip><option value="">My own game footage</option>${vids.map((v) => `<option value="${v.id}" ${f.clip === v.id ? "selected" : ""}>${esc((v.code ? v.code + " · " : "") + v.title)}</option>`).join("")}</select>
      ${cur && cur.url ? `<a class="f-link" href="${esc(cur.url)}" target="_blank" rel="noopener">Open the clip ↗</a>` : ""}</div>
      <div class="g-actions"><button class="g-primary" data-a="filmNext">Start the questions</button></div>`;
  } else if (f.step <= 5) {
    const i = f.step - 1, [q, hint] = FILM_QS[i];
    body = `<div class="g-main film-main"><div class="g-eyebrow">Question ${f.step} of 5</div><h2>${esc(q)}</h2><p class="g-text">${esc(hint)}</p>
      <label class="f-label" for="film-ans">${i === 4 ? "My adjustment" : "My answer (optional)"}</label>
      <textarea id="film-ans" class="f-input" data-film-ans>${esc(f.answers[i])}</textarea></div>
      <div class="g-actions">${i < 4 ? `<div class="g-row"><button data-a="filmScore" data-v="0">Not yet</button><button class="got" data-a="filmScore" data-v="1">Got it</button></div>` : `<button class="g-primary" data-a="filmFinish">Finish</button>`}</div>`;
  } else {
    const sc = filmScore(f);
    body = `<div class="g-main film-main"><div class="g-eyebrow">Nice work</div><h2>You read ${sc} of 5</h2>
      <p class="g-text">+20 XP. Pick one answer and talk it through with a parent or your coach. Next time, scan the whole floor before the catch.</p></div>
      <div class="g-actions"><button class="g-primary" data-a="filmSave">Save and finish</button></div>`;
  }
  paint(el, `<div class="guided film" role="dialog" aria-label="Film study">${top}${body}</div>`);
}

/* ---------- calendar export ---------- */
const icsEsc = (s) => String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
function icsFold(line) { const out = []; let l = line; while (l.length > 74) { out.push(l.slice(0, 74)); l = " " + l.slice(74); } out.push(l); return out.join("\r\n"); }
const icsLocal = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
const icsUtc = (d) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
function buildIcs({ time, alarm, weeks, sunday }) {
  const [hh, mm] = time.split(":").map(Number);
  const now = new Date();
  const mon0 = mondayOf(now);
  const link = /^https?:/.test(location.protocol) ? location.href.split("#")[0] : "";
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Rens Training//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:Rens Training"];
  let count = 0;
  for (let w = 0; w < weeks; w++) {
    S.days.slice(0, 7).forEach((d, i) => {
      if (i === 6 && !sunday) return;
      const day = addDays(mon0, w * 7 + i);
      const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hh, mm);
      const mins = d.blocks.reduce((p, b) => p + (Number(b.minutes) || 0), 0) || 60;
      const end = new Date(start.getTime() + mins * 60000);
      if (end < now) return;
      const vids = d.videoIds.map((id) => S.videos.find((v) => v.id === id)).filter((v) => v && v.url);
      const desc = [d.theme, d.cue ? "Cue: " + d.cue : "", "", ...d.blocks.map((b) => `${b.title} (${b.minutes} min)`), vids.length ? "\nWatch first:" : "", ...vids.map((v) => `${v.title}: ${v.url}`), link ? "\nOpen the app: " + link : ""].filter((x) => x !== undefined).join("\n");
      lines.push("BEGIN:VEVENT", `UID:rens-${dateKey(day)}-${d.id}@rens-training`, `DTSTAMP:${icsUtc(now)}`, `DTSTART:${icsLocal(start)}`, `DTEND:${icsLocal(end)}`, `SUMMARY:${icsEsc("Rens Training: " + d.theme)}`, `DESCRIPTION:${icsEsc(desc)}`,
        "BEGIN:VALARM", `TRIGGER:-PT${Number(alarm)}M`, "ACTION:DISPLAY", `DESCRIPTION:${icsEsc("Training starts in " + alarm + " minutes")}`, "END:VALARM", "END:VEVENT");
      count++;
    });
  }
  lines.push("END:VCALENDAR");
  return { text: lines.map(icsFold).join("\r\n") + "\r\n", count };
}
async function deliverFile(file) {
  try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: file.name }); return "shared"; } } catch (e) { if (e && e.name === "AbortError") return "cancel"; }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(file); a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
  return "downloaded";
}

/* ---------- reminders (best effort, only while the app can run) ---------- */
let remindTimer = null;
async function showReminder() {
  const day = S.days[todayIdx()];
  if (!day || logOf(todayKey()).complete) return;
  const title = "Time to train, " + firstName(S.profile.name);
  const body = `${day.theme}. ${day.blocks.reduce((p, b) => p + (Number(b.minutes) || 0), 0)} minutes. Let's go.`;
  try {
    const reg = navigator.serviceWorker && (await navigator.serviceWorker.getRegistration());
    if (reg && reg.showNotification) { await reg.showNotification(title, { body, icon: "icons/icon-192.png", tag: "rens-reminder" }); return; }
  } catch (e) {}
  try { new Notification(title, { body, icon: "icons/icon-192.png", tag: "rens-reminder" }); } catch (e) {}
}
function scheduleReminder() {
  clearTimeout(remindTimer);
  if (!Prefs.remind || !("Notification" in window) || Notification.permission !== "granted") return;
  const [h, m] = Prefs.remindTime.split(":").map(Number);
  const t = new Date(); t.setHours(h, m, 0, 0);
  const ms = t - Date.now();
  if (ms > 0 && ms < 2147483000) remindTimer = setTimeout(showReminder, ms);
}

/* ---------- four-week cycle ---------- */
const CYCLE = [["Learn the drills and record a baseline.", "Keep passing distances and shooting spots the same every time."], ["Repeat the same work with better accuracy, balance and eyes-up control.", "Same drills, cleaner."], ["If control is steady, add movement or light defensive pressure.", "Raise only one difficulty at a time."], ["Add live reads and compare the same baseline measures.", "Review the results with your coach."]];
function cycleInfo() {
  const thisMon = mondayOf(new Date());
  const diff = Math.round((thisMon - parseKey(S.profile.cycleStart)) / (7 * 864e5));
  return { n: ((diff % 4) + 4) % 4 + 1, diff, base: dateKey(addDays(thisMon, -7 * (((diff % 4) + 4) % 4))) };
}
function cycleCard() {
  const c = cycleInfo();
  const [t, s] = CYCLE[c.n - 1];
  let cmp = "";
  if (c.n > 1) {
    const b = S.weekly[c.base] || {}, w = S.weekly[weekKeyNow()] || {};
    const rows = [["right", "Right-hand passes"], ["left", "Left-hand passes"], ["shoot", "Shots made"], ["ft", "Free throws"]].filter(([k]) => b[k] !== undefined && b[k] !== "" && w[k] !== undefined && w[k] !== "");
    if (rows.length) cmp = `<div class="cyc-cmp"><b>Since your week 1 baseline</b>${rows.map(([k, l]) => `<span>${l}: ${b[k]} → <em class="${Number(w[k]) >= Number(b[k]) ? "up" : "down"}">${w[k]}</em></span>`).join("")}</div>`;
  }
  return `<div class="cycle"><div class="cyc-top"><b>Cycle week ${c.n} of 4</b><span class="cyc-dots">${[1, 2, 3, 4].map((i) => `<i class="${i < c.n ? "d" : ""} ${i === c.n ? "c" : ""}"></i>`).join("")}</span></div><p>${esc(t)}</p><p class="cyc-sub">${esc(s)}</p>${cmp}</div>`;
}

/* ---------- hours guardrail ---------- */
function weekLoad(monKey) {
  const mon = parseKey(monKey);
  let total = 0, active = 0;
  for (let i = 0; i < 7; i++) {
    const l = S.logs[dateKey(addDays(mon, i))];
    if (!l) continue;
    const team = Number(l.team) || 0;
    const own = l.minutes ? Number(l.minutes) || 0 : l.complete && i < 6 && S.days[i] ? S.days[i].blocks.reduce((p, b) => p + (Number(b.minutes) || 0), 0) : 0;
    total += team + own;
    if (team || own || l.complete) active++;
  }
  return { hours: total / 60, active };
}
function hoursCard(monKey, compact) {
  const { hours, active } = weekLoad(monKey);
  const state = hours > 10 ? "over" : hours >= 8 ? "near" : "ok";
  const msg = hours > 10 ? "Over the 10-hour weekly ceiling. Take a lighter day and a full rest day." : hours >= 8 ? "Getting close to the 10-hour weekly ceiling. Plan a rest day." : active >= 7 ? "Every day this week had basketball. Keep one day fully off." : "Within the plan's 10-hour weekly ceiling.";
  if (compact && state === "ok" && active < 7) return "";
  return `<div class="hours ${state}"><div class="hrs-top"><b>Organized basketball this week</b><span>${hours.toFixed(1)} of 10 h</span></div><div class="progress"><i style="width:${Math.min(100, (hours / 10) * 100)}%"></i></div><p>${msg}</p></div>`;
}

/* ---------- shot chart ---------- */
const SPOT_XY = { lc: [34, 198], lw: [62, 110], top: [150, 62], rw: [238, 110], rc: [266, 198] };
function shotAgg(range) {
  const out = {};
  const cutoff = Date.now() - 28 * 864e5;
  for (const k in S.logs) {
    if (range !== "all" && parseKey(k).getTime() < cutoff) continue;
    const sh = S.logs[k].shots;
    if (!sh) continue;
    for (const s in sh) { const o = (out[s] ||= { m: 0, x: 0 }); o.m += sh[s].m; o.x += sh[s].x; }
  }
  return out;
}
function shotChartHtml() {
  const range = ui.chartRange || "4w";
  const agg = shotAgg(range);
  let M = 0, X = 0;
  Object.values(agg).forEach((o) => { M += o.m; X += o.x; });
  const sel = ui.chartSpot;
  const spots = SPOTS.map(([id, name]) => {
    const o = agg[id] || { m: 0, x: 0 }, att = o.m + o.x, pct = att ? o.m / att : null;
    const cls = pct === null ? "none" : pct >= 0.5 ? "hi" : pct >= 0.35 ? "mid" : "lo";
    const [x, y] = SPOT_XY[id];
    return `<g class="spot ${cls} ${sel === id ? "sel" : ""}" data-a="chartSpot" data-s="${id}" role="button" tabindex="0" aria-label="${name}: ${att ? o.m + " of " + att : "no shots yet"}"><circle cx="${x}" cy="${y}" r="25"/><text x="${x}" y="${y + 2}" text-anchor="middle" class="sp1">${pct === null ? "–" : Math.round(pct * 100) + "%"}</text><text x="${x}" y="${y + 15}" text-anchor="middle" class="sp2">${att ? o.m + "/" + att : ""}</text></g>`;
  }).join("");
  const det = sel ? (() => { const o = agg[sel] || { m: 0, x: 0 }, att = o.m + o.x; return `<p class="chart-note"><b>${SPOTS.find((s) => s[0] === sel)[1]}</b>: ${att ? `${o.m} of ${att} made (${Math.round((o.m / att) * 100)}%)` : "no shots tracked yet"}</p>`; })() : "";
  return `<h2 class="section">Shot chart</h2><div class="group chartcard">
    <div class="seg" style="margin:0 0 8px"><button class="${range === "4w" ? "on" : ""}" data-a="chartRange" data-r="4w">Last 4 weeks</button><button class="${range === "all" ? "on" : ""}" data-a="chartRange" data-r="all">All time</button></div>
    <svg class="court" viewBox="0 0 300 250" role="group" aria-label="Shooting spots"><rect x="112" y="150" width="76" height="86" class="ln"/><path d="M120 150a30 30 0 0160 0" class="ln"/><path d="M34 236V170A128 128 0 00266 170V236" class="ln"/><rect x="132" y="233" width="36" height="3" class="bb"/><circle cx="150" cy="223" r="6" class="ln"/><path d="M10 236H290" class="ln"/>${spots}</svg>
    <p class="chart-note">${M + X ? `${M} of ${M + X} shots made (${Math.round((M / (M + X)) * 100)}%). Track shots in the guided Shoot block.` : "Track shots in the guided Shoot block and this chart fills in."}</p>${det}</div>`;
}

/* ---------- player card ---------- */
const TIERS = ["bronze", "bronze", "silver", "silver", "gold", "diamond"];
function ratings() {
  const pts = skillPoints(), r = {};
  SKILLS.forEach(([k]) => { r[k] = 45 + Math.round(50 * (1 - Math.exp(-(pts[k] || 0) / 250))); });
  return { r, ovr: Math.round(SKILLS.reduce((p, [k]) => p + r[k], 0) / SKILLS.length) };
}
function cardData() {
  const total = completeDates().length, lv = levelInfo(total), { r, ovr } = ratings();
  return { r, ovr, lv, total, xp: xpTotal(), tier: TIERS[LEVELS.findIndex((l) => l[1] === lv.cur[1])] || "bronze", name: S.profile.name, num: S.profile.number ? "#" + String(S.profile.number).replace(/^#/, "") : "" };
}
function cardHtml() {
  const c = cardData();
  const logo = S.profile.logo || "icons/team-logo.png";
  return `<div class="pcard ${c.tier}"><div class="pc-top"><img src="${esc(logo)}" alt="" onerror="this.remove()"><div class="pc-ovr"><b>${c.ovr}</b><span>OVR</span></div></div>
    <div class="pc-name">${esc(c.name)}</div><div class="pc-sub">PG · ${esc(S.profile.team)} ${esc(S.profile.league)}${c.num ? " · " + esc(c.num) : ""}</div>
    <div class="pc-rate">${SKILLS.map(([k, name]) => `<div class="pc-row"><span>${name}</span><div class="pc-bar"><i style="width:${Math.round(((c.r[k] - 40) / 60) * 100)}%"></i></div><b>${c.r[k]}</b></div>`).join("")}</div>
    <div class="pc-foot"><span>${badge(c.lv.cur[2], "xs")} ${esc(c.lv.cur[1])}</span><span>${c.total} sessions</span><span>${c.xp} XP</span></div></div>`;
}
async function cardImage() {
  const c = cardData();
  const W = 1080, H = 1500, cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const g = cv.getContext("2d");
  const rr = (x, y, w, h, r) => { g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h); };
  const tier = { bronze: ["#e0a070", "#8a5230"], silver: ["#e8ebf0", "#9aa1ad"], gold: ["#ffe27a", "#c98f0a"], diamond: ["#b7f0ff", "#4aa8e8"] }[c.tier];
  const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, "#22345f"); bg.addColorStop(1, "#0b1122");
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  const bd = g.createLinearGradient(0, 0, W, H); bd.addColorStop(0, tier[0]); bd.addColorStop(1, tier[1]);
  g.fillStyle = bd; rr(60, 60, W - 120, H - 120, 56); g.fill();
  const inner = g.createLinearGradient(0, 60, 0, H); inner.addColorStop(0, "#16264a"); inner.addColorStop(1, "#0a1020");
  g.fillStyle = inner; rr(80, 80, W - 160, H - 160, 44); g.fill();
  try { const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = S.profile.logo || "icons/team-logo.png"; }); g.drawImage(img, 140, 140, 200, 200); } catch (e) {}
  const t = (s, x, y, size, color, weight = 700, align = "left") => { g.font = `${weight} ${size}px -apple-system, "SF Pro Display", Helvetica, Arial, sans-serif`; g.fillStyle = color; g.textAlign = align; g.fillText(s, x, y); };
  t(String(c.ovr), W - 140, 290, 190, tier[0], 800, "right"); t("OVR", W - 140, 345, 44, "rgba(255,255,255,.75)", 600, "right");
  const nm = c.name; t(nm, 140, 470, nm.length > 18 ? 66 : 84, "#ffffff", 800);
  t(`PG · ${S.profile.team} ${S.profile.league}${c.num ? " · " + c.num : ""}`, 140, 530, 38, "rgba(255,255,255,.75)", 500);
  let y = 640;
  SKILLS.forEach(([k, name]) => { t(name, 140, y, 40, "#ffffff", 600); t(String(c.r[k]), W - 140, y, 46, tier[0], 800, "right"); g.fillStyle = "rgba(255,255,255,.14)"; rr(140, y + 22, W - 280, 22, 11); g.fill(); g.fillStyle = tier[0]; rr(140, y + 22, Math.max(24, (W - 280) * ((c.r[k] - 40) / 60)), 22, 11); g.fill(); y += 130; });
  t(c.lv.cur[1], 140, H - 170, 52, tier[0], 800); t(`${c.total} sessions · ${c.xp} XP`, W - 140, H - 170, 38, "rgba(255,255,255,.8)", 500, "right");
  t("Made with the Rens training app", W / 2, H - 100, 28, "rgba(255,255,255,.45)", 500, "center");
  return new Promise((res) => cv.toBlob(res, "image/png"));
}

/* ---------- playbook cards ---------- */
const PLAYBOOK = [
  ["Scan before the catch", "Look at the defense and your teammates before the ball reaches you, so you already know your next move.", "Wednesday footwork: catch, check the floor, then pass."],
  ["Eyes up", "Keep your head up while you dribble. You cannot pass to someone you cannot see.", "Walk-and-dribble with your eyes on a spot on the wall."],
  ["Stay balanced", "Land on two feet, bend your knees, keep your head over your hips.", "Jump stops: stop, hold the landing for two seconds."],
  ["Use either hand", "A pass or a finish with your weaker hand keeps defenders guessing.", "Ten left-hand push passes at a target."],
  ["Control first, then speed", "Fast only works when the ball stays under control.", "Cone course: slow and clean, then add speed."],
  ["Pass to a teammate's advantage", "Deliver the ball where your teammate can catch and use it, not just where they are standing.", "Lead a moving partner with a bounce pass into their path."],
  ["Read the defender", "The defender's feet and hands tell you whether to pass, shoot or drive.", "2-on-1 drill: decide when the defender commits."],
  ["Protect the ball", "Keep your body between the ball and the defender and use your off arm.", "Protected dribble against light pressure."],
  ["Cut or relocate after passing", "A pass is not the end of the play. Move to open space and be ready to get it back.", "Pass, cut, catch, shoot."],
  ["Communicate early", "Call the play, the screen or the open man before it happens, using your team's words.", "Call every pass out loud in practice."],
  ["Stay between the ball and the basket", "On defense, keep yourself in the lane the ball needs to travel.", "Mirror drill with a partner."],
  ["Know when to score", "Great point guards also take the open shot or the open lane when it is there.", "Look to score first in the 2-on-1 finish."],
];
const pbUnlockAt = (i) => i * 120;
function playbookHtml() {
  const xp = xpTotal();
  const got = PLAYBOOK.filter((_, i) => xp >= pbUnlockAt(i)).length;
  return `<h2 class="section">Playbook <span class="cnt">${got} of ${PLAYBOOK.length}</span></h2><div class="group pbwrap"><div class="pbgrid">${PLAYBOOK.map((c, i) => { const on = xp >= pbUnlockAt(i); return on ? `<button class="pbcard" data-a="pbOpen" data-i="${i}">${badge("book", "xs")}<b>${esc(c[0])}</b></button>` : `<div class="pbcard locked" aria-label="Locked, unlocks at ${pbUnlockAt(i)} XP">${badge("lock", "xs off")}<b>Unlocks at ${pbUnlockAt(i)} XP</b></div>`; }).join("")}</div></div>`;
}
function openInfo(title, html) {
  $("#modal").innerHTML = `<div class="scrim"><div class="sheet" role="dialog" aria-label="${esc(title)}"><header><button data-a="close">Close</button><b>${esc(title)}</b><span style="min-width:56px"></span></header>${html}</div></div>`;
}

const CHALLENGES = ["Make 8 of 10 free throws", "20 left-hand passes on target in one session", "Zero lost balls on the cone course", "Hit 7 of 10 from my best spot", "10 minutes of left-hand dribbling, 4 days", "Watch a game and spot 3 good passes"];
const weekKeyNow = () => dateKey(mondayOf(new Date()));
const noteSeen = () => { try { return localStorage.getItem("tristan-note-seen"); } catch (e) { return null; } };
function noteCard() {
  const n = S.note;
  if (!n || !n.text || String(n.ts) === noteSeen()) return "";
  return `<div class="pnote">${badge("heart")}<div class="grow"><b>Note from ${esc(n.from || "home")}</b><p>${esc(n.text)}</p></div><button data-a="noteSeen">Got it</button></div>`;
}
function challengeCard() {
  const c = (S.weekly[weekKeyNow()] || {}).challenge;
  if (!c) return `<div class="chal">${badge("flag")}<div class="grow"><b>This week's challenge</b><span>Pick one goal just for you. Finish it for +25 XP.</span></div><button data-a="challengePick">Pick</button></div>`;
  return `<div class="chal ${c.done ? "done" : ""}"><button class="check ${c.done ? "on" : ""}" data-a="challengeDone" aria-label="Mark challenge done">${c.done ? "✓" : ""}</button><div class="grow"><b>This week's challenge</b><span>${esc(c.text)}</span></div><button data-a="challengePick">Change</button></div>`;
}
function checkinCard(lg) {
  const body = [[1, "Fresh"], [2, "OK"], [3, "Sore"]];
  const sl = lg.sleep;
  const low = sl && sl < 9;
  return `<h2 class="section">Morning check-in</h2><div class="group">
    <div class="row"><div class="grow"><div class="title strong">Body today</div>${lg.body === 3 ? '<div class="detail">Take it easy today. Stop for pain or unusual tiredness and tell a parent or coach.</div>' : ""}</div>
      <div class="chips" role="group" aria-label="Body today">${body.map(([v, l]) => `<button class="chip ${lg.body === v ? "on" : ""}" data-a="bodySet" data-v="${v}" aria-pressed="${lg.body === v}">${l}</button>`).join("")}</div></div>
    <div class="row"><div class="grow"><div class="title strong">Sleep last night</div><div class="detail ${low ? "warn" : ""}">${sl ? (low ? "Under the 9 to 12 hours a 12-year-old needs" : "Right in the 9 to 12 hour range") : "Aim for 9 to 12 hours"}</div></div>
      <div class="stepper"><button data-a="sleepAdj" data-d="-0.5" aria-label="Less sleep">−</button><b>${sl ? sl + "h" : "–"}</b><button data-a="sleepAdj" data-d="0.5" aria-label="More sleep">+</button></div></div></div>`;
}
function bests() {
  const rows = [];
  TRENDS.forEach(([k, label, suf, max, good]) => {
    let best = null, wk = null;
    Object.keys(S.weekly).sort().forEach((w) => { const v = S.weekly[w][k]; if (v === undefined || v === "" || isNaN(Number(v))) return; const n = Number(v); if (best === null || (good ? n > best : n < best)) { best = n; wk = w; } });
    if (best !== null) rows.push([label, best + suf, "Week of " + fmtShort(parseKey(wk))]);
  });
  const xpw = xpByWeek(520).reduce((p, q) => (q.xp > p.xp ? q : p), { xp: 0 });
  if (xpw.xp) rows.push(["Most XP in a week", xpw.xp + " XP", "Week of " + fmtShort(xpw.mon)]);
  const sess = Object.entries(weeksWithSessions()).reduce((p, q) => (q[1] > p[1] ? q : p), ["", 0]);
  if (sess[1]) rows.push(["Most sessions in a week", String(sess[1]), "Week of " + fmtShort(parseKey(sess[0]))]);
  const st = weekStreak();
  if (st) rows.push(["Current week streak", String(st), "Keep it going"]);
  return `<h2 class="section">Personal bests</h2><div class="group">${rows.map(([l, v, d]) => `<div class="row"><div class="grow"><div class="title">${l}</div><div class="detail">${d}</div></div><div class="tval">${v}</div></div>`).join("") || '<div class="empty">Your bests will show up here after your first skill check.</div>'}</div>`;
}

function viewToday() {
  const day = S.days[ui.day];
  const date = dateOf(ui.day);
  const lg = S.logs[date] || { done: {} };
  const done = lg.done || {};
  const doneN = day.blocks.filter((b) => done[b.id]).length;
  const pct = day.blocks.length ? (doneN / day.blocks.length) * 100 : 0;
  const total = completeDates().length;
  const lv = levelInfo(total);
  const xp = xpTotal();
  const nr = nextReward(xp);
  const hr = new Date().getHours();
  const greet = hr < 12 ? "Good Morning" : hr < 18 ? "Good Afternoon" : "Good Evening";
  const isToday = ui.day === todayIdx();
  const times = blockTimes(day);
  const msg = MESSAGES[dayOfYear() % MESSAGES.length];
  const seg = S.days.map((d, i) => `<button class="${i === ui.day ? "on" : ""} ${i === todayIdx() ? "today" : ""}" data-a="day" data-i="${i}">${esc(d.name.slice(0, 3))}</button>`).join("");
  const vids = day.videoIds.map((id) => S.videos.find((v) => v.id === id)).filter(Boolean);
  const mood = [["😫", 1], ["😕", 2], ["😐", 3], ["🙂", 4], ["🔥", 5]];
  const curId = (day.blocks.find((b) => !done[b.id]) || {}).id;
  const startLabel = doneN > 0 ? "Continue session" : "Start session";
  return `
  ${brand()}
  <h1 class="greet">${greet}, ${esc(Prefs.parent ? firstName(Prefs.parent) : firstName(S.profile.name))}</h1>
  <p class="sub tight">${Prefs.parent ? esc("Family view. You are following " + firstName(S.profile.name) + "'s training.") : esc(msg)}</p>
  ${noteCard()}
  <div class="seg">${seg}</div>
  <div class="cols"><div>
  <div class="hero">
    <div class="herorow"><div class="grow">
      <div class="eyebrow">${isToday ? "Today" : esc(day.name)} · ${fmtShort(parseKey(date))}</div>
      <div class="big">${esc(day.theme)}</div>
      <div class="detail">${doneN} of ${day.blocks.length} blocks · ${day.blocks.reduce((a, b) => a + (Number(b.minutes) || 0), 0)} min</div>
      ${day.cue ? `<div class="herocue"><b>Cue</b> ${esc(day.cue)}</div>` : ""}
    </div>
    <svg class="ring" viewBox="0 0 72 72" aria-label="${Math.round(pct)} percent done"><circle cx="36" cy="36" r="30" class="rt"/><circle cx="36" cy="36" r="30" class="rf ${pct === 100 ? "full" : ""}" stroke-dasharray="188.5" stroke-dashoffset="${(188.5 * (1 - pct / 100)).toFixed(1)}"/><text x="36" y="41" text-anchor="middle">${Math.round(pct)}%</text></svg></div>
    ${pct === 100 ? `<p class="win">Session complete. That's how point guards are made, ${esc(firstName(S.profile.name))}!</p>` : day.blocks.length ? `<button class="startbtn" data-a="gStart">${startLabel}</button>` : ""}
    <div class="herometa"><span>${xp} XP</span><span>${esc(lv.cur[1])}</span><span>${weekStreak()} week streak</span><span>Cycle ${cycleInfo().n}/4</span></div>
  </div>
  <h2 class="section">Session <button data-a="editDay">Edit day</button></h2>
  <div class="group">
    ${day.blocks.map((b, i) => {
      const on = !!done[b.id];
      const cur = b.id === curId;
      const open = !!ui.openBlocks[b.id];
      return `<div class="row blk ${on ? "done" : ""} ${cur ? "current" : ""}">
        <button class="check ${on ? "on" : ""}${on && ui.fresh === b.id ? " fresh" : ""}" data-a="toggle" data-id="${b.id}" aria-label="Mark ${esc(b.title)} done">${on ? "✓" : ""}</button>
        <div class="grow"><div class="title strong">${esc(b.title)}</div>
          <div class="detail"><span class="pill">${times[i]}</span>${cur ? ' <span class="pill blue">Up next</span>' : ""}</div>
          ${b.text ? `<button class="linkbtn" data-a="blockInfo" data-id="${b.id}">${open ? "Hide details" : "Details"}</button>${open ? `<div class="detail">${esc(b.text)}</div>` : ""}` : ""}</div>
        <div class="side">
          <button class="play" data-a="gFrom" data-id="${b.id}" aria-label="Start ${esc(b.title)} timer">▶</button>
          <button class="more" data-a="editBlock" data-id="${b.id}" aria-label="Edit ${esc(b.title)}">•••</button>
        </div></div>`;
    }).join("") || `<div class="empty">No blocks yet.</div>`}
  </div>
  <button class="btn gray" data-a="addBlock">Add a block</button>
  </div><div>
  ${vids.length ? `<h2 class="section">Watch first</h2><div class="group"><div class="row"><div class="pills" style="margin:0">${vids.map((v) => `<button class="pill" data-a="goVideo" data-id="${v.id}">${watchedToday(v.id) ? "✓ " : ""}${esc(v.code || "▶")} ${esc(v.title)}</button>`).join("")}<button class="pill blue" data-a="filmStart">Film study</button></div></div></div>` : ""}
  ${checkinCard(logOf(date))}
  <h2 class="section">How did it feel? <button data-a="editLogDay" data-date="${date}">Add notes</button></h2>
  <div class="group"><div class="row"><div class="emojis grow">${mood.map(([e, v]) => `<button class="${lg.energy === v ? "on" : ""}" data-a="energy" data-v="${v}" aria-label="Energy ${v}">${e}</button>`).join("")}</div></div>
  ${lg.improve || lg.challenge ? `<div class="row"><div class="grow">${lg.improve ? `<div class="detail"><b>Improved:</b> ${esc(lg.improve)}</div>` : ""}${lg.challenge ? `<div class="detail"><b>Challenge:</b> ${esc(lg.challenge)}</div>` : ""}</div></div>` : ""}</div>
  <h2 class="section">Your progress</h2>
  ${cycleCard()}
  <button class="cardbtn" data-a="cardOpen">${badge("card")}<div class="grow"><b>Player card</b><span>Overall ${ratings().ovr} · ${esc(levelInfo(completeDates().length).cur[1])}</span></div><span class="chev">›</span></button>
  ${hoursCard(weekKeyNow(), true)}
  <div class="stats">
    <div class="stat"><b>${xp}</b><span>XP points</span></div>
    <div class="stat"><b>${weekStreak()}</b><span>Week streak</span></div>
    <div class="stat"><b>${badge(lv.cur[2])}</b><span>${esc(lv.cur[1])}</span></div>
  </div>
  <div class="level"><div class="progress"><i style="width:${lv.pct}%"></i></div>
    <p class="small">${lv.next ? `${lv.toGo} more session${lv.toGo === 1 ? "" : "s"} to reach <b>${esc(lv.next[1])}</b> ${badge(lv.next[2], "xs")}` : "You reached the top level. Franchise PG."}</p></div>
  ${challengeCard()}
  ${nr ? `<div class="reward"><div class="rtitle">${badge("gift", "xs")} Next reward: <b>${esc(nr.next.title)}</b></div><div class="progress"><i style="width:${nr.pct}%"></i></div><p class="small" style="margin:6px 0 0">${nr.next.xp - xp} XP to go · each block is +10, a full session +50</p></div>` : ""}
  <div class="group" style="margin-top:12px">${SKILLS.map(([k, name, em]) => { const sp = skillPoints()[k] || 0; const sl = skillLevel(sp); return `<div class="row">${badge(em)}<div class="grow"><div class="title strong">${name}</div><div class="progress" style="margin-top:6px"><i style="width:${sl.pct}%"></i></div></div><span class="pill blue">Lv ${sl.l}</span></div>`; }).join("")}</div>
  <p class="small">Finish blocks to level up each skill. The best point guards build all five.</p>
  <div class="why"><b>My Why</b><p>${esc(S.profile.why)}</p></div>
  </div></div>`;
}

function viewWeek() {
  const mon = mondayOf(new Date());
  const monKey = dateKey(mon);
  const n = sessionsInWeek(monKey);
  const goal = S.days.length > 6 ? 6 : S.days.length;
  const wk = S.weekly[monKey] || {};
  return `
  <h1 class="large">This Week</h1>
  <p class="sub">Week of ${fmtShort(mon)}</p>
  <div class="hero"><div class="eyebrow">Weekly goal</div>
    <div class="big">${n} of ${goal} sessions</div>
    <div class="progress"><i style="width:${Math.min(100, (n / goal) * 100)}%"></i></div>
    <div class="detail">${wk.priority ? "Coach's priority: " + esc(wk.priority) : "Set a priority for the week in Log."}</div></div>
  <div class="wstrip">${S.days.map((d, i) => {
    const l = S.logs[dateOf(i)] || { done: {} };
    const c = d.blocks.filter((b) => l.done?.[b.id]).length;
    const p = d.blocks.length ? c / d.blocks.length : 0;
    return `<button class="wd ${i === todayIdx() ? "today" : ""}" data-a="openDay" data-i="${i}" aria-label="${esc(d.name)} ${Math.round(p * 100)} percent"><svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="14" class="rt"/><circle cx="18" cy="18" r="14" class="rf ${l.complete ? "full" : ""}" stroke-dasharray="88" stroke-dashoffset="${(88 * (1 - p)).toFixed(1)}"/>${l.complete ? '<path d="M11.5 18.5l4.2 4.2 8.8-9" class="ck"/>' : ""}</svg><span>${esc(d.name.slice(0, 3))}</span></button>`;
  }).join("")}</div>
  ${hoursCard(weekKeyNow(), false)}
  <h2 class="section">Days</h2>
  <div class="group">${S.days.map((d, i) => {
    const date = dateOf(i);
    const lg = S.logs[date] || { done: {} };
    const c = d.blocks.filter((b) => lg.done?.[b.id]).length;
    const full = !!lg.complete;
    return `<div class="row tap" data-a="openDay" data-i="${i}">
      <div class="check ${full ? "on" : ""}">${full ? "✓" : ""}</div>
      <div class="grow"><div class="title strong">${esc(d.name)}${i === todayIdx() ? ' <span class="pill blue">Today</span>' : ""}</div><div class="detail">${esc(d.theme)}</div></div>
      <div class="detail">${c}/${d.blocks.length}</div><span class="chev">›</span></div>`;
  }).join("")}</div>
  <button class="btn gray" data-a="calStart">Add the plan to my calendar</button>
  <p class="small">Calendar events come with a reminder alert that works even when the app is closed.</p>
  <p class="small">Team practice, mandatory training and games replace that day's individual session. Do not double up to make up a missed day.</p>`;
}

const ytId = (u) => { const m = (u || "").match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/); return m ? m[1] : null; };
const todayKey = () => dateKey(new Date());
const watchedToday = (id) => !!((S.logs[todayKey()] || {}).watched || {})[id];

function viewVideos() {
  const todaysIds = (S.days[todayIdx()] || { videoIds: [] }).videoIds;
  const card = (v) => {
    const open = ui.openVideo === v.id;
    const e = v.url ? embed(v.url) : null;
    let player = "";
    if (open) {
      if (v.fileId) player = `<video class="player" controls playsinline data-file="${v.fileId}"></video>`;
      else if (e && e.kind === "iframe") player = `<iframe class="player" src="${esc(e.src)}" allow="fullscreen; picture-in-picture" allowfullscreen loading="lazy"></iframe>`;
      else if (e && e.kind === "video") player = `<video class="player" controls playsinline src="${esc(e.src)}"></video>`;
    }
    const yt = ytId(v.url);
    const w = watchedToday(v.id);
    const tag = w ? '<span class="pill green">Watched</span>' : todaysIds.includes(v.id) ? '<span class="pill blue">Watch first</span>' : "";
    return `<div class="row tap-wrap" style="flex-direction:column;align-items:stretch">
      <div style="display:flex;gap:12px;align-items:center" data-a="openVid" data-id="${v.id}">
        <div class="thumb"><div class="vcode ${v.fileId ? "file" : ""}">${esc(v.code || "▶")}</div>${yt ? `<img src="https://i.ytimg.com/vi/${yt}/mqdefault.jpg" alt="" loading="lazy" onerror="this.remove()">` : ""}</div>
        <div class="grow"><div class="title strong">${esc(v.title)}</div>${tag ? `<div style="margin-top:3px">${tag}</div>` : ""}${v.note ? `<div class="detail">${esc(v.note)}</div>` : ""}</div>
        <span class="chev">${open ? "⌃" : "›"}</span></div>
      ${open ? `${player}<div class="pills">${v.url ? `<a class="pill blue" href="${esc(v.url)}" target="_blank" rel="noopener" data-a="watchOpen" data-id="${v.id}">Open on ${esc(host(v.url) || "web")} ↗</a>` : ""}<button class="pill ${w ? "green" : ""}" data-a="watchMark" data-id="${v.id}">${w ? "Watched ✓" : "Mark watched (+5 XP)"}</button><button class="pill" data-a="editVideo" data-id="${v.id}">Edit</button></div>` : ""}
    </div>`;
  };
  return `
  <h1 class="large">Videos</h1>
  <p class="sub">Watch the clip that matches today's drill.</p>
  <button class="feature film-card" data-a="filmStart"><b>Film study</b><span>Watch a clip, answer 5 questions, score yourself. +20 XP</span></button>
  <a class="feature" style="margin-top:10px" href="https://jr.nba.com/jrnbaathome/" target="_blank" rel="noopener"><b>Jr. NBA at Home</b><span>Free drills and videos you can do anywhere ↗</span></a>
  ${todaysIds.length ? `<h2 class="section">Watch first today</h2><div class="group">${todaysIds.map((id) => S.videos.find((v) => v.id === id)).filter(Boolean).map(card).join("")}</div>` : ""}
  <h2 class="section">All drill videos <button data-a="addVideo">Add</button></h2>
  <div class="group">${S.videos.map(card).join("") || `<div class="empty">No videos yet. Tap Add to save one.</div>`}</div>
  <h2 class="section">Websites <button data-a="addLink">Add</button></h2>
  <div class="group">${S.links.map((l) => `<div class="row"><div class="grow"><a class="title strong lnk" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.title)} ↗</a>${l.note ? `<div class="detail">${esc(l.note)}</div>` : ""}</div><button data-a="editLink" data-id="${l.id}">Edit</button></div>`).join("") || `<div class="empty">No websites yet.</div>`}</div>
  <p class="small">Tip: paste a YouTube or Vimeo link and it plays right here. You can also add a clip from your phone.</p>`;
}

const TRENDS = [["right", "Passes, right hand", "/10", 10, true], ["left", "Passes, left hand", "/10", 10, true], ["shoot", "Shots made", "/25", 25, true], ["ft", "Free throws", "/10", 10, true], ["lost", "Lost balls on the cone course", "", null, false], ["good", "Good reads in games", "", null, true]];
function series(key) {
  return Object.keys(S.weekly).sort()
    .filter((k) => S.weekly[k][key] !== undefined && S.weekly[k][key] !== "" && !isNaN(Number(S.weekly[k][key])))
    .map((k) => Number(S.weekly[k][key])).slice(-8);
}
function spark(vals, max, goodHigh) {
  const w = 120, h = 34, p = 4;
  const hi = max != null ? max : Math.max(5, ...vals);
  const x = (i) => (vals.length === 1 ? w / 2 : p + (i * (w - 2 * p)) / (vals.length - 1));
  const y = (v) => h - p - (Math.min(v, hi) / hi) * (h - 2 * p);
  const best = goodHigh ? Math.max(...vals) : Math.min(...vals);
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" aria-hidden="true">${vals.length > 1 ? `<polyline points="${vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ")}"/>` : ""}${vals.map((v, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="${i === vals.length - 1 ? 3.6 : 2.2}" class="${i === vals.length - 1 ? "last" : ""} ${vals.length > 1 && v === best ? "best" : ""}"/>`).join("")}</svg>`;
}
function xpByWeek(n = 8) {
  const map = {};
  for (const k in S.logs) { const w = dateKey(mondayOf(parseKey(k))); map[w] = (map[w] || 0) + xpOfLog(S.logs[k]); }
  for (const w in S.weekly) { const o = S.weekly[w]; map[w] = (map[w] || 0) + (o.right || o.shoot ? 25 : 0) + (o.improved || o.adjust ? 15 : 0) + (o.challenge && o.challenge.done ? 25 : 0); }
  const out = [];
  let mon = mondayOf(new Date());
  for (let i = 0; i < n; i++) { const k = dateKey(mon); out.unshift({ k, mon, xp: map[k] || 0, now: i === 0 }); mon = addDays(mon, -7); }
  return out;
}
function trendsHtml() {
  const rows = TRENDS.map(([k, label, suf, max, good]) => {
    const v = series(k);
    if (!v.length) return "";
    const last = v[v.length - 1], d = v.length > 1 ? last - v[v.length - 2] : null;
    const better = d === null || d === 0 ? null : good ? d > 0 : d < 0;
    return `<div class="row"><div class="grow"><div class="title">${label}</div><div class="detail">${d === null ? "First result. Record again next week." : d === 0 ? "Same as last week" : `<span class="${better ? "up" : "down"}">${d > 0 ? "+" : ""}${d} vs last week</span>`}</div></div>${spark(v, max, good)}<div class="tval">${last}<small>${suf}</small></div></div>`;
  }).join("");
  const wk = xpByWeek();
  const top = Math.max(50, ...wk.map((x) => x.xp));
  const bw = 28, gap = 10, H = 78;
  const bars = wk.map((x, i) => { const h = Math.round((x.xp / top) * H); const xx = i * (bw + gap) + 6; return `<g><rect class="bar ${x.now ? "now" : ""}" x="${xx}" y="${14 + H - h}" width="${bw}" height="${Math.max(h, x.xp ? 2 : 0)}" rx="5"/><text class="bv" x="${xx + bw / 2}" y="${10 + H - h}" text-anchor="middle">${x.xp || ""}</text><text class="bl" x="${xx + bw / 2}" y="108" text-anchor="middle">${x.mon.getMonth() + 1}/${x.mon.getDate()}</text></g>`; }).join("");
  return `<h2 class="section">Trends</h2>
  <div class="group">${rows || '<div class="empty">Record a Saturday skill check to see your trends here.</div>'}</div>
  <div class="group chartcard"><div class="title strong">XP each week</div><svg class="xpchart" viewBox="0 0 320 114" role="img" aria-label="XP earned in each of the last 8 weeks">${bars}</svg></div>`;
}
function reportData() {
  const mon = addDays(mondayOf(new Date()), ui.weekOffset * 7);
  const wk = dateKey(mon);
  const w = S.weekly[wk] || {};
  let sessions = 0, xp = 0;
  for (let i = 0; i < 7; i++) { const l = S.logs[dateKey(addDays(mon, i))]; if (l) { if (l.complete) sessions++; xp += xpOfLog(l); } }
  xp += (w.right || w.shoot ? 25 : 0) + (w.improved || w.adjust ? 15 : 0) + (w.challenge && w.challenge.done ? 25 : 0);
  return { mon, wk, w, sessions, xp, goal: Math.min(6, S.days.length), hours: weekLoad(wk).hours };
}
function reportText(r) {
  const w = r.w, sk = [];
  if (w.right !== undefined && w.right !== "") sk.push(`passes R ${w.right}/10, L ${w.left ?? "-"}/10`);
  if (w.shoot) sk.push(`shots ${w.shoot}/25`);
  if (w.ft) sk.push(`free throws ${w.ft}/10`);
  if (w.lost) sk.push(`lost balls ${w.lost}`);
  if (w.good) sk.push(`good reads ${w.good}`);
  const end = addDays(r.mon, 6);
  return [`${firstName(S.profile.name)}'s week, ${fmtShort(r.mon)} to ${fmtShort(end)} (${S.profile.team} ${S.profile.league})`,
    `Sessions finished: ${r.sessions} of ${r.goal}`, `Organized basketball: ${r.hours.toFixed(1)} of 10 hours`, `XP earned: ${r.xp}`,
    sk.length ? `Skill check: ${sk.join(", ")}` : "", w.priority ? `Coach's priority: ${w.priority}` : "", w.goal ? `${firstName(S.profile.name)}'s goal: ${w.goal}` : "",
    w.improved ? `Improved: ${w.improved}` : "", w.hard ? `Difficult: ${w.hard}` : "", w.adjust ? `Next week's one adjustment: ${w.adjust}` : ""].filter(Boolean).join("\n");
}
async function reportImage(r) {
  const c = document.createElement("canvas");
  c.width = 1080; c.height = 1350;
  const g = c.getContext("2d");
  const bg = g.createLinearGradient(0, 0, 0, 1350);
  bg.addColorStop(0, "#22345f"); bg.addColorStop(1, "#0b1122");
  g.fillStyle = bg; g.fillRect(0, 0, 1080, 1350);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = S.profile.logo || "icons/team-logo.png"; });
    g.drawImage(img, 70, 70, 130, 130);
  } catch (e) {}
  g.textBaseline = "alphabetic";
  const t = (s, x, y, size, color, weight = 700, align = "left") => { g.font = `${weight} ${size}px -apple-system, "SF Pro Display", Helvetica, Arial, sans-serif`; g.fillStyle = color; g.textAlign = align; g.fillText(s, x, y); };
  t(S.profile.team, 1010, 130, 54, "#ffffff", 700, "right");
  t(S.profile.league, 1010, 182, 34, "rgba(255,255,255,.7)", 500, "right");
  t(`${firstName(S.profile.name)}'s week`, 70, 330, 78, "#ffffff");
  t(`${fmtShort(r.mon)} to ${fmtShort(addDays(r.mon, 6))}`, 70, 385, 38, "#ffb340", 600);
  const card = (x, y, big, label) => { g.fillStyle = "rgba(255,255,255,.09)"; g.beginPath(); g.roundRect(x, y, 460, 230, 34); g.fill(); t(String(big), x + 40, y + 125, 100, "#ffb340", 800); t(label, x + 40, y + 180, 34, "rgba(255,255,255,.75)", 500); };
  card(70, 450, `${r.sessions}/${r.goal}`, "Sessions finished");
  card(550, 450, r.xp, "XP earned");
  const w = r.w, rows = [["Passes, right / left", w.right !== undefined && w.right !== "" ? `${w.right} / ${w.left ?? "-"} of 10` : ""], ["Shots made", w.shoot ? `${w.shoot} of 25` : ""], ["Free throws", w.ft ? `${w.ft} of 10` : ""], ["Lost balls", w.lost || ""], ["Good reads", w.good || ""]].filter((x) => x[1] !== "");
  let y = 770;
  t("Saturday skill check", 70, y, 40, "#ffffff"); y += 30;
  if (!rows.length) { y += 50; t("No skill check recorded this week", 70, y, 32, "rgba(255,255,255,.6)", 500); }
  rows.forEach(([l, v]) => { y += 62; t(l, 70, y, 34, "rgba(255,255,255,.8)", 500); t(String(v), 1010, y, 36, "#ffffff", 700, "right"); });
  if (w.adjust) { t("Next week's one adjustment", 70, 1150, 30, "#ffb340", 600); g.font = "500 34px -apple-system, Helvetica, Arial, sans-serif"; g.fillStyle = "#fff"; g.textAlign = "left"; let line = "", yy = 1200; for (const word of w.adjust.split(" ")) { if (g.measureText(line + word).width > 940) { g.fillText(line, 70, yy); yy += 46; line = ""; } line += word + " "; } g.fillText(line, 70, yy); }
  t("Made with the NY Rens training app", 540, 1310, 28, "rgba(255,255,255,.5)", 500, "center");
  return new Promise((res) => c.toBlob(res, "image/png"));
}

function viewLog() {
  const mon = addDays(mondayOf(new Date()), ui.weekOffset * 7);
  const wk = dateKey(mon);
  const w = S.weekly[wk] || {};
  const isNow = ui.weekOffset === 0;
  const prev = Object.keys(S.weekly).filter((k) => k !== wk).map((k) => S.weekly[k]);
  const pb = (key, high = true) => {
    const v = Number(w[key]);
    if (w[key] === undefined || w[key] === "" || isNaN(v)) return "";
    const others = prev.map((p) => Number(p[key])).filter((x) => p0(x));
    function p0(x) { return !isNaN(x); }
    if (!others.length) return "";
    return (high ? others.every((o) => v > o) : others.every((o) => v < o)) ? ' <span class="pill blue">Personal best</span>' : "";
  };
  const val = (k, suf = "") => (w[k] === undefined || w[k] === "" ? "–" : esc(w[k]) + suf);
  const rows = S.days.map((d, i) => {
    const date = dateKey(addDays(mon, i));
    const lg = S.logs[date] || {};
    const e = { 1: "😫", 2: "😕", 3: "😐", 4: "🙂", 5: "🔥" }[lg.energy] || "";
    return `<div class="row tap" data-a="editLogDay" data-date="${date}">
      <div class="check ${lg.complete ? "on" : ""}">${lg.complete ? "✓" : ""}</div>
      <div class="grow"><div class="title strong">${esc(d.name)} <span class="detail" style="display:inline">${fmtShort(addDays(mon, i))}</span></div>
      <div class="detail">${[lg.event, lg.sleep && "Slept " + lg.sleep + "h", lg.film && `Film study ${lg.film.score}/5`, lg.learned && "Learned: " + lg.learned].filter(Boolean).map(esc).join(" · ") || "Tap to log"}</div></div>
      <div style="font-size:22px">${e}</div><span class="chev">›</span></div>`;
  }).join("");
  const ach = achievements();
  return `
  <h1 class="large">Progress</h1>
  <div class="nav-row"><button data-a="wkPrev">‹ Earlier</button><span class="week-title">${isNow ? "This week" : "Week of " + fmtShort(mon)}</span><button data-a="wkNext" ${isNow ? 'disabled style="opacity:.3"' : ""}>Later ›</button></div>
  <button class="btn" style="margin:0 0 12px" data-a="ovrOpen">Progress overview</button>
  <div class="cols"><div>
  <h2 class="section">Goals <button data-a="editWeekGoals">Edit</button></h2>
  <div class="group">
    <div class="row"><div class="grow"><div class="detail">Coach's priority</div><div class="title">${esc(w.priority) || "Tap Edit to set one"}</div></div></div>
    <div class="row"><div class="grow"><div class="detail">${esc(firstName(S.profile.name))}'s goal</div><div class="title">${esc(w.goal) || "Tap Edit to set one"}</div></div></div>
    <div class="row"><div class="grow"><div class="detail">Weekly challenge</div><div class="title">${w.challenge ? esc(w.challenge.text) + (w.challenge.done ? " (done)" : "") : "None chosen"}</div></div></div></div>
  <h2 class="section">Daily log</h2><div class="group">${rows}</div>
  <h2 class="section">Saturday skill check <button data-a="editSkill">Edit</button></h2>
  <div class="group">
    <div class="row"><div class="grow">On-target passes (10 each hand)</div><div class="detail">R ${val("right")} · L ${val("left")}${pb("right")}</div></div>
    <div class="row"><div class="grow">Shooting (5 per spot)</div><div class="detail">${val("shoot", " / 25")}${pb("shoot")}</div></div>
    <div class="row"><div class="grow">Free throws</div><div class="detail">${val("ft", " / 10")}${pb("ft")}</div></div>
    <div class="row"><div class="grow">Cone course (lost balls)</div><div class="detail">${val("lost")}${pb("lost", false)}</div></div>
    <div class="row"><div class="grow">Game decisions (good reads)</div><div class="detail">${val("good")}${pb("good")}</div></div></div>
  <h2 class="section">Weekly reflection <button data-a="editReflect">Edit</button></h2>
  <div class="group">${[["improved", "What improved?"], ["hard", "What was difficult?"], ["fun", "What was fun?"], ["adjust", "Next week's one adjustment"]].map(([k, l]) => `<div class="row"><div class="grow"><div class="detail">${l}</div><div class="title">${esc(w[k]) || "–"}</div></div></div>`).join("")}
    <div class="row"><div class="grow">Organized basketball this week</div><div class="detail">${val("hours", " hrs")}</div></div>
    <div class="row"><div class="grow">Physical rest day</div><div class="detail">${val("rest")}</div></div></div>
  <button class="btn gray" data-a="shareReport">Share weekly report</button>
  </div><div>
  ${trendsHtml()}
  ${shotChartHtml()}
  ${playbookHtml()}
  ${bests()}
  <h2 class="section">Rewards <button data-a="addReward">Add</button></h2>
  <div class="group">${sortedRewards().map((r) => { const got = xpTotal() >= r.xp; return `<div class="row tap ${got ? "" : "locked"}" data-a="editReward" data-id="${r.id}">${badge(got ? "gift" : "lock", got ? "" : "off")}<div class="grow"><div class="title strong">${esc(r.title)}</div><div class="detail">${r.xp} XP${r.note ? " · " + esc(r.note) : ""}</div></div>${got ? '<span class="pill blue">Unlocked</span>' : ""}</div>`; }).join("") || '<div class="empty">No rewards yet. Tap Add.</div>'}</div>
  <p class="small">Earn XP: +10 per finished block, +50 per finished session, +5 per video watched, +5 for the morning check-in, +25 for a skill check, +25 for a finished weekly challenge, plus small bonuses for notes and reflections.</p>
  <h2 class="section">Achievements</h2>
  <div class="group">${ach.map(([e, t, d, got]) => `<div class="row ${got ? "" : "locked"}">${badge(e, got ? "" : "off")}<div class="grow"><div class="title strong">${t}</div><div class="detail">${d}</div></div>${got ? '<span class="pill blue">Earned</span>' : ""}</div>`).join("")}</div>
  </div></div>`;
}

function viewGuide() {
  const p = S.profile;
  return `
  ${brand()}
  <h1 class="large">Guide</h1>
  <p class="sub">${esc(p.subtitle)}</p>
  <button class="btn" style="margin:12px 0 0" data-a="ovrOpen">Progress overview</button>
  <div class="why"><b>My Why</b><p>${esc(p.why)}</p></div>
  <div class="group" style="margin-top:12px"><div class="row"><div class="grow"><div class="detail">Priority</div><div class="title">${esc(p.priority)}</div></div></div>
    <div class="row tap" data-a="editProfile"><div class="grow">Edit profile and My Why</div><span class="chev">›</span></div>
    <div class="row tap" data-a="cycleRestart"><div class="grow"><div class="title strong">Restart the 4-week cycle</div><div class="detail">Makes this week Week 1 and the new baseline.</div></div><span class="chev">›</span></div>
    <div class="row tap" data-a="noteWrite"><div class="grow"><div class="title strong">Write a note to ${esc(firstName(p.name))}</div><div class="detail">${S.note && S.note.text ? "Current: " + esc(S.note.text) : "Shows on the Today screen on every synced device."}</div></div><span class="chev">›</span></div></div>
  <h2 class="section">The plan <button data-a="addNote">Add</button></h2>
  <div class="group">${S.notes.map((n) => `<div class="row tap" data-a="editNote" data-id="${n.id}"><div class="grow"><div class="title strong">${esc(n.title)}</div><div class="detail" style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${esc(n.text)}</div></div><span class="chev">›</span></div>`).join("")}</div>
  <h2 class="section">Sync between devices</h2>
  <div class="group">
    ${!Sync.ready ? `<div class="row"><div class="grow detail">Sync is not set up in this build.</div></div>` : Sync.code ? `
    <div class="row"><div class="grow"><div class="detail">Family code</div><div class="title strong" style="font-family:ui-monospace,Menlo,monospace;font-size:17px;overflow-wrap:anywhere;user-select:all">${esc(Sync.pretty(Sync.code))}</div><div class="detail" data-sync-status>${esc(Sync.statusText())}</div></div></div>
    <div class="row tap" data-a="syncShare"><div class="grow">Share code</div><span class="chev">›</span></div>
    <div class="row tap" data-a="syncNow"><div class="grow">Sync now</div><span class="chev">›</span></div>
    <div class="row tap" data-a="syncOff"><div class="grow" style="color:var(--red-text)">Turn off sync on this device</div></div>` : `
    <div class="row tap" data-a="syncCreate"><div class="grow"><div class="title strong">Create a family code</div><div class="detail">Start here on one device, then join from the others.</div></div><span class="chev">›</span></div>
    <div class="row tap" data-a="syncJoin"><div class="grow"><div class="title strong">Join with a family code</div><div class="detail">Enter the code from your other device.</div></div><span class="chev">›</span></div>`}
  </div>
  <h2 class="section">This device</h2>
  <div class="group"><div class="row tap" data-a="parentSet"><div class="grow"><div class="title strong">Family view</div><div class="detail">${Prefs.parent ? "On for " + esc(Prefs.parent) + ". Greets you by name, opens the progress overview, and blocks taps that would log training for " + esc(firstName(p.name)) + "." : "For a parent or sibling. Put your own name on this phone. It only changes this device, not " + esc(firstName(p.name)) + "'s."}</div></div><span class="chev">›</span></div></div>
  <h2 class="section">Sound, voice and haptics</h2>
  <div class="group">${[["sound", "Sounds", "A swish on each finished block and a chime on level-ups."], ["voice", "Voice cues", "Spoken start, halfway, one minute left and time up."], ["haptic", "Vibration", "Short buzzes when you tap or a timer ends."]].map(([k, t, d]) => `<div class="row"><div class="grow"><div class="title strong">${t}</div><div class="detail">${d}</div></div><button class="switch ${Prefs[k] ? "on" : ""}" role="switch" aria-checked="${Prefs[k]}" aria-label="${t}" data-a="prefToggle" data-k="${k}"><i></i></button></div>`).join("")}</div>
  <h2 class="section">Reminders</h2>
  <div class="group">
    <div class="row"><div class="grow"><div class="title strong">Reminder notification</div><div class="detail">Works while the app is open or recently used, and only if you added it to the Home Screen. For a reminder that always works, use Add the plan to my calendar in the Week tab.</div></div><button class="switch ${Prefs.remind ? "on" : ""}" role="switch" aria-checked="${Prefs.remind}" aria-label="Reminder notification" data-a="remindToggle"><i></i></button></div>
    <div class="row tap" data-a="remindTime"><div class="grow">Reminder time</div><div class="detail">${esc(Prefs.remindTime)}</div><span class="chev">›</span></div>
  </div>
  <h2 class="section">Your data</h2>
  <div class="group">
    <div class="row tap" data-a="share"><div class="grow">Send backup (AirDrop, Messages)</div><span class="chev">›</span></div>
    <div class="row tap" data-a="export"><div class="grow">Export backup</div><span class="chev">›</span></div>
    <div class="row tap" data-a="import"><div class="grow">Import backup</div><span class="chev">›</span></div>
    <div class="row tap" data-a="reset"><div class="grow" style="color:var(--red-text)">Reset to original plan</div></div></div>
  <p class="small">Everything is saved on this device. Uploaded video clips stay on this device and are not part of the backup file. Each device keeps its own copy. To move progress or changes between devices, use Send backup on one and Import backup on the other. Install: in Safari tap Share, then Add to Home Screen.</p>`;
}

/* ---------- guided session ---------- */
const G_C = 553;
function gLoad(i) {
  const b = S.days[ui.day].blocks[i];
  const t = Math.max(1, Number(b.minutes) || 1) * 60;
  ui.guided = { i, total: t, remaining: t, end: null, started: false, cues: {}, spot: (ui.guided && ui.guided.spot) || "top" };
}
function gStartAt(i) { gLoad(i); keepAwake(true); }
function gAdvance(markDone) {
  const day = S.days[ui.day];
  const g = ui.guided;
  const lg = logOf(dateOf(ui.day));
  if (markDone && !lg.done[day.blocks[g.i].id]) toggleBlock(day.blocks[g.i].id);
  let n = g.i + 1;
  while (n < day.blocks.length && lg.done[day.blocks[n].id]) n++;
  if (n >= day.blocks.length) { ui.guided = null; keepAwake(false); return; }
  gLoad(n);
}
const SPOTS = [["lc", "Left corner"], ["lw", "Left wing"], ["top", "Top"], ["rw", "Right wing"], ["rc", "Right corner"]];
function shotTotals(lg) {
  let m = 0, x = 0;
  for (const k in (lg && lg.shots) || {}) { m += lg.shots[k].m; x += lg.shots[k].x; }
  return { m, x, att: m + x };
}
function tallyHtml(b, g, lg) {
  if (/shoot/i.test(b.title)) {
    const t = shotTotals(lg);
    return `<div class="g-tally"><div class="g-spots" role="group" aria-label="Shooting spot">${SPOTS.map(([id, name]) => { const s = (lg.shots || {})[id] || { m: 0, x: 0 }; return `<button class="${g.spot === id ? "on" : ""}" data-a="gSpot" data-s="${id}" aria-pressed="${g.spot === id}"><b>${s.m}/${s.m + s.x}</b><span>${name}</span></button>`; }).join("")}</div>
      <div class="g-shotrow"><button class="made" data-a="gShot" data-r="m">Made</button><button class="miss" data-a="gShot" data-r="x">Missed</button></div>
      <p class="g-tl">${t.m} of ${t.att} shots${t.att ? " · " + Math.round((t.m / t.att) * 100) + "%" : ""}</p></div>`;
  }
  const n = (lg.reps || {})[b.id] || 0;
  const label = /pass/i.test(b.title) ? "good passes" : /handl/i.test(b.title) ? "clean reps" : "reps";
  return `<div class="g-tally"><div class="g-reps"><button data-a="gRep" data-d="-1" aria-label="Remove one">−</button><div><b>${n}</b><span>${label}</span></div><button class="plus" data-a="gRep" data-d="1" aria-label="Add one">+1</button></div></div>`;
}
function renderGuided() {
  const el = $("#guided");
  const g = ui.guided;
  if (!g) { el.innerHTML = ""; return; }
  const day = S.days[ui.day];
  const b = day.blocks[g.i];
  const next = day.blocks.slice(g.i + 1).find((x) => !logOf(dateOf(ui.day)).done[x.id]);
  const left = g.end ? Math.max(0, Math.ceil((g.end - Date.now()) / 1000)) : g.remaining;
  const lg = logOf(dateOf(ui.day));
  const dots = day.blocks.map((x, i) => `<i class="${lg.done[x.id] ? "d" : ""} ${i === g.i ? "c" : ""}"></i>`).join("");
  paint(el, `<div class="guided" role="dialog" aria-label="Guided session">
    <div class="g-top"><button data-a="gClose">Close</button><span>Block ${g.i + 1} of ${day.blocks.length}</span><span class="g-sp"></span></div>
    <div class="g-dots">${dots}</div>
    <div class="g-main">
      <div class="g-eyebrow">${esc(day.theme)}</div>
      <h2>${esc(b.title)}</h2>
      <div class="g-ringwrap"><svg class="g-ring" viewBox="0 0 200 200"><circle cx="100" cy="100" r="88" class="rt"/><circle cx="100" cy="100" r="88" class="rf" data-gring stroke-dasharray="${G_C}" stroke-dashoffset="${(G_C * (1 - (g.total - left) / g.total)).toFixed(1)}"/></svg><div class="g-time" data-gtime>${fmtTime(left)}</div></div>
      ${b.text ? `<p class="g-text">${esc(b.text)}</p>` : ""}
      ${tallyHtml(b, g, lg)}
    </div>
    <div class="g-actions">
      <button class="g-primary" data-a="gToggle">${g.end ? "Pause" : g.started ? "Resume" : "Start timer"}</button>
      <div class="g-row"><button data-a="gSkip">Skip</button><button data-a="gDone">Done, next</button></div>
      <p class="g-next">${next ? "Up next: " + esc(next.title) : "Last block. Finish strong."}</p>
    </div></div>`);
}

function renderSummary() {
  const el = $("#summary");
  const s = ui.summary;
  if (!s) { el.innerHTML = ""; return; }
  const row = (ic, title, sub, cls = "") => `<div class="s-row ${cls}">${badge(ic)}<div><b>${esc(title)}</b>${sub ? `<span>${esc(sub)}</span>` : ""}</div></div>`;
  paint(el, `<div class="guided summary" role="dialog" aria-label="Session complete">
    <div class="s-top"><svg class="s-check" viewBox="0 0 72 72"><circle cx="36" cy="36" r="30" class="rt"/><circle cx="36" cy="36" r="30" class="rf full" stroke-dasharray="188.5" stroke-dashoffset="0"/><path d="M24 37l8 8 16-17" class="ck"/></svg>
      <h2>Session complete</h2><p>${esc(s.theme)}</p><div class="s-xp">+${s.xpDay} XP</div><p class="s-sub">${s.xp} XP in total</p></div>
    <div class="s-list">
      ${s.levelUp ? `<div class="s-level">${badge(s.levelUp[2], "lg pulse")}<div><span>Level up</span><b>You're now a ${esc(s.levelUp[1])}</b></div></div>` : ""}
      ${s.ups.map((u) => row(u.ic, `${u.name} reached level ${u.lvl}`, "Skill level up")).join("")}
      ${s.rewards.map((r) => row("gift", `Reward unlocked: ${r.title}`, r.note || "", "gold")).join("")}
      ${s.next ? `<div class="s-row">${badge("gift")}<div><b>Next reward: ${esc(s.next.next.title)}</b><span>${s.next.next.xp - s.xp} XP to go</span><div class="progress"><i style="width:${s.next.pct}%"></i></div></div></div>` : ""}
      ${s.cards.map((c) => row("book", "New playbook card: " + c[0], c[1], "gold")).join("")}
      ${s.shots.att ? row("hoop", `${s.shots.m} of ${s.shots.att} shots made`, `${Math.round((s.shots.m / s.shots.att) * 100)}% from the spots you tracked`) : ""}
      ${s.reps ? row("pass", `${s.reps} reps counted`, "Tracked in this session") : ""}
      ${row("flame", `${s.week} session${s.week === 1 ? "" : "s"} this week`, s.streak ? `${s.streak} week streak` : "Finish 4 this week to start a streak")}
    </div>
    <p class="s-msg">${esc(s.msg)}</p>
    <button class="g-primary" data-a="sumClose">Nice work</button></div>`);
}

document.addEventListener("input", (e) => {
  if (ui.film && e.target.id === "film-ans") ui.film.answers[ui.film.step - 1] = e.target.value;
  if (ui.film && e.target.id === "film-clip") ui.film.clip = e.target.value;
  if (ui.welcome && e.target.id === "w-name") ui.welcome.name = e.target.value;
  if (ui.welcome && e.target.id === "w-why") ui.welcome.why = e.target.value;
});

function renderCard() {
  const el = $("#card");
  if (!ui.card) { el.innerHTML = ""; return; }
  paint(el, `<div class="guided cardview" role="dialog" aria-label="Player card"><div class="g-top"><button data-a="cardClose">Close</button><span>Player card</span><span class="g-sp"></span></div>
    <div class="g-main">${cardHtml()}<p class="pc-hint">Ratings rise as you finish blocks in each skill.</p></div>
    <div class="g-actions"><button class="g-primary" data-a="cardShare">Share card</button></div></div>`);
}

/* ---------- progress overview (for a parent) ---------- */
function ago(ts) {
  if (!ts) return "";
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return m + " min ago";
  const h = Math.round(m / 60);
  if (h < 24) return h + (h === 1 ? " hour ago" : " hours ago");
  const d = Math.round(h / 24);
  return d + (d === 1 ? " day ago" : " days ago");
}
function overviewHtml() {
  const first = firstName(S.profile.name);
  const mon = mondayOf(new Date()), wk = dateKey(mon);
  const total = completeDates().length, lv = levelInfo(total), xp = xpTotal(), { r, ovr } = ratings();
  const days = S.days.slice(0, 7).map((d, i) => { const date = dateKey(addDays(mon, i)); const l = S.logs[date] || { done: {} }; return { d, i, date, l, c: d.blocks.filter((b) => l.done && l.done[b.id]).length }; });
  const sessions = days.filter((x) => x.l.complete).length, goal = Math.min(6, S.days.length);
  const load = weekLoad(wk);
  const sleeps = days.map((x) => x.l.sleep).filter(Boolean), avgSleep = sleeps.length ? Math.round((sleeps.reduce((p, q) => p + q, 0) / sleeps.length) * 10) / 10 : null;
  const sore = days.filter((x) => x.l.body === 3).length;
  const lastTs = Math.max(0, ...Object.values(S.logs).map((l) => l._ts || 0));
  const todayI = todayIdx();
  const flags = [];
  if (sore) flags.push(`${sore} sore day${sore > 1 ? "s" : ""} this week. Check in about how his body feels.`);
  if (avgSleep && avgSleep < 9) flags.push(`Average sleep is ${avgSleep} hours, under the 9 to 12 a 12-year-old needs.`);
  if (load.hours >= 10) flags.push(`${load.hours.toFixed(1)} hours of basketball this week, over the plan's 10-hour ceiling.`);
  else if (load.hours >= 8) flags.push(`${load.hours.toFixed(1)} hours of basketball this week, close to the 10-hour ceiling.`);
  if (todayI >= 3 && sessions === 0) flags.push(`No sessions finished yet this week.`);
  const shots = shotAgg("4w");
  let M = 0, X = 0; Object.values(shots).forEach((o) => { M += o.m; X += o.x; });
  const w = S.weekly[wk] || {};
  const films = Object.keys(S.logs).filter((k) => S.logs[k].film).sort();
  const lastFilm = films.length ? S.logs[films[films.length - 1]].film : null;
  const notes = Object.keys(S.logs).sort().reverse().map((k) => ({ k, l: S.logs[k] })).filter((x) => x.l.learned || x.l.improve || x.l.challenge).slice(0, 5);
  const synced = Sync.code
    ? `Synced ${Sync.lastOk ? ago(Sync.lastOk) : "when the app is online"}. Latest activity from ${first}'s phone: ${lastTs ? ago(lastTs) : "none yet"}.`
    : `This phone is not connected to ${first}'s phone yet. In Guide, join with his family code to see his progress here.`;
  const faces = { 1: "Wiped out", 2: "Tired", 3: "Okay", 4: "Good", 5: "Great" };
  return `<header class="ovr-top"><button data-a="ovrClose">Done</button><b>${esc(first)}'s progress</b><button data-a="ovrRefresh">Refresh</button></header>
  <p class="ovr-sync ${Sync.code ? "" : "warn"}">${esc(synced)}</p>
  <div class="hero"><div class="herorow"><div class="grow"><div class="eyebrow">This week</div><div class="big">${sessions} of ${goal} sessions</div><div class="detail">${esc(lv.cur[1])} · Overall ${ovr} · ${xp} XP · ${weekStreak()} week streak</div></div>${badge(lv.cur[2], "lg")}</div>
    <div class="progress"><i style="width:${Math.min(100, (sessions / goal) * 100)}%"></i></div></div>
  ${flags.length ? `<div class="ovr-flags"><b>Worth a conversation</b>${flags.map((f) => `<p>${esc(f)}</p>`).join("")}</div>` : `<div class="ovr-ok"><b>Looking good</b><p>Nothing needs attention this week.</p></div>`}
  <h2 class="section">Day by day</h2>
  <div class="group">${days.map(({ d, i, l, c }) => {
    const future = i > todayI;
    const status = l.complete ? `<span class="pill green">Done</span>` : c ? `<span class="pill">${c}/${d.blocks.length}</span>` : future ? `<span class="pill">Ahead</span>` : l.team ? `<span class="pill">Team</span>` : `<span class="pill">–</span>`;
    const bits = [l.body ? ["", "Fresh", "OK", "Sore"][l.body] : "", l.sleep ? l.sleep + "h sleep" : "", l.energy ? faces[l.energy] : "", l.team ? l.team + " min team" : "", l.film ? `Film ${l.film.score}/5` : ""].filter(Boolean);
    return `<div class="row ${i === todayI ? "current" : ""}"><div class="grow"><div class="title strong">${esc(d.name)} <span class="detail" style="display:inline">${esc(d.theme)}</span></div><div class="detail ${l.body === 3 ? "warn" : ""}">${bits.length ? esc(bits.join(" · ")) : future ? "Not yet" : "No check-in"}</div></div>${status}</div>`;
  }).join("")}</div>
  <h2 class="section">The numbers</h2>
  <div class="group">
    <div class="row"><div class="grow">Organized basketball</div><div class="tval">${load.hours.toFixed(1)}<small> of 10 h</small></div></div>
    <div class="row"><div class="grow">Average sleep</div><div class="tval">${avgSleep ? avgSleep : "–"}<small>${avgSleep ? " h" : ""}</small></div></div>
    <div class="row"><div class="grow">Shots made, last 4 weeks</div><div class="tval">${M + X ? Math.round((M / (M + X)) * 100) + "%" : "–"}<small>${M + X ? ` ${M}/${M + X}` : ""}</small></div></div>
    <div class="row"><div class="grow">Weekly challenge</div><div class="detail">${w.challenge ? esc(w.challenge.text) + (w.challenge.done ? " (done)" : " (in progress)") : "Not chosen"}</div></div>
    <div class="row"><div class="grow">Latest film study</div><div class="tval">${lastFilm ? lastFilm.score : "–"}<small>${lastFilm ? " of 5" : ""}</small></div></div>
  </div>
  <h2 class="section">Skills</h2>
  <div class="group">${SKILLS.map(([k, name, ic]) => { const sl = skillLevel(skillPoints()[k] || 0); return `<div class="row">${badge(ic)}<div class="grow"><div class="title strong">${name}</div><div class="progress" style="margin-top:6px"><i style="width:${sl.pct}%"></i></div></div><span class="tval" style="font-size:18px">${r[k]}</span></div>`; }).join("")}</div>
  <h2 class="section">In his words</h2>
  <div class="group">${notes.map(({ k, l }) => `<div class="row"><div class="grow"><div class="detail">${fmtShort(parseKey(k))}</div>${l.improve ? `<div class="title">Improved: ${esc(l.improve)}</div>` : ""}${l.challenge ? `<div class="title">Challenge: ${esc(l.challenge)}</div>` : ""}${l.learned ? `<div class="title">Learned: ${esc(l.learned)}</div>` : ""}</div></div>`).join("") || '<div class="empty">Notes he writes after training will show up here.</div>'}
  ${w.improved || w.hard || w.adjust ? `<div class="row"><div class="grow"><div class="detail">This week's reflection</div>${w.improved ? `<div class="title">Improved: ${esc(w.improved)}</div>` : ""}${w.hard ? `<div class="title">Hard: ${esc(w.hard)}</div>` : ""}${w.adjust ? `<div class="title">Next week: ${esc(w.adjust)}</div>` : ""}</div></div>` : ""}</div>
  <button class="btn" data-a="shareReport">Share this week's report</button>
  <button class="btn gray" data-a="noteWrite">Write a note to ${esc(first)}</button>
  <p class="small">Everything on this screen comes from what ${esc(first)} checks off and logs in the app.</p>`;
}
function renderOverview() {
  const el = $("#overview");
  if (!ui.overview) { el.innerHTML = ""; return; }
  paint(el, `<div class="ovr" role="dialog" aria-label="Progress overview">${overviewHtml()}</div>`);
}

/* ---------- first-run welcome ---------- */
function renderWelcome() {
  const el = $("#welcome");
  if (ui.welcome && S.profile.onboarded) ui.welcome = null;
  const w = ui.welcome;
  if (!w) { el.innerHTML = ""; return; }
  const logo = S.profile.logo || "icons/team-logo.png";
  paint(el, w.step === 1 ? `<div class="guided welcome" role="dialog" aria-label="Welcome">
      <div class="w-main"><img class="w-logo" src="${esc(logo)}" alt=""><h2>Welcome to ${esc(firstName(S.profile.name))}'s ${esc(S.profile.team)} Training Plan</h2>
      <p>Let's set it up. You can change anything later.</p>
      <label for="w-name">Your name</label><input id="w-name" type="text" autocomplete="off" value="${esc(w.name)}">
      <label for="w-why">My Why (why I train)</label><textarea id="w-why">${esc(w.why)}</textarea></div>
      <div class="g-actions"><button class="g-primary" data-a="wNext">Continue</button></div></div>`
    : `<div class="guided welcome" role="dialog" aria-label="Sync your devices">
      <div class="w-main"><h2>Use it on more than one device?</h2>
      <p>A family code keeps the plan and progress the same on every phone. Create one on this device and join from the others, or skip this and do it later in Guide.</p>
      ${w.code ? `<div class="w-code">${esc(Sync.pretty(w.code))}</div><p>Write this code down or share it. Enter it on your other device under Guide, then Join with a family code.</p>` : ""}
      </div>
      <div class="g-actions">${w.code ? `<button class="g-primary" data-a="wFinish">Done, let's train</button>` : `${Sync.ready ? `<button class="g-primary" data-a="wCreate">Create a family code</button><div class="g-row"><button data-a="wJoin">I have a code</button><button data-a="wFinish">Skip for now</button></div>` : `<button class="g-primary" data-a="wFinish">Let's train</button>`}`}</div></div>`);
}
const finishWelcome = () => { S.profile.onboarded = true; ui.welcome = null; };

/* ---------- render ---------- */
function render() {
  const y = window.scrollY;
  $("#app").className = ui.tab === "today" || ui.tab === "log" ? "wide" : "";
  $("#app").innerHTML = { today: viewToday, week: viewWeek, videos: viewVideos, log: viewLog, guide: viewGuide }[ui.tab]();
  $("#tabs").innerHTML = TABS.map(([k, l]) => `<button class="${ui.tab === k ? "on" : ""}" data-a="tab" data-t="${k}"><svg viewBox="0 0 24 24">${ICONS[k]}</svg>${l}</button>`).join("");
  window.scrollTo(0, y);
  renderGuided();
  renderSummary();
  renderWelcome();
  renderFilm();
  renderCard();
  renderOverview();
  document.body.classList.toggle("noscroll", !!(ui.guided || ui.summary || ui.welcome || ui.film || ui.card || ui.overview));
  document.querySelectorAll("video[data-file]").forEach(async (el) => {
    try { const b = await idb.get(el.dataset.file); if (b) el.src = URL.createObjectURL(b); } catch (e) {}
  });
}

/* ---------- toast / celebrate / timer ---------- */
function toast(msg) {
  const t = document.createElement("div");
  t.className = "toast"; t.textContent = msg; document.body.appendChild(t);
  setTimeout(() => t.remove(), 2400);
}
const Prefs = {
  sound: true, voice: true, haptic: true, remind: false, remindTime: "16:00", calTime: "16:00", calAlarm: "30", parent: "",
  load() { try { Object.assign(this, JSON.parse(localStorage.getItem("tristan-prefs")) || {}); } catch (e) {} },
  save() { try { localStorage.setItem("tristan-prefs", JSON.stringify({ sound: this.sound, voice: this.voice, haptic: this.haptic, remind: this.remind, remindTime: this.remindTime, calTime: this.calTime, calAlarm: this.calAlarm, parent: this.parent })); } catch (e) {} },
};
Prefs.load();
const buzz = (p) => { if (Prefs.haptic && navigator.vibrate) navigator.vibrate(p); };
const Sfx = {
  ctx: null,
  unlock() {
    if (this.ctx) { if (this.ctx.state === "suspended") this.ctx.resume(); return; }
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
  },
  tone(f, d, type = "sine", g = 0.15, delay = 0) {
    if (!Prefs.sound || !this.ctx) return;
    const c = this.ctx, o = c.createOscillator(), v = c.createGain(), s = c.currentTime + delay;
    o.type = type; o.frequency.value = f; o.connect(v); v.connect(c.destination);
    v.gain.setValueAtTime(0, s); v.gain.linearRampToValueAtTime(g, s + 0.01); v.gain.exponentialRampToValueAtTime(0.0001, s + d);
    o.start(s); o.stop(s + d + 0.02);
  },
  swish() {
    if (!Prefs.sound || !this.ctx) return;
    const c = this.ctx, len = Math.floor(c.sampleRate * 0.35), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.2);
    const src = c.createBufferSource(), f = c.createBiquadFilter(), v = c.createGain();
    src.buffer = buf; f.type = "bandpass"; f.Q.value = 0.8;
    f.frequency.setValueAtTime(3500, c.currentTime); f.frequency.exponentialRampToValueAtTime(900, c.currentTime + 0.3);
    v.gain.value = 0.5; src.connect(f); f.connect(v); v.connect(c.destination); src.start();
  },
  beep() { this.tone(880, 0.35, "sine", 0.18); this.tone(880, 0.35, "sine", 0.18, 0.45); },
  chime() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.5, "triangle", 0.16, i * 0.12)); },
};
function paint(el, html) {
  const had = !!el.firstElementChild;
  const keep = had ? el.firstElementChild.scrollTop : 0;
  el.innerHTML = html;
  const root = el.firstElementChild;
  if (root && had) { root.classList.add("noanim"); root.scrollTop = keep; }
}
function say(text) {
  if (!Prefs.voice || !("speechSynthesis" in window)) return;
  try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.rate = 1.02; speechSynthesis.speak(u); } catch (e) {}
}

function celebrate() {
  const em = ["🏀", "⭐", "🔥", "💪", "🎉"];
  for (let i = 0; i < 28; i++) {
    const s = document.createElement("span");
    s.className = "confetti"; s.textContent = em[i % em.length];
    s.style.left = Math.random() * 100 + "vw";
    s.style.animationDelay = Math.random() * 0.6 + "s";
    s.style.fontSize = 18 + Math.random() * 22 + "px";
    document.body.appendChild(s);
    setTimeout(() => s.remove(), 3200);
  }
  buzz([60, 40, 60]);
}
function beep() { Sfx.beep(); buzz([200, 100, 200]); }
let wake = null;
async function keepAwake(on) {
  try {
    if (on && navigator.wakeLock) wake = await navigator.wakeLock.request("screen");
    else if (wake) { await wake.release(); wake = null; }
  } catch (e) {}
}
let lastDay = dateKey(new Date());
function checkNewDay() {
  const k = dateKey(new Date());
  if (k === lastDay) return;
  lastDay = k;
  ui.day = todayIdx();
  ui.weekOffset = 0;
  if (!ui.form && !ui.guided) render();
}
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") { checkNewDay(); gTick(); scheduleReminder(); } });
setInterval(checkNewDay, 60000);
function gTick() {
  const g = ui.guided;
  if (!g || !g.end) return;
  const left = Math.ceil((g.end - Date.now()) / 1000);
  if (left <= 0) {
    const b = S.days[ui.day].blocks[g.i];
    const done = logOf(dateOf(ui.day)).done;
    const nxt = S.days[ui.day].blocks.slice(g.i + 1).find((x) => !done[x.id]);
    beep(); toast(`${b.title} done!`);
    say(`Time.${nxt ? " Next up: " + nxt.title + "." : " Great work."}`);
    gAdvance(true); persist(); render();
    return;
  }
  g.remaining = left;
  if (g.total >= 120 && !g.cues.half && left <= g.total / 2) { g.cues.half = true; say("Halfway."); }
  if (g.total >= 180 && !g.cues.min && left <= 60) { g.cues.min = true; say("One minute left."); }
  if (g.total >= 30 && !g.cues.ten && left <= 10) { g.cues.ten = true; say("Ten seconds."); }
  const t = $("[data-gtime]"); if (t) t.textContent = fmtTime(left);
  const r = $("[data-gring]"); if (r) r.setAttribute("stroke-dashoffset", (G_C * (1 - (g.total - left) / g.total)).toFixed(1));
}
setInterval(gTick, 500);

/* ---------- forms ---------- */
function fieldHtml(f) {
  const v = f.value ?? "";
  const lab = `<label for="f-${f.k}">${esc(f.label)}</label>`;
  if (f.type === "textarea") return `<div class="field">${lab}<textarea id="f-${f.k}" name="${f.k}" placeholder="${esc(f.ph || "")}">${esc(v)}</textarea></div>`;
  if (f.type === "select") return `<div class="field">${lab}<select id="f-${f.k}" name="${f.k}">${f.opts.map(([ov, ol]) => `<option value="${esc(ov)}" ${String(ov) === String(v) ? "selected" : ""}>${esc(ol)}</option>`).join("")}</select></div>`;
  if (f.type === "checks") return `<div class="field"><label>${esc(f.label)}</label><div class="group checks">${f.opts.map(([ov, ol]) => `<label class="row"><span class="grow">${esc(ol)}</span><input type="checkbox" name="${f.k}" value="${esc(ov)}" ${(v || []).includes(ov) ? "checked" : ""}></label>`).join("")}</div></div>`;
  if (f.type === "file") return `<div class="field">${lab}<input id="f-${f.k}" type="file" name="${f.k}" accept="${f.accept || "video/*"}"></div>`;
  const t = f.type === "number" ? 'type="text" inputmode="decimal"' : f.type === "url" ? 'type="url" inputmode="url" autocapitalize="off"' : 'type="text"';
  return `<div class="field">${lab}<input id="f-${f.k}" name="${f.k}" ${t} value="${esc(v)}" placeholder="${esc(f.ph || "")}"></div>`;
}
function openForm(o) {
  ui.form = o;
  $("#modal").innerHTML = `<div class="scrim"><div class="sheet" role="dialog" aria-label="${esc(o.title)}">
    <header><button data-a="close">Cancel</button><b>${esc(o.title)}</b><button class="save" data-a="save">Save</button></header>
    <form id="f" onsubmit="return false">${o.fields.map(fieldHtml).join("")}</form>
    ${(o.extra || []).map((x, i) => `<button class="btn gray" data-a="extra" data-i="${i}">${esc(x.label)}</button>`).join("")}
    ${o.del ? `<button class="btn red" data-a="del">${esc(o.delLabel || "Delete")}</button>` : ""}</div></div>`;
}
function closeForm() { ui.form = null; $("#modal").innerHTML = ""; }
function collect() {
  const out = {}; const f = $("#f");
  ui.form.fields.forEach((fd) => {
    if (fd.type === "checks") out[fd.k] = [...f.querySelectorAll(`[name="${fd.k}"]:checked`)].map((x) => x.value);
    else if (fd.type === "file") out[fd.k] = f.elements[fd.k].files[0] || null;
    else out[fd.k] = f.elements[fd.k].value.trim();
  });
  return out;
}
const days7 = () => S.days.map((d) => [d.id, d.name]);

/* ---------- forms for each thing ---------- */
function formBlock(id) {
  const day = S.days[ui.day];
  const idx = day.blocks.findIndex((b) => b.id === id);
  const b = idx >= 0 ? day.blocks[idx] : { title: "", minutes: 5, text: "" };
  const move = (dir) => { const j = idx + dir; if (idx < 0 || j < 0 || j >= day.blocks.length) return; [day.blocks[idx], day.blocks[j]] = [day.blocks[j], day.blocks[idx]]; };
  openForm({
    title: idx >= 0 ? "Edit block" : "New block",
    fields: [{ k: "title", label: "Title", value: b.title, ph: "Shoot" }, { k: "minutes", label: "Minutes", type: "number", value: b.minutes }, { k: "text", label: "What to do", type: "textarea", value: b.text }],
    required: ["title"],
    save(v) {
      const m = Math.max(0, parseInt(v.minutes, 10) || 0);
      if (idx >= 0) Object.assign(day.blocks[idx], { title: v.title, minutes: m, text: v.text });
      else day.blocks.push({ id: uid("b"), title: v.title, minutes: m, text: v.text });
    },
    extra: idx >= 0 ? [{ label: "Move up", fn: () => move(-1) }, { label: "Move down", fn: () => move(1) }] : [],
    del: idx >= 0 ? () => { day.blocks.splice(idx, 1); } : null,
    delLabel: "Delete block",
  });
}
function formDay() {
  const d = S.days[ui.day];
  openForm({
    title: "Edit " + d.name,
    fields: [{ k: "name", label: "Day name", value: d.name }, { k: "theme", label: "Theme", value: d.theme }, { k: "cue", label: "Coaching cue", type: "textarea", value: d.cue }, { k: "videoIds", label: "Videos for this day", type: "checks", opts: S.videos.map((v) => [v.id, `${v.code ? v.code + " · " : ""}${v.title}`]), value: d.videoIds }],
    required: ["name"],
    save(v) { Object.assign(d, { name: v.name, theme: v.theme, cue: v.cue, videoIds: v.videoIds }); },
  });
}
function formVideo(id) {
  const v = S.videos.find((x) => x.id === id) || {};
  const onDays = S.days.filter((d) => d.videoIds.includes(v.id)).map((d) => d.id);
  openForm({
    title: id ? "Edit video" : "Add video",
    fields: [
      { k: "code", label: "Short label", value: v.code ?? "V" + (S.videos.length + 1), ph: "V12" },
      { k: "title", label: "Title", value: v.title, ph: "Drill name" },
      { k: "url", label: "Link (YouTube, Vimeo or any page)", type: "url", value: v.url, ph: "https://" },
      { k: "file", label: v.fileId ? "Replace uploaded clip" : "Or add a clip from this device", type: "file" },
      { k: "note", label: "Notes", type: "textarea", value: v.note },
      { k: "days", label: "Show on these days", type: "checks", opts: days7(), value: onDays },
    ],
    required: ["title"],
    async save(f) {
      let vid = S.videos.find((x) => x.id === id);
      if (!vid) { vid = { id: uid("v") }; S.videos.push(vid); }
      Object.assign(vid, { code: f.code, title: f.title, url: normUrl(f.url), note: f.note });
      if (f.file) { try { await idb.put(vid.id, f.file); vid.fileId = vid.id; } catch (e) { toast("Could not save that clip."); } }
      S.days.forEach((d) => { d.videoIds = d.videoIds.filter((x) => x !== vid.id); if (f.days.includes(d.id)) d.videoIds.push(vid.id); });
    },
    del: id ? async () => {
      S.videos = S.videos.filter((x) => x.id !== id);
      S.days.forEach((d) => (d.videoIds = d.videoIds.filter((x) => x !== id)));
      try { await idb.del(id); } catch (e) {}
      if (ui.openVideo === id) ui.openVideo = null;
    } : null,
    delLabel: "Delete video",
  });
}
function formLink(id) {
  const l = S.links.find((x) => x.id === id) || {};
  openForm({
    title: id ? "Edit website" : "Add website",
    fields: [{ k: "title", label: "Name", value: l.title }, { k: "url", label: "Link", type: "url", value: l.url, ph: "https://" }, { k: "note", label: "Notes", value: l.note }],
    required: ["title", "url"],
    save(f) {
      let x = S.links.find((y) => y.id === id);
      if (!x) { x = { id: uid("l") }; S.links.push(x); }
      Object.assign(x, { title: f.title, url: normUrl(f.url), note: f.note });
    },
    del: id ? () => { S.links = S.links.filter((y) => y.id !== id); } : null,
    delLabel: "Delete website",
  });
}
function formLogDay(date) {
  const lg = logOf(date);
  openForm({
    title: "Log · " + fmtShort(parseKey(date)),
    fields: [
      { k: "event", label: "Session or team event", value: lg.event, ph: "Rens practice, game, solo session" },
      { k: "minutes", label: "Minutes trained (leave empty to use the plan)", type: "number", value: lg.minutes },
      { k: "team", label: "Team practice or game (minutes)", type: "number", value: lg.team },
      { k: "energy", label: "Energy / body feels", type: "select", value: lg.energy ?? "", opts: [["", "Not rated"], [1, "😫 Wiped out"], [2, "😕 Tired"], [3, "😐 Okay"], [4, "🙂 Good"], [5, "🔥 Great"]] },
      { k: "learned", label: "One thing I learned", value: lg.learned },
      { k: "improve", label: "One improvement", value: lg.improve },
      { k: "challenge", label: "One challenge", value: lg.challenge },
    ],
    save(f) { Object.assign(lg, f, { energy: f.energy ? Number(f.energy) : undefined, minutes: f.minutes ? Number(f.minutes) || undefined : undefined, team: f.team ? Number(f.team) || undefined : undefined }); },
  });
}
function weekForm(title, fields, req) {
  const wk = dateKey(addDays(mondayOf(new Date()), ui.weekOffset * 7));
  const w = (S.weekly[wk] ||= {});
  openForm({ title, fields: fields.map(([k, label, type, ph]) => ({ k, label, type: type || "text", value: w[k], ph })), required: req, save(f) { Object.assign(w, f); } });
}
function formReward(id) {
  const r = S.rewards.find((x) => x.id === id) || {};
  openForm({
    title: id ? "Edit reward" : "Add reward",
    fields: [{ k: "title", label: "Reward", value: r.title, ph: "Family movie night" }, { k: "xp", label: "XP needed", type: "number", value: r.xp, ph: "300" }, { k: "note", label: "Notes", value: r.note }],
    required: ["title", "xp"],
    save(f) {
      let x = S.rewards.find((y) => y.id === id);
      if (!x) { x = { id: uid("r") }; S.rewards.push(x); }
      Object.assign(x, { title: f.title, xp: Math.max(0, parseInt(f.xp, 10) || 0), note: f.note });
    },
    del: id ? () => { S.rewards = S.rewards.filter((y) => y.id !== id); } : null,
    delLabel: "Delete reward",
  });
}
function formProfile() {
  const p = S.profile;
  openForm({
    title: "Profile",
    fields: [{ k: "name", label: "Name", value: p.name }, { k: "team", label: "Team", value: p.team }, { k: "league", label: "League / age group", value: p.league }, { k: "number", label: "Jersey number", value: p.number || "" }, { k: "logo", label: "Team logo (choose an image)", type: "file", accept: "image/*" }, { k: "subtitle", label: "Team and level", value: p.subtitle }, { k: "priority", label: "Priority", type: "textarea", value: p.priority }, { k: "why", label: "My Why", type: "textarea", value: p.why, ph: "Why I train" }],
    required: ["name"],
    extra: p.logo ? [{ label: "Remove logo", fn: () => { delete p.logo; } }] : [],
    async save(f) {
      const file = f.logo; delete f.logo;
      Object.assign(p, f);
      if (file) p.logo = await shrinkImage(file);
    },
  });
}
function shrinkImage(file) {
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, 256 / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      res(c.toDataURL("image/png"));
    };
    img.onerror = () => res(undefined);
    img.src = URL.createObjectURL(file);
  });
}
function formNote(id) {
  const n = S.notes.find((x) => x.id === id) || {};
  openForm({
    title: id ? "Edit note" : "Add note",
    fields: [{ k: "title", label: "Title", value: n.title }, { k: "text", label: "Text", type: "textarea", value: n.text }],
    required: ["title"],
    save(f) {
      let x = S.notes.find((y) => y.id === id);
      if (!x) { x = { id: uid("n") }; S.notes.push(x); }
      Object.assign(x, f);
    },
    del: id ? () => { S.notes = S.notes.filter((y) => y.id !== id); } : null,
    delLabel: "Delete note",
  });
}

/* ---------- actions ---------- */
const CHEERS = ["Nice rep!", "Locked in!", "Let's go!", "Strong work!", "That's how it's done!", "Keep it rolling!"];
function xpPop(text) {
  const p = window.__pt || { x: innerWidth / 2, y: innerHeight / 2 };
  const s = document.createElement("div");
  s.className = "xp-pop"; s.textContent = text;
  s.style.left = p.x + "px"; s.style.top = p.y + "px";
  document.body.appendChild(s);
  setTimeout(() => s.remove(), 1100);
}
function skillPointsOn(date) {
  const titles = {}, pts = {};
  S.days.forEach((d) => d.blocks.forEach((b) => (titles[b.id] = b.title.toLowerCase())));
  for (const id in (S.logs[date] || {}).done || {}) {
    const sk = SKILLS.find((s) => s[3].test(titles[id] || ""));
    if (sk) pts[sk[0]] = (pts[sk[0]] || 0) + 10;
  }
  return pts;
}
function buildSummary(date, crossed) {
  const lg = logOf(date);
  const all = skillPoints(), today = skillPointsOn(date);
  const ups = SKILLS.filter(([k]) => skillLevel(all[k] || 0).l > skillLevel((all[k] || 0) - (today[k] || 0)).l)
    .map(([k, name, ic]) => ({ name, ic, lvl: skillLevel(all[k]).l }));
  const total = completeDates().length;
  const now = levelInfo(total), was = levelInfo(total - 1);
  const xp = xpTotal();
  return {
    xpDay: xpOfLog(lg), xp, theme: S.days[ui.day].theme, ups, rewards: crossed,
    levelUp: now.cur[0] !== was.cur[0] ? now.cur : null, level: now,
    week: sessionsInWeek(dateKey(mondayOf(parseKey(date)))), streak: weekStreak(), next: nextReward(xp),
    msg: MESSAGES[(dayOfYear() + 3) % MESSAGES.length],
    cards: PLAYBOOK.filter((c, i) => pbUnlockAt(i) > xp - xpOfLog(lg) && pbUnlockAt(i) <= xp),
    shots: shotTotals(lg), reps: Object.values(lg.reps || {}).reduce((p, q) => p + q, 0),
  };
}
function toggleBlock(id) {
  const day = S.days[ui.day];
  const lg = logOf(dateOf(ui.day));
  const wasComplete = !!lg.complete;
  const before = xpTotal();
  lg.done[id] = !lg.done[id];
  ui.fresh = lg.done[id] ? id : null;
  if (!lg.done[id]) delete lg.done[id];
  lg.complete = day.blocks.length > 0 && day.blocks.every((b) => lg.done[b.id]);
  const gain = xpTotal() - before;
  if (lg.done[id]) Sfx.swish();
  if (gain > 0) {
    xpPop("+" + gain + " XP");
    buzz(15);
    if (!(lg.complete && !wasComplete) && !ui.guided) toast(CHEERS[Math.floor(Math.random() * CHEERS.length)]);
  }
  const crossed = S.rewards.filter((r) => r.xp > before && r.xp <= xpTotal());
  if (lg.complete && !wasComplete) { celebrate(); ui.summary = buildSummary(dateOf(ui.day), crossed); if (ui.summary.levelUp || crossed.length || ui.summary.cards.length) setTimeout(() => Sfx.chime(), 400); }
  else if (crossed.length) setTimeout(() => { celebrate(); toast("Reward unlocked: " + crossed.map((r) => r.title).join(", ")); }, 1200);
}
function download(name, text) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  a.download = name; document.body.appendChild(a); a.click(); a.remove();
}
let confirmReset = false;
const PARENT_BLOCKED = new Set(["toggle", "gStart", "challengeDone", "bodySet", "sleepAdj", "energy", "watchMark", "filmStart", "editReflect", "editSkill", "editLogDay"]);
const ACTIONS = {
  tab: (d) => { ui.tab = d.t; window.scrollTo(0, 0); },
  day: (d) => { ui.day = +d.i; },
  openDay: (d) => { ui.day = +d.i; ui.tab = "today"; window.scrollTo(0, 0); },
  toggle: (d) => toggleBlock(d.id),
  wNext: () => { const n = ui.welcome.name.trim(); if (n) S.profile.name = n; if (ui.welcome.why.trim()) S.profile.why = ui.welcome.why.trim(); ui.welcome.step = 2; },
  wCreate: async () => { try { ui.welcome.code = await Sync.create(); render(); } catch (e) { toast(e.message || "Could not reach the sync service."); } },
  wJoin: () => ACTIONS.syncJoin(),
  wFinish: () => finishWelcome(),
  shareReport: async () => {
    const r = reportData();
    const text = reportText(r);
    try {
      const blob = await reportImage(r);
      const file = new File([blob], `${firstName(S.profile.name)}-week-${r.wk}.png`, { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], text }); return; }
    } catch (e) { if (e && e.name === "AbortError") return; }
    try { if (navigator.share) { await navigator.share({ text }); return; } } catch (e) { if (e && e.name === "AbortError") return; }
    try { await navigator.clipboard.writeText(text); toast("Report copied. Paste it into a message."); } catch (e) { toast("Could not share the report."); }
  },
  watchMark: (d) => {
    const l = logOf(todayKey());
    l.watched ||= {};
    if (l.watched[d.id]) delete l.watched[d.id]; else { l.watched[d.id] = true; xpPop("+5 XP"); toast("Nice. Now put it to work."); }
  },
  watchOpen: (d) => { const l = logOf(todayKey()); l.watched ||= {}; if (!l.watched[d.id]) { l.watched[d.id] = true; toast("Marked watched. +5 XP"); } },
  sumClose: () => { ui.summary = null; },
  prefToggle: (d) => { Prefs[d.k] = !Prefs[d.k]; Prefs.save(); if (Prefs[d.k]) { if (d.k === "sound") { Sfx.unlock(); Sfx.swish(); } if (d.k === "voice") say("Voice cues are on."); if (d.k === "haptic") buzz(40); } },
  noteSeen: () => { try { localStorage.setItem("tristan-note-seen", String(S.note && S.note.ts)); } catch (e) {} },
  noteWrite: () => openForm({
    title: "Note for " + firstName(S.profile.name),
    fields: [{ k: "from", label: "From", value: (S.note && S.note.from) || Prefs.parent || "", ph: "Dad, Mom, Coach" }, { k: "text", label: "Note (leave empty to remove it)", type: "textarea", value: (S.note && S.note.text) || "", ph: "Proud of how you worked on your left hand." }],
    save(f) { S.note = f.text ? { text: f.text, from: f.from, ts: Date.now() } : null; },
  }),
  challengePick: () => {
    const c = (S.weekly[weekKeyNow()] || {}).challenge;
    openForm({
      title: "Weekly challenge",
      fields: [{ k: "pick", label: "Choose one", type: "select", value: c && CHALLENGES.includes(c.text) ? c.text : "", opts: [["", "Write my own below"], ...CHALLENGES.map((t) => [t, t])] }, { k: "own", label: "My own challenge", value: c && !CHALLENGES.includes(c.text) ? c.text : "", ph: "Something I want to do this week" }],
      save(f) { const t = f.own || f.pick; if (!t) { toast("Pick one or write your own."); return false; } const w = (S.weekly[weekKeyNow()] ||= {}); w.challenge = { text: t, done: false }; },
    });
  },
  challengeDone: () => { const w = (S.weekly[weekKeyNow()] ||= {}); if (!w.challenge) return; w.challenge.done = !w.challenge.done; if (w.challenge.done) { celebrate(); Sfx.chime(); toast("Challenge done! +25 XP"); } },
  bodySet: (d) => { const l = logOf(dateOf(ui.day)); l.body = l.body === Number(d.v) ? undefined : Number(d.v); },
  sleepAdj: (d) => { const l = logOf(dateOf(ui.day)); l.sleep = Math.min(14, Math.max(4, (l.sleep ?? 9) + Number(d.d))); },
  filmStart: () => { ui.film = newFilm(); },
  filmClose: () => { ui.film = null; },
  filmNext: () => { ui.film.step = 1; },
  filmScore: (d) => { const f = ui.film; f.scores[f.step - 1] = d.v === "1"; f.step += 1; },
  filmFinish: () => { if (!ui.film.answers[4].trim()) { toast("Write one adjustment first."); return; } ui.film.step = 6; },
  filmSave: () => {
    const f = ui.film, l = logOf(todayKey());
    const was = !!l.film;
    l.film = { score: filmScore(f), total: 5, clip: f.clip, answers: f.answers, ts: Date.now() };
    ui.film = null; celebrate(); Sfx.chime(); toast(was ? "Film study updated." : "Film study done! +20 XP");
  },
  calStart: () => openForm({
    title: "Add to calendar",
    fields: [{ k: "time", label: "Start time (24-hour, like 16:00)", value: Prefs.calTime }, { k: "alarm", label: "Reminder before", type: "select", value: Prefs.calAlarm, opts: [["10", "10 minutes"], ["30", "30 minutes"], ["60", "1 hour"]] }, { k: "weeks", label: "How many weeks", type: "select", value: "4", opts: [["1", "This week"], ["4", "Next 4 weeks"]] }, { k: "sunday", label: "Sunday film session", type: "select", value: "1", opts: [["1", "Include"], ["0", "Skip"]] }],
    required: ["time"],
    async save(f) {
      if (!/^([01]?\d|2[0-3]):[0-5]\d$/.test(f.time)) { toast("Use a time like 16:00."); return false; }
      Prefs.calTime = f.time; Prefs.calAlarm = f.alarm; Prefs.save();
      const { text, count } = buildIcs({ time: f.time, alarm: f.alarm, weeks: Number(f.weeks), sunday: f.sunday === "1" });
      if (!count) { toast("No upcoming sessions to add."); return false; }
      const r = await deliverFile(new File([text], "rens-training.ics", { type: "text/calendar" }));
      if (r !== "cancel") toast(r === "shared" ? `${count} sessions ready. Choose Calendar.` : `${count} sessions downloaded. Open the file to add them.`);
    },
  }),
  remindToggle: async () => {
    if (Prefs.remind) { Prefs.remind = false; Prefs.save(); scheduleReminder(); return; }
    if (!("Notification" in window)) { toast("This browser can't show notifications. Use the calendar reminder instead."); return; }
    let p = Notification.permission;
    if (p === "default") p = await Notification.requestPermission();
    if (p !== "granted") { toast("Notifications are blocked. Allow them in Settings, or use the calendar reminder."); return; }
    Prefs.remind = true; Prefs.save(); scheduleReminder(); toast("Reminder on for " + Prefs.remindTime + " while the app is available."); render();
  },
  remindTime: () => openForm({
    title: "Reminder time",
    fields: [{ k: "t", label: "Time (24-hour, like 16:00)", value: Prefs.remindTime }],
    required: ["t"],
    save(f) { if (!/^([01]?\d|2[0-3]):[0-5]\d$/.test(f.t)) { toast("Use a time like 16:00."); return false; } Prefs.remindTime = f.t; Prefs.save(); scheduleReminder(); },
  }),
  parentSet: () => openForm({
    title: "Family view on this device",
    fields: [{ k: "name", label: "Your name (leave empty to turn off)", value: Prefs.parent, ph: "Your first name, like Jalen" }],
    save(f) {
      Prefs.parent = f.name.trim(); Prefs.save();
      if (Prefs.parent) { ui.tab = "today"; ui.overview = true; Sync.sync(); toast("Family view is on for " + Prefs.parent + "."); } else toast("Family view is off.");
    },
  }),
  ovrOpen: () => { ui.overview = true; Sync.sync(); },
  ovrClose: () => { ui.overview = false; },
  ovrRefresh: () => { Sync.sync(); toast("Checking for new activity…"); },
  cardOpen: () => { ui.card = true; },
  cardClose: () => { ui.card = false; },
  cardShare: async () => {
    try {
      const blob = await cardImage();
      const file = new File([blob], `${firstName(S.profile.name)}-player-card.png`, { type: "image/png" });
      const r = await deliverFile(file);
      if (r === "downloaded") toast("Card saved as a picture.");
    } catch (e) { toast("Could not make the card picture."); }
  },
  chartRange: (d) => { ui.chartRange = d.r; },
  chartSpot: (d) => { ui.chartSpot = ui.chartSpot === d.s ? null : d.s; },
  pbOpen: (d) => { const c = PLAYBOOK[Number(d.i)]; openInfo(c[0], `<div class="pbdetail">${badge("book", "lg")}<p class="pbtip">${esc(c[1])}</p><div class="pbtry"><b>Try this</b><p>${esc(c[2])}</p></div></div>`); },
  cycleRestart: () => { S.profile.cycleStart = dateKey(mondayOf(new Date())); toast("Cycle restarted. This is week 1."); },
  blockInfo: (d) => { ui.openBlocks[d.id] = !ui.openBlocks[d.id]; },
  gStart: () => {
    const day = S.days[ui.day];
    const done = logOf(dateOf(ui.day)).done;
    const i = day.blocks.findIndex((b) => !done[b.id]);
    gStartAt(i < 0 ? 0 : i);
  },
  gFrom: (d) => gStartAt(S.days[ui.day].blocks.findIndex((b) => b.id === d.id)),
  gToggle: () => {
    const g = ui.guided;
    if (g.end) { g.remaining = Math.max(1, Math.ceil((g.end - Date.now()) / 1000)); g.end = null; }
    else {
      const b = S.days[ui.day].blocks[g.i];
      if (!g.started) say(`${b.title}. ${Math.round(g.total / 60)} minute${Math.round(g.total / 60) === 1 ? "" : "s"}. Go.`);
      g.end = Date.now() + g.remaining * 1000; g.started = true;
    }
  },
  gRep: (d) => { const lg = logOf(dateOf(ui.day)); const id = S.days[ui.day].blocks[ui.guided.i].id; lg.reps ||= {}; lg.reps[id] = Math.max(0, (lg.reps[id] || 0) + Number(d.d)); buzz(10); },
  gShot: (d) => { const lg = logOf(dateOf(ui.day)); const s = ui.guided.spot; lg.shots ||= {}; const c = (lg.shots[s] ||= { m: 0, x: 0 }); c[d.r] += 1; buzz(10); if (d.r === "m") Sfx.swish(); },
  gSpot: (d) => { ui.guided.spot = d.s; },
  gDone: () => gAdvance(true),
  gSkip: () => gAdvance(false),
  gClose: () => { ui.guided = null; keepAwake(false); },
  energy: (d) => { const lg = logOf(dateOf(ui.day)); lg.energy = lg.energy === +d.v ? undefined : +d.v; if (lg.energy) toast(["", "Rest up. Tomorrow's a new day.", "Take it easy and recover.", "Solid work.", "Nice! Keep it going.", "That's the energy! 🔥"][lg.energy]); },
  editDay: formDay,
  addBlock: () => formBlock(),
  editBlock: (d) => formBlock(d.id),
  goVideo: (d) => { ui.tab = "videos"; ui.openVideo = d.id; window.scrollTo(0, 0); },
  openVid: (d) => { ui.openVideo = ui.openVideo === d.id ? null : d.id; },
  addVideo: () => formVideo(),
  editVideo: (d) => formVideo(d.id),
  addLink: () => formLink(),
  editLink: (d) => formLink(d.id),
  wkPrev: () => { ui.weekOffset--; },
  wkNext: () => { if (ui.weekOffset < 0) ui.weekOffset++; },
  editLogDay: (d) => formLogDay(d.date),
  editWeekGoals: () => weekForm("Weekly goals", [["priority", "Coach's priority", "textarea"], ["goal", "My goal", "textarea"]]),
  editSkill: () => weekForm("Saturday skill check", [["right", "Right-hand passes on target (of 10)", "number"], ["left", "Left-hand passes on target (of 10)", "number"], ["shoot", "Shots made (of 25)", "number"], ["ft", "Free throws made (of 10)", "number"], ["lost", "Balls lost on cone course", "number"], ["good", "Good game reads", "number"]]),
  editReflect: () => weekForm("Weekly reflection", [["improved", "What improved?"], ["hard", "What was difficult?"], ["fun", "What was fun?"], ["adjust", "Next week's one adjustment"], ["hours", "Organized basketball hours", "number"], ["rest", "Physical rest day"]]),
  editProfile: formProfile,
  addReward: () => formReward(),
  editReward: (d) => formReward(d.id),
  addNote: () => formNote(),
  editNote: (d) => formNote(d.id),
  export: () => { download(`training-backup-${dateKey(new Date())}.json`, JSON.stringify(S, null, 2)); toast("Backup saved to downloads."); },
  syncCreate: async () => {
    toast("Creating your family code…");
    try { await Sync.create(); render(); toast("Sync is on. Join from your other devices with this code."); } catch (e) { toast(e.message || "Could not reach the sync service."); }
  },
  syncJoin: () => openForm({
    title: "Join family",
    fields: [{ k: "code", label: "Family code", value: "", ph: "xxxx-xxxx-xxxx-xxxx-xxxx" }],
    required: ["code"],
    async save(f) {
      try { await Sync.join(f.code); toast("Joined. Your plan and progress are syncing."); } catch (e) { toast(e.message || "Could not join."); }
    },
  }),
  syncShare: async () => {
    const text = Sync.pretty(Sync.code);
    try { if (navigator.share) { await navigator.share({ title: "Training family code", text }); return; } } catch (e) { return; }
    try { await navigator.clipboard.writeText(text); toast("Code copied."); } catch (e) { toast(text); }
  },
  syncNow: () => { Sync.sync(); toast("Syncing…"); },
  syncOff: () => {
    if (!ACTIONS._offArmed) { ACTIONS._offArmed = true; toast("Tap again to turn off sync on this device."); setTimeout(() => (ACTIONS._offArmed = false), 4000); return; }
    ACTIONS._offArmed = false; Sync.off(); toast("Sync is off on this device.");
  },
  share: async () => {
    const file = new File([JSON.stringify(S, null, 2)], `training-backup-${dateKey(new Date())}.json`, { type: "application/json" });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: "Training backup" }); return; }
    } catch (e) { return; }
    download(file.name, JSON.stringify(S, null, 2)); toast("Backup saved to downloads.");
  },
  import: () => {
    const i = document.createElement("input"); i.type = "file"; i.accept = "application/json,.json";
    i.onchange = async () => {
      try {
        const data = JSON.parse(await i.files[0].text());
        if (!Array.isArray(data.days)) throw 0;
        localStorage.setItem(KEY, JSON.stringify(data)); S = load(); toast("Backup restored."); render();
      } catch (e) { toast("That file is not a training backup."); }
    };
    i.click();
  },
  reset: () => {
    if (!confirmReset) { confirmReset = true; toast("Tap Reset again to erase all changes."); setTimeout(() => (confirmReset = false), 4000); return; }
    confirmReset = false;
    try { localStorage.removeItem(KEY); } catch (e) {}
    S = load(); persist(); toast("Plan reset.");
  },
};
let delArmed = false;
document.addEventListener("click", async (e) => {
  window.__pt = { x: e.clientX, y: e.clientY };
  Sfx.unlock();
  if (e.target.classList.contains("scrim")) return closeForm();
  const t = e.target.closest("[data-a]");
  if (!t) return;
  const a = t.dataset.a;
  if (a === "close") return closeForm();
  if (a === "save") {
    const v = collect();
    const miss = (ui.form.required || []).find((k) => !v[k]);
    if (miss) return toast("Please fill in the " + miss + ".");
    const keep = await ui.form.save(v);
    if (keep === false) return;
    closeForm(); persist(); render(); return;
  }
  if (a === "extra") { ui.form.extra[+t.dataset.i].fn(); closeForm(); persist(); render(); return; }
  if (a === "del") {
    if (!delArmed) { delArmed = true; t.textContent = "Tap again to confirm"; setTimeout(() => { delArmed = false; if (t.isConnected) t.textContent = ui.form.delLabel || "Delete"; }, 3000); return; }
    delArmed = false; await ui.form.del(); closeForm(); persist(); render(); return;
  }
  if (Prefs.parent && PARENT_BLOCKED.has(a)) { toast("Family view. This would log training for " + firstName(S.profile.name) + "."); return; }
  if (ACTIONS[a]) { ACTIONS[a](t.dataset); persist(); if (!ui.form) render(); }
});

if (!S.profile.onboarded && Object.keys(S.logs).length === 0 && !Sync.code) ui.welcome = { step: 1, name: S.profile.name, why: S.profile.why };
if (Prefs.parent) ui.overview = true;
render();
scheduleReminder();
Sync.start();
setTimeout(() => { const s = document.getElementById("splash"); if (s) { s.classList.add("gone"); setTimeout(() => s.remove(), 450); } }, 700);
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register("sw.js").then((reg) => {
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") reg.update().catch(() => {}); });
  }).catch(() => {});
  // A new service worker takes over after an update. Offer a reload so this copy of the app catches up.
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController || document.getElementById("update-bar")) return;
    const bar = document.createElement("div");
    bar.id = "update-bar"; bar.setAttribute("role", "status");
    bar.innerHTML = '<span>A new version is ready.</span><button type="button">Update now</button>';
    bar.querySelector("button").onclick = () => location.reload();
    document.body.appendChild(bar);
  });
}
