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
const todayIdx = () => (new Date().getDay() + 6) % 7;

/* ---------- storage ---------- */
function load() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
  if (!s || !Array.isArray(s.days)) s = JSON.parse(JSON.stringify(DEFAULT_DATA));
  s.logs ||= {}; s.weekly ||= {}; s.videos ||= []; s.links ||= []; s.notes ||= [];
  s.profile ||= {};
  s.profile.why ??= "I'm a point guard. I make my teammates better and I get better every single day.";
  s.profile.name ||= "Tristan";
  return s;
}
let S = load();
function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast("Storage is full. Export a backup in Guide."); }
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
const ui = { tab: "today", day: todayIdx(), openVideo: null, weekOffset: 0, timer: null, form: null };
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
const LEVELS = [[0, "Rookie", "🌱"], [5, "Starter", "🏀"], [15, "Playmaker", "🎯"], [30, "Floor General", "🧠"], [60, "All-Star", "⭐"], [100, "Legend", "👑"]];
const dayOfYear = () => Math.floor((new Date() - new Date(new Date().getFullYear(), 0, 0)) / 864e5);

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
    ["🏀", "First session", "Finish one full session.", total >= 1],
    ["🔥", "Five sessions", "Finish 5 sessions.", total >= 5],
    ["🎯", "Ten sessions", "Finish 10 sessions.", total >= 10],
    ["⭐", "Twenty-five sessions", "Finish 25 sessions.", total >= 25],
    ["💪", "Big week", "Finish 6 sessions in one week.", weeks.some((n) => n >= 6)],
    ["📈", "Two-week streak", "4+ sessions two weeks in a row.", streak >= 2],
    ["🏆", "Four-week streak", "Complete a full development cycle.", streak >= 4],
    ["📊", "Skill check logged", "Record a Saturday skill check.", skill],
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

