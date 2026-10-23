/* AXZIO | ARRIVAL — jsdom acceptance harness.
   Drives the real App through the directive's acceptance test:
   open → state → matters → choice → step → card → BEGIN → reopen →
   complete → new session → clear. Run via: npm run test:harness */
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
// Use jsdom's URL/Blob/File so the export path's stubs apply consistently
// (in a real browser these are all the window's classes anyway).
global.URL = dom.window.URL;
global.Blob = dom.window.Blob;
global.File = dom.window.File;
global.Node = dom.window.Node;
global.Event = dom.window.Event;
global.MouseEvent = dom.window.MouseEvent;
global.getComputedStyle = dom.window.getComputedStyle;
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
global.cancelAnimationFrame = (id) => clearTimeout(id);
global.IS_REACT_ACT_ENVIRONMENT = true;

// --- canvas stubs: record 2D calls so the export path is exercised ---
const canvasCalls = [];
const gradientStub = { addColorStop: () => {} };
dom.window.HTMLCanvasElement.prototype.getContext = function () {
  return new Proxy(
    {},
    {
      get: (t, prop) => {
        if (prop === "measureText") return () => ({ width: 120 });
        if (prop === "createLinearGradient" || prop === "createRadialGradient") return () => gradientStub;
        if (typeof prop === "string") {
          return (...args) => {
            canvasCalls.push(prop);
          };
        }
        return undefined;
      },
      set: () => true,
    }
  );
};
dom.window.HTMLCanvasElement.prototype.toBlob = function (cb) {
  cb(new dom.window.Blob(["png"], { type: "image/png" }));
};
dom.window.URL.createObjectURL = () => "blob:stub";
dom.window.URL.revokeObjectURL = () => {};

const React = await import("react");
const { createRoot } = await import("react-dom/client");
const { act } = await import("react-dom/test-utils");
const { default: App } = await import("../src/App.jsx");
const { STORAGE_KEY, loadSessions } = await import("../src/store.js");
const { setBackend } = await import("../src/beta.js");
const { makeFakeBackend } = await import("./fake-backend.js");

