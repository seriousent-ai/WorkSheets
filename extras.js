"use strict";
/* Phase 7 features: game log, team schedule, recovery score, monthly challenge,
   family recap, clip compare and the read-only coach view.
   Loaded before app.js. Everything here is called later, after app.js has run. */

const num = (v) => (v === "" || v == null || isNaN(Number(v)) ? undefined : Number(v));
const clockText = (t) => { if (!t) return ""; const [h, m] = t.split(":").map(Number); return `${((h + 11) % 12) + 1}:${pad(m)} ${h >= 12 ? "PM" : "AM"}`; };
const daysUntil = (ds) => { const n = new Date(); return Math.round((parseKey(ds) - new Date(n.getFullYear(), n.getMonth(), n.getDate())) / 864e5); };
const whenText = (ds) => { const d = daysUntil(ds); return d === 0 ? "Today" : d === 1 ? "Tomorrow" : d > 1 ? `In ${d} days` : fmtShort(parseKey(ds)); };

/* ---------- game log ---------- */
const GAME_XP = 15;
function gameStats() {
  const g = [...(S.games || [])].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const sum = (k) => g.reduce((p, x) => p + (Number(x[k]) || 0), 0);
  const ratioOf = (x) => ((Number(x.tov) || 0) ? (Number(x.ast) || 0) / Number(x.tov) : Number(x.ast) || 0);
  const ast = sum("ast"), tov = sum("tov"), n = g.length;
  return { g, n, pts: n ? sum("pts") / n : 0, ast: n ? ast / n : 0, tov: n ? tov / n : 0, ratio: tov ? ast / tov : ast, ratios: g.map(ratioOf) };
}
function gamesHtml() {
  const st = gameStats();
  const rows = [...st.g].reverse().slice(0, 8).map((x) => {
    const bits = [x.pts !== undefined && x.pts + " pts", x.ast !== undefined && x.ast + " ast", x.tov !== undefined && x.tov + " TO", x.stl !== undefined && x.stl + " stl"].filter(Boolean).join(" · ");
    return `<div class="row tap" data-a="editGame" data-id="${x.id}"><div class="grow"><div class="title strong">${x.opp ? "vs " + esc(x.opp) : "Game"} <span class="detail" style="display:inline">${fmtShort(parseKey(x.date))}</span>${x.result ? ` <span class="pill ${x.result === "W" ? "green" : ""}">${x.result === "W" ? "Win" : "Loss"}</span>` : ""}</div><div class="detail">${esc(bits) || "Tap to add stats"}${x.good ? " · " + esc(x.good) : ""}</div></div><span class="chev">›</span></div>`;
  }).join("");
  const top = st.n
    ? `<div class="row"><div class="grow"><div class="title strong">Assist to turnover</div><div class="detail">Higher is better. ${st.n} game${st.n > 1 ? "s" : ""} logged.</div></div>${st.ratios.length > 1 ? spark(st.ratios.slice(-8), Math.max(4, ...st.ratios), true) : ""}<div class="tval">${st.ratio.toFixed(1)}</div></div>
       <div class="row"><div class="grow">Per game</div><div class="detail">${st.pts.toFixed(1)} pts · ${st.ast.toFixed(1)} ast · ${st.tov.toFixed(1)} TO</div></div>`
    : "";
  return `<h2 class="section">Games <button data-a="addGame">Add</button></h2>
  <div class="group">${top}${rows || '<div class="empty">After a Rens game, log points, assists and turnovers. +15 XP each. The assist to turnover ratio is the point guard number.</div>'}</div>`;
}
function formGame(id) {
  const g = (S.games || []).find((x) => x.id === id) || {};
  openForm({
    title: id ? "Edit game" : "Log a game",
    fields: [
      { k: "date", label: "Date", type: "date", value: g.date || dateKey(new Date()) },
      { k: "opp", label: "Opponent", value: g.opp, ph: "Team name" },
      { k: "result", label: "Result", type: "select", value: g.result || "", opts: [["", "Not recorded"], ["W", "Win"], ["L", "Loss"]] },
      { k: "pts", label: "Points", type: "number", value: g.pts },
      { k: "ast", label: "Assists", type: "number", value: g.ast },
      { k: "tov", label: "Turnovers", type: "number", value: g.tov },
      { k: "stl", label: "Steals", type: "number", value: g.stl },
      { k: "good", label: "One thing I did well", type: "textarea", value: g.good, ph: "Found the open man on the wing." },
    ],
    required: ["date"],
    save(f) {
      S.games ||= [];
      let o = S.games.find((x) => x.id === id);
      if (!o) { o = { id: uid("g") }; S.games.push(o); }
      Object.assign(o, { date: f.date, opp: f.opp, result: f.result, pts: num(f.pts), ast: num(f.ast), tov: num(f.tov), stl: num(f.stl), good: f.good });
    },
    del: id ? () => { S.games = S.games.filter((x) => x.id !== id); } : null,
    delLabel: "Delete game",
  });
}

