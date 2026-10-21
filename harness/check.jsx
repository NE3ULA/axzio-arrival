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
const { STORAGE_KEY } = await import("../src/store.js");
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
const stored = () => JSON.parse(localStorage.getItem(STORAGE_KEY));

console.log("ARRIVAL acceptance harness");
// Fresh start
localStorage.clear();
let root = await mount();

// 1–2. Opens to Stage 1, state selection gates Continue
check("stage 1 question shown", document.body.textContent.includes("Where are you right now?"));
check("all six states offered", ["Clear", "Scattered", "Overwhelmed", "Stuck", "Energized", "Unsure"].every((s) => tid(`state-${s}`)));
check("continue disabled before state chosen", tid("continue").disabled === true);
click(tid("state-Scattered"));
check("continue enabled after state chosen", tid("continue").disabled === false);
type(tid("state-note"), "Too many open loops.");
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

// Start a new session (two-tap confirm)
click(tid("new-session"));
check("first tap asks to confirm", tid("new-session").textContent.includes("Tap again to confirm"));
click(tid("new-session"));
check("new session returns to stage 1", document.body.textContent.includes("Where are you right now?"));
check("stored session is a fresh empty draft", stored().status === "draft" && stored().state === "" && stored().stage === 1);

// Clear my data (two-tap confirm) erases answers
click(tid("state-Clear"));
type(tid("state-note"), "secret note");
click(tid("clear-data"));
check("clear asks to confirm", tid("clear-data").textContent.includes("Tap again to erase"));
click(tid("clear-data"));
const after = stored();
check("stored data erased (empty template only)", after.state === "" && after.stateNote === "" && after.status === "draft");

act(() => root.unmount());
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
