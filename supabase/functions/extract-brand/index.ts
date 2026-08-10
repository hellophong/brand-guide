/* ============================================================================
   Spectra — extract-brand
   The stockroom assistant. Opens a brand guide PDF, reads what the file
   already knows, asks a model about the rest, and writes the result to the
   tables. Runs as a Supabase Edge Function.

   Call it with:
     POST { "brand_id": "<uuid>", "storage_key": "<path in brand-guides>" }

   Two stages, in this order on purpose:
     1. READ  — text, embedded font names, and every fill colour with the area
               it covers. Exact, free, and needs no model.
     2. ASK   — hand that summary to a model and ask the questions the file
               cannot answer: which colours are primary, what each typeface is
               for, what the logo rules say.

   Anything the guide states in words — a Pantone name, a CMYK build — is
   printed truth and is passed through untouched. Anything we work out
   ourselves is marked 'derived' so nobody sends a guess to a printer.
   ========================================================================== */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/* unpdf is pdf.js packaged for serverless runtimes. Importing pdf.js directly
   fails here: it wants a background worker, Deno has none, and its fallback
   tries to import a worker module that isn't published at that path
   ("Setting up fake worker failed"). unpdf ships a build without that step. */
import { getDocumentProxy, getResolvedPDFJS } from "https://esm.sh/unpdf";

const MODEL = Deno.env.get("OPENAI_MODEL") ?? "gpt-5.4-nano";
const MAX_PAGES = Number(Deno.env.get("MAX_PAGES") ?? 60);
const MAX_TEXT = 120_000;         // characters of page text sent to the model

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

/* ---------------------------------------------------------------- helpers */
const toHex = (r: number, g: number, b: number) =>
  "#" + [r, g, b].map(v => Math.round(Math.max(0, Math.min(1, v)) * 255)
    .toString(16).padStart(2, "0")).join("").toUpperCase();

const near = (a: string, b: string, tol = 6) => {
  const p = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return Math.abs(x[0]-y[0]) <= tol && Math.abs(x[1]-y[1]) <= tol && Math.abs(x[2]-y[2]) <= tol;
};

