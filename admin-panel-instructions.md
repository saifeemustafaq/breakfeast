# Reusable Admin Panel, User Authentication & Monitoring Instructions

Use this file as the implementation brief for an AI coding agent. Fill in **Project inputs** below, attach the file to a task, and say: **"Implement the admin panel, user authentication and monitoring described in this file. Use the project's existing stack, the project inputs, and the defaults below."** Project inputs override named settings; the defaults below apply otherwise.

---

## Ask questions first, and whenever in doubt

The project owner wants to be asked. Clarity matters more than speed here: a question costs the owner a minute, a wrong assumption costs a rebuild. **When in doubt, ask. There is no limit on the number of questions.**

**Before writing any code:**

1. Read this whole guide and inspect the repository: framework, existing auth, database usage, public routes, UI library, email setup, deployment config.
2. Send the owner one structured set of questions. Always include:
   - Every blank or unclear project input (§0), with your best guess so the owner can just confirm.
   - Every conflict between this guide and the repository, such as existing auth, an existing `users` collection, a different UI library, routes that would break if protected, or a framework that does not fit a rule here.
   - The public/private boundary: list every page and API you found and say which ones you plan to protect.
   - The business events (§11.6): propose a list from the app's actual features and ask the owner to confirm, add or remove.
   - Any default in §2 that looks wrong for this project's users or hosting.
3. Wait for the answers before building anything those answers affect.

**While building,** stop and ask whenever:

- The guide is silent or ambiguous about something that changes behavior, data or what users see.
- Two reasonable approaches have different tradeoffs and the guide does not pick one.
- Following the guide would break an existing feature, delete or migrate existing data, or change an existing route, API or response.
- Infrastructure is missing or failing (database unreachable, email not configured, hosting unknown).
- You would need to deviate from any rule marked mandatory or hard here (password length, rate limits, guards, CSRF, monitoring).

**How to ask:**

- Group related questions; number them so the owner can answer by number.
- For each question, give the options, your recommended option first with a one-line reason, and what you will do if the owner has no preference.
- Use multiple-choice when the options are discrete; open questions only when they are not.
- Ask follow-up rounds as often as needed. A first answer that opens new questions should get new questions.
- After the answers, restate the decisions in a short list, then proceed. Record the final decisions in the project's docs so later agents do not ask again.

Do not ask about anything this guide already fixes (names, paths, tokens, error codes, schema) unless the repository conflicts with it. Do not guess silently on anything else: if you assumed something, say so in your progress note and in the final summary.

---

## 0. Project inputs (fill what you can; the agent asks about the rest)

```markdown
- App name (shown in admin header and login):
- Logo path (optional):
- Cookie prefix (short slug, e.g. "cm"):
- Login identifier: username | email | phone
- Default phone country (only if phone, ISO 3166 alpha-2, e.g. "IN"):
- Protected surface: (pages and APIs that require a user session; default: everything)
- Public exceptions: (e.g. share/download links, webhooks, health check)
- Additional user fields: (name: type, shown under "Additional details")
- Business activity events: (domain.action list for §11.6; at minimum the app's primary actions)
- Hosting / proxy in front of the app: (Vercel, Render, Cloudflare, nginx, none)
- Alert email recipients:
- Overrides to §2 defaults:
```

---

## 1. Implementation brief

Build a complete, working admin panel, user authentication and user monitoring system backed by MongoDB, with bcrypt password hashing. Keep the admin interface, navigation, terminology, API, data model, CLI and account behavior identical across projects, regardless of the application's domain.

Inspect the existing project first. Reuse its framework, database connection, package manager, email transport and test runner. Preserve existing user data and identifiers. Extend or migrate existing authentication carefully rather than creating two competing systems. Keep the admin's visual tokens (§3) identical even when the main application has different branding.

Implement the frontend, server authorization, API (§5), database models and indexes (§9), monitoring (§11), CLI (§10) and documentation. Every visible action must work against persistent data. If required infrastructure is unavailable, identify the specific blocker and complete everything that can be verified locally; do not claim an integration was tested when it was not.

**Credential model in one sentence:** the admin creates every user, chooses or generates a short password, gives it to the user directly (in person or by phone), and resets it when the user forgets; users never choose or change their own password.

## 2. Defaults and configuration

Centralize these settings in one server-side configuration module (`auth/config`). Keep secrets in environment variables.

| Setting | Default |
| --- | --- |
| Admin base path | `/theadmin` |
| User login path | `/login` |
| User login identifier | Username; configurable to email or phone (project input) |
| Label for the identifier | `Login ID` |
| User registration | Admin-created accounts only; no public signup |
| Password storage | bcrypt, cost 12; benchmark on the deployment host, never below 10 |
| **User password length (hard rule)** | **Never more than 6 characters.** Generated: exactly 6. Typed by admin: 4–6 characters |
| Generated user password alphabet | Lowercase letters and digits without look-alikes: `abcdefghjkmnpqrstuvwxyz23456789`; at least one letter and one digit |
| User password change | Admin only. No forced change on first login, no self-service change, no "forgot password" flow (the login page says "Forgot your password? Contact your administrator.") |
| Admin password | 6–72 UTF-8 bytes; set only through the admin's own change-password dialog or the CLI |
| User session | Persistent cookie; 30-day idle timeout, 90-day absolute lifetime |
| Admin session | 30-minute idle timeout, 12-hour absolute lifetime |
| Recent-auth window for sensitive admin actions | 5 minutes |
| User session limit | Multiple sessions allowed; admin can revoke one or all |
| Account states | `active`, `paused`, `disabled` |
| Login rate limits | 5 failures per identifier per 15 min; 20 failures per client IP per 15 min; 30 failures per identifier per 24 h |
| `lastSeenAt` write throttle | At most once every 5 minutes per session |
| Monitoring (§11) | **On.** Required in every project |
| Activity event retention | 30 days |
| Access history retention | 365 days |
| Admin audit retention | 365 days |
| Admin display timezone | The admin's browser timezone; stored values are UTC |

Timeouts and retention are product defaults, configurable per deployment. Persist user sessions across browser restarts within their configured lifetime. Keep admin sessions shorter than user sessions.

**Why the rate limits matter here:** 6-character passwords are deliberately simple and are only safe because online guessing is throttled. The three login limits are mandatory, must be shared across server instances (stored in MongoDB), and must never be disabled in production. They never permanently lock an account.

Use one identifier type per deployment. Normalize identifiers on the server and enforce uniqueness in MongoDB: trim and lowercase usernames (allowed characters `a–z 0–9 . _ -`, 3–32 long); for email, trim and lowercase the whole address; for phone, convert to E.164 using the project's default country when no `+` prefix is given. Never normalize, trim or silently truncate passwords. Reject user passwords longer than 6 characters with "Passwords are at most 6 characters."

## 3. Standard visual design

Use a restrained, light interface with the same layout and component behavior in every project. Only the app name and logo change between projects.

### 3.1 Tokens

Implement the admin UI under a single root element `<div data-admin-root>` that defines these CSS custom properties. Map them onto the project's component library (shadcn/Tailwind, MUI, plain CSS, etc.) rather than inventing new values. The admin is **always light**, even if the main app has a dark theme; do not add a dark mode.

