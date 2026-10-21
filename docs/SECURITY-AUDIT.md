# Security audit — Dazi (capstone, part H)

**Date:** 19 Oct 2026 · **Target:** `main` @ `778ec71` (production code + all migrations in their final state) · **Result:** 0 critical findings; 3 high, 6 medium, 8 low — high/medium fixes applied or consciously accepted below.

## Scope and method
- **Three scanners in parallel**, merged and de-duplicated (procedure: `.claude/commands/security-audit.md`):
  - `supabase-security-scanner` — RLS coverage, policy sets, service-role / secret keys, storage, policies trusting user-editable data (skills: `supabase`, `supabase-postgres-best-practices`).
  - `nextjs-security-scanner` — secrets behind `NEXT_PUBLIC_`, records crossing into Client Components, Server Actions / Route Handlers re-checking the caller, ownership (IDOR).
  - `vercel-security-scanner` — env-var scoping, committed secrets in git history, preview protection, security headers (live `curl -I` on production and previews).
- **Report only**: the scanners changed nothing. All three now live in this repo's `.claude/` (agents, command, references, skills — relative paths only), so `/security-audit` can be re-run.
- **Severity reconciliation**: where scanners disagreed, the highest rating was kept.

**Confirmed sound by all three:** no secret was ever committed (all 54 commits of `main` @ `778ec71` checked — 55 across all branches — for Supabase secret keys, JWTs, OpenRouter keys and other credential shapes; `.env*` git-ignored since commit 1); the service role key is used only by local scripts; only `NEXT_PUBLIC_SUPABASE_URL` / `…_ANON_KEY` reach the browser; RLS is on for every table; every security-definer function pins `search_path = ''` and derives the user from `auth.uid()` (or is service-role only) — one exception, `private.age_range(uuid)`, accepts any user id and is unreachable only because the `private` schema is not exposed (L6, verified); no mutation accepts a client-supplied id; previews are behind Vercel Authentication; HSTS is on.

## Findings by severity

### Critical — none

