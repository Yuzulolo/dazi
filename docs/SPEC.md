# Dazi — Find Your Travel & Food Buddy (Capstone Spec v0.7)

> "Dazi" (搭子) = a casual companion for a specific activity. Code folder / repo name: `dazi`.
> Platform: responsive **web app** (Next.js + Supabase + Vercel). Demo city: **Berlin** (data model supports any city).
> **User flows, states, rules and edge cases live in `docs/FLOWS.md`** — read both files before each phase.

## ⏱️ 0. CAPSTONE SCOPE — deadline 20 Oct 2026 (morning) (this section overrides everything below)
Sections 1–10 describe the **full product vision**. For the capstone we build only the scope below. Everything else is **Roadmap** (§0.4) — do not build it unless I ask.

### 0.1 Demo story (what must work end-to-end)
Guest types one sentence on the homepage → AI trip card → 5 anonymised similar buddies with AI reasons → sign up → onboarding (profile + travel style) → recommendations get more precise → send invite → other person accepts → simple message thread.

### 0.2 In scope
| # | Feature | Notes |
|---|---|---|
| A | Email auth + 18+ + `profiles` + RLS + Vercel | ✅ **Done** (PR #1, live). **No Google login.** |
| B | Onboarding & profile | ✅ **Done** (phase 2 PR). Display name, birth year, gender (optional), languages, home city, bio, **cities visited**, **hobbies**, matching prefs (age range, gender pref), **travel style quiz** (pace, day rhythm, interests). Profile page = these fields only. **No avatar upload, no stories, no photos.** |
| C | Intent post | ✅ **Done** (phase 3 PR). One sentence → AI extraction → editable card → save. Max 1 active post. **Covers = the 4 poster tones** (lavender / forest / mint / pink, `docs/DESIGN.md`): AI suggests a tone from the trip's mood, the user can change it — no cover images, no upload, no vision AI. The AI extraction also returns a **two-line poster headline** (`headline: [line1, line2]`, each ≤ ~22 characters ending with a full stop, e.g. "Flea markets." / "Good coffee."), editable on the card and shown on the posters. Edit allowed; changing city/dates expires pending invites and ends accepted ones (FLOWS 2.6) — **no monthly limit**. |
| D | Matching | Hard filters (§5 step 1) + `score = 0.4 × trip + 0.35 × style + 0.25 × personality`. Personality embedding = bio + hobbies + cities visited (no stories). AI reason for top 5. Seed 30 demo users. **The seed script must always set `birth_year` (and `display_name`) in the user metadata** — the sign-up trigger refuses any email user without a birth year. **Gender "other" (decided in D):** it can't be picked as a preference, so — like "no gender" — those users are visible only to people without a gender preference (mutual rule, `private.match_candidates`). **Privacy trade-off (accepted):** a user with a gender preference only ever sees people of that gender, so gender is implicitly revealed to them; inherent to preference filtering. ✅ **Done** (phase 4 PR): personality embeddings, `match_my_post()` (the only way others' posts are shown), cached batched AI reasons, `/home` "For you", 30 demo users (`is_demo`, badge). |
| E | Homepage guest search | Anonymised server-side, trip-only ranking, rate limit per IP, search carries over after sign-up. |
| F | Invites + messages | Invite (optional note), accept / decline / expire, max 10 pending, mutual invites auto-accept. After acceptance: **simple message thread, no realtime** (refresh to see new messages). |
| G | Safety & compliance | ✅ **Partly done** (phase 5 PR): delete my data (`/settings`), `/privacy`, AI labels audited; block & report still open.  Block, report, safety tips page, AI-generated labels, **Delete my data**, privacy page. |
| H | Delivery | Design applied to homepage + cards (half a day max), `/security-scan`, README (live URL + demo login), evaluation (extraction + match quality + RLS), presentation. |

### 0.3 Build order (one branch + PR each)
| Day | Work |
|---|---|
| 15 Oct | ✅ Phase 1 (A): RLS test, deploy, PR review + merge |
| 16 Oct | ✅ B (onboarding/profile): RLS test, browser test, PR review |
| 17 Oct | Design foundation (`docs/DESIGN.md`) + C (posting + AI extraction + embeddings) |
| 18 Oct | D (matching, **30 realistic seed users**) + E (guest search) |
| 19 Oct | F (invites + messages) + G (safety/compliance) + **user testing with 3–5 classmates** |
| 20 Oct (morning) | Polish pass (incl. 320/768px checks) + H: `/security-scan`, README, evaluation, showcase, presentation |

**Rule: quality over quantity.** The core flow (A–F) must work end-to-end and be polished. There is no stretch feature in the capstone (dropped 17 Oct).

