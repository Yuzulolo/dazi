# How to think about data security in Next.js

Source: https://nextjs.org/docs/app/guides/data-security
Next.js version at capture: 16.3.4 · Page lastUpdated: 2026-08-25 · Captured: 2026-09-01

React Server Components improve performance and simplify data fetching, but also shift
where and how data is accessed, changing some of the traditional security assumptions for
handling data in frontend apps.

## Data fetching approaches

Three recommended approaches, depending on the size and age of the project:

- **HTTP APIs** — for existing large applications and organizations.
- **Data Access Layer** — for new projects.
- **Component-Level Data Access** — for prototypes and learning.

Choose ONE approach and avoid mixing them. This makes it clear for both developers and
security auditors what to expect.

### External HTTP APIs

Follow a **Zero Trust** model when adopting Server Components in an existing project.
Continue calling existing REST/GraphQL endpoints from Server Components using `fetch`,
just as you would from Client Components.

```tsx
// app/page.tsx
import { cookies } from 'next/headers'

export default async function Page() {
  const cookieStore = await cookies()
  const token = cookieStore.get('AUTH_TOKEN')?.value

  const res = await fetch('https://api.example.com/profile', {
    headers: { Cookie: `AUTH_TOKEN=${token}` },
  })
  // ...
}
```

Works well when you already have security practices in place, or separate backend teams
use other languages / manage APIs independently.

### Data Access Layer (DAL)

For new projects, create a dedicated **Data Access Layer**: an internal library that
controls how and when data is fetched, and what gets passed to the render context.

A Data Access Layer should:

- Only run on the server.
- Perform authorization checks.
- Return safe, minimal **Data Transfer Objects (DTOs)**.

This centralizes all data access logic, makes consistent data access easier to enforce,
and reduces the risk of authorization bugs. It also shares an in-memory cache across
different parts of a request.

```ts
// data/auth.ts
import { cache } from 'react'
import { cookies } from 'next/headers'

// Cached helper methods make it easy to get the same value in many places without
// manually passing it around. This discourages passing it from Server Component to
// Server Component, which minimizes the risk of passing it to a Client Component.
export const getCurrentUser = cache(async () => {
  const cookieStore = await cookies()
  const token = cookieStore.get('AUTH_TOKEN')
  const decodedToken = await decryptAndValidate(token)
  // Don't include secret tokens or private information as public fields.
  // Use classes to avoid accidentally passing the whole object to the client.
  return new User(decodedToken.id)
})
```

```tsx
// data/user-dto.tsx
import 'server-only'
import { getCurrentUser } from './auth'

function canSeeUsername(viewer: User) {
  return true // Public info for now, but can change
}

function canSeePhoneNumber(viewer: User, team: string) {
  return viewer.isAdmin || team === viewer.team // Privacy rules
}

export async function getProfileDTO(slug: string) {
  // use a database API that supports safe templating of queries
  const [rows] = await sql`SELECT * FROM user WHERE slug = ${slug}`
  const userData = rows[0]
  const currentUser = await getCurrentUser()

  // only return the data relevant for this query and not everything
  return {
    username: canSeeUsername(currentUser) ? userData.username : null,
    phonenumber: canSeePhoneNumber(currentUser, userData.team)
      ? userData.phonenumber
      : null,
  }
}
```

The page then consumes the DTO and can safely pass it around, knowing it shouldn't
contain anything sensitive.

> **Good to know:** Secret keys should be stored in environment variables, but **only the
> Data Access Layer should access `process.env`**. This keeps secrets from being exposed
> to other parts of the application.

### Component-level data access

For quick prototypes, database queries can go directly in Server Components. This makes
it easier to accidentally expose private data:

```tsx
// BAD — app/page.tsx
export default async function Page({ params }) {
  const { slug } = await params
  const [rows] = await sql`SELECT * FROM user WHERE slug = ${slug}`
  const userData = rows[0]
  // EXPOSED: this exposes all the fields in userData to the client because
  // we are passing the data from the Server Component to the Client.
  return <Profile user={userData} />
}
```

```tsx
// BAD — app/ui/profile.tsx
'use client'
// BAD props interface: accepts way more data than the Client Component needs and
// encourages server components to pass all that data down. A better solution would be
// to accept a limited object with just the fields necessary for rendering the profile.
export default async function Profile({ user }: { user: User }) {
  return <div><h1>{user.name}</h1></div>
}
```

Sanitize before passing to a Client Component — return only the public fields:

```ts
// data/user.ts
export async function getUser(slug: string) {
  const [rows] = await sql`SELECT * FROM user WHERE slug = ${slug}`
  const user = rows[0]
  return { name: user.name } // Return only the public fields
}
```

## Reading data

### Passing data from server to client

On the initial load, both Server and Client Components run on the server to generate
HTML, but they execute in **isolated module systems**.

**Server Components:** run only on the server; can safely access environment variables,
secrets, databases, and internal APIs.

