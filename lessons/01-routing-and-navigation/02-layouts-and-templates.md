# Lesson 2 — Layouts and Templates

## The problem

In a classic multi-page app, every navigation re-renders the whole page. The sidebar scroll position resets, an open dropdown closes, a playing video stops, and the header's data is fetched again.

In a hand-rolled SPA you avoid this by putting the shell *outside* `<Routes>`. That only works for one level, and nested shells become messy.

Next.js layouts give you **nested, persistent shells**. Each layout stays mounted while only the part below it changes. Sometimes you need the opposite, a wrapper that *does* reset, and that's what `template.tsx` is for.

## How it works

### Layout = persistent shell

```tsx
// app/dashboard/layout.tsx
export default function DashboardLayout({ children }: LayoutProps<'/dashboard'>) {
  return (
    <div className="grid grid-cols-[240px_1fr]">
      <Sidebar />          {/* stays mounted between /dashboard/* pages */}
      <section>{children}</section>
    </div>
  )
}
```

On navigation from `/dashboard/a` to `/dashboard/b`:

- The root layout and dashboard layout are **not re-rendered and not re-fetched**. The client router keeps them. Their client state (`useState`, scroll, input values) survives.
- Only the segments **below the shared layout** are fetched and rendered.

This is called **partial rendering**. It's why sibling navigations are cheap.

### What a layout cannot do, and why

Because a layout is *not re-rendered* on navigation, anything that changes per navigation would be stale inside it. So Next deliberately **doesn't give layouts**:

| Not available in layout | Why | Use instead |
| --- | --- | --- |
| `searchParams` prop | Query changes don't re-render the layout | `searchParams` in `page.tsx`, or `useSearchParams()` in a client component |
| current pathname | Same reason | `usePathname()` in a client component inside the layout |
| access to child segments | The layout doesn't know which child is active | `useSelectedLayoutSegment(s)()` in a client component |
| passing data to `children` | `children` is an opaque slot rendered separately | Fetch the same data again in the page and dedupe with `React.cache` / `fetch` memoization |

Layouts **do** get `params` for segments **at or above** them (as a Promise).

The pattern for "active nav link inside a layout": the layout stays a Server Component and renders a small client component.

```tsx
// app/dashboard/_components/nav-link.tsx
'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { Route } from 'next'

export function NavLink<T extends string>({ href, children }: { href: Route<T>; children: React.ReactNode }) {
  const pathname = usePathname()
  const active = pathname === href
  return (
    <Link href={href} aria-current={active ? 'page' : undefined} className={active ? 'font-semibold' : ''}>
      {children}
    </Link>
  )
}
```

> **⚡ Cache Components:** `usePathname()` **suspends** when the current route has a dynamic param that wasn't listed in `generateStaticParams`, because the pathname isn't known at build time. Then the layout needs a `<Suspense>` around the nav, or the build fails. See Lesson 5.

### Sharing data between layout and page

Layouts can't pass props to `children`. Fetch twice, and dedupe:

```ts
// src/server/services/user.ts
import 'server-only'
import { cache } from 'react'

export const getCurrentUser = cache(async () => {
  // runs once per request, no matter how many components call it
  return db.user.findFirst(/* ... */)
})
```

```tsx
// layout.tsx
const user = await getCurrentUser()   // first call: runs the query
// page.tsx
const user = await getCurrentUser()   // same request: returns the memoized result
```

This "fetch where you need it" style is the App Router convention. Don't try to recreate prop-drilling from layout to page.

### Root layout

- **Required.** It's the top-most layout and must render `<html>` and `<body>`.
- Don't add `<title>`/`<meta>` by hand. Use the Metadata API (`export const metadata`), which handles streaming and deduplication. This project already does this in [src/app/layout.tsx](../../src/app/layout.tsx).
- **Multiple root layouts:** remove `app/layout.tsx` and give each route group its own layout with `<html>`/`<body>`:

```
app/
├── (marketing)/layout.tsx   ← root layout #1 (<html> <body>)
└── (app)/layout.tsx         ← root layout #2 (<html> <body>)
```

Navigating **between different root layouts causes a full page load** (hard navigation). It is not a client-side transition. That's expected, because the whole `<html>` changes. Use this for parts of the app that truly share nothing, such as a marketing site and an admin console.

- The root layout can sit **under a dynamic segment**: `app/[lang]/layout.tsx`. Then `lang` is a **root param** (Lesson 3).

### Template = shell that remounts

```tsx
// app/blog/template.tsx
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="animate-in fade-in">{children}</div>
}
```

Next renders it as:

```tsx
<Layout>
  <Template key={/* this segment's identity */}>{children}</Template>
</Layout>
```

