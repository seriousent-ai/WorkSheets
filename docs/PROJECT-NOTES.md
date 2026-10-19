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
