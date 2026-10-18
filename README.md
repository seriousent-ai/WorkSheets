# Tristan's Basketball Training Plan (app)

An installable web app (PWA) for Tristan's weekly basketball plan. Works on phones, tablets and computers, offline, with no build step.

- **Today**: session checklist with per-block timers, coaching cue, videos, quick log, levels, week streak, celebration on finishing a session.
- **Week**: Monday to Sunday progress. **Videos**: V1 to V11, Jr. NBA at Home, add your own links or clips. **Log**: daily log, Saturday skill check, weekly reflection, achievements. **Guide**: plan notes, "My Why", backup and reset.
- Everything (sessions, blocks, videos, links, notes) can be added, edited, deleted and reordered. Data is stored on the device; use Guide > Export backup to move it.

## Run locally
`python3 -m http.server 8000` and open http://localhost:8000

## Install on a phone
Publish with GitHub Pages (Settings > Pages > Source: GitHub Actions; the workflow deploys `main`). Open the link in Safari, tap Share, then Add to Home Screen.