/* ------------------------------------------------------- stage 1: reading */
async function readPdf(data: Uint8Array) {
  const pdf: any = await getDocumentProxy(data);
  const { OPS } = await getResolvedPDFJS();   // the operator constants we match on

  const pageCount = pdf.numPages;
  const pages = Math.min(pageCount, MAX_PAGES);
  const colours = new Map<string, { area: number; glyphs: number; pages: Set<number>; uses: number }>();
  const fonts = new Map<string, number>();
  const textParts: string[] = [];

  for (let n = 1; n <= pages; n++) {
    const page = await pdf.getPage(n);

    const content = await page.getTextContent();
    let pageText = "";
    for (const item of content.items as any[]) {
      if (!item.str) continue;
      pageText += item.str + (item.hasEOL ? "\n" : " ");
      const style = (content as any).styles?.[item.fontName];
      const family = style?.fontFamily || item.fontName;
      if (family) fonts.set(family, (fonts.get(family) ?? 0) + item.str.length);
    }
    textParts.push(`--- page ${n} ---\n` + pageText.replace(/[ \t]+/g, " ").trim());

    /* Fills weighted by area. A colour across a cover matters more than one
       used once in a footnote; counting occurrences would rank them equally. */
    const ops = await page.getOperatorList();
    let fill: string | null = null;
    let pending = 0;
    let ctm = [1, 0, 0, 1, 0, 0];
    const stack: number[][] = [];
    const scaleOf = (m: number[]) => Math.abs(m[0] * m[3] - m[1] * m[2]) || 1;
    const mul = (a: number[], b: number[]) => [
      a[0]*b[0] + a[2]*b[1], a[1]*b[0] + a[3]*b[1],
      a[0]*b[2] + a[2]*b[3], a[1]*b[2] + a[3]*b[3],
      a[0]*b[4] + a[2]*b[5] + a[4], a[1]*b[4] + a[3]*b[5] + a[5]
    ];
    const touch = (hex: string, key: "area" | "glyphs", amount: number) => {
      const rec = colours.get(hex) ?? { area: 0, glyphs: 0, pages: new Set<number>(), uses: 0 };
      rec[key] += amount; rec.pages.add(n); rec.uses += 1;
      colours.set(hex, rec);
    };

    for (let i = 0; i < ops.fnArray.length; i++) {
      const fn = ops.fnArray[i], args = ops.argsArray[i] as any;
      if (fn === OPS.save) stack.push(ctm.slice());
      else if (fn === OPS.restore) ctm = stack.pop() ?? [1, 0, 0, 1, 0, 0];
      else if (fn === OPS.transform) ctm = mul(ctm, Array.from(args));
      else if (fn === OPS.setFillRGBColor) fill = toHex(args[0]/255, args[1]/255, args[2]/255);
      else if (fn === OPS.setFillGray) fill = toHex(args[0], args[0], args[0]);
      else if (fn === OPS.setFillCMYKColor) {
        const [c, m, y, k] = args;
        fill = toHex((1-c)*(1-k), (1-m)*(1-k), (1-y)*(1-k));
      }
      else if (fn === OPS.constructPath) {
        const bbox = args[2];                     // pdf.js gives us the bounds
        if (bbox?.length >= 4) {
          pending += Math.abs(bbox[2]-bbox[0]) * Math.abs(bbox[3]-bbox[1]) * scaleOf(ctm);
        }
      }
      else if (fn === OPS.fill || fn === OPS.eoFill) {
        if (fill && pending > 0) touch(fill, "area", pending);
        pending = 0;
      }
      else if (fn === OPS.showText || fn === OPS.showSpacedText) {
        /* counted apart from area: body copy is everywhere but covers little */
        if (fill) touch(fill, "glyphs", Array.isArray(args[0]) ? args[0].length : 1);
      }
    }
    page.cleanup();
  }

  const merged: any[] = [];
  for (const [hex, rec] of [...colours.entries()].sort((a, b) => b[1].area - a[1].area)) {
    const hit = merged.find(m => near(m.hex, hex));
    if (hit) {
      hit.area += rec.area; hit.glyphs += rec.glyphs; hit.uses += rec.uses;
      rec.pages.forEach(p => hit.pages.add(p));
    } else {
      merged.push({ hex, area: rec.area, glyphs: rec.glyphs, pages: new Set(rec.pages), uses: rec.uses });
    }
  }
  const totalArea = merged.reduce((n, c) => n + c.area, 0) || 1;

  return {
    pageCount,
    pagesRead: pages,
    palette: merged.sort((a, b) => b.area - a.area).slice(0, 12).map(c => ({
      hex: c.hex,
      area_share: +(c.area / totalArea * 100).toFixed(1),
      glyphs: c.glyphs,
      pages: [...c.pages].sort((a: number, b: number) => a - b)
    })),
    typefaces: [...fonts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)
      .map(([family, glyphs]) => ({ family: family.replace(/^[A-Z]{6}\+/, ""), glyphs })),
    text: textParts.join("\n\n").slice(0, MAX_TEXT)
  };
}

/* Values the guide states in words are printed truth. Find them before the
   model sees anything, so they can never be paraphrased into something else. */
