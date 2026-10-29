# Next.js Deep-Dive Roadmap

> **Target version:** Next.js **16.4.3** · React **19.3** · TypeScript 6 · Turbopack · Tailwind v4
> **Project flags in use** ([next.config.ts](../next.config.ts)): `cacheComponents`, `partialPrefetching`, `reactCompiler`, `typedRoutes`
> **Level:** you already know React/TS/JS/CSS well. This roadmap skips the basics and focuses on how Next.js works and how to use it at an advanced level.

---

## How to use this roadmap

1. Work through the phases **in order**. Each one builds on the one before it.
2. Each phase has its own folder in `lessons/`. The lesson files for a phase go into its folder when you start that phase.
3. Each phase has four parts:
   - **Goal**: what you should understand at the end.
   - **Topics**: the concepts to learn.
   - **Read**: the official docs shipped with your installed version, in `node_modules/next/dist/docs/`. Prefer these over blog posts, because Next 16 changed many APIs.
   - **Practice**: hands-on tasks in *this* repo.
   - **Checkpoint**: questions to answer without notes before you move on.
4. Keep a `notes.md` in each phase folder. Explaining something in your own words is the fastest way to find gaps.

> ⚠️ **Watch out for outdated content.** Most tutorials online cover Next 13–15. In Next 16: `middleware` is now `proxy`, `params`/`cookies()`/`headers()` are async, caching works differently (`use cache` instead of `fetch` cache defaults), `next lint` is gone, Turbopack is the default, and `experimental.dynamicIO` became `cacheComponents`.

Docs path shorthand used below: `docs/` = `node_modules/next/dist/docs/01-app/`

---

## Phase map

| #  | Phase | Main idea | Est. time |
|----|-------|-----------|-----------|
| 00 | Mental model | What Next.js actually is: a compiler, a server, and a router | 2–3 days |
| 01 | Routing & navigation | The file system is the router; how soft navigation works | 4–5 days |
| 02 | Server & Client Components | RSC, the `'use client'` boundary, serialization | 4–5 days |
| 03 | Data fetching & streaming | Async components, Suspense, async request APIs | 3–4 days |
| 04 | Caching & prerendering | Cache Components, static shell, PPR, `use cache` | 6–8 days ⭐ |
| 05 | Mutations & Server Actions | Forms, actions, revalidation, optimistic UI | 4–5 days |
| 06 | Route Handlers & Proxy | HTTP endpoints, `proxy.ts`, `after()`, BFF | 2–3 days |
| 07 | UI conventions, metadata, assets | error/not-found, metadata, images, fonts, CSS | 3 days |
| 08 | Auth & security | Data Access Layer, CSP, taint, env vars | 4 days |
| 09 | Performance | Bundles, prefetching, static shell, Web Vitals | 4 days |
| 10 | Toolchain & dependencies | Turbopack, SWC, React Compiler, every package in this repo | 3–4 days |
| 11 | Internals (reading the source) | Flight protocol, app-render, client router | 5–7 days ⭐ |
| 12 | Production & deployment | Build output, self-hosting, cache handlers, adapters | 4 days |
| 13 | Capstone | Build a real app using everything above | 2+ weeks |

---

## Phase 00: Mental model — `lessons/00-mental-model/`

**Goal:** Be able to sketch on paper what happens from `next build` until a browser shows a page, and what happens on the next click.

**Topics**
- Next.js has three jobs: a **compiler** (Turbopack/SWC), a **server** (Node.js HTTP server that renders React), and a **client runtime** (router + React hydration).
- **Build time vs request time vs client time**. Every piece of code you write runs in one or more of these.
- The **three module graphs**: server (RSC), SSR (client components rendered to HTML on the server), and browser.
- What the server sends back: **HTML** on the first load, and the **RSC payload** (Flight format) on later navigations.
- **Hydration**: how React attaches to server HTML.
- The App Router vs the Pages Router. This roadmap covers only the App Router. Know that the Pages Router still exists, and why.
- The "rendering philosophy" behind Next 16: static first, with dynamic parts as holes.

**Read**
- `docs/01-getting-started/02-project-structure.md`
- `docs/02-guides/rendering-philosophy.md`
- `docs/04-glossary.md` (skim it now, come back to it often)
- `docs/02-guides/upgrading/version-16.md` (what changed and why)
- [docs/architecture.md](../docs/architecture.md) in this repo

