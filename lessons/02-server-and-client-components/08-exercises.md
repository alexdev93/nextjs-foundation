# Lesson 8 — Exercises (Hands-On Lab) and Checkpoint

All exercises go inside **`src/app/examples/boundary/`** so they stay separate from the existing examples. Nothing here is pre-built. You write all of it.

**Before you start**

- Run `pnpm dev` for development, and **`pnpm build && pnpm start`** whenever an exercise says "verify in production".
- Keep a browser DevTools window open with the **Console** and **Network** (filter `rsc`) tabs.
- After each exercise run `pnpm check && pnpm typecheck`. The boundary lint rules are part of the lesson.
- Save every error message you trigger into `notes.md`, with one line in your own words about which rule it enforces.

---

## Exercise 1 — Draw the boundary tree (Lessons 1–2)

For [src/app/examples/server/page.tsx](../../src/app/examples/server/page.tsx) and [src/app/examples/client/page.tsx](../../src/app/examples/client/page.tsx), draw the component tree in `notes.md`. Mark each node:

- **S** (Server Component), **C** (Client Component) or **N** (neutral module whose role depends on its importer).
- ⬇ where a `'use client'` entry point is.
- 🔗 where a Server Function crosses as a reference.

Hints: `PageHeader`, `Card` and `Badge` are neutral modules. In which tree are they Server Components? Is `Button` ever a Client Component here?

✅ Done when you can say, for every node, whether its code ships to the browser.

---

## Exercise 2 — Where does code run? (Lesson 1)

Build `boundary/where/` from Lesson 1, Example 1.

1. Hard refresh. Record which logs appear in the terminal and which in the browser.
2. Navigate away and back with a `<Link>`. Record again.
3. Run `pnpm build && pnpm start` and repeat. Why does the server log appear during the **build** and not on each request? (⚡ static shell)
4. Make the page request-time: add a child component that calls `await connection()` inside `<Suspense>`. Rebuild and check when the server log appears now.

---

## Exercise 3 — Move the boundary, measure the bundle (Lesson 2)

