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

## V0.2 — Private Beta (branch `beta`)

The `beta` branch wraps the unchanged V0.1 journey in an invitation-only
beta: **Protection → Access → Consent → Experience → Feedback.**

- **Access** — a separate, isolated Supabase project (never the production
  AXZIO project). Testers sign in with a verified email; access exists only
  after redeeming a single-use, expiring invitation whose email matches
  the sign-in email. Tokens are stored server-side as SHA-256 hashes only.
  All enforcement is server-side Row Level Security — a shared URL alone
  grants nothing, and browser storage plays no part in access decisions.
- **Consent** — before the journey, each tester must accept the versioned
  Beta Testing Agreement ("I Agree & Join Beta", unchecked boxes, 18+
  confirmation). The acceptance is recorded server-side with the agreement
  version and a server-generated timestamp; the exact accepted text stays
  retrievable from `beta_agreements` (versions are immutable).
- **Privacy** — journey answers and Identity State Cards still live only
  in the tester's browser localStorage. The server holds only access,
  consent, voluntary feedback, and content-free usage counts.
- **Feedback** — after BEGIN: optional 1–5 clarity rating, short feedback,
  bug report, and a separate follow-up-contact permission.
- **Admin** — `#/admin` (code-split, server-authorized): invite testers,
  view invitation/acceptance status, revoke access, review and export
  feedback (CSV), view aggregate metrics, manage agreement versions, and
  delete a tester's beta data.

**Setup** (one-time, by the organizer): create the isolated Supabase
project → run `supabase/beta-schema.sql` → paste the project URL + anon
key into `src/beta-config.js` → run the admin bootstrap at the bottom of
the schema file. Drafts for attorney review live in `docs/`
(`BETA_AGREEMENT_DRAFT.md`, `PRIVACY_NOTICE_DRAFT.md`), plus
`TESTER_INVITE.md` and the `PRELAUNCH_CHECKLIST.md` that must be completed
against the live environment before the first invite is sent. While the
backend is unconfigured, the app shows a "beta isn't open yet" holding
screen — the journey is never publicly reachable from this branch.

Verify with `npm run build` and `npm run test:harness` (journey harness
33 checks + beta-gate harness 31 checks, including storage-tampering and
revocation scenarios against a fake backend).

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
