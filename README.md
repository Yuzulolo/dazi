# Dazi — find your travel & food buddy

**🔗 Live app:** https://dazi-five-tau.vercel.app

**🔑 Demo login for reviewers:** email `xiangquyuanfang+demo@hotmail.com` · password `k5nNGUEfygEgPLF` (a dedicated demo account, 18+, already confirmed)

---

## Goal
Dazi (搭子, "a casual companion for a specific activity") helps solo travellers and people new to a city find a compatible buddy to explore, eat or sightsee with — quickly and safely.

## The problem
- **Situation:** more people travel solo or move to a new city and want company for a day of food markets, museums or hiking.
- **Complication:** today they post in scattered places (Xiaohongshu, Reddit, Facebook groups). Posts are unstructured, scrolling takes ages, most get no reply, and meeting strangers feels unsafe.
- **Resolution:** write one sentence — *"I'm in Berlin 20–25 Oct, want street food and flea markets"* — and AI turns it into a structured trip card, then suggests compatible buddies with a short AI-written reason. Contact only opens after **both** sides accept.

## How it works
1. **Describe your trip** in one sentence. AI (server-side) extracts city, dates, interests, budget and vibe.
2. **Get matched.** Hard filters (same city, overlapping dates, shared language, mutual preferences, not blocked) then a weighted score: trip similarity (pgvector embeddings) + travel style (pace, rhythm, interests) + personality.
3. **Connect safely.** Send an invite; a simple message thread opens only when it's accepted. Block / report at any time.

Guests can try a search on the homepage; results are anonymised on the server. All users must be 18+.

Full product spec: [`docs/SPEC.md`](docs/SPEC.md) · user flows and rules: [`docs/FLOWS.md`](docs/FLOWS.md)

## Build status
Capstone scope (deadline 20 Oct 2026, see [`docs/SPEC.md`](docs/SPEC.md) §0):

| Part | Status |
|---|---|
| A. Email auth, 18+ check, `profiles` + RLS, deploy | ✅ done |
| B. Onboarding & profile (incl. travel style quiz), private birth year / gender / preferences | ✅ done |
| C. Intent post (AI extraction, poster tones, embeddings, per-user AI quota) | ✅ done |
| D. Matching + AI reasons + seed data | ⏳ |
| E. Homepage guest search (anonymised, rate-limited) | ⏳ |
| F. Invites + simple message thread | ⏳ |
| G. Safety & compliance (block/report, AI labels, delete my data) | ⏳ |
| Design foundation (poster wall, design system — [`docs/DESIGN.md`](docs/DESIGN.md)) | ✅ done |
| H. Design polish, security scan, evaluation | ⏳ |

### What's next (Roadmap, not in the capstone)
Google login · avatars and travel stories with photos · trip photo upload with vision-AI check · Facebook verification and mutual social reveal · after-meeting feedback tags · group activities · realtime chat · email notifications.

## Tech stack
- **Next.js 16** (App Router, TypeScript, Tailwind) — deployed on **Vercel**
- **Supabase** — Auth, Postgres, `pgvector`, Row Level Security
- **OpenRouter** — chat model + `openai/text-embedding-3-small` (all AI calls server-side)

## Run it locally
Requirements: Node.js 20+ and a Supabase project.

```bash
git clone https://github.com/Yuzulolo/dazi.git
cd dazi
npm install
cp .env.example .env.local   # then fill in the values (see below)
npm run dev                  # http://localhost:3000
```

Apply the database migrations in `supabase/migrations/` (in order) via the Supabase SQL Editor.
In Supabase → **Authentication → URL Configuration**, set the Site URL to `http://localhost:3000` and add `http://localhost:3000/**` to Redirect URLs.

### Environment variables
| Name | Where it's used | Secret? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | browser + server | no (public) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser + server (anon or publishable key) | no (public, protected by RLS) |
| `SITE_URL` | server — where auth emails send people back to | no, but server-only |

Secrets never go in the repo: `.env.local` is git-ignored and production values live in Vercel's environment variables.

### Useful commands
| Command | What it does |
|---|---|
| `npm run dev` | local dev server |
| `npm run lint` | lint |
| `npm run build` | production build |
| `node --env-file=.env.local scripts/rls-check.mjs` | two-account Row Level Security test (needs two confirmed test accounts in `.env.local`) |

## Security & privacy (so far)
- Row Level Security on every user-data table; guests have no direct database access.
- 18+ enforced on the server **and** in the database; only the birth year is stored.
- Session checked on the server for every protected page (not just hidden in the UI).
