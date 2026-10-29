# Lesson 6 — Third-Party Libraries Across the Boundary

## The problem

Many npm packages were written before Server Components existed. A carousel, a chart library or a date picker uses `useState` or `useEffect` internally, but its entry file has **no `'use client'` directive**. Import it into a Server Component and you get:

> `... only works in a Client Component but none of its parents are marked with "use client", so they're Server Components by default.`

Other packages touch `window` or `document` **when they're imported**, so even a correct `'use client'` wrapper crashes during SSR, because Client Components also render on the server.

## How it works

### Case 1 — A client-only library without the directive: write a wrapper

Re-export it from your own `'use client'` file. That file becomes the client entry point:

```tsx
// src/client/components/carousel.tsx
'use client'
export { Carousel } from 'acme-carousel'
```

```tsx
// any Server Component
import { Carousel } from '@/client/components/carousel'
<Carousel slides={slides} />   // ✅ slides must be serializable (Lesson 3)
```

If you only use the library **inside** one of your own Client Components, you don't need a wrapper. Your file is already the entry point.

**This repo does this for `next-themes`.** [theme-provider.tsx](../../src/client/providers/theme-provider.tsx) is a two-line `'use client'` wrapper around `NextThemesProvider`. It forwards every prop with `ComponentProps<typeof NextThemesProvider>`, so the wrapper never needs updating when the library adds options.

### Case 2 — A library that touches the browser at import time: `next/dynamic` with `ssr: false`

```tsx
// src/client/components/map.tsx
'use client'
import dynamic from 'next/dynamic'

const LeafletMap = dynamic(() => import('./leaflet-map'), {
  ssr: false,
  loading: () => <div className="bg-muted h-80 animate-pulse rounded-xl" />,
})

export function Map(props: { lat: number; lng: number }) {
  return <LeafletMap {...props} />
}
```

- `ssr: false` skips the server render for that component. The `loading` UI goes into the HTML, and the real component loads and mounts in the browser.
- **`ssr: false` is only allowed in Client Components.** In a Server Component you get: `ssr: false is not allowed with next/dynamic in Server Components. Please move it into a Client Component.`
- Use it as a **last resort**. The content isn't in the HTML (bad for SEO and first paint), and it loads late. First try to call the library inside `useEffect` instead, which also doesn't run on the server.

### Case 3 — A library that's fine in both graphs

Pure utilities (`zod`, `date-fns`, `clsx`) and icon packages that are plain components (`lucide-react` in this repo) work anywhere. Importing them from a **Server Component** keeps them out of the client bundle.

### Case 4 — Compound components across the boundary

Libraries that expose `Menu.Item`, `Tabs.Panel` or `Select.Option` as **static properties** break when used from a Server Component, because the server only receives a client reference for `Menu` (Lesson 2).

- If the library also exports named parts (`MenuItem`), use those.
- Otherwise use the compound component from **your own** `'use client'` file and expose a simpler API to the server.

shadcn/ui components (like [src/components/ui/](../../src/components/ui/) in this repo) usually export **named** parts (`Card`, `CardHeader`, `CardTitle`), so they work from Server Components.

### Advice if you publish a library

- Add `'use client'` to the entry points that use client features, so users don't need wrappers.
- Check your bundler keeps the directive. Some bundlers strip top-level strings, and tsup / esbuild may need a banner config.
- Split exports: `my-lib` (neutral / server-safe) and `my-lib/client` (`'use client'`).

## Examples

### Example 1 — Wrap a client library

1. `pnpm add react-confetti` (or any small client-only component library).
2. Import it straight into a Server Component page and read the error.
3. Create a `'use client'` re-export in `src/client/components/` and import that instead.
4. Remove the package afterwards if you don't need it.

### Example 2 — `useEffect` before `ssr: false`

```tsx
'use client'
import { useEffect, useRef } from 'react'

export function Chart({ data }: { data: number[] }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let chart: { destroy(): void } | undefined
    import('heavy-chart-lib').then(({ createChart }) => {   // loaded only in the browser
      chart = createChart(ref.current!, data)
    })
    return () => chart?.destroy()
  }, [data])
  return <div ref={ref} className="h-64" />  // the container is in the HTML, so layout doesn't shift
}
```

This keeps the container in the server HTML and loads the library only in the browser, without `next/dynamic`.

## Tips & tricks

- **Put wrappers in one place.** Here, `src/client/components/` or `src/client/providers/`. Then "which libraries are client-only?" has a single answer.
- **Wrap the provider, not the app.** Libraries that need a provider (theme, query client, i18n) go into [app-providers.tsx](../../src/client/providers/app-providers.tsx), which already exists for this.
- **Check the bundle after adding a library** with `pnpm next analyze` (client environment). A library you expected to stay on the server might be pulled in through a client file.
- **`@next/third-parties`** has ready-made, optimized components for Google Analytics, Tag Manager, Maps and YouTube embeds. Prefer them over raw `<script>` tags.

## Pitfalls

| Mistake | Symptom |
| --- | --- |
| Importing a hook-based library into a Server Component | `... only works in a Client Component but none of its parents are marked with "use client"` |
| A `'use client'` wrapper around a library that uses `window` at import | `ReferenceError: window is not defined` during SSR. The directive doesn't skip SSR |
| `dynamic(..., { ssr: false })` in a Server Component | Build error telling you to move it into a Client Component |
| Using `Lib.Part` from a Server Component | `Element type is invalid ... got: undefined` |
| Passing callbacks to a wrapped library component from the server | Function serialization error. Move the callback into the wrapper |

## Where it's used

- **Theme, analytics, i18n providers:** thin wrappers in one providers file.
- **Maps, rich text editors, charts:** `useEffect`-based loading or `next/dynamic` with `ssr: false`.
- **Design-system adoption:** a `'use client'` re-export layer while a library doesn't yet ship the directive.

## Source docs

- `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md` (section "Third-party components")
- `node_modules/next/dist/docs/01-app/02-guides/lazy-loading.md` (sections on `ssr: false`)
- `node_modules/next/dist/docs/01-app/02-guides/third-party-libraries.md` (`@next/third-parties`)
- `node_modules/next/dist/docs/01-app/02-guides/package-bundling.md` (`next analyze`)