// The journey now sits behind the beta gate: install a fake backend in
// which the tester is signed in, has active access, and has already
// accepted the agreement — so the gate opens straight to the journey.
setBackend(makeFakeBackend().backend);

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
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];
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
async function flush(times = 4) {
  for (let i = 0; i < times; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}
async function mount() {
  document.body.innerHTML = '<div id="root"></div>';
  const root = createRoot(document.getElementById("root"));
  act(() => {
    root.render(React.createElement(App));
  });
  await flush();
  return root;
}
const storedAll = () => loadSessions();
const stored = () => {
  const all = loadSessions();
  return all[all.length - 1] || {};
};

console.log("ARRIVAL acceptance harness");

// Legacy migration: a V0.1–V0.2.1 single-session value becomes a card
localStorage.clear();
localStorage.setItem(
  STORAGE_KEY,
  JSON.stringify({
    id: "legacy1",
    createdAt: Date.now(),
    stage: 4,
    state: "Clear",
    stateNote: "",
    matters: "Legacy matters",
    mattersPrompt: "",
    choice: "Legacy choice",
    step: "Legacy step",
    cardAt: Date.now(),
    status: "begun",
    begunAt: Date.now(),
    completedAt: null,
  })
);
let root = await mount();
check("legacy session migrates and opens on its card", !!tid("identity-card") && document.body.textContent.includes("Legacy choice"));
check("migration wraps it into a one-card collection", storedAll().length === 1 && storedAll()[0].id === "legacy1");
act(() => root.unmount());

// Fresh start
localStorage.clear();
root = await mount();

// 1–2. Opens to Stage 1, state selection gates Continue
check("stage 1 question shown", document.body.textContent.includes("Where are you right now?"));
check("all six states offered", ["Clear", "Scattered", "Overwhelmed", "Stuck", "Energized", "Unsure"].every((s) => tid(`state-${s}`)));
check("continue disabled before state chosen", tid("continue").disabled === true);
click(tid("state-Scattered"));
check("continue enabled after state chosen", tid("continue").disabled === false);
type(tid("state-note"), "Too many open loops.");

// Step-1 Back under Current shows the card's action-card view (V0.2.9);
// the deck is reached by its tab, and the draft waits there untouched
check("stage 1 offers a back button", !!tid("back"));
click(tid("back"));
check("step-1 back shows the action card view", !!tid("identity-card") && tid("identity-card").textContent.includes("Scattered"));
click(tid("nav-deck"));
check("the deck tab holds the draft", !!tid("deck") && !!tid(`deck-card-${stored().id}`));
click(tid(`deck-card-${stored().id}`));
check("the draft reopens on its card view", !!tid("identity-card"));
click(tid("edit-answers"));
check("editing returns to stage 1 with answers intact", !!tid("state-Scattered") && tid("state-note").value === "Too many open loops.");

click(tid("continue"));

// 3. Stage 2 — matters, with gentle prompts
check("stage 2 question shown", document.body.textContent.includes("What matters most to you right now?"));
check("stage 2 continue disabled while empty", tid("continue").disabled === true);
click($$(".text-btn")[0]); // "Not sure? Start from a gentle prompt"
check("gentle prompts appear", document.body.textContent.includes("nobody else's opinion counted"));
click($$(".prompt-chip")[0]);
type(tid("matters"), "Finishing the record I started.");
click(tid("continue"));

// Back navigation retains answers
check("stage 3 choice question shown", document.body.textContent.includes("What is one thing you choose to move toward?"));
click(tid("back"));
check("back returns to stage 2 with matters intact", tid("matters") && tid("matters").value === "Finishing the record I started.");
click(tid("continue"));

// 4–5. Stage 3 — choice, then one small step
type(tid("choice"), "Ship the first ARRIVAL release.");
click(tid("continue"));
check("small-step question shown", document.body.textContent.includes("What is one small step you can take?"));
type(tid("step"), "Mix one song tonight for 25 minutes.");
click(tid("continue"));

// 6. Stage 4 — Identity State Card carries everything + date/time
const cardText = tid("identity-card") ? tid("identity-card").textContent : "";
check("card shows state + note", cardText.includes("Scattered") && cardText.includes("Too many open loops."));
check("card shows matters", cardText.includes("Finishing the record I started."));
check("card shows choice", cardText.includes("Ship the first ARRIVAL release."));
check("card shows next action", cardText.includes("Mix one song tonight for 25 minutes."));
check("card shows a date", /\d{4}/.test(cardText) && cardText.includes("·"));
check("card carries LIVE YOUR LEGEND", cardText.includes("LIVE YOUR LEGEND"));
check("session persisted as draft at stage 4", stored().status === "draft" && stored().stage === 4);

// 8. Close + reopen mid-journey — progress intact
act(() => root.unmount());
root = await mount();
check("reopen resumes at the card (stage 4)", !!tid("identity-card") && !!tid("begin"));

// Edit path from the card
click(tid("edit-answers"));
check("edit returns to stage 1 with state kept", !!tid("state-Scattered") && tid("state-Scattered").className.includes("on"));
click(tid("continue"));
click(tid("continue"));
click(tid("continue"));
click(tid("continue"));
check("walked back to the card", !!tid("begin"));

// 7. BEGIN → begun state + closing statement
click(tid("begin"));
check("closing statement presented", tid("closing") && tid("closing").textContent.includes("LIVE YOUR LEGEND."));
check("status pill shows Begun", document.body.textContent.includes("Begun ·"));
check("stored status is begun", stored().status === "begun");

// Reopen on a begun session → lands on the card home
act(() => root.unmount());
root = await mount();
check("reopen on begun session shows card home", !!tid("complete") && !!tid("identity-card"));

// Persistent navigation: present even with a single card
check("deck tabs are always available", !!tid("nav-deck") && !!tid("nav-current"));
click(tid("nav-deck"));
check("deck shows the one card, marked current", !!tid("deck") && tid(`deck-card-${stored().id}`).textContent.includes("Current"));
click(tid("nav-current"));
check("current tab returns to the card", !!tid("identity-card") && !!tid("complete"));

// Export wiring (canvas stubbed) → saved note
await act(async () => {
  tid("share").dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
});
check("card export ran through canvas", canvasCalls.includes("fillText") && canvasCalls.includes("fillRect"));
check("export confirmation shown", document.body.textContent.includes("Card image saved."));

// Complete the action
click(tid("complete"));
check("status pill shows Completed", document.body.textContent.includes("Completed ·"));
check("stored status is completed", stored().status === "completed");

// Begin a NEW arrival from the card — the completed card is KEPT
click(tid("new-arrival"));
check("new arrival returns to stage 1", document.body.textContent.includes("Where are you right now?"));
check("completed card kept in storage", storedAll().length === 2 && storedAll()[0].status === "completed");

// Walk the second journey to its card and BEGIN
click(tid("state-Clear"));
type(tid("state-note"), "Second focus.");

// Mid-journey, the deck is one tap away — and shows where you are
click(tid("nav-deck"));
check("deck opens mid-journey", !!tid("deck"));
const draftRow = tid(`deck-card-${stored().id}`);
check("the in-progress journey is marked Current in the deck", !!draftRow && draftRow.textContent.includes("Current"));
click(tid("nav-current"));
check("current tab resumes the journey where it left off", !!tid("state-note") && tid("state-note").value === "Second focus.");

click(tid("continue"));
type(tid("matters"), "Restoring the studio.");
click(tid("continue"));
type(tid("choice"), "Finish the vocal chain.");
click(tid("continue"));
type(tid("step"), "Print the reference mix.");
click(tid("continue"));
click(tid("begin"));
check("second card begun alongside the first", storedAll().length === 2 && storedAll()[1].status === "begun");

// Reopen with two cards → the stack is home
act(() => root.unmount());
root = await mount();
check("reopen with two cards shows the deck", !!tid("deck"));
check("deck lists both cards", $$('[data-testid^="deck-card-"]').length === 2);
check("deck shows the open card's next action", document.body.textContent.includes("Print the reference mix."));

// Open the completed card from the deck
click(tid(`deck-card-${storedAll()[0].id}`));
check("completed card opens from the deck", !!tid("identity-card") && document.body.textContent.includes("Completed ·"));

// Delete it (two-tap) — only that card goes
click(tid("delete-card"));
check("delete asks to confirm", tid("delete-card").textContent.includes("Tap again to delete"));
click(tid("delete-card"));
check("delete removes only that card", storedAll().length === 1 && storedAll()[0].status === "begun");
check("back at the deck after delete", !!tid("deck"));

// Clear my data (two-tap confirm) erases EVERYTHING — all cards
check("remaining card still holds its content before clear", storedAll()[0].step === "Print the reference mix.");
click(tid("clear-data"));
check("clear asks to confirm", tid("clear-data").textContent.includes("Tap again to erase"));
click(tid("clear-data"));
check("clear returns to a fresh stage 1", document.body.textContent.includes("Where are you right now?"));
const afterAll = storedAll();
check(
  "all cards erased (one empty template only)",
  afterAll.length === 1 && afterAll[0].state === "" && afterAll[0].stateNote === "" && afterAll[0].status === "draft"
);

// The One Thing (V0.2.7): one priority card, separated from the rest.
// (Continues from the cleared state: one blank draft, journey at stage 1.)
click(tid("state-Clear"));
type(tid("state-note"), "First arrival note.");
click(tid("continue"));
type(tid("matters"), "First matters.");
click(tid("continue"));
type(tid("choice"), "First choice.");
click(tid("continue"));
type(tid("step"), "First step.");
click(tid("continue"));
click(tid("begin"));
const firstBegunId = stored().id;
check("first card begun for the priority scenario", storedAll().length === 1 && stored().status === "begun");

click(tid("new-arrival"));
click(tid("state-Stuck"));
type(tid("state-note"), "Priority draft two.");
click(tid("nav-deck"));
check("two live cards are held", $$('[data-testid^="deck-card-"]').length === 2);
check("with two live cards and no choice, the One Thing slot asks", !!tid("onething-empty") && document.body.textContent.includes("No priority set"));
const secondDraftId = storedAll().find((s) => s.status === "draft" && s.stateNote === "Priority draft two.").id;
click(tid(`deck-star-${secondDraftId}`));
check("star flags exactly one priority card", storedAll().filter((s) => s.priority).length === 1 && storedAll().find((s) => s.priority).id === secondDraftId);
check(
  "priority card sits in its own One Thing section",
  !!tid("onething") && tid("onething").contains(tid(`deck-card-${secondDraftId}`)) && tid(`deck-card-${secondDraftId}`).textContent.includes("The One Thing")
);
check("priority card is not duplicated elsewhere in the deck", $$('[data-testid^="deck-card-"]').length === 2);

click(tid("nav-current"));
check("current tab opens the priority card", !!tid("state-note") && tid("state-note").value === "Priority draft two.");

click(tid("nav-deck"));
click(tid(`deck-card-${firstBegunId}`));
check("the other card's view offers the One Thing action", !!tid("set-priority"));
click(tid("set-priority"));
check("priority moves — still exactly one", storedAll().filter((s) => s.priority).length === 1 && storedAll().find((s) => s.priority).id === firstBegunId);
check("the card view wears the One Thing badge", !!tid("priority-badge") && tid("priority-badge").textContent.includes("The One Thing"));

click(tid("complete"));
check("completing the priority card clears its flag", storedAll().every((s) => !s.priority));
click(tid("nav-deck"));
check(
  "the last live card stands as the One Thing on its own",
  !!tid("onething") && tid("onething").textContent.includes("Priority draft two.")
);

// View ↔ edit under Current (V0.2.8): a begun card is no longer view-only.
// Walk the priority draft through to BEGIN, then edit it from its card view.
click(tid(`deck-card-${secondDraftId}`));
click(tid("continue"));
type(tid("matters"), "Second matters.");
click(tid("continue"));
type(tid("choice"), "Second choice.");
click(tid("continue"));
type(tid("step"), "Second step.");
click(tid("continue"));
click(tid("begin"));
check("second card begun", stored().status === "begun" && stored().choice === "Second choice.");
const begunAtBefore = stored().begunAt;

check("the card view offers Edit this card", !!tid("edit-card"));
click(tid("edit-card"));
check(
  "edit opens the journey at stage 1 with answers kept",
  document.body.textContent.includes("Where are you right now?") && !!tid("state-Stuck") && tid("state-Stuck").className.includes("on")
);
click(tid("continue"));
click(tid("continue"));
type(tid("choice"), "Second choice, revised.");
click(tid("continue"));
click(tid("continue"));
check("editing reaches the card with Save changes, not BEGIN", !!tid("save-edit") && !tid("begin"));
click(tid("save-edit"));
check(
  "save returns to the card — still begun, choice revised, begun time untouched",
  !!tid("identity-card") && stored().status === "begun" && stored().choice === "Second choice, revised." && stored().begunAt === begunAtBefore
);
check("the viewed card shows the revised choice", tid("identity-card").textContent.includes("Second choice, revised."));

click(tid("edit-card"));
click(tid("back"));
check("back from edit stage 1 returns to viewing the card", !!tid("identity-card") && !tid("deck"));

act(() => root.unmount());
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
