# Lesson 7 — Prefetching Deep Dive (Partial Prefetching, App Shell, Instant Navigation)

> ⚡ This project has `cacheComponents: true` **and** `partialPrefetching: true`. Most blog posts and tutorials describe the **old** prefetch model. This lesson describes both, so you can read old code, but the **Partial Prefetching** model is what runs here.

## The problem

Server-rendered navigation has a cost: the client has to wait for the server before it can show the new route. Prefetching hides that wait by downloading the route **before** the click. But prefetching everything is wasteful:

- a page with 200 links would fire 200 requests,
- dynamic routes would be rendered on the server for pages nobody visits,
- prefetched data could be stale by the time of the click.

So the real problem is **"prefetch the right amount, at the right time, without wasting server CPU."** Next's answer has changed over versions. Partial Prefetching is the current one.

## Ground rules (both models)

- **Production only.** `next dev` does not prefetch. Test with `pnpm build && pnpm start`.
- **Only `<Link>` prefetches automatically.** `<a>` never does. `router.push` doesn't unless you call `router.prefetch`.
- `<Link>` is a Client Component. **It can't prefetch until it's hydrated**, so large JS bundles delay prefetching on the first visit.
- **Scheduling** (a small priority queue):
  1. links in the viewport,
  2. links showing intent (hover/touch),
  3. newer links replace older ones,
  4. links scrolled off-screen are discarded.

## The old model (no Cache Components, or `partialPrefetching: false`)

| Destination | `<Link>` default (`"auto"`) | `prefetch={true}` |
| --- | --- | --- |
| Static route | whole route, cached ~5 min (`staleTimes.static`) | whole route |
| Dynamic route **without** `loading.tsx` | **nothing** → click waits for the server | whole route incl. dynamic data |
| Dynamic route **with** `loading.tsx` | layouts down to the first loading boundary | whole route |

That's why old advice says "always add `loading.tsx` to dynamic routes": it was the only way to get any prefetch, and an instant skeleton, for them.

## The new model: Partial Prefetching (this project)

### The App Shell

With Partial Prefetching, a default `<Link>` prefetches the destination's **App Shell**:

> **App Shell** = a per-route prerender of everything that **doesn't depend on URL data** (`params`, `searchParams`). It includes static content, cached content (`'use cache'` with `stale` ≥ 5 minutes), and `<Suspense>` fallbacks where URL/request data goes. If the route reads `cookies()`/`headers()`, the shell also includes **session data**, cached per session on the client.

Consequences:

- **One shell per route, shared by every link to it.** 50 links to `/products/[id]` with different ids → **one** prefetch, not 50.
- The rest (uncached data, URL-dependent data) **streams in after the click**, behind the shell's `<Suspense>` boundaries.
- **Invalidations refresh prefetches.** `revalidateTag`/`revalidatePath` silently refresh the related prefetched shells.

### Navigation stages

With Partial Prefetching, server-rendered work becomes available in up to **three stages**:

1. **App Shell**, loaded by a default `<Link>` (shared per route).
2. **Per-link prefetch**, only for `<Link prefetch={true}>`. It also resolves that link's **URL data** (`params`, `searchParams`) and the **cached** content behind it.
3. **Navigation**: when the user clicks, everything else renders.

### What each `prefetch` value does now

| Link | Before Partial Prefetching | With Partial Prefetching |
| --- | --- | --- |
| `<Link href="/x">` (`"auto"`/`null`) | cached page render | **App Shell** for `/x` |
| `<Link href="/x" prefetch>` (`true`) | full route **including uncached dynamic content** | App Shell **+ cached URL-specific content** (per-link prefetch). **No longer** includes uncached dynamic content |
| `<Link href="/x" prefetch={false}>` | nothing | nothing (unchanged) |

`prefetch={true}` costs a **server render per visible link** when the content depends on URL data. Use it on a few high-value links (hero products, the next page of results), not on every list item.

### The #1 rule: keep URL data inside `<Suspense>`

The App Shell is **shared across all URLs of a route**, so it **can't contain anything that depends on one URL**. If you `await params` or `await searchParams` **outside** a `<Suspense>` boundary, the shell is tied to one URL. In dev you get the **"URL data outside of Suspense"** insight.

