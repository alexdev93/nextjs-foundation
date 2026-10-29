# Lesson 1 — File-System Routing

## The problem

In a plain React SPA you declare routes in code (`<Route path="/blog/:slug" element={...} />`). That works, but:

- The route table and the files drift apart, so you have to search to find which component renders `/settings/billing`.
- Code splitting per route is manual (`React.lazy` everywhere).
- Shared layouts, loading states and error boundaries per route are manual too, and everyone builds them differently.
- The server knows nothing about your routes, so it can't render, prefetch, or cache per route.

Next.js makes **the folder structure the route table**. Because the framework knows every route at build time, it can split code per route, prerender routes, prefetch them, generate route types, and attach loading and error boundaries automatically.

## How it works

### Folders are segments, files are UI

```
src/app/
├── layout.tsx              → wraps everything (root layout)
├── page.tsx                → "/"
├── blog/
│   ├── layout.tsx          → wraps /blog and everything below it
│   ├── page.tsx            → "/blog"
│   └── [slug]/
│       └── page.tsx        → "/blog/:slug"
└── api/health/route.ts     → "/api/health" (HTTP endpoint, no UI)
```

- A **folder** = one URL **segment**.
- A route becomes **public only** when the folder has a `page.tsx` (UI) or `route.ts` (HTTP handler).
- A folder can't have both `page.tsx` and `route.ts`, because they would claim the same URL.

`/blog/hello` is made of three segments: `/` (root), `blog`, `[slug]` (leaf).

### The special files

| File | Role | Client or Server by default |
| --- | --- | --- |
| `layout.tsx` | Shared UI. Persists across navigation. | Server |
| `page.tsx` | The unique UI of a route. Makes the route public. | Server |
| `template.tsx` | Like a layout, but remounts on navigation | Server |
| `loading.tsx` | Suspense fallback for the segment | Server |
| `error.tsx` | Error boundary for the segment | **Must be Client** (`'use client'`) |
| `global-error.tsx` | Error boundary for the root layout | Client |
| `not-found.tsx` | UI for `notFound()` and unmatched URLs (root) | Server |
| `forbidden.tsx` / `unauthorized.tsx` | UI for `forbidden()` / `unauthorized()` (experimental) | Server |
| `default.tsx` | Fallback for a parallel-route slot | Server |
| `route.ts` | HTTP endpoint (GET, POST, …) | Server only |

Metadata files (`icon`, `opengraph-image`, `sitemap`, `robots`) also live here. They are covered in Phase 07.

### The component hierarchy

This is the most important diagram in the phase. For **one segment**, Next.js nests the special files like this:

```tsx
<Layout>
  <Template>
    <ErrorBoundary fallback={<Error />}>
      <Suspense fallback={<Loading />}>
        <NotFoundBoundary fallback={<NotFound />}>
          <Page />            {/* or the next segment's <Layout> */}
        </NotFoundBoundary>
      </Suspense>
    </ErrorBoundary>
  </Template>
</Layout>
```

For nested routes the structure repeats. The child segment's `<Layout>` takes the place of `<Page />` in the parent.

Consequences you can derive from this diagram alone:

- `error.tsx` **cannot catch errors thrown by the `layout.tsx` in the same folder**, because the layout sits above the error boundary. To catch layout errors, put `error.tsx` in the **parent** folder, or use `global-error.tsx` for the root layout.
- `loading.tsx` **does not cover slow data in the same folder's layout**, because the layout sits above the Suspense boundary.
- `not-found.tsx` is inside the Suspense boundary, so a `notFound()` thrown in the page can render after the loading state.

### Colocation is safe by default

Only what `page.tsx` or `route.ts` returns is sent to the client. Other files in `app/` are **not routable**:

```
app/dashboard/
├── page.tsx              → /dashboard
├── chart.tsx             → NOT a route, just a module
└── utils.ts              → NOT a route
```

### Private folders: `_folder`

An underscore removes a folder **and all its subfolders** from routing:

```
app/blog/_components/post-card.tsx   → never a route, even if it contains page.tsx
app/blog/_lib/queries.ts
```

Why use it if colocation is already safe?

- It makes the intent explicit: "this is implementation, not routing."
- It avoids collisions with future special file names (if Next adds a new `something.tsx` convention, your files in `_` folders are safe).
- Editors sort `_` folders together.

> Need a real URL that starts with `_`? Name the folder `%5Fname` (the URL-encoded underscore).

### Route groups: `(folder)`

