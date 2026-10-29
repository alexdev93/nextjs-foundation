# Lesson 6 — How Client-Side Navigation Works (Under the Hood)

This lesson explains the machinery. Once you understand it, most "why is my navigation slow / why did my state reset / why didn't it reset" questions answer themselves.

## The problem Next is solving

Server rendering gives fast first loads and good SEO, but traditionally every click means a full round trip and a full page reload. Client rendering gives smooth transitions but large JS bundles and slow first loads.

The App Router aims for both: **server-rendered** routes that **navigate like an SPA**. It does this with four pieces working together:

1. **Server rendering**: routes render on the server, as HTML on the first visit and as an **RSC payload** after that.
2. **Prefetching**: the payload is downloaded *before* the click (Lesson 7).
3. **Streaming**: anything not ready is sent later, into `<Suspense>` fallbacks.
4. **Client-side transitions**: the router swaps only the changed segments and keeps shared layouts.

## Hard navigation vs soft navigation

| | Hard (full page load) | Soft (client-side) |
| --- | --- | --- |
| Triggered by | First visit, refresh, `<a href>`, typing a URL, `window.location`, crossing **root layouts** | `<Link>`, `router.push/replace/back/forward` |
| Server returns | **HTML** + RSC payload (inlined) + JS | **RSC payload only** (`text/x-component`) |
| JS state | lost | kept |
| Shared layouts | re-rendered | **kept**, not re-fetched |
| Parallel slots without a match | render `default.tsx` | keep previous state |
| Intercepting routes | **not** applied | applied |

You can see this yourself (Exercise 6): in DevTools → Network, a soft navigation shows a `fetch` request with an `RSC: 1` request header and a `text/x-component` response, not a document request.

## What's in the RSC payload?

The **React Server Component payload** is a compact, streamable description of the rendered Server Component tree:

- the **rendered output** of Server Components (already-resolved elements, not their code),
- **placeholders** for Client Components, with **references** to their JS chunks,
- the **props** passed from Server to Client Components (serialized),
- markers for Suspense boundaries whose content streams in later.

On the first load, React uses the HTML for a fast paint, then uses the payload to **hydrate** (attach Client Components to that HTML). On soft navigations there's no HTML. The router renders the payload directly into the existing tree.

(Phase 11 reads this format line by line.)

## The client cache (router cache)

The router keeps an **in-memory cache of RSC payloads, keyed by route segment**:

- Navigating `/dashboard/settings` → `/dashboard/analytics` reuses the cached `/` and `/dashboard` layouts and fetches only the `analytics` leaf.
- Prefetched data lives here too, so a click can render immediately.
- Back/forward navigations reuse previously visited pages.
- `router.refresh()` clears the cache for the current route. Server Actions that revalidate also update it (Phase 05).

How long entries stay fresh depends on prefetch mode and on `staleTimes` (Lesson 7 and Phase 04). Without Partial Prefetching, static prefetches stay for 5 minutes by default. Dynamic pages aren't cached unless you configure it.

## Step by step: clicking a `<Link>`

Assume production, a link to `/blog/hello` that has been in the viewport.

1. **Viewport → prefetch.** `<Link>` (a Client Component, so it must be hydrated first) is noticed by an IntersectionObserver. The prefetch scheduler queues the route. With Partial Prefetching the router downloads the route's **App Shell**: static + cached content, with `<Suspense>` fallbacks where URL or request data goes.
2. **Click.** `<Link>` calls `preventDefault` on the native navigation and starts a **React transition**.
3. **Instant render from the cache.** The router renders the new segments from the prefetched shell right away, so skeletons and static content appear. The shared layouts above stay mounted.
4. **Request the rest.** The router asks the server for the remaining dynamic parts of the route. The server streams the RSC payload. Each `<Suspense>` boundary fills in as its chunk arrives.
5. **History + scroll.** The URL updates (push/replace). Scroll is managed (Lesson 5).
6. **Old page is hidden, not destroyed** (⚡ Cache Components, see below).

If the prefetch hasn't finished (slow network, `prefetch={false}`), step 3 has nothing to show. The old page stays visible while waiting, and the navigation is "pending". That's where `useLinkStatus` helps.

## ⚡ "Instant" navigation, and why page load ≠ client navigation

A navigation is **instant** when the new page starts rendering the moment you click (static, cached and fallback content appear immediately) while the server streams the remaining content into its fallbacks.

A subtle but important detail: **on a client navigation, only the components below the shared layout re-render.** So:

- A `<Suspense>` boundary in the **root layout** covers everything on a **page load**.
- On a navigation from `/store/shoes` to `/store/hats`, that boundary sits **above** the re-render scope and **does not trigger**.
- So the destination page needs **its own** `<Suspense>`/`loading.tsx` **below the shared layout** to be instant.

The same detail explains why `useSearchParams()` suspends during server prerendering but resolves synchronously on a client navigation: the router already knows the URL.

Next 16 helps here:

- `export const instant = true` on a page/layout makes Next **validate in dev** that navigations into it are instant. Blocking code is reported in the dev overlay. (Lesson 7 has details.)
- **Next.js DevTools → Navigation Inspector → "Pause on navigations"** freezes the UI at the prefetched/instant state so you can see exactly what the user sees at click time.

