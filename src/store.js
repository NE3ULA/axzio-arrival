/* AXZIO | ARRIVAL — local session storage.
   V1 keeps exactly one session (the most recent) in localStorage on the
   user's own device. Nothing leaves the device; there are no accounts,
   no sync, and no analytics. */

export const STORAGE_KEY = "axzio-arrival:v1";

export function newSession() {
  return {
    id: Math.random().toString(36).slice(2, 10),
    createdAt: Date.now(),
    stage: 1,
    // Stage 1 — Awareness
    state: "",
    stateNote: "",
    // Stage 2 — Arrival
    matters: "",
    mattersPrompt: "",
    // Stage 3 — Choice
    choice: "",
    step: "",
    // Stage 4 — Action
    cardAt: null,
    status: "draft", // draft | begun | completed
    begunAt: null,
    completedAt: null,
  };
}

export function loadSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || typeof parsed.stage !== "number") return null;
    return { ...newSession(), ...parsed };
  } catch {
    return null;
  }
}

export function saveSession(session) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    /* storage full / private mode — the in-memory session still works */
  }
}

export function clearStoredSession() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nothing to clear */
  }
}
