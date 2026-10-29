# Lesson 9 — Exercises (Hands-On Lab) and Checkpoint

All exercises go inside **`src/app/examples/routing/`** so they stay separate from the existing examples. Nothing here is pre-built. You write all of it.

**Before you start**

- Run `pnpm dev` for development, and **`pnpm build && pnpm start`** whenever an exercise says "verify in production". Prefetching and several ⚡ Cache Components errors only show up there.
- Optional: add a "Routing" card to `EXAMPLES` in [src/shared/constants/site.ts](../../src/shared/constants/site.ts). You'll need to extend the `kind` union type. (A small TypeScript exercise in itself.)
- Use fake data: an in-memory array in `src/server/services/` (follow the style of [post-service.ts](../../src/server/services/post-service.ts)) plus an artificial `await new Promise(r => setTimeout(r, 800))` so loading states are visible.
- After each exercise run `pnpm check && pnpm typecheck`. Boundary lint rules and typed routes will catch mistakes.

---

## Exercise 1 — Layout vs template, seen with your own eyes (Lessons 1–2)

Build:

```
src/app/examples/routing/
├── layout.tsx            // has a <Counter /> client component + <nav> links to a, b, c
├── template.tsx          // also has a <Counter /> and a useEffect that console.logs "template mounted"
├── page.tsx              // index
├── a/page.tsx
├── b/page.tsx
└── c/page.tsx
```

Tasks:

1. Increment both counters, then navigate a → b → c. Write down which counter resets.
2. Add `?x=1` to the URL via a `<Link>`. Does the template remount?
3. Make the nav highlight the active link with a client `NavLink` using `usePathname()` and `aria-current`.
4. Move `template.tsx` into `a/`. Predict what changes, then verify.

✅ Done when you can explain each observation using the "template gets a `key` for its segment" rule.

---

## Exercise 2 — Route groups and scoped loading (Lesson 1)

1. Inside `examples/routing/`, create `(shop)/cart/page.tsx` and `(shop)/account/page.tsx` sharing `(shop)/layout.tsx` (a fake cart badge), and `checkout/page.tsx` **outside** the group.
2. Confirm the URLs have no `(shop)` in them and that checkout doesn't get the shop layout.
3. Create a `dashboard/(overview)/loading.tsx` + `dashboard/(overview)/page.tsx` + `dashboard/settings/page.tsx`. Prove the skeleton only appears for `/examples/routing/dashboard`.
4. Break it on purpose: create two pages in different groups that resolve to the same URL. Read the error.

---

## Exercise 3 — Dynamic routes under Cache Components (Lesson 3)

Build `examples/routing/posts/[slug]/page.tsx`, backed by a fake `getPost(slug)` with a delay.

1. **Version A, no `generateStaticParams`.** First write it the "obvious" way: `const { slug } = await params` at the top of the page. Run `pnpm build`. Read and save the error text in your `notes.md`.
2. Fix it with the **pass-the-promise-down + `<Suspense>`** pattern. Build again.
3. **Version B:** add `generateStaticParams` returning 3 slugs. Look at the build output's route table: which symbols do you see now?
4. Make `generateStaticParams` return `[]`. Read the error. Revert.
5. Add param validation: unknown slug → `notFound()`. Add `posts/[slug]/not-found.tsx`.
6. Add `examples/routing/docs/[[...slug]]/page.tsx` that renders a breadcrumb from the segments array. Test `/docs`, `/docs/a`, `/docs/a/b/c`.
7. Add `examples/routing/products/page.tsx` reading `searchParams` (`q`, `page`) inside Suspense. Validate the params with Zod.

Bonus: try `export const dynamicParams = false` and note what Next says (⚡ not available).

---

## Exercise 4 — URL-driven photo modal (Lesson 4)

Scope it to a sub-layout so the root layout stays untouched:

```
src/app/examples/routing/gallery/
├── layout.tsx                    // renders {children} and {modal}
├── default.tsx                   // fallback for the children slot (decide what it should render)
├── page.tsx                      // grid of <Link href="/examples/routing/gallery/photos/{id}">
├── photos/[id]/page.tsx          // full page
└── @modal/
    ├── default.tsx               // null
    ├── (.)photos/[id]/page.tsx   // same content, inside <Modal>
    └── [...catchAll]/page.tsx    // null
```

Tasks:

1. Clicking a photo opens the modal and the URL changes.
2. **Refresh** with the modal open: you should see the full page instead.
3. Back closes the modal, Forward reopens it.
4. Share the content through **one** Server Component used by both the modal page and the full page.
5. The `Modal` client component uses `<dialog>` + `showModal()` and closes with `router.back()`. Check that Esc works.
6. Delete `@modal/default.tsx` and run `pnpm build`. Read the v16 error. Restore it.
7. Delete `[...catchAll]` and navigate from an open modal to another page with a `<Link>`. Explain what you see.