/* ---------- team schedule ---------- */
const EVENT_TYPES = [["practice", "Team practice", 90], ["game", "Game", 60], ["other", "Other", 60]];
const eventsSorted = () => [...(S.events || [])].sort((a, b) => ((a.date + (a.time || "")) < (b.date + (b.time || "")) ? -1 : 1));
const upcomingEvents = (n) => eventsSorted().filter((e) => daysUntil(e.date) >= 0).slice(0, n);
function eventMinutes(ds) {
  const l = S.logs[ds];
  if (l && l.team) return 0;
  return (S.events || []).filter((e) => e.date === ds).reduce((p, e) => p + (Number(e.minutes) || (EVENT_TYPES.find((t) => t[0] === e.type) || [0, 0, 60])[2]), 0);
}
function scheduleHtml() {
  const list = upcomingEvents(8);
  return `<h2 class="section">Team schedule <button data-a="addEvent">Add</button></h2>
  <div class="group">${list.map((e) => `<div class="row tap" data-a="editEvent" data-id="${e.id}"><div class="grow"><div class="title strong">${esc(e.title || (EVENT_TYPES.find((t) => t[0] === e.type) || [0, "Event"])[1])} <span class="pill ${e.type === "game" ? "blue" : ""}">${e.type === "game" ? "Game" : e.type === "practice" ? "Practice" : "Event"}</span></div><div class="detail">${whenText(e.date)}${e.time ? " · " + clockText(e.time) : ""}${e.place ? " · " + esc(e.place) : ""}</div></div><span class="chev">›</span></div>`).join("") || '<div class="empty">Add Rens practices and games. Today will show what is coming, and the day before a game gets a light session.</div>'}</div>
  <p class="small">Scheduled events count toward the weekly 10-hour limit until you log the real minutes for that day.</p>`;
}
function eventBanner() {
  const nx = upcomingEvents(6).find((e) => daysUntil(e.date) <= 7);
  if (!nx) return "";
  const d = daysUntil(nx.date);
  const name = nx.title || (nx.type === "game" ? "Game" : "Team practice");
  let tip = "";
  if (nx.type === "game" && d === 1) tip = "Game tomorrow. Keep today light: handle and shooting only, about 35 minutes, and get to bed early.";
  else if (nx.type === "game" && d === 0) tip = "Game day. Warm up, drink water, and trust your training.";
  else if (nx.type === "practice" && d === 0) tip = "Team practice replaces today's individual session.";
  return `<div class="evt ${nx.type}"><b>${esc(name)}</b><span>${whenText(nx.date)}${nx.time ? " at " + clockText(nx.time) : ""}${nx.place ? " · " + esc(nx.place) : ""}</span>${tip ? `<p>${esc(tip)}</p>` : ""}</div>`;
}
function formEvent(id) {
  const e = (S.events || []).find((x) => x.id === id) || {};
  openForm({
    title: id ? "Edit event" : "Add to team schedule",
    fields: [
      { k: "type", label: "What is it?", type: "select", value: e.type || "practice", opts: EVENT_TYPES.map((t) => [t[0], t[1]]) },
      { k: "title", label: "Name (optional)", value: e.title, ph: "vs Harlem" },
      { k: "date", label: "Date", type: "date", value: e.date || dateKey(new Date()) },
      { k: "time", label: "Start time", type: "time", value: e.time },
      { k: "place", label: "Place", value: e.place, ph: "Gym or court" },
      { k: "minutes", label: "Minutes (counts toward the weekly limit)", type: "number", value: e.minutes, ph: "90" },
    ],
    required: ["date"],
    save(f) {
      S.events ||= [];
      let o = S.events.find((x) => x.id === id);
      if (!o) { o = { id: uid("e") }; S.events.push(o); }
      Object.assign(o, { type: f.type, title: f.title, date: f.date, time: f.time, place: f.place, minutes: num(f.minutes) });
    },
    del: id ? () => { S.events = S.events.filter((x) => x.id !== id); } : null,
    delLabel: "Delete event",
  });
}