**Practice**
- Run `pnpm build` and read the route table it prints. Learn what each symbol means (static, partial prerender, dynamic).
- Open `.next/` after the build and look at its structure: `server/app/`, `static/chunks/`, the manifests.
- In DevTools → Network, load `/` and then click a link to `/examples/server`. Compare the first document request with the navigation request (look for the `RSC` header and the `text/x-component` response).

**Checkpoint**
- Why can't a Server Component use `useState`? Explain it in terms of *where* the code runs, not "because the rule says so".
- What is in the RSC payload that isn't in the HTML, and the other way round?

---

## Phase 01: Routing & navigation — `lessons/01-routing-and-navigation/`

**Goal:** Know every routing file convention and how client-side navigation works internally.

**Topics**
- File conventions: `page`, `layout`, `template`, `loading`, `error`, `not-found`, `forbidden`, `unauthorized`, `default`, `route`.
- The **component hierarchy** Next builds from these files: layout → template → error boundary → suspense boundary → not-found boundary → page.
- Dynamic segments: `[id]`, `[...slug]`, `[[...slug]]`; `generateStaticParams`.
- **Route groups** `(group)`, **private folders** `_folder`, multiple root layouts.
- **Parallel routes** `@slot` and **intercepting routes** `(.)`, `(..)`. Why `default.js` is now required.
- `next/link`, `useRouter`, `usePathname`, `useSearchParams`, `useParams`, `useSelectedLayoutSegment(s)`, `useLinkStatus`.
- **Soft vs hard navigation**, layout preservation, scroll behaviour.
- **Prefetching**: automatic, `prefetch` prop, **Partial Prefetching** (enabled in this repo), instant navigation.
- `redirect`, `permanentRedirect`, `notFound`, `forbidden`, `unauthorized`.
- **Typed routes** (`typedRoutes: true`) and `next typegen`, plus the global `PageProps`/`LayoutProps` helpers.
- `next/root-params`.

**Read**
- `docs/01-getting-started/03-layouts-and-pages.md`, `04-linking-and-navigating.md`
- `docs/03-api-reference/03-file-conventions/` (all files, especially `parallel-routes.md`, `intercepting-routes.md`, `dynamic-routes.md`, `route-groups.md`, `template.md`, `default.md`)
- `docs/02-guides/prefetching.md`, `optimizing-prefetching.md`, `adopting-partial-prefetching.md`, `instant-navigation.md`, `preserving-ui-state.md`
- `docs/03-api-reference/04-functions/use-router.md`, `use-link-status.md`, `next-root-params.md`

**Practice**
- Add `src/app/examples/routing/` and build:
  - a `[slug]` route with `generateStaticParams`
  - a `(marketing)` route group with its own layout
  - a modal using **parallel + intercepting routes** (`@modal/(.)photo/[id]`) that turns into a full page on refresh
  - a `template.tsx` next to a `layout.tsx`, with a `console.log`/state inside each, to see which one remounts
- Break `typedRoutes` on purpose by linking to a route that doesn't exist, and read the type error.

**Checkpoint**
- Why does a layout keep its state on navigation while a template does not?
- What does a parallel route slot render on a hard refresh when it has no matching segment, and why is `default.js` needed?

---

## Phase 02: Server & Client Components — `lessons/02-server-and-client-components/`

**Goal:** Place the `'use client'` boundary on purpose and know exactly what crosses it.

**Topics**
- React Server Components: what they are, and why they are async and never ship to the browser.
- `'use client'` marks an **entry point into the client module graph**. It is not a "this runs only on the client" marker. Client Components still render on the server for SSR.
- **Serialization rules**: what props can cross the boundary (primitives, plain objects, Dates, Maps, Promises, JSX, Server Actions) and what can't (functions, class instances).
- **Composition patterns**: passing Server Components as `children` to Client Components; the "donut" pattern.
- Context providers: why they must be Client Components and how to keep them deep in the tree (see [app-providers.tsx](../src/client/providers/app-providers.tsx)).
- `server-only` / `client-only` packages and how they cause build-time errors.
- Third-party libraries without `'use client'` and how to wrap them.
- **Hydration mismatches**: causes and fixes, `suppressHydrationWarning`, preventing a flash before hydration (theme example: [theme-provider.tsx](../src/client/providers/theme-provider.tsx)).
- Passing a **Promise** from server to client and unwrapping it with `use()`.

