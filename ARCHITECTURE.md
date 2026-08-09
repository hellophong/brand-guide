# Spectra — how the brand library works

A plain-language guide to the architecture behind `index.html`.

---

## The metaphor: a returns desk at a warehouse

Everything in this system is one idea repeated. **A box arrives. Someone opens it, sorts what's inside onto labelled shelves, and only then does it go out on the shop floor.**

| Warehouse | Spectra |
| --- | --- |
| A box arrives at the loading bay | An admin drops a brand guide PDF |
| The bay is behind a locked door | Only signed-in admins can upload |
| The box sits in the back room | Private file storage — not on the public web |
| A docket is written for the box | A job record: *this file, this brand, status = processing* |
| Someone opens it and lays out the contents | A worker splits the PDF into pages, text, fonts and vector art |
| Contents go onto labelled shelves | Colours, typography and logo rules become structured records |
| A supervisor checks the shelves | A human reviews the extraction and approves it |
| It goes out on the shop floor | Published — anyone with the link can browse and copy |

The one rule that matters: **nothing reaches the shop floor without a person signing for it.** A machine reading a PDF is a very good guess, not a fact. In the mockup, every value carries its provenance — 📄 means *stated in the guide*, ⚙ means *Spectra calculated this*. A calculated CMYK build should never go to a printer unchecked.

---

## The five rooms

### 1. The shop floor — what people see
A static single-page app. Three columns: a brand rail, the library list, and the brand's content. Colour values copy on click, because that is the single thing people open a brand guide to do.

It is a **read-mostly** surface. Most visitors never write anything, which is why it can be a plain static page served from a CDN and stay fast and cheap.

### 2. The locked door — who may add brands
Login lives top-right. Two roles only:

- **Guest** — browse and copy published brands. No account needed.
- **Admin** — upload, review, approve, edit, unpublish.

Brands still in review are invisible to guests entirely, not merely unlabelled. Enforce this **on the server**, not just in the interface — a hidden sidebar row is a design decision, not a security control.

### 3. The back room — where files live
The PDF goes to object storage the moment it is uploaded, under a key nobody can guess. Downloads are handed out as **signed links that expire** — a link shared outside your team stops working rather than living forever.

Keep the original PDF permanently. It is the evidence behind every extracted value, and reviewers need to check the page it came from.

### 4. The sorting table — extraction
This is the only genuinely hard part, and it runs as a **background job**, not while the admin waits. A 90-page guide takes minutes, and a browser tab should never be the thing holding that open.

The pipeline in stages, cheapest and most reliable first:

1. **Split the PDF into pages.** One page, one unit of work.
2. **Read what the file already knows.** A PDF is not a picture — it carries a text layer, an embedded font table, and vector fills with exact colour values. Pull these first. They are *facts*, not guesses, and this step alone gets you most of the palette and every typeface name.
3. **Render each page to an image** for the pages where step 2 came back thin (scanned or flattened guides).
4. **Cluster the colours.** Group the fills that appear most, at the largest area, on the most pages. That ordering is usually the primary/secondary/neutral hierarchy the guide intends.
5. **Ask a model to read the messy result.** This is where Claude earns its place — not "find the colours" (the file told you that) but "read these 90 pages and tell me *which* colours are primary, what each typeface is *for*, and what the logo rules *say*." Ask for structured output with **one confidence score per field**.
6. **Score and store.** Anything below your threshold gets flagged for the reviewer rather than published quietly.

**Stated beats derived, always.** If the guide prints `C88 M38 Y82 K32`, store that. Only calculate CMYK when the guide doesn't state it — and label it as calculated, forever.

### 5. The shelves — the data model
Five tables is enough to start:

```
brands        id · name · slug · status(processing|review|published) · owner
documents     id · brand_id · storage_key · pages · uploaded_by · uploaded_at
colors        id · brand_id · name · group · hex · cmyk · pantone
              · source(stated|derived) · confidence · found_on_page
typefaces     id · brand_id · family · role · medium(print|digital)
              · specs(json) · usage · confidence
logo_rules    id · brand_id · kind(do|dont|clearspace|min_size) · text · asset_key
```

Two columns do the heavy lifting everywhere: **`source`** (did we read this or calculate it?) and **`confidence`** (how sure are we?). Carry them through to the interface, as the mockup does.

---

## Third-party services — the free-tier build

The point of the early stage is to prove the extraction is good enough. Everything below has a free tier that comfortably covers a pilot; none of it locks you in.