### 0.4 Roadmap (not in capstone — mention in "What's next")
Google login · avatar & travel stories with photos · **trip photo upload with a vision-AI check + mood description used in matching** (FLOWS 2.7; was stretch, dropped from the capstone 17 Oct — must follow all storage rules: own `{user_id}/` folder, EXIF/GPS stripped, server-side AI call) · Facebook verification + mutual social reveal · after-meeting feedback (safety check + positive tags) · group activities · match-break limit (2 per 30 days) · realtime chat · email notifications · **overlap length in the match score** (longer shared stays rank higher; today dates are a pass/fail filter).

### 0.4b Follow-ups from the PR #6 review (after the capstone)
- Preferred age as **band dropdowns** in the profile form (matching already uses bands).
- Save match reasons without re-running matching per item (S1); retry a failed profile embedding when the text is unchanged (S4); `--limit` / dry run for the seed and backfill scripts (S5).
- Card headlines as `h3` under "For you" (S10); remove the unused total score and a redundant `connection()` (S12).
- Secrets test across the whole repo (S13); RLS positive control that respects A's own gender preference (S14); de-duplicate the 18-column match type (S15).
- Hard-filter fixtures for "self", "ended trip" and "archived post" (S16).
- Overlap length as a score factor (from the matching eval).
- **From the PR #7 review:** ask for the password again before deleting an account (today typing DELETE is the only barrier); small clean-ups (unused `describeModel().name`, the embedding notice duplicated in onboarding and `/me/edit`, `shift()` duplicated in two scripts); a script-free way to sign out demo sessions.

### 0.5 Stretch
None — the former stretch feature (trip photo + vision AI) moved to §0.4 Roadmap on 17 Oct.

## 1. Problem (SCR)
- **Situation:** More and more people travel solo or live in a new city, and look for a "buddy" to explore, eat or sightsee with.
- **Complication:** Today they post in scattered places (Xiaohongshu, Reddit, Facebook groups). Posts are unstructured, scrolling takes a long time, most get no reply, and meeting strangers feels unsafe.
- **Resolution:** Type one sentence on the homepage → AI understands where/when/what you want → instantly see similar travellers (anonymised until you sign up), matched on plans, travel style **and** aesthetic. Contact opens only after both sides say yes; socials are revealed only by mutual exchange.

## 2. Users
- **Traveller:** "I'm in Berlin 20–25 Oct, want street food and flea markets."
- **Local / resident:** "I live in Berlin, happy to grab dinner or show a flea market at weekends."
- All registered users must be **18+**. Guests can search but cannot contact anyone.
- **Birth year is required before using any feature.** Email sign-up asks for it (strict rule: birth year ≤ current year − 19). Google sign-up (Roadmap) would have no birth year → the user is sent to `/onboarding` to enter it first (FLOWS 2.0).

## 3. Core concepts
| Concept | What it is |
|---|---|
| **Guest search** | Homepage input → AI trip card → top 5 anonymised matches. No account needed. |
| **Profile** | Travel identity: age range, languages, travel style, hobbies, cities visited, stories with photos, verification badges, feedback tags |
| **Intent post** (main) | 1-to-1 buddy search for a date range, with one trip photo. **Max 1 active per user.** |
| **Activity** (group, 3+) | A specific plan others can join *(should have)* |

## 4. MVP features — prioritised
**Must have**
1. **Homepage guest search:** one input → AI trip card (editable) → top 5 matches, **anonymised server-side** (initial only, placeholder avatar, age range, interest chips, overlapping dates, AI reason). Rate-limited per IP.
2. **Sign up / sign in** (email + Google) triggered by "Connect" or opening a profile. 18+ confirmation. Guest search carries over into the first post.
3. **Onboarding (required):** basics (name, birth year, gender optional, languages, home city, avatar) + **travel style quiz**:
   - Pace 1–5 ("Every hour planned" ↔ "Go with the flow")
   - Day rhythm: early bird / flexible / night owl
   - Travel interests (fixed list): museums & galleries, history & architecture, nature & hiking, theme parks, food & markets, cafés, nightlife & bars, shopping, photography, local life & hidden spots, sports & outdoor, festivals & concerts
   - Hobbies: free tags