**Read**
- `docs/01-getting-started/05-server-and-client-components.md`
- `docs/02-guides/server-and-client-boundary.md`
- `docs/02-guides/third-party-libraries.md`, `preventing-flash-before-hydration.md`
- `docs/03-api-reference/01-directives/use-client.md`, `use-server.md`
- React docs: "Server Components" and "Directives" (react.dev)

**Practice**
- Read [src/app/examples/server/page.tsx](../src/app/examples/server/page.tsx) and [src/app/examples/client/page.tsx](../src/app/examples/client/page.tsx). Draw the boundary tree for each one.
- Import something from `src/server/` inside a Client Component and read the build error. Then explain how the ESLint boundary rules in [eslint.config.mjs](../eslint.config.mjs) would catch it before the build does.
- Pass a non-serializable prop (a class instance, a function) across the boundary and read the error.
- Run `pnpm build` and compare the client JS size before and after moving a `'use client'` up or down the tree.

**Checkpoint**
- Does a Client Component render on the server? When is it skipped?
- Why can you pass `<ServerThing />` as `children` to a Client Component but not import it there?

---

## Phase 03: Data fetching & streaming — `lessons/03-data-fetching-and-streaming/`

**Goal:** Fetch data on the server efficiently and stream UI progressively.

**Topics**
- Async Server Components; fetching from a DB/ORM directly versus with `fetch`.
- **Async request APIs** (breaking in v16): `await params`, `await searchParams`, `await cookies()`, `await headers()`, `await draftMode()`.
- Sequential vs parallel fetching; avoiding waterfalls with `Promise.all` and the preload pattern.
- `React.cache()` for request-level **deduplication**, and how it differs from `use cache`.
- **Streaming**: `loading.tsx` versus manual `<Suspense>`, where to put boundaries, how chunked HTML streaming works.
- Passing promises to the client with `use()`.
- Client-side fetching when it is still the right choice (SWR / TanStack Query).
- The **service layer** pattern used in this repo: `src/server/services` → `src/server/integrations`.

**Read**
- `docs/01-getting-started/06-fetching-data.md`
- `docs/02-guides/streaming.md`
- `docs/02-guides/client-side-data-fetching/`
- `docs/03-api-reference/04-functions/fetch.md`, `cookies.md`, `headers.md`, `connection.md`
- `docs/03-api-reference/03-file-conventions/loading.md`

**Practice**
- Study [post-service.ts](../src/server/services/post-service.ts) and [demo-api.ts](../src/server/integrations/demo-api.ts).
- Build a page with three slow fetches (add artificial delays). Implement it three ways: sequential, `Promise.all`, and separate `<Suspense>` boundaries. Measure TTFB and time-to-content for each.
- Watch the streamed HTML arrive: `curl -N http://localhost:3000/your-page`.

**Checkpoint**
- Where does `React.cache` store data, and for how long?
- Why does awaiting `cookies()` high in a layout affect the whole subtree?

---

## Phase 04: Caching & prerendering ⭐ — `lessons/04-caching-and-prerendering/`

**Goal:** Master the Next 16 rendering and caching model. This is the most important and most changed part of Next.js.

**Topics**
- **Cache Components** (`cacheComponents: true`): every component is either *prerenderable*, *cached*, or *dynamic* (must sit inside `<Suspense>`).
- **Prerendering** and the **static shell**; **Partial Prerendering (PPR)**: a static shell plus streamed dynamic holes, in one response.
- What makes something dynamic: request APIs, `connection()`, uncached I/O. The "uncached data outside Suspense" build error and how to fix it.
- **`'use cache'`** at file, component, and function level. How cache keys are built (arguments plus closed-over values). Serialization constraints.
- **`cacheLife`** profiles (built-in and custom), `stale` / `revalidate` / `expire`.
- **`cacheTag`** plus invalidation APIs:
  - `revalidateTag(tag, profile)`: stale-while-revalidate
  - `updateTag(tag)`: read-your-own-writes inside Server Actions
  - `revalidatePath`
  - `refresh()`: refreshes the client router without invalidating data
