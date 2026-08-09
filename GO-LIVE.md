# Taking Spectra live

How to turn the mockup into a real website where people log in and upload brand guide PDFs.

Written for someone who is not a developer. You will not have to write code — but you will have to click through a few sign-up forms, copy some keys, and tell Claude Code what to build.

**Time:** a focused afternoon for a working private site. **Cost to start:** $0, plus a few dollars of API usage for reading the PDFs.

---

## First, the shop

Spectra is a shop with a stockroom out back.

The **shop floor** is what visitors see: shelves of brands, colours they can pick up and copy. It's calm, well lit, and anyone can walk in.

The **stockroom** is where the work happens. Boxes arrive (brand guide PDFs), someone opens them, sorts the contents onto labelled shelves, and only then are they carried out front.

Right now you have a very convincing film set. The shelves look real, the shop floor works perfectly — but the stockroom door opens onto a painted wall. Everything resets when you close the tab.

Making it real means hiring five things:

| The shop | What it really is | Metaphor |
| --- | --- | --- |
| The building | **Cloudflare Pages** | You rent a storefront on a busy street. People can walk in from anywhere. |
| The front door | **Supabase Auth** | A membership desk. Some people get a key, most just browse. |
| The stockroom | **Supabase Storage** | A locked room out back. Only staff go in; customers get things handed to them. |
| The ledger | **Supabase Database** | The index cards recording what's on every shelf and who put it there. |
| The stockroom assistant | **Supabase Edge Function** | The person who actually opens the boxes, working out back where nobody watches. |
| The expert you phone | **OpenAI or Claude API** | When a box is confusing, the assistant calls someone who reads it properly. Either will do. |

Three of those five are **the same company**. Supabase is the whole back office in one sign-up — door, stockroom, ledger and assistant. That's why it's the recommendation: one account instead of four.

---

## What the services cost

Everything here has a free tier that genuinely covers a pilot.

| Service | Job | Free tier | Next step up |
| --- | --- | --- | --- |
| **Cloudflare Pages** | Hosts the shop floor | Unlimited bandwidth, 500 builds/month, 100k function requests/day, 5 custom domains | $5/mo (Workers Paid) if you outgrow requests |
| **Supabase** | Door, stockroom, ledger, assistant | 500 MB database, 1 GB files, 50,000 monthly users, 2 projects | **Pro, $25/mo** |
| **OpenAI or Claude API** | Reads the PDFs | Pay per use — no free tier, but pennies per guide | Same, scales with use |
| **GitHub** | Keeps the master copy | Free for private repos | Free |
| **Resend** *(optional)* | Sends login emails | 3,000 emails/month, 100/day | $20/mo |
| **Sentry** *(optional)* | Tells you when something breaks | 5,000 errors/month | $26/mo |

**Realistic first-year cost: $0/month until you outgrow the free tiers, then about $25/month.** The one thing that isn't free is Claude reading the PDFs — see the last section, but it's small.

### ⚠️ The one free-tier trap to know about

**A free Supabase project pauses itself after 7 days with no activity.** Your site goes down until you log in and un-pause it by hand. That's fine while you're building. The day you show it to a real client, either upgrade to Pro ($25/mo) or make sure someone uses it weekly. This catches people out constantly.

---

## Connectors: letting Claude Code do the work

Claude Code can talk to these services directly through **connectors** — you authorise them once, then ask for what you want in plain English instead of clicking through dashboards.

