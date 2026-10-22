# Breakfeast: Developer Guide

Baseline rules for structure, reuse, and conventions. Follow these unless there's a clear reason to deviate.

This guide does two jobs:

1. **Rules.** Sections 1 to 25 describe how code in this repo should be written. New code follows them; changed code is brought in line while you're in the file.
2. **Audit backlog.** Section 26 lists every known place the current code breaks these rules, with file, priority and a fix.

When this guide and the code disagree, the guide describes the target and section 26 should list the gap. If it doesn't, add it.

---

## 0. What Breakfeast is, and where the truth lives

Breakfeast is a phone-first breakfast companion for a 15-breakfast trial (`plan15.md`). Each morning (or the night before) it suggests what to make, walks you through a **kitchen check** of the ingredients, sends anything missing to a **shopping cart** (or a **batch-cook list** for cooked-ahead components), handles overnight prep, and asks for a 1 to 5 rating afterward. Ratings feed a ranking and a **patterns** page that helps pick the seven breakfasts worth keeping. Every recipe shows USDA-based nutrition and sourced, claim-free insights.

There is no self sign-up. An admin creates every user in `/theadmin`; users sign in at `/login` with a US mobile number and a short password the admin reads to them.

The parts that make Breakfeast *Breakfeast* (and where most bugs hide):

| Subsystem | Lives in | Why it's delicate |
|---|---|---|
| Today flow | `components/breakfast-flow.tsx` | A 12-step client state machine; owns optimistic stock, plan and cart state after the first load |
| Recipe catalog | `lib/recipes.ts` | Recipe ids (numbers) and ingredient ids (strings) are stored in MongoDB. Renaming one orphans data |
| Nutrition | `lib/nutrition.ts`, `lib/nutrition-data.ts`, `scripts/extract-usda.py` | Generated USDA data, hand-checked gram weights, insight copy with legal constraints |
| Patterns and ranking | `lib/patterns.ts`, `rankRecipes` / `preferenceScore` in `lib/recipes.ts` | Thresholds decide what counts as a real preference versus noise |
| Auth and sessions | `lib/auth/*` | Hashed opaque tokens, `authVersion` revocation, rate limits, CSRF, timed resume |
| Admin panel | `app/theadmin`, `components/admin`, `lib/admin`, `app/api/admin` | Audit trail on every write, recent-auth gate for password resets |
| Households | `lib/households.ts`, `lib/household-data.ts`, `app/household-actions.ts`, `lib/admin/households.ts` | Merging and copying a household's data inside a transaction |
| Monitoring | `lib/monitoring/*`, `components/activity/*`, `lib/admin/monitoring.ts` | Untrusted device payloads, sharing flags, an activity log that must never hold what people typed |

### Source-of-truth documents

| Document | Owns | Rule |
|---|---|---|
| `plan15.md` | The 15 recipes, exclusions (no egg, beetroot, coconut, banana, fish, beef, pork), rating method | `lib/recipes.ts` must match it. A recipe change updates both |
| `docs/nutrition-methodology.md` | How nutrition numbers and insight copy are produced | Any change to `PORTION_GRAMS`, `RULES`, Daily Values or the USDA mapping updates it |
| `docs/business-events.md` | Every business event name and what its data holds | A new or renamed `userAction` event updates it |
| `admin-panel-instructions.md` | The reusable spec the admin panel, auth and monitoring were built from | Read it before changing auth, sessions, the admin API or monitoring |
| `README.md` | Setup, accounts, admin CLI, deploy | Keep the CLI table and env list in sync |
| `.env.example` | Every environment variable | A new variable is added here in the same PR |
| `.cursor/rules/no-em-dashes.mdc` | No em dash character anywhere | Applies to code, copy, docs and commit messages. Enforced for insight copy by a test |
| `AGENTS.md` | Written by `next dev` (Next.js agent rules) | Don't edit; commit it so the tree stays clean |
| **This guide** | Code conventions and the audit backlog | Wins over habit and over other projects' guides |

---

## 1. Tech stack

| Layer | Technology | Version | Notes |
|---|---|---|---|
| Framework | Next.js (App Router, Turbopack) | 16.4 | `cacheComponents`, `partialPrefetching`, `experimental.agentFeedback` |
| UI runtime | React | 19.3 | Server Components first |
| Language | TypeScript (`strict`) | 5 | Path alias `@/*` to the repo root |
| Database | MongoDB **native driver** | 7 | No ODM. Document types in `lib/schema.ts` |
| Validation | zod | 4 | Admin API (`parse`), Server Actions (`parseInput`), activity ingest |
| Auth | Own implementation: opaque session tokens (SHA-256 hashed in Mongo) + bcryptjs | bcryptjs 3 | No auth library. Separate user and admin sessions |
| Styling | Tailwind CSS via `@tailwindcss/turbopack` loader | 4 | Tokens in `app/globals.css` |
| Components | shadcn/ui, style `base-nova` (on `@base-ui/react`) | | `components/ui/` |
| Class merging | `cn` package, re-exported from `@/lib/utils` | 0.5 | |
| Icons / toasts | lucide-react, sonner | | |
| User agent parsing | ua-parser-js | 1 | Session and device labels |
| IP geolocation | ip-api (default) or ipinfo, over `fetch` | | `lib/monitoring/geo.ts`; no SDK |
| Tests | Vitest | 4 | `lib/**/*.test.ts` only (see section 24) |
| Scripts | tsx (admin CLI), Python 3 (USDA extraction, run by hand) | | |
| Hosting | Netlify or any Node host | | MongoDB Atlas free tier is enough |

**Stack rules**

- No new runtime dependency without a reason in the PR description. Prefer what's here: zod over a second validator, the native driver over an ODM, the existing auth over an auth library.
- The admin panel deliberately does **not** use Tailwind or shadcn. It uses plain CSS in `app/theadmin/admin.css` and raw `@base-ui/react` primitives so it can be lifted into other projects (it was built from `admin-panel-instructions.md`). Don't mix the two systems.
- There is no `next-themes` provider. `components/ui/sonner.tsx` calls `useTheme()` but every `<Toaster>` passes `theme="light"`. Keep passing it.

---

## 2. Project structure