/* ---------- recovery ---------- */
function recoveryInfo() {
  const days = [];
  for (let i = 0; i < 3; i++) {
    const l = S.logs[dateKey(addDays(new Date(), -i))];
    if (l && (l.sleep || l.body || l.energy)) days.push(l);
  }
  if (!days.length) return null;
  const scores = days.map((l) => {
    let got = 0, max = 0;
    if (l.sleep) { got += (Math.min(l.sleep, 10) / 10) * 50; max += 50; }
    if (l.body) { got += { 1: 30, 2: 20, 3: 5 }[l.body]; max += 30; }
    if (l.energy) { got += (l.energy / 5) * 20; max += 20; }
    return (got / max) * 100;
  });
  const score = Math.round(scores.reduce((p, s, i) => p + s * (i === 0 ? 2 : 1), 0) / (scores.length + 1));
  const sleeps = days.map((l) => l.sleep).filter(Boolean);
  const avgSleep = sleeps.length ? sleeps.reduce((p, q) => p + q, 0) / sleeps.length : null;
  let nudge = "";
  if (days.length > 1 && days[0].body === 3 && days[1].body === 3) nudge = "Two sore days in a row. Take a full rest day and tell a parent or coach.";
  else if (avgSleep && avgSleep < 8.5) nudge = "Sleep has been short. Aim for 9 hours tonight.";
  else if (score >= 75) nudge = "Recovered and ready to train.";
  else if (score < 50) nudge = "Take it easy today. A lighter session is fine.";
  return { score, nudge, label: score >= 75 ? "Ready" : score >= 50 ? "Steady" : "Rest up" };
}
function recoveryCard() {
  const r = recoveryInfo();
  if (!r) return "";
  return `<div class="recov"><div class="hrs-top"><b>Recovery</b><span>${r.score} · ${r.label}</span></div><div class="progress"><i style="width:${r.score}%"></i></div>${r.nudge ? `<p>${esc(r.nudge)}</p>` : ""}</div>`;
}

/* ---------- monthly challenge ---------- */
const MONTHLY_PRESETS = ["30 days of left-hand dribbling", "30 days of free throws, 10 a day", "30 days of wall passes, 20 a day", "30 days of watching one clip and naming the read"];
const monthlyDays = (m) => Object.keys(m.done || {}).length;
function monthlyElapsed(m) { const n = new Date(); return Math.round((new Date(n.getFullYear(), n.getMonth(), n.getDate()) - parseKey(m.start)) / 864e5); }
function settleMonthly() {
  const m = S.monthly;
  if (!m || monthlyElapsed(m) < m.days) return false;
  const done = monthlyDays(m);
  S.badges ||= [];
  S.badges.push({ id: uid("b"), title: m.title, date: dateKey(addDays(parseKey(m.start), m.days - 1)), days: m.days, done, earned: done >= Math.ceil(m.days * 0.8) });
  S.monthly = null;
  return true;
}
const monthlyXp = () => (S.badges || []).reduce((p, b) => p + b.done * 5 + (b.earned ? 100 : 0), 0) + (S.monthly ? monthlyDays(S.monthly) * 5 : 0);
const gamesXp = () => (S.games || []).length * GAME_XP;
function monthlyCard() {
  const m = S.monthly;
  const last = (S.badges || [])[(S.badges || []).length - 1];
  if (!m) {
    return `<h2 class="section">Monthly challenge</h2><div class="group">
      ${last ? `<div class="row">${badge(last.earned ? "trophy" : "flag", last.earned ? "" : "off")}<div class="grow"><div class="title strong">${esc(last.title)}</div><div class="detail">${last.earned ? "Badge earned. " : "Finished. "}${last.done} of ${last.days} days${last.earned ? ", +100 XP" : ""}</div></div></div>` : ""}
      <div class="row tap" data-a="monthlyStart"><div class="grow"><div class="title strong">Start a monthly challenge</div><div class="detail">Pick one habit and do it a little every day. Earn a badge for finishing 80 percent of the days.</div></div><span class="chev">›</span></div></div>`;
  }
  const el = monthlyElapsed(m), today = dateKey(new Date());
  const doneToday = !!m.done[today];
  const dots = Array.from({ length: m.days }, (_, i) => { const k = dateKey(addDays(parseKey(m.start), i)); return `<i class="${m.done[k] ? "on" : ""} ${i === el ? "now" : ""}" title="${fmtShort(parseKey(k))}"></i>`; }).join("");
  return `<h2 class="section">Monthly challenge</h2><div class="group"><div class="row mchal"><div class="grow"><div class="title strong">${esc(m.title)}</div><div class="detail">Day ${Math.min(m.days, el + 1)} of ${m.days} · ${monthlyDays(m)} done</div><div class="mdots" aria-hidden="true">${dots}</div></div>
    <button class="chip ${doneToday ? "on" : ""}" data-a="monthlyDone" aria-pressed="${doneToday}">${doneToday ? "Done today" : "Mark today"}</button></div>
    <div class="row tap" data-a="monthlyStop"><div class="grow" style="color:var(--red-text)">End this challenge</div></div></div>`;
}
function formMonthly() {
  openForm({
    title: "Monthly challenge",
    fields: [
      { k: "preset", label: "Pick a habit", type: "select", value: MONTHLY_PRESETS[0], opts: [...MONTHLY_PRESETS.map((p) => [p, p]), ["", "Write my own below"]] },
      { k: "custom", label: "Or your own habit", ph: "30 days of weak-hand layups" },
      { k: "days", label: "How long", type: "select", value: "30", opts: [["14", "14 days"], ["30", "30 days"]] },
    ],
    save(f) {
      const title = f.custom || f.preset;
      if (!title) { toast("Pick a habit or write your own."); return false; }
      S.monthly = { id: uid("m"), title, start: dateKey(new Date()), days: Number(f.days), done: {} };
    },
  });
}

