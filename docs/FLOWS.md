# Dazi — User Flows, States & Rules (v1.0)

> Companion to `docs/SPEC.md`. SPEC says *what* we build; this file says *how users move through it* and *what rules apply*.
>
> **Capstone scope (SPEC §0):** sections 1.5 (social verification), 2.4 (social reveal), 2.6b (match-break limit) and 2.8 (feedback) are **Roadmap**; 2.7 (trip photo upload) is also **Roadmap** (SPEC §0.4) — posts use the 4 poster tones as covers instead. Google sign-up is also Roadmap. "Chat" in this file = simple message thread without realtime.

## 1. User journey (confirmed)

### 1.1 Guest (not signed in) — "try before you sign up"
1. `/` — poster-wall homepage; the first poster is the composer: *"Your next plan"* (one sentence). Submitting opens `/matches`.
2. AI extracts a trip card (city, dates, interests, budget, vibe). Guest can edit it.
3. `/matches` shows **top 5 similar trips** as recruitment posters, **anonymised on the server**; "View plan" opens `/plans/[id]`:
   - Shown: initial only (e.g. `M•••`), blurred placeholder avatar, age range, interest chips, overlapping dates, AI match reason
   - **Never sent to the browser:** real name, real avatar, stories, profile link, socials
4. Guest clicks "Connect" → sign-up dialog (Sign up / Not now).
5. Guest ranking uses **trip similarity + city + dates only** (no profile yet). Banner: *"Complete your profile for more accurate matches."*
6. The guest's search text is kept in the browser (sessionStorage) so it can become their first post after sign-up. Nothing about the guest is stored in the database except a rate-limit log. sessionStorage is tab-local and best-effort: continuing in another tab or device does not carry the plan over. On `/matches` the guest can edit the sentence in place ("Edit plan"). Only the guest's own plan text (and the carousel position) is stored — never another user's data. Remembering which recruitment the guest wanted to connect with is part F (server-side, after sign-up), not browser storage.

### 1.2 Sign-up → first match
1. Sign up (email or Google) → confirm 18+ (Google users enter birth year on `/onboarding` first, see 2.0)
2. Onboarding (required): basics (name, birth year, gender optional, languages, home city, avatar) → travel style quiz
3. Guest search auto-fills the first post → user confirms
4. Full recommendations recalculated (all hard filters + trip + style + personality)
5. Open a profile → read stories → send invite (optional note; AI suggests an icebreaker)
6. Other person accepts → private chat opens
7. In chat, either side may ask to reveal social media (see 2.4) → meet in person
8. After the trip: post closes automatically; user can write a new story

### 1.3 Returning user — `/home`
Pending invites · my active post · **"For you"**: top 5 matches as posters, each with a reason ("AI-generated", cached per pair; rule-based "Suggested match" if the AI is unavailable) and a Trip · Style · Personality breakdown. No matches → *"No buddies yet for these dates"* + a SQL-computed suggestion (*"Try ±3 days → 4 people"*). Demo users carry a "Demo profile" badge.

### 1.4 Page map
| Page | Access | Purpose |
|---|---|---|
| `/` | everyone | Poster-wall homepage: plan composer + wall of plans (demo trips until part E) |
| `/matches` | everyone | Guest results: plan summary + 5 anonymised recruitment posters (demo trips until part E) |
| `/plans/[id]` | everyone | Recruitment detail, anonymised; "Why this plan fits" (AI); Connect → sign-up |
| `/login`, `/signup` | everyone | Auth |
| `/onboarding` | new users | Basics + travel style quiz |
| `/home` | signed in | Invites, active post, recommendations |
| `/u/[id]` | signed in | Other user's profile (style, cities). Their active post appears only via the part D server function (posts are owner-only — see SPEC §6) |
| `/posts/new`, `/posts/edit` | signed in, onboarded | One sentence → AI draft card (poster preview, tone picker) → publish / edit the active post |
| `/me/edit` | owner | Edit profile, preferences, social accounts |
| `/stories/new` | owner | Write story + photos |
| `/invites` | owner | Received / sent |
| `/chat/[id]` | 2 participants | Private chat after acceptance |
| `/settings` | owner | Blocked users, delete my data |
| `/safety`, `/privacy` | everyone | Safety tips, privacy notice |