```
breakfeast/
├── app/
│   ├── layout.tsx                 # Root: Geist fonts, metadata, viewport (safe areas, theme color)
│   ├── globals.css                # Tailwind v4 + shadcn tokens (warm palette)
│   ├── not-found.tsx              # App-styled 404
│   ├── actions.ts                 # "use server": every user-app mutation (pantry, cart, plan, history, ratings, logout)
│   ├── household-actions.ts       # "use server": invite, respond, cancel, leave
│   ├── (app)/                     # The phone app: max-w-md column + BottomNav + ActivityProvider + Toaster
│   │   ├── layout.tsx, error.tsx
│   │   ├── page.tsx               # Today: <BreakfastFlow>, accepts ?recipe=&mode=now|tonight
│   │   ├── recipes/page.tsx       # Library
│   │   ├── recipes/[id]/page.tsx  # Detail: ratings, insights, nutrition, prep, ingredients, steps
│   │   ├── insights/page.tsx      # Patterns from ratings
│   │   ├── plan/page.tsx          # Plan 3 to 5 breakfasts ahead
│   │   ├── cart/page.tsx          # Shopping and batch-cook list
│   │   ├── pantry/page.tsx        # Stock toggles, household section, sign out
│   │   └── login/                 # page.tsx + login-form.tsx (client). BottomNav hides itself here
│   ├── theadmin/                  # Admin panel (own CSS, no Tailwind)
│   │   ├── layout.tsx, error.tsx, admin.css, gate.tsx (AdminGate server guard + AdminLoading)
│   │   ├── page.tsx               # Sign-in when signed out, overview when signed in
│   │   ├── users/page.tsx, users/new/page.tsx, users/[id]/page.tsx
│   │   ├── activity/page.tsx      # Live activity (polls the feed)
│   │   ├── alerts/page.tsx        # Flagged access events
│   │   └── audit/page.tsx
│   └── api/
│       ├── auth/{login,logout,me,app-open}/     # User sign-in (JSON); app-open records an access event
│       ├── activity/                            # POST batched activity events (user session)
│       └── admin/
│           ├── auth/{login,logout,me,reauth,change-password}/
│           ├── overview/, audit/, feed/, alerts/
│           └── users/                           # GET list, POST create
│               └── [id]/                        # GET, PATCH
│                   ├── password/                # POST reset (needs recent auth)
│                   ├── pause/, resume/, deactivate/, activate/   # one-line stateRoute(kind)
│                   ├── sessions/, sessions/[sessionId]/          # list, revoke all, revoke one
│                   ├── household/, household/{remove,move}/
│                   ├── devices/, access/, activity/              # monitoring histories
│                   └── audit/
├── components/
│   ├── ui/                        # shadcn primitives (base-nova)
│   ├── admin/                     # Admin client: api.ts (adminFetch, useAdminQuery, useCursorList), shell, ui, pages
│   ├── activity/                  # Browser monitoring: logger, auto-capture, device + GPS, toast wrapper, provider
│   ├── breakfast-flow.tsx         # Today state machine
│   ├── plan-flow.tsx, cart-view.tsx, pantry-view.tsx, household-section.tsx
│   ├── kitchen-checklist.tsx, prep-details.tsx, rating-form.tsx
│   ├── recipe-header.tsx, recipe-library.tsx, nutrition.tsx, preference-insights.tsx
│   ├── phone-input.tsx, page-skeleton.tsx, bottom-nav.tsx
│   └── use-hour.ts                # Phone-local hour via useSyncExternalStore (null on the server)
├── lib/
│   ├── recipes.ts                 # Catalog: ingredients, aisles, recipes, traits, ranking helpers (isomorphic)
│   ├── nutrition.ts               # Nutrients, PORTION_GRAMS, totals, insight RULES (isomorphic)
│   ├── nutrition-data.ts          # GENERATED by scripts/extract-usda.py. Never hand-edit
│   ├── patterns.ts                # Preference analysis for /insights (isomorphic)
│   ├── stock.ts                   # rememberedInStock: batch items expire after keepsDays
│   ├── types.ts                   # Client-facing view types (AppState, CartItem, HistoryEntry, ...)
│   ├── phone.ts, return-path.ts, api-client.ts, utils.ts   # Isomorphic helpers
│   ├── time.ts                    # SEC, MIN, HOUR, DAY (isomorphic)
│   ├── action-result.ts           # ActionResult, unwrap(), failureMessage() (isomorphic, for callers)
│   ├── action.ts                  # server-only: userAction(), done(), fail(), parseInput()
│   ├── schema.ts                  # Every *Doc type, COLLECTIONS, indexSpecs(), createIndexes()
│   ├── db.ts                      # server-only: Mongo client, collections(), withTransaction(), isDuplicateKey, isStorageError
│   ├── data.ts                    # server-only: getAppState(), getHistory() for user pages
│   ├── households.ts, household-data.ts                    # server-only
│   ├── api/http.ts, api/cursor.ts # server-only: route() wrapper, ok/json/noContent, parse(), objectId(), keyset cursors
│   ├── auth/                      # config, errors, guards, sessions, login, passwords, rate-limit,
│   │                              #   request (IP, CSRF), identifiers, account-state, audit, user-session
│   ├── admin/                     # server-only: users.ts (user ops), households.ts, monitoring.ts (devices, access,
│   │                              #   activity, feed, alerts), auth.ts, serialize.ts, state-route.ts
│   └── monitoring/
│       ├── ua.ts, labels.ts, payload.ts, redact.ts, trace.ts   # Isomorphic: UA labels, admin labels, device payload clamp
│       └── access.ts, flags.ts, geo.ts, activity.ts, device-cookie.ts   # server-only: record access, sharing flags,
│                                                                        #   IP geolocation, activity ingest, bf_device cookie
├── scripts/
│   ├── admin-cli.ts               # db:init, db:reset-app-data, admin:create|reset-password|list|disable|enable
│   └── extract-usda.py            # USDA FoodData Central CSV to lib/nutrition-data.ts
├── docs/nutrition-methodology.md, docs/business-events.md
└── plan15.md, admin-panel-instructions.md, README.md, AGENTS.md, .env.example
```

### Layering rules (import direction)

