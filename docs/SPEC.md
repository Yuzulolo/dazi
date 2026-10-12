# Dazi — Find Your Travel & Food Buddy (Capstone Spec v0.2)

> "Dazi" (搭子) = a casual companion for a specific activity. Code folder / repo name: `dazi`.
> Platform: responsive **web app** (Next.js + Supabase + Vercel). Demo city: **Berlin** (data model supports any city).

## 1. Problem (SCR)
- **Situation:** More and more people travel solo or live in a new city, and look for a "buddy" to explore, eat or sightsee with.
- **Complication:** Today they post in scattered places (Xiaohongshu, Reddit, Facebook groups). Posts are unstructured, hard to filter by city + dates + interests, and most get no reply. Meeting strangers also feels unsafe.
- **Resolution:** One sentence in, structured post out. AI understands where/when/what you want, proactively suggests compatible buddies with a reason, and contact only opens after **both** sides say yes.

## 2. Users
- **Traveller:** "I'm in Lisbon 20–25 Oct, want seafood and sunsets."
- **Local / resident:** "I live in Berlin, happy to grab dinner or show a flea market at weekends."

## 3. MVP features
1. Sign up / sign in (email + Google). Signed-out visitors see only the landing page.
2. **Create a post in one sentence** → AI extracts a structured card (city, dates, type, interests, budget, vibe). User reviews and edits before saving.
3. **"Suggest buddies for me"** → ranked list of matching posts, each with a short AI-written match reason.
4. **Invite** → the other person accepts or declines. Only after acceptance can they chat (simple in-app messages).
5. **Safety:** report and block buttons, safety tips, no exact locations or contact details shown.
6. **Compliance:** "AI-generated" labels, a "Delete my data" button, privacy note.

**Out of scope (→ "What's next"):** payments, real-time push notifications, mobile app, ID verification, reviews/ratings, maps.

## 4. Data model (Supabase, RLS on every table)
| Table | Key fields | Who can do what (RLS) |
|---|---|---|
| `profiles` | id (= auth user), display_name, home_city, bio | Signed-in users read; owner updates |
| `posts` | id, user_id, raw_text, city, start_date, end_date, type (travel/food), interests[], budget, vibe, embedding vector(1536), status | Signed-in users read active posts (not from blocked users); owner creates/edits/deletes |
| `invites` | id, from_user, to_user, from_post, to_post, status (pending/accepted/declined), ai_reason | Only the two participants read; sender creates; receiver changes status |
| `messages` | id, invite_id, sender_id, body | Only participants of an **accepted** invite read/write |
| `blocks` | blocker_id, blocked_id | Owner only |
| `reports` | reporter_id, reported_user_id, reason | Reporter inserts; nobody else reads (admin via dashboard) |

## 5. AI flow (all calls server-side, via OpenRouter)
1. **Extract:** raw sentence → chat model returns JSON (city, dates, interests…). Also strips phone numbers / emails from the text.
2. **Embed:** interests + vibe text → `openai/text-embedding-3-small` → stored in `posts.embedding`. The same model is used at query time.
3. **Match:** SQL function `match_posts(post_id)`: same city → overlapping dates → exclude self & blocked users → order by vector similarity → top 10.
4. **Explain:** chat model writes a 1–2 sentence match reason for the top 5 (labelled "AI-generated").

## 6. Evaluation plan (SMART)
- **Seed data:** 30 realistic demo posts in Berlin — a mix of visitors and locals, travel and food, different dates (clearly marked as demo).
- **Extraction accuracy:** 20 test sentences with hand-written expected fields → target ≥ 90% fields correct.
- **Match quality:** 10 test posts with a hand-picked "best buddy" → target: correct buddy in top 3 for ≥ 8/10.
- **Security:** two-account test (A cannot read B's invites/messages; cannot chat before acceptance); incognito test on live URL; `/security-scan` clean.

## 7. Course requirements checklist
- [ ] `README.md` with goal / problem / how it works
- [ ] `CLAUDE.md` with project rules
- [ ] At least one skill, slash command or subagent (e.g. `/seed-demo` command, RLS-check subagent)
- [ ] At least one PR reviewed before merge (one PR per phase below)
- [ ] Secrets server-side only, not in repo
- [ ] RLS on every user-data table
- [ ] `/security-scan` pass
- [ ] AI disclosure (EU AI Act Art. 50) + working "Delete my data" (GDPR)
- [ ] Live on Vercel

## 8. Build phases (one PR each)
1. Scaffold: Next.js + Supabase, auth, `profiles`, RLS, deploy skeleton to Vercel
2. Posting: one-sentence input → AI extraction → review/edit → save
3. Matching: embeddings, `match_posts`, suggestion list with AI reasons, seed data
4. Connecting: invites, accept/decline, chat, block/report
5. Hardening: delete-my-data, AI labels, safety page, `/security-scan`, README
6. Evaluation + presentation (6 points: problem, solution, data, evaluation, challenges, next)