**To add one:** go to [claude.ai](https://claude.ai) → **Settings** → **Connectors** → find it → **Connect**. You'll be asked to log into that service and approve access. Claude Code cannot install these for you — it can only use what you've authorised.

Connectors available for this build, none currently installed:

| Connector | Why you'd add it | What to ask for once connected |
| --- | --- | --- |
| **Supabase** | The big one. Creates the project, builds the tables, sets the security rules | "Create the brands, colors, typefaces and documents tables, and lock them so only admins can write" |
| **Cloudflare Developer Platform** | Hosting and the background worker | "Deploy this site to Pages and show me the URL" |
| **Sentry** | Error tracking | "Show me what broke this week" |
| **Resend** | Login and notification emails | "Set up the sender domain" |
| **Vercel** / **Netlify** | Alternatives to Cloudflare for hosting | "Deploy this and give me a preview link" |
| **Stripe** | Only if you ever charge clients for access | — |

Already connected in your workspace:

- **Figma** — genuinely useful here. Once a palette is extracted, you can push it straight into a Figma variable collection so designers get it where they actually work.
- **Google Drive** — installed but switched off in this chat. Worth turning on: brand guides usually already live in a shared Drive folder, so you can point Spectra at the folder instead of asking people to re-upload.

**A model API key is not a connector.** It's a key you paste into your server settings so your *website* can call the model on its own, without you in the loop. Different thing, covered in Step 8.

---

## The steps

Do them in order. Each one leaves you with something that works.

### Step 1 — Keep the master copy safe *(done)*

**What:** Your code lives at `github.com/hellophong/brand-guide`.

**Why:** This is the architect's master set of blueprints. Everything else copies from here. Every change is recorded, and you can always go back.

Nothing to do — this is already set up.

---

### Step 2 — Put the shop on a street *(15 minutes)*

**What:** Get the site onto the real internet at a real address.

**Use this link — it skips the menus entirely:**

👉 **[dash.cloudflare.com/?to=/:account/workers-and-pages](https://dash.cloudflare.com/?to=/:account/workers-and-pages)**

Cloudflare works out which account you mean and drops you on the right page. Sign up first if you haven't.

Then:

1. Click **Create**.
2. Choose **Import a repository**.
3. Authorise GitHub and pick **brand-guide**.
4. Name it exactly **`brand-guide`** — it has to match the name in `wrangler.jsonc`, or the build fails.
5. Leave the build settings alone. The repo already tells Cloudflare what to do.
6. Click **Deploy**.

**How long it takes:** the first deploy usually runs **1 to 3 minutes**. A timer counting up to 20, 40, 90 seconds is normal — it's cloning the repo and uploading. Don't refresh in a panic; the build runs on Cloudflare's machines, not in your browser, so it carries on regardless of what you do with the tab.

**You'll know it worked when:** the log ends with something like `Success! Uploaded 1 files` and `Deployment complete`, and you get a link ending in `.workers.dev` that loads the mockup.

**You'll know it failed when:** the log stops on a red **Build failed**. It won't sit there silently — a failure is loud and immediate.

#### Can't find "Workers & Pages" in the sidebar?

You're not going mad — Cloudflare renamed it. Two likely reasons:

- **It's now called "Compute (Workers)"** in the newer dashboard. Same place, new label. Pages and Workers were merged.
- **You're inside a domain instead of your account.** If you've clicked into a specific website, the sidebar shows settings for *that domain* only. Click the Cloudflare logo (top left) to get back to account home first.

The link above avoids both problems.

#### "It made a Worker, not a Page — is that wrong?"

No, that's correct now. Cloudflare merged the two products, and new static sites are deployed as **Workers with static assets**. For your purposes nothing changes: same free tier, same automatic deploys, same custom domains. Older tutorials (including the first version of this guide) say "Pages" because that's what it used to be called.

#### If the Git import gives you trouble

There's a no-Git fallback that takes two minutes: on the same page choose **Create** → **Upload assets**, then drag in a folder containing just `index.html`. It goes live immediately.

The trade-off: it won't update itself when the code changes — you'd have to drag the file in again each time. Fine for showing someone today; switch to the Git route when you can.

**What you now have:** a real shop on a real street. Anyone with the link can walk in. The stockroom is still painted on — logging in and uploading still resets on refresh — but the building is real, and it updates itself every time the code changes.

> **Ask Claude Code:** "Deploy the brand-guide repo to Cloudflare Pages and give me the URL."

---

### Step 3 — Open the back office *(10 minutes)*

**What:** One sign-up that gives you the door, the stockroom, the ledger and the assistant.

1. Go to **supabase.com**, sign up with GitHub.
2. **New project**. Name it `spectra`.
3. Pick a **region close to your users** — this decides how far every request has to travel.
4. It will generate a database password. **Save it in your password manager now.** You cannot see it again.
5. Wait about two minutes while it builds.

**You'll know it worked when:** you see a project dashboard with Table Editor, Authentication and Storage in the sidebar.

**What you now have:** an empty back office. Rooms built, nothing in them yet.

> **Ask Claude Code:** connect the Supabase connector first, then "Create a project called spectra and tell me when it's ready."

---

### Step 4 — Build the shelves *(20 minutes, Claude Code does this)*

**What:** The ledger — the index cards that record every brand, colour, typeface and document.

This is the one genuinely technical step, and it's the one to hand over entirely.

> **Ask Claude Code:** "Using the Supabase connector, create the tables described in ARCHITECTURE.md — brands, documents, colors, typefaces, logo_rules and assets. Add row-level security so anyone can read published brands, but only signed-in admins can write anything. Then show me the tables."

**You'll know it worked when:** Claude reports the tables exist, and you can see them in **Table Editor**.

**Why it matters:** those security rules are the actual lock on your door. The mockup hides draft brands from guests in the browser — that's a *design* decision, not a security one. Anyone technical could bypass it. Rules in the database can't be bypassed, because the database itself refuses.

---

### Step 5 — Fit the front door *(15 minutes)*

**What:** Real logins, replacing the demo one that accepts anything.

1. In Supabase: **Authentication** → **Providers**.
2. Turn on **Email**. Turn on **"Confirm email"**.
3. Simplest option: enable **magic links** — people type their email and get a link to click. No passwords to forget, reset or leak.
4. **Authentication** → **Providers** → also turn on **Google** if your team uses Google Workspace. It's a few clicks and most people prefer it.
5. Add yourself: **Authentication** → **Users** → **Add user** → your email.

**Important — keep it invite-only.** Under **Authentication** → **Sign-ups**, turn **off** "Allow new users to sign up". Otherwise anyone who finds your site can make themselves an account. You want to add people deliberately.

**You'll know it worked when:** your email address appears in the Users list.

> **Ask Claude Code:** "Replace the demo login in index.html with Supabase magic-link auth, and gate the admin portal on a real signed-in admin instead of `state.admin`."

---

### Step 6 — Unlock the stockroom *(10 minutes)*

**What:** Somewhere for the actual PDF files to live.

1. Supabase → **Storage** → **New bucket** → name it `brand-guides`.
2. Leave it **Private**. This matters: a public bucket means anyone who guesses a filename can download a client's brand guide.
3. Make a second bucket, `brand-assets`, also private — that's for the logos and artwork uploaded on the Assets tab.

**You'll know it worked when:** two buckets are listed, both marked Private.

**How private files still reach people:** when someone clicks Download, your site asks Supabase for a **signed link** — a temporary key that works for a few minutes and then stops. So a link forwarded outside your team dies rather than living forever in someone's inbox.

> **Ask Claude Code:** "Wire the PDF upload in the admin portal to the brand-guides bucket, and the Assets tab uploads to brand-assets. Use signed URLs for downloads."

---

### Step 7 — Connect the shop to the back office *(10 minutes)*

**What:** Tell the website where its back office is.

1. In Supabase: **Settings** → **API** → copy the **Project URL** (`https://something.supabase.co`).
2. **Settings** → **API Keys** → **Publishable and secret API keys** tab → copy the **Publishable key** (`sb_publishable_…`). If there isn't one, click **Create new API keys**.
3. Put both into **`config.js`** in the repo — edit it on GitHub with the pencil icon and commit. Cloudflare redeploys by itself.

> **Not Cloudflare environment variables.** An earlier version of this guide said to put them there. That was wrong for this site: our Worker is *assets-only* — it serves `index.html` and runs no server code at all — so environment variables would have nothing to run in and the page could never read them. They go in `config.js`, which the browser downloads along with the page.
>
> This is safe precisely because the publishable key is meant to be public, and the security rules from Step 4 are what actually protect your data. It is not a licence to put the **secret** key there — that one ignores every rule.

**Names changed recently.** Supabase is replacing the old `anon` and `service_role` keys with **publishable** and **secret** keys; the old pair still works but is being retired at the end of 2026. If your dashboard only shows a **Legacy API Keys** tab, use the **anon** key from there — same job.

**On that word "publishable":** it's *designed* to be visible in your website's code. It's a doorbell, not a key — it lets the site knock, and the rules from Step 4 decide what it's allowed to do. This is exactly why Step 4 matters so much.

**Never** put the **secret** key (`sb_secret_…`, formerly `service_role`) into your website. That one ignores every rule you wrote. It belongs only in server settings, never in anything a browser downloads.

> **Ask Claude Code:** "Point the site at my Supabase project using the environment variables I've set in Cloudflare."

---

### Step 8 — Hire the stockroom assistant *(30 minutes)*

**What:** The part that actually reads the PDF. Everything so far has been plumbing; this is the machine.

Two pieces:

**a) The assistant.** A Supabase Edge Function that wakes up when a PDF lands, opens it, pulls out the text, the font names and the colour values already sitting inside the file. A PDF isn't a picture — it carries all of that in plain form. This step is free and gets you most of the palette and every typeface name.

**b) The expert.** For anything the file doesn't state outright — *which* colours are primary, what each typeface is *for*, what the logo rules say — the assistant phones a language model.