- **`'use cache: private'`** (per-user, can read cookies) vs **`'use cache: remote'`** (shared remote store).
- The **client-side router cache**, `staleTimes`, and how prefetch interacts with cache lifetimes.
- ISR with Cache Components; `generateStaticParams` plus caching.
- **The previous model** (`fetch` cache options, `unstable_cache`, `export const revalidate`/`dynamic`). Learn this only so you can read older codebases.

**Read**
- `docs/01-getting-started/08-caching.md`, `09-revalidating.md`
- `docs/02-guides/how-revalidation-works.md`, `keeping-pages-static.md`, `optimizing-the-static-shell.md`, `incremental-static-regeneration-cache-components.md`, `migrating-to-cache-components.md`, `caching-without-cache-components.md`
- `docs/03-api-reference/01-directives/use-cache.md`, `use-cache-private.md`, `use-cache-remote.md`
- `docs/03-api-reference/04-functions/cacheLife.md`, `cacheTag.md`, `revalidateTag.md`, `updateTag.md`, `refresh.md`, `revalidatePath.md`, `connection.md`
- `docs/03-api-reference/05-config/01-next-config-js/cacheComponents.md`, `cacheLife.md`, `staleTimes.md`, `partialPrefetching.md`

**Practice**
- Build a `products` page that has a cached product list (`use cache` + `cacheLife('hours')` + `cacheTag('products')`), a dynamic "your cart" section reading cookies inside `<Suspense>`, and a Server Action that calls `updateTag('products')`.
- Run `pnpm build && pnpm start` and confirm in the build output which parts are in the static shell.
- Cause each common build error on purpose and fix it. Write down each error message and its fix in `notes.md`.
- Read the comment in [next.config.ts](../next.config.ts) about the CSP nonce. Explain *why* nonces force dynamic rendering.

**Checkpoint**
- Explain the difference between `revalidateTag` and `updateTag`, and when each is correct.
- A component reads `cookies()` and is not inside `<Suspense>`. What happens at build time, and why?
- What exactly becomes part of a `use cache` key?

---

## Phase 05: Mutations & Server Actions — `lessons/05-mutations-and-server-actions/`

**Goal:** Build robust, secure mutations with progressive enhancement.

**Topics**
- `'use server'`: how a function becomes an **RPC endpoint** (an action ID, a POST request, the serialized args).
- Server Actions in forms (`<form action>`), in event handlers, and in `useTransition`.
- `useActionState`, `useFormStatus`, `useOptimistic`.
- **Progressive enhancement**: forms that work before JS loads.
- `next/form` for search/GET forms.
- Validation with **Zod** on the server, and the `Result` pattern ([result.ts](../src/shared/types/result.ts)).
- What happens after an action: revalidation plus a single round-trip UI update, and `redirect` inside actions.
- **Security**: every action is a public endpoint. Check auth inside the action, validate inputs, and handle closures and encrypted bound args. Configure `serverActions.allowedOrigins` and `bodySizeLimit`.

**Read**
- `docs/01-getting-started/07-mutating-data.md`
- `docs/02-guides/server-actions.md`, `forms.md`, `data-security.md`
- `docs/03-api-reference/02-components/form.md`
- `docs/03-api-reference/05-config/01-next-config-js/serverActions.md`

**Practice**
- Trace [contact-form.tsx](../src/client/components/contact-form.tsx) → [actions.ts](../src/app/examples/client/actions.ts) → [contact-service.ts](../src/server/services/contact-service.ts) → [contact.ts schema](../src/shared/schemas/contact.ts).
- Disable JavaScript in the browser and submit the form. Does it still work? Make it work.
- Look at the POST request in the Network tab: find the `Next-Action` header and the response format.
- Add `useOptimistic` to a todo list.

**Checkpoint**
- Why is "the button is hidden for non-admins" not a security control for a Server Action?

---

## Phase 06: Route Handlers & Proxy — `lessons/06-route-handlers-and-proxy/`

**Goal:** Know when to use HTTP endpoints and request interception, and when not to.

