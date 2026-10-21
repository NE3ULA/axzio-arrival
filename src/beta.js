/* AXZIO | ARRIVAL — beta backend layer.
 *
 * Every access decision is enforced server-side by Supabase Row Level
 * Security (see supabase/beta-schema.sql). This module is only a client:
 * it holds no secrets, and nothing it returns is trusted by the server.
 *
 * The backend is swappable so the acceptance harness can drive the real
 * UI against an in-memory fake with the same contract — the production
 * path constructs the Supabase client lazily, only when configured. */
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY, betaConfigured } from "./beta-config.js";

let backend = null;
let backendWasSet = false;

/** Test-only: substitute the backend (used by the jsdom harness). */
export function setBackend(b) {
  backend = b;
  backendWasSet = true;
}

/** True when a live backend is configured, or one was substituted. */
export function backendReady() {
  return betaConfigured || backendWasSet;
}

export function getBackend() {
  if (!backend) backend = createSupabaseBackend();
  return backend;
}

export const api = {
  getSession: () => getBackend().getSession(),
  onAuthChange: (cb) => getBackend().onAuthChange(cb),
  signInWithEmail: (email) => getBackend().signInWithEmail(email),
  verifyCode: (email, code) => getBackend().verifyCode(email, code),
  signOut: () => getBackend().signOut(),
  redeemInvitation: (token) => getBackend().redeemInvitation(token),
  getMyAccess: () => getBackend().getMyAccess(),
  getActiveAgreement: () => getBackend().getActiveAgreement(),
  getMyAcceptance: (agreementId) => getBackend().getMyAcceptance(agreementId),
  acceptAgreement: (agreement) => getBackend().acceptAgreement(agreement),
  isAdmin: () => getBackend().isAdmin(),
  submitFeedback: (fb) => getBackend().submitFeedback(fb),
  logEvent: (kind) => getBackend().logEvent(kind),
  // Administrator
  adminCreateInvitation: (row) => getBackend().adminCreateInvitation(row),
  adminListInvitations: () => getBackend().adminListInvitations(),
  adminListAccess: () => getBackend().adminListAccess(),
  adminListAcceptances: () => getBackend().adminListAcceptances(),
  adminListFeedback: () => getBackend().adminListFeedback(),
  adminListEvents: () => getBackend().adminListEvents(),
  adminSetAccessStatus: (userId, status) => getBackend().adminSetAccessStatus(userId, status),
  adminListAgreements: () => getBackend().adminListAgreements(),
  adminCreateAgreement: (row) => getBackend().adminCreateAgreement(row),
  adminSetActiveAgreement: (id) => getBackend().adminSetActiveAgreement(id),
  adminDeleteUserData: (userId) => getBackend().adminDeleteUserData(userId),
};

/* ---------------- invitation tokens ---------------- */

/** A single-use invitation token: 32 random bytes, URL-safe. */
export function generateInviteToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** SHA-256 hex — the only form of the token ever stored server-side. */
export async function hashInviteToken(token) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/* ---------------- Supabase implementation ---------------- */

