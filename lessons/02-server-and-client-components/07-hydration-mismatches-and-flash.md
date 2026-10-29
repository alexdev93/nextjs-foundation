# Lesson 7 — Hydration Mismatches and Preventing a Flash

## The problem

On a full page load, a Client Component renders **twice**: once on the server to produce HTML, and once in the browser to **hydrate** it. Hydration means React walks the existing DOM, attaches event handlers, and **expects its render to produce exactly the same output as the server did**.

Anything that gives a different result in the two environments breaks that expectation:

```tsx
'use client'
export function Now() {
  return <p>{new Date().toLocaleTimeString()}</p>   // server: 10:42:01 · browser: 10:42:03
}
```

You've already seen one. In Phase 01, the `LifecycleLogger` button showed one ID in the HTML and logged another in the console. `Math.random()` ran once during the server prerender and again during hydration in the browser.

## How it works

### What React does on a mismatch

React 19 logs **one** error with a diff of the server and client output, then **recovers by client-rendering** from the nearest Suspense or error boundary above the mismatch. That means:

- The user sees the server HTML, then a **flash** when it's replaced.
- Work done on that subtree is thrown away and redone in the browser.
- Any DOM changes made by inline scripts inside that boundary are **lost**, because React rebuilds the DOM and the scripts don't run again.

So a mismatch isn't only a console warning. It has real cost.

### The common causes

| Cause | Example |
| --- | --- |
| Time | `new Date()`, `Date.now()`, relative times ("3 minutes ago") |
| Locale / time zone | `toLocaleDateString()`, `Intl.NumberFormat()` without a fixed locale. The server runs in UTC with its own locale; the browser uses the user's |
| Randomness | `Math.random()`, `crypto.randomUUID()` during render (the `LifecycleLogger` case) |
| Branching on the environment | `typeof window !== 'undefined' ? A : B` during render |
| Browser storage during render | `localStorage.getItem('theme')` in render or in a `useState` initializer whose result changes the markup |
| Invalid HTML nesting | `<p><div/></p>`, `<a>` inside `<a>`. The browser's parser "fixes" the HTML, so the DOM no longer matches React's tree |
| Browser extensions | Extensions that inject attributes into `<html>` or `<body>` (password managers, translators) |

