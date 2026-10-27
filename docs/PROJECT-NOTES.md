# Tristan's Basketball Training App: project notes

Last updated: 2026-10-18. Written so work can continue in a later session.

## What this is
An installable web app (PWA) for Tristan (age 12, point guard, 12U NY Rens Jr. EYBL) that turns his
weekly training plan PDF ("Tristan Weekly Basketball Training Plan", 7 pages) into a phone/tablet app.
No build step: plain HTML, CSS and JavaScript. Works offline. Family sync through Firebase Firestore.

Live app: https://seriousent-ai.github.io/WorkSheets/ (GitHub Pages, deployed by `.github/workflows/pages.yml`
on every push to `main`, or by running the workflow manually).

## Screens
- **Today**: NY Rens logo (upper left) and team name (upper right), greeting ("Good Morning, Tristan"), daily message,
  XP / week streak / level tiles, next-reward card, Point Guard Skills meters, Mon–Sun selector, dark hero card with
  progress ring, coaching cue, block checklist (check, per-block countdown timer, edit), day's videos, energy faces, "My Why".
- **Week**: weekly goal (sessions out of 6) and the seven days.
- **Videos**: V1–V11 from the PDF, Jr. NBA at Home banner, websites list (Jr. NBA at Home, NY Rens site, NBA youth guidelines).
  YouTube/Vimeo links play in the app; clips can be uploaded from the device (kept in IndexedDB, not synced).
- **Log**: week navigator, goals, daily log, Saturday skill check with personal bests, weekly reflection, rewards, achievements.
- **Guide**: profile and "My Why", plan notes from the PDF, Sync section, Send/Export/Import backup, reset.
Everything (days, blocks, videos, links, notes, rewards, profile, logs) can be added, edited and deleted.

## Design pass: Phase 1 (done)
- Compact Today: small header (logo left, team and sync dot right), one-line greeting, day selector, dark hero card with ring,
  the coaching cue inside the hero, then the block list. XP, streak, level, reward and skills moved to a "Your progress" section below.
- **Start session** button opens a guided full-screen mode: one block at a time, big countdown ring, pause/resume, Done (marks the block, moves on),
  Skip, "Up next" line, screen stays awake, beep and vibration at zero (auto-marks done and advances). Per-block play buttons start it at that block.
- Cleaner block rows: "Details" collapses the instructions, 44 pt buttons, the next block is highlighted ("Up next"), finished blocks fade.
- The sync status dot sits next to the league name in the header.
- Remaining plan (Phases 2 and 3) is in the game plan page: finish summary sheet, custom icon set, week strip, video thumbnails,
  progress charts, first-run welcome, optional parent passcode, iPad layout.

## Design pass: Phase 2 (done)
- Finish summary overlay when the last block is completed: XP earned today, level-up moment, skill level-ups, rewards unlocked,
  next reward progress, sessions this week and streak, a daily line.
- Custom SVG icon set (`ICON_PATHS` and `badge()` in `app.js`) replaces emoji for levels, skills, achievements, rewards and the lock.
  Mood faces and confetti still use emoji.
- Week tab: a strip of seven progress rings above the day list.
- Videos: YouTube thumbnails, "Watch first today" group, "Watch first" and "Watched" tags, Mark watched (+5 XP).
  Watched state is stored in the day's log (`logs[date].watched`), so it syncs.

## Design pass: Phase 3 (done)
- Log tab: **Trends** (a sparkline per skill-check measure with change vs last week and personal-best marker, plus an XP-per-week bar chart)
  and **Share weekly report**: builds a text summary and a 1080x1350 PNG card (canvas) and shares both with the system share sheet
  (falls back to copying the text).
- **First-run welcome** on a fresh device (no logs, no family code): name, "My Why", then offer to create a family code, join, or skip.
  `profile.onboarded` syncs, so a device that joins a family does not see it again.
- The parent passcode that was built in Phase 3 was removed in Phase 4 (not wanted).
- **iPad / wide screens**: Today and Log use two columns at 900 px and wider.