function createSupabaseBackend() {
  if (!betaConfigured) {
    const unavailable = async () => {
      throw new Error("Beta backend is not configured.");
    };
    return new Proxy({}, { get: () => unavailable });
  }
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const uid = async () => {
    const { data } = await sb.auth.getSession();
    return data.session ? data.session.user.id : null;
  };

  return {
    async getSession() {
      const { data } = await sb.auth.getSession();
      return data.session
        ? { user: { id: data.session.user.id, email: data.session.user.email } }
        : null;
    },
    onAuthChange(cb) {
      const { data } = sb.auth.onAuthStateChange((_event, session) => {
        cb(session ? { user: { id: session.user.id, email: session.user.email } } : null);
      });
      return () => data.subscription.unsubscribe();
    },
    async signInWithEmail(email) {
      const { error } = await sb.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: window.location.origin + window.location.pathname,
        },
      });
      if (error) throw error;
    },
    async verifyCode(email, code) {
      const { error } = await sb.auth.verifyOtp({ email, token: code, type: "email" });
      if (error) throw error;
    },
    async signOut() {
      await sb.auth.signOut();
    },
    async redeemInvitation(token) {
      const { data, error } = await sb.rpc("redeem_invitation", { p_token: token });
      if (error) return { ok: false, error: "server_error" };
      return data;
    },
    async getMyAccess() {
      const id = await uid();
      if (!id) return null;
      const { data } = await sb.from("beta_access").select("*").eq("user_id", id).maybeSingle();
      return data;
    },
    async getActiveAgreement() {
      const { data } = await sb
        .from("beta_agreements")
        .select("*")
        .eq("active", true)
        .maybeSingle();
      return data;
    },
    async getMyAcceptance(agreementId) {
      const id = await uid();
      if (!id) return null;
      const { data } = await sb
        .from("beta_acceptances")
        .select("*")
        .eq("user_id", id)
        .eq("agreement_id", agreementId)
        .maybeSingle();
      return data;
    },
    async acceptAgreement(agreement) {
      const id = await uid();
      const { data: sess } = await sb.auth.getSession();
      const { error } = await sb.from("beta_acceptances").insert({
        user_id: id,
        email: sess.session.user.email,
        agreement_id: agreement.id,
        agreement_version: agreement.version,
        user_agent: navigator.userAgent,
      });
      if (error) throw error;
    },
    async isAdmin() {
      const id = await uid();
      if (!id) return false;
      const { data } = await sb.from("beta_admins").select("user_id").eq("user_id", id).maybeSingle();
      return Boolean(data);
    },
    async submitFeedback(fb) {
      const id = await uid();
      const { error } = await sb.from("beta_feedback").insert({ user_id: id, ...fb });
      if (error) throw error;
    },
    async logEvent(kind) {
      const id = await uid();
      if (!id) return;
      await sb.from("beta_events").insert({ user_id: id, kind });
    },
    /* ----- administrator ----- */
    async adminCreateInvitation(row) {
      const { error } = await sb.from("beta_invitations").insert(row);
      if (error) throw error;
    },
    async adminListInvitations() {
      const { data } = await sb.from("beta_invitations").select("*").order("created_at", { ascending: false });
      return data || [];
    },
    async adminListAccess() {
      const { data } = await sb.from("beta_access").select("*").order("created_at", { ascending: false });
      return data || [];
    },
    async adminListAcceptances() {
      const { data } = await sb.from("beta_acceptances").select("*").order("accepted_at", { ascending: false });
      return data || [];
    },
    async adminListFeedback() {
      const { data } = await sb.from("beta_feedback").select("*").order("created_at", { ascending: false });
      return data || [];
    },
    async adminListEvents() {
      const { data } = await sb.from("beta_events").select("*").order("created_at", { ascending: false });
      return data || [];
    },
    async adminSetAccessStatus(userId, status) {
      const patch = status === "revoked" ? { status, revoked_at: new Date().toISOString() } : { status, revoked_at: null };
      const { error } = await sb.from("beta_access").update(patch).eq("user_id", userId);
      if (error) throw error;
    },
    async adminListAgreements() {
      const { data } = await sb.from("beta_agreements").select("*").order("created_at", { ascending: false });
      return data || [];
    },
    async adminCreateAgreement(row) {
      const { error } = await sb.from("beta_agreements").insert(row);
      if (error) throw error;
    },
    async adminSetActiveAgreement(id) {
      const { error: e1 } = await sb.from("beta_agreements").update({ active: false }).eq("active", true);
      if (e1) throw e1;
      const { error: e2 } = await sb.from("beta_agreements").update({ active: true }).eq("id", id);
      if (e2) throw e2;
    },
    async adminDeleteUserData(userId) {
      // Deletes the tester's beta records. The sign-in account itself is
      // removed separately in the Supabase dashboard (Authentication →
      // Users) — documented in the pre-launch checklist.
      for (const table of ["beta_feedback", "beta_events", "beta_acceptances", "beta_access"]) {
        const { error } = await sb.from(table).delete().eq("user_id", userId);
        if (error) throw error;
      }
    },
  };
}
