# Server & Client Components Cheat Sheet (Next 16.4, React 19.3, Cache Components)

## Where it runs

| | Server | Browser | Code ships |
| --- | --- | --- | --- |
| Server Component (default) | ✅ | ❌ | ❌ |
| Client Component (`'use client'` entry) | ✅ full load / prerender | ✅ | ✅ |
| Client Component, `<Link>` navigation | ❌ (RSC Payload only) | ✅ | ✅ |
| `next/dynamic(..., { ssr: false })` | ❌ | ✅ | ✅ |

## The two rules

- **Code crosses through imports.** Everything a `'use client'` file imports joins the client graph.
- **Data crosses through props.** It must be serializable.

## Directives

| | Meaning |
| --- | --- |
| *(none)* | Neutral module. Server Component when imported by the server graph |
| `'use client'` | **Entry point** into the client graph. First line of the file |
| `'use server'` | **Server Functions** the client can call. A public POST endpoint |
| `import 'server-only'` | Build error if it reaches the client graph (checks the whole chain) |
| `import 'client-only'` | Build error if it reaches the server graph |

## Serializable props

✅ primitives (incl. `bigint`, `undefined`), plain objects, arrays, `Date`, `Map`, `Set`, typed arrays, `FormData`, `Symbol.for()`, **Promises**, **JSX** (incl. rendered Server Components), **Server Functions**

❌ ordinary functions / event handlers / render props, class instances (`URL`, ORM rows, `Decimal`, Zod schemas), null-prototype objects, symbol keys, local symbols

Everything you pass is **visible in the page source**, so pass DTOs.

## Client references (server importing a `'use client'` file)

| Export | On the server |
| --- | --- |
| Component | ✅ render it |
| `Comp.Part` static property | ❌ `undefined` → "Element type is invalid" |
| Function / constant | ❌ reference, not the value. Calling it throws "Attempted to call ... from the server" |

## Composition

```tsx
<ClientShell sidebar={<ServerNav />}>   {/* any ReactNode prop is a slot */}
  <ServerContent />                     {/* owner = server → renders on server */}
</ClientShell>
```

- Client re-render **doesn't** re-render server children.
- To change server content from the client, change the **URL** or `router.refresh()`.
- Providers: a `'use client'` component wrapping `{children}`, rendered **as deep as possible**. React 19: `<Ctx value={v}>`.
- Stores: create **per provider** (`useState(() => create())`), never at module scope.
- Request-scoped server data: `React.cache(fn)`, not context.

## Promise → client

```tsx
// server
const p = getPosts()                      // no await
<Suspense fallback={...}><Posts posts={p} /></Suspense>
// client
const posts = use(p)
```

⚡ Uncached or request-time promise without `<Suspense>` above it → build error.

## Hydration mismatch fixes (best first)

1. Make it deterministic: server prop, fixed locale + `timeZone`, `useId()`.
2. `useSyncExternalStore(sub, () => true, () => false)` → render client-only values after hydration.
3. `suppressHydrationWarning`: one level deep, keeps the DOM, hides the warning.
4. Inline `<script>` in `<head>` before paint (theme, locale) + `suppressHydrationWarning`. Needs CSP `'unsafe-inline'` or a nonce.
5. `next/dynamic` with `ssr: false` (Client Components only). Last resort.

Common causes: time, locale, `Math.random()`, `typeof window` in render, `localStorage` in render, `<p><div>`, browser extensions.

⚡ Random or time values in a Client Component's render get **frozen into the static shell**. In a Server Component they fail the prerender unless you move them to request time (`<Suspense>` + `await connection()`).

## Errors → meaning

| Error text (starts with) | Rule broken |
| --- | --- |
| `... only works in a Client Component but none of its parents are marked with "use client"` | Hook / client API in the server graph |
| `async Client Component` | Client Components can't be async. Use `use()` |
| `Functions cannot be passed directly to Client Components` | Function prop. Move it or make it a Server Function |
| `Event handlers cannot be passed to Client Component props` | `onClick` from a server file |
| `Only plain objects, and a few built-ins, can be passed to Client Components` | Class instance / null prototype |
| `'server-only' cannot be imported from a Client Component module` | Server module reached the client graph |
| `Attempted to call ... from the server` | Calling a client reference |
| `ssr: false is not allowed with next/dynamic in Server Components` | Move the dynamic import into a Client Component |

## This repo

| Thing | File |
| --- | --- |
| Client islands in a server page | [src/app/examples/client/page.tsx](../../src/app/examples/client/page.tsx) |
| Async server data + Suspense | [src/app/examples/server/page.tsx](../../src/app/examples/server/page.tsx) |
| Server Function as an `action` prop | [actions.ts](../../src/app/examples/client/actions.ts) → [contact-form.tsx](../../src/client/components/contact-form.tsx) |
| All providers in one client file | [app-providers.tsx](../../src/client/providers/app-providers.tsx) |
| Third-party wrapper | [theme-provider.tsx](../../src/client/providers/theme-provider.tsx) |
| CSS-driven theme icon (no mismatch) | [theme-toggle.tsx](../../src/client/components/theme-toggle.tsx) |
| Store per provider | [create-store-context.tsx](../../src/client/stores/create-store-context.tsx) |
| Validated server env | [src/server/config/env.ts](../../src/server/config/env.ts) |
| Boundary lint rules | [eslint.config.mjs](../../eslint.config.mjs) (`pnpm lint:boundaries`) |