| Layer | May import | Must not import |
|---|---|---|
| `components/ui/*` | `cn`, `@base-ui/react`, other `ui/*` | Anything domain |
| `components/*` (user app) | `ui/*`, `activity/*`, isomorphic `lib/*`, `@/app/actions`, `@/app/household-actions`, `lib/*` **types** | `lib/db`, `lib/data`, `lib/auth/*` values, anything `server-only`, `toast` from `sonner` (lint error; use `@/components/activity/toast`) |
| `components/activity/*` | Isomorphic `lib/monitoring/*`, `lib/time`, `sonner` (in `toast.ts` only) | React state outside `activity-provider.tsx`, anything `server-only` |
| `components/admin/*` | `lib/api-client`, `@base-ui/react`, `sonner`, isomorphic `lib/{monitoring/labels,phone,time,return-path}`, `lib/admin/*` and `lib/schema` **types** (`import type` only), its own files | `components/ui/*`, `components/activity/*` (the admin isn't monitored), Tailwind classes, Server Actions |
| `app/(app)/**/page.tsx` | `lib/data`, `lib/household-data`, components | Raw collection queries |
| `app/actions.ts`, `app/household-actions.ts` | `lib/action`, `lib/db`, `lib/recipes`, `lib/households` | React, components |
| `app/api/**/route.ts` | `lib/api/http`, `lib/admin/*`, `lib/auth/*` | Business logic inline (route files are 3 to 15 lines; keep it that way) |
| Isomorphic `lib/*` (`recipes`, `nutrition`, `patterns`, `stock`, `phone`, `types`, `time`, `action-result`, `monitoring/{ua,labels,payload,redact,trace}`) | Each other, `lib/schema` **types** | `lib/db`, `lib/auth/*`, `server-only`, React |
| `lib/schema.ts` | `mongodb` **types**, `lib/auth/config` | `lib/db` (the CLI imports schema without the app's client) |

**Grouping philosophy.** Group by domain. A route's private client component sits next to its `page.tsx` (`login/login-form.tsx`). When a second route needs it, move it to `components/`. Shared user-app components live flat in `components/`; the admin panel lives in `components/admin/`.

**Keep the tree above current.** A new route, top-level `lib` module or API endpoint updates this tree in the same PR.

---

## 3. Architecture and data flow

The app has two surfaces with two different data patterns. Don't blend them.

| | User app (`app/(app)`) | Admin panel (`app/theadmin`) |
|---|---|---|
| Reads | Server: Suspense loader calls `getAppState()` and passes a serializable `AppState` to a client component | Client: `useAdminQuery("/api/admin/...")` after the server `AdminGate` check |
| Writes | **Server Actions** in `app/actions.ts` called from client components | **Route handlers** in `app/api/admin/*` called with `adminFetch` |
| Auth guard | `requireUserPage()` (pages), `requireUserAction()` (actions) | `requireAdminPage()` in `AdminGate`, `requireAdmin(ctx)` in routes |
| Styling | Tailwind + shadcn | `admin.css` |

### Reads (user app)

```
Browser ─► page.tsx (static shell) ─► <Suspense fallback={<PageSkeleton/>}> ─► async Loader()
                                        ├─ getAppState()      lib/data.ts  (requireUserPage inside)
                                        ├─ getHistory()       lib/data.ts
                                        └─ props ─► "use client" view (BreakfastFlow, CartView, ...)
```

`getAppState()` loads the household's pantry, cart and plan, the household's history aggregated per recipe, and the **signed-in user's** ratings aggregated per recipe, in one `Promise.all`. It returns ISO strings and plain numbers only, plus `loadedAt` (a server timestamp the client uses for stock expiry so it never calls `Date.now()` during render).

### Writes (user app)

```
Client view ── optimistic setState ──► await unwrap(action(args)) ──► userAction(event, data, fn)
     ▲                                        │                          ├─ requireUserAction() (may redirect)
     │                                        │                          ├─ fn: parseInput(zod) ─► Mongo ─► done() / fail()
     │                                        │                          └─ after(): business event to activity_events
     └─ on throw or { ok: false }: roll back + toast.error(failureMessage(err))
```

User actions don't revalidate or refresh: after the first load, the client view owns its state. Navigating to another tab re-runs that page's loader and picks up the latest data. Household actions are the exception: they change *which* household you see, so they call `refresh()` from `next/cache`.

### Writes (admin)

```
components/admin/* ─► adminFetch(path, { body }) ─► route(handler) ─► requireAdmin(ctx) ─► lib/admin/users.ts ─► writeAudit()
                                                       │ CSRF + JSON + size checks          │
                                                       └─ errorResponse(ApiError) ◄──────────┘
```

---

## 4. Next.js 16 rules

This is not the Next.js in most training data. **Before using a Next API you haven't used in this repo, read the matching guide in `node_modules/next/dist/docs/`.**

- **`cacheComponents: true`.** Anything dynamic (cookies, headers, `searchParams`, DB reads) renders inside a `<Suspense>` boundary. Every page follows the shell plus loader pattern:

  ```tsx
  export default function PlanPage() {
    return (
      <Suspense fallback={<PageSkeleton />}>
        <Plan />
      </Suspense>
    );
  }

  async function Plan() {
    const state = await getAppState();
    return <PlanFlow initial={state} />;
  }
  ```

- **`io()` before randomness.** `requestContext()` mints a random request id. Under `cacheComponents` that is only allowed after `await io()` (from `next/cache`), which is why `currentContext()` in `lib/auth/guards.ts` calls it. Any new server code that calls `randomUUID()`, `Math.random()` or `Date.now()` during render must do the same, or move the call into a client component or an action.
- **Use the generated global types** `PageProps<"/route">` and `LayoutProps<"/route">`. Don't hand-write `{ params: { id: string } }`.
- **`params` and `searchParams` are Promises.** Await them inside the Suspense'd loader, not in the page shell. Pass the promise down (`<Today searchParams={searchParams} />`).
- **`generateStaticParams`** on `/recipes/[id]` lists the 15 recipe ids. Validate the id anyway (`/^\d+$/` and `RECIPE_BY_ID`) and call `notFound()`.
- **No `proxy.ts` and no `middleware.ts`.** Every protected page and action checks the session itself. If you add a `proxy.ts` for routing, it can only look at the cookie; never treat it as the auth check.
- **`useSearchParams()` in a client component needs a `<Suspense>` parent** (the login form and `BottomNav` both have one).
- **Client-only values** such as the phone's local hour come from `useSyncExternalStore` with a `null` server snapshot (`useHour`). Render a neutral fallback ("Hello") for `null`; never branch on `typeof window`.

---

## 5. Server Actions (user app)

### When

Every mutation the phone app makes: kitchen checks, stock toggles, cart changes, planning tomorrow, marking a breakfast made, rating it, household changes, sign out. The user app has no JSON API beyond sign-in.

### Shape

1. `"use server"` at the top of the file. Breakfast data actions live in `app/actions.ts`; household actions in `app/household-actions.ts`. A new domain gets its own `app/<domain>-actions.ts`. A `"use server"` file may only export async functions: keep constants unexported.
2. **Wrap the body in `userAction(event, data, fn)`** from `lib/action.ts`. It runs `requireUserAction()` (same-origin check and session, redirecting to `/login?reason=...` if the session ended), then `fn({ user, session, ctx })`, and records the business event afterwards. `event` is a `[success, failure]` pair listed in `docs/business-events.md`; `data` is ids and counts only.
3. **Validate every argument with zod through `parseInput(schema, input)`.** A Server Action is a public POST endpoint. Catalog ids use `z.custom<number>(isRecipe)` and `z.custom<string>(isIngredient)`; kitchen-check lists drop unknown ids instead of failing. `ObjectId` strings are checked with `ObjectId.isValid`. Scores are integers 1 to 5. Notes are trimmed and capped at 500 characters.
4. **Scope every query by `user.householdId`** (or `user._id` for ratings). Never trust a household id from the client.
5. **Upserts, not read-then-write,** for single-document state: `updateOne(filter, { $set | $setOnInsert | $addToSet }, { upsert: true })`. The unique indexes on `(householdId, ingredientId)` make that safe under double taps.
6. **Batch, don't loop.** Server Actions from one client run one at a time, so N calls are N round trips. `addManyToCart(ids, recipeIds)` and `recordPlanCheck({ have, missing, recipeIds })` (one kitchen check for several planned recipes; each missing item is tagged with the recipes that use it) exist for that.

### Result shape

```ts
// lib/action-result.ts (isomorphic, so client components can import it)
export type ActionResult<T = null> = { ok: true; data: T; message?: string } | { ok: false; error: string };
```

Return `done(data, message?)` or `fail(message)`. Expected failures deeper in `lib/` throw `ApiError`; `userAction` turns it (and `parseInput`'s `VALIDATION_FAILED`) into `{ ok: false, error: message }`. A storage outage becomes `STORAGE_MESSAGE`; anything else is logged with the request id and becomes "Something went wrong. Try again."

Callers keep their optimistic `try/catch` and unwrap inside it, so a failed action and a dropped connection take the same path. Use `unwrapDone()` instead when the action's success `message` should be shown (the household actions):

```ts
try {
  const historyId = await unwrap(markMade(recipeId));
} catch (err) {
  toast.error(failureMessage(err)); // the action's message, or "Couldn't save. Check your connection."
}
```

### Redirects

`redirect()` throws. Only `logout` uses it. Never call it inside a `try` block whose `catch` would swallow it. `requireUserAction()` redirects on its own, which is why `userAction` calls it **outside** its `try`.

---

## 6. Route handlers (sign-in and admin API)

### When

- User sign-in, sign-out and `me` (`app/api/auth/*`): the login form needs field errors and `Retry-After`.
- Browser monitoring (`/api/auth/app-open`, `/api/activity`): sent with `fetch` (and `keepalive` on page hide), which a Server Action can't do.
- The whole admin panel (`app/api/admin/*`).

### The `route()` wrapper

Every handler is wrapped in `route()` from `lib/api/http.ts`. It:

- builds a `RequestContext` (request id, trusted client IP, user agent, background-poll flag);
- runs `assertSameOrigin` on POST, PUT, PATCH and DELETE;
- requires `Content-Type: application/json` and caps the body (64 KB by default) before parsing;
- rejects bodies that aren't a JSON object;
- awaits `params`;
- maps any thrown error through `errorResponse()`: `ApiError` to its status and body, Mongo connection errors to 503, duplicate keys to 409, anything else to a 500 with the request id logged and shown.

A handler is a few lines. Logic lives in `lib/admin/*` or `lib/auth/*`:

```ts
// app/api/admin/users/[id]/route.ts
type Params = { id: string };

export const PATCH = route<Params>(async ({ ctx, params, body }) => {
  const auth = await requireAdmin(ctx);
  return ok(await updateUser(objectId(params.id, "That user"), body, auth));
});
```

State transitions share one factory: `export const POST = stateRoute("pause");`.

### Rules

- **Responses:** success is `{ data: ... }` via `ok()`, or 204 via `noContent()`. Paginated lists return `{ data, nextCursor }` (or `{ data, page, pageSize, total }` for the users table) via `json()`. Every response has `Cache-Control: no-store`.
- **Errors** are always `{ error: { code, message, fields?, reason? } }`. `code` is an `ErrorCode` from `lib/auth/errors.ts`; `message` is a sentence a person can read; `fields` maps input names to messages for inline errors.
- **Validate with `parse(schema, input)`**, which throws a `VALIDATION_FAILED` `ApiError` with per-field messages. Ids go through `objectId(value, "That user")`, which answers 404 (not 400) for malformed ids so probing looks the same as not found.
- **Status codes** come from `ErrorCode`, never hard-coded:

  | Code | Status | Use |
  |---|---|---|
  | `VALIDATION_FAILED` | 400 | Bad input; include `fields` |
  | `UNAUTHENTICATED`, `SESSION_ENDED`, `INVALID_CREDENTIALS` | 401 | `SESSION_ENDED` carries `reason` |
  | `ACCOUNT_PAUSED`, `ACCOUNT_DISABLED`, `REAUTH_REQUIRED`, `CSRF_REJECTED`, `FORBIDDEN` | 403 | |
  | `NOT_FOUND` | 404 | Not found and malformed id look the same |
  | `CONFLICT`, `INVALID_TRANSITION` | 409 | Stale `expectedUpdatedAt`, duplicate login id, wrong status |
  | `PAYLOAD_TOO_LARGE` | 413 | From `route()` |
  | `RATE_LIMITED` | 429 | Sets `Retry-After` |
  | `STORAGE_UNAVAILABLE` | 503 | Mongo unreachable |
  | `INTERNAL` | 500 | From `errorResponse()` only |

- **Optimistic concurrency** on admin edits: the client sends `expectedUpdatedAt`; `updateUser` filters on it and answers 409 if someone else saved first.
- **Every admin write calls `writeAudit()`** and awaits it before responding, so the record exists whenever the change does. Use dotted action names (`user.paused`, `session.revoked_all`, `admin.reauth`). Never put secrets or note contents in `changes` (notes are logged as `"(hidden)"`).
- **Sensitive admin operations require recent auth:** call `assertReauth(auth.session)` (5 minute window after `/api/admin/auth/reauth`). Password resets and the admin's own password change already do. The client handles `REAUTH_REQUIRED` through `ReauthProvider` in `components/admin/reauth.tsx`.

---

## 7. Auth, sessions and account state

All of this was built to `admin-panel-instructions.md`. Read section 7 and 8 of that file before changing it.

### Guards

| Guard | Where | On failure |
|---|---|---|
| `requireUserPage()` | User page loaders and `lib/data.ts` | Redirects to `/login?reason=...`. Wrapped in React `cache()` so a layout and page share one lookup |
| `requireUserAction()` | Every user Server Action | Same-origin check, then same redirect |
| `requireUser(ctx)` | User route handlers | Throws `ApiError` (401) |
| `requireAdminPage(next)` | `AdminGate` | Redirects to `/theadmin?reason=...&next=...` |
| `getAdminPage()` | `/theadmin` (sign-in or overview) | Returns `null` |
| `requireAdmin(ctx)` | Every admin route handler | Throws `ApiError` |

`lib/data.ts` functions call `requireUserPage()` themselves, so they may only run while rendering a page. Don't call them from actions or routes.

### Sessions

- The cookie holds a random 32-byte token; Mongo stores only its SHA-256 (`tokenHash`). Cookies are `httpOnly`, `sameSite: "lax"`, `secure` in production, named `${COOKIE_PREFIX}_session` and `${COOKIE_PREFIX}_admin`.
- Users and admins have separate collections (`user_sessions`, `admin_sessions`) and lifetimes: users 30 days idle and 90 days absolute; admins 30 minutes idle and 12 hours absolute. All overridable by env.
- **`authVersion` is the real revocation switch.** A session is valid only if its `authVersion` equals the principal's. Password resets, pause, deactivate and "sign out everywhere" `$inc` it. `markAllRevoked` stamps `revokedAt` for display; don't rely on it for enforcement.
- `lastSeenAt` and the idle expiry are bumped at most every 5 minutes, and never for requests with `x-background-poll: 1`.
- Expired sessions are removed by a TTL index on `expiresAt`.

### Sign-in

- **Login IDs are US mobile numbers**, normalized to E.164 (`+15551234567`) by `normalizeLoginId` and displayed as `(555) 123-4567`. `lib/phone.ts` is shared by the client input and the server.
- Unknown users still run a bcrypt compare (`dummyVerify`) so timing doesn't reveal which numbers have accounts. Keep that in every credential check.
- **Rate limits** (`lib/auth/rate-limit.ts`) are checked before any password work: 5 failures per login id per 15 minutes, 30 per day, and 20 per IP per 15 minutes. Failures are rows in `auth_attempts` with a 24 hour TTL. A success clears the short window; an admin password reset clears everything for that user.
- **User passwords are 4 to 6 characters** (generated ones are exactly 6, from an alphabet without look-alikes) so an admin can read them over the phone. They are only acceptable because of the rate limits. Never relax the limits without lengthening passwords. Admin passwords are 6 to 72 bytes.
- Users can't change their own password. Only an admin can reset it, which signs the user out everywhere.

### Trusted client IP

`clientIp()` reads exactly one configured source (`CLIENT_IP_SOURCE`) and, for `x-forwarded-for`, counts `TRUSTED_PROXY_HOPS` from the right. Never read the leftmost `X-Forwarded-For` entry: the client controls it. On Netlify use `x-nf-client-connection-ip`.

### CSRF

`assertSameOrigin` accepts a request only if `Origin` is in `APP_ORIGIN` / `APP_ALLOWED_ORIGINS`, or, when `Origin` is missing, `Sec-Fetch-Site: same-origin`. `route()` runs it for every mutating method; `requireUserAction()` runs it for every Server Action. `APP_ORIGIN` is required in production; a wrong value blocks every write.

### Account state

Users are `active`, `paused` (optionally until a time) or `disabled` (deactivated). Transitions are a table in `lib/admin/users.ts` (`TRANSITIONS`) and are applied with a conditional `findOneAndUpdate` that includes the allowed `from` states. A timed pause ends lazily: `applyTimedResume` runs on every authentication and on admin lists, filters on the exact `pausedUntil` it read (so a later change is never overwritten) and writes a `user.resumed_automatically` audit row.

### Redirect targets

Any `next=` value goes through `safeReturnPath()` (`lib/return-path.ts`). It accepts only same-site absolute paths. Never `window.location = params.get("next")` directly.

### Monitoring

Built to section 11 of `admin-panel-instructions.md`; read it before changing a flag rule or what's logged. Users are told on the sign-in page that device, location and activity are monitored.

- **Access events** (`access_events`): sign-in success and failure, sign-out, app open, admin session revocation. `recordAccess()` in `lib/monitoring/access.ts` computes the flags *before* inserting, then upserts the `devices` row. It always runs inside `after()` so geolocation never slows the response, and it never throws.
- **Device identity:** an HttpOnly `bf_device` UUID cookie (400 days, `ensureDeviceId()`), plus a SHA-256 fingerprint of stable browser attributes. The browser payload (`components/activity/device.ts`) is untrusted: `sanitizeDevice()` clamps every field and never throws.
- **Location:** a GPS fix requested on the login page and on each app open (low accuracy, 10 second cap, 5 minute cache), and IP geolocation from `lib/monitoring/geo.ts` (cached 24 h, rate-budgeted, 3 s timeout, private IPs skipped). Flags compare like with like: GPS to GPS when both have it, otherwise IP to IP.
- **Flags** (`lib/monitoring/flags.ts`) are signals of possible sharing, shown with "possible sharing" wording, never as proof. Thresholds live in `authConfig.sharing`. There are no alert emails: alerts appear on the Alerts page and as the sidebar badge.
- **Activity** (`activity_events`): `ActivityProvider` in `app/(app)/layout.tsx` installs auto-capture once per page load (navigation, clicks, field changes, errors, same-origin API calls), and `track()` queues events in `sessionStorage` and flushes in batches. **Never log what someone typed:** text fields record `{ edited: true }`, password and hidden fields and anything inside `[data-track-ignore]` are skipped, and emails are redacted on both sides. Identity is stamped from the session on ingest.
- **Toasts** in the user app come from `@/components/activity/toast` so each one shown is logged; ESLint rejects `toast` from `sonner` outside the admin panel.
- **Admin screens** poll: the live feed every 5 seconds and the alert badge every 30 seconds, only while the tab is visible, with `X-Background-Poll: 1` so polling doesn't keep an admin session alive.

---

## 8. Households

Every user belongs to exactly one household (`users.householdId`). **All breakfast data is scoped by household**: pantry, cart, the plan for tomorrow and history. **Ratings are per user** within a household (`ratings` is unique on `historyId + userId`), so two people can rate the same breakfast differently. `getAppState()` shows household-wide "made" counts and the signed-in user's own averages.

`createUser` gives each new user a fresh household of one.

Sharing:

- `app/household-actions.ts`: invite by mobile number, accept or decline, cancel, leave. The UI is the Household section at the top of the Pantry page.
- `lib/households.ts`: `acceptInvite` (merges the joiner's solo data into the inviting household, de-duplicating history), `leaveHousehold` (copies the household's data into a new one for the leaver, taking their own ratings), `moveToHousehold`. Each runs inside `withTransaction`.
- `lib/household-data.ts`: `getHouseholdView()` for the pantry page's household section.
- `lib/admin/households.ts`: the admin's Household tab (remove a member, move a user into another household), audited as `household.member_removed` and `household.member_moved`.

Rules for this code:

- **Every multi-collection household change runs in `withTransaction`** and passes `session` to every single operation. A missed `session` silently writes outside the transaction.
- **The membership switch is a conditional update** (`setHousehold` filters on the user's current `householdId`) and throws `CONFLICT` if it didn't match.
- **Invites are addressed to a phone number, not an account.** The reply to `inviteToHousehold` is identical whether or not the number has an account, so invites can't be used to discover who uses Breakfeast. Keep that property in any new invite copy or endpoint.
- Only a user who is on their own can accept an invite. A user in a shared household must leave first.
- Invites expire after 7 days (`authConfig.householdInviteMs`); a household can send at most 20 a day.

---

## 9. Data layer (MongoDB)

### Rules

- **Collections are reached only through `collections()` in `lib/db.ts`**, which returns typed `Collection<*Doc>` handles. No `db.collection(name)` in app code (the CLI's reset and legacy checks are the exception).
- **Every document type lives in `lib/schema.ts`** with its collection name in `COLLECTIONS` and its indexes in `indexSpecs()`. A new collection or index goes there, never ad hoc in a feature file.
- **Indexes are created lazily** once per process by `getDb()`, and by `npm run db:init`. Both call the same `createIndexes()`, so they can't drift. `db:init` is still the supported setup step because index creation on first request adds latency.
- **Queries for user pages live in `lib/data.ts`** (or `lib/<domain>-data.ts`); admin queries live in `lib/admin/users.ts`, `lib/admin/households.ts` and `lib/admin/monitoring.ts`. Pages and components never touch a collection.
- **Scope by owner in the filter itself**: `{ householdId: user.householdId, ... }`, or `{ _id, householdId }` when loading one document by id (`rateBreakfast` does this). Not found and not yours look the same.
- **`ObjectId` stays on the server.** Convert with `.toHexString()` before props or JSON; convert dates with `.toISOString()`. `lib/types.ts` holds the serialized shapes; `lib/admin/serialize.ts` does it for the admin API.
- **Bound every list.** History reads cap at 365 rows; admin lists use `authConfig.usersPage` or keyset cursors (`lib/api/cursor.ts`) on `(time desc, _id desc)`. Fetch `limit + 1`, then `paginate()`.
- **State transitions are conditional updates** with the expected current state in the filter, checked through `matchedCount` or the returned document.
- **Duplicate keys** are detected with `isDuplicateKey(error)` (`lib/db.ts`) at the call site, which maps them to a specific `CONFLICT` message (`createUser`: "That Login ID is already taken."). The generic fallback in `errorResponse` only says "That already exists."
- **Retention is TTL indexes**, not cron jobs: sessions (`expiresAt`), auth attempts (24 h), audit (365 days), activity events (`ACTIVITY_RETENTION_DAYS`).
- **Connection pool** is sized for serverless (`maxPoolSize: 5`, `minPoolSize: 0`, 30 s idle, 5 s server selection). The client and index promises are cached on `globalThis` so dev hot reload doesn't open new pools, and reset on failure so the next request retries.

### Collections

| Collection | Key | Holds |
|---|---|---|
| `users` | unique `loginIdNormalized` | Account, status, `authVersion`, `householdId` |
| `admins` | unique `adminId` | Admin account, created by the CLI only |
| `user_sessions`, `admin_sessions` | unique `tokenHash`, TTL `expiresAt` | Sessions |
| `auth_attempts` | `bucket`, TTL | Failed sign-in rows for rate limiting |
| `admin_audit` | `at`, `targetId`, TTL | Every admin and system write |
| `households` | | Household id and timestamps |
| `household_invites` | `toLoginId + status`, `householdId + status` | Pending, accepted, declined, cancelled invites |
| `pantry` | unique `householdId + ingredientId` | `inStock` and `updatedAt` per ingredient |
| `cart` | unique `householdId + ingredientId` | `kind: "buy" \| "cook"`, `forRecipes` |
| `upcoming` | unique `householdId` | The one plan for tomorrow (ignored after 36 h) |
| `history` | `householdId + madeAt` | One row per breakfast made, with `madeBy` |
| `ratings` | unique `historyId + userId` | Taste, feel, again (1 to 5), optional note |
| `access_events` | `userId + at`, partial `flags.0 + at`, TTL `expiresAt` (365 days) | Sign-in, sign-out, app open, revocation, with IP geo, GPS, device and flags |
| `devices` | unique `userId + deviceId`, `userId + fingerprint` | One row per browser a user has used; kept while the user exists |
| `activity_events` | `userId + clientAt`, `pageLoadId + seq`, TTL `receivedAt` (30 days) | Clicks, navigation, API calls, errors, toasts and business events |
| `alert_log` | `userId + flag + sentAt`, TTL | Reserved for alert-email throttling (emails are off) |

### Resetting

`npm run db:reset-app-data -- --yes` deletes pantry, cart, upcoming, history and ratings for every household and recreates their indexes. It never touches accounts. `db:init` refuses to run if it finds breakfast rows without a `householdId` (data from before accounts existed).

---

## 10. The recipe catalog

`lib/recipes.ts` is static, isomorphic domain data. It is the code form of `plan15.md`.

- **Recipe ids (1 to 15) and ingredient ids (`"rolled-oats"`, `"chicken-cooked"`) are persisted** in `pantry`, `cart`, `upcoming`, `history` and `ratings`, and keyed in `PORTION_GRAMS`, `RECIPE_TRAITS` and `nutrition-data.ts`. **Never renumber a recipe or rename an ingredient id.** Change the display `name` instead. Removing one needs a migration and a note in the PR.
- **Every ingredient has an `aisle`.** `AISLE_ORDER` drives the cart's store order; `KITCHEN_SPOT` drives the kitchen check's "where to look" order.
- **`always: true` ingredients** (water) are never checked, stocked or bought. `checkableIds()` and the action validators filter them out. Use the helpers instead of iterating `recipe.ingredients` directly.
- **`batch` ingredients** are components cooked ahead (quinoa, rice, buckwheat, sweet potato, chicken). They have a raw source, minutes, `keepsDays` and how-to text. Missing batch items become `kind: "cook"` cart rows. `rememberedInStock()` treats a batch as gone after `keepsDays`, so food-safety windows are enforced in one place.
- **Overnight recipes** tag each ingredient `when: "night" | "morning"` (default morning) and have `nightSteps`. Use `recipeItems(recipe, scope)` and `checkableIds(recipe, scope)` for scoped checks.
- **Exclusions are absolute.** No recipe may use egg, beetroot, coconut, banana, fish, beef or pork. Ingredients that commonly hide them (bread, cereal, salsa) carry a `note` telling the user to check the label. Keep those notes.
- **Traits** (`RECIPE_TRAITS`: flavor, temperature, format, protein) power the patterns page. A new recipe needs traits, `PORTION_GRAMS` and USDA mappings; the nutrition tests fail until it has them.

---

## 11. Nutrition and insights

Read `docs/nutrition-methodology.md` first. The short version:

- **`lib/nutrition-data.ts` is generated** by `scripts/extract-usda.py` from the USDA FoodData Central SR Legacy CSVs. Never hand-edit it. To change a mapping, edit the script and regenerate.
- **Gram weights are hand-maintained** in `PORTION_GRAMS` (per recipe, per ingredient) from USDA portion weights. Loose amounts ("a handful") use a typical portion and are flagged in the UI.
- **Missing data is unknown, never zero.** The UI marks the nutrient and names the ingredient.
- **Daily Values** are FDA adult values; omega-3 (ALA) uses the NIH Adequate Intake and says so.
- **Insight copy (`RULES`)** fires from calculated totals. Each insight:
  - cites at least one `https://` source (NIH ODS, FDA, MedlinePlus, Harvard T.H. Chan, PubMed);
  - is tagged **Well established** or **Seen in studies**;
  - makes **no disease, cure or treatment claim** and uses **no regulated nutrient-content phrase** ("high in", "good source", "excellent source"). `lib/nutrition.test.ts` enforces a banned-word list and the no em dash rule.
- Nutrition is a general estimate, not advice. Don't add copy that tells the user what they need.

---

## 12. Ranking and patterns

- **`preferenceScore`** = again × 0.5 + taste × 0.3 + feel × 0.2, on the user's averages. `null` until rated. The same weights are used per meal in `lib/patterns.ts` (`mealScore`). Change both or neither.
- **`isDisliked`**: score at or below 2.25, or "again" at or below 2.
- **`rankRecipes`** orders the Today suggestions: disliked recipes last, then least recently made first (never made leads), then by id. It's deterministic; keep it that way so "skip" walks a stable list.
- **`analyzePatterns`** only reports a difference between groups (sweet vs savory, warm vs cold, format, protein, protein and fiber vs how she felt) when there are at least 4 rated meals overall (`MIN_RATED_TOTAL`), 2 per group (`MIN_PER_GROUP`) and a gap of at least 0.75 (`MIN_GAP`). These guard against reading noise as preference. Raise them freely; lower them only with a reason.
- `lib/patterns.test.ts` covers the thresholds. Add a case for any new comparison.

---

## 13. Client components and state

- **Server loads, client owns.** User views receive `initial: AppState` and copy what they mutate into `useState` (`stock`, `upcoming`, `cartCount`, `items`). They never refetch.
- **Mutations run in `startTransition(async () => ...)`** and `await unwrap(action(...))` inside a `try` (section 5).
- **Optimistic updates roll back.** Save the previous value, set the optimistic one, and restore it in `catch` with `toast.error(failureMessage(err))`. `CartView.run()` is the reference implementation; copy it rather than reinventing it.
- **Toasts:** import `toast` from `@/components/activity/toast`. `toast.success` for a completed action the user might not otherwise notice ("Added walnuts to the list"), `toast.error` for a failed save. Failure copy names the likely cause: "Couldn't save. Check your connection."
- **Client-only workflows** worth seeing in the admin timeline call `track("workflow", "noun.verb_past", { counts })` and get a row in `docs/business-events.md`.
- **Time:** never call `Date.now()` during render. Use `initial.loadedAt` for stock freshness and `useHour()` for greetings and the now-or-tonight suggestion.
- **`key` to reset flows.** The Today page keys `<BreakfastFlow>` on `recipe-mode` so following a recipe link starts a fresh flow instead of reusing state.
- **Admin client data** goes through `useAdminQuery` and `useCursorList` in `components/admin/api.ts`. They abort on unmount, keep the last data while reloading, and `adminFetch` sends an ended admin session back to sign-in. Don't call `fetch` directly in admin components.
- **Sign-in forms** call `apiFetch` and then `window.location.replace(safeReturnPath(next, "/"))`, a full navigation so the new cookie is used everywhere.

---

## 14. UI and design conventions

### User app

- **Phone first.** One column, `max-w-md`, `px-5`, safe-area padding at the top and a fixed bottom nav with `env(safe-area-inset-bottom)`. The root layout sets `viewportFit: "cover"` and the Apple web-app meta so it works from the home screen.
- **Big touch targets.** Primary actions are `h-12 text-base`; secondary are `h-11`. Inputs on the login form are `h-12 text-base` so iOS doesn't zoom.
- **Five tabs**, in this order: Today, Recipes, Plan, Cart, Pantry. `/insights` and `/recipes/[id]` highlight Recipes. A new top-level page either fits under an existing tab or replaces one; don't add a sixth.
- **Headings** use `font-heading` (`text-3xl` page titles, `text-xl` sections). Secondary text is `text-muted-foreground`.
- **Cards and lists:** `rounded-xl border bg-card`, `divide-y` for rows, `bg-muted/60` for soft callouts, `bg-primary/5 ring-primary/20` for the "planned for tomorrow" highlight.
- **Loading:** every page-level Suspense boundary uses `<PageSkeleton />`. The boundaries around `BottomNav` and `ActivityProvider` in the layout, and around the login form, have no fallback: they hold chrome, not content, and a skeleton there would flash a second page. There are no `loading.tsx` files.
- **Errors:** `app/(app)/error.tsx` (friendly copy, "Try again", the error digest as a reference, logged to activity) and `app/not-found.tsx`. The admin panel has its own `app/theadmin/error.tsx` in `admin.css`.
- **Accessibility:** inputs have a `<Label htmlFor>`, field errors use `aria-invalid` + `aria-describedby`, form-level errors use `role="alert"`, notices use `role="status"`, icon-only buttons have `aria-label`, decorative icons `aria-hidden`.

### Admin panel

- Desktop-first, `admin.css` tokens (`--admin-*`) scoped under `[data-admin-root]`, class prefix `adm-`.
- Overlays (dialogs, menus) render into the admin root via `usePortalContainer()` so they inherit its tokens.
- Status badges come from `StatusBadge` / `Badge` in `components/admin/ui.tsx`; dates from `DateTime` and `RelativeTime`. Don't format dates inline.
- One-time passwords are shown once in the password dialog (`components/admin/passwords.tsx`) and never stored or logged in the browser.

---

## 15. Styling approach

- **Tailwind v4 with CSS variables.** The palette lives in `:root` in `app/globals.css` (warm off-white background, terracotta `--primary`). Use the semantic utilities (`bg-primary`, `text-muted-foreground`, `border`), never raw colors (`emerald-600`) or hex values in components.
- **Status colors** are tokens too: `success` (have it, cooked, in stock), `warning` (missing, expiring, check the label) and `info` (overnight, tonight), each with a `-foreground` for text on a filled background. Use them with opacity like the others (`bg-success/5 ring-success/20`). Favorites use `primary`.
- **The one hex value** is `themeColor` in `app/layout.tsx`: metadata can't read CSS variables, so it repeats `--background`. Change both together.
- **Change the palette in one place:** edit the `:root` variable. The `.dark` block is unused shadcn boilerplate; the app is light only.
- **`cn()`** from `@/lib/utils` for conditional classes. Variants use `class-variance-authority`, as in `components/ui/button.tsx`; `buttonVariants()` styles links as buttons.
- **No inline `style`** in the user app, except safe-area `env()` values that Tailwind can't express (prefer arbitrary values like `pb-[env(safe-area-inset-bottom)]`) and data-driven bar widths (`style={{ width: \`${pct}%\` }}` on the nutrition and insight bars), which can't be static classes. The admin panel uses `admin.css` classes and occasional inline layout styles.
- **`components/ui/*` are shadcn files.** Regenerate with the shadcn CLI rather than editing heavily. If you must customize one, say so in a comment at the top.

---

## 16. User-facing copy

- **No em dashes. Anywhere.** Use a comma, colon, period or parentheses. (`.cursor/rules/no-em-dashes.mdc`.) En dashes in recipe names and ranges ("Blueberry–walnut", "3–4 min") are fine.
- **Plain and warm.** "Cooked, it's in the fridge", not "Batch status: available". Sentence case for buttons and headings.
- **Errors say what to do next:** "Wait a few minutes and try again", "Contact your administrator", "Check your connection." Never show a stack trace, error code or Mongo message to a user.
- **Session-end reasons** use the four fixed messages (`revoked`, `expired`, `paused`, `disabled`) in `SESSION_END_MESSAGES`. The login page shows them from `?reason=`.
- **Health copy** follows section 11: no claims, cite sources, label observational findings.
- **Privacy-preserving replies:** sign-in says "That Login ID or password is incorrect" for both an unknown number and a wrong password; invite replies are the same whether or not the number has an account.
- **HTML entities** in JSX text: `&apos;`, `&ldquo;`, `&rdquo;` (the linter requires them).

---

## 17. Error handling

### Server

- **`ApiError`** (`lib/auth/errors.ts`) is the one error type for expected failures. It carries an `ErrorCode`, a readable message and optional `fields`, `reason` and `retryAfterSec`. Throw it from `lib/` code; routes turn it into JSON, `userAction` turns it into `{ ok: false, error }`.
- **Storage errors** (`isStorageError` in `lib/db.ts`: `instanceof` the driver's server selection, network, topology closed and not connected errors) become `STORAGE_UNAVAILABLE` with `STORAGE_MESSAGE`.
- **Monitoring never fails a request.** `recordAccess`, `recordWorkflow` and `lookupIpGeo` catch and log their own errors and run inside `after()`.
- **Unexpected errors** are logged once with the request id (`console.error(\`[${requestId}] ...\`)`) and returned as a generic 500 that shows the reference. Don't log and rethrow at every layer.
- **Never log** passwords, session tokens, token hashes or user notes.

### Client

- `apiFetch` throws `ClientApiError` with `status`, `code`, `fields` and `retryAfterSec`. Network failures become `code: "NETWORK"`. Branch on `code`, not `status` or message text:

  ```ts
  } catch (err) {
    if (err instanceof ClientApiError) {
      if (err.code === "VALIDATION_FAILED") setFields(err.fields);
      else if (err.code === "RATE_LIMITED" && err.retryAfterSec) setError(`Try again in ${minutes} minutes.`);
      else setError(err.message);
    } else setError("Something went wrong. Try again.");
  }
  ```

- Server Action failures are caught at the call site and shown as a toast (user app). Every `await unwrap(action())` sits inside a `try`, and the toast text comes from `failureMessage(err)`.

---

## 18. TypeScript

- `strict` is on. No `any`. Prefer `unknown` at boundaries and narrow it (`isIngredient(id: unknown): id is string`, `sanitizeDevice(input: unknown)`).
- **Type guards inside zod** for ids from the network: `z.custom<number>(isRecipe, { error })` gives a typed value with no cast.
- **Avoid `as` casts.** Where one is needed (the `principal as UserDoc` in `authenticate`, the generic `Filter<T>` in `beforeCursor`), keep it inside one helper, not at call sites.
- **Discriminated unions** for flows and results: the Today flow's `Step` union, `LoginOutcome`, `ActionResult`. Switch on the tag; let TypeScript check exhaustiveness.
- **`satisfies`** for config tables that must match a type but keep literal keys (`TRANSITIONS`).
- **Doc types vs view types:** `*Doc` in `lib/schema.ts` (with `ObjectId` and `Date`), serialized view types in `lib/types.ts` or `lib/admin/serialize.ts` (with `string`). Never pass a `*Doc` to a client component.
- `as const` for literal tables (`COLLECTIONS`, `LINKS`, `IP_SOURCES`).

---

## 19. Imports and naming

### Imports

- Use `@/` for everything outside the current folder. Relative imports only within a folder (`./auth/config` inside `lib/`, `../../gate` inside `app/theadmin`). The CLI uses relative imports because it runs under `tsx` without the alias.
- Every server-only module starts with `import "server-only";`. That includes `lib/db.ts`, `lib/data.ts`, anything that reads cookies or headers, and anything under `lib/admin` and `lib/api`. `lib/schema.ts`, `lib/auth/config.ts`, `lib/auth/errors.ts`, `lib/auth/passwords.ts` and `lib/auth/identifiers.ts` deliberately omit it so the CLI can import them.
- `import type` for type-only imports.
- Order: React and Next, third-party, then `@/` imports, then relative. Let the editor sort within groups.

### Naming

| Thing | Convention | Example |
|---|---|---|
| Files | kebab-case | `breakfast-flow.tsx`, `rate-limit.ts` |
| Components | PascalCase, named export | `export function CartView` |
| Hooks | `use` prefix, file `use-*.ts` | `useHour` |
| Server Actions | verb first | `recordCheck`, `planTomorrow`, `markMade` |
| Guards | `require*` throws or redirects, `get*` returns null | `requireUserPage`, `getAdminPage` |
| Mongo types | `*Doc` | `CartDoc` |
| Constants | `SCREAMING_SNAKE` for tables and limits | `AISLE_ORDER`, `MIN_GAP`, `UPCOMING_FRESH_MS` |
| Audit actions | `noun.past_tense` | `user.password_reset` |
| Collections | snake_case plural | `user_sessions`, `household_invites` |
| Ingredient ids | kebab-case | `"sweet-potato-cooked"` |

Only default-export what Next requires (pages, layouts, `next.config.ts`).

---

## 20. File size and when to split

There's no hard limit, but a file over ~300 lines is a signal to check:

- It mixes server and client code, or data and UI.
- It holds several components that each have their own state.
- You scroll to find the thing you came to change.

Not reasons to split: a long static table (`lib/recipes.ts` is mostly data; `lib/nutrition-data.ts` is generated), or a long switch over one state machine whose cases share local helpers.

### Currently large files

| File | Lines | Notes |
|---|---|---|
| `components/breakfast-flow.tsx` | ~940 | One component per step case would help; extract `ModeButton`, the suggest card and the serve step first |
| `lib/recipes.ts` | ~610 | Data. Fine. If helpers grow, move them to `lib/recipe-helpers.ts` |
| `lib/nutrition.ts` | ~550 | `RULES` (insight copy) could move to `lib/nutrition-insights.ts` |
| `lib/admin/users.ts` | ~540 | Split sessions and audit listing into `lib/admin/sessions.ts` and `lib/admin/audit.ts` |
| `components/admin/user-detail.tsx` | ~460 | Profile and Sessions tabs could move out, as Household (`user-household.tsx`) and the monitoring tabs (`user-monitoring.tsx`) already have |

When splitting, move code without changing it in the same commit, so the diff is reviewable.

---

## 21. DRY: reuse before you write

Before writing a helper, check whether it exists:

| Need | Use |
|---|---|
| Ingredients to check for a recipe (scoped, without water) | `checkableIds(recipe, scope)` |
| Is this in stock right now (with batch expiry) | `rememberedInStock(id, stock, loadedAt)` |
| Cooked-ahead parts and how to make them | `cookedAheadItems(recipe)`, `prepKinds(recipe)` |
| Sort by where things are in the kitchen | `sortByKitchen(items)` |
| Nutrition totals, % DV, standouts | `recipeNutrition`, `percentDV`, `topMicros` |
| Phone validation, formatting, display | `validatePhone`, `formatPhoneInput`, `displayPhone`, `<PhoneInput>` |
| Safe `?next=` | `safeReturnPath` |
| JSON fetch with typed errors | `apiFetch` (user), `adminFetch` (admin) |
| Route preamble, body parsing, errors | `route()`, `parse()`, `objectId()`, `ok()` |
| Keyset pagination | `decodeCursor`, `beforeCursor`, `paginate` |
| Audit row | `writeAudit()` |
| Optimistic update with rollback | Copy `CartView.run()` |
| Server Action preamble, validation, result | `userAction()`, `parseInput()`, `done()`, `fail()`; callers `unwrap()`, `failureMessage()` |
| Durations | `SEC`, `MIN`, `HOUR`, `DAY` from `@/lib/time` |
| Log an activity event or a toast | `track()` from `components/activity/logger`, `toast` from `components/activity/toast` |
| Record an access event | `recordAccess()` inside `after()` |
| Flag, access kind, GPS and activity labels | `FLAG_LABELS`, `ACCESS_KIND_LABELS`, `GPS_LABELS`, `ACTIVITY_TYPE_LABELS` |
| Redact emails in a string or a nested payload | `redactEmails`, `redactData` (`lib/monitoring/redact.ts`, used by the client logger and ingest) |
| Is this a UUID (page load id, device cookie) | `isUuid`, `UUID_RE` (`lib/monitoring/trace.ts`) |
| Admin audit actor | `adminActor(auth)` (`lib/admin/auth.ts`) |
| Admin dates, day ranges, audit change values, failed events | `DateTime`, `RelativeTime`; `formatDate`, `dayStart`, `dayEnd`, `formatChangeValue`, `isFailure` (`components/admin/format.ts`) |
| Admin "Load more" button | `LoadMore` (`components/admin/ui.tsx`) |

Known duplication to remove is listed in section 26.

---

## 22. Constants and environment variables

### Constants

- Auth and retention numbers live in `authConfig` (`lib/auth/config.ts`), with env overrides read through getters at call time. Add new auth tunables there, not as file-level constants.
- Domain thresholds sit next to the code that uses them and are exported if a test or UI needs them (`MIN_RATED_TOTAL`, `UPCOMING_FRESH_MS`). In a `"use server"` file they stay unexported (`INVITES_PER_DAY`).
- Times are written with the named units in `lib/time.ts` (`15 * MIN`, `36 * HOUR`), never bare millisecond literals or `24 * 60 * 60 * 1000`. Cookie and TTL seconds are `duration / SEC`.

### Environment variables

All of them are in `.env.example`. Local values go in `.env.local` (git-ignored; the CLI loads it too).

| Variable | Required | Purpose |
|---|---|---|
| `MONGODB_URI` | Yes | Connection string |
| `MONGODB_DB` | No (`breakfeast`) | Database name |
| `APP_ORIGIN` | Yes in production | Exact site origin for CSRF checks |
| `APP_ALLOWED_ORIGINS` | No | Extra origins, comma-separated |
| `COOKIE_PREFIX` | No (`bf`) | Cookie names |
| `CLIENT_IP_SOURCE`, `TRUSTED_PROXY_HOPS` | Yes behind a proxy | Trusted client IP for rate limits |
| `GEOIP_PROVIDER`, `GEOIP_TOKEN` | No (`ip-api`) | IP geolocation: `ip-api`, `ipinfo` (needs the token) or `none` |
| `USER_SESSION_IDLE_DAYS`, `USER_SESSION_MAX_DAYS`, `ADMIN_SESSION_IDLE_MIN`, `ADMIN_SESSION_MAX_HOURS` | No | Session lifetimes |
| `ACTIVITY_RETENTION_DAYS`, `ACCESS_RETENTION_DAYS` | No (30, 365) | Monitoring retention |
| `SHARING_FAR_KM`, `SHARING_IMPOSSIBLE_KMH`, `SHARING_CONCURRENT_WINDOW_MIN`, `SHARING_FAILED_LOGINS`, `SHARING_ALERT_THROTTLE_HOURS` | No | Account-sharing flag thresholds (`authConfig.sharing`) |

Rules: never read `process.env` outside `lib/auth/config.ts`, `lib/db.ts` and `scripts/`. Never prefix a secret with `NEXT_PUBLIC_`. A new variable goes in `.env.example` with a comment, this table and the README deploy note.

---

## 23. CLI and scripts

`scripts/admin-cli.ts` (run through `npm run`) is the only way to create or recover an **admin**. Admin accounts are never created from the web.

| Command | What it does |
|---|---|
| `npm run db:init` | Create every index. Safe to rerun |
| `npm run admin:create -- <id>` | New admin; prompts twice for the password |
| `npm run admin:reset-password -- <id>` | New password; signs that admin out everywhere and clears their rate-limit rows |
| `npm run admin:list` | Admin ids, status, last login |
| `npm run admin:disable -- <id>` / `admin:enable -- <id>` | Block or restore an admin |
| `npm run db:reset-app-data -- --yes` | Delete all breakfast data, keep accounts |

Rules:

- **Passwords are never command-line arguments** (they end up in shell history). Use the hidden prompt, `--stdin` or `--generate` (prints once).
- Every CLI write records an audit row with `actorType: "cli"`.
- Destructive commands require an explicit `--yes`.
- The CLI connects with its own `MongoClient` and imports only modules without `server-only`.

`scripts/extract-usda.py` regenerates `lib/nutrition-data.ts` from a USDA SR Legacy CSV download. Run it by hand when the ingredient mapping changes, then run the tests.

---

## 24. Testing and verification

- **Vitest**, `npm test`. Tests live beside the code as `lib/**/*.test.ts` (that glob is all `vitest.config.mts` picks up).
- **What's covered today:** nutrition data integrity (every ingredient mapped, gram weights present, totals plausible, Atwater check), insight copy rules (sources, banned claims, no em dashes) and the patterns thresholds.
- **Decision (October 2026): no new automated tests for now.** The project owner chose to verify the admin panel, households and monitoring by hand instead of adding tests, so this section deliberately differs from section 13 of `admin-panel-instructions.md`. The existing tests stay and must keep passing. If tests are added later, start with the pure rules: `computeFlags` (each flag positive and negative), `sanitizeDevice`, `sanitizeData` and `redactEmails`, then the household merge with a dedicated test database dropped afterwards.
- **What a change needs:**
  - New recipe or ingredient: the existing nutrition tests must pass.
  - Anything else: a manual walkthrough of the paths you touched, written in the PR description (requests sent, responses and rows seen). For monitoring, check the user's Devices, Access history and Activity tabs and the Live activity page.
- **Before opening a PR:** `npm test`, `npx tsc --noEmit`, `npm run lint`, and `npm run build` (the build typechecks too). Then click through the change on a phone-sized viewport.
- **Calling a Server Action from `curl`** for a walkthrough: take its id from `.next/dev/server/server-reference-manifest.json` (dev ids differ from build ids) and POST to any page with `Next-Action: <id>`, `Content-Type: text/plain;charset=UTF-8`, the `Origin` header and the session cookie; the body is the JSON array of arguments.

---

## 25. Docs and repo hygiene

- Keep this guide, `README.md` and `.env.example` in step with the code in the same PR.
- `plan15.md` changes update `lib/recipes.ts` and vice versa.
- Nutrition changes update `docs/nutrition-methodology.md` and its "Reviewed" date.
- Don't commit `.env*` (except `.env.example`), `.next/` or `tsconfig.tsbuildinfo`.
- Commit `AGENTS.md` as `next dev` writes it.
- No em dashes in commit messages either.

---

## 26. Audit backlog (known gaps)

Found October 2026. Remove an item when it's fixed; add one when you find a gap.

Items 1 to 9 and 12 of the first audit (the `tsc` failure in `lib/households.ts`, unbuilt monitoring, the two Server Action styles, missing error boundaries, hand-rolled action validation, one action per cart item, duplicated session messages, the duplicate-key message and cast, and the stale README) were fixed with Phase 4. A second full-codebase pass (October 2026) fixed raw palette colors, household action validation, the per-recipe plan check loop, unredacted client activity data, the non-transactional `createUser`, unlabeled controls, and duplicated admin helpers.

### P1: robustness and consistency

1. **`recordCheck` makes three separate writes** (pantry, cart add, cart delete) without a transaction. A failure between them leaves the cart and pantry disagreeing until the next check. Acceptable for a household; wrap in `withTransaction` if it ever matters.
2. **IP geolocation uses ip-api's free endpoint over plain HTTP**, which is non-commercial only and sends the client IP unencrypted. Before any commercial use, switch to `GEOIP_PROVIDER=ipinfo` with a token (HTTPS).
3. **`alert_log` and `SHARING_ALERT_THROTTLE_HOURS` are unused** because alert emails were turned off. Remove both, or wire an email transport and use them.

### P2: maintainability

4. **Large files** listed in section 20, starting with `components/breakfast-flow.tsx`.
5. **Unused dark theme tokens** in `app/globals.css` (`.dark`) and the `next-themes` dependency used only by the shadcn `Toaster` wrapper. Remove both or add a real theme provider.
6. **No automated tests for auth, households or monitoring** (section 24). Start with `computeFlags` and the payload sanitizers when the decision changes.

---

## 27. Quick checklist

Before you open a PR:

- [ ] Dynamic work is inside a `<Suspense>` boundary; `params` and `searchParams` are awaited in the loader.
- [ ] Every Server Action runs through `userAction()` with an event pair from `docs/business-events.md`, and validates every argument with `parseInput()`.
- [ ] Nothing logged to activity holds typed text, a password, a phone number or an email.
- [ ] Every route handler is wrapped in `route()` and starts with the right guard.
- [ ] Every query is scoped by `householdId` (or `userId` for ratings) in the filter.
- [ ] No `ObjectId` or `Date` crosses into a client component or JSON.
- [ ] Multi-collection household changes run in `withTransaction` and pass `session` everywhere.
- [ ] Admin writes call `writeAudit()`; sensitive ones call `assertReauth()`.
- [ ] No recipe was renumbered and no ingredient id renamed.
- [ ] New recipes or ingredients have traits, gram weights and USDA mappings.
- [ ] Optimistic UI rolls back and toasts on failure (`unwrap` + `failureMessage`, toast from `components/activity/toast`).
- [ ] No hex colors in user-app components; admin styles stay in `admin.css`.
- [ ] No em dashes in code, copy, docs or the commit message.
- [ ] New env vars are in `.env.example`, section 22 and the README.
- [ ] `npm test`, `npx tsc --noEmit`, `npm run lint` and `npm run build` pass.
- [ ] This guide's tree and backlog are updated if you changed structure or fixed a gap.