/* ---------- family recap picture ---------- */
function recapData() {
  const r = reportData();
  const first = firstName(S.profile.name);
  const lines = [];
  const wk = dateKey(mondayOf(new Date()));
  if (r.sessions >= 4) lines.push(`${r.sessions} sessions finished this week`);
  const w = S.weekly[wk] || {};
  if (w.challenge && w.challenge.done) lines.push("Finished the weekly challenge");
  const films = Object.keys(S.logs).filter((k) => dateKey(mondayOf(parseKey(k))) === wk && S.logs[k].film);
  if (films.length) lines.push("Did film study");
  const gm = (S.games || []).filter((g) => dateKey(mondayOf(parseKey(g.date))) === wk);
  if (gm.length) lines.push(`Played ${gm.length} game${gm.length > 1 ? "s" : ""}`);
  const st = weekStreak();
  if (st >= 2) lines.push(`${st}-week training streak`);
  const best = lines[0] || `Showed up and kept learning, ${first}`;
  return { r, first, lines, best, level: levelInfo(completeDates().length).cur[1] };
}
async function recapImage(d) {
  const c = document.createElement("canvas");
  c.width = 1080; c.height = 1350;
  const g = c.getContext("2d");
  const bg = g.createLinearGradient(0, 0, 0, 1350);
  bg.addColorStop(0, "#1d3a6e"); bg.addColorStop(1, "#0b1122");
  g.fillStyle = bg; g.fillRect(0, 0, 1080, 1350);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = S.profile.logo || "icons/team-logo.png"; });
    g.drawImage(img, 70, 70, 130, 130);
  } catch (e) {}
  const t = (s, x, y, size, color, weight = 700, align = "left") => { g.font = `${weight} ${size}px -apple-system, "SF Pro Display", Helvetica, Arial, sans-serif`; g.fillStyle = color; g.textAlign = align; g.fillText(s, x, y); };
  t(S.profile.team, 1010, 130, 54, "#ffffff", 700, "right");
  t(S.profile.league, 1010, 182, 34, "rgba(255,255,255,.7)", 500, "right");
  t("Proud of this week", 70, 360, 80, "#ffffff");
  t(`${d.first} · ${d.level}`, 70, 420, 40, "#ffb340", 600);
  const card = (x, y, big, label) => { g.fillStyle = "rgba(255,255,255,.09)"; g.beginPath(); g.roundRect(x, y, 460, 230, 34); g.fill(); t(String(big), x + 40, y + 125, 100, "#ffb340", 800); t(label, x + 40, y + 185, 34, "rgba(255,255,255,.8)", 500); };
  card(70, 490, `${d.r.sessions}/${d.r.goal}`, "Sessions finished");
  card(550, 490, d.r.xp, "XP earned");
  t("Moments to celebrate", 70, 830, 42, "#ffffff");
  let y = 830;
  (d.lines.length ? d.lines : [d.best]).slice(0, 4).forEach((l) => { y += 76; g.fillStyle = "#ffb340"; g.beginPath(); g.arc(84, y - 12, 10, 0, 7); g.fill(); t(l, 116, y, 40, "rgba(255,255,255,.92)", 500); });
  t("Cheering you on, from the whole family", 540, 1250, 36, "rgba(255,255,255,.75)", 600, "center");
  t("Made with the NY Rens training app", 540, 1310, 28, "rgba(255,255,255,.5)", 500, "center");
  return new Promise((res) => c.toBlob(res, "image/png"));
}

