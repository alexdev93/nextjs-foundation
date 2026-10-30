# Lesson 3 — Waterfalls and Parallel Fetching

## The problem

`await` reads naturally top to bottom, which makes it very easy to write a **waterfall**: requests that could run at the same time, running one after another.

```tsx
export default async function Page({ params }: PageProps<'/artist/[id]'>) {
  const { id } = await params
  const artist = await getArtist(id)     // 300 ms
  const albums = await getAlbums(id)     // 400 ms, doesn't need artist!
  const tours = await getTours(id)       // 500 ms, doesn't need either!
  // total ≈ 1200 ms instead of ≈ 500 ms
}
```

Waterfalls also hide **across components**: a parent awaits its data, and only then renders the child that starts its own request.

## How it works

### Two kinds of "sequential"

- **Necessary:** request B needs a value from request A (`getPlaylists(artist.id)`). Keep it sequential, but stream B in its own `<Suspense>` so A's content shows first.
- **Accidental:** B doesn't need A. Start both at once.

### Fix 1 — Start first, await together

A promise starts its work **when it's created**, not when it's awaited:

```tsx
const artistP = getArtist(id)   // starts now
const albumsP = getAlbums(id)   // starts now
const toursP = getTours(id)     // starts now
const [artist, albums, tours] = await Promise.all([artistP, albumsP, toursP])   // ≈ 500 ms
```

`Promise.all` fails fast: **if one rejects, the whole thing rejects**. When one failure shouldn't break the page:

```tsx
const [artist, albums, tours] = await Promise.allSettled([artistP, albumsP, toursP])
if (albums.status === 'rejected') { /* render the rest, show an inline message for albums */ }
```

Or return `Result<T>` from every data function, as this repo does, so nothing rejects for expected failures.

The trade-off: `Promise.all` makes **all** content wait for the **slowest** request. Fix 2 avoids that.

### Fix 2 — Sibling `<Suspense>` boundaries

Give each independent piece its own async component and boundary:

```tsx
export default function Page({ params }: PageProps<'/artist/[id]'>) {
  return (
    <>
      <Suspense fallback={<HeaderSkeleton />}><ArtistHeader params={params} /></Suspense>
      <Suspense fallback={<GridSkeleton />}><Albums params={params} /></Suspense>
      <Suspense fallback={<ListSkeleton />}><Tours params={params} /></Suspense>
    </>
  )
}
```

React renders sibling async components **concurrently**, so all three requests start immediately. Each section **streams in as soon as its own data is ready** (Lesson 5). This is usually the best default: it's parallel, and the fast parts don't wait for the slow part.

| Approach | Total server time | When content appears |
| --- | --- | --- |
| Sequential awaits | sum of all | everything at the end |
| `Promise.all` | slowest one | everything together, after the slowest |
| Sibling `<Suspense>` | slowest one | **each part as soon as it's ready** |

Use `Promise.all` when the parts **must appear together** (a chart and its legend), and sibling boundaries when they're independent.

### Fix 3 — Preload before blocking work

When some blocking work has to come first (an auth or availability check), start the data you'll need **before** it:

```tsx
// app/item/[id]/item.tsx
import { cache } from 'react'

const getItem = cache(async (id: string) => db.item.findUnique({ where: { id } }))

export const preload = (id: string) => { void getItem(id) }   // start, don't wait

export default async function Item({ id }: { id: string }) {
  const item = await getItem(id)    // same cached promise as the preload
  return <div>{item?.name}</div>
}
```

```tsx
// app/item/[id]/page.tsx
import Item, { preload } from './item'

export default async function Page({ params }: PageProps<'/item/[id]'>) {
  const { id } = await params
  preload(id)                                   // item request starts now…
  const isAvailable = await checkIsAvailable(id) // …and runs during this check
  return isAvailable ? <Item id={id} /> : null
}
```

The preload only helps if the data function **deduplicates**, so the later call reuses the same request:

- `fetch`: automatic memoization (unless you pass a `signal`, Lesson 1).
- ORM / SDK: wrap the function in `React.cache` (Lesson 4).
- ⚡ With Cache Components: `'use cache'` on the function, or `'use cache: private'` if it reads `cookies()` / `headers()`.

Keep `preload` **next to the component that consumes the data**, so moving or deleting the component takes its preload with it.

### Layouts and pages already run in parallel

Next renders the layouts and the page of a route **in parallel**, so a layout's fetch and a page's fetch don't form a waterfall. Waterfalls come from awaits **inside one component**, or from a parent that must finish before it renders the child that fetches.

### Necessary waterfalls: stream the dependent part

```tsx
export default async function Page({ params }: PageProps<'/artist/[id]'>) {
  const artist = await getArtist((await params).id)   // must come first
  return (
    <>
      <h1>{artist.name}</h1>
      <Suspense fallback={<ListSkeleton />}>
        <Playlists artistId={artist.id} />             {/* depends on artist */}
      </Suspense>
    </>
  )
}
```

The page still waits for `getArtist` before showing anything. If that's slow, wrap the page in a `loading.tsx` or a higher boundary, or cache `getArtist` (Phase 04).

## Examples

### Example 1 — Measure the three versions

Use the `slow()` helper from [07-exercises.md](07-exercises.md) to fake three requests of 400, 800 and 1200 ms. Build the page three ways (sequential, `Promise.all`, sibling Suspense) and record **when each section appears**. Exercise 3 has the full steps.

### Example 2 — Find a hidden cross-component waterfall

```tsx
async function Profile({ id }: { id: string }) {
  const user = await getUser(id)            // 500 ms
  return <><h2>{user.name}</h2><Posts userId={id} /></>   // Posts only starts after 500 ms
}
```

`Posts` only needs `id`, which was already known. Fix it by rendering `<Posts>` **next to** `<Profile>` (siblings), or by preloading `getPosts(id)` at the top of `Profile`.

## Tips & tricks

- **Look for `await` followed by an unrelated `await`.** That's the most common waterfall.
- **Pass inputs, not results.** A child that needs `id` should get `id`, not wait for the parent's `user` object.
- **`void promise` is intentional.** It tells readers (and linters) that you started work on purpose without awaiting it.
- **Preloading can waste work.** If the page ends up not rendering `<Item>`, the request already ran. Only preload what you'll very likely use.
- **Read the waterfall in the logs.** With `logging.fetches` on, the timings in the terminal show which fetches overlap.

## Pitfalls

| Mistake | Symptom |
| --- | --- |
| Independent `await`s one after another | Page time is the sum of all requests |
| `Promise.all` with a flaky request | One failure takes down the whole section. Use `allSettled` or `Result` |
| `Promise.all` for unrelated sections | Fast content waits for the slowest request |
| Preload without deduplication | The request runs twice (once from preload, once in the component) |
| Parent awaits, then renders a child that fetches | Hidden waterfall across components |

## Where it's used

- **Dashboards:** one async component per card, each in its own Suspense boundary.
- **Product pages:** product details first (often cached), then reviews and recommendations streamed in parallel.
- **Pages behind a check:** preload the main data while an availability, feature-flag or permission check runs.

## Source docs

- `node_modules/next/dist/docs/01-app/01-getting-started/06-fetching-data.md` (sections "Sequential data fetching", "Parallel data fetching", "Preloading data")
- `node_modules/next/dist/docs/01-app/02-guides/streaming.md` (section "Parallel streaming with sibling boundaries")
