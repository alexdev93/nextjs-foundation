# Lesson 4 — Composition Patterns

## The problem

You have a Client Component with state (a modal, tabs, a collapsible sidebar) and you want **server-fetched UI inside it**. The obvious move is to import the Server Component into the client file:

```tsx
'use client'
import { Cart } from './cart'   // Cart is async and reads the database
```

That doesn't work. Imports decide the graph (Lesson 2), so `Cart` is pulled into the **client** graph. It can no longer be async or read the database, and its code ships.

You also have state that the whole app needs (theme, a store, toasts), which means React context. Server Components can't use context at all.

Both problems have the same solution: **composition**. Pass server output into client components instead of importing it.

## How it works

### `children` and slot props

A rendered element is serializable data (Lesson 3), so a Server Component can render another Server Component and hand the **result** to a Client Component:

```tsx
// app/page.tsx (server)
import { Cart } from './cart'      // server
import { Modal } from './modal'    // 'use client'

export default function Page() {
  return (
    <Modal title={<h2>Your cart</h2>}>
      <Cart />                       {/* rendered on the server, passed as output */}
    </Modal>
  )
}
```

```tsx
// app/modal.tsx
'use client'
import { useState, type ReactNode } from 'react'

export function Modal({ title, children }: { title: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(true)
  if (!open) return <button onClick={() => setOpen(true)}>Open cart</button>
  return (
    <div role="dialog">
      <header>{title}<button onClick={() => setOpen(false)}>Close</button></header>
      {children}
    </div>
  )
}
```

`children` isn't special. **Any** prop typed `ReactNode` is a slot: `title`, `sidebar`, `footer`, `actions`. This is often called the **donut pattern**: the client component is the ring, the server content is the hole.

### Owner vs parent: why this works

React tracks two relationships:

- The **owner** is the component whose code **wrote the JSX**. `Page` owns both `<Modal>` and `<Cart>`.
- The **parent** is the component that **contains** the child in the rendered tree. `Modal` is the parent of `Cart`.

**The owner decides where a component renders.** `Cart`'s owner is a Server Component, so `Cart` renders on the server. `Modal` is only the parent: it receives `Cart`'s output to place, never its code.

### What happens when the client parent re-renders

When `Modal`'s state changes, React re-renders `Modal` **in the browser**. `children` is the same already-rendered element, so `Cart` does **not** re-render and does **not** refetch. Server output only changes when the server renders the route again.

So:

- ✅ Toggling, filtering or animating server content from a client wrapper is cheap.
- ❌ A client wrapper can't pass new props **into** server children. `children` is opaque output. To show different server content for a client choice, make the choice part of the **URL** (search params or a route) so the server renders it, or fetch on the client.

### Context providers

Context needs `createContext`, which only works in the client graph. The pattern:

1. Write a `'use client'` provider that accepts `children`.
2. Render it from a Server Component (usually a layout).
3. Everything inside can still be Server Components. Only **Client Components** below it can read the context.

This repo does it in one place. [app-providers.tsx](../../src/client/providers/app-providers.tsx) combines `ThemeProvider`, `AppStoreProvider` and `Toaster`, and the [root layout](../../src/app/layout.tsx) renders `<AppProviders>{children}</AppProviders>` inside `<body>`.

React 19 lets you render the context directly as a provider. [create-store-context.tsx](../../src/client/stores/create-store-context.tsx) uses `<StoreContext value={store}>` instead of `<StoreContext.Provider value={store}>`.

Rules for providers:

- **Render them as deep as possible.** Wrap `{children}`, not `<html>`. A provider only needed by `/dashboard` belongs in `app/dashboard/layout.tsx`, not the root layout.
- **Keep the provider thin.** Its children are passed in as server output, so a provider doesn't make the page a Client Component. Its *own imports* do ship, though.
- **Create stores per provider, not per module.** On the server, one module instance serves **every request**. A module-level `const store = create(...)` would share one user's state with the next user. `createStoreContext` creates the store with `useState(() => create(...))`, once per provider mount, so once per request on the server. Its comment explains this.

### Server-side "context": `React.cache`

Server Components can't read context, but you often need request-scoped data in many of them (the current user, a locale). Use `cache` to deduplicate instead of passing props down:

```ts
// src/server/services/session.ts
import 'server-only'
import { cache } from 'react'

export const getCurrentUser = cache(async () => {
  // runs once per request, however many components call it
})
```

### Passing a Promise and unwrapping it with `use()`

Instead of `await`ing in the Server Component (which blocks until the data arrives), **start** the request on the server and pass the pending promise down:

```tsx
// app/blog/page.tsx (server)
import { Suspense } from 'react'
import { Posts } from './posts'
import { getPosts } from '@/server/services/blog-service'   // your own service, returns plain objects

export default function Page() {
  const posts = getPosts()          // ← no await: the request starts now
  return (
    <Suspense fallback={<p>Loading posts…</p>}>
      <Posts posts={posts} />
    </Suspense>
  )
}
```

```tsx
// app/blog/posts.tsx
'use client'
import { use } from 'react'

export function Posts({ posts }: { posts: Promise<{ id: number; title: string }[]> }) {
  const all = use(posts)            // suspends until the promise resolves
  return <ul>{all.map((p) => <li key={p.id}>{p.title}</li>)}</ul>
}
```

Why this is useful:

- The request starts **on the server**, before any client JS runs. There's no "mount → useEffect → fetch" waterfall.
- The page shell streams immediately. `Posts` appears when the data arrives.
- The Client Component can combine the data with state (filtering, sorting) without refetching.

To share one promise with many Client Components, put the **promise** in a context provider and call `use(SomeContext)` and then `use(promise)` in consumers.

> **⚡ Cache Components:** the `<Suspense>` boundary is **required** if the promise depends on request-time data or uncached I/O. Without it, the build fails because the static shell can't be produced. If the function is cached (`'use cache'`, like `getLatestPosts` in this repo), the result can be part of the static shell.

## Examples

### Example 1 — A client tab bar around server panels

```tsx
// page.tsx (server)
<Tabs
  labels={['Overview', 'Activity']}
  panels={[<Overview key="o" />, <Activity key="a" />]}   // both Server Components
/>
```

```tsx
// tabs.tsx
'use client'
import { useState, type ReactNode } from 'react'

export function Tabs({ labels, panels }: { labels: string[]; panels: ReactNode[] }) {
  const [i, setI] = useState(0)
  return (
    <>
      <div role="tablist">
        {labels.map((l, idx) => (
          <button key={l} role="tab" aria-selected={i === idx} onClick={() => setI(idx)}>{l}</button>
        ))}
      </div>
      {panels[i]}
    </>
  )
}
```

Both panels are rendered on the server up front, and switching tabs is instant. The trade-off is that you pay for rendering the hidden panels too. For expensive panels, use the URL (`?tab=activity`) and render only the active one on the server.

### Example 2 — A provider scoped to one section

```tsx
// app/dashboard/layout.tsx (server)
import { DashboardFiltersProvider } from './_components/filters-provider'  // 'use client'

export default function Layout({ children }: { children: React.ReactNode }) {
  return <DashboardFiltersProvider>{children}</DashboardFiltersProvider>
}
```

Pages under `/dashboard` stay Server Components. Only their client children call `useDashboardFilters()`.

## Tips & tricks

- **Push state down, pass content in.** If a client component needs a big chunk of static markup, accept it as `children` instead of writing it inside the client file.
- **Server Components can't be render props.** `renderItem={(x) => <ServerRow />}` is a function and can't cross. Pass a list of elements instead (Lesson 3).
- **Don't create promises during client render.** `use(fetch(...))` inside a Client Component creates a new promise on every render and suspends forever. Promises should come from the server, from a cache, or from a library like SWR / TanStack Query.
- **Combine `cache` + `use`:** wrap the data function in `React.cache`, start it in a layout, and `await` it again in a page. Both get the same result.

## Pitfalls

| Mistake | Symptom |
| --- | --- |
| Importing a Server Component into a `'use client'` file | It becomes a Client Component. If it's async: `async Client Component` error. If it imports `server-only`: build error |
| Expecting server `children` to update when client state changes | They don't. Change the URL or refresh the route |
| Provider at the very top of the tree with heavy imports | Every page pays for that JS |
| Module-level store or cache shared across requests | One user's data appears for another user on the server |
| `useContext` in a Server Component | Error: hooks only work in Client Components |
| Passing a promise to a Client Component without `<Suspense>` above it | Under ⚡ Cache Components: build error. Otherwise the nearest boundary (maybe `loading.tsx`) shows instead |

## Where it's used

- **Modals, drawers, accordions, tabs** wrapping server-rendered content.
- **App-wide providers** (theme, store, toasts) in one `AppProviders` component, like this repo.
- **Feature providers** (filters, editor state) scoped to the section's layout.
- **Streaming lists** where the server starts the fetch and a client component adds sorting and filtering.

## Source docs

- `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md` (sections "Interleaving Server and Client Components" and "Context providers")
- `node_modules/next/dist/docs/01-app/02-guides/server-and-client-boundary.md` (the "Owner and parent" details block)
- `node_modules/next/dist/docs/01-app/01-getting-started/06-fetching-data.md` (section "Streaming data with the `use` API")
- `node_modules/next/dist/docs/01-app/02-guides/single-page-applications.md` (section "Using React's `use` within a Context Provider")
