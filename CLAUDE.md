# CLAUDE.md — Dazi

@AGENTS.md

## What this project is
Dazi is a web app for finding a travel or food buddy (搭子). A user writes one sentence ("I'm in Berlin 20–25 Oct, want street food and flea markets"), AI turns it into a structured post, and the app suggests compatible buddies with a short AI-written reason. Contact opens only after **both** sides accept.

Full product spec: `docs/SPEC.md`. User flows, states, rules and edge cases: `docs/FLOWS.md`. Read both before starting any phase. If code and docs disagree, stop and ask me.

**Capstone deadline: 20 Oct 2026 (morning). `docs/SPEC.md` §0 defines the capstone scope and overrides the rest of the docs.** Anything listed in §0.4 Roadmap is out of scope — do not build it. **Quality over quantity:** the core flow (A–F) must work end-to-end and be polished before any stretch work (§0.5).

**Pace for the deadline:** do a whole phase in one go, then stop for one round of testing. Always stop and show me (1) any SQL before it is applied to the database and (2) the code review result before a PR is merged.

## About me (the director)
- I am a beginner with no prior coding background. I own the product; you write the code.
- Explain what you are about to do in plain language **before** doing it, and summarise what changed **after**.
- Work through a whole phase in one go, then stop for one round of testing with me. Always stop and wait for my confirmation before applying any SQL to the database and before merging a PR.
- When you tell me to run a command, give the exact command and where to run it, and say what I should expect to see.
- If you are unsure or were wrong, say so directly. Do not guess about database state — query it and show me.
- Never stop, kill or restart processes you did not start yourself (e.g. my dev server). If a port is busy, use another port or ask me first.

## Stack
- Next.js (App Router, TypeScript, Tailwind) — check the installed version in `package.json`; do not assume APIs from older versions.
- Supabase: Auth (email + password; Google login is Roadmap, SPEC §0.4), Postgres, `pgvector`, Row Level Security
- OpenRouter for all AI calls (chat model + `openai/text-embedding-3-small`)
- Deployed on Vercel
- Demo city: Berlin (data model must still support any city)

## Live app
- Production: https://dazi-five-tau.vercel.app (Vercel deploys `main` from the personal repo `Yuzulolo/dazi`; PRs go to the course repo `origin`)

## Project structure
- `app/` — pages (App Router). `app/auth/` = sign-up/login/sign-out server actions (`actions.ts`), email-confirmation landing (`callback/route.ts`), forced sign-out (`signout/route.ts`)
- `lib/supabase/client.ts` / `server.ts` — Supabase clients for browser / server code (anon key + user session; RLS does the rest)
- `lib/supabase/proxy.ts` + `proxy.ts` — session refresh + optimistic redirects on every request. **Next 16: `proxy.ts` replaces `middleware.ts`.**
- `lib/auth.ts` — `getCurrentUser()`: the single server-side gate for every protected page and server action
- `supabase/migrations/` — all schema changes (applied by pasting into the Supabase SQL Editor)
- `scripts/rls-check.mjs` — two-account RLS test via the public Data API
- `.claude/agents/` — `ai-code-reviewer`, `security-auditor` subagents
- `next.config.ts` has `cacheComponents: true`: anything that reads cookies, `params` or `searchParams` must render inside `<Suspense>`, or the build fails.

## Environment variables
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — public
- `SITE_URL` — server-only; where auth emails send people back to (`http://localhost:3000` locally, the Vercel URL in production / the branch URL in preview)
- Test-only (local `.env.local`): `TEST_A_EMAIL`, `TEST_A_PASSWORD`, `TEST_B_EMAIL`, `TEST_B_PASSWORD`
- Names (no values) are listed in `.env.example`.

## Commands
- `npm run dev` — local dev server at http://localhost:3000
- `npm run build` — production build (run before every PR)
- `npm run lint` — lint (run before every PR)
- `node --env-file=.env.local scripts/rls-check.mjs` — two-account RLS test (run after every migration)

