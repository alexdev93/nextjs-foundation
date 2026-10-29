# Lesson 4 — Parallel Routes and Intercepting Routes

These are the two "advanced" routing features. Most apps need them only a few times, but when you need them nothing else does the job cleanly. They're most powerful **together**.

---

## Part A — Parallel routes (`@slot`)

### The problem

A dashboard shows *team activity* and *analytics* side by side. You want each panel to:

- have its own loading skeleton and error boundary (one slow panel shouldn't block the other),
- possibly navigate on its own (tabs inside the analytics panel),
- and still be defined by the file system, not by `useState` and conditional rendering.

A plain layout with `children` gives you only **one** routable area. Parallel routes give a layout **several named routable areas**.

### How it works

```
app/dashboard/
├── layout.tsx
├── page.tsx              → the implicit "children" slot
├── default.tsx           → fallback for children (see below)
├── @team/
│   ├── page.tsx
│   └── default.tsx
└── @analytics/
    ├── page.tsx
    ├── loading.tsx       → independent loading state
    ├── error.tsx         → independent error boundary
    └── default.tsx
```

```tsx
// app/dashboard/layout.tsx
export default function Layout({ children, team, analytics }: LayoutProps<'/dashboard'>) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="col-span-2">{children}</div>
      {team}
      {analytics}
    </div>
  )
}
```

Key facts:

- A slot is **not a URL segment**. `app/dashboard/@analytics/views/page.tsx` is served at `/dashboard/views`, not `/dashboard/@analytics/views`.
- `children` is just an **implicit slot**: `app/page.tsx` ≡ `app/@children/page.tsx`.
- `LayoutProps<'/dashboard'>` **types the slots for you** (`team`, `analytics`).
- Each slot can have its own `loading.tsx` / `error.tsx`, so slots **stream independently**.
- Slots at the same level are rendered together with the page. Per the docs, if one slot at a level is dynamic, the whole level is treated as dynamic.

### Slot state: soft vs hard navigation, and `default.tsx`

This is the confusing part. Read it slowly.

Suppose `@team` has `settings/page.tsx` but `@analytics` does not.

- **Soft navigation** (client-side, via `<Link>`) to `/dashboard/settings`: `@team` shows its `settings` page. `@analytics` has no match, so Next **keeps showing whatever `@analytics` was showing before**. The router remembers each slot's active state.
- **Hard navigation** (refresh or direct visit) to `/dashboard/settings`: there is no previous state to remember. For each slot without a match, Next renders that slot's **`default.tsx`**.

**v16 rule:** every slot **must** have a `default.tsx`, or the **build fails**. To get the old "404 when unmatched" behaviour:

```tsx
// app/dashboard/@analytics/default.tsx
import { notFound } from 'next/navigation'
export default function Default() {
  notFound()
}
```

Or render nothing:

```tsx
export default function Default() {
  return null
}
```

Because `children` is also a slot, you may need `app/dashboard/default.tsx` as well, for cases where the router can't recover the main page's state.

### Pattern 1 — Tabs inside a slot

Put a `layout.tsx` **inside** the slot so the slot can navigate on its own:

```
app/dashboard/@analytics/
├── layout.tsx            // tab bar
├── page-views/page.tsx   // /dashboard/page-views
├── visitors/page.tsx     // /dashboard/visitors
└── default.tsx
```

```tsx
// app/dashboard/@analytics/layout.tsx
import Link from 'next/link'

export default function AnalyticsLayout({ children }: { children: React.ReactNode }) {
  return (
    <section>
      <nav className="flex gap-2">
        <Link href="/dashboard/page-views">Page views</Link>
        <Link href="/dashboard/visitors">Visitors</Link>
      </nav>
      {children}
    </section>
  )
}
```

To highlight the active tab from a parent layout, use `useSelectedLayoutSegment('analytics')`. The argument is the **slot name**, without the `@`.

### Pattern 2 — Conditional slots (role-based UI)

```tsx
// app/dashboard/layout.tsx
import { getRole } from '@/server/auth'

export default async function Layout({ admin, user }: LayoutProps<'/dashboard'>) {
  const role = await getRole()
  return role === 'admin' ? admin : user
}
```

⚠️ **Security caveat (from the docs, easy to miss):** **both slots render on the server**, whichever one the layout returns. `@admin/page.tsx` runs its data fetches *for every user*, and its output is included in the response. The conditional only decides what the user *sees*. **Always authorize inside each slot's page or data layer**, never only in the layout.

### Pattern 3 — Independent streaming

```
@revenue/loading.tsx    → skeleton A
@orders/loading.tsx     → skeleton B
```

A slow revenue query no longer delays the orders panel. Each one fills in when it's ready.

---

## Part B — Intercepting routes (`(.)`, `(..)`, `(...)`)

### The problem

Instagram-style photo feed: click a photo and it opens **in a modal over the feed**, but:

- the URL changes to `/photo/123` (shareable),
- refreshing `/photo/123` shows the **full photo page**, not a modal on an empty background,
- the browser Back button **closes** the modal,
- Forward **re-opens** it.

Doing this by hand (state + `history.pushState` + a separate page) is fiddly and easy to get wrong. Intercepting routes give you "**render another route here, in my current layout, during client navigation only**."

### How it works

Name a folder with a relative marker followed by the target segment:

| Marker | Matches | Like |
| --- | --- | --- |
| `(.)photo` | `photo` at the **same** level | `./photo` |
| `(..)photo` | `photo` **one level up** | `../photo` |
| `(..)(..)photo` | two levels up | `../../photo` |
| `(...)photo` | `photo` from the **app root** | `/photo` |

⚠️ The levels count **route segments, not folders**. `@slot` folders are **not** segments, so they don't count.

Behaviour:

- **Soft navigation** (a `<Link>` click from inside the app) → the intercepting route renders, and the URL shows the target.
- **Hard navigation** (refresh, pasted URL, new tab) → no interception. The real route renders.

---

## Part C — Parallel + intercepting = URL-driven modal

This is the canonical combination. Build it once yourself (Exercise 4).

```
app/
├── layout.tsx                 // renders {children} and {modal}
├── @modal/
│   ├── default.tsx            // returns null → no modal by default
│   ├── (.)photos/[id]/
│   │   └── page.tsx           // modal version (soft nav)
│   └── [...catchAll]/
│       └── page.tsx           // returns null → closes modal on other navigations
├── photos/
│   ├── page.tsx               // gallery grid with <Link href="/photos/1">
│   └── [id]/page.tsx          // full page version (hard nav / refresh)
```

```tsx
// app/layout.tsx
export default function RootLayout({ children, modal }: LayoutProps<'/'>) {
  return (
    <html lang="en">
      <body>
        {children}
        {modal}
      </body>
    </html>
  )
}
```

```tsx
// app/@modal/default.tsx
export default function Default() {
  return null
}
```

```tsx
// app/@modal/(.)photos/[id]/page.tsx
import { Modal } from '@/client/components/modal'
import { PhotoDetails } from '@/shared/components/photo-details'

export default function PhotoModal({ params }: PageProps<'/photos/[id]'>) {
  return (
    <Modal>
      <PhotoDetails params={params} />   {/* Server Component, reused by the full page */}
    </Modal>
  )
}
```

Why `(.)photos` and not `(..)photos`? Because `@modal` is **not a segment**. `@modal/(.)photos` is at the same segment level as `app/photos`.

```tsx
// src/client/components/modal.tsx
'use client'
import { useRouter } from 'next/navigation'
import { useEffect, useRef } from 'react'

export function Modal({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    if (!ref.current?.open) ref.current?.showModal()
  }, [])

  return (
    <dialog ref={ref} onClose={() => router.back()} className="backdrop:bg-black/60">
      {children}
      <button type="button" onClick={() => router.back()}>Close</button>
    </dialog>
  )
}
```

Details that matter:

1. **`router.back()` closes the modal.** It pops the history entry, so Back and Forward behave naturally.
2. **Closing through a `<Link>` to another page:** parallel slots *keep their previous state* on soft navigation (Part A), so the modal would **stay open**. The `@modal/[...catchAll]/page.tsx` returning `null` makes the slot match every other URL and render nothing. If you link back to `/` specifically, `@modal/page.tsx` returning `null` handles that route.
3. **Keep `Modal` (client) separate from the content (server).** The content stays a Server Component, which is the "pass Server Components as children" pattern (Phase 02).
4. **Share the content component** between the modal page and the full page, so they never drift apart.
5. ⚡ Under Cache Components, the content reads `params` → keep that read inside `<Suspense>` (or give it a `loading.tsx`).

A reference implementation is Vercel's **Nextgram** (`github.com/nextjs/nextgram`).

---

## Tips & tricks

- **Draw the tree before coding.** Write the segment levels next to each folder and cross out `@slot` folders. Then the `(.)`/`(..)` choice becomes obvious.
- **Restart `next dev` after adding or renaming slot/intercept folders.** The route tree is built at startup, and changes to it are sometimes not picked up by HMR.
- **Test with a hard refresh every time.** Most parallel/intercept bugs only appear on direct visits (`default.tsx` missing or wrong).
- **Use the modal pattern for:** login dialogs (`/login` as a page *and* a modal), cart drawers, quick-view of products, "edit item" panels in admin tables.
- **Slots are props,** so you can place them anywhere in the layout: sidebar, header, overlay.

## Pitfalls

| Mistake | Symptom |
| --- | --- |
| Missing `default.tsx` in a slot (v16) | Build fails. |
| `(..)photos` when `@modal` is the only "level" in between | Interception doesn't trigger, because `@modal` isn't a segment. Use `(.)`. |
| Modal stays open after clicking a link elsewhere | Missing `[...catchAll]` (or `page.tsx`) returning `null` in the slot. |
| Closing with `router.push('/photos')` | Adds a history entry, so Back reopens the modal. Use `router.back()`. |
| Authorization only in the layout's `role === 'admin' ? admin : user` | `@admin` data is still fetched and sent. Check auth inside the slot. |
| Expecting interception on a refresh | Interception is **soft-navigation-only** by design. |

## Where it's used

- **Social/media apps:** photo/video modals with shareable URLs.
- **E-commerce:** product quick-view over a listing, cart side-sheet.
- **Admin/CRM:** table + "edit record" panel at `/customers/42/edit`, which still works as a full page.
- **Dashboards:** independent widgets with their own loading/error states and tabs.
- **Auth:** `/login` that opens as a modal from the navbar but is a full page from an email link.

## Source docs

- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/parallel-routes.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/intercepting-routes.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/default.md`
- `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md` (section "Parallel Routes `default.js` requirement")
