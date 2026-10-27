"use strict";
/* End to end check of the app in an emulated phone: core flow, Phase 7 features, family sync,
   Family view, coach page and an accessibility audit. Run with: npm test (from the tests folder). */
const { chromium, webkit, devices } = require("playwright");
const engine = process.env.BROWSER === "webkit" ? webkit : chromium;
const fs = require("fs"), path = require("path"), cp = require("child_process"), os = require("os");
const axeSource = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const { start } = require("./server");

let failed = 0;
const ok = (cond, label) => { console.log((cond ? "  ok   " : "  FAIL ") + label); if (!cond) failed++; };
const phone = { ...devices["iPhone 14 Pro"], viewport: { width: 440, height: 956 }, serviceWorkers: "block" };

async function boot(browser, url, scheme = "light", time) {
  const ctx = await browser.newContext({ ...phone, colorScheme: scheme });
  if (time) await ctx.clock.setFixedTime(time);
  // The tests never reach the real YouTube; a blank page stands in for the player.
  await ctx.route(/^https:\/\/(www\.)?youtube\.com\//, (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>player</title>" }));
  const page = await ctx.newPage();
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(e.message));
  await page.goto(url + "/index.html");
  await page.waitForSelector("#splash", { state: "detached" });
  return { ctx, page };
}
async function finishWelcome(page) {
  if (await page.locator(".welcome").count()) { await page.click("[data-a=wNext]"); await page.click("[data-a=wFinish]"); }
  await page.waitForSelector(".greet");
}
const fill = async (page, name, value) => page.fill(`#f [name="${name}"]`, String(value));
const tab = async (page, t) => { await page.click(`[data-a=tab][data-t=${t}]`); await page.waitForTimeout(150); };
const settle = (pg) => pg.evaluate(async () => { const idle = async () => { while (Sync.busy) await new Promise((r) => setTimeout(r, 40)); }; await idle(); await Sync.sync(); await idle(); });
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