**Topics**
- `route.ts`: methods, `NextRequest`/`NextResponse`, streaming responses, CORS.
- Route Handlers **under Cache Components** (`GET` follows the prerender model).
- Route Handlers vs Server Actions: when to use which.
- **`proxy.ts`** (the renamed `middleware.ts`): matchers, rewrites, redirects, headers, cookies, and its limits (keep it fast; no heavy auth logic).
- `after()`: running work after the response is sent (logging, analytics).
- The **Backend-for-Frontend** pattern.
- `redirects`/`rewrites`/`headers` in `next.config` vs in `proxy`.

**Read**
- `docs/01-getting-started/15-route-handlers.md`, `16-proxy.md`
- `docs/03-api-reference/03-file-conventions/route.md`, `proxy.md`
- `docs/03-api-reference/04-functions/after.md`, `next-request.md`, `next-response.md`
- `docs/02-guides/backend-for-frontend.md`, `redirecting.md`

**Practice**
- Study [src/app/api/health/route.ts](../src/app/api/health/route.ts) and [health-client.ts](../src/client/services/health-client.ts).
- Add a `proxy.ts` that sets an A/B-test cookie and rewrites `/pricing` to `/pricing/a` or `/pricing/b`.
- Use `after()` to log request timing without slowing down the response.

---

## Phase 07: UI conventions, metadata & assets — `lessons/07-ui-conventions-metadata-assets/`

**Goal:** Handle errors, SEO, and assets properly.

**Topics**
- `error.tsx` (must be a Client Component, why), `global-error.tsx`, `catchError`, `unstable_rethrow`.
- `not-found`, `forbidden`, `unauthorized` (`authInterrupts`).
- **Metadata API**: static `metadata`, `generateMetadata`, `generateViewport`, file-based metadata (`icon`, `opengraph-image`, `sitemap`, `robots`), `ImageResponse`, JSON-LD.
- `next/image`: loaders, `sizes`, the v16 breaking defaults (`qualities`, `minimumCacheTTL`, local IP restriction).
- `next/font`: self-hosting, no layout shift, variable fonts.
- `next/script` strategies.
- CSS: Tailwind v4 via PostCSS, CSS Modules, global CSS ordering, `cssChunking`, `inlineCss`.

**Read**
- `docs/01-getting-started/10-error-handling.md`, `11-css.md`, `12-images.md`, `13-fonts.md`, `14-metadata-and-og-images.md`
- `docs/03-api-reference/03-file-conventions/error.md`, `01-metadata/`
- `docs/03-api-reference/04-functions/catchError.md`, `generate-metadata.md`, `image-response.md`
- `docs/02-guides/json-ld.md`, `scripts.md`

**Practice**
- Review [src/app/error.tsx](../src/app/error.tsx) and [layout.tsx](../src/app/layout.tsx). Add `global-error.tsx`, `not-found.tsx`, a dynamic `opengraph-image.tsx`, `sitemap.ts`, and `robots.ts`.

---

## Phase 08: Auth & security — `lessons/08-auth-and-security/`

**Goal:** Design secure server/client data flows.

**Topics**
- Authentication patterns: sessions vs JWT, where to check (proxy for an optimistic check, the **Data Access Layer** for the real check).
- Auth **with Cache Components**: per-user data, `use cache: private`, keeping the shell static.
- **Data Transfer Objects**: never pass whole DB rows to Client Components.
- React **taint** APIs (`experimental_taintObjectReference`, `taintUniqueValue`).
- Environment variables: `NEXT_PUBLIC_` inlining at build time, runtime env, validating with Zod ([env.ts](../src/server/config/env.ts)).
- **CSP**: static vs nonce-based, and the trade-off with prerendering (already configured in this repo).
- Security headers, CSRF and Server Actions, `poweredByHeader`.

**Read**
- `docs/02-guides/authentication.md`, `authentication-with-cache-components.md`, `data-security.md`, `content-security-policy.md`, `environment-variables.md`
- `docs/03-api-reference/05-config/01-next-config-js/taint.md`

**Practice**
- Build a minimal cookie-session login with a `verifySession()` DAL function wrapped in `React.cache`. Protect a page and a Server Action with it.
- Try to leak a secret into the client bundle, then confirm `server-only` and taint stop it.

---

## Phase 09: Performance — `lessons/09-performance/`

**Goal:** Measure first, then optimize what users actually feel.

