import { useEffect, useState } from "react";
import { api, backendReady } from "./beta.js";
import { PRIVACY_SHORT, WELLNESS_LINE } from "./legal.js";

/* AXZIO | ARRIVAL — the beta gate.
 * Nothing of the journey renders until the server has verified, in order:
 *   1. a signed-in, email-verified account,
 *   2. an active (non-revoked) beta access row — granted automatically
 *      when a pending invitation exists for the verified sign-in email
 *      (claim_invitation), or by redeeming an invitation token from a
 *      link the organizer sent (fallback path),
 *   3. a server-recorded acceptance of the currently active agreement.
 * localStorage plays no part in any of these decisions. */

const REDEEM_ERRORS = {
  invalid_token: "That invitation doesn't look right. Check the link in your invitation, or paste the token exactly as given.",
  expired: "This invitation has expired. Ask the organizer for a fresh one.",
  already_used: "This invitation has already been used. If that wasn't you, contact the organizer.",
  email_mismatch: "This invitation was issued to a different email address. Sign in with the invited email.",
  not_pending: "This invitation is no longer active.",
  not_signed_in: "Sign in first, then redeem your invitation.",
  server_error: "Something went wrong on our side. Try again in a moment.",
};

function Mark({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <path d="M24 5 L43 40 L5 40 Z" stroke="#56c8f5" strokeWidth="2.6" strokeLinejoin="round" />
      <path d="M24 24 L33 40 L15 40 Z" stroke="#56c8f5" strokeWidth="2.2" strokeLinejoin="round" />
    </svg>
  );
}

function GateShell({ children }) {
  return (
    <div className="app">
      <div className="sky" aria-hidden="true">
        <div className="sky-glow" />
        <div className="sky-stars" />
      </div>
      <div className="shell">
        <header className="brand">
          <Mark size={28} />
          <div className="brand-text">
            <span className="brand-name">AXZIO&nbsp;|&nbsp;ARRIVAL</span>
            <span className="brand-sub">Private Beta · by NE3ULA</span>
          </div>
        </header>
        <main className="stage-wrap">{children}</main>
        <footer className="foot">
          <span className="foot-note">AXZIO | ARRIVAL — PRIVATE BETA · © 2026 NE3ULA. All rights reserved.</span>
        </footer>
      </div>
    </div>
  );
}

