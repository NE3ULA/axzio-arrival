/* AXZIO | ARRIVAL — beta backend configuration.
 *
 * Fill these in at beta go-live with the NEW, ISOLATED Supabase project's
 * values (never the production AXZIO project). The anon key is designed to
 * be public: every table is protected by Row Level Security, and all
 * access decisions are enforced server-side. No service-role key or admin
 * secret ever belongs in client code.
 *
 * While these are empty, the app shows a "beta not yet open" holding
 * screen — the journey is never reachable without the live backend. */

export const SUPABASE_URL = "";
export const SUPABASE_ANON_KEY = "";

export const betaConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
