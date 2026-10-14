# Dazi — Find Your Travel & Food Buddy (Capstone Spec v0.6)

> "Dazi" (搭子) = a casual companion for a specific activity. Code folder / repo name: `dazi`.
> Platform: responsive **web app** (Next.js + Supabase + Vercel). Demo city: **Berlin** (data model supports any city).
> **User flows, states, rules and edge cases live in `docs/FLOWS.md`** — read both files before each phase.

## 1. Problem (SCR)
- **Situation:** More and more people travel solo or live in a new city, and look for a "buddy" to explore, eat or sightsee with.
- **Complication:** Today they post in scattered places (Xiaohongshu, Reddit, Facebook groups). Posts are unstructured, scrolling takes a long time, most get no reply, and meeting strangers feels unsafe.
- **Resolution:** Type one sentence on the homepage → AI understands where/when/what you want → instantly see similar travellers (anonymised until you sign up), matched on plans, travel style **and** aesthetic. Contact opens only after both sides say yes; socials are revealed only by mutual exchange.

## 2. Users
- **Traveller:** "I'm in Berlin 20–25 Oct, want street food and flea markets."
- **Local / resident:** "I live in Berlin, happy to grab dinner or show a flea market at weekends."
- All registered users must be **18+**. Guests can search but cannot contact anyone.

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
| `posts` | id, user_id, raw_text, city, start_date, end_date, interests[], budget, vibe, photo_path?, preset_cover?, photo_mood?, embedding vector(1536), status (active/closed/archived) | Signed-in read active posts (not blocked); owner writes. **Max 1 active** (partial unique index). Guests: no direct access — server function returns anonymised fields only |
| `invites` | id, from_user, to_user, from_post, to_post, status (pending/accepted/declined/expired/cancelled/ended_trip_changed), note, ai_reason | Only participants read; sender creates/cancels; receiver accepts/declines |
| `messages` | id, invite_id, sender_id, body | Participants of an accepted invite only |
| `social_reveals` | invite_id, requester_id, status (requested/shared/declined) | Participants only; socials returned by a server function only when `shared` |
| `feedback` | id, invite_id, from_user, to_user, met (yes/no/no_show), felt_safe (yes/somewhat/no), tags[], submitted_at | Author inserts; nobody reads raw rows from the client. Public tag counts via a view that applies double-blind rules |
| `blocks` | blocker_id, blocked_id | Owner only |
| `reports` | reporter_id, reported_user_id, reason | Reporter inserts; admin via dashboard |
| `guest_search_log` | ip_hash, created_at | No client access (server-only, for rate limiting) |
| `match_breaks` | id, user_id, post_id, created_at | Owner can read own count; inserted only by the server when an accepted match is ended |
| `activities`, `activity_members` *(should)* | see v0.4 | Host / members |

**Storage:** bucket `photos`, files under `{user_id}/…`; owner upload/delete only; signed-in users can view; preset covers in a public folder.
**Data minimisation:** birth year only; age shown as range; gender optional; guests not stored.

## 7. AI flow (all calls server-side, via OpenRouter)
1. **Extract:** sentence → chat model → JSON (city, dates, interests…); strips contact details; user text wrapped as data (prompt-injection safe).
2. **Vision check + mood:** uploaded trip photo → vision model → `{allowed, reason, mood}`.
3. **Embed:** post text (+ mood) and profile text → `openai/text-embedding-3-small` (1536 dims), same model at query time.
4. **Match:** SQL function = hard filters + weighted score → top 10.
5. **Explain:** chat model writes reasons for the top 5; also icebreaker suggestions for invites.

## 8. Evaluation plan (SMART)
- **Seed data:** 30 demo users in Berlin with profiles, stories, posts and photos (clearly marked demo).
- **Extraction:** 20 test sentences → ≥ 90% fields correct.
- **Vision check:** 15 test photos (fine / contact details / inappropriate) → ≥ 13/15 correct decisions.
- **Hard filters:** 10 crafted cases → 10/10 correctly excluded.
- **Match quality:** 10 test users with a hand-picked best buddy → in top 3 for ≥ 8/10. Compare trip-only → +style → +personality.
- **Security:** two-account tests (no reading others' invites/messages/socials/feedback, no uploading to others' folders); guest response contains **no** names/avatars (check network tab); incognito test on live URL; `/security-scan` clean.

## 9. Course requirements checklist
- [ ] `README.md` with **live Vercel URL at the top** + demo login for reviewers
- [ ] `README.md` with goal / problem / how it works
- [ ] `CLAUDE.md` updated at the end to match the finished app
- [ ] At least one skill, slash command or subagent (e.g. `/seed-demo`, RLS-check subagent)
- [ ] At least one PR reviewed before merge (one PR per phase)
- [ ] Secrets server-side only, not in repo
- [ ] RLS on every user-data table + storage policies
- [ ] `/security-scan` pass
- [ ] AI disclosure (EU AI Act Art. 50) + working "Delete my data" (GDPR)
- [ ] Live on Vercel

## 10. Build phases (one branch + PR each)
1. **Scaffold & auth:** Supabase, sign-in (email + Google), 18+ check, `profiles` + RLS, deploy to Vercel, live URL in README
   - 🎨 **Design checkpoint (before phase 2):** visual design made with GPT → saved as `docs/DESIGN.md` + reference images. Phase 1 stays unstyled.
2. **Onboarding & profile:** basics, travel style quiz, profile page, stories + photos (Storage + policies)
3. **Posting:** one-sentence input → AI extraction → trip photo (vision check + mood) or preset cover → save; edit rules
4. **Matching:** embeddings, match function, "For you" with AI reasons, seed data, **homepage guest search** (anonymised + rate limit)
5. **Connecting:** invites, chat, block/report, social verification & mutual reveal
6. **Feedback:** after-meeting check + positive tags (double-blind)
7. **Group activities** *(should — cut if short on time)*
8. **Hardening & launch:** delete-my-data, AI labels, safety/privacy pages, `/security-scan`, README, evaluation, presentation
