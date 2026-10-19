# Matching evaluation — results (part D, 19 Oct 2026)

Run: `node --env-file=.env.local scripts/eval-matching.mjs` (no AI calls; ranking runs in the
database function `private.match_candidates`). Data: 30 fictional demo users in Berlin
(`scripts/seed/demo-users.json`), ten groups of three — a viewer, a likely buddy and a "trip
twin" (similar plan, different style and personality).

## Hard filters — 10/10 excluded, control found ✅
Temporary fixture users in a fake city ("Filtertown"), deleted after the run. Excluded as required:
no shared language · candidate outside the viewer's age range · viewer outside the candidate's
age range · candidate's gender ≠ viewer's preference · viewer's gender ≠ candidate's preference ·
candidate without gender vs. a preference · gender "other" vs. a preference · dates don't
overlap · different city · candidate not onboarded. A positive control (everything matches)
appeared, so the exclusions are real, not an empty result.

## Ranking — best buddy in the top 3
| Weights | Best buddy in top 3 | Best buddy or an "also good" pick |
|---|---|---|
| Trip only | 10/10 | 10/10 |
| Trip + style | 10/10 | 10/10 |
| Trip + style + personality | 10/10 | 10/10 |

**Who picked the best buddies.** The developer (Claude) wrote the seed users, which risks a test
shaped to pass. The director (Yuzu) therefore reviewed all 30 profiles
(`evals/demo-users-review.csv`) and the full eligible pools, listed alphabetically without scores
(`evals/eligible-pools.md`), and made 4 of the 10 picks independently: Arda → Lena (also good:
Carlos, Chloé, Tim), Hannah → Greta, Ines → Clara (also good: Marta), Sam → Elif. The other 6 are
the developer's (marked per case in `evals/matching.json`).

**Recording error, corrected before the final run.** An earlier version of `evals/matching.json`
stored "Mira → Lena" as the director's pick; the director's intended pick was Arda → Lena. The entry
was corrected (Mira uses the developer's pick, Jonas) and every director pick was re-checked against
the director's own words before this run.

## Honest reading
- **The SPEC §8 target (≥ 8/10) is met — but the ablation is inconclusive.** All three weight
  settings score 10/10, so this test set cannot show what style and personality add. The test set
  is too easy: in 8 of 10 cases the best buddy is already #1 on trip similarity alone, because the
  developer wrote each buddy's plan to read like the viewer's. The only movement: Mira → Jonas went
  from #2 (trip only) to #1 once style was added.
- **One case cannot fail:** Hannah has only 2 eligible candidates (Greta, Paul), so any pick among
  them is a top-3 hit. Counted at the director's request; flagged here.
- **Not claimed:** that style or personality improve matching. A meaningful ablation needs harder
  test data written by someone other than the developer (e.g. director-written users and picks).
- **Roadmap:** overlap length as a scoring factor (a longer shared stay ranks higher — the
  director's first judging priority); today dates are a pass/fail filter only.
