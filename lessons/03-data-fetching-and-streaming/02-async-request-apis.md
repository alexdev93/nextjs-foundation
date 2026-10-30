# Lesson 2 — Async Request APIs

## The problem

Some data only exists **when a real request arrives**: the URL's params and query string, cookies, headers, draft-mode state. In Next 14, you read them synchronously:

```ts
const theme = cookies().get('theme')   // Next 14
const { slug } = params                // Next 14
```

That made it impossible for Next to know **where** in the tree a component starts depending on the request. One `cookies()` call anywhere made the **whole route** dynamic.

In Next 15 these APIs became **async** (with a sync fallback), and in **Next 16 synchronous access is fully removed**. Every one of them returns a Promise. The `await` is the exact point where rendering starts to depend on the request, so Next can prerender everything before it and stream everything after it.

## How it works

### The APIs

| API | Where | Returns |
| --- | --- | --- |
| `params` | `page`, `layout`, `route`, `default`, metadata functions | `Promise<{ ... }>` |
| `searchParams` | `page` only | `Promise<{ [key: string]: string \| string[] \| undefined }>` |
| `cookies()` | Server Components (read), Server Functions / Route Handlers (read + write) | `Promise<ReadonlyRequestCookies>` |
| `headers()` | Server Components, Server Functions, Route Handlers | `Promise<ReadonlyHeaders>` |
| `draftMode()` | Server Components, Server Functions, Route Handlers | `Promise<{ isEnabled, enable(), disable() }>` |

`cookies`, `headers` and `draftMode` come from `next/headers`.

Typed helpers are generated for every route (Phase 01). Use them instead of writing the types by hand:

```tsx
export default async function Page({ params, searchParams }: PageProps<'/blog/[slug]'>) {
  const { slug } = await params
  const { page = '1' } = await searchParams
}
```

### ⚡ Where the `await` happens decides how much of the page is dynamic

Under Cache Components, reading request data outside `<Suspense>` fails the build:

> `Route "/x": Next.js encountered runtime data during prerendering.`
> Fix: **[stream]** Provide a placeholder with `<Suspense fallback={...}>` around the data access.

So the question is always: **how high up in the tree is the `await`?** Everything **below** an unresolved request-time `await` (up to the nearest `<Suspense>`) waits for the request and can't be in the static shell.

```tsx
// ❌ The layout awaits cookies at the top. Nothing in this layout or below can be prerendered,
//    and the build fails unless a Suspense boundary sits above this layout.
export default async function DashboardLayout({ children }: LayoutProps<'/dashboard'>) {
  const theme = (await cookies()).get('theme')?.value
  return <div data-theme={theme}><Sidebar />{children}</div>
}
```

```tsx
// ✅ Push the dynamic access down into a small component inside Suspense.
export default function DashboardLayout({ children }: LayoutProps<'/dashboard'>) {
  return (
    <div>
      <Sidebar />                                  {/* static: in the shell */}
      <Suspense fallback={<UserMenuSkeleton />}>
        <UserMenu />                               {/* awaits cookies() inside */}
      </Suspense>
      {children}                                   {/* pages are not blocked by the layout */}
    </div>
  )
}
```

This is the answer to the roadmap's checkpoint question: **awaiting `cookies()` high in a layout makes that layout and its whole subtree depend on the request.** The pages can't be prerendered into the shell, and every navigation waits for it.

### Pass the promise down instead of awaiting early

`params` and `searchParams` are promises, so you can hand them to the component that needs them **without awaiting**:

```tsx
export default function Page({ params }: PageProps<'/lessons/[slug]'>) {
  return (
    <>
      <StaticIntro />                                   {/* in the shell */}
      <Suspense fallback={<HeaderSkeleton />}>
        <LessonHeader params={params} />                {/* awaits params inside */}
      </Suspense>
    </>
  )
}
```

Your [src/app/lessons/[slug]/page.tsx](../../src/app/lessons/[slug]/page.tsx) already does this. Its comment explains why: with Partial Prefetching, the App Shell is **shared by every `/lessons/[slug]` link**, so the shell itself can't depend on `params`, even though `generateStaticParams` lists the slugs.

### Reading them in Client Components

- `params` / `searchParams` promises can be passed to a Client Component and unwrapped with `use(params)`.
- Or use the hooks: `useParams()`, `useSearchParams()`, `usePathname()` (Phase 01, Lesson 5).
- ⚡ `useSearchParams()` always needs a `<Suspense>` boundary, because search params are only known at request time.

