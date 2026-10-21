# AXZIO | ARRIVAL V0.2 — Pre-launch security & privacy checklist

**Status: NOT READY FOR EXTERNAL RELEASE until every item below is
checked against the live environment.** Code-complete is not
launch-complete. Do not describe the beta as "secure" or "legally
compliant" until this list is done and the agreement/privacy drafts have
had attorney review.

## Infrastructure (owner: Jesse)

- [ ] New, isolated Supabase project created for ARRIVAL beta (NOT the
      production AXZIO project). Project ref recorded: `____________`
- [ ] `supabase/beta-schema.sql` run once in the new project's SQL editor.
- [ ] Project URL + anon key pasted into `src/beta-config.js` (anon key
      only — **never** the service-role key).
- [ ] Authentication → URL Configuration: Site URL = the beta URL;
      redirect URLs include the beta URL.
- [ ] Email template: "Magic Link" template includes the 6-digit code
      (`{{ .Token }}`) as well as the link, so phone testers can type the
      code in the browser they started from.
- [ ] Auth rate limits reviewed (Supabase defaults on OTP/email sends);
      custom SMTP configured if beta volume will exceed default quotas.
- [ ] Admin bootstrap run: first admin inserted into `beta_admins`
      (snippet at the bottom of the schema file) using: `____________`
- [ ] Launch agreement version created in the admin interface with the
      real effective date, legal entity name, and contact email —
      placeholders in v1.0 replaced (v1.0 is a draft seed).

## Legal (owner: Jesse + attorney)

- [ ] Beta Testing Agreement reviewed by a California attorney;
      placeholders resolved: legal entity, contact email, effective date,
      confidentiality survival period, venue/dispute resolution.
- [ ] Privacy Notice reviewed; deletion response period set.
- [ ] Confirmed: no claim that in-app acceptance is a guaranteed legally
      binding signature anywhere in copy.

## Security verification (test before first invite)

- [ ] **URL guessing:** open the beta URL signed out → gate only, no
      journey. Open `#/admin` signed out / as a tester → not authorized.
- [ ] **Storage tampering:** in devtools, edit localStorage (arrival
      session, fake "accepted" flags) → still gated. Access decisions come
      only from the server (session + `beta_access` + `beta_acceptances`).
- [ ] **Invitation abuse:** redeem with a wrong token → rejected; with an
      expired token → rejected + marked expired; with a token issued to a
      different email → rejected; reuse a redeemed token on a second
      account → rejected.
- [ ] **Revocation:** revoke a tester in admin → their next load shows
      the revoked screen and RLS blocks new feedback/event inserts.
- [ ] **Consent independence:** acceptance record is visible in the
      `beta_acceptances` table / admin UI with a server timestamp, and
      persists after the tester clears their browser data.
- [ ] **RLS spot-check:** as a tester, the Supabase REST API refuses reads
      of `beta_invitations` and other testers' rows.
- [ ] **Secrets scan:** repo and built bundle contain no service-role
      key, no admin credentials (anon key + RLS is the design).
- [ ] **Indexing:** live page carries `noindex` meta + `robots.txt`
      disallow; URL has not been posted publicly.
- [ ] **Data deletion drill:** submit a deletion request for a test
      account → admin "Delete data" removes beta records; auth user
      removed in the Supabase dashboard.

## Experience verification

- [ ] Full flow on **iPhone Safari**: invite link → sign-in (code path) →
      agreement → journey → BEGIN → feedback → reopen (session persists).
- [ ] Full flow on desktop Chrome/Safari.
- [ ] Returning tester reaches the journey without re-accepting (unless a
      new agreement version was activated — then re-acceptance is asked).
- [ ] "Clear my data" erases local journey data; server-side beta records
      are unaffected (by design, and stated in the Privacy Notice).

## Known V0.2 limits (accepted, documented)

- Frontend code is delivered to browsers and cannot be fully secret from
  authorized testers; protection is legal (NDA) + access control, not
  code secrecy. The admin interface ships as a separate lazy-loaded chunk
  on the same host — authorization is enforced server-side by RLS.
- Acceptance records include the browser user-agent and server timestamp;
  no IP address is recorded (would require an edge function).
- Auth-account deletion is a two-step: in-app "Delete data" (beta
  records) + Supabase dashboard (the sign-in user).
- Metrics are best-effort client-reported counts (started/completed);
  they contain no journey content.