## Phase 4: fine-tuning (done)
- Deploy fix: the Pages workflow now copies every file the page loads (it had left out `sync.js` and `firebase-config.js`) and names the offline cache after the commit.
- Light-mode contrast raised to WCAG AA (tokens `--label2`, `--blue-text`, `--green-text`, `--red-text`); an axe audit on every tab at iPhone SE size reports no violations in light or dark.
- The selected day resets when the app returns on a new day; landscape guided layout; reward unlocks announced together; Home Screen label is "Rens Training".

## Phase 5: interactive features (done)
- **Sound, voice, haptics** (Guide, preferences stored locally): swish on a finished block, chime on level-up or reward, spoken cues in the guided timer (start, halfway, one minute, ten seconds, time up).
- **Counters in the guided session**: shooting blocks get five spot buttons with Made/Missed (stored in `logs[date].shots[spot] = {m, x}`); other blocks get a +1 / minus rep counter (`logs[date].reps[blockId]`). Totals appear in the finish summary.
- **Note for Tristan** (Guide): one note, synced through the plan (`S.note`), shown on Today until "Got it".
- **Weekly challenge** (+25 XP), **morning check-in** (body today, sleep hours, +5 XP each), **personal bests** on the Log tab.
- **Film study**: five questions from the plan, self-scored, +20 XP, saved in the day's log (`logs[date].film`).
- **Calendar export**: Week tab builds a standard `.ics` file (events with alerts) for 1 or 4 weeks and opens the share sheet or downloads it.
- **Reminder notification** (best effort): fires only while the page can run (installed to the Home Screen, newer iOS); the calendar alerts are the reliable reminder.

## Phase 6: bundle (done)
- **Player card**: overall rating and five skill ratings from skill points (`45 + 50 * (1 - exp(-points / 250))`), tier by level (bronze, silver, gold, diamond), jersey number in the profile, shareable PNG.
- **Four-week cycle**: `profile.cycleStart` (a Monday); Today shows the cycle week and focus, and from week 2 a comparison with the week 1 baseline. Guide can restart the cycle.
- **Hours guardrail**: counts organized basketball hours (training sessions plus team practice or games logged in the daily log) against the plan's 10-hour weekly ceiling with warnings at 8 and over 10, and a rest-day nudge.
- **Shot chart**: heat map of the five spots from tracked shots (last 4 weeks or all time).
- **Playbook**: 12 habit cards from the plan, unlocked every 120 XP; new cards appear in the finish summary.
- Launch splash with the Rens logo.

## Progress overview (for a parent)
- Log tab and Guide have a **Progress overview** button. The screen shows, for the current week: sessions done, level, overall rating, XP and streak;
  a "Worth a conversation" box (sore days, average sleep under 9 hours, 8 or more hours of basketball, no sessions by Thursday);
  a day-by-day list with body, sleep, energy, team minutes and film study; hours, sleep, shot percentage, challenge and latest film score;
  skills; and what Tristan wrote after training. It shows when the phone last synced and the latest activity from his phone, and warns if this phone
  has not joined the family code. Refresh asks for new data. It reads the same synced data as every other screen.

## Motivation system
- XP: +10 per finished block, +50 per finished session, +5 per video watched, +5 energy rating, +5 notes, +25 skill check, +15 reflection.
- Levels by finished sessions: Rookie 0, Ball Handler 5, Playmaker 15, Floor General 30, All-Star 60, Franchise PG 100.
- Skills (levels at 0/30/80/150/250/400/600 points): ball handling, passing and reads, shooting, finishing and defense, court IQ.
  A block counts toward a skill by matching words in its title (see `SKILLS` in `app.js`).
- Week streak: consecutive weeks with 4+ finished sessions (rest days never break it).
- Rewards (editable, default: Pick Sunday's film clip 100 XP, Family movie night 300, New training gear 600,
  Special basketball outing 1000). Confetti on session complete and on unlocking a reward.

