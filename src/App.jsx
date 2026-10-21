import { useEffect, useState } from "react";
import { newSession, loadSession, saveSession, clearStoredSession } from "./store.js";
import { exportCardImage } from "./exportCard.js";

/* AXZIO | ARRIVAL — V0.1
   A single guided journey: Awareness → Arrival → Choice → Action.
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

export default function App() {
  const [session, setSession] = useState(() => loadSession() || newSession());
  const [confirmNew, setConfirmNew] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [showPrompts, setShowPrompts] = useState(false);
  const [exportNote, setExportNote] = useState("");

  // Persist every change — closing or refreshing never loses progress.
  useEffect(() => {
    saveSession(session);
  }, [session]);

  const update = (patch) => setSession((s) => ({ ...s, ...patch }));

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
    if (stage === 2) update({ stage: 1 });
    else if (stage === 3 && session.cstep === 2) update({ cstep: 1 });
    else if (stage === 3) update({ stage: 2 });
    else if (stage === 4) update({ stage: 3, cstep: 2 });
  };

  const begin = () => update({ status: "begun", begunAt: Date.now() });
  const complete = () => update({ status: "completed", completedAt: Date.now() });

  const startNew = () => {
    if (!confirmNew) {
      setConfirmNew(true);
      return;
    }
    clearStoredSession();
    setConfirmNew(false);
    setSession(newSession());
  };

  const clearData = () => {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    clearStoredSession();
    setConfirmClear(false);
    setSession(newSession());
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
    <div className="app">
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

        {inFlow ? (
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
              {stage > 1 || (stage === 3 && session.cstep === 2) ? (
                <button type="button" className="btn btn-ghost" data-testid="back" onClick={goBack}>
                  Back
                </button>
              ) : (
                <span />
              )}
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
                <button type="button" className="btn btn-ghost" data-testid="new-session" onClick={startNew}>
                  {confirmNew ? "Tap again to confirm — this replaces the card above" : "Start a new session"}
                </button>
              </div>
            </section>
          </main>
        )}

        <footer className="foot">
          <span className="foot-note">Private by design — everything stays on this device.</span>
          <button type="button" className="foot-link" data-testid="clear-data" onClick={clearData}>
            {confirmClear ? "Tap again to erase everything" : "Clear my data"}
          </button>
          <span className="foot-build">ARRIVAL V0.1 · build {typeof __BUILD_SHA__ !== "undefined" ? __BUILD_SHA__ : "dev"}</span>
        </footer>
      </div>
    </div>
  );
}