4. **Profile page:** all of the above + cities visited + travel stories (up to 3 photos each, one marked "best") + badges + feedback tags. Visible to signed-in users only.
5. **Intent post:** one sentence → AI card → optional trip photo (vision-checked, mood description) or preset cover → save. Fully editable; changing city/dates ends existing matches (see FLOWS 2.6). **Max 2 match breaks per rolling 30 days**, enforced server-side (FLOWS 2.6b).
6. **"For you" recommendations:** top 5 with AI reason; hard filters + weighted ranking (§5). No-match state with AI widening suggestion.
7. **Invites (1-to-1):** optional note with AI-suggested icebreaker → accept / decline → private chat. Max 10 pending outgoing. Mutual invites auto-accept.
8. **Social verification & reveal:** Facebook OAuth link → "Facebook verified" badge; Instagram handle self-added. Socials revealed only via **mutual exchange** in chat.
9. **After-meeting feedback:** private safety check + public positive tags, double-blind (FLOWS 2.8).
10. **Safety:** block, report (auto-blocks), safety tips, no exact locations/contact details, EXIF/GPS stripped.
11. **Compliance:** "AI-generated" labels, "Delete my data" (rows + photos + messages), privacy page.

**Should have** (if time allows)
12. **Group activities:** host creates an activity → others request → host approves → group chat.

**Out of scope (→ "What's next")**: payments, push/email notifications, native mobile app, ID verification, star ratings / public reviews, likes/comments on stories, maps, LinkedIn.

## 5. Matching design
**Step 1 — Hard filters (SQL):**
- Same city, overlapping dates, post active
- At least one shared language
- **Mutual** age preference · **mutual** gender preference (if set)
- Not blocked (either direction), not yourself, not paused for safety

**Step 2 — Soft ranking:**
- `score = 0.4 × trip + 0.35 × style + 0.25 × personality`
  - **trip** — pgvector similarity of posts (interests, vibe, budget **+ photo mood description**)
  - **style** — structured, plain SQL: pace `1 − |a−b|/4`, interests Jaccard overlap, day rhythm (same 1 / one flexible 0.5 / opposite 0); average of the three
  - **personality** — pgvector similarity of profile embeddings (bio + hobbies + cities visited + stories)
- Weights are a starting point; tune during evaluation.

**Guests:** only city + dates + **trip** similarity (no profile yet). After onboarding, full scoring recalculates.

**Step 3 — AI reason (top 5 only)**, labelled "AI-generated".

## 6. Data model (Supabase, RLS on every table)
| Table | Key fields | Who can do what (RLS) |
|---|---|---|
| `profiles` | id (= auth user), display_name, birth_year, gender?, languages[], bio, home_city, visited_cities[], avatar_path, pref_age_min/max, pref_gender?, travel_pace, day_rhythm, travel_interests[], hobbies[], instagram_handle?, safety_paused, profile_embedding | Signed-in users read **public columns only** (via a view; never `instagram_handle`); owner updates |
| `stories` | id, user_id, title, city, body, is_best | Signed-in read; owner writes |
| `story_photos` | id, story_id, user_id, storage_path | Signed-in read; owner writes |
| `posts` | id, user_id, raw_text (contact details stripped), city, start_date, end_date, interests[] (1–5 of the 12 fixed values), budget (low/medium/high/null), vibe, headline text[2] (≤ 22 chars each), tone (lavender/forest/mint/pink), ai_assisted, embedding vector(1536), status (active/closed/archived) — photo columns come with the Roadmap trip photo | **Owner-only reads** (no other user, no guest can query posts); owner may delete own posts. **No direct INSERT/UPDATE:** the only write paths are `publish_post()` (archives the old active post — **max 1 active**, partial unique index) and `update_post()`, both security definer and pinned to `auth.uid()`. A trigger (`posts_guard`) makes the database itself reject phone numbers/emails in text fields, past start dates for new posts, moving an edited start date earlier, and any status change other than active → closed/archived. **Known, accepted gaps:** a user calling these functions directly could send an embedding that doesn't match their text (only affects their own ranking), and `ai_assisted` is set by the client (only labels their own post). The embedding column is readable by nobody through the API. Other users' posts — in matches **and** on `/u/[id]` — only come from the part D server-side matching function, which applies every hard filter (incl. mutual age/gender preferences, blocks) and returns only the fields needed. Guests: anonymised fields from the server only (part E) |
| `invites` | id, from_user, to_user, from_post, to_post, status (pending/accepted/declined/expired/cancelled/ended_trip_changed), note, ai_reason | Only participants read; sender creates/cancels; receiver accepts/declines |
| `messages` | id, invite_id, sender_id, body | Participants of an accepted invite only |
| `social_reveals` | invite_id, requester_id, status (requested/shared/declined) | Participants only; socials returned by a server function only when `shared` |
| `feedback` | id, invite_id, from_user, to_user, met (yes/no/no_show), felt_safe (yes/somewhat/no), tags[], submitted_at | Author inserts; nobody reads raw rows from the client. Public tag counts via a view that applies double-blind rules |
| `blocks` | blocker_id, blocked_id | Owner only |
| `reports` | reporter_id, reported_user_id, reason | Reporter inserts; admin via dashboard |
| `guest_search_log` | ip_hash, created_at | No client access (server-only, for rate limiting) |
| `private.ai_calls` | user_id, kind (extract/embed), created_at | Unexposed schema, no client access. `consume_ai_quota()` allows per user **20 AI drafts + 20 saves (embeddings) per rolling 24 h**, and **1,000 AI calls per 24 h site-wide** (the school OpenRouter key has no spending limit) |
| `match_breaks` | id, user_id, post_id, created_at | Owner can read own count; inserted only by the server when an accepted match is ended |
| `activities`, `activity_members` *(should)* | see v0.4 | Host / members |

