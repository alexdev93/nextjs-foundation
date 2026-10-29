# Lesson 3 — Serialization: What Can Cross the Boundary

## The problem

A Server Component and a Client Component look like any parent and child in JSX:

```tsx
<LikeButton post={post} onLike={handleLike} />
```

But they don't share memory. The server finishes rendering, **serializes** the props into the RSC Payload, and sends them over the network. The browser **deserializes** them and gives them to `LikeButton`. So the question "can I pass this prop?" really means "can React write this value to a stream and rebuild it on the other side?"

If you don't know the rules, you hit one of three problems:

1. A **runtime error** for functions and class instances.
2. **Silent data loss**, where methods or prototypes disappear.
3. **Data leaks**, where everything you pass is readable in the page source, including fields you didn't mean to send.

## How it works

### The two rules

- **Code** crosses through **imports**. Whatever a Client Component imports ships to the client bundle.
- **Data** crosses through **props**. It must be serializable by React.

### What can cross (Server → Client props)

| Type | Notes |
| --- | --- |
| `string`, `number`, `boolean`, `null`, `undefined`, `bigint` | Includes `NaN`, `Infinity`, `-0` |
| Plain objects and arrays | Object literals whose values are themselves serializable |
| `Date` | Arrives as a real `Date`, not a string |
| `Map`, `Set` | Contents must be serializable |
| Typed arrays, `ArrayBuffer` | Useful for binary data |
| `FormData` | |
| Symbols from `Symbol.for(...)` | Globally registered symbols only |
| **`Promise`** of any of the above | Streams. The client reads it with `use()` (Lesson 4) |
| **JSX / React elements** | Including rendered Server Components. This is what makes `children` work |
| **Server Functions** (`'use server'`) | Cross as a **reference** the client can call over the network |
| Client Component references | E.g. passing a client component **as an element** |

### What cannot cross

| Type | What happens |
| --- | --- |
| Ordinary functions (event handlers, callbacks, render props) | Error: `Functions cannot be passed directly to Client Components unless you explicitly expose it by marking it with "use server"` |
| `onClick={...}` from a Server Component to a Client Component | Error: `Event handlers cannot be passed to Client Component props.` |
| Class instances (`new URL()`, a Prisma `Decimal`, a Mongoose document, your own `class User`) | Error: `Only plain objects, and a few built-ins, can be passed to Client Components from Server Components. Classes or null prototypes are not supported.` |
| `Object.create(null)` objects | Same error (null prototype) |
| Objects with symbol keys | Error about symbol properties |
| Local symbols (`Symbol('x')`) | Not supported |

The same rules apply to **Server Function arguments and return values** in the other direction (client → server). The error text says "passed to Server Functions" instead.

### Functions: the one exception is Server Functions

```tsx
// src/app/examples/client/page.tsx (this repo)
import { submitContact } from './actions'   // actions.ts starts with 'use server'

<ContactForm action={submitContact} />      // ✅ crosses as a reference
```

`submitContact` doesn't ship to the browser. The client receives an **ID**. Calling it sends a POST request to the server, which runs the real function. That makes every Server Function a **public endpoint**: anyone can call it with any arguments. Validate input and check auth inside it (Phase 05 and Phase 08). [contact-service.ts](../../src/server/services/contact-service.ts) validates with Zod again even though the form already did.

**TypeScript can't tell** a Server Function from a plain function by its type. The Next.js TypeScript plugin uses the **prop name**: a function prop is allowed when it's named `action` or ends in `Action` (`submitAction`, `deleteAction`). Other function props on a Client Component get a warning. That's one reason `ContactForm` names its prop `action`.

### Serialization is also exposure

**Every prop you pass to a Client Component ends up in the HTML and the RSC Payload.** A user can read it with View Source or the Network tab, even if your component never renders it.

```tsx
// ❌ Sends passwordHash, email, internal flags... to the browser
const user = await db.user.findUnique({ where: { id } })
return <ProfileCard user={user} />

// ✅ Send only what the UI needs (a DTO)
return <ProfileCard user={{ name: user.name, avatarUrl: user.avatarUrl }} />
```