```tsx
// ❌ Before: awaiting params at the top ties the App Shell to one URL
export default async function Page({ params }: PageProps<'/products/[slug]'>) {
  const { slug } = await params
  const product = await getProduct(slug)
  return <ProductLayout><Details product={product} /></ProductLayout>
}
```

```tsx
// ✅ After: URL-independent UI stays in the shell; the URL read moves into Suspense
import { Suspense } from 'react'

export default function Page({ params }: PageProps<'/products/[slug]'>) {
  return (
    <ProductLayout>
      <Suspense fallback={<DetailsSkeleton />}>
        <ProductDetails params={params} />
      </Suspense>
    </ProductLayout>
  )
}

async function ProductDetails({ params }: Pick<PageProps<'/products/[slug]'>, 'params'>) {
  const { slug } = await params
  return <Details product={await getProduct(slug)} />
}
```

To make that streamed region **also** available *before* the click for selected links, cache the data and use `prefetch={true}`:

```ts
async function getProduct(slug: string) {
  'use cache'                 // Phase 04 explains this in depth
  return db.product.findUnique({ where: { slug } })
}
```

```tsx
<Link href={`/products/${featured.slug}`} prefetch>Featured</Link>  // per-link prefetch resolves it
```

### Picking a strategy per destination

| Destination content | Recommendation |
| --- | --- |
| Fully static or already cached | Default `<Link>`. Remove `prefetch={true}`, it's redundant. |
| Uncached content you want ready before the click | Cache it with `'use cache'`. Default `<Link>` is enough. |
| Depends on `cookies()`/`headers()` | Read the cookie **outside** the cached function, pass it in as an argument. Session data can be in the shell. |
| Depends on `params`/`searchParams` | Keep it in `<Suspense>`. Use `prefetch={true}` on important links. |
| Real-time (must be fresh per request) | Don't prefetch it. Let it stream after navigation. |

## Fine-grained controls

### Per link

```tsx
// Hover-intent prefetch under Partial Prefetching:
'use client'
import Link from 'next/link'
import { useState } from 'react'
import type { Route } from 'next'

export function IntentLink<T extends string>({ href, children }: { href: Route<T>; children: React.ReactNode }) {
  const [intent, setIntent] = useState(false)
  return (
    <Link href={href} prefetch={intent ? true : 'auto'} onMouseEnter={() => setIntent(true)}>
      {children}
    </Link>
  )
}
```

- `'auto'` before hover keeps the cheap **shared shell** prefetch.
- `true` after hover adds the **per-link** URL data.
- Don't use `false` before hover with Partial Prefetching. It disables the shell too. (In the old model the docs used `prefetch={active ? null : false}`.)

Manual prefetch for things that aren't links:

```tsx
const router = useRouter()
<div onMouseEnter={() => router.prefetch('/pricing')}>…</div>

// keep a prefetch fresh: re-prefetch when Next says it's stale
router.prefetch(href, { onInvalidate: () => router.prefetch(href) })
```

### Per route segment (in `page.tsx` / `layout.tsx`, server only)

```ts
// how this segment is prefetched (the destination sets the cost ceiling)
export const prefetch = 'partial'        // opt ONE route into Partial Prefetching (when the global flag is off)
export const prefetch = 'force-disabled' // never prefetch this segment's data (e.g. rarely visited, auth-only pages)
```

```ts
// validate that navigations into this segment are instant (dev overlay)
export const instant = true
export const instant = false   // allow this segment to block (e.g. a shared layout that can't be instant)
```

- `instant` (stable since 16.3): with the default `validationLevel: 'warning'`, **every page is validated in dev**. Errors name the component that blocks. The fix is usually "wrap it in Suspense" or "cache it".
- `instant = false` on a high layout + `instant = true` on its pages = "entering this section may block, but moving between its tabs must be instant."
- `ensureStatic = 'shell' | 'prefetch' | 'navigation'` *enforces* that a stage stays static, so it can be served from a CDN at zero server cost. This is covered in Phase 04 and Phase 09.

### Per subtree: `prefetch()` and `navigation()` (from `next/cache`, 16.4)

Sometimes content *could* go into the App Shell but is **expensive**, so you don't want every link to the route to pay for it.