**Topics**
- Core Web Vitals (LCP, INP, CLS) and `useReportWebVitals`.
- Bundle analysis, `optimizePackageImports` (e.g. `lucide-react`), barrel-file costs.
- `next/dynamic` and lazy loading; `ssr: false` and when it is allowed.
- Optimizing the static shell; moving Suspense boundaries.
- Prefetch tuning; instant navigation.
- **React Compiler**: what it memoizes, and when you still need manual memoization.
- `<Activity>` / preserved UI state, **View Transitions**.
- Memory usage in dev and build.

**Read**
- `docs/02-guides/lazy-loading.md`, `package-bundling.md`, `optimizing-the-static-shell.md`, `analytics.md`, `view-transitions.md`, `memory-usage.md`, `production-checklist.md`
- `docs/03-api-reference/05-config/01-next-config-js/reactCompiler.md`, `optimizePackageImports.md`

**Practice**
- Run Lighthouse on `pnpm start` (never on dev). Record a baseline, fix one issue, and measure again.
- Compare the Zustand counter in [state-demo/](../src/client/components/state-demo/) with the React Compiler on and off, using React DevTools "highlight updates".

---

## Phase 10: Toolchain & dependencies — `lessons/10-toolchain-and-dependencies/`

**Goal:** Know what every tool and package in this repo does and why it is here.

**Topics: the Next toolchain**
- **Turbopack** (Rust bundler, default in v16): incremental computation, filesystem cache, `turbopack` config, loaders.
- **SWC**: TS/JSX transforms, and how directives (`'use client'`, `'use server'`, `'use cache'`) are compiled.
- **React Compiler** via `babel-plugin-react-compiler` (and the Rust version flag).
- `next typegen` and how typed routes are generated.
- Fast Refresh: how HMR keeps state.
- The vendored React: Next ships its own React canary build in `next/dist/compiled/`. Know why, and what `react-server-dom-turbopack` is.

**Topics: this repo's dependencies, one by one**
| Package | What to learn |
|---|---|
| `next`, `react`, `react-dom` | covered by the whole roadmap |
| `server-only` | how the `react-server` export condition causes the error |
| `zod` v4 | schemas shared between server and client ([src/shared/schemas/](../src/shared/schemas/)) |
| `zustand` v5 | per-request stores with context, why a global store is dangerous with SSR ([create-store-context.tsx](../src/client/stores/create-store-context.tsx)) |
| `next-themes` | avoiding the flash of the wrong theme before hydration |
| `@radix-ui/*`, `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react` | the shadcn/ui pattern ([components.json](../components.json), [src/components/ui/](../src/components/ui/)) |
| `tailwindcss` v4 + `@tailwindcss/postcss` | CSS-first config, Lightning CSS |
| `@biomejs/biome` + `eslint` + `eslint-plugin-import` | why both are used; boundary rules |
| `typescript` 6, `typescript-eslint` | strictness, `next-env.d.ts` |
| `vitest` | unit-testing services and stores; what you *can't* unit test (async Server Components) |

**Read**
- `node_modules/next/dist/docs/03-architecture/` (all of it)
- `docs/03-api-reference/08-turbopack.md`
- `docs/02-guides/testing/`, `local-development.md`, `debugging.md`
- [docs/state-management.md](../docs/state-management.md) in this repo

**Practice**
- Read `pnpm why react` and explain what you see. Then find Next's vendored React in `node_modules/next/dist/compiled/`.
- Add Playwright and write one E2E test for the contact form.

---

## Phase 11: Internals — reading the source ⭐ — `lessons/11-internals-source-reading/`

**Goal:** Understand how Next works by reading `node_modules/next/dist`. This is what turns "advanced user" into "expert".

**Topics and where to look**
- **The server entry**: `next start` → `dist/server/next-server.js` → `base-server.js` (request handling, route matching).
- **App rendering**: `dist/server/app-render/app-render.js`: how the tree is built, Flight rendering, HTML rendering, PPR's prerender and resume.
- **The Flight (RSC) protocol**: read a raw RSC payload line by line (`$L`, `$@`, `I[...]` module references). Use `curl -H "RSC: 1"` to fetch one.
- **Client references & manifests**: how `'use client'` modules become IDs in `client-reference-manifest`, and how the browser loads the right chunks.
- **Server Action plumbing**: the action ID manifest, encryption of bound arguments.
- **The client router**: `dist/client/components/router-reducer/`, the segment cache, how navigation fetches and merges RSC payloads.
- **Cache Components internals**: how `use cache` is compiled, cache handlers, how prerendering detects dynamic access ("postponing").
- **Instrumentation & OpenTelemetry**: `instrumentation.ts`, the spans Next emits.

