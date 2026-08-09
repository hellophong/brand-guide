# Spectra — digital brand guide library

Upload a brand guide PDF. Get back a browsable library of the brand's colour palette, typography and logo rules — where every value copies to the clipboard on click.

**[ARCHITECTURE.md](ARCHITECTURE.md)** explains how the whole thing works, in plain language.
**[GO-LIVE.md](GO-LIVE.md)** is the step-by-step for turning this mockup into a real site with real logins and real uploads.

---

## Run it

```
open index.html
```

That's it. One file, no build step, no dependencies, no network calls.

## What's in the mockup

A three-column layout modelled on a chat client: a brand rail, the library list, and the brand's content on the right. Login sits top-right and gates everything that writes.

**Colour** — swatches grouped as primary, secondary and neutral. Click a swatch to copy its hex; click a single row to copy just that value. HEX, RGB, CMYK, HSL and Pantone for every colour, plus whole-palette export as CSS variables, SCSS, Tailwind config or W3C design tokens.

**Typography** — print and digital as separate specifications of the same voice. Point sizes and leading for one, pixels and line-height for the other, each with guidance on when to use it.

**Logo usage** — lockups on light and reversed grounds, clear space, minimum sizes for screen and print, and do/don't examples built from each brand's own palette.

**Assets** — everything extracted from the guide, plus the source PDF. Admins can add brand files here — logos, icons, packaging artwork — in SVG, EPS, AI, PDF, PNG, JPG and more. Artwork previews itself in the list, and uploaded files really do download.

**Admin portal** — signing in adds a portal to the sidebar with five tabs:

- **Upload** — drop one or more brand guide PDFs. Each becomes a background job, so you can leave the page while they run.
- **Processing** — live progress per job through the extraction pipeline.
- **Needs review** — what the extraction proposes, with a confidence score on every colour and a flag on anything below 75%. Approve and publish, keep as a draft, or discard.
- **Brands** — the whole library as a table. Publish and unpublish in place.
- **Activity** — the audit trail: who uploaded, approved, published or unpublished what, and when.

Nothing publishes until a human approves it, and brands still in review are hidden from signed-out visitors.

## Provenance

Every value is labelled with where it came from:

- 📄 **stated** — read off the page of the guide
- ⚙ **derived** — calculated by Spectra

Stated beats derived, always. A calculated CMYK build is a helpful guess, not a print specification, and it should never reach a printer unchecked.

## Typefaces

The specimens render in the real faces they name. Seven families ship inside `index.html` as latin-subset woff2, embedded as data URIs so the page still needs no network:

| Face | Used by |
| --- | --- |
| Fraunces | Verdant display |
| Public Sans | Verdant headings and body |
| Source Serif 4 | Helio display |
| Inter | Helio product and body, Kite body |
| Atkinson Hyperlegible | Northwind throughout — it was drawn for low-vision readers, which is the brief |
| Archivo Black | Kite display |
| IBM Plex Mono | Numerals and data |

All seven are licensed under the [SIL Open Font License 1.1](https://openfontlicense.org), which permits embedding. They stand in for the retail faces a real guide would specify — those are licensed per-seat and cannot be bundled. A production build serves the client's own licensed webfonts the same way, from its asset bucket.

## What's real and what's simulated

Real: clipboard copy in every format, live WCAG contrast ratios, hex conversion, palette export, search across brand names / colour names / hex values / typefaces, the admin gate, and light and dark themes.

Simulated: the extraction. Dropping a PDF derives a palette from the file's actual bytes, so different files produce different brands — but it's a hash, not a parser. The pipeline animation shows the real stages in the real order. Downloads are inert and login accepts any credentials.

The four brands included are fictional, used to show the interface with realistic content.

## Where to take it next

The build order that keeps each step useful on its own is at the end of [ARCHITECTURE.md](ARCHITECTURE.md). Short version: ship the page with a couple of brands typed in by hand before automating anything. A library nobody browses doesn't get better by filling itself faster.