> **⚡ Cache Components:** a route without request-time data is **prerendered once** at build time (or the first time it's rendered in dev), and that HTML is reused for every visitor. A random or time-based value in a Client Component's render is **frozen into the static shell**, so every visitor gets the same server value and every browser computes a different one. In a **Server Component**, Next goes further and fails the prerender on `Math.random()`, `Date.now()` and `new Date()` unless the call is moved to request time: inside `<Suspense>`, after `await connection()`.

### The fixes, from best to last resort

**1. Don't compute it differently.** Make the output deterministic:

- Pass the value from the server as a prop (`now={Date.now()}` from a request-time Server Component inside Suspense).
- Format with a **fixed** locale and time zone: `new Intl.DateTimeFormat('en-US', { timeZone: 'UTC' })`.
- Use `useId()` for IDs. It generates the same ID on the server and in the browser.

**2. Render the client-only part after hydration, with `useSyncExternalStore`.**

```tsx
'use client'
import { useSyncExternalStore } from 'react'

const subscribe = () => () => {}

/** false on the server and during hydration, true after. No mismatch, no extra effect. */
export function useIsClient() {
  return useSyncExternalStore(subscribe, () => true, () => false)
}
```

```tsx
const isClient = useIsClient()
return <p>{isClient ? new Date().toLocaleTimeString() : '--:--:--'}</p>
```

During hydration React uses the **server snapshot** (`false`), so the output matches. Then it re-renders with the client snapshot (`true`). This is better than `useEffect(() => setMounted(true), [])`: it doesn't need state in an effect, and the React Compiler lint rules don't complain.

The trade-off is that the user sees the placeholder first. That's fine for clocks and "x minutes ago", but not for a theme.

**3. `suppressHydrationWarning` for unavoidable, harmless differences.**

```tsx
<time dateTime={iso} suppressHydrationWarning>{new Date(iso).toLocaleString()}</time>
```

- React **keeps whatever is in the DOM** for that element and doesn't report the difference.
- It only works **one level deep**: the element's own attributes and text content, not its children.
- It **hides** the problem. Use it when you know the difference is expected, or when an inline script fixed the DOM on purpose (fix 4). It isn't a general "make the error go away" switch.

**4. An inline script that fixes the DOM before the first paint.**

For values that must be right **on the very first paint** (theme, the user's locale, a remembered open/closed state), run a tiny script **while the HTML is parsed**, before React loads:

```tsx
// app/layout.tsx
<html lang="en" data-theme="light" suppressHydrationWarning>
  <head>
    <script
      dangerouslySetInnerHTML={{
        __html: `(function(){try{var t=localStorage.getItem("theme");if(t)document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`,
      }}
    />
  </head>
```

- The script runs **synchronously during parsing**, so the right theme is applied before anything is painted. `useEffect` (after paint) and `useLayoutEffect` (after hydration) are both too late on a slow connection.
- `suppressHydrationWarning` on `<html>` tells React to accept the attribute the script set.
- Inline scripts need `'unsafe-inline'` or a nonce in your Content Security Policy. This repo's CSP in [next.config.ts](../../next.config.ts) allows `script-src 'self' 'unsafe-inline'` for this reason, and its comment explains why it doesn't use a nonce under Cache Components.
- For client state that must agree with the script (an accordion's open section), read the **same source** in a lazy `useState` initializer, as the docs' accordion example does.

**5. `next/dynamic` with `ssr: false`.** Skips the server render entirely (Lesson 6). It never mismatches because there's nothing to compare, but the content is missing from the HTML.

### How this repo handles the theme

1. `next-themes` (wrapped in [theme-provider.tsx](../../src/client/providers/theme-provider.tsx)) injects its **own inline script** that reads the saved theme and sets `class="dark"` on `<html>` before paint. That's fix 4, done by the library.
2. The [root layout](../../src/app/layout.tsx) puts `suppressHydrationWarning` on `<html>`, with a comment: `next-themes sets the theme class on <html> before hydration.`
3. [theme-toggle.tsx](../../src/client/components/theme-toggle.tsx) **renders both icons** and lets CSS pick one (`dark:hidden` / `hidden dark:block`). It never branches on `resolvedTheme` during render, because that value is unknown on the server. `resolvedTheme` is only read inside `onClick`. Its comment: `Both icons render on the server; CSS picks one, so there is no hydration mismatch.`

That third point is the general trick: **if the server can't know a value, let CSS decide what's visible** instead of choosing markup in JavaScript.

### Revisiting the `LifecycleLogger`

The first version did:

```tsx
const [instanceId] = useState(() => Math.random().toString(36).slice(2, 6))
```

- The server ran the initializer during the prerender and put, say, `#k3f9` into the HTML.
- The browser ran it again during hydration and got `#p7x2`.
- The effect logged `#p7x2`, while the HTML showed `#k3f9`: a mismatch.

The version that's in the repo now creates the ID in `useEffect` (which never runs on the server) and renders `····` until then. Applying fix 2 would give the same result without the effect.

## Examples

### Example 1 — Make a mismatch on purpose and read it

```tsx
// src/app/examples/boundary/hydration/clock.tsx
'use client'
export function Clock() {
  return <p>{new Date().toLocaleTimeString()}</p>
}
```

Render it on a page, hard refresh, and read the error in the browser console and the dev overlay. Note the diff it prints. Then fix it three ways (`useIsClient`, `suppressHydrationWarning`, a server-provided time) and write down what the user sees for each.

### Example 2 — Catch locale bugs locally

Your laptop's locale probably matches your browser's, which hides locale bugs. Start the dev server like a typical production server:

```bash
TZ=UTC LANG=ja_JP.UTF-8 pnpm dev
```

Any `toLocaleDateString()` in a Client Component now mismatches immediately.

### Example 3 — Invalid nesting

```tsx
<p>Intro <div>block</div></p>
```

The browser closes the `<p>` before the `<div>`, so the DOM doesn't match React's tree. Read the error, which names the nesting problem, and fix it with a `<div>` or `<span>`.

## Tips & tricks

- **Read the diff.** React 19's hydration error shows the server and client values side by side. The `+` / `-` lines point at the exact element.
- **Test in an incognito window** to rule out browser extensions before you start debugging.
- **Hydration only happens on a full page load.** After a `<Link>` navigation, Client Components render only in the browser, so a mismatch bug may only show up on refresh.
- **Avoid `typeof window` in render.** It's the most common self-made mismatch. Put browser-only work in effects or behind `useIsClient()`.
- **In dev, Strict Mode remounts once** and resets attributes React manages on `<html>`, `<head>` and `<body>`. If an attribute set by your inline script disappears only in development, re-apply it in a `useLayoutEffect` in the component that owns it. That's a no-op in production.

## Pitfalls

| Mistake | Symptom |
| --- | --- |
| `toLocaleDateString()` in a Client Component | Mismatch only in production or for users in other locales |
| `suppressHydrationWarning` on a parent, expecting it to cover children | Children still report mismatches. It's one level deep |
| `useEffect(() => setTheme(localStorage...))` for the theme | Light-to-dark flash on every load |
| `Math.random()` / `Date.now()` in a Client Component's render under ⚡ Cache Components | Same frozen value for every visitor in the HTML, a different one in each browser |
| `<p>` containing `<div>`, or nested `<a>` | Hydration error about invalid nesting |
| Inline script with a strict CSP and no nonce | Script blocked, so the flash comes back |

## Where it's used

- **Themes:** inline script + `suppressHydrationWarning` on `<html>` + CSS-driven visibility (this repo).
- **Dates and prices:** fixed locale on the server, or a client component with an inline-script fix for the user's locale.
- **Live clocks and countdowns:** `useIsClient()` or `suppressHydrationWarning` with a client update.
- **Persisted UI** (an open sidebar, the last accordion section): inline script plus a lazy `useState` initializer reading the same source.

## Source docs

- `node_modules/next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md` (the whole guide; especially "Understanding `suppressHydrationWarning`" and "Why not `useEffect`?")
- `node_modules/next/dist/docs/01-app/02-guides/migrating-to-cache-components.md` (synchronous I/O: `Math.random()`, `Date.now()`)
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/connection.md`
- `node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md`
- React docs: `hydrateRoot` → "Handling different client and server content" (react.dev)