## Files
- `index.html`, `styles.css`, `app.js` (views, forms, actions), `data.js` (default plan from the PDF, rewards, profile)
- `sync.js` (family sync), `firebase-config.js` (Firebase project id and web API key; safe to ship, access is by rules)
- `sw.js` (offline cache; bump `CACHE` when assets change), `manifest.webmanifest`
- `icons/team-logo.png` (header logo), `icons/icon-192.png`, `icon-512.png`, `apple-touch-icon.png` (Rens "R" on white, Home Screen icon)
- `firestore.rules` (rules to paste in the Firebase console), `.github/workflows/pages.yml`

## Storage
- `localStorage["tristan-plan-v1"]`: the whole app state (`days`, `videos`, `links`, `notes`, `rewards`, `profile`, `logs[date]`, `weekly[monday-date]`, `planTs`).
- `localStorage["tristan-sync"]`: family code, last sync time, content hashes.
- IndexedDB `tristan-files`: uploaded video clips. The team logo can also be replaced in Guide, Edit profile (stored in `profile.logo`).

## Sync (Firebase)
- Project: **Tristan's Basketball App**, project id `tristan-s-basketball-app`, Firestore in production mode, location us-east4. Spark (free) plan.
- Uses the Firestore REST API (no SDK). Data lives at `families/{code}/items/{plan | log-YYYY-MM-DD | wk-YYYY-MM-DD}`, each `{json, ts}`.
- The 20-character family code is the password. Anyone with it can read and write that family's data.
- Rules (`firestore.rules`) allow read/write only on `families/{familyId}/items/{itemId}`; listing families is not possible.
- Newest `ts` wins per item. Polls every 15 s while the app is visible, on reconnect and on focus. Offline changes upload later.
- Not synced: uploaded video clips.
- Tested end to end only against a local mock (two simulated devices: create code, wrong code rejected, join, edits both ways).
  **Not yet tested against the real Firebase.** The rules must be published in the console (Firestore Database > Rules > Publish);
  this had not been confirmed when these notes were written.

## Status and next steps
1. Confirm the Firebase rules are published, then test sync: Tristan's phone Guide > Create a family code, parent's phone Guide > Join.
2. Install on both devices (Safari > Share > Add to Home Screen). Re-add if an old icon is cached.
3. Optional: rename the Home Screen label from "Training" to something like "Rens Training" (`apple-mobile-web-app-title` in `index.html`, and `short_name` in the manifest).
4. Optional ideas: parent passcode so only the parent can edit the plan; push notifications or reminders; per-block timestamps to merge same-day edits from two devices instead of newest-wins.
5. Keep the repo's Firebase key in mind: restricting the key to the app's web address in Google Cloud is optional hardening.

## Working on it
- Run locally: `python3 -m http.server 8000`, open http://localhost:8000
- Test in a phone emulator with Playwright (`devices['iPhone 14 Pro']`). Local sync testing used a small mock Firestore server and overrode `firebase-config.js`
  with `host: "http://localhost:PORT"` (the `host` option exists for that).
- The cloud environment blocks nyrhoops.org and firebase hosts; logo and Firebase values were supplied by the user.
- Claude artifacts made during the build: a game plan page and an iPhone/iPad simulator page (the simulator copy is from before sync was added).


## Phase 7 (built after the family started using it)

Files: `extras.js` holds the newer features; `tests/` holds the phone-emulator check (`npm test` from `tests/`), which also runs in GitHub on every pull request.