### 1.5 Social verification (confirmed)
- **Facebook:** linked via OAuth (Supabase identity linking) → "Facebook verified" badge. Proves a real account was logged into; the profile link itself stays hidden.
- **Instagram:** handle entered by the user (cannot be verified for personal accounts — Instagram's API only supports business/creator accounts). Shown as "self-added", not "verified".
- **Nothing social is ever shown** until the reveal flow in 2.4 succeeds. Only the *badge* ("Facebook verified") is visible on the profile.

## 2. States & rules (confirmed)

### 2.0 Onboarding gate (incl. birth year, 18+)
- A signed-in user who has **not completed onboarding** (`profiles.onboarding_completed_at = null`) must finish `/onboarding` **before using any feature**. Only `/onboarding`, sign-out, `/privacy` and `/safety` are reachable until then.
- Onboarding cannot be completed without a birth year (database constraint), so this also covers a missing birth year (e.g. a Google sign-up — Roadmap; today only possible via direct database edits).
- **Birth year is locked once set** (cannot be changed or cleared; a mistake is fixed by an admin).
- Same strict rule as email sign-up: birth year ≤ current year − 19. Under 18 → account and all its data are deleted, message *"You must be 18 or older to use Dazi."* **Until part G ("Delete my data") exists: onboarding is refused, not deleted.**
- **Enforced on the server, not only in the UI:**
  - `getCurrentUser()` (used by every protected page and server action) redirects to `/onboarding` when onboarding is not completed
  - A database constraint refuses `onboarding_completed_at` unless the required fields (birth year, languages, home city, pace, day rhythm, ≥1 interest) are filled
  - From part C on, every insert/update RLS policy on feature tables also requires completed onboarding, so direct API calls are refused too
  - The database never lets `birth_year` change once set, and rejects any under-18 value (trigger)

### 2.0b Profile privacy & gender (part B, used by part D)
- **Private (owner only):** birth year, gender, preferred age range, preferred gender. Other signed-in users see an **age range** (e.g. "30–34"), never the year.
- **Gender is optional and only used for matching, never shown.** UI text: *"Only used for matching, never shown. If you leave it empty, people who set a gender preference won't see you."*
- **Matching rule (part D):** a user with **no gender set — or gender "other", which can't be chosen as a preference — is hidden from anyone who has set a gender preference**; gender and age preferences must match **mutually** (both directions).
- **Accepted privacy trade-off:** someone with a gender preference only ever sees people of that gender, so their matches' gender is implicitly revealed to them.
- Other users' posts reach the app **only** through `match_my_post()` (server-side, all hard filters, safe fields only — never birth year, gender, preferences, embeddings or raw text).
<!-- invite statuses: pending, accepted, declined, expired, cancelled, ended_trip_changed -->

### 2.1 Post
```
active ──► closed     (user closes it, or end_date has passed — automatic)
active ──► archived   (user creates a new post; confirm dialog first)
```
- **Max 1 active post per user.** Old posts stay visible in the user's own history.
- Publishing while a post is active asks first: *"Replace your current plan?"* — the old one is archived in the same transaction (`publish_post`).
- An ended plan (end date passed) shows on `/home` as "This plan has ended — post a new one"; it can't be edited. Automatic closing comes with part D.
- **Posts are owner-only.** Nobody else can query them directly; other users only see a post through the part D matching function (hard filters incl. mutual age/gender preferences applied server-side).
- When a post becomes closed/archived, its pending invites become `expired`.

### 2.2 Invite
```
pending ──► accepted   → private chat opens
        ──► declined
        ──► expired    (when the related post's end_date passes, or the post is closed/archived)
        ──► cancelled  (sender withdraws)
```
- **Expiry:** at the end date of the post it belongs to.
- **After a decline:** the sender cannot invite the same person again for the same trip/post.
- **Anti-spam:** max **10 pending outgoing invites** per user at any time.
- Invite note is optional; AI can suggest an icebreaker (labelled AI-generated).

### 2.3 Chat
- Exists only for `accepted` invites. Only the 2 participants can read/write (RLS).

### 2.4 Social reveal (mutual exchange)
```
none ──► requested (A asks in chat) ──► shared   (B agrees → BOTH see each other's socials)
                                   ──► declined (nothing shown; A cannot ask again in this chat)
```
- Mutual only: nobody can see the other's socials without sharing their own.

### 2.5 Block & report
- **Block** (instant): both users disappear from each other's recommendations, profiles and invites; chat closes; pending invites cancelled.
- **Report**: also blocks automatically + flags the user for admin review (via Supabase dashboard).

### 2.6 Editing a post
- Everything is editable, including **city and dates** (user freedom).
- Changing city or dates shows a warning dialog first: *"Your current matches will end."* On confirm:
  - all `pending` invites on this post → `expired`
  - all `accepted` invites on this post → `ended_trip_changed`; the chat becomes read-only; the other person is notified *"This trip was changed"*
  - recommendations and embedding are recalculated
- Editing interests, vibe or photo never breaks matches (embedding is recalculated, invites stay).

### 2.6b Match-break limit (reliability)
- A **match break** = any user action that ends **at least one `accepted` invite**: changing city/dates, creating a new post (archives the old one), or closing a post early.
- Each user has **2 match breaks per rolling 30 days**. The warning dialog says: *"Your current matches will end. You have X of 2 changes left this month."*
- At 0 left: these actions are disabled until the oldest break is older than 30 days. The user can still message their buddies to agree on changes.
- Ending only `pending` invites does **not** count.
- **Block and report never count** — safety always comes first; a user can always leave an uncomfortable match.
- Enforced on the server (count rows in `match_breaks`), not just in the UI.

### 2.7 Trip photo
- Optional, **one** photo per post, auto-cropped to **4:3**.
- No upload → user picks one of 8–12 **preset Berlin mood covers** (cards never text-only).
- On upload, a **vision model** (via OpenRouter, server-side) checks: no inappropriate content, no visible contact details, no clearly identifiable face of another person. Rejected photos show the reason.
- The vision model also writes a short **mood description** (e.g. "film tones, street photography, quiet morning"), added to the post text before embedding → similar aesthetics match better.
- **Guests never see uploaded photos** — only preset covers or mood tags. Signed-in users see real photos.
- EXIF/GPS stripped before upload; stored under `{user_id}/` in Storage.

### 2.8 After meeting — feedback (lightweight)
- Triggered when an invite is `accepted` **and** the post's end date has passed.
- **Private (only the platform sees):** "Did you meet?" (yes / no / they didn't show) · "Did you feel respected and safe?" (yes / somewhat / no). "No" → guided to report. Users flagged unsafe multiple times are paused from recommendations.
- **Public: positive tags only**, from a fixed list: punctual, respectful, great local tips, easy to talk to, good photographer, well organised. Profile shows e.g. *"Met 5 buddies · respectful ×5 · punctual ×4"*. No stars, no public negative text.
- **Double-blind:** tags become visible when both sides submitted, or 7 days after the first submission.

## 3. Edge cases (confirmed)
| Situation | Behaviour |
|---|---|
| No city or dates in the sentence | Fields left empty and highlighted; search disabled until filled |
| Dates in the past / end before start | Validation error, cannot save |
| Birth year shows under 18 | Sign-up refused, nothing stored (email). Google user entering an under-18 year on onboarding → account deleted (2.0); until part G: refused, not deleted |
| Signed in but no birth year (Google) | Redirected to `/onboarding` from every page and action until it is entered (2.0) |
| AI down or timeout | Fall back to a manual form; recommendations still shown without AI reasons |
| Phone numbers / emails / abusive text in a post | AI strips contact details; clearly abusive content is rejected |
| Prompt injection in user text ("ignore previous instructions…") | User text is always treated as data inside the prompt, never as instructions |
| Guest hits rate limit | "Sign up to keep searching" |
| Opening the profile of someone who blocked you | "User not found" |
| **No matches** | "No buddies yet for these dates." AI suggests widening (e.g. "±3 days → 4 people"). Post stays active; `/home` shows "New matches" when someone fitting posts. No email notifications. |
| **Two users invite each other** | Automatically treated as mutually accepted → chat opens |
| **Account deletion** | All of the user's rows, messages, photos and feedback deleted (GDPR). Chat partners see "This user has left". |
