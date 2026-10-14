# Dazi — Find Your Travel & Food Buddy (Capstone Spec v0.4)

> "Dazi" (搭子) = a casual companion for a specific activity. Code folder / repo name: `dazi`.
> Platform: responsive **web app** (Next.js + Supabase + Vercel). Demo city: **Berlin** (data model supports any city).

## 1. Problem (SCR)
- **Situation:** More and more people travel solo or live in a new city, and look for a "buddy" to explore, eat or sightsee with.
- **Complication:** Today they post in scattered places (Xiaohongshu, Reddit, Facebook groups). Posts are unstructured, scrolling through them takes a long time, most get no reply, and meeting strangers feels unsafe.
- **Resolution:** Write one sentence → AI understands where/when/what you want → AI proactively recommends compatible buddies (matched on plans **and** travel personality), with a reason. No scrolling. Contact opens only after **both** sides say yes.

## 2. Users
- **Traveller:** "I'm in Berlin 20–25 Oct, want street food and flea markets."
- **Local / resident:** "I live in Berlin, happy to grab dinner or show a flea market at weekends."
- All users must be **18+**.

## 3. Core concepts
| Concept | What it is | Example |
|---|---|---|
| **Profile** | Your travel identity: age, languages, cities visited, travel stories with photos | "Visited 23 cities · Best story: getting lost in Hanoi night market" |
| **Intent post** (main) | 1-to-1 buddy search for a date range | "Berlin 20–25 Oct, street food + flea markets, slow pace" |
| **Activity** (group, 3+ people) | A specific plan others can join | "Sat 19:00 Korean BBQ in Kreuzberg, 4 spots" |

## 4. MVP features — prioritised
**Must have**
1. Sign up / sign in (email + Google), age confirmation (18+). Signed-out visitors see only the landing page.
2. **Profile page:** display name, age (shown as a range, e.g. 25–29), gender (optional), languages, short bio, avatar, **cities visited**, matching preferences (age range, gender preference).
2b. **Travel style quiz** (quick taps at onboarding, editable later):
   - **Pace:** 1–5 slider, "Every hour planned" ↔ "Go with the flow"
   - **Day rhythm:** early bird / flexible / night owl
   - **Travel interests** (pick any, fixed list): museums & galleries, history & architecture, nature & hiking, theme parks, food & markets, cafés, nightlife & bars, shopping, photography, local life & hidden spots, sports & outdoor activities, festivals & concerts
   - **Hobbies:** free tags (e.g. "film photography", "bouldering", "board games")
   - Optional AI helper: suggest interests/hobbies from the user's stories; user confirms.
3. **Travel stories:** write stories (title, city, text) with up to 3 photos; mark one as "best story". Shown on your profile.
4. **Intent post in one sentence** → AI extracts a structured card (city, dates, interests, budget, vibe). User reviews/edits before saving.
5. **"For you" recommendations (AI-first, no scrolling):** top 5 buddies with an AI-written reason. A small "see all in Berlin" list exists only as a fallback when there are few matches.
6. **Invite (1-to-1)** → accept / decline → private chat opens.
7. **Safety:** block, report, safety tips, no exact locations or contact details, EXIF/GPS stripped from photos.
8. **Compliance:** "AI-generated" labels, "Delete my data" (rows + photos), privacy note.

**Should have** (build if time allows)
9. **Group activities:** host creates an activity (time, place area, max people) → others request to join → host approves → group chat. Activities also appear in "For you".

**Out of scope (→ "What's next")**: payments, push notifications, native mobile app, ID verification, ratings/reviews, likes/comments on stories, maps.

