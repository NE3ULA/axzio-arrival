-- =====================================================================
-- AXZIO | ARRIVAL — V0.2.1: bind invitations to the verified email
-- Run ONCE in the SQL Editor of the axzio-arrival-beta project.
-- =====================================================================
-- WHY: in V0.2 the invitation token lived only in a link the admin sent
-- manually. If a tester opened that link in a different browser/app than
-- the one they signed in with, the token was stranded and they hit a
-- dead-end screen asking for a code they never received.
--
-- NOW: the magic link already proves the tester controls the invited
-- mailbox, so claiming is bound to the verified sign-in email instead.
-- The tester is never handed a code. All V0.2 protections are unchanged:
-- invitations stay single-use, expiring, revocable, admin-issued, and
-- enforced server-side. The token path (redeem_invitation) remains as a
-- fallback for links already sent.
-- =====================================================================

create or replace function claim_invitation()
returns jsonb language plpgsql security definer
set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_inv beta_invitations%rowtype;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;

  select email into v_email from auth.users where id = v_uid;

  -- The newest pending invitation addressed to this verified email.
  select * into v_inv from beta_invitations
  where lower(email) = lower(v_email) and status = 'pending'
  order by created_at desc
  limit 1
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_invitation');
  end if;

  if v_inv.expires_at < now() then
    update beta_invitations set status = 'expired' where id = v_inv.id;
    return jsonb_build_object('ok', false, 'error', 'expired');
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

grant execute on function claim_invitation() to authenticated;

-- ---------------------------------------------------------------------
-- Organizer self-invite: one pending invitation for Jesse's sign-in
-- email, so signing in grants access without any admin-panel step.
-- (Guarded: re-running this file will not create a duplicate.)
-- ---------------------------------------------------------------------
insert into beta_invitations (email, token_hash, expires_at)
select 'affinitymojo3@gmail.com',
       encode(gen_random_bytes(24), 'hex'),
       now() + interval '30 days'
where not exists (
  select 1 from beta_invitations
  where email = 'affinitymojo3@gmail.com' and status = 'pending'
);

-- ---------------------------------------------------------------------
-- Final result shown by the SQL editor: your admin row.
-- One row below = you ARE an administrator (settles the open question).
-- Zero rows = the earlier bootstrap matched nothing; tell Monet.
-- ---------------------------------------------------------------------
select * from beta_admins;