Parentheses remove a folder **from the URL** but keep it in the tree. That means it can still have its own `layout.tsx`, `loading.tsx`, and so on.

```
app/
├── (marketing)/
│   ├── layout.tsx        → marketing header/footer
│   ├── page.tsx          → "/"
│   └── pricing/page.tsx  → "/pricing"
└── (app)/
    ├── layout.tsx        → sidebar + auth UI
    ├── dashboard/page.tsx → "/dashboard"
    └── settings/page.tsx  → "/settings"
```

Three main uses:

1. **Different layouts for routes at the same URL level** (marketing vs app shell above).
2. **Opting only some routes into a layout.** Move `account/` and `cart/` into `(shop)/` with a layout, and leave `checkout/` outside it. Checkout then doesn't get the shop layout, and URLs don't change.
3. **Scoping a `loading.tsx` to one page.** `dashboard/(overview)/page.tsx` + `dashboard/(overview)/loading.tsx` gives only `/dashboard` that skeleton, not `/dashboard/settings`.

### The `src/` folder

This project uses `src/app/`. The `src` folder is optional and only separates app code from config files. Note that `public/`, `next.config.ts`, `.env*` and `tsconfig.json` stay at the **project root**, never inside `src/`.

## Examples

### Example A — Opt specific routes into a layout

```
app/
├── (shop)/
│   ├── layout.tsx         // shop nav + cart badge
│   ├── account/page.tsx   // /account   (has shop layout)
│   └── cart/page.tsx      // /cart      (has shop layout)
└── checkout/page.tsx      // /checkout  (NO shop layout: distraction-free)
```

### Example B — Loading skeleton for one page only

```
app/dashboard/
├── layout.tsx
├── (overview)/
│   ├── loading.tsx        // only applies to /dashboard
│   └── page.tsx           // /dashboard
└── settings/page.tsx      // /dashboard/settings: no skeleton from (overview)
```

### Example C — Feature-colocated structure (good for medium/large apps)

```
app/(app)/invoices/
├── page.tsx
├── loading.tsx
├── error.tsx
├── _components/
│   ├── invoice-table.tsx
│   └── status-badge.tsx
└── _lib/
    └── queries.ts
```

This project chose a different strategy: routing lives in `src/app/`, and code lives in `src/server/`, `src/client/`, `src/shared/`, with ESLint enforcing the boundaries (see [docs/architecture.md](../../docs/architecture.md)). Both are valid. **Pick one and be consistent.**

## Tips & tricks

- **Think of folders as URL, files as behaviour.** When you design a feature, write the URL list first, then the folder tree, then decide which segments need a layout, loading or error file.
- **A route group with a single child is a smell**, unless you use it for a scoped `loading.tsx` or layout. Don't use groups just to "organise".
- **Use `error.tsx` at the parent level** when you need to catch failures from a layout's data fetching.
- **Run `pnpm build`** and read the route table. It's the true source of what routes exist. Typos in folder names (`pages.tsx`, `Layout.tsx`) silently create **no route**. File names are case-sensitive on Linux.
- **`next typegen`** (part of `pnpm typecheck` here) generates types for every route. If a route doesn't show up in `PageProps<'...'>` autocomplete, Next doesn't see it.

## Pitfalls

| Mistake | What happens |
| --- | --- |
| `(marketing)/about/page.tsx` **and** `(shop)/about/page.tsx` | Build error: both resolve to `/about`. |
| `page.tsx` and `route.ts` in the same folder | Conflict error. |
| Expecting `error.tsx` to catch its sibling layout's error | It won't. See the hierarchy above. |
| Multiple root layouts without a home page in one of the groups | `/` has no root layout. Put `page.tsx` inside one group. |
| Putting `'use client'` on `layout.tsx` "to use a hook" | The whole subtree becomes client-bundled. Extract a small client component instead (Lesson 2). |

## Where it's used

- **SaaS:** `(marketing)` with a public layout + `(app)` with an authenticated sidebar layout.
- **E-commerce:** a `(shop)` group shares the cart header, and `checkout/` stays minimal.
- **Docs sites:** `docs/[[...slug]]` (Lesson 3) + a `_components/` folder for MDX helpers.
- **Large teams:** groups per team (`(billing)`, `(analytics)`) so ownership maps to folders without changing URLs.

## Source docs

- `node_modules/next/dist/docs/01-app/01-getting-started/02-project-structure.md`
- `node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route-groups.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/src-folder.md`