Because of the `key`, when **the segment directly below the template changes**, React unmounts the old template and mounts a new one. All client state inside resets, effects run again, and DOM nodes are recreated.

Remount rules (from the docs, worth memorising):

- The template's key changes when **its own segment level** changes, **including dynamic param values**.
- Navigating deeper does **not** remount higher templates.
- **Search params do not trigger a remount.**

Walkthrough with `app/template.tsx` and `app/blog/template.tsx`:

| Navigation | Root template | Blog template |
| --- | --- | --- |
| `/` → `/about` | remounts (first segment changed) | — |
| `/about` → `/blog` | remounts | mounts |
| `/blog` → `/blog/first-post` | kept | **remounts** (child segment changed) |
| `/blog/first-post` → `/blog/second-post` | kept | **remounts** (param value changed) |
| `/blog/first-post?tab=2` | kept | kept (search params don't count) |

### Where `loading.tsx` sits, and why that matters

`loading.tsx` wraps the **page and child segments**, **not** the layout of the same folder.

So if `app/dashboard/layout.tsx` does `await getSlowThing()`, then `app/dashboard/loading.tsx` **won't** show while it loads.

> **⚡ Cache Components:**
> - `loading.tsx` behaves like an ordinary `<Suspense>` boundary.
> - Uncached or request-time data in a layout (`cookies()`, `headers()`, uncached fetch) **must** be wrapped in its own `<Suspense>`, otherwise you get a **build-time error**.
> - Fix: wrap that part of the layout in `<Suspense>`, or move the fetch into `page.tsx`, where `loading.tsx` covers it.

```tsx
// app/dashboard/layout.tsx  (correct with Cache Components)
import { Suspense } from 'react'

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Suspense fallback={<NavSkeleton />}>
        <UserNav />        {/* reads cookies() inside */}
      </Suspense>
      <main>{children}</main>
    </>
  )
}
```

Another ⚡ rule: **don't `await params` at the top of a layout.** It ties the whole layout to the URL and blocks prerendering. Pass the promise down to the component that needs it, and await it there inside `<Suspense>`. Lesson 3 shows the pattern.

## Layout vs template: decision table

| Need | Use |
| --- | --- |
| Sidebar/header that keeps state between pages | `layout` |
| Enter animation on every page change | `template` |
| Reset a form/input when moving between sibling pages | `template` (or a `key` on the form) |
| `useEffect` that must run on every navigation (e.g. log a page view per segment) | `template`, or a client component that watches `usePathname()` |
| Suspense fallback shown on **every** navigation, not only the first | `template` (layouts show a Suspense fallback only on first load) |
| Different `<html>`/`<body>` for different sections | multiple root layouts |

> **⚡ Cache Components + Activity:** with Cache Components on, Next also **keeps previously visited pages alive** (hidden with React `<Activity>`), so page state can come back when you return. That is a separate mechanism from templates, covered in Lesson 6. Templates reset state when *their segment changes*. Activity preserves state of *routes you left*.

## Tips & tricks

- **Keep layouts thin and static.** A layout that awaits request data slows down every page below it. Move per-request work into small components wrapped in `<Suspense>`.
- **Don't make a layout a Client Component** just to call a hook. Make a tiny client child (as in `NavLink` above). Your project does this already: `AppProviders` and `ThemeToggle` are client islands inside a server root layout.
- **Use `aria-current="page"`** for active links. It's accessible and works as a styling hook (`aria-[current=page]:font-semibold` in Tailwind).
- **Side effects in layouts run during prefetch.** Never put `trackPageView()` directly in a Server Component layout. Use a client `useEffect` (Lesson 7).
- **`key` is your friend.** If only one component should reset per route, `<Form key={id} />` is lighter than a template.

## Pitfalls

| Mistake | Symptom |
| --- | --- |
| Reading `searchParams` in a layout | No such prop. Building your own `?` parsing gives stale data. |
| Fetching user data in a layout without `<Suspense>` (⚡) | Build error about uncached data outside Suspense. |
| Expecting `loading.tsx` to cover its sibling layout | Navigation appears frozen while the layout fetches. |
| Linking between two root layouts and expecting state to survive | Full page reload. All client state is gone. |
| Using `template.tsx` for "every page refetches" | Templates reset **client state**. They don't change server caching. Use revalidation for data freshness (Phase 04). |

## Where it's used

- **Dashboards:** a persistent sidebar layout plus a page area that changes. Tabs use a layout with `useSelectedLayoutSegment`.
- **Docs:** the docs layout keeps the sidebar's scroll position while pages change.
- **Onboarding wizards:** a `template.tsx` so each step mounts fresh and its enter animation plays.
- **Marketing + app split:** two root layouts with completely different HTML, fonts, and providers.

## Source docs

- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/layout.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/template.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/loading.md`