/* ---------- clips and compare ---------- */
const playable = () => S.videos.filter((v) => v.fileId || (v.url && /\.(mp4|webm|mov|m4v)(\?|$)/i.test(v.url)));
function clipsHtml() {
  return `<div class="clips"><label class="feature" for="clip-in"><b>Film a drill</b><span>Record or pick a clip of yourself</span></label><input id="clip-in" type="file" accept="video/*" capture="environment" hidden>
    <button class="feature" data-a="cmpOpen"><b>Compare clips</b><span>Two clips side by side, slow motion, draw</span></button></div>`;
}
let cmpKey = "";
function renderCompare() {
  const el = document.getElementById("extra");
  if (!el) return;
  const c = ui.compare;
  if (!c) { if (cmpKey) { el.innerHTML = ""; cmpKey = ""; } return; }
  const list = playable();
  const key = [c.a, c.b, list.length].join("|");
  if (key === cmpKey) return;
  cmpKey = key;
  const opt = (sel) => list.map((v) => `<option value="${v.id}" ${v.id === sel ? "selected" : ""}>${esc(v.code ? v.code + " " : "")}${esc(v.title)}</option>`).join("");
  const panel = (side, sel) => `<div class="cmp-panel"><select id="cmp-${side}" data-cmp-sel="${side}" aria-label="Clip ${side.toUpperCase()}">${opt(sel)}</select><div class="cmp-stage"><video id="cmp-v-${side}" playsinline muted></video><canvas id="cmp-c-${side}"></canvas></div></div>`;
  el.innerHTML = `<div class="cmp" role="dialog" aria-label="Compare clips"><header class="ovr-top"><button data-a="cmpClose">Done</button><b>Compare clips</b><button data-a="cmpClear">Clear drawing</button></header>
    ${list.length < 1 ? `<p class="small">Add a clip first. Tap Film a drill, or use Add video and choose a clip from this device. Links to YouTube or other sites cannot be compared side by side.</p>` : `${panel("a", c.a)}${panel("b", c.b)}
    <div class="cmp-bar"><button data-a="cmpPlay" id="cmp-play">Play both</button><button data-a="cmpStep" data-d="-1" aria-label="Back one frame">‹ Frame</button><button data-a="cmpStep" data-d="1" aria-label="Forward one frame">Frame ›</button><button data-a="cmpSync">Match B to A</button></div>
    <div class="cmp-bar"><span>Speed</span>${[0.25, 0.5, 1].map((r) => `<button data-a="cmpRate" data-r="${r}" class="${c.rate === r ? "on" : ""}">${r === 1 ? "Normal" : r + "x"}</button>`).join("")}<button data-a="cmpDraw" class="${c.draw ? "on" : ""}">Draw</button></div>
    <input id="cmp-seek" type="range" min="0" max="1000" value="0" aria-label="Scrub both clips">
    <p class="small">Frame steps assume 30 frames a second. Pause, turn on Draw, and trace a line with your finger to check a stance or an angle.</p>`}</div>`;
  if (list.length) { ["a", "b"].forEach((s) => cmpLoad(s)); cmpWire(); }
}
async function cmpLoad(side) {
  const v = S.videos.find((x) => x.id === ui.compare[side]);
  const el = document.getElementById("cmp-v-" + side);
  if (!v || !el) return;
  try {
    if (v.fileId) { const b = await idb.get(v.fileId); if (b) el.src = URL.createObjectURL(b); }
    else el.src = v.url;
  } catch (e) {}
  el.playbackRate = ui.compare.rate;
  el.onloadedmetadata = () => { const cv = document.getElementById("cmp-c-" + side); if (cv) { cv.width = el.clientWidth; cv.height = el.clientHeight; } };
}
function cmpWire() {
  const vids = () => ["a", "b"].map((s) => document.getElementById("cmp-v-" + s)).filter(Boolean);
  document.querySelectorAll("[data-cmp-sel]").forEach((s) => (s.onchange = () => { ui.compare[s.dataset.cmpSel] = s.value; cmpKey = ""; renderCompare(); }));
  const seek = document.getElementById("cmp-seek");
  if (seek) seek.oninput = () => { const a = document.getElementById("cmp-v-a"); if (!a || !a.duration) return; const t = (seek.value / 1000) * a.duration; vids().forEach((v) => { v.currentTime = Math.min(t, v.duration || t); }); };
  ["a", "b"].forEach((s) => {
    const cv = document.getElementById("cmp-c-" + s);
    if (!cv) return;
    let down = false;
    const pt = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * (cv.width / r.width), (e.clientY - r.top) * (cv.height / r.height)]; };
    cv.onpointerdown = (e) => { if (!ui.compare.draw) return; down = true; cv.setPointerCapture(e.pointerId); const g = cv.getContext("2d"); g.strokeStyle = "#ffb340"; g.lineWidth = 4; g.lineCap = "round"; g.beginPath(); g.moveTo(...pt(e)); };
    cv.onpointermove = (e) => { if (!down) return; const g = cv.getContext("2d"); g.lineTo(...pt(e)); g.stroke(); };
    cv.onpointerup = () => { down = false; };
  });
}
const cmpVids = () => ["a", "b"].map((s) => document.getElementById("cmp-v-" + s)).filter(Boolean);
document.addEventListener("change", async (e) => {
  if (!e.target || e.target.id !== "clip-in") return;
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  const id = uid("v");
  try { await idb.put(id, f); } catch (err) { toast("Could not save that clip."); return; }
  S.videos.push({ id, code: "Me", title: "My clip " + fmtShort(new Date()), fileId: id, note: "Filmed in the app", url: "" });
  persist(); render();
  toast("Saved to Videos. Use Compare clips to watch it next to another clip.");
});