**Client Components:** run on the server during prerendering, but must follow the same
security assumptions as code running in the browser; must not access privileged data or
server-only modules.

Secure by default, but private data can still be exposed through how data is fetched or
passed to components.

### Tainting

React Taint APIs prevent accidental exposure of private data to the client:

- `experimental_taintObjectReference` — for data objects.
- `experimental_taintUniqueValue` — for specific values.

Enable with the `experimental.taint` option:

```js
// next.config.js
module.exports = { experimental: { taint: true } }
```

This prevents tainted objects/values from being passed to the client. It is an
**additional** layer only — still filter and sanitize data in the DAL before passing it
into React's render context.

> **Good to know:**
> - By default, environment variables are only available on the Server. Next.js exposes
>   any environment variable prefixed with `NEXT_PUBLIC_` to the client.
> - Functions and classes are already blocked from being passed to Client Components.

### Preventing client-side execution of server-only code

Mark a module with the `server-only` package to cause a build error if it is imported in
the client environment:

```ts
// lib/data.ts
import 'server-only'
```

Next.js handles `server-only` imports internally; the NPM package contents are not used,
but you may install it if linting rules flag extraneous dependencies. See "preventing
environment poisoning" in the Server and Client Components docs.

## Mutating data

Next.js handles mutations with **Server Actions**.

### Built-in Server Actions security features

By default, when a Server Action is created and exported it is **reachable via a direct
POST request**, not just through your application's UI. Even if a Server Action or
utility function is not imported elsewhere in your code, it can still be called
externally.

Built-in mitigations:

- **Secure action IDs** — encrypted, non-deterministic IDs let the client reference and
  call the action; recalculated periodically between builds. IDs are created during
  compilation and cached for a maximum of 14 days; regenerated on a new build or when the
  build cache is invalidated.
- **Dead code elimination** — unused Server Actions are removed from the client bundle
  during `next build`, so no public endpoint is created for them.

> This reduces risk where an authentication layer is missing, but you should **still treat
> Server Actions as reachable via direct POST requests and verify authentication and
> authorization inside each one.**

### Validating client input

Always validate input from the client — form data, URL parameters, headers, searchParams
are all easily modified.

```tsx
// BAD: Trusting searchParams directly
export default async function Page({ searchParams }) {
  const isAdmin = (await searchParams).isAdmin
  if (isAdmin === 'true') return <AdminPanel /> // Vulnerable: untrusted client data
}

// GOOD: Re-verify every time
import { cookies } from 'next/headers'
import { verifyAdmin } from './auth'

export default async function Page() {
  const cookieStore = await cookies()
  const token = cookieStore.get('AUTH_TOKEN')
  const isAdmin = await verifyAdmin(token)
  if (isAdmin) return <AdminPanel />
}
```

### Authentication and authorization

**A page-level authentication check does not extend to the Server Actions defined within
it. Always re-verify inside the action.**

```tsx
// app/admin/page.tsx
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'

export default async function AdminPage() {
  const session = await auth()
  if (!session?.user?.isAdmin) redirect('/login')

  return (
    <form
      action={async () => {
        'use server'
        const session = await auth()            // <- critical
        if (!session?.user?.isAdmin) throw new Error('Unauthorized')
        await db.record.deleteMany()
      }}
    >
      <button>Delete Records</button>
    </form>
  )
}
```

The `auth()` check inside the action is critical. The page-level redirect controls which
UI is rendered, but the Server Action is a **separate entry point** and must verify the
caller on its own.

Beyond authentication (is the user logged in?), check **authorization** (does this user
have permission to act on this specific resource?). This prevents **Insecure Direct
Object Reference (IDOR)** vulnerabilities:

```tsx
// app/actions.ts
'use server'
export async function deletePost(postId: string) {
  const session = await auth()
  if (!session?.user) throw new Error('Unauthorized')

  const post = await db.post.findUnique({ where: { id: postId } })

  // Check that the user owns this resource
  if (post.authorId !== session.user.id) throw new Error('Forbidden')

  await db.post.delete({ where: { id: postId } })
}
```

### Using a Data Access Layer for mutations

Apply the DAL pattern to mutations too: keep authentication, authorization and database
logic in a dedicated `server-only` module, and keep `"use server"` actions thin.

```ts
// data/posts.ts
import 'server-only'
export async function deletePost(postId: string) {
  const session = await auth()
  if (!session?.user) throw new Error('Unauthorized')
  const post = await db.post.findUnique({ where: { id: postId } })
  if (post.authorId !== session.user.id) throw new Error('Forbidden')
  await db.post.delete({ where: { id: postId } })
}
```

```ts
// app/actions.ts
'use server'
import { deletePost } from '@/data/posts'
import { revalidatePath } from 'next/cache'

export async function deletePostAction(postId: string) {
  await deletePost(postId) // Auth + authz happen inside the DAL
  revalidatePath('/posts')
}
```

> **Good to know:** `import 'server-only'` works in both the DAL and the `"use server"`
> file itself, including when the action is imported into a Client Component (e.g. for
> `useActionState`), because `"use server"` modules resolve in a server-only webpack layer.

