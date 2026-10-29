# Lesson 1 — The RSC Mental Model

## The problem

Before React Server Components, every React component was what we now call a **Client Component**. The server could render it to HTML (SSR), but **the same code also shipped to the browser** so React could hydrate that HTML. That has three costs:

1. **Every component costs JavaScript.** A static footer, a markdown renderer, a date library used once: all of it downloads, parses and runs in the browser, even if it never changes after load.
2. **Data comes from outside the tree.** `getServerSideProps` / `getStaticProps` fetched data *before* rendering and passed it down as props. A component deep in the tree couldn't ask for its own data on the server.
3. **Secrets need an API.** To read a database from a component, you had to build an API route, call it from the browser, and be careful about what it exposed.

Server Components fix all three. A Server Component runs **only on the server**, can be `async`, reads data during its own render, and **its code never reaches the browser**.

## How it works

### Two module graphs, one component tree

Your app is compiled into **two module graphs**:

- The **server graph**: every module reachable from your pages and layouts. Server Components live here.
- The **client graph**: every module reachable from a file marked `'use client'`. Client Components live here.

A module used by both graphs (a utility, a Zod schema in `src/shared/`) is **compiled twice**, once for each environment.

The components still form **one tree**:

```txt
Page (Server)
├─ PageHeader (Server)
└─ Counter (Client)          ← 'use client' file: entry into the client graph
   └─ Button (Client)        ← imported by Counter, so also in the client graph
```

### Where each kind of component runs

This table is the core of the whole phase:

| | On the server | In the browser | Code shipped to the browser |
| --- | --- | --- | --- |
| **Server Component** | Yes | **No** | **No** |
| **Client Component** | Yes (SSR / prerender, on a full page load) | Yes | Yes |

The word "Client" means "this component **also** runs in the browser". It doesn't mean "this component **only** runs in the browser".

```tsx
// app/hello.tsx
'use client'

export default function Hello() {
  console.log('Hello rendered') // full page load: terminal AND browser console
  return <p>Hello</p>
}
```

- **Full page load** (typing the URL, refresh): the log appears in your terminal (SSR), then in the browser (hydration).
- **Client-side navigation** (`<Link>`): the server sends only the RSC Payload. `Hello` renders **only in the browser**, with no HTML from the server.

### The RSC Payload

When the server renders a route, the Server Component tree becomes the **RSC Payload**. It's a compact, streamable description of the UI that contains:

- The **rendered output** of Server Components (the result, not the code).
- **Placeholders** where Client Components go, plus **references** to their JS chunks.
- The **props** passed from Server Components to Client Components, serialized.

Then:

| Step | First load | Later navigation |
| --- | --- | --- |
| Server | Renders the RSC Payload, then uses it **plus Client Components** to render HTML | Renders (or reuses a cached) RSC Payload only |
| Browser | 1. Paints HTML (fast, not interactive yet) 2. Uses the payload to rebuild the tree 3. Hydrates Client Components | Uses the payload to update the tree. Client Components render in the browser. |

This is why "server-rendered" and "Server Component" are **different ideas**:

- **Server-rendered** describes how the HTML was produced (SSG, ISR, SSR). Client Components are server-rendered too.
- **Server Component** describes where the component's code runs and whether that code ships.

### Server Components can be async

A Server Component is an `async` function that can `await` during render:

```tsx
// src/app/examples/server/page.tsx (simplified from this repo)
import { getLatestPosts } from '@/server/services/post-service'

async function Posts() {
  const posts = await getLatestPosts() // runs on the server, during render
  if (!posts.ok) return <p role="alert">{posts.error}</p>
  return <ul>{posts.data.map((p) => <li key={p.id}>{p.title}</li>)}</ul>
}
```

No API route, no `useEffect`, no loading state in the component itself. The `<Suspense>` around `<Posts />` in the real file supplies the loading UI while the `await` is pending.

Client Components **cannot** be async. If you try, you get:

> `async Client Component. Only Server Components can be async at the moment.`

In a Client Component, read async data with `use(promise)` instead (Lesson 4).

### What a Server Component cannot do

A Server Component's code never runs in the browser, so anything that needs to **respond to changes over time** in the browser is off limits:

| Not allowed in a Server Component | Why |
| --- | --- |
| `useState`, `useReducer`, `useEffect`, `useLayoutEffect` | There's no browser instance to hold state or run effects |
| Event handlers (`onClick`, `onChange`) | The function would have to run in the browser |
| `useContext` (reading context) | Context lives in the client tree |
| Browser APIs (`window`, `localStorage`) | They don't exist on the server |
| Custom hooks that use any of the above | Same reasons |

A Server Component can still **render** things that are interactive without JavaScript:

- `<details>` opens and closes.
- `<form action={serverFunction}>` submits (Phase 05).
- `<video controls>` plays.
- `<a href>` / `<Link>` navigates.

A Server Component can also render Client Components, which add the interactivity.

### Server Components re-render on the server, not in the browser

A Server Component's output only changes when **the server renders the route again**: a navigation, `router.refresh()`, or revalidation. React then receives a new payload and reconciles the DOM.

Never change Server Component DOM by hand (`document.querySelector(...).textContent = ...`). React's tree and the DOM get out of sync, and the next payload overwrites your change or breaks reconciliation.

## Examples

### Example 1 — See where code runs

```tsx
// src/app/examples/boundary/where/page.tsx
import { WhereClient } from './where-client'

export default function Page() {
  console.log('[server component] Page rendered') // terminal only
  return (
    <>
      <p>typeof window on the server: {typeof window}</p>
      <WhereClient />
    </>
  )
}
```

```tsx
// src/app/examples/boundary/where/where-client.tsx
'use client'

export function WhereClient() {
  console.log('[client component] rendered, window is', typeof window)
  return <p>I render on the server first, then in the browser.</p>
}
```

What to observe:

1. Hard refresh: the terminal shows both logs, with `window is undefined` for the client one. The browser console shows only the client log, with `window is object`.
2. Navigate away and back with a `<Link>`: the **terminal** shows only the Server Component log, and the browser shows the client one.

> **⚡ Cache Components:** this page has no request-time data, so it's **prerendered at build time**. In `pnpm build && pnpm start`, the server logs appear once **during the build**, not per request. That's the static shell (Phase 04).

### Example 2 — Look at the RSC Payload

1. Open DevTools → Network, filter by `rsc` (or `_rsc=` in the URL).
2. Click a `<Link>` to `/examples/server`.
3. Open the response. It's text, not HTML. You'll see post titles (the **rendered output**) but none of the `getLatestPosts` code. Client Component lines look like references to chunk files.

## Tips & tricks

- **Default to Server Components.** Add `'use client'` only on the small pieces that need state, effects, event handlers or browser APIs. [src/app/examples/client/page.tsx](../../src/app/examples/client/page.tsx) does exactly this: the page is a Server Component, and `Counter`, `ContactForm` and `HealthStatus` are client islands.
- **Server Components are free in the bundle.** A Server Component that imports a heavy markdown or syntax-highlighting library adds **0 bytes** of client JS. The same import inside a Client Component ships the whole library.
- **SEO doesn't depend on component type.** Both kinds produce HTML on the first response. What matters is whether the server render reaches the content. Content that only appears after a click or an effect won't be in the HTML.

## Pitfalls

| Mistake | Symptom |
| --- | --- |
| Thinking `'use client'` skips SSR | Code that touches `window` during render crashes on the server: `ReferenceError: window is not defined` |
| `useState` in a file without `'use client'` | Build error: `... only works in a Client Component but none of its parents are marked with "use client"` |
| Making a Client Component `async` | `async Client Component. Only Server Components can be async at the moment.` |
| Editing Server Component DOM with `document.*` | Your change gets overwritten on the next navigation or refresh, or React reports a mismatch |
| Expecting a Server Component to re-render after a client state change | It won't. Server output only changes when the server renders again (`router.refresh()`, navigation, revalidation) |

## Where it's used

- **Content pages** (blogs, docs, product pages): almost entirely Server Components, with tiny client islands for "add to cart", search and theme toggles.
- **Dashboards:** Server Components fetch data close to the database. Client Components handle charts, filters and drag-and-drop.
- **Heavy rendering libraries** (markdown, syntax highlighting, date formatting): used in Server Components so they never ship.

## Source docs

- `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`
- `node_modules/next/dist/docs/01-app/02-guides/server-and-client-boundary.md` (sections "Rendering environments" and "State and interactivity")
- `node_modules/next/dist/docs/01-app/02-guides/rendering-philosophy.md`
- React docs: "Server Components" (react.dev/reference/rsc/server-components)