/* ---------- coach view (read only, one page) ---------- */
const Coach = {
  lastHash: "",
  base() { return Sync.base(); },
  link(code) { return location.origin + location.pathname.replace(/[^/]*$/, "") + "?coach=" + code; },
  snapshot() {
    const total = completeDates().length, lv = levelInfo(total), { r, ovr } = ratings();
    const wk = dateKey(mondayOf(new Date()));
    const weeks = [3, 2, 1, 0].map((i) => sessionsInWeek(dateKey(addDays(mondayOf(new Date()), -7 * i))));
    const st = gameStats();
    return {
      name: firstName(S.profile.name), team: S.profile.team, league: S.profile.league, level: lv.cur[1], sessions: total, streak: weekStreak(),
      week: { done: sessionsInWeek(wk), goal: Math.min(6, S.days.length) }, weeks, ovr,
      skills: SKILLS.map(([k, name]) => [name, r[k]]),
      priority: (S.weekly[wk] || {}).priority || S.profile.priority || "",
      games: st.g.slice(-5).map((x) => ({ date: x.date, opp: x.opp || "", pts: x.pts, ast: x.ast, tov: x.tov })), ratio: st.n ? Math.round(st.ratio * 10) / 10 : null,
    };
  },
  async publish(force) {
    const code = S.profile.coachCode;
    if (!code || !Sync.ready) return;
    const json = JSON.stringify(this.snapshot());
    const h = Sync.hash(json);
    if (!force && h === this.lastHash) return;
    const r = await fetch(`${this.base()}/families/${code}/items/summary${Sync.key()}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields: { json: { stringValue: json }, ts: { integerValue: String(Date.now()) } } }),
    });
    if (!r.ok) throw new Error("put " + r.status);
    this.lastHash = h;
  },
  async remove(code) {
    try { await fetch(`${this.base()}/families/${code}/items/summary${Sync.key()}`, { method: "DELETE" }); } catch (e) {}
  },
  async fetchSummary(code) {
    const r = await fetch(`${this.base()}/families/${code}/items/summary${Sync.key()}`);
    if (r.status === 404) return null;
    if (!r.ok) throw new Error("get " + r.status);
    const d = await r.json();
    return { data: JSON.parse(d.fields.json.stringValue), ts: Number(d.fields.ts.integerValue) };
  },
};
async function renderCoachPage(code) {
  document.title = "Coach view";
  const app = document.getElementById("app");
  document.getElementById("tabs").innerHTML = "";
  document.querySelector("nav").style.display = "none";
  const draw = (html) => (app.innerHTML = `<div class="coachpage">${html}</div>`);
  draw('<h1 class="large">Coach view</h1><p class="sub">Loading…</p>');
  let res;
  try { res = await Coach.fetchSummary(code); } catch (e) { draw('<h1 class="large">Coach view</h1><p class="sub">Could not load. Check your connection and reload.</p>'); return; }
  if (!res) { draw('<h1 class="large">Coach view</h1><p class="sub">This link is not active. Ask the family for a new one.</p>'); return; }
  const d = res.data;
  const bar = (v) => `<div class="progress"><i style="width:${Math.max(0, Math.min(100, ((v - 45) / 50) * 100))}%"></i></div>`;
  draw(`<div class="brandrow"><img class="logo" src="icons/team-logo.png" alt=""><div><b>${esc(d.team || "")}</b><span>${esc(d.league || "")}</span></div></div>
    <h1 class="large">${esc(d.name)}'s training</h1>
    <p class="sub">Read only. Updated ${ago(res.ts)}.</p>
    <div class="hero"><div class="eyebrow">This week</div><div class="big">${d.week.done} of ${d.week.goal} sessions</div><div class="progress"><i style="width:${Math.min(100, (d.week.done / d.week.goal) * 100)}%"></i></div><div class="detail">${esc(d.level)} · Overall ${d.ovr} · ${d.sessions} sessions in total · ${d.streak}-week streak</div></div>
    <h2 class="section">Last four weeks</h2><div class="group"><div class="row"><div class="grow">Sessions per week, oldest to newest</div><div class="tval">${d.weeks.join(" · ")}</div></div></div>
    <h2 class="section">Skills</h2><div class="group">${d.skills.map(([n, v]) => `<div class="row"><div class="grow"><div class="title strong">${esc(n)}</div>${bar(v)}</div><div class="tval">${v}</div></div>`).join("")}</div>
    ${d.priority ? `<h2 class="section">Priority</h2><div class="group"><div class="row"><div class="grow">${esc(d.priority)}</div></div></div>` : ""}
    ${d.games.length ? `<h2 class="section">Recent games${d.ratio !== null ? ` · assist to turnover ${d.ratio}` : ""}</h2><div class="group">${d.games.slice().reverse().map((g) => `<div class="row"><div class="grow"><div class="title strong">${g.opp ? "vs " + esc(g.opp) : "Game"}</div><div class="detail">${fmtShort(parseKey(g.date))}</div></div><div class="detail">${[g.pts !== undefined && g.pts + " pts", g.ast !== undefined && g.ast + " ast", g.tov !== undefined && g.tov + " TO"].filter(Boolean).join(" · ")}</div></div>`).join("")}</div>` : ""}
    <p class="small">This page shows a summary the family chose to share. It has no sleep, body or private notes.</p>`);
}

/* ---------- actions ---------- */
const EXTRA_ACTIONS = {
  addGame: () => formGame(), editGame: (d) => formGame(d.id),
  addEvent: () => formEvent(), editEvent: (d) => formEvent(d.id),
  monthlyStart: () => formMonthly(),
  monthlyDone: () => {
    const m = S.monthly; if (!m) return;
    const k = dateKey(new Date());
    if (m.done[k]) delete m.done[k]; else { m.done[k] = true; Sfx.swish(); buzz(15); xpPop("+5 XP"); }
  },
  monthlyStop: () => { if (!ui.stopArmed) { ui.stopArmed = true; toast("Tap End this challenge again to confirm."); setTimeout(() => (ui.stopArmed = false), 3000); return; } ui.stopArmed = false; S.monthly = null; },
  recapShare: async () => {
    const d = recapData();
    const text = `${d.first}'s week: ${d.r.sessions} of ${d.r.goal} sessions finished and ${d.r.xp} XP earned. ${d.best}.`;
    try {
      const blob = await recapImage(d);
      const file = new File([blob], `${d.first}-family-recap.png`, { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], text }); return; }
      await deliverFile(file); return;
    } catch (e) { if (e && e.name === "AbortError") return; }
    try { await navigator.clipboard.writeText(text); toast("Recap copied. Paste it into a message."); } catch (e) { toast("Could not share the recap."); }
  },
  cmpOpen: () => { const l = playable(); ui.compare = { a: (l[0] || {}).id, b: (l[1] || l[0] || {}).id, rate: 1, draw: false }; cmpKey = ""; },
  cmpClose: () => { cmpVids().forEach((v) => v.pause()); ui.compare = null; },
  cmpPlay: () => {
    const v = cmpVids(); if (!v.length) return;
    const btn = document.getElementById("cmp-play");
    if (v[0].paused) { v.forEach((x) => { x.playbackRate = ui.compare.rate; x.play().catch(() => {}); }); if (btn) btn.textContent = "Pause both"; }
    else { v.forEach((x) => x.pause()); if (btn) btn.textContent = "Play both"; }
  },
  cmpStep: (d) => { const btn = document.getElementById("cmp-play"); cmpVids().forEach((v) => { v.pause(); v.currentTime = Math.max(0, v.currentTime + Number(d.d) / 30); }); if (btn) btn.textContent = "Play both"; },
  cmpSync: () => { const [a, b] = cmpVids(); if (a && b) b.currentTime = a.currentTime; },
  cmpRate: (d) => { ui.compare.rate = Number(d.r); cmpVids().forEach((v) => (v.playbackRate = ui.compare.rate)); document.querySelectorAll("[data-a=cmpRate]").forEach((b) => b.classList.toggle("on", b.dataset.r === d.r)); },
  cmpDraw: () => { ui.compare.draw = !ui.compare.draw; document.querySelectorAll("[data-a=cmpDraw]").forEach((b) => b.classList.toggle("on", ui.compare.draw)); document.querySelectorAll(".cmp-stage canvas").forEach((c) => c.classList.toggle("on", ui.compare.draw)); },
  cmpClear: () => document.querySelectorAll(".cmp-stage canvas").forEach((c) => c.getContext("2d").clearRect(0, 0, c.width, c.height)),
  coachCreate: async () => {
    if (!Sync.ready || !Sync.code) { toast("Turn on family sync first (Create a family code above)."); return; }
    S.profile.coachCode = Sync.newCode();
    try { await Coach.publish(true); toast("Coach link created. Tap Share coach link."); } catch (e) { S.profile.coachCode = ""; toast(Sync.explain(e)); }
  },
  coachShare: async () => {
    const url = Coach.link(S.profile.coachCode);
    try { if (navigator.share) { await navigator.share({ title: "Training summary", url }); return; } } catch (e) { if (e && e.name === "AbortError") return; }
    try { await navigator.clipboard.writeText(url); toast("Link copied."); } catch (e) { toast(url); }
  },
  coachStop: async () => {
    if (!ui.stopArmed) { ui.stopArmed = true; toast("Tap Stop sharing again to confirm."); setTimeout(() => (ui.stopArmed = false), 3000); return; }
    ui.stopArmed = false;
    const code = S.profile.coachCode; S.profile.coachCode = ""; Coach.lastHash = "";
    if (code) await Coach.remove(code);
    toast("Coach link turned off.");
  },
};
function coachGroup() {
  const code = S.profile.coachCode;
  return `<h2 class="section">Coach view</h2><div class="group">${code ? `
    <div class="row"><div class="grow"><div class="title strong">Sharing a read-only summary</div><div class="detail">Anyone with the link sees ${esc(firstName(S.profile.name))}'s first name, sessions, skill ratings, recent games and this week's priority. No sleep, body or notes.</div></div></div>
    <div class="row tap" data-a="coachShare"><div class="grow">Share coach link</div><span class="chev">›</span></div>
    <div class="row tap" data-a="coachStop"><div class="grow" style="color:var(--red-text)">Stop sharing</div></div>` : `
    <div class="row tap" data-a="coachCreate"><div class="grow"><div class="title strong">Create a view-only coach link</div><div class="detail">For a Rens coach or trainer. Shows a summary only and cannot change anything. You can turn it off at any time. Needs family sync.</div></div><span class="chev">›</span></div>`}</div>`;
}

