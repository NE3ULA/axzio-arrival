-- =====================================================================
-- AXZIO | ARRIVAL — Private Beta schema (V0.2)
-- =====================================================================
-- Run this ONCE in the SQL editor of a NEW, ISOLATED Supabase project.
-- Do NOT run it in the production AXZIO project.
--
-- SETUP ORDER
--   1. Create the new Supabase project (free tier is fine).
--   2. Authentication → Providers → Email: enabled. (Optional but
--      recommended: edit the "Magic Link" email template to also include
--      the code {{ .Token }} so testers can type a 6-digit code.)
--   3. Authentication → URL Configuration: set Site URL to the beta URL.
--   4. Run this file in the SQL Editor.
--   5. Paste the project URL + anon key into src/beta-config.js.
--   6. ADMIN BOOTSTRAP: invite yourself from the SQL below (or sign in
--      once), then run the bootstrap insert at the very bottom with your
--      email to become the first administrator.
--
-- DESIGN NOTES
--   * All enforcement is server-side: Row Level Security on every table,
--     invitation redemption via a SECURITY DEFINER function, and consent
--     records written only as the signed-in user with a server timestamp.
--   * Journey content (reflections, cards) is NEVER stored here — it stays
--     in the tester's browser localStorage. This schema holds only access,
--     consent, feedback, and content-free usage counts.
--   * Invitation tokens are stored only as SHA-256 hashes. The raw token
--     exists solely in the invitation link.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Agreement versions (immutable once created; exactly one active)
-- ---------------------------------------------------------------------
create table if not exists beta_agreements (
  id uuid primary key default gen_random_uuid(),
  version text not null unique,
  effective_date date not null,
  title text not null,
  body text not null,
  active boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index if not exists beta_agreements_one_active
  on beta_agreements (active) where active;

create or replace function beta_agreements_immutable()
returns trigger language plpgsql as $$
begin
  if new.body is distinct from old.body
     or new.version is distinct from old.version
     or new.effective_date is distinct from old.effective_date then
    raise exception 'Agreement versions are immutable — create a new version instead.';
  end if;
  return new;
end;
$$;

drop trigger if exists beta_agreements_immutable_trg on beta_agreements;
create trigger beta_agreements_immutable_trg
  before update on beta_agreements
  for each row execute function beta_agreements_immutable();

-- ---------------------------------------------------------------------
-- Administrators (allowlist)
-- ---------------------------------------------------------------------
create table if not exists beta_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Invitations (single-use, expiring; token stored as SHA-256 hash only)
-- ---------------------------------------------------------------------
create table if not exists beta_invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  token_hash text not null unique,
  status text not null default 'pending'
    check (status in ('pending', 'redeemed', 'revoked', 'expired')),
  expires_at timestamptz not null,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  redeemed_by uuid references auth.users (id),
  redeemed_at timestamptz
);

-- ---------------------------------------------------------------------
-- Beta access (one row per tester; revocation lives here)
-- ---------------------------------------------------------------------
create table if not exists beta_access (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  status text not null default 'active' check (status in ('active', 'revoked')),
  invited_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

-- ---------------------------------------------------------------------
-- Agreement acceptances (server timestamp = consent evidence)
-- ---------------------------------------------------------------------
create table if not exists beta_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  email text not null,
  agreement_id uuid not null references beta_agreements (id),
  agreement_version text not null,
  user_agent text,
  accepted_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Feedback (voluntarily submitted; no journey content)
-- ---------------------------------------------------------------------
create table if not exists beta_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  clarity_rating int check (clarity_rating between 1 and 5),
  feedback text,
  bug_report text,
  followup_ok boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Minimal usage events (counts only — never content)
-- ---------------------------------------------------------------------
create table if not exists beta_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('journey_started', 'journey_completed')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Helper functions
-- ---------------------------------------------------------------------
create or replace function beta_is_admin()
returns boolean language sql stable security definer
set search_path = public as $$
  select exists (select 1 from beta_admins where user_id = auth.uid())
$$;

create or replace function beta_has_active_access()
returns boolean language sql stable security definer
set search_path = public as $$
  select exists (
    select 1 from beta_access
    where user_id = auth.uid() and status = 'active'
  )
$$;

grant execute on function beta_is_admin() to authenticated;
grant execute on function beta_has_active_access() to authenticated;

-- ---------------------------------------------------------------------
-- Invitation redemption (the ONLY way a tester gains access)
-- Validates: signed in, token known, unused, unexpired, and the
-- invitation email matches the verified sign-in email.
-- ---------------------------------------------------------------------
create or replace function redeem_invitation(p_token text)
returns jsonb language plpgsql security definer
set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_inv beta_invitations%rowtype;
  v_hash text;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;

  select email into v_email from auth.users where id = v_uid;
  v_hash := encode(digest(p_token, 'sha256'), 'hex');

  select * into v_inv from beta_invitations
  where token_hash = v_hash for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'invalid_token');
  end if;

  if v_inv.status = 'redeemed' then
    if v_inv.redeemed_by = v_uid then
      return jsonb_build_object('ok', true, 'already', true);
    end if;
    return jsonb_build_object('ok', false, 'error', 'already_used');
  end if;

  if v_inv.status <> 'pending' then
    return jsonb_build_object('ok', false, 'error', 'not_pending');
  end if;

  if v_inv.expires_at < now() then
    update beta_invitations set status = 'expired' where id = v_inv.id;
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;

  if lower(v_inv.email) <> lower(v_email) then
    return jsonb_build_object('ok', false, 'error', 'email_mismatch');
  end if;

  insert into beta_access (user_id, email, invited_by)
  values (v_uid, v_email, v_inv.created_by)
  on conflict (user_id) do nothing;

  update beta_invitations
  set status = 'redeemed', redeemed_by = v_uid, redeemed_at = now()
  where id = v_inv.id;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function redeem_invitation(text) to authenticated;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table beta_agreements enable row level security;
