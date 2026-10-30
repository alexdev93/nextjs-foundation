# Lesson 4 — Deduplication: `fetch` Memoization, `React.cache` and `'use cache'`

## The problem

"Fetch where you need it" means the same data function gets called from several places in one render: the layout needs the current user for the avatar, the page needs it for the greeting, a sidebar widget needs it for permissions. Without deduplication, that's three identical database queries **per request**.

Next and React give you three tools that sound similar but work at completely different scopes. Mixing them up is one of the most common sources of "why is this stale?" and "why is this running twice?" bugs.

## How it works

### The three tools

| | `fetch` memoization | `React.cache(fn)` | `'use cache'` |
| --- | --- | --- | --- |
| What | Automatic for `GET` `fetch` with the same URL + options | Wraps any async function | A directive on a function or component (⚡ Cache Components) |
| Scope | **One server render** (one request) | **One server request** | **Across requests and users** (persistent server cache) |
| Lifetime | Ends when the render ends | Ends when the request ends | Controlled by `cacheLife` (`seconds`, `minutes`, …) and invalidated with `cacheTag` / `revalidateTag` / `updateTag` |
| Key | URL + options | The function's arguments (each compared with `Object.is`) | Arguments + closed-over values, serialized |
| Stored where | Server memory for that render | Server memory for that request | Next's server cache (in-memory by default, configurable), also feeds the static shell and client cache |
| Use for | Free deduplication of identical fetches | Deduplicating ORM / SDK calls, request-scoped "context" (current user) | Sharing results between requests: catalogue data, CMS content, public API responses |

### `React.cache`: request-scoped memoization

```ts
// src/server/services/session.ts
import 'server-only'
import { cache } from 'react'

export const getCurrentUser = cache(async () => {
  const session = (await cookies()).get('session')?.value
  if (!session) return null
  return db.user.findFirst({ where: { session } })   // runs once per request
})
```

```tsx
// layout.tsx → await getCurrentUser()   (runs the query)
// page.tsx   → await getCurrentUser()   (same request: same promise, no query)
```

The roadmap's checkpoint question, answered: **`React.cache` stores results in memory on the server, scoped to the current request. When the request ends, the memo is thrown away.** Nothing is ever shared between two users or two requests.

Rules:

- **Define it at module scope.** `cache()` called inside a component creates a **new** cache on every render, which deduplicates nothing.
- **Arguments are compared by identity.** `getUser('1')` twice is a hit. `getPosts({ limit: 5 })` twice is a **miss**, because each `{ limit: 5 }` is a new object. Pass primitives.
- **Server only.** `React.cache` is for Server Components. In Client Components it doesn't memoize.
- **It caches the promise**, so concurrent callers share the in-flight request. That's what makes the preload pattern (Lesson 3) work.
- **Errors are cached too** for that request. A failed call won't be retried within the same render.

### `'use cache'`: persistent, cross-request (preview of Phase 04)

This repo's [post-service.ts](../../src/server/services/post-service.ts):

```ts
export async function getLatestPosts(limit = 6): Promise<Result<PostSummary[]>> {
  'use cache'
  cacheTag(POSTS_CACHE_TAG)
  const result = await fetchDemoPosts(limit)
  if (!result.ok) { cacheLife('seconds'); return result }
  cacheLife('minutes')
  return { ok: true, data: /* DTO mapping */ }
}
```

- The result is reused **across requests and users** for minutes.
- Because it's cached and not request-specific, it can be part of the **static shell**.
- It also deduplicates within a request, which is why the `signal` on the inner `fetch` (which disables memoization) doesn't matter here.

**Never put per-user data in a plain `'use cache'` function.** It's shared. Inside `'use cache'` you **can't** call `cookies()` or `headers()` directly. Read them outside and pass the values in as arguments (they become part of the key), or use:

### `'use cache: private'`

For functions that read `cookies()` / `headers()`. The result is **not** stored in the shared server cache. In production, matching calls within one request reuse the same result, so it works with the preload pattern for personalized data. Phase 04 covers the details.

### Which one should I use?

```txt
Is the data the same for every user (or keyed only by public inputs like a slug)?
├─ yes → 'use cache' (+ cacheLife, cacheTag)                    → shared, persistent
└─ no, it depends on the user / cookies / headers
   ├─ plain fetch with the same URL? → already memoized per render
   ├─ ORM / SDK call?               → React.cache                → per request
   └─ want Cache Components semantics (preload, prefetch)? → 'use cache: private'
```

They combine well: a `React.cache` wrapper for the current user, calling services that use `'use cache'` for public data.

## Examples

### Example 1 — Count the calls

```ts
// src/server/services/count-demo.ts
import 'server-only'
import { cache } from 'react'

let calls = 0
export const getThing = cache(async (id: string) => {
  calls++
  console.log(`[getThing] call #${calls} for ${id}`)
  return { id }
})
```

Call `getThing('a')` from a layout, a page and a nested component. Check the terminal: one log per request. Remove `cache(...)` and see three. Then call it with `{ id: 'a' }` objects instead of strings and see the cache miss.

### Example 2 — Shared vs per request

Make two versions of a "current time" function:

1. `React.cache(async () => new Date().toISOString())`: refresh the page, and the time changes every request.
2. `'use cache'` + `cacheLife('minutes')`: refresh, and the time stays the same for a few minutes, for **everyone**.

That one experiment is the whole difference between the two.

## Tips & tricks

- **Wrap the service, not the call site.** Export the cached function from `src/server/services/`, so every caller gets deduplication.
- **`React.cache` is your server-side "context".** Use it for request-scoped values (current user, locale, feature flags), not props.
- **Prefer primitive arguments** for both `React.cache` and `'use cache'`. They're simpler keys and avoid identity misses.
- **Don't cache in an integration.** Integrations stay dumb (Lesson 1). Caching is a service-level decision.

## Pitfalls

| Mistake | Symptom |
| --- | --- |
| `cache()` called inside a component | No deduplication at all |
| Object arguments to `React.cache` | Cache miss every call |
| Per-user data in `'use cache'` | **One user's data shown to another.** A security bug |
| `cookies()` / `headers()` / `searchParams` inside `'use cache'` (even through a helper it calls) | `next-request-in-use-cache` error. On a dynamic route it can pass `next build` and only fail under `next start`. Read outside and pass values in, or use `'use cache: private'` |
| Expecting `React.cache` to persist between requests | It runs again on every request. Use `'use cache'` |
| `fetch` with a `signal` and no outer cache | Same request runs several times in one render |

## Where it's used

- **Current user / session:** `React.cache` in a session service, called from layouts, pages and Server Functions.
- **Public content** (posts, products, CMS pages): `'use cache'` services with tags, revalidated on change.
- **Personalized but repeated reads** (a user's cart in header and page): `React.cache` or `'use cache: private'`.

## Source docs

- `node_modules/next/dist/docs/01-app/01-getting-started/06-fetching-data.md` (sections "Reusing data with `React.cache`" and "Preloading data")
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/fetch.md` (section "Memoization")
- `node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-cache.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-cache-private.md`
- React docs: `cache` (react.dev/reference/react/cache), especially "Caveats"