function viewToday() {
  const day = S.days[ui.day];
  const date = dateOf(ui.day);
  const lg = S.logs[date] || { done: {} };
  const done = lg.done || {};
  const doneN = day.blocks.filter((b) => done[b.id]).length;
  const pct = day.blocks.length ? (doneN / day.blocks.length) * 100 : 0;
  const total = completeDates().length;
  const lv = levelInfo(total);
  const hr = new Date().getHours();
  const greet = hr < 12 ? "Good morning" : hr < 18 ? "Good afternoon" : "Good evening";
  const isToday = ui.day === todayIdx();
  const times = blockTimes(day);
  const msg = MESSAGES[dayOfYear() % MESSAGES.length];
  const seg = S.days.map((d, i) => `<button class="${i === ui.day ? "on" : ""} ${i === todayIdx() ? "today" : ""}" data-a="day" data-i="${i}">${esc(d.name.slice(0, 3))}</button>`).join("");
  const vids = day.videoIds.map((id) => S.videos.find((v) => v.id === id)).filter(Boolean);
  const mood = [["😫", 1], ["😕", 2], ["😐", 3], ["🙂", 4], ["🔥", 5]];
  return `
  <h1 class="large">${greet}, ${esc(S.profile.name)}</h1>
  <p class="sub">${esc(msg)}</p>
  <div class="stats">
    <div class="stat"><b>${total}</b><span>Sessions</span></div>
    <div class="stat"><b>${weekStreak()} 🔥</b><span>Week streak</span></div>
    <div class="stat"><b>${lv.cur[2]}</b><span>${esc(lv.cur[1])}</span></div>
  </div>
  <div class="level"><div class="progress"><i style="width:${lv.pct}%"></i></div>
    <p class="small">${lv.next ? `${lv.toGo} more session${lv.toGo === 1 ? "" : "s"} to reach <b>${esc(lv.next[1])}</b> ${lv.next[2]}` : "You reached the top level. Legend."}</p></div>
  <div class="seg">${seg}</div>
  <div class="hero">
    <div class="eyebrow">${isToday ? "Today" : esc(day.name)} · ${fmtShort(parseKey(date))}</div>
    <div class="big">${esc(day.theme)}</div>
    <div class="detail">${doneN} of ${day.blocks.length} blocks done · ${day.blocks.reduce((a, b) => a + (Number(b.minutes) || 0), 0)} min</div>
    <div class="progress"><i style="width:${pct}%"></i></div>
    ${pct === 100 ? `<p class="win">Session complete. Great work, ${esc(S.profile.name)}! 💪</p>` : ""}
  </div>
  ${day.cue ? `<div class="cue"><b>Coaching cue</b><br>${esc(day.cue)}</div>` : ""}
  <h2 class="section">Session <button data-a="editDay">Edit day</button></h2>
  <div class="group">
    ${day.blocks.map((b, i) => {
      const on = !!done[b.id];
      const running = ui.timer && ui.timer.id === b.id;
      return `<div class="row ${on ? "done" : ""}">
        <button class="check ${on ? "on" : ""}" data-a="toggle" data-id="${b.id}" aria-label="Mark ${esc(b.title)} done">${on ? "✓" : ""}</button>
        <div class="grow"><div class="title strong">${esc(b.title)}</div>
          <div class="detail"><span class="pill">${times[i]}</span> ${running ? `<span class="timer" data-timer>${fmtTime(Math.ceil((ui.timer.end - Date.now()) / 1000))}</span>` : ""}</div>
          ${b.text ? `<div class="detail">${esc(b.text)}</div>` : ""}</div>
        <div class="side">
          <button class="play ${running ? "run" : ""}" data-a="timer" data-id="${b.id}" aria-label="Timer">${running ? "■" : "▶"}</button>
          <button class="more" data-a="editBlock" data-id="${b.id}" aria-label="Edit">•••</button>
        </div></div>`;
    }).join("") || `<div class="empty">No blocks yet.</div>`}
  </div>
  <button class="btn gray" data-a="addBlock">Add a block</button>
  ${vids.length ? `<h2 class="section">Videos for today</h2><div class="group"><div class="row"><div class="pills" style="margin:0">${vids.map((v) => `<button class="pill" data-a="goVideo" data-id="${v.id}">${esc(v.code || "▶")} ${esc(v.title)}</button>`).join("")}</div></div></div>` : ""}
  <h2 class="section">How did it feel? <button data-a="editLogDay" data-date="${date}">Add notes</button></h2>
  <div class="group"><div class="row"><div class="emojis grow">${mood.map(([e, v]) => `<button class="${lg.energy === v ? "on" : ""}" data-a="energy" data-v="${v}" aria-label="Energy ${v}">${e}</button>`).join("")}</div></div>
  ${lg.improve || lg.challenge ? `<div class="row"><div class="grow">${lg.improve ? `<div class="detail"><b>Improved:</b> ${esc(lg.improve)}</div>` : ""}${lg.challenge ? `<div class="detail"><b>Challenge:</b> ${esc(lg.challenge)}</div>` : ""}</div></div>` : ""}</div>
  <div class="why"><b>My Why</b><p>${esc(S.profile.why)}</p></div>`;
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
  <p class="small">Team practice, mandatory training and games replace that day's individual session. Do not double up to make up a missed day.</p>`;
}