alter table beta_admins enable row level security;
alter table beta_invitations enable row level security;
alter table beta_access enable row level security;
alter table beta_acceptances enable row level security;
alter table beta_feedback enable row level security;
alter table beta_events enable row level security;

-- Agreements: any signed-in user can read (needed pre-acceptance);
-- only admins create or (de)activate versions. Body stays immutable
-- via the trigger above.
drop policy if exists "agreements_read" on beta_agreements;
create policy "agreements_read" on beta_agreements
  for select to authenticated using (true);
drop policy if exists "agreements_admin_insert" on beta_agreements;
create policy "agreements_admin_insert" on beta_agreements
  for insert to authenticated with check (beta_is_admin());
drop policy if exists "agreements_admin_update" on beta_agreements;
create policy "agreements_admin_update" on beta_agreements
  for update to authenticated using (beta_is_admin()) with check (beta_is_admin());

-- Admins: see your own row, or all rows if you are an admin.
drop policy if exists "admins_read" on beta_admins;
create policy "admins_read" on beta_admins
  for select to authenticated using (user_id = auth.uid() or beta_is_admin());
drop policy if exists "admins_admin_write" on beta_admins;
create policy "admins_admin_write" on beta_admins
  for all to authenticated using (beta_is_admin()) with check (beta_is_admin());

-- Invitations: admins only. Testers never read this table.
drop policy if exists "invitations_admin_all" on beta_invitations;
create policy "invitations_admin_all" on beta_invitations
  for all to authenticated using (beta_is_admin()) with check (beta_is_admin());

-- Access: read your own row; admins manage everything.
drop policy if exists "access_read" on beta_access;
create policy "access_read" on beta_access
  for select to authenticated using (user_id = auth.uid() or beta_is_admin());
drop policy if exists "access_admin_write" on beta_access;
create policy "access_admin_write" on beta_access
  for all to authenticated using (beta_is_admin()) with check (beta_is_admin());

-- Acceptances: a tester inserts only their own, only with active access;
-- reads their own; admins read/delete (deletion = privacy requests).
drop policy if exists "acceptances_insert" on beta_acceptances;
create policy "acceptances_insert" on beta_acceptances
  for insert to authenticated
  with check (user_id = auth.uid() and beta_has_active_access());
drop policy if exists "acceptances_read" on beta_acceptances;
create policy "acceptances_read" on beta_acceptances
  for select to authenticated using (user_id = auth.uid() or beta_is_admin());
drop policy if exists "acceptances_admin_delete" on beta_acceptances;
create policy "acceptances_admin_delete" on beta_acceptances
  for delete to authenticated using (beta_is_admin());

-- Feedback: submit your own with active access; read your own; admins read/delete.
drop policy if exists "feedback_insert" on beta_feedback;
create policy "feedback_insert" on beta_feedback
  for insert to authenticated
  with check (user_id = auth.uid() and beta_has_active_access());
drop policy if exists "feedback_read" on beta_feedback;
create policy "feedback_read" on beta_feedback
  for select to authenticated using (user_id = auth.uid() or beta_is_admin());
drop policy if exists "feedback_admin_delete" on beta_feedback;
create policy "feedback_admin_delete" on beta_feedback
  for delete to authenticated using (beta_is_admin());

-- Events: record your own with active access; admins read/delete.
drop policy if exists "events_insert" on beta_events;
create policy "events_insert" on beta_events
  for insert to authenticated
  with check (user_id = auth.uid() and beta_has_active_access());
drop policy if exists "events_admin_read" on beta_events;
create policy "events_admin_read" on beta_events
  for select to authenticated using (beta_is_admin());
drop policy if exists "events_admin_delete" on beta_events;
create policy "events_admin_delete" on beta_events
  for delete to authenticated using (beta_is_admin());