## 5. Matching design
**Step 1 — Hard filters (all must pass, checked in SQL):**
- Same city, overlapping dates
- At least one shared language
- **Mutual** age preference (each person is inside the other's preferred range)
- **Mutual** gender preference (if set)
- Not blocked (either direction), not yourself, post still active

**Step 2 — Soft ranking (three parts):**
- `score = 0.4 × trip + 0.35 × style + 0.25 × personality`
  - **trip** — pgvector similarity of the two posts (interests, vibe, budget of *this* trip)
  - **style** — structured travel-style compatibility (plain SQL, no AI):
    - pace: `1 − |paceA − paceB| / 4`
    - interests overlap: shared ÷ combined (Jaccard)
    - day rhythm: same = 1, one is "flexible" = 0.5, opposite = 0
    - style = average of the three
  - **personality** — pgvector similarity of profile embeddings (bio + hobbies + cities visited + stories)
- Weights are a starting point; tune them during evaluation.

**Step 3 — AI reason (top 5 only):** a chat model writes 1–2 sentences using posts, travel style and stories, e.g. *"You're both in Berlin on 22 Oct, both go-with-the-flow night owls who love food markets, and you've both backpacked Southeast Asia."* Labelled "AI-generated".

## 6. Data model (Supabase, RLS on every table)
| Table | Key fields | Who can do what (RLS) |
|---|---|---|
| `profiles` | id (= auth user), display_name, birth_year, gender?, languages[], bio, home_city, visited_cities[], avatar_path, pref_age_min, pref_age_max, pref_gender?, travel_pace (1–5), day_rhythm, travel_interests[], hobbies[], profile_embedding | Signed-in users read public fields; owner updates |
| `stories` | id, user_id, title, city, body, is_best, created_at | Signed-in users read; owner creates/edits/deletes |
| `story_photos` | id, story_id, user_id, storage_path | Signed-in users read; owner creates/deletes |
| `posts` | id, user_id, raw_text, city, start_date, end_date, interests[], budget, vibe, embedding vector(1536), status | Signed-in users read active posts (not from blocked users); owner creates/edits/deletes |
| `invites` | id, from_user, to_user, from_post, to_post, status, ai_reason | Only the two participants read; sender creates; receiver changes status |
| `activities` *(should)* | id, host_id, title, city, starts_at, area, max_people, description, embedding, status | Signed-in users read; host creates/edits/deletes |
| `activity_members` *(should)* | activity_id, user_id, status (requested/approved) | Host + that member read; user requests; host approves |
| `messages` | id, invite_id?, activity_id?, sender_id, body | Only participants of an **accepted** invite or **approved** activity members read/write |
| `blocks` | blocker_id, blocked_id | Owner only |
| `reports` | reporter_id, reported_user_id, reason | Reporter inserts; nobody else reads (admin via dashboard) |

**Storage:** bucket `photos`, files under `{user_id}/…`. Only the owner can upload/delete in their folder; signed-in users can view. EXIF/GPS removed before upload.

**Data minimisation:** store birth year, not full birthday; show age as a range; gender optional.

## 7. AI flow (all calls server-side, via OpenRouter)
1. **Extract:** sentence → chat model returns JSON (city, dates, interests…); strips phone numbers / emails.
2. **Embed:** post text → `openai/text-embedding-3-small` → `posts.embedding`. Profile + stories → `profiles.profile_embedding` (re-embedded when profile or stories change). Same model at query time.
3. **Match:** SQL function `match_posts(post_id)` = hard filters + weighted similarity → top 10.
4. **Explain:** chat model writes the reason for the top 5.

## 8. Evaluation plan (SMART)
- **Seed data:** 30 realistic demo users in Berlin with profiles, stories and posts (visitors + locals, varied dates/languages/ages), clearly marked as demo.
- **Extraction accuracy:** 20 test sentences with expected fields → target ≥ 90% fields correct.
- **Hard filters:** 10 crafted cases (wrong language, out of age range, blocked user…) → target 10/10 correctly excluded.
- **Match quality:** 10 test users with a hand-picked "best buddy" → correct buddy in top 3 for ≥ 8/10. Compare three versions: trip only → trip + style → trip + style + personality, and show which improves results.
- **Security:** two-account test (no reading others' invites/messages, no chat before acceptance, no uploading into someone else's photo folder); incognito test on live URL; `/security-scan` clean.

## 9. Course requirements checklist
- [ ] `README.md` with **live Vercel URL at the top** + demo login for reviewers
- [ ] `README.md` with goal / problem / how it works
- [ ] `CLAUDE.md` updated at the end to match the finished app
- [ ] `CLAUDE.md` with project rules
- [ ] At least one skill, slash command or subagent (e.g. `/seed-demo` command, RLS-check subagent)
- [ ] At least one PR reviewed before merge (one PR per phase)
- [ ] Secrets server-side only, not in repo
- [ ] RLS on every user-data table + storage policies
- [ ] `/security-scan` pass
- [ ] AI disclosure (EU AI Act Art. 50) + working "Delete my data" (GDPR)
- [ ] Live on Vercel

## 10. Build phases (one branch + PR each)
1. **Scaffold & auth:** Supabase, sign-in, 18+ confirmation, `profiles` + RLS, deploy skeleton to Vercel
2. **Profile & stories:** profile page, travel style quiz, visited cities, stories, photo upload (Storage + policies)
3. **Posting:** one-sentence input → AI extraction → review/edit → save
4. **Matching:** embeddings, `match_posts`, "For you" with AI reasons, seed data
5. **Connecting:** invites, accept/decline, 1-to-1 chat, block/report
6. **Group activities** *(should — cut if short on time)*
7. **Hardening & launch:** delete-my-data, AI labels, safety page, `/security-scan`, README, evaluation, presentation
