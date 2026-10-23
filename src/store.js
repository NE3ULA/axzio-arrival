/* AXZIO | ARRIVAL — local session storage.
   V0.2.2: the device holds a COLLECTION of sessions ("your cards").
   Every journey adds one; beginning a new arrival never replaces an
   existing card. All content stays in localStorage on the user's own
   device — no accounts, no sync, nothing leaves the device.

   Migration: V0.1–V0.2.1 stored a single session object under this same
   key. The loader wraps a bare object into a one-card collection, and
   the next save writes the collection form — a card created before the
   upgrade survives it untouched. */

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
    // The One Thing: exactly one live card may hold priority (V0.2.7)
    priority: false,
  };
}

function coerceSession(raw) {
  if (!raw || typeof raw !== "object" || typeof raw.stage !== "number") return null;
  return { ...newSession(), ...raw };
}

export function loadSessions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(coerceSession).filter(Boolean);
    const single = coerceSession(parsed);
    return single ? [single] : [];
  } catch {
    return [];
  }
}

export function saveSessions(sessions) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  } catch {
    /* storage full / private mode — the in-memory sessions still work */
  }
}

export function clearStoredSessions() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nothing to clear */
  }
}