-- ---------------------------------------------------------------------
-- Seed: Beta Testing Agreement v1.0 (DRAFT — for attorney review)
-- Keep in sync with docs/BETA_AGREEMENT_DRAFT.md. The body stored here
-- is the canonical text of this version once seeded; accepted records
-- reference it by id, so the exact accepted text is always retrievable.
-- Before launch, replace the bracketed placeholders.
-- ---------------------------------------------------------------------
insert into beta_agreements (version, effective_date, title, body, active)
values (
  '1.0',
  -- PLACEHOLDER DATE: set the real effective date by creating the
  -- launch version in the admin interface before inviting testers.
  '2026-01-01'::date,
  'AXZIO | ARRIVAL — Beta Testing Agreement',
  $AGREEMENT$
DRAFT — FOR ATTORNEY REVIEW. Version 1.0. Provider: [LEGAL ENTITY NAME] ("NE3ULA"). Contact: [CONTACT EMAIL]. Product: AXZIO | ARRIVAL (the "Beta").

You must be 18 years or older to participate in the Beta.

A. CONFIDENTIALITY
The Beta, and everything you learn through it that is not public, is confidential information belonging to NE3ULA ("Confidential Information"). This includes nonpublic application features, workflows, product designs, business information, technical materials, development plans, and related materials provided to you as a tester. You agree to keep Confidential Information confidential, use it only to evaluate the Beta as authorized, not disclose it to any third party, and protect it with at least the care you use for your own confidential information. Confidential Information does not include information that: is or becomes publicly available through no fault of yours; you lawfully received from a third party without a duty of confidentiality; you independently developed without using Confidential Information; or must be disclosed by law or court order (where legally permitted, you will notify us promptly so we may seek protection).

B. LIMITED EVALUATION LICENSE
We grant you a personal, limited, revocable, non-exclusive, non-transferable right to access and use the Beta solely to evaluate it and provide feedback. This is a license to evaluate only — it is not a sale, and it does not grant any other rights.

C. RESTRICTIONS ON USE
Subject to applicable law, you agree not to: copy or redistribute the Beta or its nonpublic materials; share your login credentials, invitation, or access links with anyone; provide unauthorized third parties with access to the Beta; publish nonpublic screenshots, recordings, or descriptions of the Beta; reverse engineer or extract proprietary materials from the Beta, except where this restriction is prohibited by applicable law; use Confidential Information to build, or help build, a competing implementation of the Beta's nonpublic features; or use confidential beta materials for any commercial purpose. Nothing in this Agreement prohibits lawful independent development that does not use Confidential Information, or any conduct that cannot legally be restricted.

D. INTELLECTUAL PROPERTY OWNERSHIP
The Beta, AXZIO, NE3ULA, and all underlying code, designs, branding, and proprietary materials are and remain the property of NE3ULA and its licensors. This Agreement does not transfer any ownership to you. All rights not expressly granted are reserved.

E. FEEDBACK PERMISSION
If you voluntarily submit feedback, suggestions, or bug reports, you grant NE3ULA permission to use them for product development and any other lawful purpose, without additional compensation, subject to applicable law. This does not give NE3ULA ownership of your personal journal entries, reflections, intentions, or other private user content. Your private reflections remain yours (see the Privacy Notice).

F. BETA DISCLAIMERS
The Beta is experimental, unfinished software provided "as is." Features may change, fail, or disappear without notice; access may be interrupted or revoked at any time; data loss is possible — do not rely on the Beta to store anything you cannot afford to lose; continuous availability is not guaranteed; participation is entirely voluntary. To the maximum extent permitted by applicable law, NE3ULA disclaims all warranties, express or implied, and will not be liable for indirect, incidental, or consequential damages arising from participation in the Beta. Nothing in this section limits liability that cannot lawfully be limited. AXZIO is a self-reflection and personal development tool. It is not medical, psychological, or emergency treatment, and it is not a substitute for professional care.

G. TERMINATION
Either party may end your participation at any time. We may revoke Beta access at our discretion, including for violation of this Agreement. Upon termination, your access ends and you must stop using Confidential Information. The confidentiality obligations in Section A survive termination for [SURVIVAL PERIOD], except where a longer or shorter period is required by law. Sections D, E, and F survive as applicable.

H. GOVERNING LAW
This Agreement is governed by the laws of the State of California, United States, without regard to conflict-of-law rules. [VENUE / DISPUTE RESOLUTION — for attorney review.]

This draft has not been reviewed by an attorney and is not legal advice. It is not, by itself, a guarantee of a legally binding signature mechanism.
$AGREEMENT$,
  true
)
on conflict (version) do nothing;

-- =====================================================================
-- ADMIN BOOTSTRAP (run once, after the admin has signed in at least
-- once so their auth user exists — e.g., invite yourself first):
--
--   insert into beta_admins (user_id)
--   select id from auth.users where email = '[ADMIN EMAIL]'
--   on conflict do nothing;
-- =====================================================================
