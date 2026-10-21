# AXZIO | ARRIVAL

**V0.1 — isolated MVP / proof of concept.**

A NE3ULA ecosystem product. Core promise: *from awareness to action.*
Philosophy: *know your energy, direct your energy.* Brand mission: **LIVE YOUR LEGEND.**

ARRIVAL is the smallest complete expression of AXZIO: a 2–3 minute guided
journey that moves a person from mental noise to one intentional next step.

1. **Awareness** — "Where are you right now?" (Clear / Scattered / Overwhelmed /
   Stuck / Energized / Unsure, plus an optional note in your own words)
2. **Arrival** — "Set aside what everyone else expects. What matters most to
   you right now?" (free text, with optional gentle prompts)
3. **Choice** — "What is one thing you choose to move toward?" then
   "What is one small step you can take?"
4. **Action** — an **Identity State Card** (state, what matters, choice, next
   action, date/time), a **BEGIN** action, and the closing statement:
   *LIVE YOUR LEGEND.*

It is fully independent of the main AXZIO platform: no accounts, no backend,
no cloud sync, no AI, no analytics. It validates one hypothesis — *can a
simple, structured experience help someone move from uncertainty into
clarity, self-authorship, and intentional action?*

## Run it

```bash
npm install
npm run dev       # local dev server
npm run build     # production build → dist/
npm run preview   # serve the production build locally
npm run test:harness   # jsdom acceptance test (33 checks)
```

## Publish

The build is a static site with relative asset paths (`base: "./"`), so it
works from any static host and any subpath.

- **GitHub Pages (default):** pushing to `main` runs
  `.github/workflows/deploy.yml`, which builds and deploys automatically.
  One-time setup: repo **Settings → Pages → Build and deployment → Source:
  GitHub Actions**.
- **Any other host:** run `npm run build` and serve the `dist/` folder.

Live: https://ne3ula.github.io/axzio-arrival/

## Storage

- All data lives in the browser's `localStorage` under one key:
  `axzio-arrival:v1`.
- It holds exactly one session — the most recent — including the current
  stage, so closing or refreshing the app never loses progress.
- Nothing is transmitted anywhere. "Clear my data" (footer, two-tap confirm)
  erases it.
- Starting a new session replaces the previous card (by design for V1).

## Implementation notes

- **Stack:** Vite + React 18, plain CSS (no UI framework). Theme tokens and
  motion language adapted from the main AXZIO app; visual identity follows
  the NE3ULA Ecosystem Vision (deep navy, electric cyan, luminous, calm).
- **Guidance model:** prompts are carefully authored and deterministic.
  There is no AI inference and the UI never implies any — the flow is
  structured so a future AI.d layer can personalize prompts and notice
  patterns without changing the journey's shape.
- **Card export:** the Identity State Card renders to a 1080×1350 PNG on a
  canvas (no dependencies) and uses the native share sheet when available,
  otherwise downloads the file.
- **PWA:** installable (manifest + generated icons); a minimal service
  worker caches the app shell so it works offline after first load.

## V0.1 limitations

- Single-session history — no list of past cards yet.
- Card export is canvas-rendered (not a screenshot), so its layout is a
  faithful twin of the on-screen card rather than a pixel copy.
- No accounts, sync, or notifications — intentionally out of scope.