✅ Done when you can explain why the folder is `(.)photos` and not `(..)photos`.

---

## Exercise 5 — Parallel dashboard with independent streaming (Lesson 4)

```
src/app/examples/routing/stats/
├── layout.tsx         // grid: children, @revenue, @orders
├── page.tsx
├── default.tsx
├── @revenue/{page.tsx, loading.tsx, error.tsx, default.tsx}
└── @orders/{page.tsx, loading.tsx, default.tsx, layout.tsx (tabs), recent/page.tsx, top/page.tsx}
```

1. Give revenue a 2s delay and orders a 500ms delay. Watch them stream independently.
2. Make revenue throw sometimes, so only its panel shows the error UI.
3. Add tabs inside `@orders` (`recent`, `top`). Highlight the active tab with `useSelectedLayoutSegment('orders')` from a client component.
4. Soft-navigate to `/examples/routing/stats/top`, then **hard refresh**. Compare what `@revenue` shows in each case and explain it.

---

## Exercise 6 — Watch navigation in the Network tab (Lessons 6–7)

Run **`pnpm build && pnpm start`**.

1. Open DevTools → Network, filter "Fetch/XHR". Load `/`.
2. Scroll so the nav links are visible. Find the **prefetch** requests (look for the `RSC` / `Next-Router-Prefetch` request headers and `text/x-component` responses).
3. Click "Server" in the nav. Is there a new request, or was it served from the prefetch?
4. Click a link to `examples/routing/posts/<slug>` that **wasn't** in `generateStaticParams`. What's prefetched (the App Shell) and what streams after the click?
5. Add `prefetch={false}` to one link and compare.
6. Add `prefetch` (true) to one posts link and compare the prefetch response size with a default link.
7. Use the **Next.js DevTools → Navigation Inspector → Pause on navigations** (in dev) to freeze and inspect the instant UI of the posts page.

Write in `notes.md`: what does a soft navigation request contain that a hard navigation doesn't, and the other way round?

---

## Exercise 7 — Activity state preservation (Lesson 6)

1. On `examples/routing/a` add a text input, a `<details>` element, and a client counter.
2. Fill them in, navigate to `b`, then come back with a `<Link>` (not Back). What survived?
3. Navigate a → b → c → (some 4th route) → a. Did it survive now? (Remember: up to 3 routes are preserved.)
4. Add a dropdown that resets when hidden (`useLayoutEffect` cleanup).
5. Add a form that resets after a successful "submit" but keeps drafts otherwise (the `shouldReset` ref pattern).
6. Try `key={useRouter().bfcacheId}` on a form: fresh on link navigation, restored on Back.

---

## Exercise 8 — Navigation UX polish (Lessons 5–7)

1. `SortSelect` + `SearchBox` on `examples/routing/products` that write to the URL with `router.replace(..., { scroll: false })` inside `startTransition`. Show `isPending`.
2. Wrap the `useSearchParams()` component in `<Suspense>`. Then remove the boundary, run `pnpm build`, and read the error.
3. Add a `LinkHint` using `useLinkStatus()` to links with `prefetch={false}`. Add the 100ms CSS animation delay.
4. Build a `GuardedLink` with `onNavigate` that blocks navigation while a form is dirty.
5. Create `IntentLink` (prefetch `'auto'` → `true` on hover).
6. Put a sticky header on the routing layout and fix the scroll offset with `scroll-padding-top`.

---

## Exercise 9 — Redirects and status codes (Lesson 8)

1. `examples/routing/old-posts/[slug]` → `permanentRedirect` to `posts/[slug]`. Check the status with `curl -I`.
2. A Server Action that "creates" a post and redirects to it. First put `redirect()` inside `try`, observe the bug, then fix it.
3. Call `notFound()` **before** any Suspense and check the status with `curl -I` (expect 404). Then move the call **inside** a Suspense boundary and check again (expect 200 + `noindex` in the HTML). Explain why.
4. (Optional) Enable `experimental.authInterrupts`, add a fake role cookie, and protect `examples/routing/admin` with `forbidden()` + `forbidden.tsx`.

---

## Exercise 10 — Typed routes and validation (Lesson 5)

1. Write a typed `NavLink<T extends string>({ href: Route<T> })`.
2. Make a typo in an `href` and read the error.
3. Build a `safeNext(next)` helper for `?next=` redirects and unit test it with Vitest (like the existing `*.test.ts` files).

---

## Checkpoint questions

Answer each one in writing first, then open the answer.

<details><summary>1. Why can't <code>error.tsx</code> catch an error thrown in the <code>layout.tsx</code> of the same folder?</summary>

Because of the component hierarchy: `Layout > Template > ErrorBoundary(error.tsx) > Suspense(loading.tsx) > NotFound > Page`. The layout sits **above** its sibling error boundary. Put `error.tsx` in the parent segment, or use `global-error.tsx` for the root layout.
</details>