**Storage:** bucket `photos`, files under `{user_id}/…`; owner upload/delete only; signed-in users can view; preset covers in a public folder.
**Data minimisation:** birth year only; age shown as range; gender optional; guests not stored.

## 7. AI flow (all calls server-side, via OpenRouter)
1. **Extract:** sentence → chat model (`google/gemini-2.5-flash-lite`, fallback `openai/gpt-4.1-nano` — the school key's guardrail blocks Claude models) with a strict JSON schema → city, dates, interests, budget, vibe, two-line headline, tone. Contact details are stripped **before** the call; user text wrapped as data (prompt-injection safe); output validated on the server, manual form on any failure. Eval: `evals/extraction.json`.
2. **Vision check + mood:** uploaded trip photo → vision model → `{allowed, reason, mood}`.
3. **Embed:** post text (+ mood) and profile text → `openai/text-embedding-3-small` (1536 dims), same model at query time.
4. **Match:** SQL function = hard filters + weighted score → top 10.
5. **Explain:** chat model writes reasons for the top 5; also icebreaker suggestions for invites.

## 8. Evaluation plan (SMART)
- **Seed data:** 30 demo users in Berlin with profiles, stories, posts and photos (clearly marked demo).
- **Extraction:** 20 test sentences → ≥ 90% fields correct.
- **Vision check:** 15 test photos (fine / contact details / inappropriate) → ≥ 13/15 correct decisions.
- **Hard filters:** 10 crafted cases → 10/10 correctly excluded.
- **Match quality:** 10 test users with a hand-picked best buddy → in top 3 for ≥ 8/10. Compare trip-only → +style → +personality. **Result (19 Oct):** 9/9 scored cases hit at all three weightings (1 case not scored: pool of 2) — target met, ablation inconclusive (test set too easy); hard filters 10/10. Details: `evals/MATCHING-RESULTS.md`.
- **Security:** two-account tests (no reading others' invites/messages/socials/feedback, no uploading to others' folders); guest response contains **no** names/avatars (check network tab); incognito test on live URL; `/security-scan` clean.

## 9. Course requirements checklist
- [x] `README.md` with **live Vercel URL at the top** + demo login for reviewers
- [x] `README.md` with goal / problem / how it works
- [ ] `CLAUDE.md` updated at the end to match the finished app
- [x] At least one skill, slash command or subagent (e.g. `/seed-demo`, RLS-check subagent)
- [x] At least one PR reviewed before merge (one PR per phase)
- [x] Secrets server-side only, not in repo
- [ ] RLS on every user-data table + storage policies
- [ ] `/security-scan` pass
- [ ] AI disclosure (EU AI Act Art. 50) + working "Delete my data" (GDPR)
- [x] Live on Vercel

## 10. Build phases (one branch + PR each)
1. ✅ **Scaffold & auth:** Supabase, sign-in (email + Google), 18+ check, `profiles` + RLS, deploy to Vercel, live URL in README
   - Google login → **Roadmap** (§0.4). If added later: users with `birth_year = null` are redirected to `/onboarding` (server-side, FLOWS 2.0); the gate code already exists
   - 🎨 **Design checkpoint (before phase 2):** visual design made with GPT → saved as `docs/DESIGN.md` + reference images. Phase 1 stays unstyled.
2. **Onboarding & profile:** basics, travel style quiz, profile page, stories + photos (Storage + policies)
   - Every insert/update RLS policy on feature tables requires the user's `profiles.birth_year is not null` (FLOWS 2.0)
3. **Posting:** one-sentence input → AI extraction → trip photo (vision check + mood) or preset cover → save; edit rules
4. **Matching:** embeddings, match function, "For you" with AI reasons, seed data, **homepage guest search** (anonymised + rate limit)
5. **Connecting:** invites, chat, block/report, social verification & mutual reveal
6. **Feedback:** after-meeting check + positive tags (double-blind)
7. **Group activities** *(should — cut if short on time)*
8. **Hardening & launch:** delete-my-data, AI labels, safety/privacy pages, `/security-scan`, README, evaluation, presentation