- Game log (Log), team schedule (Week), recovery score and monthly challenge (Today), family recap picture (progress overview), Film a drill and Compare clips (Videos), read-only coach page (`?coach=CODE`, switched on in Guide, needs family sync).
- Plan sync is split into pieces (`plan-days`, `plan-videos`, `plan-links`, `plan-notes`, `plan-rewards`, `plan-profile`, `plan-misc`) so edits to different pieces on two phones both survive. Two edits to the same piece still overwrite each other. The old single `plan` record is read only if no pieces exist.
- Plan history: one snapshot a day on each device (last eight), restorable in Guide. Progress logs are not part of it.
- Family view (Guide, This device): a per-device name for a parent or sibling. It opens on the progress overview, blocks taps that would log training, and never writes logs back.
- Player card photo is kept on that phone only (`tristan-photo` in local storage).
- Text size (Normal, Large, Larger) uses CSS zoom on that phone only. It works in the emulator; confirm it on a real iPhone.
- Coach page shows first name, sessions, skill ratings, recent games and the week's priority. It writes a summary under its own code (`families/{coachCode}/items/summary`) and deleting the link deletes the summary.
- XP count-up, check-mark pop, update banner, clearer sync errors and 44-point tap areas.

Privacy review (Oct 2026): no last name, email address or token is in the current files. The Firebase web key in `firebase-config.js` is meant to be public. The old last name is still in git history. The repo is public so free hosting works. `firestore.rules` in the repo is a proposed tighter version; the live rules are whatever is published in the Firebase console.

Not built: real push notifications (needs a server on a paid Firebase plan), Firebase App Check (needs console setup), dark and tinted Home Screen icons (iOS does not apply them to web apps as far as I can tell).

## Phase 8

- `vendor/` holds the QR code maker (MIT) and scanner (Apache 2.0), loaded only when needed.
- Plan sync is one record per day (`plan-day-<id>`) plus `plan-videos`, `plan-links`, `plan-notes`, `plan-rewards`, `plan-profile` and `plan-misc` (note, games, events, monthly, badges, goal). Same-day logs on two phones are merged (checked blocks are unioned; an un-check made on one phone can come back from the other).
- Device-only settings live in `tristan-prefs` (sound, voice, text size, Family view name, the More fold, the phone test list). Other device-only keys: `tristan-photo`, `tristan-snapshots`, `tristan-errors`, `tristan-milestones`, `tristan-tz`.
- Compare with YouTube uses the player's postMessage commands (play, pause, seek, rate). It could not be tested against live YouTube from the build machine, only against a stand-in.
- The checks workflow runs the emulator test in Chromium and in the Safari engine (WebKit); the WebKit run does not block a merge yet.


## Phase 9 (advanced content, built after the first month)

Tristan is past intermediate and heading toward advanced, so this phase added level-aware content and the Track 7 features from the game plan. Everything is merged and deployed (pull requests 14 to 23).

### Video library
- `SUGGESTED_VIDEOS` in `data.js`: 274 entries across Offense, Defense, Teamwork, Point guard and Warm-up. Each has `id`, `cat`, `group`, `code`, `level` (2 Intermediate, 3 Advanced; no Basics), `title`, `url`, `src`, optional `note`, and either `yt` (a YouTube video id) or `list` (a playlist id). Entries without `yt` or `list` are web pages and open in the browser. The full list is in `docs/VIDEO-LIBRARY.md`.
- Titles and links came from web searches. None were watched and the build machine could not open YouTube. Expect a few that do not fit or will not embed. Parents can Hide any entry (`S.sugHidden`, synced).
- Videos tab: **Watch non-stop** (a topic plays as one YouTube playlist, up to 60 videos, optional shuffle), a **Level** switch (default Advanced only, stored as `Prefs.libLevel`), **Paste a YouTube link** (reads the clipboard, adds a video or playlist), and a collapsible library per topic with Play, Add to my videos and Hide.
- To add entries: append an object to `SUGGESTED_VIDEOS` in `data.js` with a unique `id`, `code` and `url`. Playlist and `embed/videoseries` support is in `embed()` in `app.js`.
- Plain, natural search phrasing (for example "advanced passing drills for point guards YouTube") found real videos. Long operator-style queries mostly found written articles.