export default function Gate({ children }) {
  const [phase, setPhase] = useState("loading");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [session, setSession] = useState(null);
  const [agreement, setAgreement] = useState(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pwMode, setPwMode] = useState(false);
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [tokenInput, setTokenInput] = useState("");
  const [agree, setAgree] = useState(false);
  const [adult, setAdult] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);

  const evaluate = async (sess) => {
    setSession(sess);
    if (!sess) {
      setPhase("signedOut");
      return;
    }
    try {
      let access = await api.getMyAccess();
      if (access && access.status === "revoked") {
        setPhase("revoked");
        return;
      }
      if (!access) {
        // Primary path: if an invitation is waiting for this verified
        // email, the server grants access automatically — no code needed.
        const res = await api.claimInvitation().catch(() => ({ ok: false, error: "server_error" }));
        if (res && res.ok) {
          access = await api.getMyAccess();
        }
        if (!access) {
          if (res && res.error === "expired") {
            setError("Your invitation has expired. Ask the organizer for a fresh one.");
          } else if (res && res.error === "server_error") {
            setError("We couldn't check your invitation just now. Try reloading in a moment.");
          }
          setPhase("noInvite");
          return;
        }
        if (access.status === "revoked") {
          setPhase("revoked");
          return;
        }
      }
      const active = await api.getActiveAgreement();
      if (!active) {
        setNote("The beta is not open yet — no agreement is active. Please contact the organizer.");
        setPhase("unavailable");
        return;
      }
      setAgreement(active);
      const acceptance = await api.getMyAcceptance(active.id);
      setPhase(acceptance ? "ready" : "needsAcceptance");
    } catch {
      setError("We couldn't verify your beta access. Check your connection and try again.");
      setPhase("unavailable");
    }
  };

  useEffect(() => {
    if (!backendReady()) {
      setPhase("holding");
      return;
    }
    api.getSession().then(evaluate);
    const unsub = api.onAuthChange((sess) => {
      if (sess) evaluate(sess);
      else {
        setSession(null);
        setPhase("signedOut");
      }
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendLink = async () => {
    setError("");
    setBusy(true);
    try {
      await api.signInWithEmail(email.trim());
      setSent(true);
    } catch (e) {
      setError(e.message || "Could not send the sign-in email. Check the address and try again.");
    } finally {
      setBusy(false);
    }
  };

  const signInPw = async () => {
    setError("");
    setBusy(true);
    try {
      await api.signInWithPassword(email.trim(), password);
      const sess = await api.getSession();
      if (sess) await evaluate(sess);
    } catch {
      setError("That email and password didn't match. Passwords are case-sensitive — check the details and try again.");
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setError("");
    setBusy(true);
    try {
      await api.verifyCode(email.trim(), code.trim());
      const sess = await api.getSession();
      if (sess) await evaluate(sess);
    } catch {
      setError("That code didn't verify. Check it and try again — codes expire quickly.");
    } finally {
      setBusy(false);
    }
  };

  const redeem = async () => {
    setError("");
    setBusy(true);
    try {
      const res = await api.redeemInvitation(tokenInput.trim());
      if (res && res.ok) {
        await evaluate(session);
      } else {
        setError(REDEEM_ERRORS[res && res.error] || REDEEM_ERRORS.server_error);
      }
    } finally {
      setBusy(false);
    }
  };

  const accept = async () => {
    setError("");
    setBusy(true);
    try {
      await api.acceptAgreement(agreement);
      setPhase("ready");
    } catch {
      setError("Your acceptance could not be recorded. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const downloadAgreement = () => {
    const text = `${agreement.title}\nVersion ${agreement.version} · Effective ${agreement.effective_date}\n\n${agreement.body}\n`;
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `axzio-arrival-beta-agreement-v${agreement.version}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  if (phase === "ready") return children;

  return (
    <GateShell>
      {phase === "loading" && <p className="hint rise">One moment…</p>}

      {phase === "holding" && (
        <section className="stage rise" data-testid="gate-holding">
          <h1 className="q">The private beta isn't open yet.</h1>
          <p className="hint">
            AXZIO | ARRIVAL is in a private, invitation-only beta. If you received an invitation, it will open soon —
            or reach out to the organizer.
          </p>
          <p className="hint">{WELLNESS_LINE}</p>
        </section>
      )}

      {phase === "signedOut" && (
        <section className="stage rise" data-testid="gate-signin">
          <h1 className="q">Welcome to the private beta.</h1>
          <p className="hint">
            Access is by invitation only. Sign in with the email address your invitation was sent to.
          </p>
          <label className="field-label" htmlFor="gate-email">
            Email address
          </label>
          <input
            id="gate-email"
            data-testid="gate-email"
            className="input"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <div className="action-col">
            <button type="button" className="btn btn-primary" data-testid="gate-send" disabled={busy || !email.trim()} onClick={sendLink}>
              Email me a sign-in link
            </button>
          </div>
          {sent && (
            <div className="rise">
              <p className="ok-note">
                Check your inbox — open the sign-in link, or type the 6-digit code from the email below.
              </p>
              <label className="field-label" htmlFor="gate-code">
                6-digit code (if your email includes one)
              </label>
              <input
                id="gate-code"
                data-testid="gate-code"
                className="input"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
              <div className="action-col">
                <button type="button" className="btn btn-ghost" data-testid="gate-verify" disabled={busy || code.trim().length < 6} onClick={verify}>
                  Verify code
                </button>
              </div>
            </div>
          )}
          {error && (
            <p className="error-note" data-testid="gate-error">
              {error}
            </p>
          )}
          {!pwMode ? (
            <button type="button" className="text-btn" data-testid="gate-pw-mode" onClick={() => setPwMode(true)}>
              Organizer? Sign in with a password
            </button>
          ) : (
            <div className="panel rise">
              <p className="hint" style={{ marginTop: 0 }}>
                For the organizer's own account — sign in with the email address above and its password. Beta testers
                don't need this; the email link above is theirs.
              </p>
              <label className="field-label" htmlFor="gate-password">
                Password
              </label>
              <input
                id="gate-password"
                data-testid="gate-password"
                className="input"
                type="password"
                autoComplete="current-password"
                placeholder="Your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <div className="action-col">
                <button
                  type="button"
                  className="btn btn-ghost"
                  data-testid="gate-pw-submit"
                  disabled={busy || !email.trim() || !password}
                  onClick={signInPw}
                >
                  Sign in with password
                </button>
              </div>
            </div>
          )}
          <p className="hint" style={{ marginTop: 22 }}>{WELLNESS_LINE}</p>
        </section>
      )}

      {phase === "noInvite" && (
        <section className="stage rise" data-testid="gate-noinvite">
          <h1 className="q">This beta is invitation-only.</h1>
          <p className="hint">
            You're signed in as <strong>{session ? session.user.email : ""}</strong>, but that email address isn't on
            the invitation list, so there's nothing to open yet. If you were invited under a different email, sign out
            and sign back in with that one. Otherwise, ask the organizer to invite this address — once they do,
            signing in is all it takes.
          </p>
          {error && (
            <p className="error-note" data-testid="gate-error">
              {error}
            </p>
          )}
          <div className="panel">
            <p className="hint" style={{ marginTop: 0 }}>
              Were you sent an invitation link with a token? Paste the token here instead:
            </p>
            <label className="field-label" htmlFor="gate-token">
              Invitation token
            </label>
            <input
              id="gate-token"
              data-testid="gate-token"
              className="input"
              placeholder="Paste token…"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
            />
            <div className="action-col">
              <button type="button" className="btn btn-ghost" data-testid="gate-redeem" disabled={busy || !tokenInput.trim()} onClick={redeem}>
                Redeem invitation
              </button>
            </div>
          </div>
          <div className="action-col">
            <button type="button" className="btn btn-ghost" data-testid="gate-signout" onClick={() => api.signOut()}>
              Sign out
            </button>
          </div>
        </section>
      )}

      {phase === "revoked" && (
        <section className="stage rise" data-testid="gate-revoked">
          <h1 className="q">Your beta access has been revoked.</h1>
          <p className="hint">
            If you believe this is a mistake, contact the organizer. Anything you created stays on your own device —
            you can erase it anytime from a signed-in session or by clearing this browser's site data.
          </p>
          <div className="action-col">
            <button type="button" className="btn btn-ghost" data-testid="gate-signout" onClick={() => api.signOut()}>
              Sign out
            </button>
          </div>
        </section>
      )}

      {phase === "unavailable" && (
        <section className="stage rise" data-testid="gate-unavailable">
          <h1 className="q">Not available right now.</h1>
          <p className="hint">{note || error || "Please try again shortly."}</p>
          <div className="action-col">
            <button type="button" className="btn btn-ghost" data-testid="gate-signout" onClick={() => api.signOut()}>
              Sign out
            </button>
          </div>
        </section>
      )}

      {phase === "needsAcceptance" && agreement && (
        <section className="stage rise" data-testid="gate-accept">
          <h1 className="q q-card">Beta Testing Agreement</h1>
          <p className="hint center">
            Signed in as <strong>{session ? session.user.email : ""}</strong>
          </p>
          <div className="panel">
            <div className="panel-head">
              <span>{agreement.title}</span>
              <span className="panel-meta">
                Version {agreement.version} · Effective {agreement.effective_date}
              </span>
            </div>
            <div className="agreement-body" data-testid="agreement-body">
              {agreement.body}
            </div>
            <button type="button" className="text-btn" data-testid="agreement-download" onClick={downloadAgreement}>
              Download a copy of this agreement
            </button>
          </div>

          <button type="button" className="text-btn" data-testid="privacy-toggle" onClick={() => setShowPrivacy((v) => !v)}>
            {showPrivacy ? "Hide the Privacy Notice" : "Read the Privacy Notice"}
          </button>
          {showPrivacy && (
            <div className="agreement-body rise" data-testid="privacy-body">
              {PRIVACY_SHORT}
            </div>
          )}

          <label className="check-row">
            <input type="checkbox" data-testid="agree-check" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            <span>I have read and agree to the Beta Testing Agreement (version {agreement.version}).</span>
          </label>
          <label className="check-row">
            <input type="checkbox" data-testid="adult-check" checked={adult} onChange={(e) => setAdult(e.target.checked)} />
            <span>I confirm that I am 18 years or older.</span>
          </label>

          <div className="action-col">
            <button type="button" className="btn btn-primary" data-testid="agree-submit" disabled={!agree || !adult || busy} onClick={accept}>
              I Agree &amp; Join Beta
            </button>
            <button type="button" className="btn btn-ghost" data-testid="gate-signout" onClick={() => api.signOut()}>
              Not now — sign out
            </button>
          </div>
          <p className="hint" style={{ marginTop: 16 }}>
            Your acceptance is recorded with the agreement version and a server-generated timestamp.
          </p>
          {error && (
            <p className="error-note" data-testid="gate-error">
              {error}
            </p>
          )}
          <p className="hint">{WELLNESS_LINE}</p>
        </section>
      )}
    </GateShell>
  );
}
