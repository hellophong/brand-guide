# extract-brand

The part that actually reads a brand guide PDF.

## What it does

1. Downloads the PDF from the private `brand-guides` bucket.
2. **Reads what the file already knows** — its text, the names of its embedded fonts, and every fill colour with the share of page area it covers. This is exact and costs nothing.
3. **Asks a model the rest** — which colours are primary, what each typeface is for, what the logo rules say — with a strict schema so every field comes back with a confidence score.
4. Writes `colors`, `typefaces` and `logo_rules`, and sets the brand to **review**. It never publishes anything. A person decides.

Anything the guide states in words — a Pantone name, a CMYK build — is passed through untouched and marked `stated`. Anything worked out from the page is marked `derived`.

## Deploy it

**With the Supabase CLI**

```bash
supabase functions deploy extract-brand --project-ref ghvgbdxdhxzjtesupstg
```

**Or from the dashboard** — Edge Functions → **Deploy a new function** → name it `extract-brand` → paste the contents of `index.ts`.

## Secrets it needs

Edge Functions → **Secrets**:

| Key | Value |
| --- | --- |
| `OPENAI_API_KEY` | your `sk-…` key |
| `SUPABASE_SECRET_KEY` | an `sb_secret_…` key from Settings → API Keys → Publishable and secret. Only ever here, never in the website. The legacy `SUPABASE_SERVICE_ROLE_KEY` still works if that is what you have |
| `OPENAI_MODEL` | *optional.* Defaults to `gpt-5.4-nano`. Set it to whatever your account actually offers |
| `MAX_PAGES` | *optional.* Defaults to 60 |

## Try it

```bash
curl -X POST \
  'https://ghvgbdxdhxzjtesupstg.supabase.co/functions/v1/extract-brand' \
  -H 'Authorization: Bearer YOUR_PUBLISHABLE_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"brand_id":"<a uuid from the brands table>","storage_key":"<file in brand-guides>"}'
```

A good response looks like:

```json
{ "ok": true, "pages": 88, "colors": 9, "typefaces": 4,
  "logo_rules": 6, "overall_confidence": 71,
  "stated_values_found": { "pantone": ["PANTONE 349 C"], "cmyk": ["82, 34, 82, 24"] },
  "ms": 14320 }
```

`overall_confidence` is the **lowest** score of any field, not the average. One bad value is what sends a wrong colour to a printer, so averaging it away would defeat the point.

## If it fails

| Message | Meaning |
| --- | --- |
| `OPENAI_API_KEY is not set` | Add it under Secrets |
| `OpenAI rejected the request (404)` | The model name doesn't exist for your account. Set `OPENAI_MODEL` |
| `Could not read brand-guides/…` | Wrong storage key, or the file isn't in that bucket |
| `No service key available` | Add `SUPABASE_SECRET_KEY` under Secrets |
| Times out | Very large PDF. Lower `MAX_PAGES` |
| `Bucket not found` | The `brand-guides` bucket does not exist yet. Create it under Storage, or pass a `bucket` field in the request |
| `Setting up fake worker failed` | An older build that imported pdf.js directly. Redeploy the current version, which uses unpdf |

## How the colour ranking works, and where it can be wrong

Colours are ranked by **the share of filled area they cover**, not by how often they appear. A colour across a cover outranks one used once in a footnote, which counting occurrences would rate equally.

Text is counted separately from area. Body copy appears constantly but covers very little; letting it compete on area ranks the body colour above the brand colour.

Verified against a constructed guide with four known colours: the full-bleed primary came back at **79.3%** of filled area, body ink at 18%, an accent at 2.5%, and a colour used once at 0.2% — the correct order. Stated Pantone and CMYK values were recovered from the text.

**Where it will struggle:** a scanned or flattened guide has no text layer and no vector fills, so there is nothing to read. Those need the pages rendered to images and a vision model — not built. The function will return very few colours and low confidence, which is the correct signal that a human should take over.
