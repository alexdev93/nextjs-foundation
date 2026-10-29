# Lesson 2 — The `'use client'` Boundary

## The problem

Most people learn `'use client'` as "put this on top of files that use hooks". That works until:

- Your bundle is much bigger than expected, because one `'use client'` near the top pulled half the app into the client graph.
- You add `'use client'` to every file "just in case".
- You import a constant or helper from a `'use client'` file into a Server Component, and get a strange error about "client references".

All of these come from one misunderstanding about what the directive actually marks.

## How it works

### The directive marks an entry point, not a component

`'use client'` goes at the **top of a file, before any imports**. It applies to the **whole module**. You can't put it inside a function.

It tells the bundler: **"this module is where the client graph starts."** From then on:

- **Every module this file imports** is part of the client graph, whether or not that module has the directive.
- **Every component this file renders directly** (by importing it) is a Client Component.

```txt
page.tsx (server)
└─ imports counter.tsx          'use client'  ← entry point
   ├─ imports button.tsx        (no directive, but now client)
   ├─ imports lucide-react      (now client: the icons ship)
   └─ imports @/lib/utils       (now client, and also compiled for the server if the server uses it)
```

So you only need the directive on files that a **Server Component imports directly**. In this repo, [counter.tsx](../../src/client/components/counter.tsx) has `'use client'`, but [button.tsx](../../src/components/ui/button.tsx) doesn't. `Button` becomes a Client Component only when a client file imports it, and stays a Server Component when a server file imports it.

> A file without the directive isn't "a Server Component". It's **neutral**. It becomes whatever the graph that imports it is. Only files with `'use client'` are fixed to the client.

### What a Server Component receives when it imports a `'use client'` file

When the server graph imports a `'use client'` module, it **doesn't get the real exports**. Every export is replaced by a **client reference**, a placeholder that says "this lives in chunk X, export Y".

What you can do with a client reference on the server:

| From a `'use client'` file | In a Server Component |
| --- | --- |
| A component export | ✅ Render it: `<Counter />` |
| A component's static property (`Menu.Item`) | ❌ It's `undefined` → `Element type is invalid` |
| A plain function export | ❌ Calling it throws: `Attempted to call ... from the server but it's on the client` |
| A constant / object export | ❌ You get the reference, not the value |

That's why shared constants, schemas and helpers belong in files **without** the directive, such as [src/shared/](../../src/shared/) in this repo.

Look at [src/client/stores/app-store/index.ts](../../src/client/stores/app-store/index.ts). The barrel itself has no directive:

- Exports re-exported from `./provider` (which has `'use client'`) are client references.
- Exports from `./store` (no directive) are real values.

Import `AppStoreProvider` from a Server Component and render it: fine. Import `initialAppData` from a Server Component: you get the real object, because `store.ts` isn't a client entry point. That's correct but easy to miss, so check the file the export **actually comes from**, not the barrel.

### Where to put the boundary: as low as possible

Everything below the boundary ships JavaScript. Push it down to the smallest interactive piece:

```tsx
// ❌ The whole layout is now client. Logo, nav links and every import ship.
'use client'
export default function Layout({ children }) { /* ...uses useState for the search box... */ }
```

```tsx
// ✅ Layout stays a Server Component. Only the search box ships.
import { Logo } from './logo'      // server
import { Search } from './search'  // 'use client'

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <nav><Logo /><Search /></nav>
      <main>{children}</main>
    </>
  )
}
```

Your [root layout](../../src/app/layout.tsx) is a Server Component that renders `AppProviders` (client). The `ThemeToggle` in the commented-out nav is a client island inside server markup.

### The `children` escape hatch (preview of Lesson 4)

A boundary doesn't make **everything rendered inside it** client. It only affects what the client file **imports**. A Server Component passed as `children` stays a Server Component:

```tsx
// page.tsx (server)
<ClientModal>
  <ServerCart />   {/* still a Server Component: rendered on the server, passed as output */}
</ClientModal>
```

**Imports** decide the graph. Where something sits in the tree doesn't.

### `'use client'` and `'use server'` are not opposites

| Directive | Marks | Where |
| --- | --- | --- |
| `'use client'` | An entry point into the **client module graph** | Top of a file |
| `'use server'` | **Server Functions** that the client can call over the network | Top of a file (all exports) or top of an async function body |

