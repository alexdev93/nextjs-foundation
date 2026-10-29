# Lesson 8 — Redirects, Not Found and Auth Interrupts

## The problem

Routing isn't only "show page X for URL Y". You also need to:

- send users elsewhere (old URLs, logged-out users, after creating a resource),
- say "this doesn't exist" with a proper 404 that search engines respect,
- say "you're not signed in" (401) or "you're not allowed" (403),
- and do all of this **while streaming**, when HTTP headers may already be sent.

Next.js provides **control-flow functions that throw**, plus matching **UI files** that catch them.

## The functions at a glance

| Function (from `next/navigation`) | HTTP status | Caught by | Typical use |
| --- | --- | --- | --- |
| `redirect(url, type?)` | 307 (303 in Server Action form posts) | router | temporary moves, auth redirects, after mutations |
| `permanentRedirect(url, type?)` | 308 (303 in Server Action form posts) | router | slug changed forever, canonical URLs |
| `notFound()` | 404 | nearest `not-found.tsx` | missing record, invalid param |
| `forbidden()` *(experimental)* | 403 | nearest `forbidden.tsx` | signed in but lacks permission |
| `unauthorized()` *(experimental)* | 401 | nearest `unauthorized.tsx` | not signed in |

They all **throw** a special error (`NEXT_REDIRECT`, `NEXT_HTTP_ERROR_FALLBACK;404`, …) and have TypeScript return type `never`. So:

- you don't need `return redirect(...)`,
- code after the call never runs,
- TypeScript narrows the type after a guard: `if (!post) notFound()` → `post` is non-null below.

## `redirect` and `permanentRedirect`

```tsx
// app/team/[id]/page.tsx
import { redirect } from 'next/navigation'

async function TeamPage({ params }: PageProps<'/team/[id]'>) {
  const { id } = await params
  const team = await getTeam(id)
  if (!team) redirect('/teams')
  // team is non-null here
}
```

Where it works:

- ✅ Server Components, Server Actions/Functions, Route Handlers.
- ✅ **Client Components during render** (on the initial SSR it becomes a server redirect).
- ❌ **Client event handlers.** Use `router.push` there.

History behaviour (the `type` argument, from `RedirectType`):

- In **Server Actions** the default is `push` (Back returns to the form page).
- **Everywhere else** the default is `replace`.
- `type` has no effect in Server Components.

Why **307/308** instead of 302/301? Browsers change `POST` into `GET` on 302/301. 307/308 **keep the method**. Server Action form submissions are the exception: they use **303**, so the browser follows with a `GET`. With JS enabled, a Server Action redirect is a client-side navigation, not an HTTP redirect.

Absolute URLs work too: `redirect('https://example.com')`.

### Pitfall: `try/catch` swallows the redirect

```ts
// ❌ the catch block catches NEXT_REDIRECT, so the user is never redirected
'use server'
export async function createPost(formData: FormData) {
  try {
    const post = await db.post.create(/* ... */)
    redirect(`/posts/${post.id}`)
  } catch (e) {
    return { error: 'Failed' }
  }
}
```

```ts
// ✅ redirect outside try
'use server'
export async function createPost(formData: FormData) {
  let id: string
  try {
    id = (await db.post.create(/* ... */)).id
  } catch {
    return { error: 'Failed' }
  }
  redirect(`/posts/${id}`)
}
```

When you can't restructure, call `unstable_rethrow(e)` first in the catch. It re-throws Next's internal errors and lets you handle your own:

```ts
import { unstable_rethrow } from 'next/navigation'
try { /* ... may call notFound()/redirect() ... */ }
catch (e) {
  unstable_rethrow(e)
  // handle real errors here
}
```

The same applies to `notFound()`, `forbidden()`, `unauthorized()`.

## Where should a redirect live? (decision table)

| Situation | Best place | Why |
| --- | --- | --- |
| Fixed old → new URLs (`/blog/:slug` → `/news/:slug`) | `redirects` in `next.config.ts` | Runs before rendering, no code |
| Check before render based on a cookie/header (logged-out → `/login`), i18n locale detection | `proxy.ts` (`NextResponse.redirect`) | Runs before the route, can't be skipped by prefetch |
| Depends on data (record missing, slug renamed) | `redirect()`/`permanentRedirect()` in the Server Component | Needs the data |
| After a mutation (created item → its page) | `redirect()` in the Server Action | One round trip |
| After client-side logic (wizard finished) | `router.push()` | Event handler |
| Thousands of redirects from a CMS | Proxy + a fast lookup (e.g. a Bloom filter) | See `docs/02-guides/redirecting.md` "Managing redirects at scale" |

## `notFound()` and `not-found.tsx`

```tsx
// app/posts/[slug]/page.tsx
import { notFound } from 'next/navigation'

async function Post({ params }: Pick<PageProps<'/posts/[slug]'>, 'params'>) {
  const { slug } = await params
  const post = await getPost(slug)
  if (!post) notFound()
  return <article>{post.title}</article>
}
```

