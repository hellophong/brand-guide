// ============================================================================
// Spectra — connection settings
//
// Put your two Supabase values here. Both are safe to have in a public repo:
// the publishable key is *designed* to be visible in a website, and the
// row-level security rules from the migration decide what it is allowed to do.
//
// NEVER put the secret key (sb_secret_… , formerly service_role) in this file.
// That one ignores every security rule. It belongs only in server settings.
//
// ---------------------------------------------------------------------------
// WHERE TO FIND THESE — Supabase dashboard, your "spectra" project:
//
//   SUPABASE_URL   Settings -> API  ->  "Project URL"
//                  Looks like: https://abcdefghijklmnop.supabase.co
//                  Shortcut: it is in your browser's address bar while you are
//                  in the project. supabase.com/dashboard/project/THIS-BIT
//                  -> your URL is https://THIS-BIT.supabase.co
//
//   SUPABASE_KEY   Settings -> API Keys -> "Publishable and secret API keys"
//                  Copy the Publishable key. Starts with sb_publishable_
//                  (Older dashboards: "Legacy API Keys" tab -> the anon key.)
//
// ---------------------------------------------------------------------------
// HOW TO EDIT THIS WITHOUT ANY TOOLS:
//   1. Open this file on GitHub
//   2. Click the pencil icon (Edit this file)
//   3. Replace the two values below
//   4. Click "Commit changes"
//   Cloudflare redeploys on its own within a minute or two.
//
// NOTE: filling this in does not switch anything on by itself yet — the code
// that reads it is the next thing to be built. This is where the values live.
// ============================================================================

window.SPECTRA_CONFIG = {
  SUPABASE_URL: "https://ghvgbdxdhxzjtesupstg.supabase.co/rest/v1/",
  SUPABASE_KEY: "sb_publishable_69w4H3KinnVeBT9sQkXR_g_qsz2v_0Y",

  // Buckets created in Step 6. Change only if you named them differently.
  GUIDES_BUCKET: "brand-guides",
  ASSETS_BUCKET: "brand-assets"
};