(async () => {
  const { server, url } = await start();
  const browser = await engine.launch(process.env.PW_CHROMIUM && engine === chromium ? { executablePath: process.env.PW_CHROMIUM } : {});
    console.log("Browser engine: " + (process.env.BROWSER || "chromium"));
  try {
    /* ---- Tristan's phone ---- */
    console.log("Core flow");
    const t = await boot(browser, url);
    const p = t.page;
    await finishWelcome(p);
    ok((await p.textContent(".greet")).includes("Tristan"), "greets Tristan");
    ok(await p.locator(".firstwk").count() === 1, "day-one guide shows for a new user");
    await p.click("button[data-a=toggle]");
    ok((await p.evaluate(() => Object.values(S.logs).some((l) => Object.keys(l.done).length))), "checking a block saves it");

    ok(await p.locator(".firstwk").count() === 1, "first-session guide stays until a whole session is finished");
    await p.evaluate(() => { const k = dateKey(new Date()); logOf(k).complete = true; render(); });
    ok(await p.locator(".firstwk").count() === 0, "first-session guide goes away after the first finished session");
    await p.evaluate(() => { const k = dateKey(new Date()); logOf(k).complete = false; render(); });

    const roll = await p.evaluate(() => { const before = xpTotal(); logOf(dateKey(new Date())).done["monday-1"] = true; logOf(dateKey(new Date())).done["monday-2"] = true; render(); return { before, start: document.querySelector("[data-ck=hero-xp]").textContent, now: xpTotal() }; });
    ok(String(roll.before) === roll.start && roll.now > roll.before, "XP counter starts at the old value and rolls up (" + roll.start + " to " + roll.now + ")");
    await p.waitForTimeout(1300);
    ok((await p.textContent("[data-ck=hero-xp]")) === String(roll.now), "XP counter lands on the new total");

    console.log("Today fold, rest days, focus and diagnostics");
    const hClosed = await p.evaluate(() => document.documentElement.scrollHeight);
    ok(await p.locator("details.fold").count() === 1 && await p.evaluate(() => !document.querySelector("details.fold").open), "More fold starts closed");
    await p.click("details.fold > summary");
    await p.waitForFunction(() => Prefs.moreOpen === true);
    ok(true, "opening More is remembered");
    ok((await p.evaluate(() => document.documentElement.scrollHeight)) > hClosed, "Today is shorter with More closed (" + hClosed + " px)");
    await p.click("details.fold > summary");
    await p.click("[data-a=offSet][data-v='rest']");
    ok(await p.evaluate(() => weekNeeded(weekKeyNow()) === 3 && Object.values(S.logs).some((l) => l.off === "rest")), "a rest day lowers the sessions a streak week needs to 3");
    await p.click("[data-a=offSet][data-v='rest']");
    ok(await p.evaluate(() => weekNeeded(weekKeyNow()) === 4), "unmarking restores 4");
    await tab(p, "log");
    await p.click("[data-a=addGame]");
    ok(await p.evaluate(() => !!document.activeElement && document.activeElement.closest("#modal") !== null), "opening a form moves focus into it");
    await p.keyboard.press("Escape");
    ok(await p.evaluate(() => document.querySelector("#modal").children.length === 0 && !!document.activeElement && document.activeElement.dataset.a === "addGame"), "Escape closes it and focus returns to the button");
    await tab(p, "guide");
    await p.waitForFunction(() => document.getElementById("build-id") && document.getElementById("build-id").textContent.length > 1 && document.getElementById("build-id").textContent !== "…");
    ok(true, "Guide shows a build id (" + (await p.textContent("#build-id")) + ")");
    await p.evaluate(() => window.dispatchEvent(new ErrorEvent("error", { message: "test boom", filename: "x.js", lineno: 3 })));
    const diag = await p.evaluate(() => diagText());
    ok(diag.includes("Build:") && diag.includes("test boom"), "diagnostics list the build and recent errors");
    ok(!/Tristan|Alvarez/i.test(diag) && !diag.includes(await p.evaluate(() => Sync.code || "none-none")), "diagnostics hold no names or codes");
    await p.evaluate(() => localStorage.removeItem("tristan-errors"));
    await p.click("[data-a=checkMark][data-k=sound]");
    ok(await p.evaluate(() => Prefs.checks.sound === true), "phone test items can be marked as working");
    await p.click("[data-a=checkMark][data-k=sound]");
    await tab(p, "today");

    console.log("Cycle notes, milestones, goal, swipe, time zone, coach file");
    await p.evaluate(() => { ui.openBlocks = {}; });
    await p.click("[data-a=blockInfo]:nth-of-type(1)", { force: true }).catch(() => {});
    await p.evaluate(() => { const b = S.days[ui.day].blocks.find((x) => !/warm|cool/i.test(x.title)); ui.openBlocks[b.id] = true; render(); });
    ok((await p.textContent("body")).includes("Cycle week 1:"), "drill details show this cycle week's note");
    await p.evaluate(() => { seenMilestones(); const k = dateKey(new Date()); logOf(k).complete = true; render(); });
    ok(await p.locator("[data-a=milestoneSeen]").count() === 1, "a new milestone card appears");
    await p.click("[data-a=milestoneSeen]");
    ok(await p.locator("[data-a=milestoneSeen]").count() === 0, "dismissing it hides the card");
    await p.evaluate(() => { logOf(dateKey(new Date())).complete = false; render(); });
    const day1 = await p.evaluate(() => ui.day);
    await p.evaluate(() => {
      const el = document.querySelector(".hero");
      const pt = (x) => ({ clientX: x, clientY: 300 });
      const ev = (type, touches, changed) => { const e = new Event(type, { bubbles: true }); Object.defineProperty(e, "touches", { value: touches }); Object.defineProperty(e, "changedTouches", { value: changed }); return e; };
      el.dispatchEvent(ev("touchstart", [pt(300)], [pt(300)]));
      el.dispatchEvent(ev("touchend", [], [pt(120)]));
    });
    ok(await p.evaluate((d) => ui.day === Math.min(6, d + 1), day1), "swiping left moves to the next day");
    await p.evaluate(() => { ui.day = todayIdx(); render(); });
    await p.evaluate(() => { localStorage.setItem("tristan-tz", "Mars/Olympus"); checkTz(); });
    await p.waitForSelector(".toast", { timeout: 4000 });
    ok((await p.textContent(".toast")).includes("time zone"), "a changed time zone shows a notice");
    const csv = await p.evaluate(() => buildCsv());
    ok(csv.includes("Sessions") && csv.includes("Skill ratings") && csv.includes("Games") && !/sleep|energy|sore/i.test(csv), "coach spreadsheet has sessions, ratings and games only");
    await tab(p, "log");
    await p.click("[data-a=editGoal]");
    await p.selectOption('#f [name="metric"]', "ratio");
    await fill(p, "target", "2.5");
    await p.click("[data-a=save]");
    ok((await p.textContent("body")).includes("Goal: Assist to turnover 2.5"), "a season goal shows with its progress");
    await tab(p, "today");

    console.log("Text size");
    await tab(p, "guide");
    await p.click("[data-a=textSize][data-v='1.25']");
    ok(await p.evaluate(() => document.documentElement.style.zoom === "1.25"), "Larger text size applies");
    ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "no sideways scrolling at the larger size");
    await p.click("[data-a=textSize][data-v='1']");
    ok(await p.evaluate(() => document.documentElement.style.zoom === ""), "Normal size restores the layout");
    await tab(p, "today");

    console.log("Game log");
    await tab(p, "log");
    await p.click("[data-a=addGame]");
    await fill(p, "opp", "Harlem"); await fill(p, "pts", 12); await fill(p, "ast", 6); await fill(p, "tov", 2);
    await p.click("[data-a=save]");
    ok((await p.textContent("body")).includes("vs Harlem"), "game row appears");
    ok((await p.textContent("body")).includes("3.0"), "assist to turnover ratio is 3.0");

    console.log("Team schedule");
    await tab(p, "week");
    await p.click("[data-a=addEvent]");
    await p.selectOption('#f [name="type"]', "game");
    await fill(p, "title", "vs Bronx"); await fill(p, "date", ymd(new Date(Date.now() + 864e5)));
    await p.click("[data-a=save]");
    await tab(p, "today");
    ok((await p.textContent(".evt")).includes("Game tomorrow"), "Today warns about tomorrow's game with a light session tip");

    console.log("Recovery and monthly challenge");
    await p.click("[data-a=bodySet][data-v='1']");
    ok(await p.locator(".recov").count() > 0, "recovery card shows after a check-in");
    await p.click("details.fold > summary");
    await p.click("[data-a=monthlyStart]");
    await p.selectOption('#f [name="days"]', "14");
    await p.click("[data-a=save]");
    await p.click("[data-a=monthlyDone]");
    ok((await p.textContent(".mchal")).includes("1 done"), "monthly challenge counts today");
    const xp = await p.evaluate(() => xpTotal());
    ok(xp >= 10 + 15 + 5 + 5, "XP includes block, game, check-in and challenge day (" + xp + ")");

    console.log("Clip compare");
    await tab(p, "videos");
    let clip = null;
    if (process.env.BROWSER !== "webkit") try { clip = path.join(os.tmpdir(), "rens-test-clip.webm"); cp.execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc=duration=2:size=160x90:rate=30", "-c:v", "libvpx", clip]); } catch (e) { clip = null; }
    if (clip) {
      await p.setInputFiles("#clip-in", clip);
      await p.waitForFunction(() => S.videos.some((v) => v.code === "Me"));
      ok(true, "Film a drill saves a clip to Videos");
    } else console.log("  skip  no ffmpeg, clip checks skipped");
    await p.click("[data-a=cmpOpen]");
    ok(await p.locator(".cmp").count() > 0, "compare screen opens");
    if (clip) {
      await p.waitForFunction(() => { const v = document.getElementById("cmp-v-a"); return v && v.readyState >= 1; });
      await p.click("[data-a=cmpStep][data-d='1']");
      ok(await p.evaluate(() => document.getElementById("cmp-v-a").currentTime > 0), "frame step moves the clip forward");
      await p.click("[data-a=cmpRate][data-r='0.25']");
      ok(await p.evaluate(() => document.getElementById("cmp-v-a").playbackRate === 0.25 && document.getElementById("cmp-v-b").playbackRate === 0.25), "slow motion applies to both clips");
      await p.click("[data-a=cmpDraw]");
      const box = await p.locator("#cmp-c-a").boundingBox();
      await p.mouse.move(box.x + 20, box.y + 20); await p.mouse.down(); await p.mouse.move(box.x + 80, box.y + 40, { steps: 5 }); await p.mouse.up();
      ok(await p.evaluate(() => { const c = document.getElementById("cmp-c-a"); return c.getContext("2d").getImageData(0, 0, c.width, c.height).data.some((x, i) => i % 4 === 3 && x > 0); }), "drawing marks the paused frame");
    }
    // a YouTube link can be compared too; the buttons talk to the embedded player
    await p.click("[data-a=cmpClose]");
    await p.evaluate(() => { S.videos.push({ id: "yt1", code: "Y1", title: "Coach video", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", note: "" }); });
    await p.click("[data-a=cmpOpen]");
    await p.selectOption("#cmp-b", "yt1");
    await p.waitForSelector("iframe.cmp-yt");
    ok(await p.evaluate(() => document.querySelector("iframe.cmp-yt").src.includes("enablejsapi=1")), "a YouTube clip loads with its player controls switched on");
    await p.evaluate(() => { window.__ytSpy = []; });
    await p.click("[data-a=cmpRate][data-r='0.5']");
    await p.click("[data-a=cmpPlay]");
    const sent = await p.evaluate(() => window.__ytSpy.slice());
    ok(sent.includes("setPlaybackRate") && sent.includes("playVideo"), "slow motion and play reach the YouTube player (" + sent.join(",") + ")");
    await p.click("[data-a=cmpClose]");
    await p.evaluate(() => { S.videos = S.videos.filter((v) => v.id !== "yt1"); });
    ok((await p.locator(".cmp").count()) === 0, "compare screen closes");

    console.log("Skill ladder, game stats and heat map");
    await tab(p, "log");
    ok((await p.locator("[data-a=ladderPass]").count()) === 5, "the skill ladder shows a test for each of five skills");
    const xp0 = await p.evaluate(() => xpTotal());
    await p.click("[data-a=ladderPass][data-k=shoot]");
    ok((await p.evaluate(() => xpTotal())) === xp0 + 30 && (await p.evaluate(() => S.ladder.shoot)) === 1, "passing a rung gives 30 XP and moves to the next test");
    await p.click("[data-a=ladderUndo][data-k=shoot]");
    ok((await p.evaluate(() => S.ladder.shoot)) === 0 && (await p.evaluate(() => xpTotal())) === xp0, "undo moves back one rung");
    for (let i = 0; i < 6; i++) await p.evaluate(() => EXTRA_ACTIONS.ladderPass({ k: "pass" }));
    ok((await p.evaluate(() => S.ladder.pass)) === 5, "a skill stops at its top rung");
    await p.evaluate(() => { S.ladder = {}; });
    // game stats: record, last 5 and per-game steals
    await p.evaluate(() => {
      window.__games = S.games;
      const k = (n) => dateKey(addDays(new Date(), -n));
      S.games = [[20, "L", 6, 4, 1], [18, "W", 8, 3, 2], [14, "W", 10, 2, 1], [10, "W", 12, 3, 0], [6, "L", 7, 5, 2], [2, "W", 14, 2, 3]].map(([d, r, a, t, st], i) => ({ id: "gs" + i, date: k(d), opp: "T" + i, result: r, pts: 10, ast: a, tov: t, stl: st }));
      render();
    });
    const gtxt = await p.evaluate(() => document.querySelector("#main, main, body").innerText);
    ok(/4 wins, 2 losses/.test(gtxt) && /Last 5 games/.test(gtxt) && /stl/.test(gtxt), "game stats show the record, last 5 games and steals");
    // heat map: this 4 weeks versus the 4 weeks before
    await p.evaluate(() => {
      const k = (n) => dateKey(addDays(new Date(), -n));
      S.logs[k(3)] = Object.assign(S.logs[k(3)] || {}, { shots: { lw: { m: 8, x: 2 } } });
      S.logs[k(40)] = Object.assign(S.logs[k(40)] || {}, { shots: { lw: { m: 4, x: 6 } } });
      ui.chartSpot = "lw"; render();
    });
    const chart = await p.evaluate(() => document.querySelector(".court").closest(".chartcard").innerText);
    ok(/up 40 points from the 4 weeks before/.test(chart) && /Most improved: Left wing/.test(chart), "the shot chart compares with the 4 weeks before");
    ok((await p.locator(".spot .glow").count()) === 5, "each spot has a heat glow");
    await p.evaluate(() => { S.games = window.__games; delete S.logs[dateKey(addDays(new Date(), -3))].shots; delete S.logs[dateKey(addDays(new Date(), -40))].shots; ui.chartSpot = null; render(); });

    console.log("Harder drills, watch and try, film notes, game day, leadership, plain words");
    await tab(p, "today");
    const blk = await p.evaluate(() => { const d = S.days[ui.day]; const b = d.blocks.find((x) => levelKind(x.title)); return b ? b.id : null; });
    if (blk) {
      await p.evaluate((id) => { ui.openBlocks[id] = true; render(); }, blk);
      ok((await p.locator("[data-a=levelUpToggle]").count()) >= 1, "a drill offers a harder version");
      await p.click(`[data-a=levelUpToggle][data-id='${blk}']`);
      ok(await p.evaluate((id) => S.levelUp[id] === true && /Harder version/.test(document.body.innerText), blk), "making a drill harder shows the harder version");
      await p.click(`[data-a=levelUpToggle][data-id='${blk}']`);
      ok(await p.evaluate((id) => !S.levelUp[id], blk), "it goes back to the normal version");
    } else ok(true, "no leveled block today (rest day)");
    await tab(p, "videos");
    ok((await p.locator("[data-a=wtDone]").count()) === 7, "watch then try it lists seven drills");
    const x1 = await p.evaluate(() => xpTotal());
    await p.click("[data-a=wtDone][data-id=w-hedge]");
    ok((await p.evaluate(() => xpTotal())) === x1 + 15, "trying a watched drill gives 15 XP");
    await p.click("[data-a=wtDone][data-id=w-hedge]");
    await p.click("[data-a=sugPlay]");
    ok(await p.evaluate(() => /youtube\.com\/embed\//.test(document.querySelector(".ytwrap iframe").src)), "Watch plays the video");
    await p.click("[data-a=close]");
    await p.click("[data-a=addFilmNote]");
    await p.fill('#f [name="saw"]', "Eyes drop on crossovers");
    await p.fill('#f [name="fix"]', "Head up");
    await p.click("[data-a=save]");
    ok(await p.evaluate(() => S.filmNotes.length === 1 && /Eyes drop/.test(document.body.innerText)), "a film note is saved and shown");
    await p.evaluate(() => { S.filmNotes = []; render(); });
    await tab(p, "today");
    ok(!(await p.evaluate(() => /Game day/.test(document.body.innerText))), "no game day card without a game");
    await p.evaluate(() => { S.events.push({ id: "gd1", type: "game", title: "vs Test", date: dateKey(new Date()), time: "16:00" }); render(); });
    ok((await p.locator("[data-a=preToggle]").count()) === 5, "a game today shows the pre-game checklist");
    await p.click("[data-a=preToggle][data-i='0']");
    ok(await p.evaluate(() => S.logs[dateKey(new Date())].pre[0] === true), "a checklist item can be ticked");
    await p.evaluate(() => { S.events = S.events.filter((e) => e.id !== "gd1"); delete S.logs[dateKey(new Date())].pre; render(); });
    await tab(p, "log");
    const x2 = await p.evaluate(() => xpTotal());
    await p.click("[data-a=leadDone]");
    ok((await p.evaluate(() => xpTotal())) === x2 + 15, "a leadership goal gives 15 XP");
    await p.click("[data-a=leadNew]");
    ok(await p.evaluate(() => S.weekly[weekKeyNow()].lead.done === false), "another goal resets it");
    await p.evaluate(() => { delete S.weekly[weekKeyNow()].lead; if (!Object.keys(S.weekly[weekKeyNow()]).length) delete S.weekly[weekKeyNow()]; render(); });
    const plain = await p.evaluate(() => plainWeekText());
    ok(/sessions this week/.test(plain) && /Skill ladder/.test(plain) && /work on next week/.test(plain), "the plain-words summary reads as sentences");

    console.log("Curriculum: start from scratch, strict order, missed steps repeat");
    const cur = await boot(browser, url, "light", new Date("2026-10-30T16:00:00"));
    const cp = cur.page;
    await finishWelcome(cp).catch(() => {});
    const goDay = async (iso) => { await cur.ctx.clock.setFixedTime(new Date(iso)); await cp.reload(); await cp.waitForSelector("#splash", { state: "detached" }); };
    const doStep = () => cp.evaluate(() => { const d = S.days[(new Date().getDay() + 6) % 7]; ui.day = (new Date().getDay() + 6) % 7; d.blocks.filter((b) => !b.optional).forEach((b) => toggleBlock(b.id)); persist(); return JSON.stringify(S.logs[dateKey(new Date())].complete); });
    await cp.evaluate(() => { S.games = [{ id: "g0", date: "2026-10-20", opp: "Old", result: "W", pts: 9, ast: 3, tov: 1, stl: 1 }]; logOf("2026-10-27").done["monday-0"] = true; S.ladder = { shoot: 2 }; persist(); });
    await tab(cp, "guide");
    await cp.click("[data-a=currOpen]");
    ok(/School comes first/.test(await cp.textContent("#modal .sheet")) && /November 3/.test(await cp.textContent("#modal .sheet")), "the start screen puts school first and names the start day");
    await cp.click("[data-a=currStart]");
    const st0 = await cp.evaluate(() => ({ on: !!S.curr.on, step: S.curr.step, games: S.games.length, logs: Object.keys(S.logs).length, ladder: JSON.stringify(S.ladder), from: S.progressFrom, ev: (S.events || []).filter((e) => e.fit).length, snap: readSnaps().some((x) => x.label === "before starting over"), backup: !!localStorage.getItem("tristan-backup-before-restart"), mon: S.days[0].blocks.length + ":" + S.days[0].blocks[0].minutes }));
    ok(st0.on && st0.step === 0 && st0.games === 0 && st0.logs === 0 && st0.ladder === "{}" && st0.from === "2026-11-03", "starting over clears progress and games and sets the start date");
    ok(st0.ev === 5 && st0.snap && st0.backup && st0.mon === "1:0", "the real schedule is added, Monday is a rest day, and a backup is saved first");
    await tab(cp, "today");
    ok(/Starts .*November 3/.test(await cp.evaluate(() => document.body.innerText)), "before the start day the Today screen says when it starts");
    await cp.evaluate(() => { ui.day = (new Date().getDay() + 6) % 7; toggleBlock(S.days[ui.day].blocks[0].id); });
    ok(await cp.evaluate(() => Object.values(S.logs).every((l) => !Object.keys(l.done || {}).length)), "nothing can be checked off before the start day");
    await goDay("2026-11-03T16:00:00");
    const s1 = await cp.evaluate(() => ({ step: S.curr.step, date: S.curr.date, ids: S.days[1].blocks.map((b) => b.id).join(","), opt: S.days[1].blocks.filter((b) => b.optional).length }));
    ok(s1.step === 0 && s1.date === "2026-11-03" && /^c1-0,c1-1/.test(s1.ids) && s1.opt === 1, "on the first Tuesday step 1 appears, with its video block marked optional");
    ok((await doStep()) === "true", "finishing the required blocks completes the step without the optional video");
    await cp.evaluate(() => { ui.day = 2; toggleBlock(S.days[2].blocks[0].id); });
    ok(await cp.evaluate(() => !S.logs[dateKey(addDays(mondayOf(new Date()), 2))]), "work on another day cannot be checked off");
    await goDay("2026-11-06T16:00:00");
    ok(await cp.evaluate(() => S.curr.step === 1 && S.days[4].blocks[0].id === "c2-0"), "a finished step is followed by step 2 on Friday");
    await goDay("2026-11-10T16:00:00");
    ok(await cp.evaluate(() => S.curr.step === 1 && S.curr.date === "2026-11-10" && S.days[1].blocks[0].id === "c2-0" && !(S.logs["2026-11-10"] && S.logs["2026-11-10"].complete)), "a step that was not finished comes back on the next step day");
    ok((await doStep()) === "true", "he finishes the repeated step");
    await goDay("2026-11-13T16:00:00");
    ok(await cp.evaluate(() => S.curr.step === 2), "now step 3 opens");
    await cp.evaluate(() => { S.curr.step = 6; S.curr.date = ""; persist(); });
    await goDay("2026-11-17T16:00:00");
    const cu = await cp.evaluate(() => { ui.day = 1; const r0 = S.days[1].blocks.find((b) => /-r0$/.test(b.id)); toggleBlock(r0.id); const on = S.ladder.handle; toggleBlock(r0.id); return [on, S.ladder.handle || 0, S.days[1].theme]; });
    ok(cu[0] === 1 && cu[1] === 0 && /Check-up 1/.test(cu[2]), "a check-up step has the ladder tests, and checking one off passes that rung");
    const pcs = await cp.evaluate(() => { Prefs.parent = "Dad"; const before = S.curr.step; ACTIONS.currSkip({}); const after = S.curr.step; ACTIONS.currBack({}); return [before, after, S.curr.step]; });
    ok(pcs[1] === pcs[0] + 1 && pcs[2] === pcs[0], "a parent can unlock or go back a step");
    const prune = await cp.evaluate(() => { S.logs["2026-10-01"] = { done: { a: true } }; S.weekly["2026-10-26"] = { goal: "x" }; pruneBefore("2026-11-03"); return [Object.keys(S.logs).some((k) => k < "2026-11-03"), !!S.weekly["2026-10-26"]]; });
    ok(!prune[0] && !prune[1], "progress dated before the start is dropped, so old progress cannot come back");
    ok(cp.errors.length === 0, "no page errors in the curriculum flow " + cp.errors.join(";"));
    await cur.ctx.close();

    console.log("Video library");
    await tab(p, "videos");
    const lib = await p.evaluate(() => ({ n: SUGGESTED_VIDEOS.length, uniq: new Set(SUGGESTED_VIDEOS.map((v) => v.id)).size, urls: new Set(SUGGESTED_VIDEOS.map((v) => v.url)).size, lv: [1, 2, 3].map((l) => SUGGESTED_VIDEOS.filter((v) => v.level === l).length), cats: SUGGESTED_CATS.map((c) => SUGGESTED_VIDEOS.filter((v) => v.cat === c[0]).length) }));
    ok(lib.n >= 200 && lib.uniq === lib.n && lib.urls === lib.n, `library is large with unique ids and links (${lib.n})`);
    ok(lib.lv.every((n) => n >= 20) && lib.cats.every((n) => n >= 10), `every level and topic has videos (${lib.lv.join("/")} ; ${lib.cats.join("/")})`);
    ok(await p.evaluate(() => sugVisible().length > 20 && sugVisible().every((v) => v.level === 3)), "only advanced videos show by default");
    await p.click("[data-a=setLevel][data-n='1']");
    ok(await p.evaluate(() => sugVisible().some((v) => v.level === 1)), "the level switch brings basics back");
    await p.click("[data-a=setLevel][data-n='3']");
    ok(await p.evaluate(() => sugVisible().every((v) => v.level === 3)), "advanced only filters to advanced");
    await p.click("[data-a=setLevel][data-n='2']");
    await p.click("details[data-lib=offense] summary");
    await p.waitForSelector("details[data-lib=offense] .row");
    ok((await p.locator("details[data-lib=offense] .row").count()) > 5, "opening a topic lists its videos");
    await p.click("[data-a=watchAll][data-c=defense]");
    const src = await p.evaluate(() => document.querySelector(".ytwrap iframe").src);
    ok(/youtube\.com\/embed\/[\w-]{11}\?playlist=[\w-]{11},/.test(src), "a topic plays non-stop as one playlist");
    await p.click("[data-a=close]");
    const first = await p.evaluate(() => sugVisible().find((v) => v.yt && v.cat === "offense").id);
    await p.click(`[data-a=sugAdd][data-id='${first}']`);
    ok(await p.evaluate((id) => inLibrary(SUGGESTED_VIDEOS.find((v) => v.id === id)), first), "adding a suggestion puts it in my videos");
    await p.click(`[data-a=sugHide][data-id='${first}']`);
    ok(await p.evaluate((id) => S.sugHidden.includes(id), first), "hiding removes a suggestion");
    await p.click("[data-a=sugUnhide]");
    ok(await p.evaluate(() => S.sugHidden.length === 0), "hidden videos can be shown again");
    await p.evaluate(() => { Object.defineProperty(navigator, "clipboard", { value: { readText: async () => "https://youtu.be/dQw4w9WgXcQ" }, configurable: true }); });
    const before = await p.evaluate(() => S.videos.length);
    await p.click("[data-a=ytPaste]");
    await p.waitForFunction((n) => S.videos.length > n, before);
    ok(await p.evaluate(() => S.videos.at(-1).url.includes("dQw4w9WgXcQ")), "a pasted YouTube link is added");
    await p.evaluate(() => { S.videos = S.videos.filter((v) => !v.url.includes("dQw4w9WgXcQ") && !SUGGESTED_VIDEOS.some((x) => x.url === v.url)); render(); });

    console.log("Clip storage");
    if (clip) {
      await tab(p, "guide");
      await p.waitForSelector("#clip-list .row .pill.red");
      ok((await p.textContent("#clip-list")).includes("used"), "Guide lists saved clips with the space they use");
      await p.click("[data-a=clipDelete]"); await p.click("[data-a=clipDelete]");
      await p.waitForFunction(() => !S.videos.some((v) => v.code === "Me"));
      ok(true, "a clip can be deleted from Guide");
    }

    console.log("Photo, history and restore");
    await tab(p, "guide");
    await p.click("[data-a=editProfile]");
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
    await p.setInputFiles('#f [name="photo"]', { name: "me.png", mimeType: "image/png", buffer: png });
    await p.click("[data-a=save]");
    await p.waitForFunction(() => !!localStorage.getItem("tristan-photo"));
    await tab(p, "today");
    await p.click(".cardbtn");
    ok(await p.locator(".pcard .pc-photo").count() === 1, "player card shows the photo");
    await p.click("[data-a=cardClose]");
    await p.evaluate(() => takeSnapshot("test"));
    await p.evaluate(() => { S.days[0].blocks.pop(); persist(); render(); });
    const n0 = await p.evaluate(() => S.days[0].blocks.length);
    await tab(p, "guide");
    await p.click("[data-a=restoreOpen]");
    await p.selectOption('#f [name="snap"]', { index: 0 });
    await p.click("[data-a=save]");
    ok(await p.evaluate(() => S.days[0].blocks.length) === n0 + 1, "restore brings the deleted block back");

    console.log("Family sync, Family view and coach page");
    await tab(p, "guide");
    await p.click("[data-a=syncCreate]");
    await p.waitForSelector("[data-sync-status]");
    await p.waitForFunction(() => Sync.status === "ok");
    const code = await p.evaluate(() => Sync.code);
    await tab(p, "log");
    ok((await p.textContent(".syncline")).includes("Synced"), "Log shows when it last synced");
    await tab(p, "guide");
    ok(code && code.length === 20, "family code created");
    await p.click("[data-a=coachCreate]");
    await p.waitForFunction(() => !!S.profile.coachCode);
    const coach = await p.evaluate(() => S.profile.coachCode);
    ok(coach && coach !== code, "coach code created");

    // QR code: show it on phone 1, scan it with a fake camera on phone 3
    await p.click("[data-a=syncQr]");
    await p.waitForSelector(".qrbox svg");
    ok(true, "QR code is shown for the family code");
    if (process.env.BROWSER !== "webkit") {
      let y4m = null;
      try {
        const png = path.join(os.tmpdir(), "rens-qr.png"); y4m = path.join(os.tmpdir(), "rens-qr.y4m");
        await p.evaluate(() => document.querySelectorAll(".toast").forEach((x) => x.remove()));
        await p.locator(".qrbox").screenshot({ path: png });
        cp.execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-loop", "1", "-i", png, "-vf", "scale=440:440:force_original_aspect_ratio=decrease,pad=640:480:(ow-iw)/2:(oh-ih)/2:white,format=yuv420p", "-t", "4", "-r", "10", y4m]);
      } catch (e) { y4m = null; }
      if (y4m) {
        const cam = await engine.launch({ ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}), args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--use-file-for-fake-video-capture=" + y4m] });
        const cc3 = await cam.newContext({ ...phone, permissions: ["camera"] });
        const sp3 = await cc3.newPage();
        await sp3.goto(url + "/index.html"); await sp3.waitForSelector("#splash", { state: "detached" }); await finishWelcome(sp3);
        await tab(sp3, "guide");
        await sp3.click("[data-a=syncJoin]");
        await sp3.click("[data-a=extra]");
        await sp3.waitForSelector(".scanview");
        await sp3.waitForFunction((c) => Sync.code === c, code, { timeout: 20000 });
        ok(true, "scanning the QR code joins the family");
        await sp3.waitForSelector("#modal .sheet", { timeout: 6000 });
        ok((await sp3.textContent("#modal .sheet")).includes("Who is using this phone?"), "after joining, the phone asks who is using it");
        await sp3.selectOption('#f [name="who"]', "family");
        await sp3.fill('#f [name="name"]', "Mom");
        await sp3.click("[data-a=save]");
        ok(await sp3.evaluate(() => Prefs.parent === "Mom"), "choosing a parent turns on Family view with that name");
        await sp3.waitForFunction(() => (S.games || []).length === 1, null, { timeout: 15000 });
        ok(true, "the scanned phone received the family's data");
        await cam.close();
      } else console.log("  skip  could not build a fake camera video");
    }
    await p.click("[data-a=close]");
    const par = await boot(browser, url);
    const q = par.page;
    await finishWelcome(q).catch(() => {});
    await q.evaluate(async (c) => { await Sync.join(c); render(); }, code);
    ok(await q.evaluate(() => (S.games || []).length === 1), "parent phone received the game");
    // progress changed on the same day on two phones is merged, not overwritten
    const day0 = await p.evaluate(() => dateKey(new Date()));
    await p.evaluate((k) => { const l = logOf(k); l.sleep = 9; l.done.a1 = true; persist(); }, day0);
    await settle(p);
    await settle(q);
    await p.evaluate((k) => { logOf(k).done.a2 = true; persist(); }, day0);
    await q.evaluate((k) => { logOf(k).done.b1 = true; logOf(k).energy = 4; persist(); }, day0);
    for (let i = 0; i < 4; i++) { await settle(p); await settle(q); }
    const merged = (pg) => pg.evaluate((k) => { const l = S.logs[k] || {}; return !!(l.done && l.done.a1 && l.done.a2 && l.done.b1 && l.sleep === 9 && l.energy === 4); }, day0);
    ok(await merged(p), "phone A has both phones' progress for the same day");
    ok(await merged(q), "phone B has both phones' progress for the same day");
    await q.evaluate(() => { Prefs.parent = "Jalen"; Prefs.save(); });
    await q.reload(); await q.waitForSelector("#splash", { state: "detached" });
    ok((await q.locator(".ovr").count()) > 0, "Family view opens the progress overview");
    await q.waitForTimeout(1500);
    ok(!/not connected/i.test(await q.textContent(".ovr-sync")), "the opening progress overview knows the phone is connected");
    ok(/Synced/.test(await q.textContent(".ovr-sync")), "the opening progress overview shows when it last synced");
    await q.click("[data-a=ovrClose]");
    ok((await q.textContent(".greet")).includes("Jalen"), "greets Jalen");
    ok((await q.textContent(".psum")).includes("session"), "Family view opens with a sessions-only summary");
    ok(!/sleep|sore|energy/i.test(await q.textContent(".psum")), "the parent summary has no sleep or body data");
    // edits to different parts of the plan on two phones must both survive
    await p.evaluate(() => { S.links.push({ id: "lx", title: "Phone A link", url: "https://example.com", note: "" }); persist(); });
    await q.evaluate(() => { S.videos.push({ id: "vx", code: "VX", title: "Phone B video", url: "https://example.com/v", note: "" }); persist(); });
    for (let i = 0; i < 3; i++) { await settle(p); await settle(q); }
    ok(await p.evaluate(() => S.videos.some((v) => v.id === "vx") && S.links.some((l) => l.id === "lx")), "phone A has both edits after sync");
    ok(await q.evaluate(() => S.videos.some((v) => v.id === "vx") && S.links.some((l) => l.id === "lx")), "phone B has both edits after sync");
    // different days edited on two phones both survive
    await p.evaluate(() => { S.days[1].theme = "Phone A theme"; persist(); });
    await q.evaluate(() => { S.days[3].theme = "Phone B theme"; persist(); });
    for (let i = 0; i < 3; i++) { await settle(p); await settle(q); }
    ok(await p.evaluate(() => S.days[1].theme === "Phone A theme" && S.days[3].theme === "Phone B theme"), "phone A has both day edits");
    ok(await q.evaluate(() => S.days[1].theme === "Phone A theme" && S.days[3].theme === "Phone B theme"), "phone B has both day edits");
    const logsBefore = await q.evaluate(() => JSON.stringify(S.logs));
    await q.click("button[data-a=toggle]", { force: true });
    ok((await q.evaluate(() => JSON.stringify(S.logs))) === logsBefore, "Family view cannot log training");

    const cc = await browser.newContext(phone);
    const cpg = await cc.newPage();
    cpg.errors = []; cpg.on("pageerror", (e) => cpg.errors.push(e.message));
    await cpg.goto(url + "/index.html?coach=" + coach);
    await cpg.waitForSelector(".coachpage h1");
    await cpg.waitForFunction(() => !document.body.textContent.includes("Loading"));
    ok((await cpg.textContent(".coachpage")).includes("Tristan's training"), "coach page shows the summary");
    ok(!/slept|sore|energy/i.test(await cpg.textContent(".coachpage")), "coach page has no sleep, body or energy data");
    ok(cpg.errors.length === 0, "no errors on the coach page " + cpg.errors.join(";"));
    await p.click("[data-a=coachStop]"); await p.click("[data-a=coachStop]");
    await p.waitForFunction(() => !S.profile.coachCode);
    await cpg.reload(); await cpg.waitForSelector(".coachpage h1");
    await cpg.waitForFunction(() => !document.body.textContent.includes("Loading"));
    ok((await cpg.textContent(".coachpage")).includes("not active"), "stopping sharing removes the summary");

    console.log("Small phone");
    const sm = await browser.newContext({ ...devices["iPhone SE"], serviceWorkers: "block" });
    const sp = await sm.newPage();
    await sp.goto(url + "/index.html"); await sp.waitForSelector("#splash", { state: "detached" }); await finishWelcome(sp);
    await sp.evaluate(() => { const k = dateKey(new Date()); S.games.push({ id: "g", date: k, opp: "A very long opponent team name here", pts: 10, ast: 4, tov: 2 }); S.events.push({ id: "e", type: "game", title: "vs a very long team name", date: dateKey(addDays(new Date(), 1)), time: "16:00", place: "A long gym name and address" }); render(); });
    for (const v of ["today", "week", "videos", "log", "guide"]) { await tab(sp, v); ok(await sp.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "iPhone SE " + v + " has no sideways scrolling"); }
    await sm.close();

    console.log("Accessibility (light and dark)");
    for (const scheme of ["light", "dark"]) {
      const a = await boot(browser, url, scheme);
      await finishWelcome(a.page);
      await a.page.evaluate(() => {
        const k = dateKey(new Date());
        S.games.push({ id: "g1", date: k, opp: "Harlem", result: "W", pts: 12, ast: 6, tov: 2, stl: 1, good: "Found the open man" });
        S.events.push({ id: "e1", type: "game", title: "vs Bronx", date: dateKey(addDays(new Date(), 1)), time: "16:00", place: "Gym" });
        S.monthly = { id: "m1", title: "30 days of free throws", start: k, days: 30, done: { [k]: true } };
        Object.assign(logOf(k), { body: 1, sleep: 9.5, energy: 4 });
        render();
      });
      for (const v of ["today", "week", "videos", "log", "guide"]) {
        await tab(a.page, v);
        await a.page.addScriptTag({ content: axeSource });
        const res = await a.page.evaluate(async () => (await axe.run(document, { runOnly: ["wcag2a", "wcag2aa"] })).violations.flatMap((x) => x.nodes.map((n) => x.id + " :: " + n.target.join(" "))));
        ok(res.length === 0, `${scheme} ${v}${res.length ? " " + [...new Set(res)].slice(0, 4).join(" | ") : ""}`);
      }
      ok(a.page.errors.length === 0, `${scheme} no page errors ${a.page.errors.join(";")}`);
      await a.ctx.close();
    }
    ok(t.page.errors.length === 0 && q.errors.length === 0, "no page errors on the main flow " + t.page.errors.join(";") + q.errors.join(";"));
  } finally {
    await browser.close();
    server.close();
  }
  console.log(failed ? `\n${failed} check(s) failed` : "\nAll checks passed");
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
