# Lesson 5 — `<Link>`, `useRouter`, Navigation Hooks and Typed Routes

## The problem

A plain `<a href>` triggers a **full page load**: the browser throws away the JS state, downloads HTML again, and re-hydrates. To get SPA speed you need a link that:

- intercepts the click and navigates on the client,
- keeps shared layouts mounted,
- prefetches the destination before the click,
- still renders a real `<a>` (SEO, middle-click, accessibility).

That's `<Link>`. For navigation that isn't a click (after a form submit, on a keyboard shortcut) you use `useRouter()`. To *read* where you are, you use the hooks.

---

## `<Link>` in depth

```tsx
import Link from 'next/link'

<Link href="/dashboard">Dashboard</Link>
```

It renders a real `<a>`. `className`, `target`, `aria-*` and other attributes pass through.

| Prop | Default | What it does |
| --- | --- | --- |
| `href` | — | String **or** URL object: `{ pathname: '/about', query: { name: 'x' } }` |
| `replace` | `false` | Replace the history entry instead of pushing a new one |
| `scroll` | `true` | Manage scroll on navigation (see below). `false` = leave scroll alone |
| `prefetch` | `"auto"`/`null` | `"auto"`, `true`, `false`. **Lesson 7** covers this in depth |
| `onNavigate` | — | Called **only for client-side navigations**. `e.preventDefault()` cancels |
| `transitionTypes` | — | `string[]` passed to `React.addTransitionType`, for `<ViewTransition>` animations (v16.2+) |

### `scroll`: what "true" actually means

Next.js **does not** blindly scroll to the top. It keeps your scroll position if the new **page** is visible in the viewport. Otherwise it scrolls to the top of the first page element. It skips sticky/fixed elements when looking for the target.

**Sticky header covers the content after navigation?** Use CSS, not JS:

```css
/* src/app/globals.css */
html { scroll-padding-top: 64px; } /* header height */
```

**v16 change:** Next no longer temporarily overrides `scroll-behavior: smooth` during navigation. If you use global smooth scrolling and want instant jumps on route changes, add `data-scroll-behavior="smooth"` to `<html>`.

### `onNavigate` vs `onClick`

