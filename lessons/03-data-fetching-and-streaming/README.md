# Phase 03 — Data Fetching & Streaming

> Written for **Next.js 16.4.3** and **React 19.3** with this project's config:
> `cacheComponents: true`, `partialPrefetching: true`, `typedRoutes: true`, `reactCompiler: true`.
> Behaviour that changes because of those flags is marked **⚡ Cache Components**.

## Goal of this phase

Fetch data on the server efficiently and stream UI progressively.

When you finish, you should be able to:

1. Fetch from an API or a database directly in a Server Component, through a clean service layer like this repo's `src/server/services` → `src/server/integrations`.
2. Use the async request APIs (`params`, `searchParams`, `cookies()`, `headers()`, `draftMode()`) without blocking more of the page than necessary.
3. Spot a request waterfall and remove it with `Promise.all`, preloading, or sibling `<Suspense>` boundaries.
4. Explain the difference between `fetch` memoization, `React.cache` and `'use cache'`, and pick the right one.
5. Place `loading.tsx` and `<Suspense>` boundaries on purpose, and explain what the browser receives in each chunk of a streamed response.
6. Decide when client-side fetching (SWR, TanStack Query, a Route Handler) is still the right choice.

## Lessons (read in order)

| # | File | What you learn | Time |
| --- | --- | --- | --- |
| 1 | [01-fetching-in-server-components.md](01-fetching-in-server-components.md) | `fetch` vs DB, defaults under Cache Components, memoization, the service / integration layers in this repo | 2 h |
| 2 | [02-async-request-apis.md](02-async-request-apis.md) | `params`, `searchParams`, `cookies()`, `headers()`, `draftMode()`, `connection()`, `io()`, and how far each one "blocks" | 2 h |
| 3 | [03-waterfalls-and-parallel-fetching.md](03-waterfalls-and-parallel-fetching.md) | Sequential vs parallel, `Promise.all` / `allSettled`, the preload pattern, parallel segments | 1.5 h |
| 4 | [04-deduplication-react-cache-vs-use-cache.md](04-deduplication-react-cache-vs-use-cache.md) | `fetch` memoization, `React.cache`, `'use cache'`, `'use cache: private'`: scope and lifetime of each | 1.5 h |
| 5 | [05-streaming-loading-and-suspense.md](05-streaming-loading-and-suspense.md) | How HTML streaming works, the static shell, `loading.tsx` vs `<Suspense>`, status codes, bots, Web Vitals | 3 h |
| 6 | [06-client-side-fetching.md](06-client-side-fetching.md) | When to fetch in the browser, `use()` vs SWR / TanStack Query, Route Handlers, coordinating caches | 1.5 h |
| 7 | [07-exercises.md](07-exercises.md) | A hands-on lab in this repo plus checkpoint questions (answers hidden) | 6–8 h |
| — | [cheatsheet.md](cheatsheet.md) | One-page summary for quick review | — |

## How to study each lesson

Same format as Phases 01 and 02: **The problem → How it works → Examples → Tips & tricks → Pitfalls → Where it's used → Source docs.** Nothing in this folder has been added to `src/`. You write it.

Recommended loop:

1. Read the lesson once without coding.
2. Type the examples in a scratch route such as `src/app/examples/data/...`.
3. Add artificial delays so you can **see** waterfalls and streaming. A helper is in [07-exercises.md](07-exercises.md).
4. Write 5–10 lines in `notes.md` in this folder, in your own words.
5. Do the matching exercise.

## Three things to remember the whole time

1. **⚡ Under Cache Components, every page must produce a static shell.** Uncached data and request-time data (`params` without `generateStaticParams`, `cookies()`, `headers()`, uncached `fetch`) must sit inside `<Suspense>`, or the build fails with `Next.js encountered uncached data during prerendering` or `... runtime data during prerendering`. Most lessons in this phase come back to this rule.
2. **Streaming only shows its real timing in production.** Use `pnpm build && pnpm start` for anything you measure. `pnpm dev` renders on demand, has an HMR fetch cache, and adds dev-only overhead.
3. **Fetch where you need the data.** Memoization and `React.cache` make it cheap to call the same data function in a layout, a page and a component. Don't drill props to save a request.
