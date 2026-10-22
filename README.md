# HERE/THERE Moodboard

Private pin wall for collecting references: boards → subsections → photos and Pinterest / Instagram links.

## Setup (once)
1. **Supabase** — new project (region Singapore). SQL Editor → paste `supabase/setup.sql` → Run.
   Authentication → URL Configuration → set **Site URL** to your Vercel address.
2. **Vercel** — Add New → Project → import this repo → add environment variables:
   - `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (Supabase → Project Settings → API)
   - `INGEST_TOKEN` — any long random string (used by the iPhone Shortcut)
   - `OWNER_ID` — your user id (Supabase → Authentication → Users, after your first sign-in)
   → Deploy.
3. Open the site, sign in with your email, then in Supabase turn off **Allow new users to sign up**.

## iPhone share sheet
A Shortcut called "Moodboard" that accepts Images and URLs, base64-encodes the image, and POSTs
`{ "image": "<base64>", "link": "<url>" }` to `/api/ingest` with header `Authorization: Bearer <INGEST_TOKEN>`.
New pins land in the **Inbox** board.