| Job | Service | Free tier | Why |
| --- | --- | --- | --- |
| Database + file storage + login | **Supabase** | 500 MB database, 1 GB files, 50k monthly users | One service covers three rooms. Postgres row-level security enforces the guest/admin split in the database itself, where it belongs |
| Hosting the page | **Cloudflare Pages** or **Vercel** | Unlimited static requests / 100 GB bandwidth | The shop floor is a static file. Serve it from a CDN |
| Background extraction | **Cloudflare Workers** or **Supabase Edge Functions** | 100k requests/day | The sorting table. Runs after the upload returns |
| Reading the PDF | **`pdf.js`** (Mozilla) or **`pdfplumber`** (Python) | Open source | Pulls the text layer, font table and vector fills. This is step 2, and it is free forever |
| Understanding the guide | **Claude API** | Pay per use — pennies per guide | Step 5. Not free, but a 90-page guide costs less than a coffee |
| Colour conversion | **`culori`** or **`chroma.js`** | Open source | Hex ↔ RGB ↔ CMYK ↔ HSL, plus WCAG contrast |
| Pantone matching | *(deliberately deferred)* | — | Pantone libraries are licensed. Store the name the guide states; do not try to compute a match |

Total cost of a pilot: **the Claude API calls, and nothing else.**

### One thing to be careful about
Print colour is a licensing minefield. Pantone values are proprietary, and CMYK is meaningless without knowing the paper stock and profile. The safe posture — the one the mockup takes — is to **store what the guide says and calculate nothing you can avoid**. Label the rest as derived so nobody mistakes a conversion for a specification.

---

## Connectors available through Claude Code

Claude Code can talk to outside services through MCP connectors, which matters twice: for **building** this, and for **feeding** it.

**Connected in this workspace right now**

- **Figma** — read designs and design systems, push generated screens back into Figma, pull variable definitions. The most direct fit: extract a palette here, and write it into a Figma variable collection so designers get it where they actually work.
- **Google Drive** *(installed, currently off in this chat)* — search and read files. The obvious ingestion path, since brand guides usually already live in a shared Drive folder. Point Spectra at the folder instead of asking people to re-upload.

**Available to connect from the directory, relevant to this build**

- **Supabase** — create the project, run migrations, inspect tables without leaving Claude Code. Directly builds room 3 and room 5.
- **Cloudflare Developer Platform** — Workers, KV and R2 storage. Builds room 4 and hosts room 1.
- **PlanetScale** — Postgres/MySQL if you would rather keep the database separate from storage and auth.
- **Adobe for creativity** — has brand and colour-theme tools, plus asset upload. Worth a look if your brand guides are Adobe-native, though it is a paid ecosystem rather than a free-tier fit.
- **Canva** — search, autofill and export designs. Useful downstream: push an approved palette into templates non-designers use.

**Deliberately not used**

- **PDF Viewer** (the directory's demo connector) only renders PDFs from allow-listed public URLs like arxiv.org. It cannot read your private uploads. Parse PDFs in your own worker with `pdf.js` instead.

To connect any of these, add them in claude.ai settings under Connectors. Claude Code cannot install them for you — it can only use what your account has authorised.

---

## Build it in this order

Each step is useful on its own, which means you can stop at any point and still have something people use.

1. **The shop floor, hand-fed.** Ship the page with two or three brands typed in by hand. You will learn more from one designer using it for a week than from any amount of planning.
2. **The locked door.** Add login and the guest/admin split.
3. **The back room.** Real uploads to real storage, extraction still done by hand. The library is now genuinely useful and you have collected real PDFs to test against.
4. **The sorting table.** Automate extraction, starting with step 2 of the pipeline — the text layer and font table alone. This is the cheapest, most accurate half of the problem.
5. **The supervisor.** Add the model pass and the confidence scores, keeping the human approval gate exactly where it is.
6. **The loading dock.** Push out to Figma variables and design tokens, so the library feeds the tools people already use.

Do not start at step 4. The extraction is the interesting problem and the wrong place to begin — a library nobody browses does not get better by filling itself faster.

---

## What the mockup does and does not do

`index.html` runs standalone in a browser. No build step, no dependencies, no network calls.

**Real in the mockup:** clipboard copy in every format; WCAG contrast ratios calculated live; hex → RGB/CMYK/HSL conversion; palette export as CSS variables, SCSS, Tailwind config and W3C design tokens; search across brand names, colour names, hex values and typefaces; the admin gate, including review-status brands being genuinely hidden from guests; light and dark themes; and the type specimens, which render in the real embedded faces they name rather than a fallback.

Asset uploads are real too, up to a point: files you add on the Assets tab are held as object URLs, so previews render and downloads work — but they live in the tab and are gone on reload. A real build PUTs them to object storage.

**Simulated:** the extraction. Dropping a PDF derives a palette from the file's actual bytes, so different files produce different brands — but it is a hash, not a parser. The pipeline animation shows the real stages in the real order with plausible timings. Downloads are inert. Login accepts any credentials.

**Not there yet:** version history when a brand guide is reissued, multi-tenant separation if you host this for several clients, and an audit trail of who approved what.
