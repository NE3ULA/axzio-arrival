import { useEffect, useState } from "react";
import { api, generateInviteToken, hashInviteToken } from "./beta.js";

/* AXZIO | ARRIVAL — beta administration (route: #/admin).
 * Minimal by design. Every operation is authorized server-side by RLS
 * (beta_is_admin); this interface merely calls the same client API.
 * It is code-split into its own chunk and never loads for testers. */

function fmt(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function toCsv(rows) {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return rows.map((r) => r.map(esc).join(",")).join("\n");
}

export default function Admin() {
  const [state, setState] = useState("loading"); // loading | signedOut | forbidden | ready
  const [me, setMe] = useState(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteDays, setInviteDays] = useState(7);
  const [inviteLink, setInviteLink] = useState("");

  const [agVersion, setAgVersion] = useState("");
  const [agDate, setAgDate] = useState("");
  const [agTitle, setAgTitle] = useState("AXZIO | ARRIVAL — Beta Testing Agreement");
  const [agBody, setAgBody] = useState("");

  const [confirmDelete, setConfirmDelete] = useState("");

  const refresh = async () => {
    const [invitations, access, acceptances, feedback, events, agreements] = await Promise.all([
      api.adminListInvitations(),
      api.adminListAccess(),
      api.adminListAcceptances(),
      api.adminListFeedback(),
      api.adminListEvents(),
      api.adminListAgreements(),
    ]);
    setData({ invitations, access, acceptances, feedback, events, agreements });
  };

  useEffect(() => {
    (async () => {
      const sess = await api.getSession();
      if (!sess) {
        setState("signedOut");
        return;
      }
      setMe(sess.user);
      const admin = await api.isAdmin();
      if (!admin) {
        setState("forbidden");
        return;
      }
      await refresh();
      setState("ready");
    })().catch(() => setState("forbidden"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const act = async (fn) => {
    setError("");
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(e.message || "That action failed.");
    }
  };

  const createInvite = () =>
    act(async () => {
      const token = generateInviteToken();
      const tokenHash = await hashInviteToken(token);
      await api.adminCreateInvitation({
        email: inviteEmail.trim().toLowerCase(),
        token_hash: tokenHash,
        expires_at: new Date(Date.now() + Number(inviteDays) * 86400000).toISOString(),
        created_by: me.id,
      });
      setInviteLink(`${window.location.origin}${window.location.pathname}?invite=${token}`);
      setInviteEmail("");
    });

  const exportFeedback = () => {
    const emailByUser = new Map((data.access || []).map((a) => [a.user_id, a.email]));
    const rows = [
      ["created_at", "email", "user_id", "clarity_rating", "feedback", "bug_report", "followup_ok"],
      ...(data.feedback || []).map((f) => [
        f.created_at,
        emailByUser.get(f.user_id) || "",
        f.user_id,
        f.clarity_rating ?? "",
        f.feedback || "",
        f.bug_report || "",
        f.followup_ok ? "yes" : "no",
      ]),
    ];
    const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "axzio-arrival-beta-feedback.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  if (state === "loading") return <div className="admin-shell"><p className="hint">Loading…</p></div>;

  if (state === "signedOut")
    return (
      <div className="admin-shell">
        <h1 className="q">Beta administration</h1>
        <p className="hint">Sign in through the beta app first, then return here.</p>
        <a className="text-btn" href="./">← Back to the beta</a>
      </div>
    );

  if (state === "forbidden")
    return (
      <div className="admin-shell">
        <h1 className="q">Not authorized.</h1>
        <p className="hint">
          This account isn't an administrator. If you're the organizer: sign in once through the beta app, then run
          the admin bootstrap SQL at the bottom of <code>supabase/beta-schema.sql</code>.
        </p>
        <a className="text-btn" href="./">← Back to the beta</a>
      </div>
    );

  const d = data || { invitations: [], access: [], acceptances: [], feedback: [], events: [], agreements: [] };
  const started = d.events.filter((e) => e.kind === "journey_started").length;
  const completed = d.events.filter((e) => e.kind === "journey_completed").length;
  const ratings = d.feedback.map((f) => f.clarity_rating).filter((r) => typeof r === "number");
  const avgClarity = ratings.length ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1) : "—";
  const acceptedTesters = new Set(d.acceptances.map((a) => a.user_id)).size;

  return (
    <div className="admin-shell" data-testid="admin-root">
      <header className="brand">
        <div className="brand-text">
          <span className="brand-name">ARRIVAL — BETA ADMIN</span>
          <span className="brand-sub">{me ? me.email : ""}</span>
        </div>
      </header>
      <a className="text-btn" href="./">← Back to the beta</a>
      {error && (
        <p className="error-note" data-testid="admin-error">
          {error}
        </p>
      )}

      <section className="admin-section">
        <h2>Metrics</h2>
        <div className="metric-grid" data-testid="admin-metrics">
          <div className="metric"><span>{d.invitations.length}</span>Invitations issued</div>
          <div className="metric"><span>{acceptedTesters}</span>Agreements accepted</div>
          <div className="metric"><span>{started}</span>Journeys started</div>
          <div className="metric"><span>{completed}</span>Journeys completed</div>
          <div className="metric"><span>{started ? Math.round((completed / started) * 100) + "%" : "—"}</span>Completion rate</div>
          <div className="metric"><span>{avgClarity}</span>Avg clarity (1–5)</div>
          <div className="metric"><span>{d.feedback.length}</span>Feedback submitted</div>
        </div>
      </section>

      <section className="admin-section">
        <h2>Invite a tester</h2>
        <div className="admin-row">
          <input className="input" data-testid="adm-email" type="email" placeholder="tester@example.com" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
          <input className="input adm-days" type="number" min="1" max="90" value={inviteDays} onChange={(e) => setInviteDays(e.target.value)} aria-label="Expiry in days" />
          <button type="button" className="btn btn-primary" data-testid="adm-create" disabled={!inviteEmail.trim()} onClick={createInvite}>
            Create invitation
          </button>
        </div>
        {inviteLink && (
          <div className="panel" data-testid="adm-invite-link">
            <p className="hint">Send this link to the tester (shown once — the token is never stored):</p>
            <code className="invite-link">{inviteLink}</code>
          </div>
        )}
        <table className="admin-table">
          <thead>
            <tr><th>Email</th><th>Status</th><th>Expires</th><th>Redeemed</th></tr>
          </thead>
          <tbody>
            {d.invitations.map((inv) => (
              <tr key={inv.id}>
                <td>{inv.email}</td>
                <td>{inv.status}</td>
                <td>{fmt(inv.expires_at)}</td>
                <td>{inv.redeemed_at ? fmt(inv.redeemed_at) : "—"}</td>
              </tr>
            ))}
            {d.invitations.length === 0 && <tr><td colSpan={4} className="faint">No invitations yet.</td></tr>}
          </tbody>
        </table>
      </section>

      <section className="admin-section">
        <h2>Testers &amp; access</h2>
        <table className="admin-table">
          <thead>
            <tr><th>Email</th><th>Status</th><th>Since</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {d.access.map((a) => (
              <tr key={a.user_id}>
                <td>{a.email}</td>
                <td>{a.status}</td>
                <td>{fmt(a.created_at)}</td>
                <td className="adm-actions">
                  {a.status === "active" ? (
                    <button type="button" className="mini-btn" data-testid={`adm-revoke-${a.email}`} onClick={() => act(() => api.adminSetAccessStatus(a.user_id, "revoked"))}>
                      Revoke
                    </button>
                  ) : (
                    <button type="button" className="mini-btn" onClick={() => act(() => api.adminSetAccessStatus(a.user_id, "active"))}>
                      Restore
                    </button>
                  )}
                  <button
                    type="button"
                    className="mini-btn danger"
                    data-testid={`adm-delete-${a.email}`}
                    onClick={() =>
                      confirmDelete === a.user_id
                        ? act(async () => {
                            await api.adminDeleteUserData(a.user_id);
                            setConfirmDelete("");
                          })
                        : setConfirmDelete(a.user_id)
                    }
                  >
                    {confirmDelete === a.user_id ? "Confirm delete beta data" : "Delete data"}
                  </button>
                </td>
              </tr>
            ))}
            {d.access.length === 0 && <tr><td colSpan={4} className="faint">No testers yet.</td></tr>}
          </tbody>
        </table>
        <p className="hint">
          "Delete data" removes the tester's invitations-independent beta records (acceptance, feedback, events,
          access). To remove their sign-in account entirely, also delete the user in the Supabase dashboard
          (Authentication → Users).
        </p>
      </section>

      <section className="admin-section">
        <h2>Agreement acceptances</h2>
        <table className="admin-table">
          <thead>
            <tr><th>Email</th><th>Version</th><th>Accepted (server time)</th></tr>
          </thead>
          <tbody>
            {d.acceptances.map((a) => (
              <tr key={a.id}>
                <td>{a.email}</td>
                <td>{a.agreement_version}</td>
                <td>{fmt(a.accepted_at)}</td>
              </tr>
            ))}
            {d.acceptances.length === 0 && <tr><td colSpan={3} className="faint">No acceptances yet.</td></tr>}
          </tbody>
        </table>
      </section>

      <section className="admin-section">
        <h2>Feedback</h2>
        <button type="button" className="btn btn-ghost" data-testid="adm-export" onClick={exportFeedback} disabled={!d.feedback.length}>
          Export feedback as CSV
        </button>
        <table className="admin-table">
          <thead>
            <tr><th>When</th><th>Clarity</th><th>Feedback</th><th>Bug report</th><th>Follow-up ok</th></tr>
          </thead>
          <tbody>
            {d.feedback.map((f) => (
              <tr key={f.id}>
                <td>{fmt(f.created_at)}</td>
                <td>{f.clarity_rating ?? "—"}</td>
                <td>{f.feedback || "—"}</td>
                <td>{f.bug_report || "—"}</td>
                <td>{f.followup_ok ? "yes" : "no"}</td>
              </tr>
            ))}
            {d.feedback.length === 0 && <tr><td colSpan={5} className="faint">No feedback yet.</td></tr>}
          </tbody>
        </table>
      </section>

      <section className="admin-section">
        <h2>Agreement versions</h2>
        <table className="admin-table">
          <thead>
            <tr><th>Version</th><th>Effective</th><th>Active</th><th></th></tr>
          </thead>
          <tbody>
            {d.agreements.map((a) => (
              <tr key={a.id}>
                <td>{a.version}</td>
                <td>{a.effective_date}</td>
                <td>{a.active ? "active" : ""}</td>
                <td>
                  {!a.active && (
                    <button type="button" className="mini-btn" onClick={() => act(() => api.adminSetActiveAgreement(a.id))}>
                      Set active
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="panel">
          <p className="hint">New version (versions are immutable once created; testers must accept the active version):</p>
          <div className="admin-row">
            <input className="input" placeholder="Version (e.g. 1.1)" value={agVersion} onChange={(e) => setAgVersion(e.target.value)} />
            <input className="input" type="date" value={agDate} onChange={(e) => setAgDate(e.target.value)} aria-label="Effective date" />
          </div>
          <input className="input" placeholder="Title" value={agTitle} onChange={(e) => setAgTitle(e.target.value)} style={{ marginTop: 8 }} />
          <textarea className="textarea" rows={8} placeholder="Full agreement text…" value={agBody} onChange={(e) => setAgBody(e.target.value)} style={{ marginTop: 8 }} />
          <button
            type="button"
            className="btn btn-ghost"
            style={{ marginTop: 10 }}
            disabled={!agVersion || !agDate || !agBody}
            onClick={() =>
              act(async () => {
                await api.adminCreateAgreement({ version: agVersion, effective_date: agDate, title: agTitle, body: agBody, active: false });
                setAgVersion("");
                setAgBody("");
              })
            }
          >
            Create version
          </button>
        </div>
      </section>
    </div>
  );
}
