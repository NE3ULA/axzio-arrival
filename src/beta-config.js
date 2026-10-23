/* AXZIO | ARRIVAL — beta backend configuration.
 *
 * The NEW, ISOLATED Supabase project for the ARRIVAL beta (never the
 * production AXZIO project). The anon key is designed to be public:
 * every table is protected by Row Level Security, and all access
 * decisions are enforced server-side. No service-role key or admin
 * secret ever belongs in client code. */

export const SUPABASE_URL = "https://bhzjuyfkshreavojbmdc.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJoemp1eWZrc2hyZWF2b2pibWRjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI1NTA0NTgsImV4cCI6MjEwODEyNjQ1OH0.1n0kFkPUqtabPb3JVNMPZlOYbpdotZQJILfhW_5CYc8";

export const betaConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

/* Organizer usernames → account email. Supabase signs in by email; a
   username is a short alias resolved on-device before the call. The
   password remains the only secret — this email is already the beta's
   published contact address. (V0.3.2) */
export const ADMIN_USERNAMES = {
  jesse: "affinitymojo3@gmail.com",
};