## ⚡ State preservation with React `<Activity>`

This is new behaviour that comes from enabling Cache Components, and it surprises people.

**Before:** navigating away **unmounted** the page. All its state was lost.
**Now:** Next **hides** the old page with React `<Activity mode="hidden">` instead of unmounting it.

- The DOM stays in the document with `display: none`.
- React state, form input values, scroll positions inside the page, open `<details>`, and video positions are **preserved**.
- **Up to 3 routes** are preserved. Beyond that, the oldest is evicted and renders fresh next time.
- While hidden, **effects are cleaned up** (just like unmount), and they run again when the page is shown.

So when you go `/a` → `/b` → back to `/a`, the form you half-filled on `/a` is still filled.

### Deciding what should reset

| UI | Keep? | How to reset |
| --- | --- | --- |
| Filter panel, accordion, sidebar sections | ✅ usually keep | — |
| Dropdown/popover opened by a click | ❌ reset | `useLayoutEffect(() => () => setOpen(false), [])`, or close it in `<Link onNavigate>` |
| Dialog with "focus input when opened" effect | ❌ | Derive `open` from a **search param** (`?edit=true`) instead of state |
| "New item" form after submit | ❌ | Reset state in the submit handler before `router.push` |
| Stale "Message sent!" banner | ❌ | `useLayoutEffect` cleanup guarded by a `shouldReset` ref |
| Drafts across **user changes** (logout/login) | ❌ | `key={userId}` on the form, or a hard navigation on logout |
| `<video>`/`<audio>` playback | pause | `useLayoutEffect` cleanup → `video.pause()` (`display:none` does **not** stop audio) |
| Page-level `<style>` / CSS variables | disable when hidden | callback ref toggling `style.media = 'not all'` |

Example: close a dropdown when its page is hidden.

```tsx
'use client'
import { useLayoutEffect, useState } from 'react'

export function UserMenu() {
  const [open, setOpen] = useState(false)
  useLayoutEffect(() => () => setOpen(false), [])   // runs when Activity hides the page
  return (/* ... */)
}
```

### `router.bfcacheId`

`useRouter().bfcacheId` is an opaque id that **changes on push/replace navigations** and **stays the same on back/forward**, `refresh()`, and search-param/hash-only changes.

```tsx
const { bfcacheId } = useRouter()
return <form key={bfcacheId}>…</form>
```

This resets the form on fresh navigations but restores it on Back, like the browser's real bfcache. The docs call it mainly a **migration tool**. Prefer the explicit resets above in new code.

### Effects run on every show

Effects run again whenever a hidden route becomes visible. If you must distinguish "first mount" from "shown again", keep a `useRef` flag (refs survive hide/show).

### Testing implication

Hidden routes are **still in the DOM**. In Playwright, use `getByRole`/`getByLabel` (which filter by visibility) or `.filter({ visible: true })`. A bare `locator('.card').first()` may grab an element from a hidden page.

## `useLinkStatus`: feedback when a navigation is pending

```tsx
'use client'
import { useLinkStatus } from 'next/link'

export function LinkHint() {
  const { pending } = useLinkStatus()
  return <span aria-hidden className={`link-hint ${pending ? 'is-pending' : ''}`} />
}

// usage: must be a DESCENDANT of <Link>
<Link href="/reports" prefetch={false}>
  Reports <LinkHint />
</Link>
```

- `pending` is `true` from the click until the history update.
- If the route was already prefetched, the pending state is usually skipped.
- Only the **last** clicked link shows pending.
- **Debounce visually**: start with `opacity: 0` and add a ~100ms `animation-delay`, so fast navigations don't flash. Reserve the space with fixed size + `visibility: hidden` to avoid layout shift.
- Use it as a **patch** for slow transitions. The real fix is prefetching, `loading.tsx`, or caching.

## Common "why?" questions, answered with this model

- **"My layout's `useEffect` didn't run when I changed pages."** Layouts persist, so there's no remount. Use `usePathname()` in the effect's dependencies, or a `template.tsx`.
- **"My page's form kept old values when I came back."** That's ⚡ Activity preservation working as designed. Reset deliberately.
- **"The skeleton in my root layout doesn't show on navigation."** It's above the re-render scope. Add `loading.tsx`/Suspense in the destination segment.
- **"Clicking between `(marketing)` and `(app)` reloads the page."** They have different root layouts, so the navigation is hard.
- **"Analytics fires when I hover links."** The side effect is in a Server Component that runs during prefetch. Move it to a client effect.
- **"After logout, the previous user's draft is visible."** Activity preserved it. Hard-navigate on logout or key by user id.

## Source docs

- `node_modules/next/dist/docs/01-app/01-getting-started/04-linking-and-navigating.md`
- `node_modules/next/dist/docs/01-app/02-guides/preserving-ui-state.md`
- `node_modules/next/dist/docs/01-app/02-guides/instant-navigation.md` (sections "What instant means", "Visualize loading states")
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-link-status.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-router.md` (section `bfcacheId`)
- `node_modules/next/dist/docs/01-app/04-glossary.md` (Client Cache, RSC Payload, App Shell)
- React docs: `<Activity>`: https://react.dev/reference/react/Activity
