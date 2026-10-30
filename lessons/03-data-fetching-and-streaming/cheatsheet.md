# Data Fetching & Streaming Cheat Sheet (Next 16.4, Cache Components)

## Sources

```tsx
const res = await fetch(url)            // Server Component: not cached, memoized per render
const rows = await db.post.findMany()   // ORM: no automatic memoization → React.cache
```

| `fetch` option | Meaning |
| --- | --- |
| *(default)* | Not cached. ⚡ must be inside `<Suspense>` or `'use cache'` |
| `cache: 'no-store'` | Always remote |
| `cache: 'force-cache'` | Server data cache (URL, method, headers, body). Only 200s stored |
| `next: { revalidate: n }` / `next: { tags: [...] }` | Lifetime / tags |
| `signal` | **Disables memoization** |

## This repo's layers

```txt
page (render) → src/server/services (shape, DTO, 'use cache') → src/server/integrations (fetch, timeout, Zod, Result) → src/server/config/env.ts
```

## Async request APIs (sync access removed in 16)

| API | Await it |
| --- | --- |
| `params`, `searchParams` | `await params` / pass the promise down / `use(params)` on the client |
| `cookies()`, `headers()`, `draftMode()` | `await cookies()` (from `next/headers`) |
| `connection()` (`next/server`) | Request-time, **blocks prefetch** |
| `io()` (`next/cache`, 16.3+) | Request-time, **prefetchable**. Prefer under ⚡ |

⚡ Rule: request-time or uncached `await` → inside `<Suspense>`. **Await late, await low.**

Build errors: `Next.js encountered runtime data during prerendering` · `... uncached data during prerendering`. Fixes: **[stream]** Suspense · **[cache]** `'use cache'` · **[block]** `export const instant = false`.

## Waterfalls

| Approach | Total | Content appears |
| --- | --- | --- |
| `await a; await b; await c` | a + b + c | at the end |
| `await Promise.all([a, b, c])` | max | together |
| sibling `<Suspense>` per part | max | **each when ready** |

- `Promise.allSettled` / `Result<T>` so one failure doesn't break everything.
- Preload: `void getItem(id)` before blocking work. Needs deduplication (`fetch`, `React.cache`, `'use cache'`).
- Layouts and pages render in parallel. Waterfalls come from awaits inside one component, or a parent awaiting before rendering a fetching child.

## Deduplication

| | Scope | Lifetime |
| --- | --- | --- |
| `fetch` memoization | One render | That render |
| `React.cache(fn)` | One request | That request. Args compared with `Object.is`, module scope only |
| `'use cache'` | **All requests and users** | `cacheLife`, `cacheTag` → `revalidateTag` / `updateTag` |
| `'use cache: private'` | One request (not stored across requests) | Can read `cookies()` / `headers()` |

❌ `cookies()` inside `'use cache'` → `next-request-in-use-cache`. ❌ Per-user data in `'use cache'` → data leak.

## Streaming

```text
chunk 0: shell + fallbacks + <template id="B:0">   chunk 1: payload (self.__next_f.push)
chunk n: <div hidden id="S:0">…</div> + swap <script>
```

| | `loading.tsx` | `<Suspense>` |
| --- | --- | --- |
| Scope | Whole segment page | Any component |
| Prefetched as instant fallback | ✅ | ❌ by default |
| Covers sibling layout | ❌ | — |

- **Status is sent with the first byte.** `notFound()` mid-stream → 200 + `noindex`. `redirect()` mid-stream → client redirect. Check before the first boundary, or in `proxy`.
- Error mid-stream → nearest `error.tsx` replaces only that section.
- Bots (HTML-limited): no streaming, full document. ⚡ They render dynamically, not from the shell.
- LCP outside boundaries. Skeletons the same size as the content (CLS).
- Verify: Node stream-reader script with `Accept-Encoding: identity`, or `curl -N`. Check proxy buffering.

## Client fetching

| Need | Use |
| --- | --- |
| Server data once in a Client Component | Promise prop + `use()` |
| Interaction-driven | Event handler → Server Function / Route Handler |
| Shared browser cache, polling, focus revalidation | SWR / TanStack Query |
| Initial data + live updates | `<SWRConfig fallback>` (SWR 2.3+) / `<HydrationBoundary>` |

- Validate client responses with shared Zod schemas ([health-client.ts](../../src/client/services/health-client.ts)).
- `useEffect` fetch → `AbortController` to avoid races.
- Never `fetch('/api/...')` your own app from a Server Component.
