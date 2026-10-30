# Lesson 7 — Exercises (Hands-On Lab) and Checkpoint

All exercises go inside **`src/app/examples/data/`**. Nothing here is pre-built. You write all of it.

**Before you start**

- Measure in **`pnpm build && pnpm start`**. `pnpm dev` timings are misleading (on-demand compilation, HMR fetch cache).
- Turn on fetch logging in [next.config.ts](../../next.config.ts) while you work: `logging: { fetches: { fullUrl: true } }`. Remove it when you're done.
- Run `pnpm check && pnpm typecheck` after each exercise.
- Save every error and every measurement in `notes.md`.

### The `slow()` helper

Under ⚡ Cache Components, a fake delay has to be **request-time work**, or it either gets baked into the static shell or fails the build. Mark it with `io()` first:

```ts
// src/server/services/slow-demo.ts
import 'server-only'
import { io } from 'next/cache'

export async function slow<T>(label: string, ms: number, value: T): Promise<T> {
  await io()                                   // request-time: never part of the shell
  const start = Date.now()
  await new Promise((r) => setTimeout(r, ms))
  console.log(`[slow] ${label} took ${Date.now() - start}ms`)
  return value
}
```

---

## Exercise 1 — Study the service layer (Lesson 1)

Read [post-service.ts](../../src/server/services/post-service.ts), [demo-api.ts](../../src/server/integrations/demo-api.ts), [env.ts](../../src/server/config/env.ts) and [post-service.test.ts](../../src/server/services/post-service.test.ts). Answer in `notes.md`:

1. What happens, step by step, when the demo API returns HTTP 500? What does the user see, and for how long is that result cached?
2. Why does `demo-api.ts` return `Result` instead of throwing? Which failures **should** still throw?
3. The `fetch` in `demo-api.ts` passes a `signal`. What does that do to memoization, and why doesn't it matter here?
4. Set `DEMO_API_URL=not-a-url` in `.env.local` and start the app. Where does it fail, and why is failing there better than failing in a page? Remove it afterwards.

Then add `fetchDemoUser` and a `getUserSummary` service from Lesson 1, Example 1, with a unit test following the existing test file's style.

---

## Exercise 2 — Async request APIs under Cache Components (Lesson 2)

1. Build `examples/data/blocking/` with a layout that does `await cookies()` at the top. Run `pnpm build` and save the error.
2. Fix it by pushing the cookie read into a `<UserBadge />` inside `<Suspense>`.
3. Build `examples/data/products/` reading `q` and `page` from `searchParams`, validated with Zod, inside Suspense.
4. Add a client `<SortSelect />` that changes `?sort=` with `useRouter().replace`. Read the current value with `useSearchParams()`. Remove its Suspense boundary and read the build error.
5. Make two clocks, one after `await io()` and one after `await connection()`. In production, hover a `<Link>` to the page and check which one's content arrives in the prefetch.

---

## Exercise 3 — Three ways to fetch, measured (Lessons 3 + 5)

Build `examples/data/waterfall/{sequential,parallel,suspense}/page.tsx`, each using `slow('a', 400)`, `slow('b', 1200)`, `slow('c', 2500)`.

| Version | Implementation |
| --- | --- |
| `sequential` | One async component that awaits a, then b, then c, inside one `<Suspense>` |
| `parallel` | One async component with `Promise.all([a, b, c])`, inside one `<Suspense>` |
| `suspense` | Three async components, each in its own `<Suspense>` |

Measure each with the stream observer from Lesson 5 (or `curl -N -H 'Accept-Encoding: identity'`) and fill in:

| Version | TTFB | a visible | b visible | c visible | Total |
| --- | --- | --- | --- | --- | --- |
| sequential | | | | | |
| parallel | | | | | |
| suspense | | | | | |

Explain in `notes.md` why TTFB is about the same for all three (⚡ static shell) while time-to-content differs.

Bonus: `curl -w 'TTFB %{time_starttransfer}s total %{time_total}s\n' -o /dev/null -s -H 'Accept-Encoding: identity' http://localhost:3000/examples/data/waterfall/suspense`

---

## Exercise 4 — Deduplication (Lesson 4)

1. Build `getThing` with a call counter (Lesson 4, Example 1). Call it from the layout, the page and two nested components of `examples/data/dedupe/`. One call per request?
2. Remove `cache()`: how many calls now?
3. Call it with object arguments. Explain the result.
4. Build the "current time" comparison: `React.cache` vs `'use cache'` + `cacheLife('minutes')`. Open the page in two browsers. Which one shows the same time to both?
5. Implement the preload pattern for an `<Item id>` behind a slow `checkIsAvailable()`. Use the `[slow]` logs to prove the two requests overlap.