This repo does this already. [post-service.ts](../../src/server/services/post-service.ts) maps the raw API response to a `PostSummary` with only `id`, `title` and `excerpt`. Do that mapping in your server **service layer**, not in each page.

An extra safety net is **React Taint**. With `experimental.taint: true` in `next.config.ts`, you can mark an object or a value so React refuses to serialize it to the client:

```ts
import { experimental_taintObjectReference, experimental_taintUniqueValue } from 'react'

experimental_taintObjectReference('Do not pass the raw user row to the client', userRow)
experimental_taintUniqueValue('Do not pass the API key to the client', process, process.env.API_KEY!)
```

Taint is a backup, not a replacement for DTOs. It only catches the exact object or value you tainted. A copy (`{ ...userRow }`) isn't tainted.

## Examples

### Example 1 — Read every error once

Create `src/app/examples/boundary/props/` with a Client Component that accepts `value: unknown` and renders `String(value)`. From the server page, try each of these one at a time and copy the error into `notes.md`:

```tsx
<Show value={() => 1} />                    // function
<Show value={new URL('https://x.dev')} />    // class instance
<Show value={Object.create(null)} />         // null prototype
<Show value={{ [Symbol('k')]: 1 }} />        // symbol key
<Show value={new Map([['a', new Date()]])} /> // ✅ works. Check the type in the browser
```

### Example 2 — Convert at the edge

```ts
// ❌ Prisma Decimal / class instance
<Price amount={product.price} />

// ✅ Convert to a primitive in the service layer
export type ProductDTO = { id: string; name: string; priceCents: number; createdAt: Date }
export function toProductDTO(p: ProductRow): ProductDTO {
  return { id: p.id, name: p.name, priceCents: p.price.mul(100).toNumber(), createdAt: p.createdAt }
}
```

### Example 3 — Replace a render prop

Render props are functions, so they can't cross:

```tsx
// ❌ <List renderItem={(item) => <Row item={item} />} />   (from a Server Component)
```

Two fixes:

- Render the items on the server and pass **elements**: `<List items={items.map((i) => <Row key={i.id} item={i} />)} />`.
- Or move the render function into the Client Component file, and pass only data.

## Tips & tricks

- **`Date` survives, but timezone formatting is still a hydration trap.** The value is the same on both sides, but `toLocaleDateString()` can give different text on the server and in the browser (Lesson 7).
- **Big props cost twice.** They're in the HTML (as the serialized payload) and parsed in the browser. Passing a 2 MB array to a Client Component that shows 10 rows wastes both. Slice on the server.
- **Zod schemas are class instances.** Don't pass a schema as a prop. Import it in both places from [src/shared/schemas/](../../src/shared/schemas/), like `contact.ts` in this repo.
- **`JSON.parse(JSON.stringify(x))` is not the fix.** It turns `Date` into a string and drops `undefined`, `Map` and `Set`. Map fields to plain values explicitly.

## Pitfalls

| Mistake | Symptom |
| --- | --- |
| Passing an ORM row straight to a Client Component | Error for class instances, or a leak of every column if it happens to be plain |
| `onClick` from a Server Component | `Event handlers cannot be passed to Client Component props.` |
| Expecting methods on a received object (`user.fullName()`) | Error at the boundary. Compute `fullName` on the server and pass a string |
| Naming a Server Function prop `onSubmit` | Works at runtime, but the TS plugin warns. Prefer `action` / `...Action` |
| Treating Server Functions as private | They're public POST endpoints. Validate and authorize inside every one |

## Where it's used

- **Service layer returning DTOs:** every function in `src/server/services/` returns a plain, minimal shape. Pages pass it on without thinking about it.
- **Forms:** a Server Function passed as `action`, called from a client form with `useActionState` (this repo's `ContactForm`).
- **Streaming:** passing a `Promise` instead of awaited data so a Client Component can suspend (next lesson).

## Source docs

- `node_modules/next/dist/docs/01-app/02-guides/server-and-client-boundary.md` (section "Crossing the boundary")
- `node_modules/next/dist/docs/01-app/02-guides/data-security.md` (sections "Passing data from server to client" and "Tainting")
- `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/taint.md`
- React docs: "Serializable types" (react.dev/reference/rsc/use-client#serializable-types)
