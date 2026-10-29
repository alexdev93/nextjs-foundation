# Lesson 5 — `server-only`, `client-only` and Environment Poisoning

## The problem

JavaScript modules don't know where they run. This file looks harmless:

```ts
// lib/data.ts
export async function getData() {
  const res = await fetch('https://internal.example.com/data', {
    headers: { authorization: process.env.API_KEY! },
  })
  return res.json()
}
```

If a Client Component imports it, the bundler includes it in the client bundle. Two things go wrong:

1. **It silently breaks.** Only `NEXT_PUBLIC_*` variables reach the browser. Next replaces `process.env.API_KEY` with an empty string in the client build, so the request goes out with no key.
2. **It leaks.** The internal URL, the header names and your business logic are now readable in a JS file anyone can download. Change the import and you could leak a hard-coded value too.

The reverse also happens: a module that uses `window` at import time is imported by a Server Component and crashes the server render.

"Environment poisoning" means **a module ends up in the wrong environment's graph**. The fix is to make that mistake a **build error** instead of a runtime surprise.

## How it works

### `import 'server-only'`

Put it at the top of any module that must never reach the client:

```ts
// src/server/services/post-service.ts (this repo)
import 'server-only'
import { cacheLife, cacheTag } from 'next/cache'
```

If any file in the **client graph** imports this module, directly or through other files, the build fails:

> `'server-only' cannot be imported from a Client Component module. It should only be used from a Server Component.`

The error shows the **import chain**, so you can see which `'use client'` file pulled it in.

Next handles `server-only` and `client-only` **internally** to produce that error. The npm package contents aren't used. This repo installs `server-only` anyway (see `package.json`) so linters don't flag it as an undeclared dependency.

Every module in [src/server/](../../src/server/) in this repo starts with `import "server-only"`. Check this yourself with `grep -L "server-only" -r src/server --include=*.ts` (lists files **without** it, ignoring tests).

### `import 'client-only'`

The mirror image: put it in modules that touch `window`, `document` or `localStorage` at **module scope**, so importing them from a Server Component fails at build time instead of crashing during render.

### Modules used by both graphs are compiled twice

A neutral module (no directive, no `server-only`) imported by both graphs becomes **two separate copies**: one in the server bundle, one in the client bundle. Consequences:

- **Module-level state isn't shared** between server and browser. A `let cache = new Map()` in `src/lib/` is one map on the server (shared by **every request**) and another in each browser tab.
- **The server copy is shared across users.** Never keep per-user data in module scope on the server. Use `React.cache` (per request) or a store created per provider (Lesson 4).

### Environment variables

| Variable | Server | Client bundle |
| --- | --- | --- |
| `DATABASE_URL` | ✅ `process.env.DATABASE_URL` | ❌ replaced with an empty string |
| `NEXT_PUBLIC_SITE_URL` | ✅ | ✅ **inlined as a string at build time** |

- `NEXT_PUBLIC_` values are **baked into the JS** during `next build`. Changing them later on the server does nothing for the client until you rebuild.
- Read and validate server variables in **one** server-only module. This repo does it in [src/server/config/env.ts](../../src/server/config/env.ts): it parses `process.env` with Zod, throws on invalid values and exports a typed `env`. Because it imports `server-only`, no Client Component can ever import `env`.

### This repo's three layers of protection

1. **ESLint, at edit time** ([eslint.config.mjs](../../eslint.config.mjs)):
   - `architecture/no-server-in-client`: a file **starting with `'use client'`** may not import `server-only`, `@/server/*` or a relative `server/` path.
   - `import/no-restricted-paths`: **folder rules**. `src/client` can't import `src/server` or `src/app`. `src/server` can't import `src/client`. `src/shared` can only use shared, UI and lib code. `src/components` and `src/lib` stay app-agnostic.
   - `src/shared` also bans browser globals (`window`, `localStorage`...) and env-specific imports (`server-only`, `client-only`, `next/headers`, `next/navigation`), so shared code works in both graphs.
2. **`server-only`, at build time:** catches what ESLint can't see. ESLint checks **direct** imports in a file. The build checks the **whole chain**.
3. **DTOs and taint, at runtime:** stop server *data* leaking through props (Lesson 3).

Where ESLint stops and `server-only` takes over:

```txt
src/app/examples/x/widget.tsx      'use client'
└─ imports ./helpers.ts             no directive, in src/app (not checked by the folder rules)
   └─ imports @/server/services/post-service   ← ESLint: no error (helpers.ts isn't a 'use client' file)
                                               ← build: 💥 server-only error with the full chain
```

That's why you need both layers.

## Examples

### Example 1 — Trigger the ESLint rule

```tsx
// src/client/components/leak.tsx
'use client'
import { getLatestPosts } from '@/server/services/post-service'
```

Run `pnpm lint:boundaries`. You should see **two** errors: the custom rule (`A "use client" module must not import server code`) and the folder rule (`src/client must not import server code or route modules`).

### Example 2 — Slip past ESLint, get caught by the build

1. Create the chain from the diagram above (`widget.tsx` → `helpers.ts` → `post-service`).
2. `pnpm lint:boundaries` passes.
3. `pnpm build` (or loading the page in `pnpm dev`) fails with the `server-only` error. Read the import trace.
4. Delete the files.

### Example 3 — Prove module state is shared across requests

```ts
// src/app/examples/boundary/counter-module.ts
let hits = 0
export const nextHit = () => ++hits
```

Call `nextHit()` from a page that reads request data (for example, inside a component that calls `await connection()` inside `<Suspense>`). Refresh in two different browsers. The number keeps going up across both. That's one module instance for every user.

## Tips & tricks

- **Add `server-only` to every file in `src/server/`,** even ones that seem harmless. It documents intent and costs nothing.
- **Keep `src/shared/` truly neutral.** Types, Zod schemas, constants and pure functions only. It's the one folder both graphs are allowed to import.
- **`typeof window === 'undefined'` checks aren't a boundary.** They hide code at runtime but the code still ships. Use the folder structure and `server-only` instead.
- **Secrets in Server Function closures are encrypted, but still avoid them.** Next encrypts values captured by inline `'use server'` functions. Read secrets inside the function from `env` rather than capturing them (Phase 05).

## Pitfalls

| Mistake | Symptom |
| --- | --- |
| `process.env.SECRET` in a client file | Empty in the browser. Easy to miss because it works on the server render |
| Expecting a runtime `NEXT_PUBLIC_` change to reach the browser | Old value, because it was inlined at build |
| Module-level per-user cache on the server | Data from one user shows up for another |
| Relying only on ESLint | Indirect imports through a neutral file get past it |
| `window` at module scope in a shared file | `ReferenceError: window is not defined` during SSR |

## Where it's used

- **Data access layer:** every DB / API module starts with `import 'server-only'`.
- **Config:** one validated `env.ts` for the server, and `NEXT_PUBLIC_*` only for truly public values (analytics IDs, public URLs).
- **Monorepos:** a `@acme/db` package with `server-only` as its first import, so no app can bundle it into the client by accident.

## Source docs

- `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md` (section "Preventing environment poisoning")
- `node_modules/next/dist/docs/01-app/02-guides/data-security.md` (section "Preventing client-side execution of server-only code")
- `node_modules/next/dist/docs/01-app/02-guides/environment-variables.md`
- This repo: [eslint.config.mjs](../../eslint.config.mjs), [src/server/config/env.ts](../../src/server/config/env.ts)