---

## Exercise 5 — Streaming details (Lesson 5)

1. Build `examples/data/streaming/` with three sibling boundaries. Run the stream observer and find the `<template id="B:…">` placeholders and the `<div hidden id="S:…">` replacements in the output.
2. Repeat with `'User-Agent': 'Twitterbot/1.0'`. What changes?
3. Make one section throw. Add `error.tsx`. Confirm the other sections still stream and the status is 200.
4. Build `examples/data/post/[slug]/` with `notFound()` **inside** and then **before** the Suspense boundary. Compare `curl -I` status codes and look for `noindex` in the HTML.
5. Design skeletons that match the final content's size. Check CLS with the Lighthouse panel or the Performance panel before and after.

---

## Exercise 6 — Client fetching (Lesson 6)

1. Rewrite a `useEffect` fetch to a server Promise + `use()`, and compare the first paint with "Slow 4G" throttling.
2. Build an autocomplete backed by a Route Handler with debounce + `AbortController` + Zod validation.
3. (Optional, with `swr`) Poll `/api/health` every 5 s with the first value provided by `<SWRConfig fallback>` from a Server Component.

---

## Checkpoint

Answer without notes, then check.

1. Where does `React.cache` store data, and for how long?

   <details><summary>Answer</summary>

   In server memory, scoped to the current request. It's discarded when the request ends, and nothing is shared between requests or users. It caches the promise, so concurrent callers in the same request share one in-flight call.

   </details>

2. Why does awaiting `cookies()` high in a layout affect the whole subtree?

   <details><summary>Answer</summary>

   The `await` is where rendering starts depending on the request. Everything below it (up to the nearest Suspense boundary) has to wait for request-time data, so none of it can be in the prerendered static shell, and every navigation waits for it. Under Cache Components it's a build error unless it's inside Suspense. Push the cookie read into a small component inside its own boundary.

   </details>

3. Is `fetch` cached by default in Next 16?

   <details><summary>Answer</summary>

   No. It's memoized within one render (same URL + options, `GET`, no `signal`), but not cached across requests. Under Cache Components an uncached `fetch` must be inside Suspense or wrapped in `'use cache'`.

   </details>

4. `Promise.all` vs sibling `<Suspense>`: when do you pick each?

   <details><summary>Answer</summary>

   Both are parallel. `Promise.all` makes all content wait for the slowest request, so use it when the pieces must appear together. Sibling boundaries let each piece stream in as soon as it's ready, which is the better default for independent sections.

   </details>

5. Why does `/lessons/nope` return status 200?

   <details><summary>Answer</summary>

   `notFound()` runs inside a Suspense boundary, after streaming has started. The `200` was already sent with the first chunk, so Next injects `<meta name="robots" content="noindex">` instead of changing the status. For a real 404, check before the first boundary, or in `proxy`.

   </details>

6. `io()` vs `connection()`?

   <details><summary>Answer</summary>

   Both exclude what follows from the static shell. `connection()` waits for a real user request, so it also blocks prefetching. `io()` suspends like normal async work, can be prefetched and cached on the client, and is a no-op inside `'use cache'`. Prefer `io()` under Cache Components.

   </details>

7. Can you call `cookies()` inside a `'use cache'` function?

   <details><summary>Answer</summary>

   No. It throws `next-request-in-use-cache`, even through a helper. Read the cookie outside and pass the value in as an argument, or use `'use cache: private'`.

   </details>

8. When is fetching in the browser the right choice?

   <details><summary>Answer</summary>

   When the data depends on interaction (typing, clicks), on browser-only state, or must stay live while the page is open (polling), or when several Client Components need a shared browser cache. Otherwise fetch on the server and, if a Client Component needs the data, pass a Promise and `use()` it.

   </details>

9. Why shouldn't a Server Component `fetch('/api/posts')` from your own app?

   <details><summary>Answer</summary>

   It's an extra HTTP round trip to your own server, it needs an absolute URL on the server, and it doesn't forward the user's cookies by default. Call the service function directly.

   </details>

10. Streaming works locally but not behind your production proxy. What do you check?

    <details><summary>Answer</summary>

    Response buffering in the reverse proxy (nginx proxy buffering, or `X-Accel-Buffering: no`), the CDN or platform buffering streamed responses, and compression buffering. Verify with the stream observer script and `Accept-Encoding: identity`.

    </details>