There is **no** directive for "Server Component". That's the default. `'use server'` does not mean "this is a Server Component". It means "these functions are callable from the client", which is a public endpoint (Phase 05). [src/app/examples/client/actions.ts](../../src/app/examples/client/actions.ts) is a `'use server'` file.

## Examples

### Example 1 — Measure the cost of a high boundary

Next 16 no longer prints JS sizes in the build table. It writes them to `.next/diagnostics/route-bundle-stats.json`, with a `firstLoadUncompressedJsBytes` field per route.

1. Run `pnpm build`, then read the number for `/examples/client`:

   ```bash
   jq '.[] | select(.route == "/examples/client") | .firstLoadUncompressedJsBytes' .next/diagnostics/route-bundle-stats.json
   ```

2. Add `'use client'` to the top of [src/app/examples/client/page.tsx](../../src/app/examples/client/page.tsx) and remove `export const metadata` (Client Components can't export it, and you'll get an error that says so).
3. Build again and compare. Card, Badge, PageHeader and everything they import now ship.
4. For a visual view, run `pnpm next analyze` and filter by route and the **client** environment. It shows the import chain that pulled each module in.
5. Revert.

### Example 2 — The client reference trap

```tsx
// src/app/examples/boundary/ref/format.ts
'use client'   // ← mistake on purpose
export const formatPrice = (cents: number) => `$${(cents / 100).toFixed(2)}`
```

```tsx
// src/app/examples/boundary/ref/page.tsx (server)
import { formatPrice } from './format'
export default function Page() {
  return <p>{formatPrice(1999)}</p>  // 💥 Attempted to call formatPrice() from the server...
}
```

Fix: remove the directive. `format.ts` has no client-only code, so it should be neutral.

### Example 3 — Compound components across the boundary

```tsx
// menu.tsx
'use client'
function Menu({ children }: { children: React.ReactNode }) { /* state */ return <ul>{children}</ul> }
function Item({ children }: { children: React.ReactNode }) { return <li>{children}</li> }
Menu.Item = Item
export { Menu }
```

```tsx
// page.tsx (server)
import { Menu } from './menu'
<Menu><Menu.Item>One</Menu.Item></Menu>   // 💥 Menu.Item is undefined on the server
```

Fix: export `MenuItem` as a **named export** and use `<MenuItem>` from the server.

## Tips & tricks

- **Name client folders clearly.** This repo puts browser code in [src/client/](../../src/client/) and keeps [src/components/ui/](../../src/components/ui/) neutral. When you see an import path, you can tell which graph it belongs to.
- **Hooks with zero UI still need a client parent.** `usePathname()` in a component file without the directive works as long as a `'use client'` file imports it. If a Server Component imports it directly, you get the "only works in a Client Component" error.
- **Biome / IDE help.** The Next.js TypeScript plugin warns about invalid exports (like `metadata`) in `'use client'` files and about non-serializable props (Lesson 3).
- **`page.tsx` / `layout.tsx` can be `'use client'`,** but then they can't export `metadata` or `generateMetadata`, can't be async, and everything they import ships. Almost always, keep them server and add a client child instead.

## Pitfalls

| Mistake | Symptom |
| --- | --- |
| `'use client'` below an import or inside a function | It's ignored or rejected. The directive must be the first statement in the file |
| Directive at the top of a big layout | Large First Load JS, and data fetching moves to the client |
| Exporting constants or helpers from a `'use client'` file and using them on the server | `Attempted to call ... from the server` or a reference object instead of the value |
| `Menu.Item` style compound components used from the server | `Element type is invalid ... got: undefined` |
| `'use client'` page exporting `metadata` | Build error: metadata can't be exported from a Client Component |
| Adding `'use client'` to every file | Works, but you lose every Server Component benefit |

## Where it's used

- **Islands architecture:** server pages with a handful of interactive islands, like this repo's `/examples/client`.
- **Design systems:** primitives stay neutral (no directive) so they work in both graphs. Only stateful components (dialogs, dropdowns) have `'use client'`.
- **Feature folders:** `feature/components/feature-client.tsx` (directive) next to `feature/components/feature-list.tsx` (server).

## Source docs

- `node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-client.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-server.md`
- `node_modules/next/dist/docs/01-app/02-guides/server-and-client-boundary.md` (section "Crossing the boundary", and the "Compound components" details block)
- `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md` (section "Reducing JS bundle size")
