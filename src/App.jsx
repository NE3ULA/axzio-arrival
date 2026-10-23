import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { newSession, loadSessions, saveSessions, clearStoredSessions } from "./store.js";
import { exportCardImage } from "./exportCard.js";
import { api } from "./beta.js";
import Gate from "./gate.jsx";

const Admin = lazy(() => import("./admin.jsx"));

/* AXZIO | ARRIVAL — V0.2.6
   A single guided journey: Awareness → Arrival → Choice → Action.
   Finished journeys become cards in a persistent on-device deck —
   beginning a new arrival adds a card, it never replaces one.
   V0.2.3 added an organizer password sign-in (testers keep email links).
   V0.2.4 added persistent Current / Deck navigation.
   V0.2.5 fixes the password form's autofill dead end (paired fields;
   a missing email explains itself instead of a silent disabled button).
   V0.2.6 gives Step 1 a Back button (steps out to the deck — the draft
   is already saved, so leaving loses nothing).
   Deterministic, authored prompts only — no AI is implied or used.
   All data stays in localStorage on the user's device. */

const STATES = ["Clear", "Scattered", "Overwhelmed", "Stuck", "Energized", "Unsure"];

const GENTLE_PROMPTS = [
  "What would you choose if nobody else's opinion counted?",
  "What keeps pulling at your attention today?",
  "What do you need more of right now?",
  "What would “enough” look like today?",
  "If today could move only one thing forward, what would it be?",
];

const STAGE_NAMES = ["Awareness", "Arrival", "Choice", "Action"];

function TriangleMark({ size = 30 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <path d="M24 5 L43 40 L5 40 Z" stroke="#56c8f5" strokeWidth="2.6" strokeLinejoin="round" />
      <path d="M24 24 L33 40 L15 40 Z" stroke="#56c8f5" strokeWidth="2.2" strokeLinejoin="round" />
    </svg>
  );
}

