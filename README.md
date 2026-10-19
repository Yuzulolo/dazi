# Dazi — find your travel & food buddy

**🔗 Live app:** https://dazi-five-tau.vercel.app

**🔑 Demo login for reviewers:** email `xiangquyuanfang+demo@hotmail.com` · password `k5nNGUEfygEgPLF` (a dedicated, shared demo account, 18+, already confirmed) — or just click **"Try the demo account"** on the homepage or the login page. The demo account can't be deleted and is reset before demos; anything you enter there is visible to other visitors. Privacy notice: [/privacy](https://dazi-five-tau.vercel.app/privacy)

---

## The problem it solves
Dazi (搭子, "a casual companion for a specific activity") helps solo travellers and people new to a city find a compatible buddy to explore, eat or sightsee with — quickly and safely.
- **Situation:** more people travel solo or move to a new city and want company for a day of food markets, museums or hiking.
- **Complication:** they post in scattered places (Xiaohongshu, Reddit, Facebook groups). Posts are unstructured, scrolling takes ages, most get no reply, and meeting strangers feels unsafe.
- **Resolution:** write one sentence — *"I'm in Berlin 20–25 Oct, want street food and flea markets"* — and AI turns it into a structured trip poster, then Dazi shows compatible people with overlapping plans and a short, labelled AI explanation of why you might get along.