### `connection()` and `io()`: request-time without a request API

Sometimes a component doesn't read any request data but must still produce **fresh output per request**: `Math.random()`, `new Date()`, a synchronous DB driver.

| | `await connection()` (`next/server`) | `await io()` (`next/cache`, new in 16.3) |
| --- | --- | --- |
| Effect during prerender | Suspends: the code after it is left out of the static shell | Same |
| Blocks prefetching | **Yes**, waits for a real user navigation | **No**, suspends like any async work, so it can be prefetched and cached on the client |
| Inside `'use cache'` | Not allowed as a fix | No-op (the value is captured into the cache) |
| Prefer it when | Rendering must wait for a real request | Almost always under Cache Components |

```tsx
import { io } from 'next/cache'

async function ServerTime() {
  await io()
  return <time>{new Date().toISOString()}</time>
}
// render inside <Suspense fallback={<time>…</time>}>
```

In a Client Component, the docs' form is `use(io())` before reading `Date.now()`.

This repo's [health Route Handler](../../src/app/api/health/route.ts) uses `await connection()` so every probe returns a fresh timestamp. That's a case where waiting for a real request is exactly what you want.

### When you don't need either

If the component already calls `cookies()`, `headers()`, or awaits an uncached `fetch` inside Suspense, **that `await` is already the suspension point**. Adding `io()` is redundant.

## Examples

### Example 1 — The layout that blocks everything

1. Create `src/app/examples/data/blocking/layout.tsx` that does `await cookies()` at the top, and a simple `page.tsx`.
2. Run `pnpm build`. Read the `runtime data` error and note which route it names.
3. Fix it by moving the cookie read into a `<UserBadge />` inside `<Suspense>`.
4. Build again and check the route is now partially prerendered.

### Example 2 — Search params, validated

```tsx
// src/app/examples/data/products/page.tsx
import { z } from 'zod'

const querySchema = z.object({
  q: z.string().trim().max(100).default(''),
  page: z.coerce.number().int().min(1).default(1),
})

export default function Page({ searchParams }: PageProps<'/examples/data/products'>) {
  return (
    <Suspense fallback={<ResultsSkeleton />}>
      <Results searchParams={searchParams} />
    </Suspense>
  )
}

async function Results({ searchParams }: Pick<PageProps<'/examples/data/products'>, 'searchParams'>) {
  const query = querySchema.parse(await searchParams)   // never trust the URL
  // ...fetch with query.q / query.page
}
```

### Example 3 — `io()` vs `connection()`

Render two clocks, one after `await io()` and one after `await connection()`, each in its own `<Suspense>`. In `pnpm build && pnpm start`, hover a `<Link>` to the page and watch the Network tab. Which clock's content arrives with the prefetch?

## Tips & tricks

- **Await late, await low.** Do the `await` in the smallest component that needs the value.
- **Validate `params` and `searchParams`.** They're user input. Unknown slug → `notFound()` (do it **before** the first Suspense boundary if you want a real 404 status, see Lesson 5).
- **`cookies().set()` only works in Server Functions and Route Handlers.** A Server Component can't set cookies, because the response headers may already be streaming.
- **Codemod for upgrades:** `npx @next/codemod@latest next-async-request-api .` converts old sync access.

## Pitfalls

| Mistake | Symptom |
| --- | --- |
| `cookies().get(...)` without `await` | Type error. In Next 16 sync access is removed |
| `await cookies()` at the top of a layout (⚡) | `runtime data during prerendering` build error, or the whole subtree becomes request-time |
| `await params` at the top of a page with unknown slugs (⚡) | Same error. Pass the promise down into Suspense |
| `useSearchParams()` without Suspense (⚡) | Build error about URL data outside Suspense |
| Using `connection()` where `io()` would do | Content can't be prefetched, so navigations are slower |
| `searchParams` in a layout | No such prop. Read it in the page or with `useSearchParams()` |

## Where it's used

- **Auth-aware UI:** a user menu reading the session cookie inside its own Suspense boundary, with the rest of the page static.
- **Search and filter pages:** `searchParams` validated with Zod, results streamed.
- **Geo / locale hints:** `headers()` for `accept-language` in one small component.
- **CMS previews:** `draftMode()` to switch to unpublished content.

## Source docs

- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/cookies.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/headers.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/draft-mode.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/connection.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/io.md`
- `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md` (async request APIs)
- `node_modules/next/dist/docs/01-app/02-guides/building.md` (section "Prerender validation")