function formatWhen(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  const date = d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${date} · ${time}`;
}

function formatDay(ts) {
  if (!ts) return "";
  return new Date(ts).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
}

function Progress({ stage }) {
  return (
    <div className="progress" aria-label={`Step ${stage} of 4 — ${STAGE_NAMES[stage - 1]}`}>
      <div className="progress-track">
        {STAGE_NAMES.map((name, i) => (
          <span key={name} className={`progress-seg${i < stage ? " on" : ""}`} />
        ))}
      </div>
      <div className="progress-label">
        Step {stage} of 4 — {STAGE_NAMES[stage - 1]}
      </div>
    </div>
  );
}

function Card({ session }) {
  return (
    <div className="card" data-testid="identity-card">
      <div className="card-head">
        <TriangleMark size={26} />
        <div className="card-brand">AXZIO&nbsp;|&nbsp;ARRIVAL</div>
        <div className="card-when">{formatWhen(session.cardAt || session.createdAt)}</div>
      </div>
      <div className="card-rule" />
      <div className="card-field">
        <div className="card-label">My current state</div>
        <div className="card-value">
          {session.state}
          {session.stateNote ? <span className="card-note"> — {session.stateNote}</span> : null}
        </div>
      </div>
      <div className="card-field">
        <div className="card-label">What matters to me</div>
        <div className="card-value">{session.matters}</div>
      </div>
      <div className="card-field">
        <div className="card-label">What I choose</div>
        <div className="card-value">{session.choice}</div>
      </div>
      <div className="card-field">
        <div className="card-label">My next action</div>
        <div className="card-value">{session.step}</div>
      </div>
      <div className="card-foot">LIVE YOUR LEGEND</div>
    </div>
  );
}

function sessionHasContent(s) {
  return Boolean(s && (s.state || s.matters || s.choice || s.step));
}

function sessionTitle(s) {
  return (s.choice || "").trim() || (s.matters || "").trim() || (s.stateNote || "").trim() || "Untitled arrival";
}

/* Landing rule: no cards yet → straight into a fresh journey; exactly
   one card → open on it (a draft resumes mid-journey; a begun/completed
   card shows itself); more than one → the stack is home. */
function initJourneyState() {
  const stored = loadSessions();
  if (stored.length === 0) {
    const s = newSession();
    return { sessions: [s], activeId: s.id, view: "journey" };
  }
  if (stored.length === 1) {
    const s = stored[0];
    return { sessions: stored, activeId: s.id, view: s.status === "draft" ? "journey" : "card" };
  }
  const latest = stored.reduce((a, b) => (b.createdAt > a.createdAt ? b : a), stored[0]);
  return { sessions: stored, activeId: latest.id, view: "stack" };
}

/* The deck — home base for everything you hold. Open cards first,
   in-progress drafts resumable, completed cards kept as history. The
   card you're working on is marked Current; tapping any card opens it
   and makes it current. Beginning a new arrival adds to the deck; it
   never replaces. */
function DeckView({ sessions, activeId, onOpen, onNew }) {
  const drafts = sessions
    .filter((s) => s.status === "draft" && sessionHasContent(s))
    .sort((a, b) => b.createdAt - a.createdAt);
  const open = sessions
    .filter((s) => s.status === "begun")
    .sort((a, b) => (b.begunAt || 0) - (a.begunAt || 0));
  const done = sessions
    .filter((s) => s.status === "completed")
    .sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));

  const row = (s, meta, sub) => (
    <button
      key={s.id}
      type="button"
      className={`stack-row${s.id === activeId ? " current" : ""}`}
      data-testid={`deck-card-${s.id}`}
      aria-current={s.id === activeId || undefined}
      onClick={() => onOpen(s)}
    >
      <div className="stack-title">{sessionTitle(s)}</div>
      {sub ? <div className="stack-sub">{sub}</div> : null}
      <div className="stack-meta">
        {s.id === activeId ? "● Current · " : ""}
        {meta}
      </div>
    </button>
  );

  return (
    <main className="stage-wrap" data-testid="deck">
      <section className="stage rise">
        <h1 className="q">Your deck</h1>
        <p className="hint">
          Every card you hold — open, in progress, and completed. Tap a card to open it; the one you're working on is
          marked Current.
        </p>

        {drafts.length > 0 && (
          <>
            <h2 className="stack-h">In progress</h2>
            <div className="stack-list">
              {drafts.map((s) =>
                row(s, `Step ${s.stage} of 4 · tap to resume`, (s.matters || "").trim() ? `What matters: ${s.matters.trim()}` : "")
              )}
            </div>
          </>
        )}

        {open.length > 0 && (
          <>
            <h2 className="stack-h">Open</h2>
            <div className="stack-list">
              {open.map((s) => row(s, `Begun · ${formatDay(s.begunAt)}`, s.step ? `Next action: ${s.step}` : ""))}
            </div>
          </>
        )}

        {done.length > 0 && (
          <>
            <h2 className="stack-h">Completed</h2>
            <div className="stack-list">
              {done.map((s) => row(s, `Completed · ${formatDay(s.completedAt)}`, s.step ? `Action: ${s.step}` : ""))}
            </div>
          </>
        )}

        {drafts.length + open.length + done.length === 0 && <p className="hint">No cards yet — your next arrival will live here.</p>}

        <div className="action-col">
          <button type="button" className="btn btn-primary" data-testid="deck-new" onClick={onNew}>
            Begin a new arrival
          </button>
        </div>
      </section>
    </main>
  );
}

function Journey() {
  const [boot] = useState(initJourneyState);
  const [sessions, setSessions] = useState(boot.sessions);
  const [activeId, setActiveId] = useState(boot.activeId);
  const [view, setView] = useState(boot.view);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [showPwSet, setShowPwSet] = useState(false);
  const [newPw, setNewPw] = useState("");
  const [newPw2, setNewPw2] = useState("");
  const [pwNote, setPwNote] = useState("");
  const [showPrompts, setShowPrompts] = useState(false);
  const [exportNote, setExportNote] = useState("");
  const [me, setMe] = useState(null);
  const startedLoggedFor = useRef("");

  const session = sessions.find((s) => s.id === activeId) || sessions[0] || newSession();
  const deckCount = sessions.filter((s) => s.status !== "draft" || sessionHasContent(s)).length;

  useEffect(() => {
    api.getSession().then((s) => setMe(s ? s.user : null)).catch(() => {});
  }, []);

  // Persist every change — closing or refreshing never loses progress.
  // Also records the content-free "journey started" beta metric, once
  // per journey, the first time a draft gains any content.
  useEffect(() => {
    saveSessions(sessions);
    if (session.status === "draft" && sessionHasContent(session) && startedLoggedFor.current !== session.id) {
      startedLoggedFor.current = session.id;
      try {
        api.logEvent("journey_started");
      } catch {
        /* metrics are best-effort */
      }
    }
  }, [sessions, session]);

  const update = (patch) => setSessions((list) => list.map((s) => (s.id === session.id ? { ...s, ...patch } : s)));

  const stage = session.stage;
  const inFlow = session.status === "draft";

  const canContinue =
    stage === 1
      ? session.state !== ""
      : stage === 2
        ? session.matters.trim().length > 0
        : stage === 3 && session.cstep !== 2
          ? session.choice.trim().length > 0
          : stage === 3
            ? session.step.trim().length > 0
            : true;

  const goNext = () => {
    if (!canContinue) return;
    if (stage === 1) update({ stage: 2 });
    else if (stage === 2) update({ stage: 3, cstep: 1 });
    else if (stage === 3 && session.cstep !== 2) update({ cstep: 2 });
    else if (stage === 3) update({ stage: 4, cardAt: session.cardAt || Date.now() });
  };

  const goBack = () => {
    if (stage === 1) {
      // Step 1 has no previous stage — Back steps out to the deck.
      // The draft is already saved; leaving loses nothing.
      setView("stack");
      return;
    }
    if (stage === 2) update({ stage: 1 });
    else if (stage === 3 && session.cstep === 2) update({ cstep: 1 });
    else if (stage === 3) update({ stage: 2 });
    else if (stage === 4) update({ stage: 3, cstep: 2 });
  };

  const begin = () => {
    try {
      api.logEvent("journey_completed");
    } catch {
      /* metrics are best-effort */
    }
    update({ status: "begun", begunAt: Date.now() });
    setView("card");
  };
  const complete = () => update({ status: "completed", completedAt: Date.now() });

  const openSession = (s) => {
    setConfirmDelete(false);
    setExportNote("");
    setActiveId(s.id);
    setView(s.status === "draft" ? "journey" : "card");
  };

  /* Beginning a new arrival only ever ADDS a card. An untouched blank
     draft is reused rather than duplicated; every other card — open,
     completed, or mid-journey — stays exactly as it was. */
  const beginNewArrival = () => {
    setConfirmDelete(false);
    setExportNote("");
    const blank = sessions.find((s) => s.status === "draft" && !sessionHasContent(s));
    if (blank) {
      setActiveId(blank.id);
      setView("journey");
      return;
    }
    const s = newSession();
    setSessions((list) => [...list, s]);
    setActiveId(s.id);
    setView("journey");
  };

  /* Deleting is a deliberate act on one card — never a side effect of
     starting something new. */
  const deleteActive = () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    const rest = sessions.filter((s) => s.id !== session.id);
    setConfirmDelete(false);
    setExportNote("");
    if (rest.length === 0) {
      const s = newSession();
      setSessions([s]);
      setActiveId(s.id);
      setView("journey");
    } else {
      setSessions(rest);
      setView("stack");
    }
  };

  const clearData = () => {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    clearStoredSessions();
    setConfirmClear(false);
    setConfirmDelete(false);
    setExportNote("");
    const s = newSession();
    setSessions([s]);
    setActiveId(s.id);
    setView("journey");
  };

  /* One-time bootstrap for the organizer: while signed in (one email
     link is enough), set a password on the account. From then on, any
     device can sign in with email + password — no email round-trip,
     no hourly email cap in the way of internal iteration. */
  const savePassword = async () => {
    setPwNote("");
    if (newPw.length < 8) {
      setPwNote("Use at least 8 characters.");
      return;
    }
    if (newPw !== newPw2) {
      setPwNote("The two passwords don't match.");
      return;
    }
    try {
      await api.setPassword(newPw);
      setNewPw("");
      setNewPw2("");
      setPwNote("Password saved. You can now sign in with your email and this password on any device — no email link needed.");
    } catch (e) {
      setPwNote(e.message || "Could not save the password. Please try again.");
    }
  };

  const shareCard = async () => {
    try {
      const how = await exportCardImage(session);
      setExportNote(how === "shared" ? "Card shared." : "Card image saved.");
    } catch {
      setExportNote("Sharing was cancelled.");
    }
  };

  return (
    <div className="app" data-testid="journey">
      <div className="sky" aria-hidden="true">
        <div className="sky-glow" />
        <div className="sky-stars" />
      </div>

      <div className="shell">
        <header className="brand">
          <TriangleMark size={28} />
          <div className="brand-text">
            <span className="brand-name">AXZIO&nbsp;|&nbsp;ARRIVAL</span>
            <span className="brand-sub">by NE3ULA</span>
          </div>
        </header>

        <nav className="topnav" aria-label="Navigation">
          <button
            type="button"
            data-testid="nav-current"
            className={`topnav-btn${view !== "stack" ? " on" : ""}`}
            onClick={() => openSession(session)}
          >
            Current
          </button>
          <button
            type="button"
            data-testid="nav-deck"
            className={`topnav-btn${view === "stack" ? " on" : ""}`}
            onClick={() => setView("stack")}
          >
            Deck · {deckCount}
          </button>
        </nav>

        {view === "stack" ? (
          <DeckView sessions={sessions} activeId={session.id} onOpen={openSession} onNew={beginNewArrival} />
        ) : inFlow ? (
          <main className="stage-wrap" key={`${stage}-${session.cstep || 1}`}>
            <Progress stage={stage} />

            {stage === 1 && (
              <section className="stage rise">
                <h1 className="q">Where are you right now?</h1>
                <p className="hint">Choose the one closest to true. No judgment — just a starting point.</p>
                <div className="chips" role="radiogroup" aria-label="Your current state">
                  {STATES.map((name) => (
                    <button
                      key={name}
                      type="button"
                      role="radio"
                      aria-checked={session.state === name}
                      data-testid={`state-${name}`}
                      className={`chip${session.state === name ? " on" : ""}`}
                      onClick={() => update({ state: name })}
                    >
                      {name}
                    </button>
                  ))}
                </div>
                <label className="field-label" htmlFor="state-note">
                  In your own words <span className="optional">(optional)</span>
                </label>
                <textarea
                  id="state-note"
                  data-testid="state-note"
                  className="textarea"
                  rows={3}
                  maxLength={280}
                  placeholder="Say it the way it feels…"
                  value={session.stateNote}
                  onChange={(e) => update({ stateNote: e.target.value })}
                />
              </section>
            )}

            {stage === 2 && (
              <section className="stage rise">
                <p className="reflection">
                  Take one breath. Let the noise settle for a moment — this next answer is yours alone.
                </p>
                <h1 className="q">Set aside what everyone else expects. What matters most to you right now?</h1>
                {session.mattersPrompt ? (
                  <p className="prompt-echo">“{session.mattersPrompt}”</p>
                ) : null}
                <textarea
                  data-testid="matters"
                  className="textarea"
                  rows={4}
                  maxLength={500}
                  placeholder="What matters most is…"
                  value={session.matters}
                  onChange={(e) => update({ matters: e.target.value })}
                />
                {!showPrompts ? (
                  <button type="button" className="text-btn" onClick={() => setShowPrompts(true)}>
                    Not sure? Start from a gentle prompt
                  </button>
                ) : (
                  <div className="prompt-list rise">
                    {GENTLE_PROMPTS.map((p) => (
                      <button
                        key={p}
                        type="button"
                        className={`prompt-chip${session.mattersPrompt === p ? " on" : ""}`}
                        onClick={() => update({ mattersPrompt: p })}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                )}
              </section>
            )}

            {stage === 3 && session.cstep !== 2 && (
              <section className="stage rise">
                <h1 className="q">What is one thing you choose to move toward?</h1>
                <p className="hint">One direction. Yours. Say it like you mean it.</p>
                <textarea
                  data-testid="choice"
                  className="textarea"
                  rows={3}
                  maxLength={280}
                  placeholder="I choose to move toward…"
                  value={session.choice}
                  onChange={(e) => update({ choice: e.target.value })}
                />
              </section>
            )}

            {stage === 3 && session.cstep === 2 && (
              <section className="stage rise">
                <h1 className="q">What is one small step you can take?</h1>
                <p className="hint">Specific and doable. Small enough to start, real enough to matter.</p>
                <textarea
                  data-testid="step"
                  className="textarea"
                  rows={3}
                  maxLength={280}
                  placeholder="My next step is…"
                  value={session.step}
                  onChange={(e) => update({ step: e.target.value })}
                />
              </section>
            )}

            {stage === 4 && (
              <section className="stage rise">
                <h1 className="q q-card">Your Identity State Card</h1>
                <Card session={session} />
                <p className="hint center">This is your decision, in your words. When you're ready, begin.</p>
              </section>
            )}

            <nav className="nav-row">
              <button type="button" className="btn btn-ghost" data-testid="back" onClick={goBack}>
                Back
              </button>
              {stage < 4 ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  data-testid="continue"
                  disabled={!canContinue}
                  onClick={goNext}
                >
                  Continue
                </button>
              ) : (
                <button type="button" className="btn btn-primary btn-begin" data-testid="begin" onClick={begin}>
                  BEGIN
                </button>
              )}
            </nav>
            {stage === 4 && (
              <button type="button" className="text-btn center-btn" data-testid="edit-answers" onClick={() => update({ stage: 1 })}>
                Edit my answers
              </button>
            )}
          </main>
        ) : (
          <main className="stage-wrap">
            <section className="stage rise">
              <div className={`status-pill ${session.status}`}>
                {session.status === "begun" ? `Begun · ${formatWhen(session.begunAt)}` : `Completed · ${formatWhen(session.completedAt)}`}
              </div>
              <Card session={session} />
              <p className="closing" data-testid="closing">
                LIVE YOUR LEGEND.
              </p>
              <div className="action-col">
                {session.status === "begun" && (
                  <button type="button" className="btn btn-primary" data-testid="complete" onClick={complete}>
                    Mark action complete
                  </button>
                )}
                <button type="button" className="btn btn-ghost" data-testid="share" onClick={shareCard}>
                  Save card as image
                </button>
                {exportNote ? <p className="hint center">{exportNote}</p> : null}
                <button type="button" className="btn btn-ghost" data-testid="new-arrival" onClick={beginNewArrival}>
                  Begin a new arrival
                </button>
                <button type="button" className="text-btn center-btn" data-testid="delete-card" onClick={deleteActive}>
                  {confirmDelete ? "Tap again to delete this card" : "Delete this card"}
                </button>
              </div>
              <FeedbackForm sessionId={session.id} />
            </section>
          </main>
        )}

        <footer className="foot">
          <span className="foot-note">Private by design — everything stays on this device.</span>
          <span className="foot-note">AXZIO | ARRIVAL — PRIVATE BETA · © 2026 NE3ULA. All rights reserved.</span>
          {me ? <span className="foot-note">Beta tester: {me.email}</span> : null}
          <button type="button" className="foot-link" data-testid="clear-data" onClick={clearData}>
            {confirmClear ? "Tap again to erase everything" : "Clear my data"}
          </button>
          <button type="button" className="foot-link" data-testid="sign-out" onClick={() => api.signOut()}>
            Sign out
          </button>
          <button type="button" className="foot-link" data-testid="set-password" onClick={() => setShowPwSet((v) => !v)}>
            {showPwSet ? "Hide password form" : "Set a password"}
          </button>
          {showPwSet && (
            <div className="pw-set rise">
              <p className="hint center" style={{ margin: 0 }}>
                For the organizer: once set, you can sign in anywhere with your email + password — no email link, no
                waiting on the email limit. Testers keep using email links.
              </p>
              <input
                data-testid="pw-new"
                className="input"
                type="password"
                autoComplete="new-password"
                placeholder="New password (8+ characters)"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
              />
              <input
                data-testid="pw-confirm"
                className="input"
                type="password"
                autoComplete="new-password"
                placeholder="Repeat the password"
                value={newPw2}
                onChange={(e) => setNewPw2(e.target.value)}
              />
              <button type="button" className="btn btn-ghost" data-testid="pw-save" onClick={savePassword}>
                Save password
              </button>
              {pwNote ? (
                <p className="hint center" data-testid="pw-note" style={{ margin: 0 }}>
                  {pwNote}
                </p>
              ) : null}
            </div>
          )}
          <span className="foot-build">ARRIVAL V0.2.6 · build {typeof __BUILD_SHA__ !== "undefined" ? __BUILD_SHA__ : "dev"}</span>
        </footer>
      </div>
    </div>
  );
}

/* Optional post-journey beta feedback. Never interrupts the journey:
   it appears only on the card screen, after BEGIN. Submits the minimum
   (rating + whatever the tester chooses to write) — never journey content. */
function FeedbackForm({ sessionId }) {
  const doneKey = `arrival-fb-done:${sessionId}`;
  const [done, setDone] = useState(() => {
    try {
      return Boolean(localStorage.getItem(doneKey));
    } catch {
      return false;
    }
  });
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [text, setText] = useState("");
  const [bug, setBug] = useState("");
  const [followup, setFollowup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  if (done && !open) {
    return (
      <div className="feedback-box">
        <p className="hint center" data-testid="fb-thanks">
          Thanks — your feedback was sent.
        </p>
        <button type="button" className="text-btn center-btn" data-testid="fb-more" onClick={() => setOpen(true)}>
          Send more feedback
        </button>
      </div>
    );
  }

  const submit = async () => {
    setBusy(true);
    setFailed(false);
    try {
      await api.submitFeedback({
        clarity_rating: rating || null,
        feedback: text.trim() || null,
        bug_report: bug.trim() || null,
        followup_ok: followup,
      });
      try {
        localStorage.setItem(doneKey, "1");
      } catch {
        /* non-essential */
      }
      setDone(true);
      setOpen(false);
      setRating(0);
      setText("");
      setBug("");
      setFollowup(false);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="feedback-box" data-testid="fb-form">
      <h2 className="fb-q">Did this experience help you gain clarity?</h2>
      <div className="fb-stars" role="radiogroup" aria-label="Clarity rating, 1 to 5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating === n}
            data-testid={`fb-rate-${n}`}
            className={`fb-star${rating >= n ? " on" : ""}`}
            onClick={() => setRating(n)}
          >
            {n}
          </button>
        ))}
      </div>
      <label className="field-label" htmlFor="fb-text">
        Anything you'd like us to know? <span className="optional">(optional)</span>
      </label>
      <textarea
        id="fb-text"
        data-testid="fb-text"
        className="textarea"
        rows={3}
        maxLength={1000}
        placeholder="What worked, what didn't…"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <label className="field-label" htmlFor="fb-bug">
        Bug report <span className="optional">(optional)</span>
      </label>
      <textarea
        id="fb-bug"
        data-testid="fb-bug"
        className="textarea"
        rows={2}
        maxLength={1000}
        placeholder="Anything break or look wrong?"
        value={bug}
        onChange={(e) => setBug(e.target.value)}
      />
      <label className="check-row">
        <input type="checkbox" data-testid="fb-followup" checked={followup} onChange={(e) => setFollowup(e.target.checked)} />
        <span>You may contact me to follow up on this feedback.</span>
      </label>
      <div className="action-col">
        <button type="button" className="btn btn-ghost" data-testid="fb-submit" disabled={busy} onClick={submit}>
          Send feedback
        </button>
      </div>
      {failed && <p className="error-note">Feedback couldn't be sent. Please try again.</p>}
      <p className="hint center" style={{ marginTop: 10 }}>
        Feedback goes to the beta team. Your journey answers never leave this device.
      </p>
    </div>
  );
}

/* Root: the admin interface lives at #/admin (code-split, and every admin
   operation is authorized server-side). Everything else is the journey,
   behind the beta gate. */
export default function Root() {
  const [adminRoute, setAdminRoute] = useState(
    () => typeof window !== "undefined" && window.location.hash.startsWith("#/admin")
  );
  useEffect(() => {
    const onHash = () => setAdminRoute(window.location.hash.startsWith("#/admin"));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  if (adminRoute) {
    return (
      <Suspense fallback={null}>
        <Admin />
      </Suspense>
    );
  }
  return (
    <Gate>
      <Journey />
    </Gate>
  );
}