**Read**
- `docs/02-guides/instrumentation.md`, `open-telemetry.md`, `debugging.md`
- `docs/03-api-reference/05-config/01-next-config-js/cacheHandlers.md`
- React source: `react-server-dom-*` and `react-dom/server`
- Talks and RFCs: the React Server Components RFC (reactjs/rfcs), Dan Abramov's "RSC from scratch" (GitHub discussion)

**Practice**
- Run `NODE_OPTIONS=--inspect pnpm start`, attach Chrome DevTools, and set a breakpoint in `app-render.js`. Step through one request.
- Write `notes.md` with a sequence diagram: browser → proxy → router → app-render → Flight → HTML stream → hydration.
- Build a toy RSC renderer in ~200 lines (no Next) using `react-server-dom-webpack`, to see the core idea with nothing else around it.

---

## Phase 12: Production & deployment — `lessons/12-production-and-deployment/`

**Goal:** Run Next.js anywhere, not only on Vercel.

**Topics**
- Build output: `output: 'standalone'`, `output: 'export'` (static export and its limits).
- **Self-hosting**: Node server, Docker, reverse proxy, image optimization costs.
- **Custom cache handlers** (Redis) for multi-instance deployments; `cacheHandlers` for `use cache`.
- **Version skew**: `deploymentId`, `generateBuildId`.
- CDN caching, `Cache-Control` headers Next emits, the PPR platform guide.
- **Build Adapters API**: how platforms (Vercel, Cloudflare/OpenNext, Netlify) integrate.
- Multi-zones, multi-tenant, i18n routing.
- CI build caching; the production checklist.

**Read**
- `docs/01-getting-started/17-deploying.md`
- `docs/02-guides/self-hosting.md`, `deploying-to-platforms.md`, `cdn-caching.md`, `ppr-platform-guide.md`, `static-exports.md`, `multi-zones.md`, `multi-tenant.md`, `internationalization.md`, `ci-build-caching.md`, `production-checklist.md`
- `docs/03-api-reference/07-adapters/`

**Practice**
- Create a Dockerfile with `output: 'standalone'`, run two containers behind nginx, and show the cache-consistency problem. Then fix it with a shared cache handler.

---

## Phase 13: Capstone — `lessons/13-capstone/`

Build one real application that forces you to use everything. Suggested project: **a multi-tenant blog/CMS** with:

- [ ] Auth with a DAL and protected Server Actions
- [ ] Public post pages: static shell plus cached content (`use cache` + tags), with comments streamed as a dynamic hole
- [ ] An admin dashboard using parallel routes, plus an intercepted "edit post" modal
- [ ] Optimistic comments with `useOptimistic`, and `updateTag` on publish
- [ ] Dynamic OG images, sitemap, and JSON-LD
- [ ] `proxy.ts` for tenant resolution by subdomain
- [ ] A Route Handler webhook that calls `revalidateTag`
- [ ] Unit tests (Vitest) and E2E tests (Playwright)
- [ ] Lighthouse ≥ 95, documented bundle analysis
- [ ] Docker standalone deploy with a Redis cache handler
- [ ] A write-up: an architecture diagram and the reasoning behind every caching decision

---

## Suggested weekly rhythm

- **Mon–Tue:** read the docs for the phase and write `notes.md` in your own words.
- **Wed–Thu:** do the practice tasks; break things on purpose and record the error messages.
- **Fri:** answer the checkpoint questions without notes, and explain one concept out loud or in writing as if teaching it.
- **Weekend (optional):** read the related source in `node_modules/next/dist`.

## External references (check they match v16 before trusting them)

- Official docs: https://nextjs.org/docs (the same content as `node_modules/next/dist/docs`)
- Next.js blog, release posts for 15, 16, and 16.x
- React docs: https://react.dev/reference/rsc/server-components
- Next.js source: https://github.com/vercel/next.js (`packages/next/src`)
- React source: https://github.com/facebook/react (`packages/react-server`, `packages/react-server-dom-*`)
