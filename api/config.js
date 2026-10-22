// Gives the browser the public Supabase settings, read from Vercel environment variables.
// The anon key is safe to expose: row-level security keeps every row private to its owner.
// Accept the URL however it was pasted (trailing slash, /rest/v1, dashboard link with the project ref).
export function cleanSupabaseUrl(raw) {
  let u = String(raw || "").trim().replace(/^["']|["']$/g, "");
  const dash = u.match(/supabase\.com\/dashboard\/project\/([a-z0-9]+)/i);
  if (dash) return `https://${dash[1]}.supabase.co`;
  const m = u.match(/^(https?:\/\/[^/]+)/i);
  return m ? m[1] : u.replace(/\/+$/, "");
}

// If SUPABASE_URL isn't a supabase.co address, work it out from the anon key: the key names its project.
export function supabaseUrlFor(rawUrl, anonKey) {
  const u = cleanSupabaseUrl(rawUrl);
  if (/^https:\/\/[a-z0-9]+\.supabase\.co$/i.test(u)) return u;
  try {
    const payload = JSON.parse(Buffer.from(String(anonKey || "").trim().split(".")[1], "base64url").toString("utf8"));
    if (payload && /^[a-z0-9]+$/i.test(payload.ref || "")) return `https://${payload.ref}.supabase.co`;
  } catch (e) {}
  return u;
}

export default function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({
    supabaseUrl: supabaseUrlFor(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY),
    supabaseAnonKey: String(process.env.SUPABASE_ANON_KEY || "").trim(),
  });
}