### High
| # | Finding | Flagged by | Status |
|---|---|---|---|
| H1 | Profile text accepted phone numbers / emails via the Data API (the rule was app-only) — visible on `/u/[id]` and match cards, bypassing "contact only after both accept" | Supabase (high), Next.js (medium) | **Fixed** — `private.profiles_guard` trigger (security definer, checks only changed fields) in `20261019145950_security_scan_fixes.sql`, commit `1bcf7c4`; lists (hobbies, cities, plan headline lines) checked **per item** like the app in `20261019155453_contact_check_per_item.sql`, commit `4926d71` (PR #8 review W1: joined lists could turn "1850" + "10000" into a fake phone number). If the database refuses, the app shows the same friendly "Please remove contact details…" message. |
| H2 | Another user's private gender / gender preference can be inferred by changing your own settings and watching who disappears from your matches | Supabase (high), Next.js (low) | **Accepted** — inherent to mutual gender filtering; documented in FLOWS 2.0b and `/privacy`. Mitigation (delayed preference changes, rate-limited matching) → follow-up. Ages are matched in bands, so exact age / birth year can't be inferred. |
| H3 | No browser security headers (no CSP, framing allowed, no `nosniff`) | Vercel (high/medium/low), Next.js (low) | **Partly fixed** — `next.config.ts` now sends `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()` and `Content-Security-Policy: frame-ancestors 'none'; object-src 'none'; base-uri 'self'`. A full CSP with `script-src` → follow-up (nonces break prerendering; needs SRI). |

### Medium
| # | Finding | Status |
|---|---|---|
| M1 | The shared demo login can be abused: password / email change (locks graders out), profile text, its AI quota | **Partly fixed** — `public.reset_demo_ai_quota()` (no parameter, only the `is_protected` account, service role only); `scripts/reset-demo-account.mjs` now resets password, profile, plan **and** AI counters. Side effect: clearing the demo's counters also frees those slots under the site-wide 1,000/day ceiling (same table) — minor and manual. **Accepted** otherwise (public demo): reset + sign out demo sessions before grading (checklist). |
| M2 | Every signed-in user could read every profile row, including half-finished sign-ups | **Fixed** — policy "read own or onboarded" (`1bcf7c4`). |
| M3 | `consume_ai_quota` can be called directly to use up slots without AI calls; ~15 throwaway accounts could exhaust the 1,000/day site ceiling; deleting an account resets personal limits | **Accepted** (graceful fallback to manual forms / rule-based reasons) → follow-up: consume quota only inside server-side AI paths. |
| M4 | Preview and production share one database and the OpenRouter key | **Accepted** (documented in CLAUDE.md; previews are protected). Optional: separate OpenRouter key for Preview. |
| M5 | The 18+ birth-year check only applies to email sign-up | **Accepted** — only Email is enabled (checklist). |
| M6 | The published demo login was a `+` alias of the owner's personal email (README, a committed migration) | **Fixed** — moved to the dedicated `demo@dazi-demo.invalid` (`20261019191240_move_demo_login.sql`); the old account is deleted (`20261019191241_delete_old_demo_login.sql`). The old address remains in an applied migration and in git history (history is not rewritten). The owner's personal email stays on `/privacy` on purpose, as the GDPR contact. |

### Low
| # | Finding | Status |
|---|---|---|
| L1 | `save_my_match_reasons` accepted any array size and re-ran matching per item | **Fixed** — max 10 items, matches computed once (`1bcf7c4`). |
| L2 | Calling `publish_post` directly with a hand-made embedding can lift a user in **other** users' rankings too (our docs said "own ranking only") | **Documented** (corrected here and in SPEC); follow-up. |
| L3 | `GET /auth/signout` can be triggered by a link on another site (sign-out nuisance) | Accepted → follow-up. |
| L4 | Demo password public in README and git history | Accepted by design → rotate after grading. |
| L5 | `Access-Control-Allow-Origin: *` on HTML (Vercel default, no credentials) | No action. |
| L6 | `private` schema has client USAGE grants — safe only while not exposed | **Verified** — requests with `Accept-Profile: private` are rejected ("Invalid schema"). |
| L7 | Access tokens stay valid until expiry after account deletion (then match no rows) | Accepted; keep JWT expiry short. |
| L8 | Structure: no single data-access layer, `process.env` outside `lib/`, unused `lib/supabase/client.ts`; eval script could leave flagged test users after a crash | Follow-up. |

## Verification — RLS script: **118/118 pass, 0 skipped** (phase 8, 21 Oct; +1: anon cannot take a speech slot)
`node --env-file=.env.local scripts/rls-check.mjs` (two test accounts + temporary users created and deleted with the service role key). New for this audit, each passing for the intended reason:
- A can still update own bio; hobbies `["Chess Elo 1850", "10000 steps"]` save (lists checked per item); the database refuses a phone number in the bio, an email in the display name and a phone number inside one hobby item ("Contact details are not allowed in profiles").
- A real sign-up still creates its profile row; a sign-up with contact details in the name is refused by the database.
- A cannot read a profile that hasn't finished onboarding — and can once it is onboarded (positive control).
- Requests to the `private` schema are rejected (signed out and signed in).
- `reset_demo_ai_quota` refused for signed-in and signed-out callers ("permission denied for function").
- `save_my_match_reasons` refuses more than 10 items.
- Phase 7a (languages are free text, migration `20261020143000_languages_custom.sql`): the old "unknown language" check is replaced by: a 31-character language and 11 languages are refused (`profiles_languages_check`), an email in languages is refused ("Contact details are not allowed in profiles"), and a custom language ("Klingon") is accepted (positive control, restored afterwards).

- Phase 7b-1 (invites, messages, blocks — migrations `20261020160000_messaging.sql` + `20261020170000_messaging_review_fixes.sql`), 30 checks with temporary users only: inviting only people in my matches (positive control: the invitee is in `match_my_post`), contact details refused in notes, no messages before acceptance, outsiders read 0 invites / messages and can't write (participants can), no re-invite after a decline, mutual invites auto-accept, the 31st message in an hour refused, block hides both ways + cancels pending invites + closes the chat, the shared demo login (stand-in with `is_protected`) can't invite / be invited by / accept from / message a real user (and can invite a demo profile), anon can't read the three tables or call any of the seven functions ("permission denied"), and `delete_my_account` removes the user's invites, messages and blocks.
- **Accepted risk (7b-1):** preview and production share one database, so the messaging RPCs are callable through the Data API even while the production UI is off (`MESSAGING_ENABLED` unset). Every rule (matches only, limits, demo isolation, blocks) is enforced in SQL, so this only means a user could use the feature without the UI.

## Phase 8 — speech input (21 Oct 2026, personal repo only)
ElevenLabs Scribe v2 (`scribe_v2`, batch) fills the plan textarea from a ≤ 45 s recording. Migration `20261021120000_speech_quota.sql`, check `supabase/checks/phase8_speech_quota_check.sql`.
- **Key:** `ELEVENLABS_API_KEY` is server-only (read in `lib/speech/elevenlabs.ts`, `import "server-only"`); `tests/speech-env.test.mjs` fails if it, `SPEECH_ENABLED` or `SPEECH_UNTIL` is `NEXT_PUBLIC_` or read anywhere else.
- **Kill switch + retirement:** `lib/speech/flag.ts` — on only if `SPEECH_ENABLED === "true"` **and** today (Berlin) ≤ `SPEECH_UNTIL`; missing / invalid date = off. Off hides the mic and the route answers 404.
- **Route `POST /api/speech`**, in this order: kill switch → signed in (`getClaims`, else 401) → size ≤ 2 MB (Content-Length first, then the file) → type `audio/webm` or `audio/mp4` **and** matching magic bytes (else 415) → `consume_ai_quota('speech')` → ElevenLabs. A refused upload never costs a slot.
- **Quota (DB-enforced):** 10 per user, 100 site-wide per rolling 24 h; speech also counts towards the 1,000/day ceiling. Other kinds unchanged (proved by part C of the check file).
- **Audio:** kept in memory for the request only, never written to storage or logs; logs show HTTP status codes only, never audio or text. The transcript goes into the textarea and then through the unchanged pipeline (contact stripping, `posts_guard`).
- **Accepted:** like M3, `consume_ai_quota('speech')` can be called directly, so ~10 accounts could use up the 100/day speech ceiling — that only switches voice input off for the day (typing still works), it costs nothing. ElevenLabs may process audio outside the EU and keeps it under its own policy (zero retention is enterprise-only) — stated on `/privacy`.
- **Dashboard:** `ELEVENLABS_API_KEY` (Sensitive), `SPEECH_ENABLED`, `SPEECH_UNTIL` on **Preview only** until the director turns Production on.

## Follow-ups (after the capstone)
Full CSP with `script-src` (SRI) · rate-limit preference changes / matching (H2) · quota consumed only inside server-side AI paths (M3) · separate OpenRouter key per environment (M4) · rate-limit `publish_post`, POST-only sign-out (L2, L3) · single data-access layer, remove unused files (L8) · re-run `/security-audit` after part F (invites + messages).

## Dashboard checklist (not verifiable from the repository)
**Supabase**
- [ ] Authentication → Providers: only **Email** enabled (no anonymous, phone or OAuth sign-ins).
- [ ] Authentication → Email: **Secure email change** on; email confirmation required.
- [ ] Authentication → Sessions: short JWT expiry (e.g. 1 hour).
- [ ] Data API → Exposed schemas: `public` (and `graphql_public`) only — **not** `private`.
- [ ] Advisors → Security Advisor: no warnings.
- [ ] Before grading: run `scripts/reset-demo-account.mjs`, then in the SQL Editor `delete from auth.sessions where user_id = (select id from public.profiles where is_protected);`

**Vercel**
- [ ] Environment Variables: `OPENROUTER_API_KEY`, `DEMO_EMAIL`, `DEMO_PASSWORD` marked **Sensitive** (Production + Preview); `ELEVENLABS_API_KEY` **Sensitive** (Preview; Production only once speech is switched on there); `SUPABASE_SERVICE_ROLE_KEY` **absent** from every environment.
- [ ] Deployment Protection: Standard Protection on; no unused Shareable Links.

**OpenRouter**
- [ ] If the school allows it: a separate key for Preview / local development.
