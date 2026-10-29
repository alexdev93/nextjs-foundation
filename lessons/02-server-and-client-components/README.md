# Phase 02 — Server & Client Components

> Written for **Next.js 16.4.3** and **React 19.3** with this project's config:
> `cacheComponents: true`, `partialPrefetching: true`, `typedRoutes: true`, `reactCompiler: true`.
> Behaviour that changes because of those flags is marked **⚡ Cache Components**.

## Goal of this phase

Place the `'use client'` boundary on purpose and know exactly what crosses it.

When you finish, you should be able to:

1. Look at any component and say where its code runs (server, browser, or both) and whether its code ships to the browser.
2. Explain what `'use client'` really marks: an **entry point into the client module graph**, not "this only runs in the browser".
3. Predict whether a prop can cross the boundary, and read the error when it can't.
4. Nest Server Components inside Client Components with `children` and slot props, without importing them.
5. Stop server code leaking into the client bundle using `server-only`, the ESLint rules in this repo, and a clean folder layout.
6. Diagnose a hydration mismatch and choose the right fix: move the code, use `suppressHydrationWarning`, add an inline script, or use `useSyncExternalStore`.

## Lessons (read in order)

| # | File | What you learn | Time |
| --- | --- | --- | --- |
| 1 | [01-the-rsc-mental-model.md](01-the-rsc-mental-model.md) | Two module graphs, the RSC Payload, where each component runs, async Server Components | 1.5 h |
| 2 | [02-the-use-client-boundary.md](02-the-use-client-boundary.md) | What `'use client'` does to the module graph, where to put it, client references, bundle size | 2 h |
| 3 | [03-serialization-rules.md](03-serialization-rules.md) | What can cross as a prop, what can't, Server Functions as props, the errors, data exposure | 1.5 h |
| 4 | [04-composition-patterns.md](04-composition-patterns.md) | `children` and slot props, owner vs parent, context providers, passing a Promise and `use()` | 2.5 h |
| 5 | [05-server-only-and-environment-poisoning.md](05-server-only-and-environment-poisoning.md) | `server-only` / `client-only`, `NEXT_PUBLIC_`, modules compiled twice, this repo's ESLint boundary rules | 1.5 h |
| 6 | [06-third-party-libraries.md](06-third-party-libraries.md) | Libraries without `'use client'`, wrapper files, compound components, `next/dynamic` with `ssr: false` | 1 h |
| 7 | [07-hydration-mismatches-and-flash.md](07-hydration-mismatches-and-flash.md) | Why mismatches happen, how React recovers, `suppressHydrationWarning`, inline scripts, the theme in this repo | 2 h |
| 8 | [08-exercises.md](08-exercises.md) | A hands-on lab in this repo plus checkpoint questions (answers hidden) | 6–8 h |
| — | [cheatsheet.md](cheatsheet.md) | One-page summary for quick review | — |

## How to study each lesson

Each lesson has the same sections as Phase 01:

- **The problem**: what was hard before this feature existed, or what goes wrong without it.
- **How it works**: the mechanism, not just the API.
- **Examples**: code you can type yourself. Nothing in this folder has been added to `src/`. You write it.
- **Tips & tricks**: things that are easy to miss.
- **Pitfalls**: real mistakes and the errors they produce.
- **Where it's used**: real-world situations where you would pick this tool.
- **Source docs**: the exact files in `node_modules/next/dist/docs/` to read for more detail.

Recommended loop:

1. Read the lesson once without coding.
2. Type the examples in a scratch route such as `src/app/examples/boundary/...`.
3. Break something on purpose and read the error. **This phase is mostly about errors.** Each error message tells you which rule you broke.
4. Write 5–10 lines in `notes.md` in this folder, in your own words.
5. Do the matching exercise in [08-exercises.md](08-exercises.md).

## Three things to remember the whole time

1. **"Client Component" does not mean "browser only".** On a full page load, a Client Component renders on the server to HTML first, then again in the browser to hydrate. Only Server Components are server-only.
2. **Code crosses through imports, data crosses through props.** Every boundary question comes back to one of these two rules.
3. **You already saw this in Phase 01.** The `LifecycleLogger` ID mismatch in `src/app/lessons/` was a hydration problem. `Math.random()` ran once during the server prerender and again in the browser, so the HTML and the client disagreed. Lesson 7 explains it properly.
