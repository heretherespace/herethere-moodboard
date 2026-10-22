# HERE/THERE Moodboard — notes for Claude

Owner: Jie (architect, HERE/THERE). Non-developer: explain changes in plain language, keep replies short.

## What this is
A private pin wall: main sections (boards, e.g. "HERE Senbonkita") → subsections (Artwork, Carpet…) → pins.
A pin = an uploaded photo and/or a link (Pinterest / Instagram / any URL) + caption + size (1/2/3 columns).

## Stack (no build step)
- `index.html`, `styles.css`, `app.js` — static, served by Vercel. `app.js` is an ES module loading supabase-js 2.45.4 from jsDelivr.
- `api/config.js` — returns SUPABASE_URL + SUPABASE_ANON_KEY to the browser.
- `api/ingest.js` — POST endpoint for the iPhone "Share → Moodboard" Shortcut (Bearer INGEST_TOKEN). Uses the service role key; drops pins into a main section called "Inbox".
- `supabase/setup.sql` — tables `sections` (title, parent_id, sort) and `pins` (section_id, image_path, link, caption, size), owner-only RLS, private storage bucket `pins` with `<user id>/<uuid>.<ext>` paths. Photos are shown via signed URLs.

## Vercel environment variables
SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, INGEST_TOKEN, OWNER_ID

## Design
Big Shoulders Display (headers, uppercase), Figtree (body), JetBrains Mono (labels). Ink #141716 / ground #e6e8e7 / indigo accent #253a8c (dark mode tokens in styles.css). Masonry via CSS grid with JS row spans (`layout()` in app.js).

## Known limits
Pinterest/Instagram block automated image fetching; images come from the user's own paste/upload or the Shortcut.
