# Vercel deployment-layer security reference

Captured 2026-09-01 from the official Vercel docs. Page dates as noted per section.
Sources:
- https://vercel.com/docs/environment-variables (last_updated 2026-08-20)
- https://vercel.com/docs/environment-variables/sensitive-environment-variables (2026-08-20)
- https://vercel.com/docs/environment-variables/rotating-secrets (2026-07-15)
- https://vercel.com/docs/deployments/environments (2026-08-14)
- https://vercel.com/docs/deployment-protection (2026-08-21)
- https://vercel.com/docs/deployment-protection/methods-to-protect-deployments/vercel-authentication (2026-08-21)
- https://vercel.com/docs/cdn-security (2026-08-13)
- https://vercel.com/docs/cdn-security/security-headers (2026-03-05)

## 1. Environment variables and scoping

Environment variables are key-value pairs configured outside source code so each value can
change per **Environment**. Vercel stores them **encrypted at rest**, but they are
**visible to any user who has access to the project** unless marked Sensitive.

Changes to environment variables **are not applied to previous deployments** — they only
apply to new deployments. Rotating a value therefore requires a redeploy.

Variables can be declared at **team level** (available to all projects in the team) or
**project level** (that project only).

### The four scopes

| Scope | Applies to |
|---|---|
| **Production** | The next Production Deployment — a push to the production branch (usually `main`) or `vercel --prod`. |
| **Preview** | The next Preview Deployment — a push to any non-production branch, or `vercel` without `--prod`. Can apply to all non-production branches or to one specific branch. |
| **Custom environments** | Pro/Enterprise only (e.g. `staging`, `QA`). Can import from another environment and be detached to override. |
| **Development** | Used when running locally with `vercel dev` or your own dev command. Downloaded with `vercel env pull`. |

Branch-specific preview variables override same-named preview variables, so you only need
to add the values you want to override.

Size limit: 64 KB total per deployment across all variables (Node.js, Python, Ruby, Go,
PHP community runtime). Edge runtime middleware/functions are limited to 5 KB per variable.

### Scoping risks to look for

- A production credential also scoped to **Preview** is reachable from any branch anyone can
  push, and from any fork-based PR build that the project allows. Preview deployments are a
  much wider blast radius than production.
- A production credential scoped to **Development** ends up on developer laptops via
  `vercel env pull`, in `.env.local`, and in shell history.
- The same value used across all three scopes means an exposure anywhere forces a rotation
  everywhere, and makes the audit log useless for working out where a leak came from.
- Preview and Development should point at non-production resources (separate database,
  test-mode payment keys, sandbox API tenants) so a preview build cannot write to
  production data.

### `.env` file hierarchy (Next.js load order, lowest to highest priority)

`.env` → `.env.[environment]` → `.env.local` (skipped in test) → `.env.[environment].local`

Git-tracked by convention: `.env`, `.env.development`, `.env.production`, `.env.test`,
`.env.example`. **Never** tracked: any `.local` variant. `vercel env pull` writes secrets
into `.env.local`, which is why that file must be gitignored.

Variables prefixed `NEXT_PUBLIC_` are inlined into the browser bundle. All others are
server-only.

## 2. Sensitive environment variables

Sensitive environment variables are variables **whose values are non-readable once
created** — Vercel stores them in an unreadable format and nobody, including project
owners, can read the value back through the dashboard, CLI, or API.

Key facts:

- Only available for the **Production and Preview** environments. You **cannot** mark a
  Development-scoped variable as Sensitive; the toggle is disabled when Development is
  selected. So "not Sensitive" is only a finding for Production/Preview variables.
- Works for both project-level and team-level (shared) environment variables.
- To make an **existing** variable sensitive you must **remove and re-add it** with the
  Sensitive option enabled. There is no in-place toggle. This matters for remediation
  advice: the value has to be re-entered, and since it was readable up to that point, it is
  worth rotating at the same time.
- **Build log redaction:** during builds, a sensitive value of **32 characters or longer**
  that appears in build logs is replaced with `[REDACTED]`. Values shorter than 32
  characters are *not* redacted. `VERCEL_AUTOMATION_BYPASS_SECRET` and `VERCEL_OIDC_TOKEN`
  are always redacted regardless of length.
- Each redaction records an Activity Log event with the key name, project and deployment
  (not the value).

