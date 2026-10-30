# Lesson 5 — Streaming with `loading.tsx` and `<Suspense>`

## The problem

Classic SSR builds the **entire** HTML document before sending a single byte. One slow query (recommendations: 2 s) delays the header, the navigation and everything else, even though they were ready in 20 ms. The user stares at a blank tab.

Streaming sends the page **in pieces as they become ready**. The fast parts paint immediately, and slow parts fill in their placeholders later, over the same HTTP response.

## How it works

### What the browser actually receives

React's server renderer cuts the HTML at `<Suspense>` boundaries. With chunked transfer encoding, one response arrives over time:

```text
chunk 0 (+0 ms)     <head>, CSS, layout, nav, fallback skeletons
                    <template id="B:0"></template>  ← placeholder for boundary 0
                    <template id="B:1"></template>  ← placeholder for boundary 1
chunk 1 (+~150 ms)  component payload for hydration:  self.__next_f.push(...)
chunk 2 (+1000 ms)  <div hidden id="S:0">…finished HTML…</div> + <script> that swaps it into B:0
chunk 3 (+3000 ms)  <div hidden id="S:1">…finished HTML…</div> + <script> that swaps it into B:1
```

- Each boundary is an **independent streaming point**. Boundaries don't wait for each other.
- Hydration is split too: React can hydrate the parts that have arrived while others are still streaming, so they become interactive sooner.
- On **client navigations** there's no HTML at all. Only the component payload is fetched (with an `rsc: 1` header) and streamed into the existing page.

### The static shell

Everything that renders **before any async work resolves** (layouts, navigation, the **fallbacks** of your Suspense boundaries) is the **static shell**.

> **⚡ Cache Components:** the static shell is **prerendered at build time** and served instantly (from a CDN where available). Request-time parts stream in after it. This is why every uncached or request-time `await` must be inside a boundary: otherwise there's no shell to prerender, and the build fails.

### `loading.tsx`: a boundary around the whole page

```tsx
// app/blog/loading.tsx
export default function Loading() {
  return <BlogSkeleton />
}
```

Next wraps the segment's `page.tsx` (and child segments) in `<Suspense fallback={<Loading />}>`. On navigation, the layout appears immediately and the skeleton shows until the page is ready.

Remember from Phase 01: `loading.tsx` **doesn't cover the layout in the same folder**. A layout that awaits uncached or request-time data isn't helped by its sibling `loading.tsx`. Under ⚡ Cache Components that becomes a build error, which is a good thing.

### `<Suspense>`: boundaries exactly where you need them

```tsx
export default function BlogPage() {
  return (
    <div>
      <header><h1>Blog</h1></header>                {/* in the shell, sent immediately */}
      <Suspense fallback={<PostListSkeleton />}>
        <PostList />                                  {/* streams in */}
      </Suspense>
    </div>
  )
}
```

Compare them:

| | `loading.tsx` | `<Suspense>` |
| --- | --- | --- |
| Scope | Whole page / segment | Any component |
| Setup | Drop in a file | Wrap components |
| Navigation | **Prefetched as the instant fallback** | Not prefetched by default |
| Best for | Pages where nothing makes sense without the data | Most pages: granular control |

The docs' advice: `<Suspense>` **close to the data access** is the default. `loading.tsx` is a convenient outer safety net.

### Where to put boundaries

- **Sibling boundaries** for independent parts. They stream in parallel (Lesson 3).
- **Nested boundaries** for progressive detail: an outer boundary for the article, an inner one for comments.
- **Push dynamic access down.** The smaller the component that awaits, the more of the page is in the shell.
- **Group things that should appear together** in one boundary, to avoid a "popcorn" effect of many small pieces popping in at different moments.
- **Every boundary is a possible fallback.** On a slow network or busy CPU, React can show a fallback even when you didn't expect it. Don't add boundaries you don't want users to see.

### The HTTP contract: status codes are sent with the first byte

Once streaming starts, **headers and the status code are already sent** (`200 OK`). So:

- `notFound()` **after** streaming has started can't change the status to 404. Next injects `<meta name="robots" content="noindex">` instead.
- `redirect()` after streaming started becomes a client-side redirect instead of an HTTP 3xx.
- An error thrown mid-stream is caught by the nearest `error.tsx`, **in place of that section only**. The rest of the page stays, and the status is still 200.

To get a real status code, do the check **before** the first `await` that suspends under a boundary:

```tsx
export default async function PostPage({ params }: PageProps<'/post/[slug]'>) {
  const { slug } = await params
  if (!(await postExists(slug))) notFound()       // real 404: nothing has streamed yet
  return (
    <Suspense fallback={<p>Loading post…</p>}>
      <PostContent slug={slug} />
    </Suspense>
  )
}
```

Or reject early in `proxy` (Phase 06), which runs before rendering.

You saw this in Phase 01: `/lessons/nope` returned **200** with your 404 page, because the `notFound()` is inside the Suspense boundary in [src/app/lessons/[slug]/page.tsx](../../src/app/lessons/[slug]/page.tsx).

