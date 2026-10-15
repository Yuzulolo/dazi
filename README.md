# Dazi — find your travel & food buddy

**🔗 Live app:** _coming soon — added after the first Vercel deploy_

**🔑 Demo login for reviewers:** _email: TBA · password: TBA_ (a dedicated demo account, 18+, already confirmed)

---

## Goal
Dazi (搭子, "a casual companion for a specific activity") helps solo travellers and people new to a city find a compatible buddy to explore, eat or sightsee with — quickly and safely.

## The problem
- **Situation:** more people travel solo or move to a new city and want company for a day of food markets, museums or hiking.
- **Complication:** today they post in scattered places (Xiaohongshu, Reddit, Facebook groups). Posts are unstructured, scrolling takes ages, most get no reply, and meeting strangers feels unsafe.
- **Resolution:** write one sentence — *"I'm in Berlin 20–25 Oct, want street food and flea markets"* — and AI turns it into a structured trip card, then suggests compatible buddies with a short AI-written reason. Contact only opens after **both** sides accept; social handles are revealed only by mutual exchange.

## How it works
1. **Describe your trip** in one sentence. AI (server-side) extracts city, dates, interests, budget and vibe.
2. **Get matched.** Hard filters (same city, overlapping dates, shared language, mutual preferences, not blocked) then a weighted score: trip similarity (pgvector embeddings) + travel style (pace, rhythm, interests) + personality.
3. **Connect safely.** Send an invite; chat opens only when it's accepted. Block / report at any time.
4. **After meeting,** leave private safety feedback and positive public tags.

Guests can try a search on the homepage; results are anonymised on the server. All users must be 18+.

Full product spec: [`docs/SPEC.md`](docs/SPEC.md) · user flows and rules: [`docs/FLOWS.md`](docs/FLOWS.md)

## Build status
| Phase | Status |
|---|---|
| 1. Scaffold & auth (email sign-up/login, 18+ check, `profiles` + RLS, deploy) | 🚧 in progress |
| 2. Onboarding & profile | ⏳ |
| 3. Posting (AI extraction) | ⏳ |
| 4. Matching + guest search | ⏳ |
| 5. Invites, chat, safety | ⏳ |
| 6. Feedback | ⏳ |
| 8. Hardening & launch | ⏳ |

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