<details><summary>2. Why don't layouts receive <code>searchParams</code> or the pathname?</summary>

Layouts are not re-rendered on navigation (partial rendering). Any URL value read on the server inside a layout would become stale. Pages get `searchParams`, and Client Components use `useSearchParams`/`usePathname`, which do re-render.
</details>

<details><summary>3. In this project (Cache Components on), what's wrong with <code>const { slug } = await params</code> at the top of a page that has no <code>generateStaticParams</code>?</summary>

The params are runtime (URL) data. Awaiting them outside `<Suspense>` prevents a static shell. The build errors, and Partial Prefetching reports "URL data outside of Suspense". Pass the promise to a child inside `<Suspense>` (or rely on `loading.tsx`), or provide `generateStaticParams`.
</details>

<details><summary>4. What happens to a parallel slot that has no matching page on soft navigation vs hard navigation?</summary>

Soft: it keeps showing its previous active state. Hard: it renders its `default.tsx`. In v16 every slot must have a `default.tsx`, or the build fails.
</details>

<details><summary>5. Why <code>@modal/(.)photos</code> and not <code>@modal/(..)photos</code>?</summary>

Interception markers count **route segments**, and `@modal` is a slot, not a segment. So `@modal/(.)photos` is on the same segment level as `photos`.
</details>

<details><summary>6. With Partial Prefetching on, what does a default <code>&lt;Link&gt;</code> prefetch, and what does <code>prefetch={true}</code> add?</summary>

Default: the route's **App Shell** (static + cached content not depending on URL data, plus Suspense fallbacks; session data if the route reads cookies/headers), shared by every link to the route. `prefetch={true}`: a **per-link prefetch** that also resolves that link's `params`/`searchParams` and the **cached** content behind them. Uncached dynamic content still streams after the click.
</details>

<details><summary>7. Why might your analytics count page views when users only hover links?</summary>

Destination Server Components (layouts/pages) render during prefetch. A side effect in render runs on prefetch. Move it into a client `useEffect`.
</details>

<details><summary>8. You navigate away from a page with a half-filled form and come back via a Link. The values are still there. Why, and how do you reset them when needed?</summary>

With Cache Components, Next hides previous routes with React `<Activity>` instead of unmounting them (up to 3 routes), so state and DOM survive. Reset explicitly: in the submit handler, with a `useLayoutEffect` cleanup, by deriving from search params, with a `key`, or with `router.bfcacheId` as a last resort.
</details>

<details><summary>9. A root-layout navbar uses <code>usePathname()</code>. Everything worked until a teammate added <code>app/orders/[id]/page.tsx</code>. Now the build fails. Why?</summary>

Under Cache Components, `usePathname()` suspends on routes whose dynamic params aren't known at build time (no `generateStaticParams`). Without a `<Suspense>` around the navbar, prerendering can't complete. Wrap the navbar's URL-reading part in `<Suspense>`.
</details>

<details><summary>10. Why does <code>redirect()</code> inside <code>try {}</code> not redirect?</summary>

`redirect()` works by throwing `NEXT_REDIRECT`. Your `catch` catches it. Call it after the `try/catch`, or call `unstable_rethrow(e)` first in the catch.
</details>

<details><summary>11. You call <code>notFound()</code> inside a Suspense boundary and the response status is 200. Is this a bug?</summary>

No. Streaming already started, so headers (status 200) were sent. Next renders the not-found UI into the stream and adds `<meta name="robots" content="noindex">`. For a real 404, check before streaming starts or in `proxy.ts`.
</details>

<details><summary>12. When does navigation cause a full page reload even with <code>&lt;Link&gt;</code>?</summary>

When it crosses between **different root layouts** (e.g. `(marketing)` → `(app)` each with its own `<html>`), or when the target is external.
</details>

<details><summary>13. <code>router.refresh()</code> didn't show new data. Why?</summary>

`refresh()` re-renders the route on the server and clears the client cache for it, but it does **not** invalidate server caches (`'use cache'`, cached fetches). Revalidate with `revalidateTag`/`updateTag`/`revalidatePath`.
</details>

<details><summary>14. What's the difference between <code>prefetch()</code>, <code>navigation()</code> and <code>connection()</code>?</summary>

`await prefetch()`: content below is excluded from the App Shell but can load on a per-link prefetch or the navigation, and stays cacheable. `await navigation()`: content below loads only on navigation, and stays cacheable. `await connection()`: content below is request-time only, never prerendered (request-dependent).
</details>

---

## When you're done

- [ ] All exercises built in `src/app/examples/routing/`
- [ ] `notes.md` has your error messages + explanations
- [ ] You answered every checkpoint question without looking
- [ ] `pnpm verify` passes

Then move to **Phase 02 — Server & Client Components**.
