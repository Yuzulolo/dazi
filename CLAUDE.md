# CLAUDE.md — Dazi

@AGENTS.md

## What this project is
Dazi is a web app for finding a travel or food buddy (搭子). A user writes one sentence ("I'm in Berlin 20–25 Oct, want street food and flea markets"), AI turns it into a structured post, and the app suggests compatible buddies with a short AI-written reason. Contact opens only after **both** sides accept.

Full product spec: `docs/SPEC.md`. User flows, states, rules and edge cases: `docs/FLOWS.md`. Read both before starting any phase. If code and docs disagree, stop and ask me.

**Capstone deadline: 20 Oct 2026 (morning). `docs/SPEC.md` §0 defines the capstone scope and overrides the rest of the docs.** Anything listed in §0.4 Roadmap is out of scope — do not build it. **Quality over quantity:** the core flow (A–E; F invites + messages is Roadmap) must work end-to-end and be polished. There is no stretch feature (the trip photo moved to Roadmap).

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
- OpenRouter for all AI calls: chat `google/gemini-2.5-flash-lite` (fallback `openai/gpt-4.1-nano`; the school key blocks Claude models) + `openai/text-embedding-3-small`. Models are set in `lib/ai/openrouter.ts` only.
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
- `app/_components/dazi/` — design-system components (`SiteShell`, `Paper`, `PosterCarousel`, dialogs, badges); `app/_styles/dazi-*.css` — their styles, loaded once via `app/globals.css`
- `app/plan` — signed-in hub (my active plan; sign-in/onboarding land here; `app/home` only redirects here). `app/matches` — members: "For you" (real matches); guests: demo results. `app/plans/[id]` — demo recruitment detail (full guest search is Roadmap)
- Header for members: My plan · Matches · Profile (`NavLink`, `aria-current`); Settings, How it works and Sign out are on your own `/u/[id]`. The logo always goes to `/`
- `app/settings` (delete my account), `app/privacy` (privacy notice; model names rendered from `lib/ai/providers.ts`)
- `vercel.json` — server functions run in Frankfurt (`fra1`), next to Supabase (EU)
- `lib/demo/trips.ts` — fictional, labelled demo trips + the `DEMO_MATCHES` flag
- `lib/profile/` — profile options, validation, contact-details detector/stripper, queries; `languages.ts` = language list + aliases + `normalizeLanguage()` (every language value goes through it; known → ISO code, unlisted → tidied name)
- `lib/ai/` — OpenRouter wrapper, trip extraction (prompt + JSON schema), embedding text builder (server-only; `.ts` import extensions so scripts can run them)
- `lib/posts/` — trip card rules (shared by AI cleanup and form validation), queries, date formatting; `app/posts/` — editor, `/posts/new`, `/posts/edit`, server actions
- `evals/extraction.json` + `scripts/eval-extraction.mjs` — AI extraction eval
- `lib/matching/` — match types, `match_my_post` / `match_suggestion` wrappers, rule-based fallback reason; `lib/ai/match-reasons.ts` (cached, batched AI reasons), `lib/ai/profile-text.ts` + `profile-embedding.ts` (personality embedding)
- `scripts/seed-demo.mjs` (+ `scripts/seed/demo-users.json`), `scripts/backfill-profile-embeddings.mjs`, `scripts/eval-matching.mjs` + `evals/matching.json` — local-only, service role
- `scripts/rls-check.mjs` — two-account RLS test via the public Data API
- `.claude/` — project tools: agents `ai-code-reviewer` (PR reviews), `security-auditor`, `supabase-security-scanner`, `nextjs-security-scanner`, `vercel-security-scanner`; command **`/security-audit`** (runs the three scanners in parallel and merges their findings); skills `supabase`, `supabase-postgres-best-practices`; `references/` (Next.js data security, Vercel deployment security). Relative paths only, no secrets.
- `docs/SECURITY-AUDIT.md` — latest security audit: findings, fixes, accepted risks, follow-ups, dashboard checklist
- `next.config.ts` has `cacheComponents: true`: anything that reads cookies, `params` or `searchParams` must render inside `<Suspense>`, or the build fails.