### Controlling return values

Server Action return values are **serialized and sent to the client**. Only return what
the UI needs, not raw database records.

```tsx
'use server'
// BAD: returns the full database record, which may include internal fields
// the client should not see.
export async function updateUser(data: FormData) {
  const session = await auth()
  if (!session?.user) throw new Error('Unauthorized')
  return db.user.update({
    where: { id: session.user.id },
    data: { name: data.get('name') as string },
  })
}

// GOOD: returns only what the client needs.
export async function updateUserSafe(data: FormData) {
  const session = await auth()
  if (!session?.user) throw new Error('Unauthorized')
  await db.user.update({
    where: { id: session.user.id },
    data: { name: data.get('name') as string },
  })
  return { success: true }
}
```

### Rate limiting

For expensive operations (sending emails, writing to a database), consider rate limiting
to prevent abuse. See the Rate limiting example in the Backend for Frontend guide.

### Closures and encryption

Defining a Server Action inside a component creates a closure with access to the outer
scope, useful to capture a *snapshot* of data at render time:

```tsx
export default async function Page() {
  const publishVersion = await getLatestVersion()

  async function publish() {
    'use server'
    if (publishVersion !== (await getLatestVersion())) {
      throw new Error('The version has changed since pressing publish')
    }
  }

  return <form><button formAction={publish}>Publish</button></form>
}
```

The captured variables are sent to the client and back to the server when the action is
invoked. Next.js **automatically encrypts** closed-over variables; a new private key is
generated for each action every time the app is built, so actions can only be invoked for
a specific build.

> **Good to know:** Don't rely on encryption alone to prevent sensitive values from being
> exposed on the client.

### Overwriting encryption keys (advanced)

When self-hosting across multiple servers, each instance may end up with a different
encryption key. Overwrite it with `process.env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` so
keys are persistent across builds and shared by all instances. The key must be
base64-encoded with a decoded length matching a valid AES key size (16, 24, or 32 bytes);
Next.js generates 32-byte keys by default (`openssl rand -base64 32`). Follow standard
practices such as key rotation and signing.

### Allowed origins (advanced)

Server Actions can be invoked from a `<form>`, which opens them to **CSRF**. They use
`POST` only, which prevents most CSRF in modern browsers, particularly with SameSite
cookies as the default. As additional protection, Next.js compares the `Origin` header to
the `Host` header (or `X-Forwarded-Host`) and aborts on mismatch — actions can only be
invoked on the same host as the page hosting them.

For large applications behind reverse proxies or multi-layered backends, use
`serverActions.allowedOrigins`:

```js
// next.config.js
module.exports = {
  experimental: {
    serverActions: { allowedOrigins: ['my-proxy.com', '*.my-proxy.com'] },
  },
}
```

### Avoiding side-effects during rendering

Mutations (logging out users, updating databases, invalidating caches) should never be a
side-effect of rendering, in Server or Client Components. Next.js explicitly prevents
setting cookies or triggering cache revalidation within render methods.

```tsx
// BAD: triggering a mutation during rendering
export default async function Page({ searchParams }) {
  if ((await searchParams).logout) {
    const cookieStore = await cookies()
    cookieStore.delete('AUTH_TOKEN')
  }
  return <UserProfile />
}

// GOOD: using a Server Action to handle the mutation
import { logout } from './actions'
export default function Page() {
  return (
    <>
      <UserProfile />
      <form action={logout}><button type="submit">Logout</button></form>
    </>
  )
}
```

> **Good to know:** Next.js uses `POST` requests to handle mutations. This prevents
> accidental side-effects from GET requests, reducing CSRF risk.

## Auditing — what the docs tell auditors to look at

- **Data Access Layer:** Is there an established practice for an isolated Data Access
  Layer? Verify that **database packages and environment variables are not imported
  outside the Data Access Layer**.
- **`"use client"` files:** Are the component props expecting private data? Are the type
  signatures overly broad?
- **`"use server"` files:** Are the action arguments validated in the action or inside the
  DAL? Is the user **re-authorized inside the action**? Does the action **check ownership
  of the resource** (authorization, not just authentication)? Are return values filtered
  to only what the client needs? Is database access delegated to a `server-only` DAL?
- **`/[param]/`:** Folders with brackets are user input. Are params validated?
- **`proxy.ts` and `route.ts`:** These have a lot of power. Spend extra time auditing them
  with traditional techniques. Perform penetration testing or vulnerability scanning
  regularly. (`proxy.ts` is the Next.js 16 name for what earlier versions called
  `middleware.ts`; audit either filename the same way.)

## Related guidance

- Authentication: /docs/app/guides/authentication
- Content Security Policy: /docs/app/guides/content-security-policy
- Forms: /docs/app/guides/forms
- Server Actions: /docs/app/guides/server-actions
- Security and Server Actions blog post: https://nextjs.org/blog/security-nextjs-server-components-actions