/* ---------- first session guide ---------- */
function firstWeekCard() {
  if (completeDates().length > 0 || Prefs.parent) return "";
  return `<div class="firstwk"><b>Your first session</b><ol><li>Tap <b>Start session</b> and follow the timer.</li><li>Finish a block to earn +10 XP.</li><li>Finish every block for +50 XP and move toward your first level.</li></ol></div>`;
}

/* ---------- player card photo (kept on this phone only) ---------- */
const PHOTO_KEY = "tristan-photo";
const photoUrl = () => { try { return localStorage.getItem(PHOTO_KEY) || ""; } catch (e) { return ""; } };
function shrinkPhoto(file) {
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => {
      const side = Math.min(img.width, img.height), out = 280;
      const c = document.createElement("canvas");
      c.width = c.height = out;
      c.getContext("2d").drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, out, out);
      res(c.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => res(undefined);
    img.src = URL.createObjectURL(file);
  });
}
document.addEventListener("pointermove", (e) => {
  const card = e.target && e.target.closest && e.target.closest(".pcard");
  if (!card) return;
  const r = card.getBoundingClientRect();
  card.style.setProperty("--mx", ((e.clientX - r.left) / r.width) * 100 + "%");
  card.style.setProperty("--my", ((e.clientY - r.top) / r.height) * 100 + "%");
});