### Bots and crawlers

HTML-limited bots (detected by user agent) **don't** get a streamed response. Next waits for the full render, including `generateMetadata`, and sends one complete document so the metadata is in `<head>`.

⚡ With Cache Components, browsers get the prerendered shell instantly, but HTML-limited bots **render the page dynamically**. If your shell depends on something only available at build time, it can work for people and fail for crawlers.

### Streaming and Web Vitals

| Metric | Effect of streaming | What to do |
| --- | --- | --- |
| TTFB / FCP | Much better: the shell is sent immediately | Keep the shell free of request-time work |
| LCP | Worse if the largest element is inside a boundary | Keep LCP elements (hero image, main heading) **outside / above** boundaries. Use `preload` on the LCP `next/image` |
| CLS | Skeletons that don't match the content make the page jump | Make fallbacks the **same size** as the final content, or reserve space with `min-height` |
| INP | Selective hydration lets arrived parts respond sooner | Smaller boundaries help large pages hydrate in pieces |

### What can break streaming in production

Streaming works on `next start` (Node.js) and Docker, not in static export. Things between the server and the user can **buffer** the response until it's complete:

- Reverse proxies (nginx: disable proxy buffering for these routes, or send `X-Accel-Buffering: no`).
- Some CDNs and serverless platforms.
- Compression layers that wait for large blocks.

### Verifying that streaming works

`curl` has its own buffering, so the docs suggest a small Node script instead:

```js
// stream-observer.mjs  → node stream-observer.mjs
const res = await fetch('http://localhost:3000/examples/data/streaming', {
  headers: { 'Accept-Encoding': 'identity' },   // no compression, so chunks aren't merged
})
const reader = res.body.getReader()
const decoder = new TextDecoder()
const start = Date.now()
for (let i = 0; ; i++) {
  const { done, value } = await reader.read()
  if (done) break
  console.log(`\n--- chunk ${i} (+${Date.now() - start}ms) ---\n${decoder.decode(value).slice(0, 300)}`)
}
```

`curl -N -H 'Accept-Encoding: identity' http://localhost:3000/...` also shows the pieces arriving, just less precisely. In DevTools, the document request's **Timing** tab shows an early TTFB and a long "Content Download" phase when streaming works.

Add `'User-Agent': 'Twitterbot/1.0'` to the script's headers and the response arrives **in one burst**. That's the bot behaviour.

## Examples

### Example 1 — Page-level vs granular

1. `src/app/examples/data/streaming/page.tsx` with three slow sections (400 / 1200 / 2500 ms) in **one** component, plus a `loading.tsx`. Observe one skeleton, then everything at 2.5 s.
2. Delete `loading.tsx` and give each section its own `<Suspense>`. Observe three skeletons replaced one by one.
3. Run the stream observer against both versions in `pnpm build && pnpm start` and compare the chunk timings.

### Example 2 — Error mid-stream

Make the 1200 ms section throw. Add `error.tsx` next to the page, which must be a Client Component, and observe that only that section is replaced while the others still stream. Check the status code in the Network tab: still 200.

### Example 3 — Real 404 vs streamed 404

Build `/examples/data/post/[slug]` twice: once with `notFound()` inside the Suspense boundary, once before it. Compare the status codes with `curl -I`.

## Tips & tricks

- **Fallbacks are UI.** Use skeletons that look like the content, not spinners everywhere. They're what users see first.
- **React DevTools can force a boundary into its fallback state**, which helps you design skeletons in development.
- **Hard requirements first, streaming second.** Auth, existence checks and redirects belong before the first boundary (or in `proxy`) so they can use real status codes.
- **The shell should be useful on its own.** Navigation, headings and static copy in the shell mean the page is usable before the data arrives.

## Pitfalls

| Mistake | Symptom |
| --- | --- |
| Uncached / request-time `await` outside any boundary (⚡) | Build error. Without Cache Components: the whole page blocks |
| Expecting `loading.tsx` to cover its sibling layout | The navigation looks frozen while the layout fetches |
| `notFound()` inside a Suspense boundary | Status 200 + `noindex` instead of 404 |
| Skeleton much smaller than the content | Layout shift (CLS) when content arrives |
| LCP image inside a slow boundary | Poor LCP even though TTFB is great |
| A proxy with buffering on | Streaming "doesn't work" in production but works locally |

## Where it's used

- **Dashboards:** a static shell with navigation, and one boundary per card.
- **Product pages:** cached product info in the shell, with reviews and stock streamed.
- **Feeds and search results:** the header and filters in the shell, results streamed.
- **AI / long-running responses:** streaming in Route Handlers (Phase 06).

## Source docs

- `node_modules/next/dist/docs/01-app/02-guides/streaming.md` (the whole guide)
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/loading.md`
- `node_modules/next/dist/docs/01-app/01-getting-started/06-fetching-data.md` (section "Streaming")
- `node_modules/next/dist/docs/01-app/02-guides/optimizing-the-static-shell.md`
