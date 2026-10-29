# Routing & Navigation Cheat Sheet (Next 16.4, Cache Components + Partial Prefetching)

## Folder → URL

| Folder | URL / meaning |
| --- | --- |
| `blog/` | `/blog` segment |
| `[id]/` | one param → `string` |
| `[...slug]/` | 1+ segments → `string[]` |
| `[[...slug]]/` | 0+ segments → `string[] \| undefined` |
| `(group)/` | not in URL. Groups layouts / scopes loading |
| `_private/` | not routable at all |
| `@slot/` | parallel route slot → layout prop, not in URL |
| `(.)x` `(..)x` `(..)(..)x` `(...)x` | intercept `x` same / up 1 / up 2 / from root (counts **segments**, slots don't count) |

## Component hierarchy (per segment)

```
Layout > Template > ErrorBoundary(error) > Suspense(loading) > NotFound(not-found) > Page | child Layout
```

- `error` doesn't catch its sibling `layout`. `loading` doesn't cover its sibling `layout`.

## Layout vs template

| | layout | template |
| --- | --- | --- |
| Persists on navigation | ✅ | ❌ remounts when its segment (incl. param) changes |
| Search-param change | — | no remount |
| Gets `params` | ✅ (Promise) | — |
| Gets `searchParams` / pathname | ❌ | ❌ |

## Props & types (global, no import)

```ts
PageProps<'/blog/[slug]'>     // { params: Promise<…>, searchParams: Promise<…> }
LayoutProps<'/dashboard'>     // { children, params, ...slots }
RouteContext<'/api/x/[id]'>   // route handlers
import type { Route } from 'next'   // typed hrefs; cast non-literals: x as Route
```

## ⚡ Cache Components rules

- Read `params` (without gSP), `searchParams`, `cookies()`, `headers()` **inside `<Suspense>`**. Pass promises down.
- `generateStaticParams` must return **≥ 1** item. `dynamicParams` is **not available**.
- `useSearchParams` → always in `<Suspense>`.
- `usePathname` / `useParams` / `useSelectedLayoutSegment(s)` → suspend on unknown dynamic params, so wrap them in `<Suspense>`.
- `loading.tsx` = a normal Suspense boundary. Uncached data in a **layout** needs its own Suspense.
- Previous routes are kept alive with `<Activity>` (max 3). Reset state deliberately.

## Navigation APIs

```tsx
<Link href="/x" replace scroll={false} prefetch={false|true|'auto'} onNavigate={e => e.preventDefault()} transitionTypes={['slide']} />
const r = useRouter(); r.push(href,{scroll}); r.replace(); r.back(); r.forward(); r.refresh(); r.prefetch(href,{onInvalidate}); r.bfcacheId
usePathname() useSearchParams() useParams() useSelectedLayoutSegment('slot?') useSelectedLayoutSegments()
useLinkStatus()  // from 'next/link', inside a <Link>
window.history.pushState/replaceState  // syncs with the router hooks, no server request
```

## Prefetch (Partial Prefetching on)

| `prefetch` | Gets |
| --- | --- |
| `'auto'`/`null` (default) | App Shell (shared per route) |
| `true` | App Shell + per-link URL data + cached content behind it |
| `false` | nothing |

Segment config: `export const prefetch = 'partial' | 'force-disabled'` · `export const instant = true | false` · `export const ensureStatic = 'shell' | 'prefetch' | 'navigation'`
Subtree: `await prefetch()` (shell ✗, per-link ✓) · `await navigation()` (only on nav) · `await connection()` (request-time only)
Production only. Side effects in Server Components run on prefetch.

## Control flow (`next/navigation`, all throw, type `never`)

| Fn | Status | Notes |
| --- | --- | --- |
| `redirect(url, type?)` | 307 (303 for SA forms) | default `push` in Server Actions, `replace` elsewhere. Not in event handlers |
| `permanentRedirect` | 308 | slug changes, canonical URLs |
| `notFound()` | 404 | nearest `not-found.tsx`. Root one handles unmatched URLs |
| `forbidden()` / `unauthorized()` | 403 / 401 | `experimental.authInterrupts`. Not in root layout |
| `unstable_rethrow(e)` | — | first line of `catch` |

Called after streaming starts → status 200 + `noindex`. For real codes: check before Suspense or in `proxy.ts`.

## Hard navigation triggers

Refresh · `<a>` · typed URL · `window.location` · crossing root layouts · external links

## Debug toolbox

`pnpm build` route table · DevTools Network (`RSC` header, `text/x-component`) · Next DevTools → Navigation Inspector → Pause on navigations · `export const instant = true` · `curl -I` for status codes · `@next/playwright` `instant()`
