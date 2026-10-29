# Phase 01 — Routing & Navigation

> Written for **Next.js 16.4.3** with this project's config:
> `cacheComponents: true`, `partialPrefetching: true`, `typedRoutes: true`, `reactCompiler: true`.
> Several behaviours in this phase are **different** when those flags are on. Each lesson marks these with **⚡ Cache Components**.

## Goal of this phase

When you finish, you should be able to:

1. Look at any `app/` folder tree and predict the URL, the React tree Next builds from it, and what remounts on each navigation.
2. Pick the right tool for each routing problem: layout or template, route group or private folder, parallel slot, intercepted route, `redirect` or `notFound`.
3. Explain what happens between clicking a `<Link>` and seeing the new page: prefetch, App Shell, RSC payload, client cache, `<Activity>`.
4. Make navigations feel instant and know which knob to turn when they don't.

## Lessons (read in order)

| # | File | What you learn | Time |
| --- | --- | --- | --- |
| 1 | [01-file-system-routing.md](01-file-system-routing.md) | Folders → segments, special files, the component hierarchy, colocation, private folders, route groups | 1.5 h |
| 2 | [02-layouts-and-templates.md](02-layouts-and-templates.md) | Layout persistence, root layouts, templates and remount keys, `loading.js` placement | 2 h |
| 3 | [03-dynamic-routes-and-params.md](03-dynamic-routes-and-params.md) | `[slug]`, catch-all, `params` as a Promise, `generateStaticParams`, `searchParams`, `next/root-params` | 2.5 h |
| 4 | [04-parallel-and-intercepting-routes.md](04-parallel-and-intercepting-routes.md) | `@slot`, `default.js`, tabs, conditional slots, URL-driven modals | 2.5 h |
| 5 | [05-link-router-and-hooks.md](05-link-router-and-hooks.md) | `<Link>` props, `useRouter`, `usePathname`/`useSearchParams`/`useParams`/segment hooks, typed routes, URL as state | 2.5 h |
| 6 | [06-how-client-navigation-works.md](06-how-client-navigation-works.md) | Soft and hard navigation, RSC payload, client cache, `<Activity>` state preservation, `bfcacheId` | 2 h |
| 7 | [07-prefetching-deep-dive.md](07-prefetching-deep-dive.md) | Prefetch scheduling, Partial Prefetching, App Shell, `prefetch={true}`, segment `prefetch`/`instant`, `prefetch()`/`navigation()` | 3 h |
| 8 | [08-redirects-not-found-and-auth-interrupts.md](08-redirects-not-found-and-auth-interrupts.md) | `redirect`, `permanentRedirect`, `notFound`, `forbidden`, `unauthorized`, status codes while streaming | 1.5 h |
| 9 | [09-exercises.md](09-exercises.md) | A hands-on lab in this repo plus checkpoint questions (answers hidden) | 6–10 h |
| — | [cheatsheet.md](cheatsheet.md) | One-page summary for quick review | — |

## How to study each lesson

Each lesson has the same sections:

- **The problem**: what was hard before this feature existed, or what goes wrong without it.
- **How it works**: the mechanism, not just the API.
- **Examples**: code you can type yourself. Nothing in this folder has been added to `src/`. You write it.
- **Tips & tricks**: things that are easy to miss.
- **Pitfalls**: real mistakes and the errors they produce.
- **Where it's used**: real-world situations where you would pick this tool.
- **Source docs**: the exact files in `node_modules/next/dist/docs/` to read for more detail.

Recommended loop:

1. Read the lesson once without coding.
2. Type the examples in a scratch route such as `src/app/examples/routing/...`.
3. Break something on purpose and read the error.
4. Write 5–10 lines in `notes.md` in this folder, in your own words.
5. Do the matching exercise in [09-exercises.md](09-exercises.md).

## Two things to remember the whole time

1. **Prefetching only runs in production.** To see real navigation behaviour, use `pnpm build && pnpm start`, not `pnpm dev`.
2. **This project has Cache Components on.** Anything that reads request data (`params` without `generateStaticParams`, `searchParams`, `cookies()`, `headers()`, `usePathname` on an unknown dynamic route, and so on) must sit inside a `<Suspense>` boundary, or the build fails. You will see this rule in almost every lesson.