function findStatedValues(text: string) {
  const hex = [...text.matchAll(/#([0-9A-Fa-f]{6})\b/g)].map(m => "#" + m[1].toUpperCase());
  const pantone = [...text.matchAll(/PANTONE\s+([0-9]{3,4}\s?C(?:VC|VU)?|Black\s?\d?\s?C|[0-9]{3,4}\s?U)/gi)]
    .map(m => m[0].replace(/\s+/g, " ").trim());
  const cmyk = [...text.matchAll(/\bC\s?(\d{1,3})\s*[,/ ]\s*M\s?(\d{1,3})\s*[,/ ]\s*Y\s?(\d{1,3})\s*[,/ ]\s*K\s?(\d{1,3})/gi)]
    .map(m => `${m[1]}, ${m[2]}, ${m[3]}, ${m[4]}`);
  return {
    hex: [...new Set(hex)],
    pantone: [...new Set(pantone)],
    cmyk: [...new Set(cmyk)]
  };
}

/* ---------------------------------------------------------- stage 2: ask */
/* Strict structured output has a rule that is easy to miss: every key in
   `properties` must also appear in `required`. Optional fields are expressed
   as nullable types instead, never by leaving them out of `required` —
   doing that gets the whole request rejected with a 400. */
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["brand_name", "tagline", "colors", "typefaces", "logo_rules"],
  properties: {
    brand_name: { type: "string" },
    tagline: { type: ["string", "null"] },
    colors: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "hex", "group", "cmyk", "pantone", "note", "source", "confidence", "found_on_page"],
        properties: {
          name: { type: "string" },
          hex: { type: "string", description: "#RRGGBB" },
          group: { type: "string", enum: ["Primary", "Secondary", "Neutral", "Functional"] },
          cmyk: { type: ["string", "null"], description: "only if the guide states it, else null" },
          pantone: { type: ["string", "null"], description: "only if the guide states it, else null" },
          note: { type: ["string", "null"] },
          source: { type: "string", enum: ["stated", "derived"] },
          confidence: { type: "integer" },
          found_on_page: { type: ["integer", "null"] }
        }
      }
    },
    typefaces: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["family", "role", "medium", "specs", "usage", "confidence"],
        properties: {
          family: { type: "string" },
          role: { type: "string" },
          medium: { type: "string", enum: ["print", "digital"] },
          specs: { type: ["string", "null"], description: "size / leading / tracking as stated" },
          usage: { type: ["string", "null"] },
          confidence: { type: "integer" }
        }
      }
    },
    logo_rules: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "text", "confidence"],
        properties: {
          kind: { type: "string", enum: ["do", "dont", "clearspace", "min_size"] },
          text: { type: "string" },
          confidence: { type: "integer" }
        }
      }
    }
  }
} as const;

const PROMPT = `You are reading a brand guide that has already been parsed for you.

You are given:
- PALETTE: every fill colour found in the file, with the share of total filled
  area it covers and which pages it appears on. These hex values are exact.
- TYPEFACES: the font names embedded in the file, with how many characters are
  set in each. These names are exact.
- STATED VALUES: Pantone names and CMYK builds written in the document's own
  text. These are printed truth.
- TEXT: the document's text, page by page.

Your job is only what the file cannot answer for itself:
- Which colours are Primary, Secondary, Neutral or Functional. Area share and
  page spread are strong evidence: a colour covering most of the cover is
  primary; one appearing once at 0.2% is probably incidental and should be left
  out entirely.
- Give each colour the name the guide calls it. If the guide does not name it,
  describe it plainly ("Warm Grey"). Never invent a Pantone or CMYK value: copy
  one only if it appears in STATED VALUES and clearly belongs to that colour,
  otherwise leave those fields empty.
- Set source to "stated" only when the guide itself prints that value. Anything
  you infer is "derived".
- What each typeface is for, and whether the specification is for print or
  digital. Ignore fonts used for a handful of characters.
- The logo rules the guide states: minimum sizes, clear space, dos and donts.

Set confidence honestly per field. Low confidence is useful; a confident guess
is not. Omit anything the document does not support rather than padding the
answer.`;

async function askModel(facts: unknown) {
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) throw new Error("OPENAI_API_KEY is not set on this function. Add it under Edge Functions -> Secrets.");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: PROMPT },
        { role: "user", content: JSON.stringify(facts) }
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "brand_extraction", strict: true, schema: SCHEMA }
      }
    })
  });

  if (!res.ok) {
    const detail = await res.text();
    let msg = detail;
    try { msg = JSON.parse(detail)?.error?.message ?? detail; } catch { /* keep raw */ }
    throw new Error(
      `OpenAI rejected the request (${res.status}) using model "${MODEL}": ${String(msg).slice(0, 600)}` +
      (res.status === 404 ? " — set OPENAI_MODEL to a model your account can use." : "")
    );
  }
  const body = await res.json();
  return JSON.parse(body.choices[0].message.content);
}