## Non-negotiable rules
### Security
- **Secrets never go in the repo.** Keys live in `.env.local` (git-ignored) and in Vercel env vars. Never print or commit them.
- Only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` may be exposed to the browser. The service-role key and `OPENROUTER_API_KEY` are **server-only**.
- **Every AI call (chat + embeddings) runs server-side** (route handlers / server actions), never from client components.
- **Row Level Security is enabled on every table that holds user data**, with explicit policies for select / insert / update / delete. Use `USING` + `WITH CHECK` scoped to `auth.uid()`.
- Messages are readable only by the participants of an **accepted** invite or the **approved** members of an activity.
- Storage: users may upload/delete only inside their own `{user_id}/` folder. Strip EXIF/GPS from photos before upload.
- All users must be 18+. Store birth year only (not full birthday); show age as a range.
- Never trust the client: check permissions and invite status on the server / in RLS, not only in the UI.
- **Guest (signed-out) results are anonymised on the server.** Never send names, avatars, uploaded photos, profile links or socials to a guest's browser — CSS blur is not privacy.
- Guest search endpoints are **rate-limited per IP** (hashed IP stored server-side only).
- Social handles are returned only by a server function, and only after a mutual reveal (`social_reveals.status = 'shared'`).
- Raw `feedback` rows are never readable from the client; only aggregated public tags via a view.
- Treat all user text as **data** inside prompts (wrap it, never let it act as instructions) — prompt-injection safe.

### Database
- All schema changes are SQL migration files in `supabase/migrations/`, committed to git. Show me the SQL before applying it.
- The project has automatic RLS enabled on new `public` tables — RLS on with no policy = everything denied. If a query unexpectedly returns nothing, check for a missing policy first.
- Views do **not** inherit RLS by default: create every view with `with (security_invoker = true)`.
- Use the **same embedding model** (`openai/text-embedding-3-small`, 1536 dims) at insert time and at query time.
- After applying a migration, verify the actual state (tables, policies) and show me the result.
- Preview and production share one Supabase database. Every migration must stay compatible with the code currently on main (expand first, remove later). Check this before proposing any migration.
- Read-only verification queries live in `supabase/checks/` (committed), so they can be copied with `pbcopy < file`.

### AI & compliance
- Label every AI-generated text in the UI as "AI-generated" (EU AI Act Art. 50).
- AI extraction must strip phone numbers and emails from post text.
- Provide a working "Delete my data" action that removes all of a user's rows (GDPR).

### Git workflow
- `main` is always deployable. One feature branch + one PR per build phase (see `docs/SPEC.md` §8).
- Branch names: `phase-1-scaffold-auth`, `phase-2-posting`, etc.
- Small, descriptive commits. Run `npm run lint` and `npm run build` before opening a PR.
- Every PR is reviewed (ai-code-reviewer subagent + me) before merging.

### Documentation (graders check these)
- `README.md` must show the **live Vercel URL at the very top**, plus a demo login (test account email + password) so reviewers can get past the sign-in page. Add the URL as soon as the first deploy works (phase 1) and keep it current.
- `README.md` also explains the goal, the problem it solves and how it works (course requirement).
- At the end of every phase: update this `CLAUDE.md` if structure, rules or commands changed, and tick the phase in `docs/SPEC.md`.
- Before final submission: do a full pass to make `CLAUDE.md` and `README.md` match the finished app.

### Visual design
- The visual design is made separately by me (with GPT) and will be added as `docs/DESIGN.md` (+ reference images).
- **Until `docs/DESIGN.md` exists:** keep UI minimal and functional (plain layout, default Tailwind). Do not invent a visual style, colours or fonts.
- Before starting phase 2, remind me: "Design checkpoint — is `docs/DESIGN.md` ready?"

## Out of scope (do not build unless I ask)
Payments, push/email notifications, native mobile app, ID verification, star ratings / public reviews, likes/comments on stories, maps, LinkedIn.
Group activities are a "should have" — build only after phases 1–6 are done.