| Token | Value | Use |
| --- | --- | --- |
| `--admin-bg` | `#F8FAFC` | Page background |
| `--admin-surface` | `#FFFFFF` | Sidebar, header, cards, inputs, dialogs |
| `--admin-text` | `#0F172A` | Primary text |
| `--admin-text-muted` | `#64748B` | Secondary text, table headers, timestamps |
| `--admin-border` | `#E2E8F0` | 1 px borders and dividers |
| `--admin-primary` | `#2563EB` | Primary buttons, links, focus ring |
| `--admin-primary-hover` | `#1D4ED8` | Primary hover |
| `--admin-primary-soft` | `#EFF6FF` | Active nav item background |
| `--admin-danger` | `#DC2626` | Access-removing buttons, error text |
| `--admin-danger-soft` | `#FEE2E2` | Error banners, error rows in timelines |
| `--admin-success` / `-soft` | `#15803D` / `#DCFCE7` | Active badge |
| `--admin-warning` / `-soft` | `#B45309` / `#FEF3C7` | Paused badge, informational flags |
| `--admin-neutral` / `-soft` | `#475569` / `#F1F5F9` | Revoked/expired badge, neutral chips |

Status badges are pill-shaped, `-soft` background with the matching strong text color, and always include a text label: **Active** (success), **Paused** (warning), **Deactivated** (danger), **Revoked** / **Expired** (neutral).

### 3.2 Typography, spacing, shape

| Element | Specification |
| --- | --- |
| Font | `ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`; monospace `ui-monospace, SFMono-Regular, Menlo, monospace` for IDs, IPs and passwords |
| Sizes | 14 px body, 12 px captions, 16 px section headings (600), 24 px page title (600), labels 500 |
| Spacing | 4, 8, 12, 16, 24, 32 px scale |
| Corner radius | 8 px controls, 12 px cards and dialogs, full radius for badges |
| Elevation | Cards: border only, no shadow. Dialogs and menus: `0 10px 30px rgba(15,23,42,0.12)` |
| Control height | 40 px minimum |
| Focus ring | 2 px `--admin-primary`, 2 px offset, on every focusable element |
| Desktop shell | 240 px left sidebar; 64 px top header; 32 px content padding |
| Content width | Maximum 1440 px, centered within the content area |
| Mobile shell (< 768 px) | Sidebar becomes a drawer opened from a header menu button; 16 px content padding; tables scroll horizontally |
| Table | 48 px minimum rows, 1 px dividers, sticky header, muted uppercase 12 px column labels, hover `--admin-bg` |
| Toasts | Bottom-right, 4 s, success/error variants only |

### 3.3 Icons and navigation