/* ------------------------------------------------------------------ main */
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const started = Date.now();
  try {
    const { brand_id, storage_key, bucket = "brand-guides" } = await req.json();
    if (!brand_id || !storage_key) return json({ error: "brand_id and storage_key are required" }, 400);

    const url = Deno.env.get("SUPABASE_URL")!;
    /* Supabase is replacing service_role with secret keys, so prefer the new
       one and fall back to the legacy name while it still exists. */
    const serviceKey = Deno.env.get("SUPABASE_SECRET_KEY")
      ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!serviceKey) throw new Error("No service key available. Add SUPABASE_SECRET_KEY (an sb_secret_… key) under Edge Functions -> Secrets.");
    const db = createClient(url, serviceKey);

    /* 0 — check the target before doing anything expensive. Reading a large
           PDF and calling a model, only to fail on the very last write, wastes
           a minute and real money. */
    const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID.test(String(brand_id))) {
      return json({
        ok: false,
        error: `brand_id must be the uuid of a row in the brands table, but got "${brand_id}".` +
          (/\.pdf$/i.test(String(brand_id))
            ? " That looks like a filename — it belongs in storage_key, not brand_id."
            : " Run: select id, name from public.brands;")
      }, 400);
    }
    const { data: brandRow } = await db.from("brands").select("id").eq("id", brand_id).maybeSingle();
    if (!brandRow) {
      return json({ ok: false, error: `No brand with id ${brand_id}. Create one first, or check the id.` }, 400);
    }

    /* 1 — fetch the PDF out of the private bucket */
    const dl = await db.storage.from(bucket).download(storage_key);
    if (dl.error) throw new Error(`Could not read ${bucket}/${storage_key}: ${dl.error.message}`);
    const bytes = new Uint8Array(await dl.data.arrayBuffer());

    /* 2 — read what the file already knows */
    const facts = await readPdf(bytes);
    const stated = findStatedValues(facts.text);

    /* 3 — ask the model the rest */
    const proposal = await askModel({
      palette: facts.palette,
      typefaces: facts.typefaces,
      stated_values: stated,
      page_count: facts.pageCount,
      text: facts.text
    });

    /* 4 — write it down. Replace any previous attempt for this brand so a
           re-run is safe rather than additive. */
    await db.from("colors").delete().eq("brand_id", brand_id);
    await db.from("typefaces").delete().eq("brand_id", brand_id);
    await db.from("logo_rules").delete().eq("brand_id", brand_id);

    const colors = (proposal.colors ?? []).map((c: any, i: number) => ({
      brand_id, name: c.name, group_name: c.group, hex: c.hex,
      cmyk: c.cmyk || null, pantone: c.pantone || null,
      source: c.source === "stated" ? "stated" : "derived",
      confidence: c.confidence, found_on_page: c.found_on_page ?? null, sort_order: i
    }));
    const typefaces = (proposal.typefaces ?? []).map((t: any, i: number) => ({
      brand_id, family: t.family, role: t.role, medium: t.medium,
      specs: t.specs ? { stated: t.specs } : {}, usage: t.usage ?? null,
      confidence: t.confidence, sort_order: i
    }));
    const rules = (proposal.logo_rules ?? []).map((r: any, i: number) => ({
      brand_id, kind: r.kind, text: r.text, confidence: r.confidence, sort_order: i
    }));

    for (const [table, rows] of [["colors", colors], ["typefaces", typefaces], ["logo_rules", rules]] as const) {
      if (!rows.length) continue;
      const { error } = await db.from(table).insert(rows);
      if (error) throw new Error(`Writing ${table} failed: ${error.message}`);
    }

    /* overall confidence is the weakest link, not the average — one bad field
       is what sends a wrong colour to a printer */
    const all = [...colors, ...typefaces, ...rules].map((r: any) => r.confidence ?? 0);
    const overall = all.length ? Math.min(...all) : 0;

    await db.from("brands").update({
      name: proposal.brand_name || undefined,
      tagline: proposal.tagline || null,
      confidence: overall,
      status: "review"          // never publishes itself; a person decides
    }).eq("id", brand_id);

    await db.from("documents").update({ pages: facts.pageCount })
      .eq("brand_id", brand_id).eq("storage_key", storage_key);

    return json({
      ok: true,
      brand_id,
      pages: facts.pageCount,
      pages_read: facts.pagesRead,
      colors: colors.length,
      typefaces: typefaces.length,
      logo_rules: rules.length,
      overall_confidence: overall,
      stated_values_found: stated,
      ms: Date.now() - started
    });

  } catch (err) {
    console.error(err);
    return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
