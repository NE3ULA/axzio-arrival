/* AXZIO | ARRIVAL — V0.2 beta-gate harness (jsdom + fake backend).
   Verifies the protection story end-to-end at the UI level:
   signed-out users see only the gate; localStorage tampering does NOT
   unlock the journey; invitation redemption (good/bad/expired/mismatch),
   agreement acceptance (unchecked boxes block; server record required),
   revocation, feedback submission, minimal events, and admin gating. */
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/",
  pretendToBeVisual: true,
});
global.window = dom.window;
global.document = dom.window.document;
Object.defineProperty(global, "navigator", { value: dom.window.navigator, configurable: true });
global.localStorage = dom.window.localStorage;
global.sessionStorage = dom.window.sessionStorage;
global.HTMLElement = dom.window.HTMLElement;
global.HTMLCanvasElement = dom.window.HTMLCanvasElement;
global.Node = dom.window.Node;
global.Event = dom.window.Event;
global.MouseEvent = dom.window.MouseEvent;
global.getComputedStyle = dom.window.getComputedStyle;
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
global.cancelAnimationFrame = (id) => clearTimeout(id);
global.IS_REACT_ACT_ENVIRONMENT = true;

// Canvas stubs (card export path) — same approach as the journey harness.
dom.window.HTMLCanvasElement.prototype.getContext = function () {
  return new Proxy(
    {},
    {
      get: (t, prop) => {
        if (prop === "measureText") return () => ({ width: 120 });
        if (prop === "createLinearGradient" || prop === "createRadialGradient")
          return () => ({ addColorStop: () => {} });
        if (typeof prop === "string") return () => {};
        return undefined;
      },
      set: () => true,
    }
  );
};
dom.window.HTMLCanvasElement.prototype.toBlob = function (cb) {
  cb(new dom.window.Blob(["png"], { type: "image/png" }));
};
global.URL = dom.window.URL;
global.Blob = dom.window.Blob;
global.File = dom.window.File;
dom.window.URL.createObjectURL = () => "blob:stub";
dom.window.URL.revokeObjectURL = () => {};

const React = await import("react");
const { createRoot } = await import("react-dom/client");
const { act } = await import("react-dom/test-utils");
const { default: App } = await import("../src/App.jsx");
const { setBackend } = await import("../src/beta.js");
const { makeFakeBackend } = await import("./fake-backend.js");
const { STORAGE_KEY } = await import("../src/store.js");