```tsx
import { Suspense } from 'react'
import { prefetch as prefetchStage } from 'next/cache'   // renamed: avoids clashing with `export const prefetch`

async function Recommendations() {
  await prefetchStage()          // everything below: NOT in the shell; runs on per-link prefetch or navigation
  const items = await getRecommendations()   // can still be 'use cache' / 'use cache: private'
  return <List items={items} />
}

export default function Page() {
  return (
    <Suspense fallback={<RecsSkeleton />}>   {/* the fallback IS in the shell */}
      <Recommendations />
    </Suspense>
  )
}
```

| Function | Content below it appears in… |
| --- | --- |
| *(nothing)* | App Shell (if static/cached) |
| `await prefetch()` | per-link prefetch **or** navigation |
| `await navigation()` | navigation only |
| `await connection()` (from `next/server`) | request time only, never prerendered/cached (makes it request-dependent) |

`prefetch()`/`navigation()` **don't** make content request-dependent. It stays cacheable. `connection()` does make it request-dependent. Don't call `prefetch()` inside `'use cache'`, in `generateStaticParams`, or in a Client Component, because it throws.

## Pitfalls

### Side effects run during prefetch

Server Components of the destination **render during prefetch**, before any click:

```tsx
// ❌ fires for every prefetch, not every visit
export default function Layout({ children }) {
  trackPageView()
  return <>{children}</>
}
```

```tsx
// ✅ track on the client, when actually shown
'use client'
import { useEffect } from 'react'
export function PageViewTracker() {
  useEffect(() => { trackPageView() }, [])
  return null
}
```

Keep Server Components **pure**: no writes, no counters, no emails in render.

### Too many prefetches

- Long tables / infinite lists: `prefetch={false}`, or intent-based prefetching.
- Footers and legal links: `prefetch={false}` (consider a `NoPrefetchLink` wrapper).
- Watch server CPU: a **dynamic** App Shell (reads cookies/headers) is rendered per visitor. A static shell can come from a CDN for free.

### Proxy rewrites

If `proxy.ts` rewrites `/dashboard` to `/auth/dashboard` or `/public/dashboard`, the link can't know which one to prefetch. Point `href` at the real destination when you can (Phase 06 covers proxy).

## Troubleshooting checklist: "my navigation isn't instant"

1. Are you testing in **production** (`pnpm build && pnpm start`)?
2. Was the link **visible long enough / hovered** for the prefetch to happen? Check the Network tab.
3. Does the destination have a `<Suspense>`/`loading.tsx` **below the shared layout** (Lesson 6)?
4. Does the page read `params`/`searchParams`/`cookies()` **outside** Suspense? Check the dev overlay insights.
5. Is the data uncached? Consider `'use cache'`.
6. Set `export const instant = true` and read the dev overlay.
7. Open DevTools → **Navigation Inspector** → **Pause on navigations** and look at the frozen prefetched UI.
8. On slow networks, add a `useLinkStatus` hint as a stop-gap.

## Testing instant UI

`@next/playwright` exports `instant()`, which holds back dynamic content so you can assert what's visible *at click time*:

```ts
import { test, expect } from '@playwright/test'
import { instant } from '@next/playwright'

test('product title is instant', async ({ page }) => {
  await page.goto('/products')
  await instant(page, async () => {
    await page.getByRole('link', { name: 'Baseball Cap' }).click()
    await expect(page.getByRole('heading', { name: 'Baseball Cap' })).toBeVisible()
  })
})
```

Production builds need `experimental.exposeTestingApiInProductionBuild` for this. Phase 10 sets up Playwright.

## Source docs

- `node_modules/next/dist/docs/01-app/02-guides/prefetching.md`
- `node_modules/next/dist/docs/01-app/02-guides/adopting-partial-prefetching.md`
- `node_modules/next/dist/docs/01-app/02-guides/optimizing-prefetching.md`
- `node_modules/next/dist/docs/01-app/02-guides/instant-navigation.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/02-route-segment-config/prefetch.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/02-route-segment-config/instant.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/02-route-segment-config/ensureStatic.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/prefetch.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/navigation.md`
- `node_modules/next/dist/docs/01-app/04-glossary.md` (App Shell, URL data, Navigation stages, Partial Prefetching)
