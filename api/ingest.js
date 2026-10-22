// Receives pins from the iPhone "Share → Moodboard" Shortcut.
// POST JSON { image?: base64 (jpeg/png), link?: string, caption?: string }
// Header:  Authorization: Bearer <INGEST_TOKEN>
// New pins land in the "Inbox" board, ready to be moved into a subsection.

import { cleanSupabaseUrl } from "./config.js";

const MAX_BYTES = 4 * 1024 * 1024;

function env(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable ${name}`);
  return v;
}

async function sb(path, init = {}) {
  const url = cleanSupabaseUrl(env("SUPABASE_URL")) + path;
  const key = env("SUPABASE_SERVICE_ROLE_KEY").trim();
  const r = await fetch(url, {
    ...init,
    headers: { apikey: key, Authorization: `Bearer ${key}`, ...(init.headers || {}) },
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

async function inboxId(owner) {
  const found = await sb(
    `/rest/v1/sections?select=id&owner=eq.${owner}&title=eq.Inbox&parent_id=is.null&limit=1`
  );
  if (found && found.length) return found[0].id;
  const made = await sb(`/rest/v1/sections`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({ owner, title: "Inbox", parent_id: null, sort: -1 }),
  });
  return made[0].id;
}

function firstUrl(s) {
  const m = String(s || "").match(/https?:\/\/[^\s<>"']+/i);
  return m ? m[0] : "";
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });
  const auth = req.headers.authorization || "";
  if (!process.env.INGEST_TOKEN || auth !== `Bearer ${process.env.INGEST_TOKEN}`) {
    return res.status(401).json({ error: "Wrong or missing token" });
  }
  try {
    const owner = env("OWNER_ID");
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const link = firstUrl(body.link);
    const caption = String(body.caption || "").slice(0, 500);
    let image_path = null;

    if (body.image) {
      const b64 = String(body.image).replace(/^data:[^,]+,/, "").replace(/\s+/g, "");
      const buf = Buffer.from(b64, "base64");
      if (!buf.length) return res.status(400).json({ error: "Image was empty" });
      if (buf.length > MAX_BYTES) return res.status(413).json({ error: "Image is over 4 MB. Resize it in the Shortcut first." });
      const isPng = buf[0] === 0x89 && buf[1] === 0x50;
      const ext = isPng ? "png" : "jpg";
      image_path = `${owner}/${crypto.randomUUID()}.${ext}`;
      await sb(`/storage/v1/object/pins/${image_path}`, {
        method: "POST",
        headers: { "Content-Type": isPng ? "image/png" : "image/jpeg", "x-upsert": "false" },
        body: buf,
      });
    }
    if (!image_path && !link) return res.status(400).json({ error: "Send an image or a link" });

    const section_id = await inboxId(owner);
    await sb(`/rest/v1/pins`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ owner, section_id, image_path, link, caption, size: 1 }),
    });
    return res.status(200).json({ ok: true, message: "Added to your Moodboard inbox" });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