```tsx
// app/posts/[slug]/not-found.tsx  (segment-specific 404 UI)
import Link from 'next/link'
export default function NotFound() {
  return (
    <div>
      <h2>Post not found</h2>
      <Link href="/posts">All posts</Link>
    </div>
  )
}
```

Rules:

- `not-found.tsx` receives **no props**. It can be `async` and fetch data. If you need `usePathname`, use a Client Component and fetch on the client.
- The **root** `app/not-found.tsx` also handles **all unmatched URLs** in the app.
- The default 404 UI follows the OS color scheme, not your app theme. Provide your own `not-found.tsx` to match `next-themes` (this project uses it).
- Next injects `<meta name="robots" content="noindex">` automatically.
- `global-not-found.tsx` (experimental, `experimental.globalNotFound: true`) is a **full HTML document** used for unmatched URLs **without** rendering your layouts. Use it when you have **multiple root layouts** or a root layout under a dynamic segment (`app/[lang]/layout.tsx`). Import your global CSS/fonts inside it.

## `forbidden()` / `unauthorized()` (experimental)

Enable in `next.config.ts`:

```ts
experimental: { authInterrupts: true }
```

```tsx
// app/admin/page.tsx
import { forbidden, unauthorized } from 'next/navigation'
import { verifySession } from '@/server/auth/dal'

export default async function AdminPage() {
  const session = await verifySession()
  if (!session) unauthorized()            // → nearest unauthorized.tsx, 401
  if (session.role !== 'admin') forbidden() // → nearest forbidden.tsx, 403
  return <AdminDashboard />
}
```

- Not callable in the **root layout**.
- Must be in the **render path** (a component, or a function a component awaits). A call inside an un-awaited promise throws where nothing catches it, so no UI renders. Always `await`.
- Also works in Server Actions and Route Handlers.
- Phase 08 builds a real Data Access Layer around these.

## Status codes when streaming

This trips up experienced developers. HTTP headers, including the status, are sent **when streaming starts**. Streaming starts when the first `<Suspense>` fallback (or `loading.tsx`) renders, or a Server Component suspends inside a boundary.

| When the function is called | Result |
| --- | --- |
| **Before** streaming starts (top of page, before any Suspense) | Real HTTP status: 404 / 403 / 401 / 307 |
| **After** streaming started (inside a Suspense boundary) | Status stays **200**. Next renders the not-found/forbidden UI into the stream (or a client-side redirect via meta tag) **plus `noindex`** |

Is a "soft 404" with status 200 bad? For search engines `noindex` keeps it out of results. But if you **need** the real status code (compliance, analytics, API clients):

- do the existence check **before** any Suspense boundary, or
- do it in **`proxy.ts`** and rewrite to a not-found route or return a 404 response. Keep proxy checks **fast**: a key lookup, not a full content fetch.

⚡ Trade-off with Cache Components: checking before Suspense means awaiting data at the top of the page. That blocks the static shell and Partial Prefetching (Lesson 7). Usually: **keep the shell static and accept 200 + `noindex`**, or move existence checks to `proxy.ts` when the real status is required.

A page that calls `forbidden()`/`notFound()` **during prerendering** can still be fully static (○) and serve the right status.

## Tips & tricks

- **Validate params → `notFound()`** at the start of the data function. Combined with `asserts` types (Lesson 3) this gives clean narrowing.
- **Slug changed?** `permanentRedirect('/posts/' + post.currentSlug)` when `slug !== post.currentSlug`. This keeps SEO equity.
- **`redirect` after mutations** is one round trip: the action runs, revalidates, and the client navigates with fresh data.
- **Return-to URLs**: `redirect(`/login?next=${encodeURIComponent(path)}`)`, and **validate** `next` before using it (Lesson 5's `safeNext`).
- **Don't use `redirect` as a "router.push from the server"** inside data helpers shared by many pages. Prefer returning `null` and letting the page decide.

## Pitfalls

| Mistake | Symptom |
| --- | --- |
| `redirect()` inside `try` | Redirect never happens, your catch runs instead. |
| `redirect()` in `onClick` | Error. Use `router.push`. |
| `forbidden()` without `authInterrupts` | Error: experimental flag required. |
| Un-awaited helper that calls `notFound()` | `unhandledRejection: NEXT_HTTP_ERROR_FALLBACK;404`, no 404 UI. |
| Expecting status 404 for a `notFound()` inside Suspense | You get 200 + noindex. Move the check earlier or into proxy. |
| Redirect loops between proxy and page | Infinite 307s. Exclude the target path from the proxy matcher. |

## Source docs

- `node_modules/next/dist/docs/01-app/02-guides/redirecting.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/redirect.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/permanentRedirect.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/not-found.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/not-found.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/forbidden.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/unauthorized.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/unstable_rethrow.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/loading.md` (section "Status codes")
