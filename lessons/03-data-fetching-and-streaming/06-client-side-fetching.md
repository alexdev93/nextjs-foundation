# Lesson 6 — Client-Side Fetching: When It's Still Right

## The problem

After learning Server Components, it's tempting to never fetch in the browser again. But some data **only makes sense after the page is interactive**:

- Results that depend on what the user is typing (autocomplete).
- Data that must stay fresh while the page is open (polling, notifications, live prices).
- Data that depends on browser-only state (geolocation, `localStorage`).
- Infinite scroll, or "load more".

The opposite mistake is worse: `useEffect(() => fetch(...))` for data the server already knew when it rendered the page. That gives you a blank state, a spinner, a waterfall after hydration, and often a public API route that didn't need to exist.

## How it works

### Decision table

| Situation | Use |
| --- | --- |
| Data needed for the first render, known on the server | **Server Component** (Lessons 1–5) |
| A Client Component needs server data **once** (for example to sort or filter it locally) | **Pass a Promise, unwrap with `use()`** (Phase 02, Lesson 4) |
| Data requested by a user interaction (a button, typing) | Event handler → **Server Function** or a **Route Handler** |
| Shared browser cache, focus revalidation, polling, optimistic updates across components | **SWR** or **TanStack Query** |
| Initial data from the server **and** a browser cache afterwards | Server provides initial data → library takes over (`<SWRConfig fallback>` / `<HydrationBoundary>`) |

The docs say it plainly: **many apps don't need a client data-fetching library.** Add one when Client Components need a **shared browser cache**.

### This repo's example: an event-driven fetch

[health-status.tsx](../../src/client/components/health-status.tsx) fetches only when the user clicks:

```txt
HealthStatus (client)  ──onClick──►  fetchHealth()  (src/client/services/health-client.ts)
                                       └─ fetch('/api/health', { cache: 'no-store' })
                                            └─ src/app/api/health/route.ts  (await connection(), fresh timestamp)
```

The client side mirrors the server's layers:

- **Client service** ([health-client.ts](../../src/client/services/health-client.ts)): calls the endpoint, checks `response.ok`, **validates the JSON with the shared Zod schema** ([src/shared/schemas/health.ts](../../src/shared/schemas/health.ts)), and returns a `Result`.
- **Route Handler**: `await connection()` so it's never prerendered, plus `Cache-Control: no-store`.
- **Shared schema**: the same Zod schema types the response on both sides.

Here the data is requested by an interaction, so client fetching is the right call.

### Three loading patterns with a library

| Pattern | SWR | TanStack Query | When data is available |
| --- | --- | --- | --- |
| Inline loading states | `useSWR` | `useQuery` | Browser request after hydration |
| Suspense loading states | `useSWR(..., { suspense: true })` | `useSuspenseQuery` | Browser request after hydration |
| Provided by the server | `<SWRConfig fallback>` | `<HydrationBoundary>` | In the first render, or streamed |

"Provided by the server" is the best of both: the server sends the initial data in the RSC payload (no loading spinner on first paint), and the library keeps it fresh in the browser.

```tsx
// page.tsx (server)
import { SWRConfig } from 'swr'
import { getLatestPosts } from '@/server/services/post-service'
import { PostFeed } from './post-feed'   // 'use client', uses useSWR('/api/posts')

export default function Page() {
  return (
    <Suspense fallback={<FeedSkeleton />}>
      <Feed />
    </Suspense>
  )
}

async function Feed() {
  const posts = await getLatestPosts()
  return (
    <SWRConfig value={{ fallback: { '/api/posts': posts } }}>
      <PostFeed />
    </SWRConfig>
  )
}
```

This needs **SWR 2.3+ with React 19**, which lets a Server Component render `<SWRConfig>` directly. Notes:

- The value under the key must be serializable (Phase 02, Lesson 3), and the client key must match the server key **exactly**.
- The `fallback` value can also be an **unawaited Promise** (`fallback: { [key]: getProduct(id) }`). Then only the components that read that key suspend, and the rest of the subtree renders immediately. The SWR guide in the docs uses this form.
- Scope `<SWRConfig>` to the segment that owns the data, not a shared layout.

### Three cache layers to keep in sync

With Cache Components and a client library, the same data can live in three places:

| Layer | What it stores | Freshness control |
| --- | --- | --- |
| Next.js server cache | `'use cache'` results and component output | `cacheLife` `revalidate` / `expire` |
| Next.js client cache | RSC payloads of visited / prefetched routes | `cacheLife` `stale` |
| Client library cache | Browser data under an SWR / TanStack key | The library's options and mutations |

They don't need the same durations, but after a **mutation** you must update all of them: update or invalidate the library key in the browser, and call `updateTag` / `revalidateTag` on the server so the next server render is fresh too (Phase 05).

### If you do fetch in `useEffect`

For a one-off, interaction-driven fetch without a library, handle races and unmounts:

```tsx
useEffect(() => {
  const controller = new AbortController()
  fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: controller.signal })
    .then((r) => r.json())
    .then(setResults)
    .catch((e) => { if (e.name !== 'AbortError') setError(e) })
  return () => controller.abort()   // a newer query cancels the older one
}, [q])
```

Without the abort, a slow response for `"ne"` can arrive after the response for `"next"` and overwrite it. Libraries handle this for you.

## Examples

### Example 1 — Replace an effect with server data

Write a Client Component that fetches `/api/posts` in `useEffect` and shows a spinner. Then rewrite it so the page passes `getLatestPosts()` as a Promise and the component calls `use()`. Compare the first paint of both with network throttling on.

### Example 2 — Autocomplete

Build a search box that queries a Route Handler as the user types, debounced 250 ms, with `AbortController`. Validate the response with a schema in `src/shared/schemas/`, following [health-client.ts](../../src/client/services/health-client.ts).

### Example 3 — Polling with a library (optional)

`pnpm add swr`. Poll `/api/health` every 5 s with `useSWR('/api/health', fetchHealthFetcher, { refreshInterval: 5000 })`. Provide the first value from the server with `<SWRConfig fallback>`. Remove the package afterwards if you don't keep it.

## Tips & tricks

- **Start with the server.** Only move a fetch to the client when the data depends on interaction, browser state, or needs to stay live.
- **Validate on the client too.** A Route Handler is an external boundary for the browser. Parse responses with shared schemas, as `health-client.ts` does.
- **Relative URLs only work in the browser.** `fetch('/api/x')` is fine in a Client Component but fails in a Server Component (no origin), which is another reason not to call your own Route Handlers from the server.
- **Server Functions for mutations, Route Handlers for reads by others.** A Server Function is the simplest way for your own UI to change data (Phase 05). A Route Handler is a stable HTTP API for anyone.

## Pitfalls

| Mistake | Symptom |
| --- | --- |
| `useEffect` fetch for data known at render time | Spinner on every load, extra round trip, worse LCP |
| No abort / race handling | Stale results overwrite newer ones |
| Library key differs from the server `fallback` key | Initial data is ignored and fetched again |
| Mutating without invalidating server caches | The browser shows new data, then a navigation brings back old server data |
| Unvalidated JSON from your own endpoint | Runtime crashes when the API shape changes |

## Where it's used

- **Search / autocomplete, infinite scroll, live notifications, chat.**
- **Dashboards that poll** for new metrics while open.
- **Apps with a lot of client interactivity** (editors, kanban boards) using TanStack Query with server-provided initial data.

## Source docs

- `node_modules/next/dist/docs/01-app/02-guides/client-side-data-fetching/index.md`
- `node_modules/next/dist/docs/01-app/02-guides/client-side-data-fetching/swr.md`
- `node_modules/next/dist/docs/01-app/02-guides/client-side-data-fetching/tanstack-query.md`
- `node_modules/next/dist/docs/01-app/02-guides/interactive-apps.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md`