1. Build and record `firstLoadUncompressedJsBytes` for `/examples/client` from `.next/diagnostics/route-bundle-stats.json`.
2. Add `'use client'` to the top of the page (remove `metadata` first). Rebuild and record.
3. Revert. Now move the opposite way: split [contact-form.tsx](../../src/client/components/contact-form.tsx) so that the static field labels and layout come from a Server Component, and only the stateful form part is client. Did the number go down? Why is the saving small? (Think about what's still imported.)
4. Use `pnpm next analyze` and find which modules `Counter` pulls into the client graph.

---

## Exercise 4 — The serialization zoo (Lesson 3)

Build `boundary/props/` with a client `<Show value={...} />` that renders `Object.prototype.toString.call(value)` and `String(value)`.

1. Pass each value from Lesson 3, Example 1, one at a time. Copy each error.
2. Pass `new Date()`, `new Map()`, `new Set()`, `10n` and `undefined`. Confirm the **type** on the client side, not just the text.
3. Pass a plain object with a `passwordHash` field that `Show` doesn't render. Find it in **View Source** and in the RSC response. Write down why this is a security issue.
4. Turn on `experimental: { taint: true }`, taint that object, and read the error. Then pass `{ ...object }` and see that the copy is not caught. Revert the config.

---

## Exercise 5 — Composition (Lesson 4)

1. Build a client `<Collapsible title={...}>` with an open/closed state. Pass an **async Server Component** as `children` that awaits a fake 800 ms delay and renders a list.
2. Toggle it many times. Prove (with a server `console.log`) that the server child doesn't re-render.
3. Now import the Server Component **inside** the collapsible file instead. Read the error.
4. Build the `Tabs` example from Lesson 4. Then rewrite it so the active tab is `?tab=` in the URL and only that panel is rendered on the server. Compare what's in the RSC payload in each version.
5. Stream a promise: start a slow fetch in the page **without awaiting**, pass it to a client component that calls `use()`, and wrap it in `<Suspense>`. Remove the Suspense boundary, run `pnpm build`, and record the ⚡ error.

---

## Exercise 6 — Providers done right (Lesson 4)

1. Create a `'use client'` `CounterContext` provider scoped to `boundary/provider/layout.tsx`, not the root layout.
2. Read the context in two client children placed far apart in the page, with Server Components between them.
3. Answer in `notes.md`: why does [createStoreContext](../../src/client/stores/create-store-context.tsx) create the store with `useState(() => create(...))` instead of a module-level constant? Write the bug that a module-level store would cause on the server.

---

## Exercise 7 — Environment poisoning (Lesson 5)

1. Run Lesson 5, Example 1, and confirm the two ESLint errors.
2. Run Example 2: get past ESLint with a neutral helper file, then get caught by the build. Copy the import trace.
3. Remove `import "server-only"` from a copy of a service file, import it from a Client Component through a helper, and run the build. What happens now? What leaks? Restore it.
4. Add `NEXT_PUBLIC_BUILD_LABEL=one` to `.env.local`, render it in a Client Component, build, then change it to `two` **without** rebuilding and start the server. Which value does the browser show?

---

## Exercise 8 — Hydration lab (Lesson 7)

1. Build the `Clock` from Lesson 7. Fix it three ways and record what the user sees on refresh for each.
2. Start the dev server with `TZ=UTC LANG=ja_JP.UTF-8 pnpm dev`, render a date with `toLocaleDateString()` in a Client Component, and record the mismatch. Fix it with the docs' `LocalDate` + inline-script pattern.
3. Explain, using the theme files in this repo, why `ThemeToggle` never mismatches even though the server doesn't know the theme.
4. Rewrite [lifecycle-logger.tsx](../../src/app/lessons/_components/lifecycle-logger.tsx) to use a `useIsClient()` hook instead of setting the ID in an effect. Keep the Phase 01 demo working.

---

## Checkpoint

Answer without notes, then check.

1. Does a Client Component render on the server? When is it skipped?

   <details><summary>Answer</summary>

   Yes. On a full page load (and during prerendering) it renders on the server to HTML, then hydrates in the browser. It's skipped on the server for **client-side navigations** (the server only sends the RSC Payload, and the component renders in the browser) and when it's loaded with `next/dynamic` and `ssr: false`.

   </details>

2. Why can you pass `<ServerThing />` as `children` to a Client Component, but not import it there?

   <details><summary>Answer</summary>

   Imports decide the module graph. Importing it into a `'use client'` file puts its code into the client graph, so it becomes a Client Component (no async, no server-only code). Passing it as `children` means its **owner** is a Server Component, so it renders on the server and only its **output** (a serializable React element) crosses to the client.

   </details>

3. You see `Functions cannot be passed directly to Client Components`. List two ways to fix it.

   <details><summary>Answer</summary>

   (a) Move the function into the Client Component (or a client file it imports). (b) If it must run on the server, make it a Server Function with `'use server'` and pass it as a reference, ideally with a prop named `action` / `...Action`. For render props: render elements on the server and pass those instead.

   </details>

4. What does a Server Component receive when it imports a non-component export from a `'use client'` file?

   <details><summary>Answer</summary>

   A client reference, not the value. You can render it if it's a component, but calling it throws `Attempted to call ... from the server`. Put shared helpers and constants in neutral modules.

   </details>

5. Why do you need both the ESLint rules and `server-only`?

   <details><summary>Answer</summary>

   ESLint checks direct imports in one file at edit time (and folder rules). `server-only` is checked by the bundler over the **whole import chain** at build time, so it catches indirect imports through neutral files. ESLint gives fast feedback, and `server-only` is the guarantee.

   </details>

6. What does `suppressHydrationWarning` do, and what doesn't it do?

   <details><summary>Answer</summary>

   It makes React keep the existing DOM for that element's attributes and text and not report the difference. It works one level deep, doesn't cover children, and doesn't fix a real bug. Use it for expected differences, such as those caused by an inline script or a live timestamp.

   </details>

7. Why is an inline script better than `useEffect` for applying a saved theme?

   <details><summary>Answer</summary>

   It runs synchronously while the HTML is parsed, before the first paint and before React loads. `useEffect` runs after hydration and paint, so the user sees the default theme first (a flash). `useLayoutEffect` runs before paint but only after hydration, which is too late on a slow connection.

   </details>

8. ⚡ Why did `Math.random()` in a Client Component's `useState` initializer produce a different ID in the HTML and the console?

   <details><summary>Answer</summary>

   The route was prerendered, so the initializer ran on the server and its result was frozen into the static HTML. During hydration the browser ran the initializer again and got a new value. The HTML and the client render disagreed, which is a hydration mismatch.

   </details>

9. Where would you put a provider that only `/dashboard` needs, and why?

   <details><summary>Answer</summary>

   In `app/dashboard/layout.tsx`, wrapping `{children}`. Providers should be as deep as possible, so the rest of the app doesn't pay for the provider's JS and Next can optimize more of the tree as static Server Components.

   </details>

10. A Client Component parent re-renders. Does its Server Component `children` re-render or refetch?

    <details><summary>Answer</summary>

    No. `children` is already-rendered output from the RSC Payload. It only changes when the server renders the route again (navigation, `router.refresh()`, revalidation).

    </details>
