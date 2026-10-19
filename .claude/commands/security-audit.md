---
description: Run the Supabase, Next.js and Vercel security scanners in parallel, then merge their findings into one deduplicated report grouped by severity
argument-hint: [path to the app — defaults to the project in the working directory]
---

# Security audit

Run all three security scanners against this app at the same time, then merge what they
find into a single report. Nothing you or they do may change a file.

## 1. Resolve the target

The target is `$ARGUMENTS` if given. Otherwise use the Next.js project in the working
directory — the one with a `next.config.*` or a `next` dependency.

In this repository the target is always the Dazi app at the repository root. Say so and
proceed without asking.

## 2. Dispatch all three scanners in parallel

**Put all three Agent tool calls in a single message.** That is what makes them run
concurrently — three separate messages run them one after another and take three times as
long. Do not wait for one before launching the next, and do not run any part of the audit
yourself while they work.

Dispatch these three, each with the resolved target path in its prompt:

- `supabase-security-scanner` — RLS coverage, incomplete policy sets, leaked
  `service_role` keys, public storage buckets, policies trusting user-editable data.
- `nextjs-security-scanner` — secrets behind `NEXT_PUBLIC_`, whole records crossing into
  Client Components, Server Actions and Route Handlers that don't re-check the caller,
  login checked without ownership, data access scattered outside a Data Access Layer.
- `vercel-security-scanner` — environment variable scoping, secrets not marked Sensitive,
  unprotected preview deployments, missing security headers, committed secrets never
  rotated.

Give each the same instruction alongside its target: **report only — do not edit, create
or delete any file, and do not run any command that writes.** Ask each to state which of
its checks it completed and to separate what it confirmed from what it could not verify
from the repository.

While they run, do nothing else. Never write, guess at, or summarise a scanner's findings
before its result actually arrives.

## 3. Merge the results

Wait for all three. Then combine them into one report — do not paste three reports one
after another.

**Deduplicate.** Two findings are the same finding when they name the same defect at the
same location, even where the scanners describe it differently. Overlaps to expect, since
all three scanners look at some of the same ground:

- A secret behind a `NEXT_PUBLIC_` variable — the Supabase, Next.js and Vercel scanners
  can each flag the same key.
- A committed credential — the Vercel and Supabase scanners both look for these.
- Environment variable handling generally — Next.js and Vercel overlap here.

List each such finding **once**, and name every scanner that flagged it. Agreement across
scanners is signal: say so, because a finding three scanners independently reached is
better evidenced than one that surfaced alone.

**Keep genuinely distinct findings separate, and cross-reference them.** A missing
ownership check in a Server Action and a missing RLS policy on the same table are two
different defects at two different layers, even though they concern the same data. Merging
them hides one. Note the relationship instead — and where one layer compensates for the
other, say so plainly rather than reporting a defence-in-depth gap as an open hole.

**Reconcile severities.** Where scanners rate the same finding differently, take the
highest, and say which scanner rated it lower and why the higher rating wins. Note that
`supabase-security-scanner` reports only critical, high and medium — it has no low band, so
its absence from that band means nothing.

## 4. Report

One report, grouped by severity, in this order: **critical**, **high**, **medium**, **low**.
Order findings within each band by how reachable they are, not by how interesting they are.

For each finding give:

- **Location** — file and line, or the exact dashboard path for a setting that isn't in
  the repository.
- **Flagged by** — which scanner(s), naming all of them where more than one agreed.
- **Risk** — what an attacker or unauthorised viewer actually gets: which data, whose,
  and what they can do with it.
- **What could go wrong** — two or three sentences of plain language a non-specialist can
  follow. Concrete beats abstract.

Then close with:

- **Coverage** — which scanners completed, and which of their checks each finished. If a
  scanner failed or returned nothing usable, say so; a missing scanner is not a clean
  result and must never be reported as one.
- **Unverified** — everything no scanner could confirm from the repository, merged into
  one list with the page or command that would settle each. Dashboard settings, live
  database policies and deployment configuration mostly live here.
- **Fix first** — the single finding you would fix first, and why that one.

Do not pad a severity band. An empty band, with what was checked behind it, is a better
result than a padded one. Do not soften a real finding because the surrounding work is
good, and do not re-raise anything the project has already recorded as a deliberate
trade-off — check `docs/SECURITY-AUDIT.md` if the project keeps one, and if a documented
trade-off's own stated trigger for revisiting it has now been met, raise that instead and
quote the trigger.

## Constraint

Read-only, start to finish. The scanners report; you merge and relay. No file is created,
edited or deleted by this command, and no fix is applied — if the user wants something
fixed, that is a separate request they make after reading this.
