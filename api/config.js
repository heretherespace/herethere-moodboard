// Gives the browser the public Supabase settings, read from Vercel environment variables.
// The anon key is safe to expose: row-level security keeps every row private to its owner.
export default function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({
    supabaseUrl: process.env.SUPABASE_URL || "",
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || "",
  });
}