Use **Lucide** icons (`lucide-react` in React projects; the Lucide package for the project's framework otherwise). Icons are 16 px inside buttons and 18 px in the sidebar, always next to a text label.

Sidebar navigation, in this order: **Overview** (`LayoutDashboard`) → **Users** (`Users`) → **Live activity** (`Activity`) → **Alerts** (`ShieldAlert`) → **Audit log** (`ScrollText`). Highlight the active item with `--admin-primary-soft` background and `--admin-primary` text. Show an unread-count badge on Alerts for flags in the last 24 hours.

Header: app name and logo on the left; on the right an account menu showing the signed-in Admin ID with **Change password** and **Sign out**.

### 3.4 Buttons, copy and dates

One prominent primary action per page. Standard button labels: **Create user**, **Save changes**, **Reset password**, **Generate**, **Copy**, **Pause access**, **Resume access**, **Deactivate**, **Activate**, **Revoke session**, **Revoke all sessions**, **Sign in**, **Sign out**. Access-removing actions use danger styling and a confirmation dialog that names the user and the consequence, for example: "Pause access for **Priya Shah**? They will be signed out of every device immediately and cannot sign in until you resume access."

Dates: absolute format `21 Oct 2026, 13:05` in the admin's timezone, with the timezone abbreviation in a tooltip. "Last seen" and feed rows show relative time (`5 min ago`) with the absolute time in a tooltip.

Include loading (skeleton rows), empty, error, validation, submitting and success states on every screen. Disable duplicate submissions. Preserve form input after errors. Show inline field errors from the API's `fields` map (§5.1). Dialogs trap focus, close on Escape, return focus to the trigger, and label every control. No decorative charts, gradients, animations or placeholder widgets.

## 4. Required screens and routes

| Route | Required behavior |
| --- | --- |
| `/theadmin` | Unauthenticated: admin login. Authenticated: Overview. |
| `/theadmin/users` | Searchable, filterable, sortable, paginated user table. |
| `/theadmin/users/new` | Create-user form. |
| `/theadmin/users/[id]` | User detail with tabs. |
| `/theadmin/activity` | Live activity feed across all users. |
| `/theadmin/alerts` | Flagged access events across all users. |
| `/theadmin/audit` | Searchable audit log. |
| `/login` | User login with Login ID and password, show/hide password control, monitoring notice (§11.1). |

**Admin login:** centered card, app name, "Admin sign in", **Admin ID**, **Password**, **Sign in**. No registration or recovery link. After sign-in, go to the `next` query parameter if it passes the return-path rule (§7.6), otherwise the Overview.

**Overview:** four count cards (Total users, Active, Paused, Deactivated) over the complete dataset, then two monitoring cards (Active now = users seen in the last 15 minutes; Alerts in the last 24 hours), then **Recent admin actions** (latest 10 audit rows) and **Recently created users** (latest 5). **Create user** at the top right. Do not invent business metrics.

**Users:** columns in this order: Name, Login ID, Status, Created, Last login, Last seen, Active sessions, Flags, Actions. Default sort newest created first; sortable by Name, Created, Last login, Last seen. Search matches name and Login ID (case-insensitive substring). Status filter: All / Active / Paused / Deactivated. Show result count, **Clear filters**, and pagination (25 per page, maximum 100). Filters and page live in the URL query so the view is shareable and survives reload. The **Actions** column has a **View** link and a `⋯` menu with Reset password, Pause access / Resume access, Deactivate / Activate, Revoke all sessions. "Last seen" is never labelled "online". Active sessions counts only unrevoked, unexpired sessions.

**Create user:** fields Display name (required, ≤ 100), Login ID (required), Notes (optional, internal, ≤ 2000), Initial state (Active / Paused, default Active), and a password control with two modes: **Generate** (default; shows the generated 6-character password with **Regenerate**) and **Enter manually** (4–6 characters, show/hide toggle). Project-specific fields go in a collapsible **Additional details** section. On success, show the one-time password dialog (§6.2), then go to the user's detail page.

**User detail:** header shows name, Login ID, status badge, created date, last login, last seen, and the primary actions (Reset password, Pause/Resume, Deactivate/Activate). Tabs in this order: **Profile → Sessions → Devices → Access history → Activity → Audit history**.

- **Profile:** editable name, Login ID, notes and additional details with **Save changes**; pause reason and resume time when paused.
- **Sessions:** device label, IP and city, created, last activity, expires, status badge, **Revoke session** per row and **Revoke all sessions** above the table.
- **Devices, Access history, Activity:** see §11.8.
- **Audit history:** audit rows whose target is this user.

All history views are newest first and paginated with **Load more**. Never show a password or a password hash.

## 5. API contract

All endpoints are JSON over HTTPS, under the app's origin. Paths are fixed; adapt only the framework's route-file syntax. Every mutating request passes the CSRF check (§7.5). Every response from an authenticated endpoint sets `Cache-Control: no-store`.

### 5.1 Conventions

- **Success:** `{ "data": ... }`. `201` for creation, `200` otherwise, `204` with no body for logout and telemetry.
- **List with pages** (users only): `{ "data": [...], "page": 1, "pageSize": 25, "total": 132 }`.
- **List with cursor** (all histories, feed, alerts, audit): `{ "data": [...], "nextCursor": "opaque-string" | null }`. Pass it back as `?cursor=`. The cursor encodes the last row's sort time and `_id` so ties are stable.
- **Errors:** `{ "error": { "code": "VALIDATION_FAILED", "message": "Human-readable sentence.", "fields": { "loginId": "That Login ID is already taken." } } }`. `fields` is present only for validation errors. Never include stack traces, hashes or tokens.
- **IDs** are strings (MongoDB `ObjectId` hex). **Dates** are ISO 8601 UTC strings.
- **Request bodies** must be `Content-Type: application/json`, at most 64 KB (activity: 128 KB). Unknown fields are ignored; fields outside the allowlist are never written.

| Code | HTTP | Meaning |
| --- | --- | --- |
| `VALIDATION_FAILED` | 400 | Body or query failed validation; see `fields` |
| `UNAUTHENTICATED` | 401 | No valid session of the required type |
| `SESSION_ENDED` | 401 | Session was valid but is now revoked, expired, or the account was paused/deactivated. Includes `"reason": "revoked" \| "expired" \| "paused" \| "disabled"` |
| `INVALID_CREDENTIALS` | 401 | Wrong Login ID / Admin ID or password (generic) |
| `ACCOUNT_PAUSED` / `ACCOUNT_DISABLED` | 403 | Correct password, but the account is blocked. No session issued |
| `REAUTH_REQUIRED` | 403 | Sensitive admin action outside the recent-auth window (§6.3) |
| `CSRF_REJECTED` | 403 | Origin check failed (§7.5) |
| `FORBIDDEN` | 403 | Authenticated but not allowed |
| `NOT_FOUND` | 404 | Unknown ID |
| `CONFLICT` | 409 | Duplicate Login ID, or `expectedUpdatedAt` is stale |
| `INVALID_TRANSITION` | 409 | State change not allowed from the current state (§8) |
| `PAYLOAD_TOO_LARGE` | 413 | Body over the limit |
| `RATE_LIMITED` | 429 | Includes `Retry-After` header (seconds) |
| `STORAGE_UNAVAILABLE` | 503 | MongoDB unreachable; authorization fails closed |
| `INTERNAL` | 500 | Anything else; logged server-side with a request ID |

### 5.2 Shared response shapes

```ts
type UserSummary = {
  id: string; name: string; loginId: string;
  status: "active" | "paused" | "disabled";
  createdAt: string; lastLoginAt: string | null; lastSeenAt: string | null;
  activeSessions: number; flagCount24h: number;
};
type UserDetail = UserSummary & {
  notes: string; details: Record<string, unknown>;
  pauseReason: string | null; pausedUntil: string | null;
  createdBy: string; updatedAt: string; passwordUpdatedAt: string;
};
type SessionRow = {
  id: string; deviceLabel: string; ip: string; city: string | null;
  createdAt: string; lastSeenAt: string; expiresAt: string;
  status: "active" | "revoked" | "expired"; revokedAt: string | null; revokeReason: string | null;
};
type DeviceRow = {
  id: string; deviceId: string; label: string;
  firstSeenAt: string; lastSeenAt: string; lastIp: string;
  lastCity: string | null; lastCountry: string | null; accessCount: number;
};
type AccessRow = {
  id: string; at: string; kind: AccessKind; userId: string | null; userName: string | null;
  loginIdAttempted: string | null; ip: string; ipGeo: IpGeo | null; gps: GpsFix;
  deviceLabel: string; deviceId: string | null; flags: Flag[];
};
type ActivityRow = {
  id: string; userId: string; userName: string | null; sessionId: string; pageLoadId: string;
  seq: number; clientAt: string; type: ActivityType; name: string;
  target: string | null; data: Record<string, unknown> | null; path: string;
};
type AuditRow = {
  id: string; at: string; actorType: "admin" | "cli" | "system"; actorLabel: string;
  action: string; targetType: "user" | "admin" | null; targetId: string | null; targetLabel: string | null;
  result: "success" | "failure"; changes: Record<string, { from: unknown; to: unknown }>;
};
```

### 5.3 User endpoints

| Method & path | Body / query | Success | Notes |
| --- | --- | --- | --- |
| `POST /api/auth/login` | `{ loginId, password, device }` (`device` per §11.3) | `200 { data: { user: { id, name, loginId } } }`, sets session and device cookies | Rate limited; errors `INVALID_CREDENTIALS`, `ACCOUNT_PAUSED`, `ACCOUNT_DISABLED`, `RATE_LIMITED` |
| `POST /api/auth/logout` | none | `204`, clears session cookie | Revokes the server session |
| `GET /api/auth/me` | none | `200 { data: { user: { id, name, loginId } } }` | Used by the app shell |
| `POST /api/auth/app-open` | `{ device }` | `204` | Monitoring (§11.2); never returns flags |
| `POST /api/activity` | `{ pageLoadId, events: ActivityInput[] }` | `202 { data: { stored } }` | Monitoring (§11.6) |

### 5.4 Admin endpoints

All require an admin session except login. "Reauth" marks endpoints that return `REAUTH_REQUIRED` outside the recent-auth window.

| Method & path | Body / query | Success |
| --- | --- | --- |
| `POST /api/admin/auth/login` | `{ adminId, password }` | `200 { data: { admin: { id, adminId } } }`, sets admin cookie |
| `POST /api/admin/auth/logout` | none | `204` |
| `GET /api/admin/auth/me` | none | `200 { data: { admin: { id, adminId }, reauthValidUntil } }` |
| `POST /api/admin/auth/reauth` | `{ password }` | `200 { data: { reauthValidUntil } }` |
| `POST /api/admin/auth/change-password` (Reauth) | `{ currentPassword, newPassword }` | `204`; all of this admin's sessions revoked, cookie cleared |
| `GET /api/admin/overview` | none | `200 { data: { counts: { total, active, paused, disabled, activeNow, alerts24h }, recentAudit: AuditRow[], recentUsers: UserSummary[] } }` |
| `GET /api/admin/users` | `?q=&status=&sort=createdAt\|name\|lastLoginAt\|lastSeenAt&order=asc\|desc&page=&pageSize=` | `200` paged `UserSummary[]` |
| `POST /api/admin/users` | `{ name, loginId, notes?, details?, status: "active"\|"paused", password: { mode: "generate" } \| { mode: "manual", value } }` | `201 { data: { user: UserDetail, issuedPassword: string } }` |
| `GET /api/admin/users/:id` | none | `200 { data: UserDetail }` |
| `PATCH /api/admin/users/:id` | `{ expectedUpdatedAt, name?, loginId?, notes?, details? }` | `200 { data: UserDetail }`; `CONFLICT` when stale |
| `POST /api/admin/users/:id/password` (Reauth) | `{ mode: "generate" } \| { mode: "manual", value }` | `200 { data: { issuedPassword, sessionsRevoked } }` |
| `POST /api/admin/users/:id/pause` | `{ reason?, until? }` | `200 { data: UserDetail }` |
| `POST /api/admin/users/:id/resume` | none | `200 { data: UserDetail }` |
| `POST /api/admin/users/:id/deactivate` | none | `200 { data: UserDetail }` |
| `POST /api/admin/users/:id/activate` | none | `200 { data: UserDetail }` |
| `GET /api/admin/users/:id/sessions` | `?cursor=` | cursor `SessionRow[]` |
| `DELETE /api/admin/users/:id/sessions/:sessionId` | none | `200 { data: { revoked: 1 } }` |
| `DELETE /api/admin/users/:id/sessions` | none | `200 { data: { revoked: n } }` |
| `GET /api/admin/users/:id/devices` | `?cursor=` | cursor `DeviceRow[]` |
| `GET /api/admin/users/:id/access` | `?kind=&flagged=true&cursor=` | cursor `AccessRow[]` |
| `GET /api/admin/users/:id/activity` | `?sessionId=&pageLoadId=&type=&from=&to=&q=&cursor=` | cursor `ActivityRow[]` |
| `GET /api/admin/users/:id/audit` | `?cursor=` | cursor `AuditRow[]` |
| `GET /api/admin/feed` | `?since=` (ISO) | `200 { data: { now, activity: ActivityRow[], access: AccessRow[] } }` |
| `GET /api/admin/alerts` | `?flag=&cursor=` | cursor `AccessRow[]` (flagged only) |
| `GET /api/admin/audit` | `?actor=&action=&targetId=&from=&to=&cursor=` | cursor `AuditRow[]` |

`issuedPassword` is returned only by create and reset, only to the admin who performed it, and is never logged. The client clears it from memory when the one-time dialog closes.

## 6. Password creation and reset

### 6.1 Password service

Put hashing, verification and generation in one module (`auth/passwords`) so the algorithm can be migrated later without changing callers. Use a maintained bcrypt implementation suited to the runtime (pure-JS `bcryptjs` on serverless hosts, native `bcrypt` otherwise). Generate passwords with a cryptographically secure source (`crypto.randomInt` or equivalent), never `Math.random()`. Store only the hash.

Never store plaintext passwords in MongoDB, browser storage, activity events, audit records, server logs, URLs or error reports. Exclude hashes and session tokens from every serializer.

### 6.2 One-time password dialog

After a successful create or reset, show a dialog titled **"Give this password to {name}"** with the password in 32 px monospace, characters spaced for reading aloud, a **Copy** button and a **Done** button. Below it: "This password cannot be viewed again. Reset it if needed." Closing the dialog clears the password from component state. A typed (manual) password is shown the same way so the admin can read it back.

### 6.3 Reset flow and recent authentication

1. Admin clicks **Reset password** → dialog with **Generate** (default) or **Enter manually**, and the note "{name} will be signed out of every device."
2. On confirm, the client calls `POST /api/admin/users/:id/password`.
3. If the response is `REAUTH_REQUIRED`, the client opens **"Confirm it's you"** (admin password field), calls `POST /api/admin/auth/reauth`, and on success retries step 2 automatically. The reauth window is stored on the admin session (`reauthAt`) and lasts 5 minutes.
4. The server hashes the new password, increments the user's `authVersion` (revoking every session), clears that identifier's rate-limit failures so the user can sign in at once, writes the audit event, and returns `issuedPassword`.
5. The one-time dialog (§6.2) opens.

A reset never changes account state. Password reset and admin change-password are the only Reauth actions.

### 6.4 Admin change password

Header account menu → **Change password** → dialog with Current password, New password, Confirm new password. On success the server increments the admin's `authVersion`, revokes all of that admin's sessions, clears the cookie, and the client redirects to `/theadmin?reason=password-changed`, where the login card shows "Password changed. Sign in again."

## 7. Authentication and authorization

### 7.1 Sessions and cookies

- Keep admin and user identities and sessions separate. A user session never authorizes admin routes; an admin session does not authorize the user application.
- Session tokens are opaque: 32 random bytes, base64url. Store only `sha256(token)` in MongoDB.
- Cookie names: `{prefix}_session` (user), `{prefix}_admin` (admin), `{prefix}_device` (device ID, §11.3). All three are `HttpOnly`, `Secure` in production, `SameSite=Lax`, `Path=/`, no `Domain` attribute. Never put tokens in localStorage.
- Cookie `Max-Age` equals the session's remaining absolute lifetime. The server enforces idle and absolute expiry independently of the cookie.

### 7.2 Guards

Centralize `requireUser()` and `requireAdmin()` and call them in every protected page, route handler, server action, upload, download and long-lived connection. On every protected request they check: token exists → not revoked → `now < expiresAt` → session `authVersion` equals the principal's current `authVersion` → principal state is `active` (applying timed resume, §8) → for admins, the session type is admin. Route middleware/proxy redirects and hidden buttons are UX only.

Do not cache authorization results in process memory: revocation must take effect on the very next request on every server instance. (One indexed `findOne` on `tokenHash` plus one on the principal is cheap.)

On failure, APIs return `UNAUTHENTICATED` or `SESSION_ENDED` with a `reason`; pages redirect to the login page with `?reason=` and the login card shows: revoked → "You were signed out by an administrator."; expired → "Your session expired. Sign in again."; paused → "Your access is paused. Contact your administrator."; disabled → "Your account is deactivated. Contact your administrator." In the user app, the global fetch wrapper (§11.6) performs this redirect for any `401` from an `/api/` call.

### 7.3 `authVersion`

Each user and admin has an integer `authVersion` that is stored on every session it creates. Increment it atomically (`$inc`) on password reset, pause, deactivate and revoke-all; for admins on password change and CLI reset. A session whose `authVersion` differs from its principal's is invalid. This keeps old sessions invalid after a resume or activate, and does not depend on a bulk session update succeeding. Still mark the affected sessions `revokedAt` for display.

### 7.4 Expiry and activity

- `idleExpiresAt = lastSeenAt + idle timeout`, capped at `absoluteExpiresAt`; `expiresAt = min(idleExpiresAt, absoluteExpiresAt)` with a TTL index.
- On a protected user request, if `lastSeenAt` is older than 5 minutes, update `lastSeenAt`, `idleExpiresAt`, `expiresAt` and the user's `lastSeenAt` in the same request (awaited, not fire-and-forget).
- Admin background polling (live feed, alert badge) sends header `X-Background-Poll: 1`; the guard validates the session but does not extend idle expiry for those requests.
- Logout revokes the server session and clears the cookie.

### 7.5 CSRF

Every `POST`, `PUT`, `PATCH` and `DELETE` on cookie-authenticated or login endpoints must pass this check before any other work:

1. If the `Origin` header is present, it must exactly equal `APP_ORIGIN` (or one of `APP_ALLOWED_ORIGINS`).
2. If `Origin` is absent, `Sec-Fetch-Site` must be `same-origin`.
3. Otherwise reject with `CSRF_REJECTED`.

Also require `Content-Type: application/json` on bodies (forms cannot send it cross-site without a preflight). Never mutate on `GET`. This check is in addition to `SameSite=Lax`, not instead of it.

### 7.6 Input, output and redirects

- Validate every body and query with a schema; validate IDs as ObjectId hex; allowlist editable fields; reject client-supplied roles, hashes, `authVersion`, actor IDs or audit fields.
- **Return paths** (`?next=`): accept only values that start with a single `/`, do not start with `//` or `/\`, contain no `\`, no control characters and no scheme, and (for admin) start with `/theadmin`. Otherwise use the default.
- Escape stored text in the UI. Return 401 for unauthenticated and 403 for authenticated-but-forbidden.
- Declare public exceptions explicitly in one list (project input). Shared application APIs are protected unless listed.

### 7.7 Login behavior

- Generic `INVALID_CREDENTIALS` for an unknown identifier or wrong password, with a dummy bcrypt compare for unknown identifiers so timing does not reveal accounts.
- Only after the password verifies: `ACCOUNT_PAUSED` / `ACCOUNT_DISABLED` with the messages in §7.2, and no session.
- Check rate limits before the bcrypt compare; record a failure on every wrong password. On success, clear that identifier's 15-minute failures.

### 7.8 Trusted client IP

The client IP feeds rate limiting and monitoring, so it must not be spoofable. Configure:

| Variable | Default | Meaning |
| --- | --- | --- |
| `CLIENT_IP_SOURCE` | `x-forwarded-for` | One of `x-forwarded-for`, `x-real-ip`, `cf-connecting-ip`, `socket` |
| `TRUSTED_PROXY_HOPS` | `1` | For `x-forwarded-for`: number of proxies you control in front of the app |

For `x-forwarded-for`, split on commas and take the entry at index `length - TRUSTED_PROXY_HOPS` (counting from the right), never the leftmost entry, which the client controls. If the header has fewer entries than expected, use `unknown`. Strip ports and the `::ffff:` prefix. Recommended settings: Vercel, Render, Fly, Heroku → `x-forwarded-for`, hops `1`; Cloudflare in front → `cf-connecting-ip`; your own nginx setting `X-Real-IP` → `x-real-ip`; no proxy → `socket`. Document the chosen value in `.env.example`.

## 8. Account state rules

Use `disabled` internally and **Deactivated** in the interface. Paused and Deactivated both block access; they differ in how access is restored.

| Current state | Action | Result | Session consequence |
| --- | --- | --- | --- |
| Active | Pause access | Paused; optional reason and optional future resume time | `authVersion` incremented: all sessions invalid immediately |
| Paused | Resume access | Active; pause fields cleared | User must sign in again |
| Paused | Resume time reached | Active on the next server evaluation | Old sessions stay invalid; fresh login required |
| Active or Paused | Deactivate | Deactivated; pending resume cleared | `authVersion` incremented |
| Deactivated | Activate | Active; explicit admin action only | User must sign in again |
| Any | Reset password | State unchanged | `authVersion` incremented |
| Active | Revoke one session | State unchanged | That session revoked |
| Any | Revoke all sessions | State unchanged | `authVersion` incremented |

Any other transition returns `INVALID_TRANSITION`. An indefinite pause is allowed when no resume time is given. The pause dialog has Reason (optional, ≤ 200) and Resume at (optional date-time in the admin's timezone, shown with the timezone name, must be in the future).

Timed resume is evaluated on the server: whenever a guard, login or admin read sees `status: "paused"` with `pausedUntil <= now`, it runs a conditional update `{ _id, status: "paused", pausedUntil: <the value read> } → status "active"` and writes an audit event with actor `system`. Because the filter includes the exact `pausedUntil`, an expired pause can never overwrite a newer deactivation or an extended pause. No background job is required.

No hard deletion, impersonation or public registration unless the project explicitly requests them.

## 9. MongoDB persistence

Use the existing connection helper (one reused client per process). Collection and field names below are fixed so data, scripts and docs match across projects. Use BSON `Date` for every timestamp.

### 9.1 Collections

**`admins`**

| Field | Type | Notes |
| --- | --- | --- |
| `_id` | ObjectId | |
| `adminId` | string | Normalized (trim, lowercase). Unique |
| `passwordHash` | string | |
| `status` | `"active" \| "disabled"` | Disabled only through the CLI |
| `authVersion` | int | Starts at 1 |
| `createdAt`, `updatedAt`, `passwordUpdatedAt` | Date | |
| `lastLoginAt` | Date \| null | |

**`users`**

| Field | Type | Notes |
| --- | --- | --- |
| `_id` | ObjectId | |
| `name` | string | Display name |
| `loginId` | string | As displayed |
| `loginIdNormalized` | string | Per §2. Unique |
| `loginIdType` | `"username" \| "email" \| "phone"` | |
| `notes` | string | Internal, never shown to the user |
| `details` | object | Project-specific "Additional details" |
| `status` | `"active" \| "paused" \| "disabled"` | |
| `pauseReason`, `pausedUntil`, `pausedAt`, `pausedBy` | string / Date / Date / string, all nullable | |
| `passwordHash` | string | |
| `authVersion` | int | Starts at 1 |
| `createdAt`, `updatedAt`, `passwordUpdatedAt` | Date | `updatedAt` drives `expectedUpdatedAt` |
| `createdBy` | string | Admin ID |
| `lastLoginAt`, `lastSeenAt` | Date \| null | |

**`user_sessions`** and **`admin_sessions`** (same shape)

| Field | Type | Notes |
| --- | --- | --- |
| `_id` | ObjectId | |
| `tokenHash` | string | Unique |
| `principalId` | ObjectId | User or admin `_id` |
| `authVersion` | int | Copied from the principal at creation |
| `createdAt`, `lastSeenAt`, `idleExpiresAt`, `absoluteExpiresAt`, `expiresAt` | Date | `expiresAt` has the TTL index |
| `revokedAt`, `revokedBy`, `revokeReason` | Date / string / string, nullable | `revokeReason`: `logout`, `admin`, `password_reset`, `paused`, `deactivated`, `revoke_all`, `password_changed` |
| `deviceId` | string \| null | From the device cookie (§11.3) |
| `ip`, `userAgent`, `deviceLabel` | string | At creation; `ip` updated with `lastSeenAt` |
| `reauthAt` | Date \| null | Admin sessions only |

**`auth_attempts`**: `_id`, `bucket` (`id:{scope}:{normalized}` or `ip:{ip}`, where scope is `user` or `admin`), `at` (Date), `expiresAt` (`at + 24 h`). Count with `at >= now - window`, so correctness never depends on TTL timing.

**`admin_audit`**

| Field | Type | Notes |
| --- | --- | --- |
| `_id`, `at`, `requestId` | ObjectId, Date, string | |
| `actorType` | `"admin" \| "cli" \| "system"` | |
| `actorId`, `actorLabel` | ObjectId \| null, string | Label is the Admin ID, `cli` or `system` |
| `action` | string | See §9.3 |
| `targetType`, `targetId`, `targetLabel` | nullable | |
| `result` | `"success" \| "failure"` | |
| `changes` | object | Allowlisted `{ field: { from, to } }`; never notes content, passwords, hashes or tokens |
| `ip` | string | |
| `expiresAt` | Date | `at + 365 days`, TTL |

Monitoring collections (`access_events`, `devices`, `activity_events`, `alert_log`) are defined in §11.9.

### 9.2 Indexes

Create all indexes idempotently through the `db:init` command (§10), and also lazily once per process at first use so a forgotten `db:init` never breaks the app.

- `admins`: `{ adminId: 1 }` unique.
- `users`: `{ loginIdNormalized: 1 }` unique; `{ createdAt: -1 }`; `{ status: 1, createdAt: -1 }`; `{ lastSeenAt: -1 }`.
- `user_sessions`, `admin_sessions`: `{ tokenHash: 1 }` unique; `{ principalId: 1, lastSeenAt: -1 }`; `{ expiresAt: 1 }` TTL `expireAfterSeconds: 0`.
- `auth_attempts`: `{ bucket: 1, at: -1 }`; `{ expiresAt: 1 }` TTL 0.
- `admin_audit`: `{ at: -1 }`; `{ targetId: 1, at: -1 }`; `{ actorLabel: 1, at: -1 }`; `{ expiresAt: 1 }` TTL 0.

Enforce uniqueness with indexes, not preflight checks; map duplicate-key errors (code 11000) to `CONFLICT` with a `fields.loginId` message. Keep security updates atomic and fail closed (`STORAGE_UNAVAILABLE`) when MongoDB is unreachable. Never fall back to in-memory or demo accounts.

### 9.3 Audit actions

Write audit events synchronously (awaited, before responding): `admin.login`, `admin.login_failed`, `admin.logout`, `admin.reauth`, `admin.password_changed`, `admin.created` (cli), `admin.password_reset` (cli), `admin.disabled` (cli), `user.created`, `user.updated`, `user.password_reset`, `user.paused`, `user.resumed`, `user.resumed_automatically` (system), `user.deactivated`, `user.activated`, `session.revoked`, `session.revoked_all`. Admins can read the audit log; nothing can edit or delete it.

## 10. CLI: bootstrap, recovery and setup

Provide these commands through the project's script runner (`package.json` scripts, `Makefile`, or `manage.py`, whichever the project uses). Implement them in one file, `scripts/admin-cli.(ts|mjs|py)`, and import the server's password service and config rather than duplicating them (use the project's TypeScript runner such as `tsx` if needed).

| Command | Behavior |
| --- | --- |
| `db:init` | Create every index in §9.2 and §11.9. Safe to rerun |
| `admin:create <adminId>` | Fails if the admin exists. Prompts for the password |
| `admin:reset-password <adminId>` | Fails if the admin does not exist (typo protection). Prompts for the password; increments `authVersion`, revokes all that admin's sessions, clears that admin's login failures |
| `admin:list` | Prints Admin ID, status, last login |
| `admin:disable <adminId>` / `admin:enable <adminId>` | Toggle status; disabling increments `authVersion` |

Password input: hidden interactive prompt asked twice, or `--stdin` to read one line from standard input for automation, or `--generate` to create and print a 12-character password once. Never accept a password as a command-line argument (it lands in shell history). Every command writes an audit event with actor `cli`.

Each command loads `.env.local` / `.env` if present, otherwise uses the environment, so it runs unchanged on a server. It exits non-zero with a clear message when `MONGODB_URI` is missing, and uses a 10-second server-selection timeout so a paused or unreachable cluster fails fast ("Could not reach MongoDB within 10 s. Is the cluster paused or the URI wrong?"). There is no public bootstrap endpoint, default admin, hardcoded Admin ID or automatic reset on startup.

## 11. Monitoring (required)

Monitoring lets the admin (a) see whether credentials are being shared and (b) reconstruct exactly what a user did when they report a problem. Put it in separate modules (`monitoring/*`, `activity/*`) and the tabs and pages listed in §4. It never changes access by itself: flags inform the admin, who decides.

### 11.1 User notice

The user login page shows, under the Sign in button, with a `ShieldAlert` icon: **"Access to this account is monitored, including device, location and activity."** Do not remove it without a project override.

### 11.2 When access is recorded

Write an `access_events` row on: successful login (`login_success`), failed login (`login_failure`), logout (`logout`), admin revocation (`session_revoked`), and **every app open** (`app_open`, once per full page load of the protected app). App opens matter most: users stay signed in for weeks, so sharing a session or reusing a password elsewhere shows up there, not at login.

The client sends the device payload (§11.3) with `POST /api/auth/login` and `POST /api/auth/app-open`. App-open reporting is fire-and-forget: failures are logged to the console and never shown to the user.

### 11.3 What is collected

| Group | Fields | Source |
| --- | --- | --- |
| Network | client IP (§7.8), ISP, org, ASN | Request, IP geolocation |
| IP location | country, countryCode, region, city, lat, lon, timezone, isMobile, isProxy, isHosting | IP geolocation provider (§11.4) |
| GPS | status (`granted`, `denied`, `unavailable`, `timeout`), lat, lon, accuracyM | `navigator.geolocation` |
| Browser and OS | browser and version, engine, OS and version, device type, vendor, model | User-Agent parsed on the server (`ua-parser-js` 1.x, which is MIT; 2.x is AGPL), plus `navigator.userAgentData.getHighEntropyValues(["platformVersion","model","architecture"])` when available |
| Hardware | CPU cores, device memory, GPU vendor and renderer (WebGL debug info), max touch points, screen width/height, color depth | Browser APIs |
| Environment | timezone, locale, languages, cookies enabled, connection type, standalone/PWA, referrer | Browser APIs |
| Identity | `deviceId`, `fingerprint` | See below |

**Device ID.** The server issues `{prefix}_device` as an `HttpOnly` cookie containing a random UUID (400-day `Max-Age`) on the first login or app open that lacks one, and reuses it afterward. It is server-set because browsers such as Safari cap script-written cookies and localStorage at 7 days, which would make returning devices look new. The session stores the device ID it was created with.

**Fingerprint.** SHA-256 (in the browser) of only stable attributes: GPU vendor and renderer, CPU cores, device memory, screen width and height, color depth, timezone, languages, platform, and a 2D canvas text-rendering hash. Exclude `devicePixelRatio`, window size and anything that changes with zoom, a second monitor or browser updates. A fingerprint is a hint that survives cookie clearing, not proof of identity.

MAC addresses, installed software and serial numbers are not available to browsers; do not attempt to collect them. Never collect passwords, session tokens, keystrokes, clipboard contents, file contents or raw form payloads.

Validate and clamp the payload on the server (strings ≤ 200 characters, numbers within plausible ranges, arrays ≤ 10 items). A missing or malformed payload is still recorded with what the server knows (IP, User-Agent, device cookie).

### 11.4 IP geolocation

Wrap the provider in one function, `lookupIpGeo(ip): Promise<IpGeo | null>`, which never throws. Select it with `GEOIP_PROVIDER`: `ip-api` (default; free tier is HTTP-only, 45 requests per minute, non-commercial use only), `ipinfo` (needs `GEOIP_TOKEN`; HTTPS; commercial use allowed), or `none`. Skip private, loopback and `unknown` IPs. Cache results per IP for 24 hours, apply a 3-second timeout, and stay under the provider's rate limit with an in-process budget; when over budget, store the event without geolocation.

### 11.5 GPS

Request a GPS fix when the login page loads (so the prompt is answered by the time the user submits) and on each app open. Race `getCurrentPosition` against a 10-second timer, because the browser's own timeout starts only after the user answers the prompt. Use `enableHighAccuracy: false` and `maximumAge: 5 minutes`. If the Permissions API reports `denied`, do not call `getCurrentPosition` again; record `denied`. Denied or unavailable GPS never blocks access; it is recorded and flagged.

### 11.6 Activity logging

**Client logger (`activity/logger`).** `track(type, name, data?, target?)` stamps `clientAt` (epoch ms), a monotonic `seq` and `path`. Each full page load generates a `pageLoadId` (UUID) sent with every batch, so the timeline can group events by page load and order them by `seq` within it. Queue events in memory and mirror them to `sessionStorage` (key `{prefix}.activityQueue`) so a reload does not lose them. Clear the queue and storage on logout and on login. Cap the queue at 500 events, dropping the oldest.

Flush every 3 seconds or at 25 queued events with `fetch(..., { keepalive: true })`. On `visibilitychange` to hidden and on `pagehide`, flush the whole queue with `fetch` `keepalive`, **in chunks of at most 100 events and 60 KB**, the server batch limit and below the browser's 64 KB keepalive limit. Do not use `navigator.sendBeacon`: it cannot send the `application/json` content type the CSRF check requires. Re-queue a chunk when a flush fails with a network error or 5xx; drop it on 4xx.

**Activity types:** `navigation`, `click`, `change`, `workflow`, `api`, `notification`, `error`, `settings`.

**Automatic capture (`activity/auto-capture`)**, installed once by an `ActivityProvider` that wraps the protected app:

| Captured | How | Recorded |
| --- | --- | --- |
| Page load, client-side route change, tab hidden/visible | Router events, `visibilitychange` | `navigation` with path |
| Clicks | Delegated `click` listener on `button, a, [role=button], [role=tab], [role=menuitem], [role=option], [data-track]` | `click` with label: `data-track` → `aria-label` → trimmed text (≤ 60 characters) |
| Select, checkbox, radio, range, switch, slider | `change` listener; sliders logged on pointer release or arrow-key up, not while dragging | `change` with field name and new value |
| Text inputs | `change` | `change` with field name and `{ edited: true }` only, unless the element has `data-track-value`. Never `type=password`, `type=hidden`, or anything inside `[data-track-ignore]` |
| Errors | `window` `error`, `unhandledrejection`, and a React (or framework) error boundary around the app | `error` with message (≤ 300), source and line |
| API calls | Wrap `window.fetch` for same-origin `/api/` paths, except `/api/activity` | `api` with method, path, status, duration ms; on non-2xx also `error.message` from the response body. Never request or response bodies |
| Notifications | Replace the toast library's import with a project wrapper (`activity/toast`) that logs every variant before showing it; forbid direct imports with a lint rule (`no-restricted-imports`) | `notification` with variant and message |

Redact email addresses to their domain (`@gmail.com`) in every logged string. Store at most 8 KB of `data` per event.

**Business events.** Add explicit `track("workflow", "<domain>.<action>", data)` calls for every event in the project's business-event list (project input), at minimum each primary action, its success and its failure (for example `order.submitted`, `order.submit_failed`, `report.exported`). Document the catalog in the project's docs with each event's `data` fields. Every new user-facing action added later must ship with its `track()` call.

**Server ingest (`POST /api/activity`).** Requires a user session. Accepts at most 100 events and 128 KB per request. Drops events with an unknown `type` or empty `name`. Stamps `userId`, `sessionId` and `deviceId` from the session (never from the client) and `receivedAt` from the server clock; clamps `clientAt` to within 24 hours in the past and 5 minutes in the future (else uses `receivedAt`). Inserts with `insertMany({ ordered: false })`.

### 11.7 Sharing flags and alerts

Compute flags on the server in `monitoring/flags` for every `login_success` and `app_open`, **before** writing that event and its device row (they are compared against history). Store flags on the access event.

| Flag | Rule | Email alert |
| --- | --- | --- |
| `new_device` | Neither the device ID nor the fingerprint has been seen for this user. The user's first device is exempt | Yes |
| `new_country` | IP country never seen before for this user, and the user has earlier history | Yes |
| `far_location` | More than `SHARING_FAR_KM` (100) from the previous successful access, comparing **like with like**: GPS to GPS when both have GPS, otherwise IP location to IP location | Yes |
| `impossible_travel` | Same comparison implies more than `SHARING_IMPOSSIBLE_KMH` (500 km/h), ignoring gaps under 1 minute | Yes |
| `concurrent_devices` | Another unrevoked session of this user, on a different device ID **and** fingerprint, was active within `SHARING_CONCURRENT_WINDOW_MIN` (15) minutes | Yes |
| `session_moved` | The session's stored device ID differs from the request's device cookie (session cookie copied to another browser) | Yes |
| `failed_logins` | At least `SHARING_FAILED_LOGINS` (3) failed logins for this identifier in the last 15 minutes | Yes |
| `vpn_or_proxy` | IP geolocation reports proxy or hosting | No (badge only) |
| `gps_denied` | GPS status `denied` | No (badge only) |

Thresholds live in the config module. Labels shown to the admin: "New device", "New country", "Far from last location", "Impossible travel", "Two devices at once", "Session used on another browser", "Repeated failed logins", "VPN or proxy", "Location denied". Present flags as signals ("possible sharing"), never as proof.

**Alert email.** Send to `ALERT_EMAILS` (comma-separated; blank disables) through the project's email transport, at most once per user per flag per `SHARING_ALERT_THROTTLE_HOURS` (6). Subject: `{App name} alert: {flag labels} ({user name})`. Body: user name and Login ID, flags, this access (time, IP, city/country, GPS with accuracy or GPS status, device label), the previous access in the same format, and a link `{APP_ORIGIN}/theadmin/users/{id}?tab=access`. Sending failures are logged and never fail the login or app open. Record sent alerts in `alert_log` for throttling.

### 11.8 Admin monitoring screens

- **Devices tab:** label (for example "Chrome 131 on Windows 11 · NVIDIA RTX 3060"), first seen, last seen, last IP and city, access count, and a **New** badge for devices first seen in the last 7 days.
- **Access history tab:** time, kind, device label, IP, city/country, GPS status, a **Map** link (`https://www.google.com/maps?q={lat},{lon}`, GPS when available, otherwise IP location, labelled which), and flag badges. Filter by kind and "flagged only".
- **Activity tab:** events grouped by page load (collapsible header: start time, device label, event count, error count), ordered by `seq` within a group, newest group first. Each row shows time (with seconds), a type badge, name, target and a compact `data` preview that expands on click. Error and failed-API rows use `--admin-danger-soft`. Filters: type, date range, text search on name and target, session. A **Jump to first error** button scrolls to the earliest error in the loaded range.
- **Live activity page:** merged activity and access rows across all users, newest first, user name linking to the detail page, at most 200 rows kept. Polls `GET /api/admin/feed?since=` every 5 seconds only while the tab is visible, with `X-Background-Poll: 1`. The server queries from `since` minus 10 seconds (events are written slightly after they are stamped), and the client de-duplicates by `id`, so nothing is missed at poll boundaries.
- **Alerts page:** flagged access events across all users, filterable by flag, newest first, each linking to the user's Access history tab.

Polling is used instead of server-sent events or change streams because it works on every host, including serverless.

### 11.9 Monitoring collections

**`access_events`**: `_id`, `at`, `kind` (`login_success`, `login_failure`, `logout`, `app_open`, `session_revoked`), `principalType` (`user`), `userId` (nullable for unknown identifiers), `loginIdAttempted` (failures only), `sessionId` (nullable), `ip`, `ipGeo` (object or null), `gps`, `deviceId`, `fingerprint`, `deviceLabel`, `ua` (parsed object), `client` (screen, hardware, environment, client hints), `flags` (string array), `expiresAt` (`at + 365 days`). Indexes: `{ userId: 1, at: -1 }`, `{ at: -1 }`, `{ "flags.0": 1, at: -1 }` (partial: flags non-empty), `{ loginIdAttempted: 1, at: -1 }`, `{ expiresAt: 1 }` TTL 0.

**`devices`**: `_id`, `userId`, `deviceId`, `fingerprint`, `label`, `firstSeenAt`, `lastSeenAt`, `lastIp`, `lastCity`, `lastCountry`, `accessCount`. Indexes: `{ userId: 1, deviceId: 1 }` unique, `{ userId: 1, fingerprint: 1 }`. Kept while the user exists.

**`activity_events`**: `_id`, `userId`, `sessionId`, `deviceId`, `pageLoadId`, `seq`, `clientAt`, `receivedAt`, `type`, `name`, `target`, `data`, `path`. Indexes: `{ userId: 1, clientAt: -1 }`, `{ pageLoadId: 1, seq: 1 }`, `{ sessionId: 1, clientAt: -1 }`, `{ receivedAt: 1 }` TTL 30 days (also serves the live-feed `receivedAt > since` query).

**`alert_log`**: `_id`, `userId`, `flag`, `sentAt`. Indexes: `{ userId: 1, flag: 1, sentAt: -1 }`, `{ sentAt: 1 }` TTL 1 day.

**Bounded growth:** failed-login events are subject to the same rate limits as logins (a rate-limited request is rejected with 429 before anything is written), so an attacker cannot grow `access_events` or `admin_audit` without limit.

**Storage budget:** an activity event is about 300–500 bytes. Ten active users at 1,500 events per day for 30 days is about 200 MB. On a 512 MB free tier, keep the 30-day retention and do not log mouse movement, scrolling or keystrokes.

## 12. Environment variables

Add these to `.env.example` with placeholders only. Never expose server secrets through client-side (`NEXT_PUBLIC_` or equivalent) variables.

| Variable | Required | Purpose |
| --- | --- | --- |
| `MONGODB_URI`, `MONGODB_DB` | Yes | Database |
| `APP_ORIGIN` | Yes | Exact origin for CSRF checks and alert links, e.g. `https://app.example.com` |
| `APP_ALLOWED_ORIGINS` | No | Extra allowed origins, comma-separated |
| `COOKIE_PREFIX` | No | Defaults to the project input |
| `CLIENT_IP_SOURCE`, `TRUSTED_PROXY_HOPS` | Yes in production | §7.8 |
| `GEOIP_PROVIDER`, `GEOIP_TOKEN` | No | §11.4 |
| `ALERT_EMAILS` | No | §11.7 |
| Email transport settings | If alerts are on | Reuse the project's; otherwise `SMTP_URL` and `SMTP_FROM` |
| `USER_SESSION_IDLE_DAYS`, `USER_SESSION_MAX_DAYS`, `ADMIN_SESSION_IDLE_MIN`, `ADMIN_SESSION_MAX_HOURS`, `ACTIVITY_RETENTION_DAYS`, `ACCESS_RETENTION_DAYS` | No | Override §2 defaults |

## 13. Testing

Use the project's existing test runner. If the project has none, add **Vitest** (or the language's standard runner) with **mongodb-memory-server** for server tests, and **Playwright** for one end-to-end walkthrough. Cover at minimum:

- Password service: generated passwords are exactly 6 characters from the allowed alphabet with at least one letter and one digit; typed passwords outside 4–6 characters are rejected.
- Guards: every row of the §7.2 check list, including `authVersion` mismatch and expiry while the MongoDB record still exists.
- State machine: every row of §8, every invalid transition, and the timed-resume race (a deactivation between read and resume wins).
- Rate limits: the 15-minute and 24-hour limits, the `Retry-After` header, and reset clearing failures.
- CSRF: wrong `Origin`, missing `Origin` with cross-site `Sec-Fetch-Site`, and wrong content type are rejected.
- Client IP: spoofed leftmost `x-forwarded-for` entries are ignored.
- Return paths: `//evil.com`, `/\evil.com` and `https://evil.com` fall back to the default.
- Monitoring: each flag rule with both positive and negative cases; activity ingest limits and identity stamping; the feed overlap returns events written just after the previous poll.

Report exactly which checks were run and their results.

## 14. Acceptance criteria and delivery

Verify with the tests above and a browser walkthrough:

1. An admin signs in at `/theadmin`, sees the standard interface, creates a user with a generated 6-character password, and copies it from the one-time dialog. Reloading cannot retrieve it.
2. The user signs in at `/login` with that password and uses the protected app. There is no prompt to change the password.
3. A user cookie, a forged field, a missing cookie or a direct unauthenticated request cannot reach admin pages or APIs. Shared application APIs reject requests without a user session unless listed as public exceptions.
4. Pause and Deactivate block new logins and reject existing sessions on the very next request on any server instance. Resume, Activate and timed resume require a fresh login. Timed resume cannot undo a later deactivation.
5. Reset password (after reauth) issues a new password, signs the user out everywhere, lets them sign in immediately even if they were rate limited, and leaves account state unchanged. No password or hash appears in logs, audit records or general APIs.
6. Revoking one session leaves the others working; revoking all ends every session. Logout ends its session on the server.
7. Expired sessions and rate-limit windows behave correctly while their records still exist.
8. Duplicate Login IDs, invalid input, passwords longer than 6 characters, CSRF attempts and database outages produce the documented error codes. Parallel submissions cannot create duplicate accounts.
9. User search, filters, sorting, pagination, Overview counts and audit filters work with real records. Loading, error and empty states and the mobile drawer are usable.
10. Audit history shows the correct actor, target, time and action without secrets. `admin:reset-password` invalidates the admin's prior sessions.
11. Signing in from a second browser produces `new_device` and `concurrent_devices` flags, an alert email (when configured), and entries on the Alerts page and in the live feed within 10 seconds.
12. A walkthrough of the app's primary action appears in the user's Activity tab as an ordered timeline grouped by page load, including clicks, selections, API calls, notifications, errors and the business events, with no passwords, tokens, file contents or full email addresses.
13. Denying the location prompt still allows access and shows "Location denied" on the access event.

Deliver the working implementation, `db:init` and admin CLI commands, `.env.example`, bootstrap instructions ("run `db:init`, then `admin:create <id>`"), concise data-model and business-event documentation, the decisions the owner made in the question rounds, every assumption made without the owner's confirmation, and the list of checks actually run. State any remaining blocker precisely. Keep the app's declared public/private boundaries.

## Reference notes

The layout, routes, API, schema, lifecycle rules, timeouts and retention periods above are this specification's defaults.

- **Deliberate deviation:** user passwords are capped at 6 characters so the admin can read them over the phone. This is far below [OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html) guidance and is acceptable only with the mandatory server-side rate limits (§2, §7.7), admin-issued credentials, and monitoring (§11). Do not relax any of those three.
- [OWASP: Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html): bcrypt cost. Bcrypt is retained as an explicit requirement; OWASP prefers Argon2id for new systems.
- [OWASP: Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html): cookies, server-side expiry, invalidation.
- [OWASP: CSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html): Origin and Fetch Metadata verification.
- [MongoDB: TTL Indexes](https://www.mongodb.com/docs/manual/core/index-ttl/): asynchronous cleanup and index behavior.
