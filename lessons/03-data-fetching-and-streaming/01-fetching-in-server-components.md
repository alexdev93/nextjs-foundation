# Lesson 1 — Fetching in Server Components

## The problem

In the Pages Router (and in plain React), data fetching was split from rendering:

- `getServerSideProps` / `getStaticProps` ran **before** the page rendered, at the top of the tree only. Every component's data had to be fetched there and drilled down.
- In client-only React, components fetched in `useEffect` **after** mounting, with a loading state, a waterfall for nested components, and an API route in between for anything secret.

Server Components (Phase 02) can be `async` and read data **during their own render**, on the server. That removes the separate loader step, but it raises new questions: what does `fetch` cache by default, what happens when two components ask for the same data, and where should the data-access code live?

## How it works

### Two kinds of data sources

**1. `fetch`.** Next extends the Web `fetch` on the server:

```tsx
export default async function Page() {
  const res = await fetch('https://api.example.com/posts')
  const posts: Post[] = await res.json()
  return <PostList posts={posts} />
}
```

**2. Anything async: an ORM, a database driver, the file system, an SDK.** Credentials and queries stay on the server because Server Component code never ships:

```tsx
import { db } from '@/server/db'

export default async function Page() {
  const posts = await db.post.findMany({ take: 10 })
  return <PostList posts={posts.map(toPostDTO)} />   // DTO: Phase 02, Lesson 3
}
```

### What `fetch` does by default in Next 16

| Option | Behaviour |
| --- | --- |
| *(default)* | **Not cached.** Runs on every request (and once at build if the route is prerendered without request-time APIs) |
| `cache: 'no-store'` | Always fetches from the remote server |
| `cache: 'force-cache'` | Uses Next's server-side data cache, keyed by URL, method, headers and body. Only `200` responses are stored |
| `next: { revalidate: n }` | Cache for at most `n` seconds |
| `next: { tags: ['x'] }` | Tag the entry for `revalidateTag('x')` |

> **⚡ Cache Components:** an uncached `fetch` is **request-time work**. It must sit inside `<Suspense>`, or be cached with `'use cache'`, or the build fails:
>
> `Route "/x": Next.js encountered uncached data during prerendering.`
>
> The error lists three fixes: **[stream]** wrap it in `<Suspense>`, **[cache]** add `'use cache'`, **[block]** `export const instant = false`. In this project, prefer `'use cache'` on the data function (Phase 04) or `<Suspense>`. The `fetch` cache options above still work, but `'use cache'` is the main caching tool with Cache Components.

### Memoization: same `fetch`, one request

During **one server render**, `GET` requests with the **same URL and options** are memoized. Call the same `fetch` in a layout, a page and three components, and it runs once. That's why "fetch where you need it" is the App Router convention.

Details that matter:

- It's **per render pass** (per request), not a persistent cache.
- It applies to Server Components, layouts, pages, `generateStaticParams` and `generateViewport`. It does **not** apply in Route Handlers, because they aren't part of the React tree.
- **Passing a `signal` opts out.** This repo's [demo-api.ts](../../src/server/integrations/demo-api.ts) uses `signal: AbortSignal.timeout(5000)`, so that `fetch` is **not** memoized. That's fine there, because the service above it is `'use cache'` (Lesson 4), but it's a trap if you add a timeout to an otherwise uncached fetch and expect deduplication.
- For non-`fetch` sources (ORM, SDK), there's no automatic memoization. Use `React.cache` (Lesson 4).

### The service layer pattern in this repo

```txt
src/app/examples/server/page.tsx        page: rendering only
  └─ src/server/services/post-service.ts     service: business shape, caching, DTOs
       └─ src/server/integrations/demo-api.ts    integration: HTTP, timeouts, validation
            └─ src/server/config/env.ts              config: validated env (server-only)
```

What each layer owns:

| Layer | File | Responsibility |
| --- | --- | --- |
| Integration | [demo-api.ts](../../src/server/integrations/demo-api.ts) | Build the URL from `env`, call `fetch` with a timeout, check `response.ok`, **validate the payload with Zod**, map failures to a `Result` instead of throwing, log details server-side only |
| Service | [post-service.ts](../../src/server/services/post-service.ts) | `'use cache'` + `cacheTag` + `cacheLife`, map raw rows to a minimal `PostSummary` DTO, decide the cache lifetime for failures (`seconds`) vs successes (`minutes`) |
| Page | [examples/server/page.tsx](../../src/app/examples/server/page.tsx) | Call the service inside `<Suspense>`, render success and error states |

Why it's built like this:

- **Every module imports `server-only`**, so none of this can reach the client graph (Phase 02, Lesson 5).
- **`Result<T>` instead of exceptions** ([result.ts](../../src/shared/types/result.ts)). Expected failures (API down, bad payload) are values the page renders as UI. Exceptions are for real bugs and go to `error.tsx`.
- **Validate at the edge.** External data is untrusted. Zod parses it once in the integration, so everything above works with typed data.
- **User-facing errors are generic.** The integration logs `z.prettifyError(...)` on the server and returns "The demo API returned an unexpected payload." to the UI.
- **The cache lives in the service, not the page.** Every caller gets the same caching rules.

### Don't call your own Route Handlers from Server Components

```tsx
// ❌ An extra HTTP hop to your own server, and it needs an absolute URL
const res = await fetch('http://localhost:3000/api/posts')

// ✅ Call the service directly
const posts = await getLatestPosts()
```

Route Handlers ([src/app/api/health/route.ts](../../src/app/api/health/route.ts)) are for **external** callers: the browser, webhooks, mobile apps (Lesson 6 and Phase 06).

### Seeing fetches in development

```ts
// next.config.ts
logging: { fetches: { fullUrl: true } },
```

The terminal then shows each `fetch` with its cache status. Fetches restored from the dev-only **HMR cache** (fetch results kept across hot reloads) aren't logged unless you also set `hmrRefreshes: true`. That HMR cache is why "uncached" data can look stale while you edit code. A full reload or a navigation clears it.

## Examples

### Example 1 — A typed integration function

Follow the style of [demo-api.ts](../../src/server/integrations/demo-api.ts) for a second endpoint:

```ts
// src/server/integrations/demo-api.ts (add)
const userSchema = z.object({ id: z.number(), name: z.string(), email: z.email() })
export type DemoUser = z.infer<typeof userSchema>

export async function fetchDemoUser(id: number): Promise<Result<DemoUser>> {
  const url = new URL(`/users/${id}`, env.DEMO_API_URL)
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (response.status === 404) return { ok: false, error: 'User not found.' }
    if (!response.ok) return { ok: false, error: `The demo API responded with HTTP ${response.status}.` }
    const parsed = userSchema.safeParse(await response.json())
    return parsed.success ? { ok: true, data: parsed.data } : { ok: false, error: 'Unexpected payload.' }
  } catch {
    return { ok: false, error: 'The demo API is unreachable.' }
  }
}
```

Then add a service function that returns only `{ id, name }`. Leave `email` out of the DTO, since the UI doesn't need it.

### Example 2 — Prove memoization

```tsx
async function A() { const r = await fetch('https://jsonplaceholder.typicode.com/todos/1'); return <p>A {(await r.json()).id}</p> }
async function B() { const r = await fetch('https://jsonplaceholder.typicode.com/todos/1'); return <p>B {(await r.json()).id}</p> }
// Render <A /> and <B /> inside one <Suspense>, with logging.fetches on.
```

The terminal should show **one** request. Add `{ signal: AbortSignal.timeout(5000) }` to one of them and you'll see two.

## Tips & tricks

- **Return `Result`, render both branches.** The `Posts` component in [examples/server/page.tsx](../../src/app/examples/server/page.tsx) renders an alert card for `!posts.ok`. The page stays useful when the API is down.
- **Short cache life for failures.** `post-service.ts` uses `cacheLife("seconds")` on errors, so a failure isn't cached for minutes. Its comment explains that short-lived entries are left out of the static shell.
- **Timeouts on every external call.** Without one, a hanging API holds a Suspense boundary open until the platform's function timeout.
- **Keep integrations dumb.** No caching or UI decisions there. That makes them easy to unit test (see [post-service.test.ts](../../src/server/services/post-service.test.ts) for the service side).

## Pitfalls

| Mistake | Symptom |
| --- | --- |
| Uncached `fetch` outside `<Suspense>` (⚡) | Build error: `encountered uncached data during prerendering` |
| Expecting `fetch` to be cached by default (Next 13/14 habit) | Every request hits the API |
| Adding `signal` and expecting memoization | The same URL is fetched several times in one render |
| Fetching your own `/api/...` from a Server Component | Extra latency, absolute-URL bugs, missing cookies |
| Passing raw API / ORM objects to Client Components | Leaks fields, or fails on class instances (Phase 02) |
| Throwing on expected failures | The whole segment shows `error.tsx` instead of an inline message |

## Where it's used

- **Any page that reads data:** a service function called from a Server Component inside `<Suspense>`.
- **Third-party APIs:** an integration module per provider (payments, CMS, search) with Zod validation and timeouts.
- **Databases:** the ORM client in `src/server/db.ts` (with `server-only`), called from services, never from pages directly.

## Source docs

- `node_modules/next/dist/docs/01-app/01-getting-started/06-fetching-data.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/fetch.md` (options and "Memoization")
- `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/logging.md`
- `node_modules/next/dist/docs/01-app/02-guides/data-security.md` (section "Data Access Layer")