function viewVideos() {
  const card = (v) => {
    const open = ui.openVideo === v.id;
    const e = v.url ? embed(v.url) : null;
    let player = "";
    if (open) {
      if (v.fileId) player = `<video class="player" controls playsinline data-file="${v.fileId}"></video>`;
      else if (e && e.kind === "iframe") player = `<iframe class="player" src="${esc(e.src)}" allow="fullscreen; picture-in-picture" allowfullscreen loading="lazy"></iframe>`;
      else if (e && e.kind === "video") player = `<video class="player" controls playsinline src="${esc(e.src)}"></video>`;
    }
    return `<div class="row tap-wrap" style="flex-direction:column;align-items:stretch">
      <div style="display:flex;gap:12px;align-items:center" data-a="openVid" data-id="${v.id}">
        <div class="vcode ${v.fileId ? "file" : ""}">${esc(v.code || "▶")}</div>
        <div class="grow"><div class="title strong">${esc(v.title)}</div>${v.note ? `<div class="detail">${esc(v.note)}</div>` : ""}</div>
        <span class="chev">${open ? "⌃" : "›"}</span></div>
      ${open ? `${player}<div class="pills">${v.url ? `<a class="pill blue" href="${esc(v.url)}" target="_blank" rel="noopener">Open on ${esc(host(v.url) || "web")} ↗</a>` : ""}<button class="pill" data-a="editVideo" data-id="${v.id}">Edit</button></div>` : ""}
    </div>`;
  };
  return `
  <h1 class="large">Videos</h1>
  <p class="sub">Watch the clip that matches today's drill.</p>
  <a class="feature" href="https://jr.nba.com/jrnbaathome/" target="_blank" rel="noopener"><b>Jr. NBA at Home</b><span>Free drills and videos you can do anywhere ↗</span></a>
  <h2 class="section">Drill videos <button data-a="addVideo">Add</button></h2>
  <div class="group">${S.videos.map(card).join("") || `<div class="empty">No videos yet. Tap Add to save one.</div>`}</div>
  <h2 class="section">Websites <button data-a="addLink">Add</button></h2>
  <div class="group">${S.links.map((l) => `<div class="row"><div class="grow"><a class="title strong lnk" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.title)} ↗</a>${l.note ? `<div class="detail">${esc(l.note)}</div>` : ""}</div><button data-a="editLink" data-id="${l.id}">Edit</button></div>`).join("") || `<div class="empty">No websites yet.</div>`}</div>
  <p class="small">Tip: paste a YouTube or Vimeo link and it plays right here. You can also add a clip from your phone.</p>`;
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
    return (high ? others.every((o) => v > o) : others.every((o) => v < o)) ? ' <span class="pill blue">🏆 Personal best</span>' : "";
  };
  const val = (k, suf = "") => (w[k] === undefined || w[k] === "" ? "–" : esc(w[k]) + suf);
  const rows = S.days.map((d, i) => {
    const date = dateKey(addDays(mon, i));
    const lg = S.logs[date] || {};
    const e = { 1: "😫", 2: "😕", 3: "😐", 4: "🙂", 5: "🔥" }[lg.energy] || "";
    return `<div class="row tap" data-a="editLogDay" data-date="${date}">
      <div class="check ${lg.complete ? "on" : ""}">${lg.complete ? "✓" : ""}</div>
      <div class="grow"><div class="title strong">${esc(d.name)} <span class="detail" style="display:inline">${fmtShort(addDays(mon, i))}</span></div>
      <div class="detail">${[lg.event, lg.learned && "Learned: " + lg.learned].filter(Boolean).map(esc).join(" · ") || "Tap to log"}</div></div>
      <div style="font-size:22px">${e}</div><span class="chev">›</span></div>`;
  }).join("");
  const ach = achievements();
  return `
  <h1 class="large">Progress</h1>
  <div class="nav-row"><button data-a="wkPrev">‹ Earlier</button><span class="week-title">${isNow ? "This week" : "Week of " + fmtShort(mon)}</span><button data-a="wkNext" ${isNow ? 'disabled style="opacity:.3"' : ""}>Later ›</button></div>
  <h2 class="section">Goals <button data-a="editWeekGoals">Edit</button></h2>
  <div class="group">
    <div class="row"><div class="grow"><div class="detail">Coach's priority</div><div class="title">${esc(w.priority) || "Tap Edit to set one"}</div></div></div>
    <div class="row"><div class="grow"><div class="detail">${esc(S.profile.name)}'s goal</div><div class="title">${esc(w.goal) || "Tap Edit to set one"}</div></div></div></div>
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
  <h2 class="section">Achievements</h2>
  <div class="group">${ach.map(([e, t, d, got]) => `<div class="row" style="opacity:${got ? 1 : 0.4}"><div style="font-size:28px;filter:${got ? "none" : "grayscale(1)"}">${e}</div><div class="grow"><div class="title strong">${t}</div><div class="detail">${d}</div></div>${got ? '<span class="pill blue">Earned</span>' : ""}</div>`).join("")}</div>`;
}

