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

export default function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({
    supabaseUrl: cleanSupabaseUrl(process.env.SUPABASE_URL),
    supabaseAnonKey: String(process.env.SUPABASE_ANON_KEY || "").trim(),
  });
}