**Either provider works.** This is the one place in the whole build that is swappable: the expert is a phone number, not a fixture. Use whichever you already have credits with.

1. Create an **API key** — **platform.openai.com** or **console.anthropic.com**.
2. Put it in Supabase → **Edge Functions** → **Secrets**. **Never** in `config.js` or anywhere else in the website. That file is public by design; this key is the opposite — it spends your money on every call, and anyone who finds it can spend it too.

> **Ask Claude Code:** "Build the extraction Edge Function following the pipeline in ARCHITECTURE.md. Parse the PDF first with pdf.js and only send the leftovers to Claude. Return structured output with a confidence score per field, and write the results to the tables from Step 4."

**Which model:** start at the cheapest tier either provider offers. Reading a structured document is not a hard job, and the expensive models are not better at it.

| Model | Per million tokens in / out |
| --- | --- |
| GPT-5.4 Nano | $0.20 / $1.25 |
| GPT-5.4 Mini | $0.75 / $4.50 |
| Claude Haiku 4.5 | $1.00 / $5.00 |

Move up a tier only if the extraction disappoints — and judge that on real brand guides, not a hunch.

**What a guide actually costs to read:** a 90-page brand guide is roughly 60,000 words. At nano prices that's **a few cents**; at Haiku prices, 10–20 cents. Either way a hundred guides costs less than lunch. Both providers offer batch processing at half price if you ever load an archive in bulk.