### Track 7 features
- **Skill ladder** (Log): `LADDER` in `data.js`, five rungs for each of the five skills, each with a test. Passing a rung is +30 XP (`S.ladder`, synced).
- **Game stats** (Log, Games): record, steals per game, and the last five games against the season for assist to turnover, points and assists.
- **Shot chart**: a heat glow per spot, each spot against the four weeks before (needs five or more shots in both periods) and a line naming the most improved and weakest spot.
- **Make this harder** (Today, drill Details): `LEVELUP` in `data.js`, a harder version by block kind and weekday (`S.levelUp`, synced).
- **Watch, then try it** (Videos): `DECISIONS` in `data.js`, seven advanced videos each paired with a short drill, +15 XP (`S.watchTry`, synced).
- **Film notes** (Videos): one thing seen, one thing to fix, +5 XP (`S.filmNotes`, synced).
- **Game day** (Today): a pre-game checklist on days with a scheduled game (`logs[date].pre`), and the game form now has one mistake and one change for next time.
- **Leadership goal** (Log): a weekly prompt from `LEAD_PROMPTS`, +15 XP when done, stored in the weekly record as `lead`.
- **This week in plain words**: a short paragraph at the top of the parent progress overview, also added to the shared weekly report.
- The profile level was changed from Intermediate to Advanced. Existing phones are updated once at load if the subtitle still has the default text.

### Sync and storage changes
- `plan-misc` now also carries `sugHidden`, `ladder`, `levelUp`, `watchTry` and `filmNotes`.
- Device-only: `tristan-prefs` gained `libOpen` (open topics), `shuffle` and `libLevel`.
- `bonusXp()` in `extras.js` adds ladder, watch-then-try and film note XP to `xpTotal()`; leadership XP is added in `xpTotal()` itself.

### Tests
- `tests/smoke.js` covers the library (counts, unique ids, level filter, non-stop playlist, add, hide, unhide, link paste) and each Track 7 feature. It passes in Chromium and in WebKit in GitHub.

### Process notes
- Each change went through a pull request that passed both browser checks before being merged with "merge it". The branch `claude/laughing-lamport-8emsog` is reset to main after each squash merge.
- The Claude artifacts are the game plan (Track 7 is in it), the iPhone and iPad simulator (republished after each merge on request) and the screens gallery (last updated before Phase 9).

### Not done or not verifiable from the build machine
- Watching the videos, and whether each one embeds in the app.
- Real-device checks on both phones (see `docs/REAL-DEVICE-CHECKLIST.md`), real Firebase rules testing, push notifications, App Check and dark or tinted Home Screen icons.
- Ladder tests, harder drill versions and leadership prompts cannot be edited in the app yet. They live in `data.js`.


### Curriculum (added after Phase 9)
- `curriculum.js` holds `CURR_START` (2026-11-03), `CURR_DAYS` (Tuesday and Friday), `WEEK_FIT` (the plan around his real schedule: Rens practice Saturday and Sunday, skills training Sunday and Thursday, league game Wednesday) and `CURRICULUM` (29 steps: 4 cycle weeks x 6 sessions + a check-up each, then a finish line).
- State: `S.curr = { on, step, date, finished }` and `S.progressFrom`, both in the synced `misc` piece. On Tristan's phone `currTick()` runs at launch and when the app returns to the foreground. If the last step day's log is complete the step advances; otherwise the same step is placed again on the new step day. Phones in Family view never advance the step.
- The step is written into that weekday's entry in `S.days` (block ids `c<step>-<n>`), so the Today screen, guided session and XP work as before. Blocks marked `optional` (videos) do not count toward completion. A block's `act` field links it to the skill ladder (`ladder:<skill>:<rung>`) or Watch, then try it (`wt:<id>`).
- Only today's work can be checked off, and nothing before `CURR_START`.
- Start from scratch (`startCurriculum()`): snapshot (with events), a full backup in `tristan-backup-before-restart`, progress and games cleared, `progressFrom` set, weekday plan and repeating events applied. `pruneBefore()` and the sync apply step drop anything dated before `progressFrom`.
- Repeating events: `repeat: "weekly"` on an event, expanded by `eventsOn(date)` and `occurrences()`.