| | `onClick` | `onNavigate` |
| --- | --- | --- |
| Ctrl/Cmd + click (new tab) | runs | **does not run** |
| External URL | runs | does not run |
| `download` links | runs | does not run |
| Can cancel SPA navigation | no (it's too early) | **yes**, `e.preventDefault()` |

Use `onNavigate` for **"unsaved changes"** guards, and to close menus right when navigation starts:

```tsx
'use client'
import Link from 'next/link'
import { useUnsavedChanges } from '@/client/stores/unsaved-changes' // a small Zustand store you write

export function GuardedLink(props: React.ComponentProps<typeof Link>) {
  const dirty = useUnsavedChanges((s) => s.dirty)
  return (
    <Link
      {...props}
      onNavigate={(e) => {
        if (dirty && !window.confirm('You have unsaved changes. Leave?')) e.preventDefault()
      }}
    />
  )
}
```

(The guard covers `<Link>` clicks only. Browser Back and tab closing need a `beforeunload` listener.)

### Hash links

`<Link href="/docs#install">` works like `<a>` and scrolls to `id="install"`. Combine it with `scroll-margin-top` on the target for sticky headers.

---

## `useRouter()` (from `next/navigation`)

Use it only when a `<Link>` can't express the navigation (after async work, keyboard shortcuts, programmatic flows). Client Components only.

```tsx
'use client'
import { useRouter } from 'next/navigation'   // NOT 'next/router' (that's the Pages Router)

const router = useRouter()
router.push('/dashboard')                       // new history entry
router.push('/dashboard', { scroll: false })
router.replace('/login')                        // replace current entry
router.back(); router.forward()
router.refresh()                                // re-render current route from the server
router.prefetch('/pricing', { onInvalidate: () => {/* prefetch again */} })
router.bfcacheId                                // see Lesson 6
```

### `router.refresh()`, precisely

- Makes a new request for the **current route**. Server Components re-render and the new RSC payload is **merged**.
- **Keeps** client state (`useState`) and browser state (scroll).
- Clears the **client cache** for the current route.
- Does **not** invalidate server caches (`'use cache'` and so on). If the data is cached on the server, you get the same data back. For that, use `revalidateTag`/`updateTag`/`revalidatePath` in a Server Action (Phase 04/05).

### Security note

**Never pass untrusted strings to `router.push`/`replace`.** `javascript:` URLs execute in the page (XSS). Validate redirect targets such as `?next=/somewhere`. Only allow same-origin relative paths.

```ts
function safeNext(next: string | null): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/'
}
```

---

## Reading the URL: the hooks

All of these come from `next/navigation` and are **Client Component only**. Server Components get `params`/`searchParams` as props instead. That's intentional: layouts are not re-rendered on navigation, so a server-side "current URL" would be stale.

| Hook | Returns | Example on `/shop/shoes?sort=asc` (route `app/shop/[cat]/page.tsx`) |
| --- | --- | --- |
| `usePathname()` | `string` | `'/shop/shoes'` (no query) |
| `useSearchParams()` | read-only `URLSearchParams` | `.get('sort')` → `'asc'` |
| `useParams()` | params object | `{ cat: 'shoes' }` |
| `useSelectedLayoutSegment(slot?)` | active child segment **one level below** the calling layout, or `null` | from `app/shop/layout`: `'shoes'` |
| `useSelectedLayoutSegments(slot?)` | all active segments below | `['shoes']` |
| `useRouter()` | router object | — |
| `useLinkStatus()` (from `next/link`) | `{ pending }` for the parent `<Link>` | Lesson 6 |

### ⚡ Suspense requirements under Cache Components

This is the #1 surprise in this project's config.

- **`useSearchParams()`**: in a prerendered route, it makes the client tree **up to the nearest `<Suspense>`** render on the client only. In production builds, a missing boundary is a **build error**. Always wrap it:

  ```tsx
  <Suspense fallback={<SearchBoxSkeleton />}>
    <SearchBox />   {/* calls useSearchParams */}
  </Suspense>
  ```

- **`usePathname()`, `useParams()`, `useSelectedLayoutSegment(s)()`**: these resolve during prerendering **only if every dynamic param on the current route is known** (static routes, or params listed in `generateStaticParams`). On a route with an **unknown** dynamic param they **suspend**, and you need `<Suspense>` or the build fails.

  This bites hardest in **root-layout navbars**. Your nav with `usePathname()` works fine until someone adds `app/posts/[id]/page.tsx` without `generateStaticParams`. Then every build fails on that route. Wrap nav components that read URL data in `<Suspense>` from the start.

- In `next dev` these hooks often don't suspend (routes render on demand), so **the bug only shows up in `pnpm build`**. Build often.

### Pattern: URL as state (filters, sort, tabs, pagination)

Store UI state that should be **shareable, bookmarkable, and survive refresh** in the query string:

```tsx
'use client'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'
import type { Route } from 'next'

export function SortSelect() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  function setSort(value: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('sort', value)
    params.delete('page')                    // reset pagination when sort changes
    startTransition(() => {
      router.replace(`${pathname}?${params}` as Route, { scroll: false })
    })
  }

  return (
    <select
      defaultValue={searchParams.get('sort') ?? 'new'}
      onChange={(e) => setSort(e.target.value)}
      aria-busy={isPending}
    >
      <option value="new">Newest</option>
      <option value="price">Price</option>
    </select>
  )
}
```

Why these choices:

- `replace` (not `push`) → changing a filter doesn't spam the Back button.
- `scroll: false` → the list doesn't jump to the top.
- `startTransition` → the old UI stays interactive while the server renders the new results, and `isPending` drives a subtle indicator.
- The page reads `searchParams` on the server (Lesson 3), so results are server-rendered and cacheable.

### Pattern: client-only URL updates with the native History API

`window.history.pushState` / `replaceState` **integrate with the Next router**: `usePathname` and `useSearchParams` update, but **no server request** is made. Use them when the query only affects client UI (for example, sorting an already-loaded list):

```tsx
function updateSorting(order: 'asc' | 'desc') {
  const params = new URLSearchParams(searchParams.toString())
  params.set('sort', order)
  window.history.pushState(null, '', `?${params}`)
}
```

### Pattern: "router events" in the App Router

There is no `router.events`. Compose the hooks instead:

```tsx
'use client'
import { useEffect } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

export function RouteChangeListener() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  useEffect(() => {
    // analytics.page(`${pathname}?${searchParams}`)
  }, [pathname, searchParams])
  return null
}
// Render it in the root layout inside <Suspense fallback={null}>
```

---

## Typed routes (`typedRoutes: true`, enabled in this project)

Next generates a `Route` type from your file tree into `.next/types`. Then:

```tsx
<Link href="/about" />                        // ✅ checked
<Link href={`/blog/${slug}`} />               // ✅ template literal checked against /blog/[slug]
<Link href="/aboot" />                        // ❌ type error
router.push('/dashboard')                      // ✅ also checked (push, replace, prefetch)
<Link href={('/blog/' + slug) as Route} />    // non-literal → cast
```

Typing your own link components:

```tsx
import type { Route } from 'next'
import Link from 'next/link'

function Card<T extends string>({ href }: { href: Route<T> | URL }) {
  return <Link href={href}>…</Link>
}

type NavItem<T extends string = string> = { href: Route<T>; label: string }
```

Notes:

- Types are refreshed by `next dev`, `next build`, and `next typegen` (your `pnpm typecheck` runs `next typegen` first).
- Paths handled only by `proxy.ts` redirects or rewrites aren't files, so cast them: `'/old-path' as Route`.
- The same generation gives you `PageProps<'/x'>`, `LayoutProps<'/x'>`, `RouteContext<'/x'>`.

---

## `redirect()` vs `useRouter().push()`

| | `redirect()` | `router.push()` |
| --- | --- | --- |
| Where | Server Components, Server Actions, Route Handlers, **Client Components during render** | Client Components, in **event handlers/effects** |
| In event handlers | ❌ not allowed | ✅ |
| Mechanism | throws `NEXT_REDIRECT` | client navigation |

Lesson 8 covers `redirect` fully.

## Tips & tricks

- **Default to `<Link>`.** It prefetches. `router.push` doesn't (unless you call `router.prefetch` yourself).
- **`<Link>` inside a Server Component is fine.** You don't need `'use client'` to render it.
- **Active-link logic belongs in one tiny client component** (`NavLink`), reused everywhere.
- **For a full reset on logout,** use `window.location.href = '/login'` (a hard navigation clears all client state). See Lesson 6 for why this matters more with Activity.
- **`useSearchParams()` returns a read-only object.** Copy it with `new URLSearchParams(sp.toString())` before mutating.

## Pitfalls

| Mistake | Symptom |
| --- | --- |
| `import { useRouter } from 'next/router'` in `app/` | Error: NextRouter was not mounted. |
| `useSearchParams()` without Suspense (⚡/prerendered) | Production **build error** (missing Suspense with CSR bailout). |
| Nav with `usePathname()` in root layout + new dynamic route without gSP (⚡) | Build fails on that route. Wrap the nav in Suspense. |
| `router.refresh()` to "get fresh data" when data is `'use cache'`d | Same data comes back. Revalidate the cache instead. |
| `redirect()` inside an `onClick` | Not supported. Use `router.push`. |
| Building hrefs by string concatenation with typed routes | Type error. Use template literals or `as Route`. |

## Source docs

- `node_modules/next/dist/docs/01-app/03-api-reference/02-components/link.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-router.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-pathname.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-search-params.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-params.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-selected-layout-segment.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/05-config/02-typescript.md` (section "Statically Typed Links")
- `node_modules/next/dist/docs/01-app/01-getting-started/04-linking-and-navigating.md` (section "Native History API")