Creating one via the REST API uses `"type": "sensitive"`:

```bash
curl --request POST \
  --url https://api.vercel.com/v10/projects/<project-id-or-name>/env \
  --header "Authorization: Bearer $VERCEL_TOKEN" \
  --header "Content-Type: application/json" \
  --data '[{ "key": "<key>", "value": "<value>", "type": "sensitive",
             "target": ["production"] }]'
```

CLI: `vercel env add MY_SECRET --sensitive`

The threat model: without Sensitive, every project collaborator, every integration with
project access, and anyone who compromises a team member's session can read the plaintext
credential straight out of the dashboard. Encryption at rest does not help against that.

## 3. Deployment Protection

Deployment Protection controls **who can access preview and production URLs**. Configured
per project, choosing a **method** (how) and a **scope** (what). It requires authentication
for all requests, **including requests to Routing Middleware**.

### Methods

| Method | Availability |
|---|---|
| **Vercel Authentication** — only Vercel users with access rights. The **recommended** method. | All plans |
| **Passport** — authenticate through your own identity provider | Enterprise |
| **Password Protection** | Enterprise, or paid add-on for Pro |
| **Trusted IPs** | Enterprise |

### Scopes

| Scope | What it protects | Availability |
|---|---|---|
| **Standard Protection** (recommended) | All deployments **except** production domains | All plans |
| **All Deployments** | Everything, including production domains | Pro, Enterprise |
| *(Legacy)* Standard Protection | All preview URLs and deployment URLs; up-to-date production URLs stay open | legacy |
| *(Legacy)* Pre-Production Deployments | Preview URLs only; does not protect past production deployments | legacy |
| Only production URLs | via Trusted IPs | Enterprise |

**Hobby plan:** Vercel Authentication with Standard Protection **is** available — it
protects preview deployments and generated deployment URLs, while the production domain
stays publicly accessible. Protecting production domains needs Pro or Enterprise. So
"we're on Hobby" is not a valid reason for unprotected previews.

Who can reach a protected deployment: logged-in team members with at least Viewer, project
members with at least project Viewer, members of an access group with project access,
Vercel users explicitly granted access, anyone holding a **Shareable Link**, and tooling
using the **protection bypass for automation** header.

Settings live at Project → **Settings → Deployment Protection**. Teams can set a
team-wide default for new projects (All Deployments / Standard Protection / None) and
override per project — so a team default of None silently applies to every new project.

Related: **Protected Source Maps** gates `.map` requests behind Vercel Authentication, so
browser source maps can ship without exposing source code.

Migrating to Standard Protection restricts the production *generated* URL, so any fetch
using `VERCEL_URL` / `VERCEL_BRANCH_URL` (in Next.js, `NEXT_PUBLIC_VERCEL_URL`) must be
changed to target the requested domain — client-side, use a relative path; server-side,
use the incoming request's origin and forward the request cookies.

### Bypass mechanisms worth auditing

- **Protection Bypass for Automation** — a secret (`VERCEL_AUTOMATION_BYPASS_SECRET`) sent
  as a header to skip protection, for CI/E2E tests. Anyone holding it can reach every
  protected deployment; it belongs in CI secrets only, never in the repo. Multiple secrets
  are supported, which means they can be rotated.
- **Shareable Links** — grant access to anyone holding the URL, indefinitely until revoked.
- **Deployment Protection Exceptions** — specific domains exempted from protection
  (Enterprise, or Pro add-on).
- **Trusted Sources** — a mismatch surfaces as `TRUSTED_SOURCES_ENVIRONMENT_MISMATCH`.

Note: preview deployments are not indexed by search engines by default (Vercel sends a
`noindex` header), but *not indexed* is not *not accessible* — an unprotected preview URL
is reachable by anyone who learns it, and preview URLs appear in PR comments, CI logs,
Slack messages, and screenshots.

## 4. Security headers

Vercel's CDN gives you HTTPS everywhere (HTTP → HTTPS with a `308`), auto-provisioned TLS
certs, TLS 1.2/1.3 with forward secrecy, post-quantum `X25519MLKEM768`, ECH, a
platform-wide firewall with DDoS mitigation, and optional WAF and bot management.

**HSTS is applied automatically** on `.vercel.app` domains (preloaded in browser HSTS
lists) and on custom domains. You can modify `Strict-Transport-Security` in the project's
response-headers configuration.

