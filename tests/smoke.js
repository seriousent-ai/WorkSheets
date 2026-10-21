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

async function boot(browser, url, scheme = "light") {
  const ctx = await browser.newContext({ ...phone, colorScheme: scheme });
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
    ok(await p.locator("details.more").count() === 1 && await p.evaluate(() => !document.querySelector("details.more").open), "More fold starts closed");
    await p.click("details.more > summary");
    await p.waitForFunction(() => Prefs.moreOpen === true);
    ok(true, "opening More is remembered");
    ok((await p.evaluate(() => document.documentElement.scrollHeight)) > hClosed, "Today is shorter with More closed (" + hClosed + " px)");
    await p.click("details.more > summary");
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
    await p.evaluate(() => { const el = document.querySelector(".hero"); const mk = (x) => new Touch({ identifier: 1, target: el, clientX: x, clientY: 300 }); el.dispatchEvent(new TouchEvent("touchstart", { touches: [mk(300)], changedTouches: [mk(300)], bubbles: true })); el.dispatchEvent(new TouchEvent("touchend", { touches: [], changedTouches: [mk(120)], bubbles: true })); });
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
    await p.click("details.more > summary");
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
    await p.evaluate(() => { window.__yt = []; const orig = Window.prototype.postMessage; });
    await p.click("[data-a=cmpOpen]");
    await p.selectOption("#cmp-b", "yt1");
    await p.waitForSelector("iframe.cmp-yt");
    ok(await p.evaluate(() => document.querySelector("iframe.cmp-yt").src.includes("enablejsapi=1")), "a YouTube clip loads with its player controls switched on");
    await p.evaluate(() => { const f = document.querySelector("iframe.cmp-yt"); window.__sent = []; f.contentWindow.postMessage = (m) => window.__sent.push(m); });
    await p.click("[data-a=cmpRate][data-r='0.5']");
    await p.click("[data-a=cmpPlay]");
    const sent = await p.evaluate(() => window.__sent.map((m) => JSON.parse(m).func));
    ok(sent.includes("setPlaybackRate") && sent.includes("playVideo"), "slow motion and play reach the YouTube player (" + sent.join(",") + ")");
    await p.click("[data-a=cmpClose]");
    await p.evaluate(() => { S.videos = S.videos.filter((v) => v.id !== "yt1"); });
    ok((await p.locator(".cmp").count()) === 0, "compare screen closes");

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
        await p.click("[data-a=close]");
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