### Library cleanup and tutorials (merged in #37)
- The library was cut to 223 entries aimed at ages 12 and up (126 Intermediate, 97 Advanced, no Basics). Videos for young children, beginners and Jr. NBA kids were removed. Of the 223, 188 play in the app and 35 open in the browser. The generator is a scratch Python script (`build_lib.py`, not in the repo): it appends the `SUGGESTED_VIDEOS` block to the end of `data.js`, so `data.js` must be stripped from `/* Suggested videos` onward before regenerating. Ids (`s-<code>`) are not renumbered after removals.
- Tutorials: curriculum blocks carry a `tut` array of YouTube ids (maps `TUT_WARM`, `TUT_SESSION`, `TUT_LADDER`, `TUT_FILM`, `TUT_LEAD` in `curriculum.js`). `tutHtml(b)` in `extras.js` shows them as "How to do it (videos)" under the block details; each pill calls `sugPlay`. The smoke test checks every id resolves to a library video.
- Titles and links came from searches and were never watched. A parent should skim the list and use Hide on anything that does not fit.

### Where we stopped (to continue later)
- Merged and live on GitHub Pages: curriculum engine, real weekly schedule, start from scratch, cleaned library, tutorials. The simulator artifact is at version 24 (matches main). The game plan artifact (v19) and the screens gallery do not yet show the curriculum, schedule or tutorials.
- Nothing has been started on Tristan's phone. To begin: update both phones (Guide, Check for an update), then once on Tristan's phone open Guide, Curriculum, Start from scratch. Step 1 appears Tuesday, November 3, 2026. The backup of old progress stays on his phone only and has no restore button.
- Ideas not built yet: an "All topics" chip to play everything non-stop (call `watchAll` with category all); a "watched" tracker (`S.libSeen` with a Mark watched pill, a counter, synced in `misc`, cleared in `startCurriculum`); more search rounds for advanced videos for ages 12 and up; a restore button for the progress backup; a weekly-hours guardrail (about 8 hours of team practice plus two 1-hour sessions is roughly 10 hours); updating the game plan and gallery artifacts.
- Not verified: the app on a real phone, whether each video embeds, and iPhone video stopping when the screen locks (web apps generally do not keep playing).
- Rules for working here: merge only when the owner says "merge it"; both browser checks must pass first; no force pushes; reset the branch to main after each squash merge.


### Follow-up features (after the curriculum)
- Watched tracker: `S.libSeen` (video id to date, in the synced `misc` piece), `isSeen(v)`, actions `sugSeen` and `sugHideClose`. Cleared by `startCurriculum()`. `sugSeen` and `currRestoreDo` are in `PARENT_BLOCKED`, so Family view phones cannot change them.
- Restore old progress: `readBackup()`, `restoreOldProgress()`, actions `currRestoreAsk` and `currRestoreDo`. It reads `tristan-backup-before-restart`, saves the current state to `tristan-backup-before-restore`, replaces `S`, and sets `S.curr` off and `S.progressFrom` empty so sync accepts the older data. It works only on a phone that still has the backup.
- `S.curr.carried` is set by `currTick()` when a step comes back unfinished, and `currCard()` explains it. `currDone()` is the finished-steps count used by the card and the plain-words week.
- `plannedLoad(monKey)` in `extras.js` returns planned hours (team events plus the required blocks of his step days). `hoursCard()` in `app.js` shows it on Week. The older actual-hours guardrail (`weekLoad`, 10-hour ceiling) is unchanged.
- Customize: `S.leadExtra` (extra leadership goals, read through `leadAll()`) and `S.ladderEdit` (`"skill:rung"` to wording, read through `ladderText()`); both synced in `misc`. `placeStep()` applies reworded ladder tests to newly placed steps.
- Not built, on purpose: audio-only playback (iPhone web apps stop video when the screen locks), a Family-view restore, and editing the other drill text in the app.
