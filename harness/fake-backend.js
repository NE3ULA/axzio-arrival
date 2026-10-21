/* In-memory fake of the beta backend contract (src/beta.js), shared by
   the harnesses. Records calls so tests can assert what the UI sent. */

export function makeFakeBackend(overrides = {}) {
  const state = {
    session: { user: { id: "u-tester", email: "tester@example.com" } },
    access: { user_id: "u-tester", email: "tester@example.com", status: "active" },
    acceptance: { id: "acc-1", agreement_id: "ag-1" },
    agreement: {
      id: "ag-1",
      version: "1.0",
      effective_date: "2026-01-01",
      title: "AXZIO | ARRIVAL — Beta Testing Agreement",
      body: "AGREEMENT BODY — Section A. Confidentiality …",
      active: true,
    },
    admin: false,
    redeemResult: { ok: true },
    invitations: [],
    accessList: [],
    acceptances: [],
    feedbackList: [],
    eventsList: [],
    agreements: [],
    calls: { redeem: [], accept: [], feedback: [], events: [], invites: [] },
    ...overrides,
  };

  const backend = {
    getSession: async () => state.session,
    onAuthChange: () => () => {},
    signInWithEmail: async () => {},
    verifyCode: async () => {},
    signOut: async () => {
      state.session = null;
    },
    redeemInvitation: async (token) => {
      state.calls.redeem.push(token);
      if (state.redeemResult.ok) {
        state.access = { user_id: state.session.user.id, email: state.session.user.email, status: "active" };
      }
      return state.redeemResult;
    },
    getMyAccess: async () => state.access,
    getActiveAgreement: async () => state.agreement,
    getMyAcceptance: async () => state.acceptance,
    acceptAgreement: async (agreement) => {
      state.calls.accept.push(agreement.id);
      state.acceptance = { id: "acc-new", agreement_id: agreement.id };
    },
    isAdmin: async () => state.admin,
    submitFeedback: async (fb) => {
      state.calls.feedback.push(fb);
      state.feedbackList.push({ id: `fb-${state.feedbackList.length}`, created_at: new Date().toISOString(), ...fb });
    },
    logEvent: async (kind) => {
      state.calls.events.push(kind);
      state.eventsList.push({ id: `ev-${state.eventsList.length}`, kind, created_at: new Date().toISOString() });
    },
    adminCreateInvitation: async (row) => {
      state.calls.invites.push(row);
      state.invitations.push({ id: `inv-${state.invitations.length}`, status: "pending", created_at: new Date().toISOString(), ...row });
    },
    adminListInvitations: async () => state.invitations,
    adminListAccess: async () => state.accessList,
    adminListAcceptances: async () => state.acceptances,
    adminListFeedback: async () => state.feedbackList,
    adminListEvents: async () => state.eventsList,
    adminSetAccessStatus: async (userId, status) => {
      const row = state.accessList.find((a) => a.user_id === userId);
      if (row) row.status = status;
    },
    adminListAgreements: async () => state.agreements,
    adminCreateAgreement: async (row) => {
      state.agreements.push({ id: `ag-${state.agreements.length}`, ...row });
    },
    adminSetActiveAgreement: async (id) => {
      state.agreements.forEach((a) => (a.active = a.id === id));
    },
    adminDeleteUserData: async (userId) => {
      state.accessList = state.accessList.filter((a) => a.user_id !== userId);
      state.acceptances = state.acceptances.filter((a) => a.user_id !== userId);
      state.feedbackList = state.feedbackList.filter((f) => f.user_id !== userId);
      state.eventsList = state.eventsList.filter((e) => e.user_id !== userId);
    },
  };

  return { backend, state };
}