Everything else is **yours to configure** — Vercel does not set these for you:

- **`Content-Security-Policy`** — restrict which sources can load scripts, images and other
  resources, to prevent XSS.
- **`X-Frame-Options`** — stop your pages being embedded in iframes (clickjacking).
- **`X-Content-Type-Options`** — stop MIME-type sniffing.

Also commonly configured: `Referrer-Policy`, `Permissions-Policy`,
`Strict-Transport-Security` (to override the default), and
`Cross-Origin-Opener-Policy`.

### CSP guidance (from the Vercel CSP doc)

CSP is a **second line of defence** behind input sanitization and secure coding. It reduces
XSS by allowlisting content sources, blocking inline scripts, disallowing `eval()`,
supporting nonces and hashes for specific inline scripts, reporting violations, and
restricting plugins.

```
Content-Security-Policy: default-src 'self'; script-src 'self' cdn.example.com; img-src 'self' img.example.com; style-src 'self';
```

Best practices the docs state explicitly:

- Start with **`Content-Security-Policy-Report-Only`** to observe violations without
  blocking, then switch to enforcing once you know nothing breaks.
- **Avoid `unsafe-inline` and `unsafe-eval`.** Use nonces or hashes for inline scripts and
  styles instead. A CSP containing `unsafe-inline` on `script-src` gives up most of the XSS
  protection the header exists to provide.
- Be specific: list individual subdomains rather than wildcarding `*.domain.com`.
- Keep directives updated as the app's content sources change.
- Test across browsers.

### Where headers get configured

Both of these are deployed as part of the build; neither is a dashboard setting.

`next.config.js` / `next.config.ts` — applies to Next.js routes:

```js
module.exports = {
  async headers() {
    return [{
      source: '/(.*)',
      headers: [
        { key: 'Content-Security-Policy', value: "default-src 'self'; ..." },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      ],
    }]
  },
}
```

`vercel.json` — applies at the platform level:

```json
{
  "headers": [{
    "source": "/(.*)",
    "headers": [
      { "key": "X-Content-Type-Options", "value": "nosniff" },
      { "key": "X-Frame-Options", "value": "DENY" }
    ]
  }]
}
```

A per-request nonce-based CSP cannot be expressed in static config — it needs to be set in
Next.js middleware/`proxy.ts` per request. A header written into `middleware.ts`/`proxy.ts`
only applies to paths the matcher covers, which is a common source of "configured but not
actually deployed on this route".

Whichever mechanism is used, the header is only real if it is present on the response from
the deployed URL. Configuration in a file is a claim; `curl -sI` against the deployment is
the evidence.

## 5. Rotating secrets

Rotation limits the exposure window when a credential is compromised. The docs name these
triggers: **a team member with credential access leaves**, **you suspect a credential has
been exposed**, a policy requiring periodic rotation, or a forced update by a third party.

The safe order — update Vercel **before** invalidating the old credential, so deployments
don't break:

1. Generate a new credential at the third-party service. **Do not** delete the old one yet.
2. In Vercel, edit the environment variable and replace the value.
3. Confirm the correct environments are selected (Production / Preview / Development).
4. Save.
5. **Redeploy** — environment variable changes do not apply to existing deployments.
   Redeploy previews too, or they break when the old credential is invalidated.
6. Verify the new deployment works, then invalidate the old credential at the service.

For **team-level** variables, multiple projects may use the value: check the
**Link to Projects** field to find them, and redeploy every one before invalidating.

For **Marketplace integrations**: Integrations → provider → Installed Products → Settings →
**Secure This Resource** → **Rotate Secrets** (requires a rotation reason and typing the
project name), then redeploy the linked project.

### The rotation question git can actually answer

Git history shows when a secret was committed and when it was removed. It does not show
whether it was rotated. But the comparison does: take the value that was committed and
compare it against the value in use now (`.env.local`, or the current Vercel variable). If
they are the same string, **the secret was never rotated** and the exposure is live. If
they differ, it was replaced — though that still leaves the question of whether the old
credential was invalidated at the provider, which only the provider's dashboard can answer.

Removing a secret from the working tree does nothing to the history. Any clone, fork, CI
cache, or GitHub fork network still carries it, which is why the remediation is always
"rotate the credential", not "delete the line".