**Ask for structured output.** Both providers can guarantee the reply matches a schema you define — OpenAI calls it Structured Outputs, Anthropic does it through tool definitions. Use it. It's the difference between reliably getting a confidence score on every field and writing code that guesses at prose.

**Keep the call swappable.** Put the model call behind one small function with a plain input and output. Then changing provider later is a ten-line edit, not a rebuild — and you can run both over the same guide to see which reads it better.

---

### Step 9 — Put your name on the door *(15 minutes, optional)*

1. Buy a domain — Cloudflare Registrar sells them at cost, roughly $10/year.
2. Cloudflare Pages → your project → **Custom domains** → add it.

**You'll know it worked when:** `brand.yourstudio.com` loads your site with a padlock in the address bar.

---

### Step 10 — Fit a smoke alarm *(15 minutes, optional but sensible)*

Once other people rely on this, you want to hear about breakages from a machine, not from an annoyed client.

- **Sentry** (free tier, 5,000 errors/month) emails you when the site throws an error.
- **Supabase backups** — on the free plan you get none. Another reason Pro is worth $25 once real client work is in there.

> **Ask Claude Code:** "Add Sentry to the site and tell me when something breaks."

---

## Doing it in the right order

The temptation is to build the clever part first. Don't. Each of these is useful on its own, so you can stop at any point and still have something people use:

1. **Steps 1–2** — the site is live and shareable. Brands still typed in by hand. *One designer using this for a week will teach you more than a month of planning.*
2. **Steps 3–5** — real logins. You control who sees what.
3. **Steps 6–7** — real uploads. The library is genuinely useful now, and you've collected real PDFs to test against.
4. **Step 8** — automate the reading. You now have real examples to check it against, which you didn't have on day one.

Building Step 8 first is the classic mistake. A library nobody browses does not get better by filling itself faster.

---

## What stays broken until you do this

For clarity, here's exactly what in the current mockup is theatre:

| Looks like it works | Actually |
| --- | --- |
| Logging in | Accepts any password. There are no accounts. |
| Uploading a PDF | Never leaves your browser. The palette is generated from the file's raw bytes — a hash, not a reader. |
| Uploading logos and artwork | Real enough to preview and download, but gone on refresh. |
| Publishing and approving | Works, but only in that tab. Nobody else sees it. |
| Hiding drafts from guests | Enforced in the browser only. Not a real lock until Step 4. |

Everything else — copying colour values, the contrast maths, the palette exports, the type specimens — is genuinely working code that carries over unchanged.

---

## Two things to be careful about

**Pantone.** Those values are licensed. Store the Pantone name your client's guide states; never try to calculate one. Spectra already labels every value as either 📄 *stated in the guide* or ⚙ *calculated* — keep that distinction, because sending a calculated colour to a printer is how you end up paying for a reprint.

**Client confidentiality.** Brand guides are often under NDA, especially pre-launch. Private buckets, expiring links and invite-only sign-up aren't paranoia — they're the difference between a tool your clients trust and one their legal team asks you to delete.

---

## Where these numbers come from

Prices and limits checked August 2026. They change — check the pricing page before you commit.

- [Supabase free tier limits and pauses](https://www.itpathsolutions.com/supabase-free-tier-limits)
- [Supabase pricing breakdown](https://uibakery.io/blog/supabase-pricing)
- [Cloudflare Pages free plan limits](https://www.devtoolreviews.com/reviews/cloudflare-pages-pricing-bandwidth-limits-2026)
- [Cloudflare Pages Functions pricing](https://developers.cloudflare.com/pages/functions/pricing/)
- [Claude API token pricing](https://benchlm.ai/anthropic/api-pricing)
- [OpenAI API token pricing](https://benchlm.ai/openai/api-pricing)
