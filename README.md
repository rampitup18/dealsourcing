# Blockmate Deal Sourcing Terminal

An AI deal-sourcing agent for the Australian renewable & infrastructure market. It
ingests public project signals, scores each one against the Blockmate mandate, derives
each developer's track record, and drafts originator-style cold outreach — all surfaced
in a dashboard.

It is built to act as a tireless junior originator: find pre-FID projects that fit, tell
you *why* they fit, show you who's behind them and what else they've done, and hand you a
ready-to-edit first email. It drafts; you send.

---

## What it does

```
  AEMO Generation Info ─┐
                        ├─► normalize ─► dedupe/merge ─► qualify (LLM) ─► draft email (LLM) ─► dashboard
  EPBC referrals ───────┘         │                          │
                                  └─ ABR entity enrich        └─ scored against lib/mandate.ts
```

1. **Ingest** two free public feeds (details below).
2. **Normalize & dedupe** — the same project from both feeds collapses into one row; a
   developer's projects roll up to one proponent, which *is* their track record.
3. **Qualify** — an LLM scores each project 0–100 on stage / scale / technology / capital-need
   fit against your mandate, with a written rationale and risk flags.
4. **Draft outreach** — an LLM writes a short, specific cold email per qualified lead.
5. **Dashboard** — ranked leads, full deal data, developer track record, entity + contacts,
   and the editable email, with copy / open-in-mail / regenerate.

---

## Data sources (all public, all legal)

This is the important part, and it's why this works where a "scrape land titles" approach
wouldn't. Australian land titles are state-administered, pay-per-search, and their terms of
use prohibit bulk scraping. So we don't touch titles. For pre-FID renewable infra, these
signals are far warmer anyway:

| Feed | What it gives | Access | Freshness |
|---|---|---|---|
| **AEMO Generation Information** | Every proposed/committed/operating generator and connection enquiry ≥5MW: name, proponent, tech, MW, region, status | Free `.xlsx`, ~monthly | **Primary fresh signal** |
| **EPBC referrals** | Federal environmental referrals for projects with a land footprint: richer proponent detail + location | Free, EPBC Public Portal | Secondary, cross-validates AEMO |
| **ABR** | Proponent → legal entity, ABN, status | Free API (GUID) | Enrichment |

A project appearing in **both** AEMO and EPBC, recently, is your highest-confidence lead.

> **Two traps found during research, baked into the code:**
> 1. The AEMO workbook URL changes every release and its column layout shifts. The parser
>    locates columns by fuzzy header match, not fixed index, and the URL is configurable.
> 2. The data.gov.au "Referrals Spatial Database" is **historical only (ends 2018)** — good
>    for back-filling track record, useless for live leads. The live feed is the EPBC portal.

---

## Setup

**Prerequisites:** Node 18+, a Postgres database (Neon / Supabase / Railway / RDS all fine),
an Anthropic API key.

```bash
npm install
cp .env.example .env          # fill in DATABASE_URL and ANTHROPIC_API_KEY at minimum
npm run db:push               # create the schema
npm run seed                  # load realistic demo data (no live feeds/keys needed)
npm run dev                   # open http://localhost:3000
```

You'll see a fully populated dashboard immediately from the seed data. To go live:

```bash
# set AEMO_GENINFO_URL (this month's workbook) or drop the file at ./data/aemo.xlsx
# optionally set EPBC_FEED_URL and ABR_GUID
npm run pipeline              # ingest → qualify → draft, against real feeds
```

Schedule `npm run pipeline` daily however your host does cron (Vercel Cron, Railway/Render
cron, GitHub Actions schedule, or system crontab). Ingestion is a single Node process — no
long-running worker needed.

---

## The mandate is the product — `lib/mandate.ts`

The scraping is commodity. What makes this *yours* is `lib/mandate.ts`, which encodes what
Blockmate actually backs (pre-FID, USD 1–50M predevelopment, hard-asset energy, sponsors who
plausibly *need* bridge capital and aren't already funded by a major). The qualifier reads
from it for both its hard filters and its scoring weights. **Tune that file as the strategy
sharpens** — a loose mandate fills the dashboard with noise; a tight one gives you five sharp
leads a week.

---

## Honest seams (where free data stops)

- **Direct contact emails.** Not in public records. The dashboard shows the legal entity,
  ASIC directors (where available), website and LinkedIn so you can find the right person.
  To auto-populate named contacts, wire a contact-enrichment API (Apollo / Hunter /
  RocketReach) keyed on the company domain — there's a clearly marked slot for it on the
  lead detail page.
- **Full financing history.** "Previous deals" here = every other project this party has in
  the public datasets, which is a genuine public development track record. M&A / funding-round
  history lives in paid databases (PitchBook, Mergermarket) and would be a separate integration.
- **Distance-to-transmission.** The schema has the field; computing it needs a grid line
  layer overlaid on the EPBC polygons. Left as a wiring point.

## On auto-sending email — a deliberate choice

The agent **drafts** outreach; it does not send. In a relatively small market, the first
contact is relationship capital, and an originator's credible, specific note is exactly the
value you're replicating. Keep a human in the loop on send even after you trust the drafts.
(B2B cold email is permitted under the Spam Act 2003 with honest sender identification and a
working unsubscribe — add that line to the signature before sending at volume.)

---

## Project layout

```
prisma/schema.prisma     data model (Proponent ← Project ← Lead)
lib/
  mandate.ts             THE qualification rubric — edit this
  anthropic.ts           LLM client + JSON helper
  db.ts  ui.ts           prisma client; UI label/colour helpers
ingest/
  aemo.ts  epbc.ts        the two feeds
  abr.ts                  free entity enrichment
  normalize.ts            dedupe fingerprinting + classification
  persist.ts              upsert + cross-source merge
  qualify.ts              LLM scoring against the mandate
  compose-email.ts        LLM cold-email drafting
  track-record.ts         derives prior deals from the graph
  run.ts                  pipeline orchestrator (the cron entrypoint)
seed/seed.ts             demo data so it runs with zero keys
app/                     Next.js dashboard (leads list + lead detail + email API)
```