function viewGuide() {
  const p = S.profile;
  return `
  <h1 class="large">Guide</h1>
  <p class="sub">${esc(p.subtitle)}</p>
  <div class="why"><b>My Why</b><p>${esc(p.why)}</p></div>
  <div class="group" style="margin-top:12px"><div class="row"><div class="grow"><div class="detail">Priority</div><div class="title">${esc(p.priority)}</div></div></div>
    <div class="row tap" data-a="editProfile"><div class="grow">Edit profile and My Why</div><span class="chev">›</span></div></div>
  <h2 class="section">The plan <button data-a="addNote">Add</button></h2>
  <div class="group">${S.notes.map((n) => `<div class="row tap" data-a="editNote" data-id="${n.id}"><div class="grow"><div class="title strong">${esc(n.title)}</div><div class="detail" style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${esc(n.text)}</div></div><span class="chev">›</span></div>`).join("")}</div>
  <h2 class="section">Your data</h2>
  <div class="group">
    <div class="row tap" data-a="export"><div class="grow">Export backup</div><span class="chev">›</span></div>
    <div class="row tap" data-a="import"><div class="grow">Import backup</div><span class="chev">›</span></div>
    <div class="row tap" data-a="reset"><div class="grow" style="color:var(--red)">Reset to original plan</div></div></div>
  <p class="small">Everything is saved on this device. Uploaded video clips stay on this device and are not part of the backup file. Install: in Safari tap Share, then Add to Home Screen.</p>`;
}