## Environment variables
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — public
- `OPENROUTER_API_KEY` — server-only (Production + Preview in Vercel, marked Sensitive). School key: **no spending limit**, so quotas are the only protection
- `DEMO_EMAIL`, `DEMO_PASSWORD` — server-only (Production + Preview in Vercel, Sensitive): the "Try the demo account" button signs in on the server (`signInDemo` in `app/auth/actions.ts`). `tests/demo-env.test.mjs` keeps them out of client code.
- `SUPABASE_SERVICE_ROLE_KEY` — **local scripts only** (seed, backfill, eval via `scripts/lib/admin.mjs`). It bypasses RLS: **never** imported by `app/` or `lib/`, **never** added to Vercel, **never** `NEXT_PUBLIC_`. `tests/secrets.test.mjs` fails if app or lib code mentions it.
- `SITE_URL` — server-only; where auth emails send people back to (`http://localhost:3000` locally, the Vercel URL in production / the branch URL in preview)
- Test-only (local `.env.local`): `TEST_A_EMAIL`, `TEST_A_PASSWORD`, `TEST_B_EMAIL`, `TEST_B_PASSWORD`
- Names (no values) are listed in `.env.example`.

## Commands
- `npm run dev` — local dev server at http://localhost:3000
- `npm run build` — production build (run before every PR)
- `npm run lint` — lint (run before every PR)
- `node --env-file=.env.local scripts/rls-check.mjs` — RLS / security test, 87 checks (two test accounts + temporary users via the service role key; run after every migration)
- `/security-audit` (Claude Code command) — three-scanner security audit, report only
- `npm test` — unit tests (`*.test.mjs`, Node's built-in test runner; e.g. the contact-details detector)
- `node --conditions=react-server --env-file=.env.local scripts/eval-extraction.mjs` — AI extraction eval (20 real AI calls; run sparingly)
- `node --conditions=react-server --env-file=.env.local scripts/seed-demo.mjs` — 30 demo users in Berlin (idempotent; `--cleanup` removes them; 60 embedding calls)
- `node --conditions=react-server --env-file=.env.local scripts/backfill-profile-embeddings.mjs` — personality embeddings for older profiles; `--all` re-embeds every onboarded profile (after the embedding wording changes — not run for phase 7a yet, needs my OK)
- `node --env-file=.env.local scripts/eval-matching.mjs` — matching eval (top-3 hit rate + hard filters; no AI calls)
- `node --env-file=.env.local scripts/create-demo-account.mjs` — create the dedicated demo login (`DEMO_EMAIL` = `demo@dazi-demo.invalid`) if it does not exist; `profiles.is_protected` marks it
- `node --conditions=react-server --env-file=.env.local scripts/reset-demo-account.mjs` — restore the public demo login (profile, plan, **password**, AI counters) before a demo or grading session. If a visitor changed the demo password, also sign out every demo session in the Supabase SQL Editor: `delete from auth.sessions where user_id = (select id from public.profiles where is_protected);`

## Non-negotiable rules
### Security
- **Secrets never go in the repo.** Keys live in `.env.local` (git-ignored) and in Vercel env vars. Never print or commit them.
- Only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` may be exposed to the browser. The service-role key and `OPENROUTER_API_KEY` are **server-only**.
- **Every AI call (chat + embeddings) runs server-side** (route handlers / server actions), never from client components.
- **Every AI call is rate-limited** through `consume_ai_quota()` before the call: per user per rolling 24 h 20 drafts (`extract`), 20 plan saves (`embed`), 20 match-reason calls (`reason`), 10 profile embeddings (`profile`); 1,000 calls per day site-wide. No AI call without a quota check. (Guests make no AI calls; full guest search is Roadmap.)
- **"Delete my data":** `/settings` → `public.delete_my_account()` (security definer, pinned to `auth.uid()`, no service role key). Every user table must cascade from `auth.users` — add `on delete cascade` to any new table and extend `supabase/checks/phase5_delete_account_check.sql`. The public demo login (`profiles.is_protected`) and demo users (`is_demo`) can't be deleted.
- **Posts are written only through `publish_post()` / `update_post()`** (security definer, pinned to `auth.uid()`); users have no direct INSERT/UPDATE, and the `posts_guard` trigger rejects contact details, past start dates and illegal status changes in the database itself.
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
- Every new email user needs `birth_year` and `display_name` in its user metadata — the sign-up trigger refuses it otherwise. This includes Supabase Dashboard "Add user", `auth.admin.createUser` and seed scripts (error: "Database error creating new user").

### Lessons learned (keep doing this)
- **Shared database:** preview and production use the same Supabase project — every migration must be expand-only and compatible with the code on `main`; show the SQL and a read-only check query before applying.
- **A trigger runs as whoever writes the row.** If client roles (`authenticated`) write the table directly, a trigger that calls `private.*` helpers must be `SECURITY DEFINER` with `set search_path = ''` (revoked from client roles) — e.g. `private.profiles_guard`, because users update profiles directly and have no EXECUTE on `private` helpers. `private.posts_guard` can stay invoker only because posts are written exclusively by definer functions (owner) and the service role (which has EXECUTE on the helpers). Before every trigger change, list every role that writes the table.
- **Tests must fail for the right reason:** every RLS check matches the expected error text (e.g. "permission denied for function", a named CHECK constraint), and positive controls prove an exclusion isn't an empty result.
- **Demo login:** shared and public. Before a demo or grading: run `scripts/reset-demo-account.mjs` (password, profile, plan, AI counters) and sign out its sessions with the SQL above.
- **Security headers** live in `next.config.ts` (`headers()`); a full CSP with `script-src` is a follow-up (nonces break prerendering).

### AI & compliance
- Label every AI-generated text in the UI as "AI-generated" (EU AI Act Art. 50).
- AI extraction must strip phone numbers and emails from post text.
- Provide a working "Delete my data" action that removes all of a user's rows (GDPR).

### Git workflow
- `main` is always deployable. One feature branch + one PR per build phase (see `docs/SPEC.md` §8).
- Branch names: `phase-1-scaffold-auth`, `phase-2-posting`, etc.
- Push every feature branch to **both** remotes: `origin` (course repo, PRs) and `personal` (Vercel builds from it, so only branches pushed there get a preview URL). After merging on origin: `git push personal origin/main:main`.
- Small, descriptive commits. Run `npm run lint` and `npm run build` before opening a PR.
- Every PR is reviewed (ai-code-reviewer subagent + me) before merging.

### Documentation (graders check these)
- `README.md` must show the **live Vercel URL at the very top**, plus a demo login (test account email + password) so reviewers can get past the sign-in page. Add the URL as soon as the first deploy works (phase 1) and keep it current.
- `README.md` also explains the goal, the problem it solves and how it works (course requirement).
- At the end of every phase: update this `CLAUDE.md` if structure, rules or commands changed, and tick the phase in `docs/SPEC.md`.
- Before final submission: do a full pass to make `CLAUDE.md` and `README.md` match the finished app.

### Visual design
- **Follow `docs/DESIGN.md`** (poster wall, 4 poster tones, smoked glass, Manrope + DM Sans, text ≥ 12px, WCAG AA). Build new UI from `app/_components/dazi/` and the `.dazi-root` classes; don't invent new colours or fonts.
- Pages use `SiteShell` with `variant="wall"` (poster carousel) or `variant="calm"` (forms, profile, home).
- Fictional demo data lives only in `lib/demo/` and is always labelled (Demo badge + footer).

## Out of scope (do not build unless I ask)
Payments, push/email notifications, native mobile app, ID verification, star ratings / public reviews, likes/comments on stories, maps, LinkedIn.
Group activities are a "should have" — build only after phases 1–6 are done.
