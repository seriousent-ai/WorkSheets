# Rens Training (Tristan's basketball plan app)

An installable web app (PWA) for Tristan's weekly basketball plan with the NY Rens. Works on phones, tablets and computers, offline, with no build step.

## What is in it
- **Today**: the session with per-block timers and a guided mode, the morning check-in (body, sleep, rest or sick day), recovery score, game banner, monthly challenge, levels, week streak and cycle notes. Progress and skills sit under a "More" fold. Drill details have **Make this harder**, and game days show a pre-game checklist.
- **Week**: Monday to Sunday progress, the team schedule and calendar export.
- **Videos**: the drill videos, your own links, **Watch, then try it**, **Film notes**, **Film a drill**, **Compare clips** (side by side, slow motion, draw; works with clips on the phone and YouTube links), **Watch non-stop**, and a library of 324 suggested videos (ages 12 and up) and tutorial videos under every curriculum block and guides with a Level switch (Advanced by default). See `docs/VIDEO-LIBRARY.md`.
- **Log**: daily log, Saturday skill check, trends, **skill ladder**, **leadership goal**, shot chart with a heat glow and weekly comparison, **games** (record, assist to turnover, last five games) and a season goal, playbook, rewards and achievements.
- **Guide**: profile, family sync (with QR code), Family view, coach link, text size, sounds and voice, plan history and restore, clips on this phone, version and diagnostics, a "Test this phone" list, backups and a coach spreadsheet.
- Everything can be added, edited and deleted in the app. Data is stored on the device and can be shared between phones with a family code.

## Curriculum

Guide, Curriculum starts a 29-step curriculum from scratch (first step Tuesday, November 3, 2026). He does the steps in order and cannot move on until the current step is finished. Each block has tutorial videos, a Watched tracker shows how many he has seen, and Restore old progress can undo the start. See `docs/PROJECT-NOTES.md`.

## Family sync and Family view
Create a family code in Guide on one phone and join from the others (type it, share it, or scan the QR code). A parent or sibling turns on **Family view** (Guide, This device) to put their own name on their phone, see progress first, and avoid logging anything for Tristan. The optional **coach link** shares a read-only summary with no sleep, body or private notes.

## Run locally
`python3 -m http.server 8000` and open http://localhost:8000 (sync is off unless `firebase-config.js` has a project).

## Tests
`cd tests && npm install && npx playwright install chromium webkit && npm test`
The test runs the app in an emulated phone: core flow, every feature, two-phone sync, Family view, the coach page, the QR scan with a fake camera, a real video clip, and an accessibility audit in light and dark. Set `BROWSER=webkit` for the Safari engine. The same test runs in GitHub on every pull request.

## Install on a phone
Open the live link in Safari, tap the Share menu (or the three dots in newer iOS), then Add to Home Screen. See `docs/REAL-DEVICE-CHECKLIST.md` for a ten-minute check on each phone.

## Deploy
The workflow in `.github/workflows/pages.yml` publishes `main` to GitHub Pages and versions the offline cache by commit. More detail is in `docs/PROJECT-NOTES.md`.