## How it works
1. **One sentence → a trip card.** Your sentence (English, German or Chinese) has phone numbers and emails removed, then an AI model extracts city, dates, interests, budget, vibe, a two-line poster headline and a colour into a strict JSON schema. Relative dates ("this weekend", "下周") are computed in code; every field is validated again on the server. You edit and publish it.
2. **Embeddings.** The trip card and your profile (bio, hobbies, cities, travel interests) are turned into 1536-number embeddings, stored in Postgres with `pgvector` and never readable by any client.
3. **Matching — one server-side function** (`match_my_post`, the only way anyone sees other people's plans):
   - **Hard filters:** same city, overlapping dates, both onboarded, ≥ 1 shared language, **mutual** age preference (compared in the age bands people see) and **mutual** gender preference.
   - **Score = 0.4 × trip** (cosine similarity of the plans) **+ 0.35 × style** (pace, day rhythm, interests overlap) **+ 0.25 × personality** (cosine similarity of the profiles).
4. **"For you".** Your top 5 appear as posters with a Trip · Style · Personality breakdown and a reason — written by AI in **one** batched call, cached per pair (reloads are free), labelled "AI-generated", with a rule-based fallback.

**AI models** (exactly as configured in [`lib/ai/openrouter.ts`](lib/ai/openrouter.ts), all calls server-side via OpenRouter): trip cards and match reasons — `google/gemini-2.5-flash-lite`, falling back to `openai/gpt-4.1-nano`; embeddings — `openai/text-embedding-3-small`. Every AI call takes a slot from a database-enforced quota (per user: 20 drafts, 20 saves, 20 reason calls, 10 profile embeddings per 24 h; 1,000 per day site-wide).

Full product spec: [`docs/SPEC.md`](docs/SPEC.md) · flows and rules: [`docs/FLOWS.md`](docs/FLOWS.md) · design system: [`docs/DESIGN.md`](docs/DESIGN.md)

## Security & privacy
- **Row Level Security on every table**; plans are owner-only and only written through two database functions pinned to the signed-in user; private columns (birth year, gender, preferences, embeddings) can't be selected by any client.
- **The database enforces the safety rules itself:** 18+ (birth year only, shown as an age range), no phone numbers or emails in plans or profiles, valid dates and statuses.
- **Secrets are server-only:** only the Supabase URL and publishable key reach the browser; the OpenRouter key is server-only; the "Try the demo account" button reads its credentials from server-only env vars (the demo login itself is public by design, see the top of this page); the service role key is used only by local scripts (enforced by tests). No secret was ever committed.
- **Delete my data:** Settings → Delete my account removes the account and every row linked to it, immediately.
- **AI labels (EU AI Act Art. 50):** every AI-written text is labelled; inputs say when they are processed by AI.
- **Browser hardening:** framing blocked, `nosniff`, strict referrer and permissions policies.
- Full audit, accepted risks and follow-ups: [`docs/SECURITY-AUDIT.md`](docs/SECURITY-AUDIT.md) · privacy notice: [/privacy](https://dazi-five-tau.vercel.app/privacy)

## Evaluation
| What | Result | Details |
|---|---|---|
| AI extraction (20 sentences EN/DE/ZH, incl. missing info, contact details, a prompt-injection attempt) | **98.8%** of fields correct (target ≥ 90%; 97.5% before relative dates were computed in code) | [`evals/EXTRACTION-RESULTS.md`](evals/EXTRACTION-RESULTS.md) |
| Matching hard filters (10 crafted exclusions + a positive control; age bands) | **10/10** excluded, control found; "31–31" narrows only to 30–34 | [`evals/MATCHING-RESULTS.md`](evals/MATCHING-RESULTS.md) |
| Matching ranking (hand-picked best buddy in the top 3) | **9/9 scored cases hit, 1 case not scored** (pool of 2) — target met, but the trip/style/personality ablation is inconclusive because the test set is too easy | [`evals/MATCHING-RESULTS.md`](evals/MATCHING-RESULTS.md) |
| Security (two-account RLS test + temporary users) | **84/84** checks pass | [`docs/SECURITY-AUDIT.md`](docs/SECURITY-AUDIT.md) |

## Build status (capstone scope, deadline 20 Oct 2026 — [`docs/SPEC.md`](docs/SPEC.md) §0)
| Part | Status |
|---|---|
| A. Email auth, 18+ check, `profiles` + RLS, deploy | ✅ done |
| B. Onboarding & profile (travel style quiz), private birth year / gender / preferences | ✅ done |
| C. One-sentence plan → AI trip card, poster tones, embeddings, AI quota | ✅ done |
| D. Matching + AI reasons + 30 demo users ([eval](evals/MATCHING-RESULTS.md)) | ✅ done |
| E. Homepage: plan composer, sign-up prompt, demo login (full anonymised guest search → Roadmap) | 🟡 light version |
| F. Invites + messages | ⏭️ Roadmap — matching is live; mutual-accept contact is the next milestone |
| G. Delete my data ✅, privacy page ✅, AI labels ✅ (block / report → Roadmap) | 🟡 partly |
| Design system (poster wall — [`docs/DESIGN.md`](docs/DESIGN.md)) | ✅ done |
| H. Security audit, evaluation, documentation | ✅ done |

### Roadmap
Invites and mutual-accept messaging · full anonymised guest search (rate-limited per IP) · block & report · Google login · travel stories with photos · trip photo with vision-AI check · social verification and mutual social reveal · overlap length in the match score · full Content-Security-Policy. Details: [`docs/SPEC.md`](docs/SPEC.md) §0.4.

## Tech stack
**Next.js 16** (App Router, TypeScript, Tailwind) on **Vercel** (Frankfurt) · **Supabase** (Auth, Postgres, `pgvector`, Row Level Security; EU) · **OpenRouter** for all AI calls.

## Run it locally
Requirements: Node.js 22+ and a Supabase project.
```bash
git clone https://github.com/Yuzulolo/dazi.git
cd dazi
npm install
cp .env.example .env.local   # fill in the values
npm run dev                  # http://localhost:3000
```
Apply the migrations in `supabase/migrations/` in filename order via the Supabase SQL Editor (each has a read-only check query in `supabase/checks/`). In Supabase → Authentication → URL Configuration set the Site URL to `http://localhost:3000` and add `http://localhost:3000/**` to Redirect URLs.

### Environment variables (names in `.env.example`)
| Name | Used by | Exposure |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser + server | public (protected by RLS) |
| `SITE_URL` | server (auth email links) | server-only |
| `OPENROUTER_API_KEY` | server (AI calls) | server-only, Sensitive in Vercel |
| `DEMO_EMAIL`, `DEMO_PASSWORD` | server ("Try the demo account") | server-only, Sensitive in Vercel |
| `SUPABASE_SERVICE_ROLE_KEY` | local scripts only (seed, reset, eval) | never in Vercel or app code |
| `TEST_A_*`, `TEST_B_*` | `scripts/rls-check.mjs` | local only |

### Commands
| Command | What it does |
|---|---|
| `npm run dev` / `npm run build` / `npm run lint` / `npm test` | dev server / production build / lint / unit tests |
| `node --env-file=.env.local scripts/rls-check.mjs` | security test (84 checks) |
| `node --conditions=react-server --env-file=.env.local scripts/eval-extraction.mjs` | AI extraction eval (20 real AI calls) |
| `node --env-file=.env.local scripts/eval-matching.mjs` | matching eval (no AI calls) |
| `node --conditions=react-server --env-file=.env.local scripts/seed-demo.mjs [--cleanup]` | 30 demo users in Berlin |
| `node --conditions=react-server --env-file=.env.local scripts/reset-demo-account.mjs` | restore the public demo login |

## AI disclosure: built with Claude Code
This capstone was built by **Yuze Li (product owner / "director")** together with **Claude Code** (Anthropic's coding agent, model Claude Opus 5.5), which wrote most of the code, SQL migrations, tests and documentation under the director's instructions. The director set the product scope and rules, made every product and privacy decision, reviewed and applied every database migration by hand, ran all browser tests, and picked independent "best buddy" answers for the matching evaluation. Every pull request was reviewed by an AI code-reviewer subagent and by the director before merging; the security audit used three specialised scanner subagents (now in [`.claude/`](.claude/)). The visual design kit and the paper texture were made with OpenAI tools (GPT / Codex). In the app itself, AI is used only where labelled (trip cards, match reasons, embeddings).