/* ---------- plan history: a daily snapshot on this device, restorable ---------- */
const SNAP_KEY = "tristan-snapshots";
const readSnaps = () => { try { return JSON.parse(localStorage.getItem(SNAP_KEY)) || []; } catch (e) { return []; } };
function writeSnaps(list) { try { localStorage.setItem(SNAP_KEY, JSON.stringify(list.slice(-8))); } catch (e) {} }
const snapPlan = () => JSON.parse(JSON.stringify({ days: S.days, videos: S.videos.map((v) => ({ ...v })), links: S.links, notes: S.notes, rewards: S.rewards }));
function takeSnapshot(label) {
  const list = readSnaps(), today = dateKey(new Date());
  if (!label && list.some((x) => x.date === today && !x.label)) return;
  list.push({ id: uid("s"), date: today, label: label || "", plan: snapPlan() });
  writeSnaps(list);
}
function formRestore() {
  const list = readSnaps().slice().reverse();
  if (!list.length) { toast("No earlier versions yet. One is saved each day."); return; }
  openForm({
    title: "Restore the plan",
    fields: [{ k: "snap", label: "Go back to the plan as it was on", type: "select", value: list[0].id, opts: list.map((x) => [x.id, fmtShort(parseKey(x.date)) + (x.label ? " (" + x.label + ")" : "")]) }],
    save(f) {
      const pick = readSnaps().find((x) => x.id === f.snap);
      if (!pick) return false;
      takeSnapshot("before restore");
      Object.assign(S, JSON.parse(JSON.stringify(pick.plan)));
      toast("Plan restored to " + fmtShort(parseKey(pick.date)) + ". Progress was not changed.");
    },
  });
}
EXTRA_ACTIONS.restoreOpen = () => formRestore();

/* ---------- XP count-up: numbers roll from the old value to the new one ---------- */
const COUNT_PREV = {}, COUNT_RUN = {};
function animateCounts() {
  const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.querySelectorAll("[data-count]").forEach((el) => {
    const key = el.dataset.ck || el.dataset.count, to = Number(el.dataset.count);
    const from = COUNT_PREV[key] !== undefined ? COUNT_PREV[key] : el.dataset.from !== undefined ? Number(el.dataset.from) : to;
    COUNT_PREV[key] = to;
    if (reduce || isNaN(from) || from === to) return;
    const run = (COUNT_RUN[key] = (COUNT_RUN[key] || 0) + 1);
    const t0 = performance.now(), dur = Math.min(900, 350 + Math.abs(to - from) * 6);
    el.textContent = from;
    const step = (now) => {
      if (COUNT_RUN[key] !== run || !el.isConnected) return;
      const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      el.textContent = k < 1 ? Math.round(from + (to - from) * e) : to;
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}