/* ---------- render ---------- */
function render() {
  const y = window.scrollY;
  $("#app").innerHTML = { today: viewToday, week: viewWeek, videos: viewVideos, log: viewLog, guide: viewGuide }[ui.tab]();
  $("#tabs").innerHTML = TABS.map(([k, l]) => `<button class="${ui.tab === k ? "on" : ""}" data-a="tab" data-t="${k}"><svg viewBox="0 0 24 24">${ICONS[k]}</svg>${l}</button>`).join("");
  window.scrollTo(0, y);
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
  if (navigator.vibrate) navigator.vibrate([60, 40, 60]);
}
function beep() {
  try {
    const c = new (window.AudioContext || window.webkitAudioContext)();
    const o = c.createOscillator(); const g = c.createGain();
    o.connect(g); g.connect(c.destination); o.frequency.value = 880; g.gain.value = 0.15;
    o.start(); o.stop(c.currentTime + 0.35);
  } catch (e) {}
  if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
}
let wake = null;
async function keepAwake(on) {
  try {
    if (on && navigator.wakeLock) wake = await navigator.wakeLock.request("screen");
    else if (wake) { await wake.release(); wake = null; }
  } catch (e) {}
}
setInterval(() => {
  if (!ui.timer) return;
  const left = Math.ceil((ui.timer.end - Date.now()) / 1000);
  if (left <= 0) {
    const b = S.days[ui.day].blocks.find((x) => x.id === ui.timer.id);
    ui.timer = null; keepAwake(false); beep(); toast(`${b ? b.title : "Block"} time is up!`); render();
    return;
  }
  const el = $("[data-timer]");
  if (el) el.textContent = fmtTime(left);
}, 500);

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
      { k: "minutes", label: "Minutes trained", type: "number", value: lg.minutes },
      { k: "energy", label: "Energy / body feels", type: "select", value: lg.energy ?? "", opts: [["", "Not rated"], [1, "😫 Wiped out"], [2, "😕 Tired"], [3, "😐 Okay"], [4, "🙂 Good"], [5, "🔥 Great"]] },
      { k: "learned", label: "One thing I learned", value: lg.learned },
      { k: "improve", label: "One improvement", value: lg.improve },
      { k: "challenge", label: "One challenge", value: lg.challenge },
    ],
    save(f) { Object.assign(lg, f, { energy: f.energy ? Number(f.energy) : undefined }); },
  });
}
function weekForm(title, fields, req) {
  const wk = dateKey(addDays(mondayOf(new Date()), ui.weekOffset * 7));
  const w = (S.weekly[wk] ||= {});
  openForm({ title, fields: fields.map(([k, label, type, ph]) => ({ k, label, type: type || "text", value: w[k], ph })), required: req, save(f) { Object.assign(w, f); } });
}
function formProfile() {
  const p = S.profile;
  openForm({
    title: "Profile",
    fields: [{ k: "name", label: "Name", value: p.name }, { k: "subtitle", label: "Team and level", value: p.subtitle }, { k: "priority", label: "Priority", type: "textarea", value: p.priority }, { k: "why", label: "My Why", type: "textarea", value: p.why, ph: "Why I train" }],
    required: ["name"],
    save(f) { Object.assign(p, f); },
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
function toggleBlock(id) {
  const day = S.days[ui.day];
  const lg = logOf(dateOf(ui.day));
  const wasComplete = !!lg.complete;
  lg.done[id] = !lg.done[id];
  if (!lg.done[id]) delete lg.done[id];
  lg.complete = day.blocks.length > 0 && day.blocks.every((b) => lg.done[b.id]);
  if (lg.complete && !wasComplete) { celebrate(); toast("Session complete! 💪"); }
}
function download(name, text) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  a.download = name; document.body.appendChild(a); a.click(); a.remove();
}
let confirmReset = false;
const ACTIONS = {
  tab: (d) => { ui.tab = d.t; window.scrollTo(0, 0); },
  day: (d) => { ui.day = +d.i; },
  openDay: (d) => { ui.day = +d.i; ui.tab = "today"; window.scrollTo(0, 0); },
  toggle: (d) => toggleBlock(d.id),
  timer: (d) => {
    if (ui.timer && ui.timer.id === d.id) { ui.timer = null; keepAwake(false); return; }
    const b = S.days[ui.day].blocks.find((x) => x.id === d.id);
    ui.timer = { id: d.id, end: Date.now() + (Number(b.minutes) || 1) * 60000 }; keepAwake(true);
  },
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
  addNote: () => formNote(),
  editNote: (d) => formNote(d.id),
  export: () => { download(`training-backup-${dateKey(new Date())}.json`, JSON.stringify(S, null, 2)); toast("Backup saved to downloads."); },
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
  if (e.target.classList.contains("scrim")) return closeForm();
  const t = e.target.closest("[data-a]");
  if (!t) return;
  const a = t.dataset.a;
  if (a === "close") return closeForm();
  if (a === "save") {
    const v = collect();
    const miss = (ui.form.required || []).find((k) => !v[k]);
    if (miss) return toast("Please fill in the " + miss + ".");
    await ui.form.save(v); closeForm(); persist(); render(); return;
  }
  if (a === "extra") { ui.form.extra[+t.dataset.i].fn(); closeForm(); persist(); render(); return; }
  if (a === "del") {
    if (!delArmed) { delArmed = true; t.textContent = "Tap again to confirm"; setTimeout(() => { delArmed = false; if (t.isConnected) t.textContent = ui.form.delLabel || "Delete"; }, 3000); return; }
    delArmed = false; await ui.form.del(); closeForm(); persist(); render(); return;
  }
  if (ACTIONS[a]) { ACTIONS[a](t.dataset); persist(); if (!ui.form) render(); }
});

render();
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("sw.js").catch(() => {});
