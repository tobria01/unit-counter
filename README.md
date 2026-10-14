# Unit Counter

A minimal PKU companion: track your daily protein units and your protein
supplement in a few seconds, right from your iPhone home screen.

No food databases, no accounts, no server — everything stays on the phone.

## Features

- **Daily unit allowance** — configure how many units you may eat per day (any decimal, e.g. `10` or `7.5`)
- **Fast logging** — type the amount on the big keypad and tap **Log**; tapping Log without typing registers `1` unit
- **Protein supplement** — separate counter with its own daily target; one tap on **+** logs a serving
- **Undo** — undoes the last action (units or supplement) and tells you what it was
- **04:00 → 04:00 day** — counters reset automatically at 4 AM, so late-night eating still counts to the previous day
- **Meal prep calculator** — label big batches: add ingredients (80/60/50 divisor + protein per 100 g + grams in batch), enter the total weight, and get **grams per unit** for the finished prep. Save preps by name for later reuse
- **100 % offline** — after installing it to your home screen, it works without internet; data is stored only on the device

## Install on iPhone (one time)

1. Push this repo to GitHub (`main`).
2. In the repo: **Settings → Pages → Source: GitHub Actions** (one-time switch).
3. Open `https://tobria01.github.io/unit-counter/` in Safari.
4. Tap **Share → Add to Home Screen**.

From now on, open it from the home-screen icon — it runs fullscreen and fully offline.

## Usage

- **Log units:** type e.g. `1.5` on the keypad → tap the green button. Done.
- **Log a supplement:** tap the orange **+**.
- **Made a mistake:** tap **Undo** (repeatable).
- **Meal prep (calculator icon):** for batch cooking — for each ingredient choose the divisor (80/60/50), enter its protein per 100 g and the grams you used; the app sums the units. Enter the total weight of the finished prep to get **how many grams equal one unit** (plus units per 100 g) — the number for your label. Save preps by name; tap a saved prep to reload it, ✕ to delete. The in-progress calculation survives closing the app.
- **Settings (⚙):** daily allowance, supplement name, supplement daily target.
  Changes save immediately. Clear the supplement name to hide the supplement card.
- Going over budget is never blocked — the number just turns red.

## Development

Plain HTML/CSS/JS with no build step.

```sh
python3 -m http.server 8000   # then open http://localhost:8000
```

- `app.js` — all logic and UI state
- `sw.js` — service worker cache; **when you change any asset, bump `CACHE` in `sw.js` and `APP_VERSION` in `app.js` together** so devices pick up the update
- `manifest.json` — PWA manifest
- `icons/generate.py` — regenerates the PNG icons (needs Pillow)

### Updates on the phone

After pushing a change, just open the app once with internet — it detects the
new version and refreshes itself in place. The running version is shown at the
bottom of Settings, so you can always tell whether the phone is up to date.

### How the day key works

The day runs 04:00 → 04:00 local time. The day key is simply the local
calendar date of `now − 4 hours`, so anything eaten between midnight and
03:59 belongs to the previous day. Only today's data is kept — no history.