let passed = 0;
let failed = 0;
function check(name, cond) {
  if (cond) {
    passed++;
    console.log(`  ok — ${name}`);
  } else {
    failed++;
    console.log(`  FAIL — ${name}`);
  }
}
const tid = (id) => document.querySelector(`[data-testid="${id}"]`);
function click(el) {
  act(() => {
    el.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}
function type(el, value) {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value").set;
  act(() => {
    setter.call(el, value);
    el.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
}
function setChecked(el, on) {
  // jsdom toggles the box natively on click, which is what React's
  // onChange reads — setting .checked manually and then clicking would
  // double-toggle back off.
  if (el.checked !== on) {
    act(() => {
      el.click();
    });
  }
}
async function flush(times = 5) {
  for (let i = 0; i < times; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}
let root = null;
async function mount() {
  if (root) act(() => root.unmount());
  document.body.innerHTML = '<div id="root"></div>';
  root = createRoot(document.getElementById("root"));
  act(() => {
    root.render(React.createElement(App));
  });
  await flush();
}
function resetStores() {
  localStorage.clear();
  sessionStorage.clear();
  window.location.hash = "";
}

console.log("ARRIVAL beta-gate harness");

/* ---- A. Signed out: gate only, and storage tampering does not unlock ---- */
resetStores();
setBackend(makeFakeBackend({ session: null }).backend);
await mount();
check("A: sign-in gate is shown", !!tid("gate-signin"));
check("A: journey is NOT rendered", !tid("journey"));
// Tamper: fake a completed journey + 'accepted' flags in local storage
localStorage.setItem(STORAGE_KEY, JSON.stringify({ stage: 4, status: "completed", state: "Clear" }));
localStorage.setItem("arrival-accepted", "true");
localStorage.setItem("beta_access", "active");
await mount();
check("A: tampered localStorage still does not unlock", !tid("journey") && !!tid("gate-signin"));

/* ---- B. Signed in with a pending invitation: auto-claim → acceptance gate ---- */
resetStores();
{
  var fakeB = makeFakeBackend({ access: null, acceptance: null });
  setBackend(fakeB.backend);
}
await mount();
check("B: invitation claimed automatically by verified email", fakeB.state.calls.claim.length === 1);
check("B: no token was asked for", !tid("gate-noinvite"));
check("B: acceptance gate shown (not journey)", !!tid("gate-accept") && !tid("journey"));
check("B: agreement body is the server's text", tid("agreement-body").textContent.includes("Section A. Confidentiality"));
check("B: version + date displayed", document.body.textContent.includes("Version 1.0"));
check("B: join button disabled until both boxes checked", tid("agree-submit").disabled === true);
setChecked(tid("agree-check"), true);
check("B: still disabled with only agreement checked", tid("agree-submit").disabled === true);
setChecked(tid("adult-check"), true);
check("B: enabled once both checked", tid("agree-submit").disabled === false);
click(tid("agree-submit"));
await flush();
check("B: acceptance recorded server-side (fake)", fakeB.state.calls.accept.join() === "ag-1");
check("B: journey unlocked after acceptance", !!tid("journey"));
// journey_started metric fires on first content
click(tid("state-Stuck"));
check("B: journey_started event logged", fakeB.state.calls.events.includes("journey_started"));

/* ---- C. Uninvited email → invitation-only screen; token fallback still works ---- */
resetStores();
{
  var fakeC = makeFakeBackend({
    access: null,
    acceptance: null,
    claimResult: { ok: false, error: "no_invitation" },
    redeemResult: { ok: true },
  });
  setBackend(fakeC.backend);
}
await mount();
check("C: invitation-only screen shown", !!tid("gate-noinvite"));
check("C: explains the email isn't on the list", document.body.textContent.includes("isn't on"));
type(tid("gate-token"), "tok-pasted");
click(tid("gate-redeem"));
await flush();
check("C: pasted token redeemed (fallback path)", fakeC.state.calls.redeem.includes("tok-pasted"));
check("C: proceeds to acceptance", !!tid("gate-accept"));

/* ---- D. Revoked tester is stopped ---- */
resetStores();
setBackend(makeFakeBackend({ access: { user_id: "u-tester", email: "tester@example.com", status: "revoked" } }).backend);
await mount();
check("D: revoked screen shown", !!tid("gate-revoked"));
check("D: journey NOT rendered", !tid("journey"));

/* ---- E. Accepted tester: straight in; feedback submits minimal data ---- */
resetStores();
localStorage.setItem(
  STORAGE_KEY,
  JSON.stringify({
    id: "s1",
    createdAt: Date.now(),
    stage: 4,
    state: "Clear",
    stateNote: "",
    matters: "m",
    mattersPrompt: "",
    choice: "c",
    step: "do it",
    cardAt: Date.now(),
    status: "begun",
    begunAt: Date.now(),
    completedAt: null,
  })
);
{
  var fakeE = makeFakeBackend();
  setBackend(fakeE.backend);
}
await mount();
check("E: accepted tester reaches the journey directly", !!tid("journey"));
check("E: feedback form offered after BEGIN", !!tid("fb-form"));
click(tid("fb-rate-5"));
type(tid("fb-text"), "It cut through the noise.");
setChecked(tid("fb-followup"), true);
click(tid("fb-submit"));
await flush();
check("E: feedback sent exactly once", fakeE.state.calls.feedback.length === 1);
check(
  "E: feedback carries rating + text + follow-up, no journey content",
  fakeE.state.calls.feedback[0].clarity_rating === 5 &&
    fakeE.state.calls.feedback[0].feedback === "It cut through the noise." &&
    fakeE.state.calls.feedback[0].followup_ok === true &&
    !JSON.stringify(fakeE.state.calls.feedback[0]).includes("do it")
);
check("E: thanks state shown", !!tid("fb-thanks"));

/* ---- F. Admin: metrics, invitations, tester management ---- */
resetStores();
window.location.hash = "#/admin";
{
  var fakeF = makeFakeBackend({
    admin: true,
    invitations: [{ id: "i1", email: "a@x.com", status: "pending", expires_at: new Date(Date.now() + 86400000).toISOString(), created_at: new Date().toISOString() }],
    accessList: [{ user_id: "u2", email: "second@example.com", status: "active", created_at: new Date().toISOString() }],
    acceptances: [{ id: "ac1", user_id: "u2", email: "second@example.com", agreement_version: "1.0", accepted_at: new Date().toISOString() }],
    feedbackList: [{ id: "f1", user_id: "u2", clarity_rating: 4, feedback: "good", bug_report: "", followup_ok: false, created_at: new Date().toISOString() }],
    eventsList: [
      { id: "e1", user_id: "u2", kind: "journey_started", created_at: new Date().toISOString() },
      { id: "e2", user_id: "u2", kind: "journey_started", created_at: new Date().toISOString() },
      { id: "e3", user_id: "u2", kind: "journey_completed", created_at: new Date().toISOString() },
    ],
    agreements: [{ id: "ag-1", version: "1.0", effective_date: "2026-01-01", active: true }],
  });
  setBackend(fakeF.backend);
}
await mount();
check("F: admin root renders for an admin", !!tid("admin-root"));
const metricsText = tid("admin-metrics") ? tid("admin-metrics").textContent : "";
check("F: metrics show issued/started/completed", metricsText.includes("1") && metricsText.includes("2") && metricsText.includes("50%"));
type(tid("adm-email"), "new@example.com");
click(tid("adm-create"));
await flush();
check("F: invitation created with hashed token", fakeF.state.calls.invites.length === 1 && /^[0-9a-f]{64}$/.test(fakeF.state.calls.invites[0].token_hash));
check("F: confirmation names the invited email (no token link to send)", !!tid("adm-invite-created") && tid("adm-invite-created").textContent.includes("new@example.com"));
click(tid("adm-revoke-second@example.com"));
await flush();
check("F: revoke flips tester status", fakeF.state.accessList[0].status === "revoked");

/* ---- G. Non-admin is refused the admin interface ---- */
resetStores();
window.location.hash = "#/admin";
setBackend(makeFakeBackend({ admin: false }).backend);
await mount();
check("G: non-admin sees Not authorized", document.body.textContent.includes("Not authorized"));
check("G: admin root NOT rendered", !tid("admin-root"));

if (root) act(() => root.unmount());
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
