# User accounts — customer signup, email confirmation, admin user management

> **Status: implemented.** Migration `0011_user_accounts.sql` still has to be run
> by hand in the Supabase SQL Editor, and "Confirm email" has to be switched on in
> the Supabase dashboard — see *Prerequisites* below.

## Context

Phase 1 shipped an admin-only auth surface: `POST /auth/login|refresh|logout` + `GET /auth/me`,
cookie-proxied through Express, with `profiles.role` already a two-value enum (`admin` | `customer`)
and an `on_auth_user_created` trigger that auto-creates a `customer` profile. There is **no signup
path anywhere** — grep for `signUp` / `auth.admin` / `createUser` returns zero hits — so every
account today is created by hand in the Supabase dashboard, and orders are pure guest orders with
no `user_id`.

This plan closes the "Customer accounts" seam from ARCHITECTURE.md §10:

- Shoppers self-register at `/signup` with **email + password**, confirm via an emailed link
  (sent through **Resend**, credentials in `apps/api/.env`), then log in at `/login` and see their
  order history at `/account`.
- Admins get a back-office **Users** page to list, create (customer *or* admin) and
  activate/deactivate accounts — so new admins no longer need a dashboard chore.

Non-goals: password reset/forgot-password, profile editing, social login, address book,
per-customer pricing. All remain seams.

---

## Decisions taken

| Decision | Choice |
|---|---|
| Who creates accounts | Public self-signup (always `customer`) **and** admin-created (`customer` or `admin`) |
| Activation | Email confirmation required; email sent by **us** via the Resend REST API, not Supabase SMTP |
| Customer value in this phase | Login + `/account` with **order history** (new `orders.user_id`) |
| Admin Users page | List (paginated + email search), create, activate/deactivate. **No** role change, **no** password reset, **no** hard delete yet |

### Why we send the email ourselves

`db.auth.admin.generateLink()` **creates the user and returns the token without sending anything**.
We then send our own branded email through Resend. This keeps the Resend key in
`apps/api/.env` (as requested), keeps the email template in the repo, and avoids depending on
Supabase dashboard SMTP config. We never call `authAnon.auth.signUp()`, so Supabase never sends a
competing email.

The confirmation link points at the **SPA**, which POSTs the token to Express, which verifies it and
sets the session cookies. The browser still never holds a token — invariant preserved.

```
POST /api/v1/auth/signup
  → db.auth.admin.generateLink({ type:'signup', email, password, options:{ data:{ full_name } } })
      creates auth.users row (unconfirmed) → trigger creates profiles row (role='customer')
      returns properties.hashed_token
  → sendConfirmationEmail(to, `${APP_BASE_URL}/auth/confirm?token=<hashed_token>&type=signup`)
  → 202 { status: 'confirmation_sent', email }        ← no cookies, not logged in

user clicks link → SPA /auth/confirm → POST /api/v1/auth/confirm { token, type }
  → authAnon.auth.verifyOtp({ token_hash, type })  → session
  → setSession(res, tokens) → 200 ProfileDTO → SPA navigates to /account
```

**Resend confirmation** (`POST /auth/resend-confirmation`) re-issues with
`generateLink({ type: 'magiclink', email })` — `signup` cannot be regenerated for an existing user.
Verifying a magiclink also sets `email_confirmed_at`, so the confirm endpoint accepts both types.

---

## Prerequisites (user actions, outside the code)

1. **Supabase dashboard → Authentication → Providers → Email: "Confirm email" ON.**
   Load-bearing: it is what makes `signInWithPassword` reject an unconfirmed user.
2. Add to `apps/api/.env` (and `.env.example` with blank values):
   ```
   RESEND_API_KEY=re_...
   EMAIL_FROM=Tools Jamaica <onboarding@resend.dev>
   ```
   Note: Resend's shared `onboarding@resend.dev` sender can only deliver to the Resend account
   owner's own address. Real signups need a verified domain — expected when the Tools Jamaica
   Resend credentials replace these.
3. Run `apps/api/supabase/migrations/0011_user_accounts.sql` by hand in the SQL Editor.

---

## 1. Migration — `apps/api/supabase/migrations/0011_user_accounts.sql` (new)

Idempotent (`if not exists` / `drop policy if exists`), following `0010`'s style.

- `alter table public.orders add column if not exists user_id uuid references public.profiles(id) on delete set null;`
- `create index if not exists orders_user_id_idx on public.orders (user_id);`
- RLS defence-in-depth: `orders_select_own` — `for select using (auth.uid() = user_id)`;
  same for `order_items` gated through its parent order. No insert/update/delete policies
  (all writes stay service-role).
- `grant select on public.orders, public.order_items to authenticated;`

Nothing to change on `profiles` — the role enum and the `on_auth_user_created` trigger already
cover both flows. Update the "Latest migration" line in `CLAUDE.md`.

## 2. API

### `apps/api/src/config/env.ts`
Add, both optional (`z.preprocess(emptyToUndefined, …)`) so `test/setup.ts` and existing dev envs
keep booting — same reasoning as the `AGENT_API_KEY` comment block:
```ts
RESEND_API_KEY: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
EMAIL_FROM: z.preprocess(emptyToUndefined, z.string().min(3).optional()),
```

### `apps/api/src/lib/email.ts` (new, ~60 lines)
No new npm dependency — Node 24 `fetch` against `https://api.resend.com/emails`.

- `sendEmail({ to, subject, html })` → `Authorization: Bearer ${env.RESEND_API_KEY}`.
- If `RESEND_API_KEY` is unset: in prod throw `AppError.Internal('Email is not configured')`;
  otherwise `logger.warn({ to, subject, html })` and return — so local dev and `npm test` work
  with **the confirmation link printed in the API log**.
- `sendConfirmationEmail(to, link, fullName)` — small inline HTML template using the Drill Navy /
  Safety Orange palette.

### `apps/api/src/modules/auth/schema.ts`
```ts
export const signupSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8).max(200),
  fullName: z.string().trim().min(1).max(120).optional(),
});
export const confirmSchema = z.object({
  token: z.string().min(1).max(500),
  type: z.enum(['signup', 'magiclink']).default('signup'),
});
export const resendConfirmationSchema = z.object({ email: z.string().trim().email() });
```

### `apps/api/src/modules/auth/service.ts`
Reuses `getProfileById` and `tokensFromSession`; keeps the existing `!isActive → Forbidden` check.

- `signupWithPassword(input)` — `generateLink` → build link → `sendConfirmationEmail` → return
  `{ status: 'confirmation_sent', email }`. GoTrue "already registered" →
  `AppError.Conflict('An account with this email already exists — sign in instead.')`.
  *(Deliberate tradeoff: this leaks email existence. A storefront that silently swallows a duplicate
  signup produces support tickets; the enumeration risk on a hardware-store catalog is acceptable.
  Flip to a generic 202 here if that judgement changes.)*
- `confirmSignup(token, type)` — `authAnon.auth.verifyOtp({ token_hash: token, type })` → load
  profile → return `{ profile, tokens }`. Invalid/expired → `AppError.BadRequest`
  (`'This confirmation link is invalid or has expired.'`).
- `resendConfirmation(email)` — `generateLink({ type: 'magiclink', email })` + send. **Always**
  returns 204 regardless of outcome (this one *is* enumeration-sensitive and has no UX cost).
- In `loginWithPassword`, map GoTrue's `email_not_confirmed` to
  `AppError.Forbidden('Please confirm your email address first.')` with code `EMAIL_NOT_CONFIRMED`,
  instead of today's misleading "Invalid email or password".

### `apps/api/src/modules/auth/routes.ts`
```
POST /signup               signupRateLimit,  validate({ body: signupSchema })            → 202
POST /confirm              authRateLimit,    validate({ body: confirmSchema })           → 200 + setSession
POST /resend-confirmation  signupRateLimit,  validate({ body: resendConfirmationSchema })→ 204
```

### `apps/api/src/middleware/rateLimit.ts`
`signupRateLimit` — 60 min window, `limit: isTest ? 1000 : 5`, copying `orderRateLimit`.

### `apps/api/src/app.ts`
Extend `CSRF_EXEMPT` with `/api/v1/auth/signup`, `/api/v1/auth/confirm`,
`/api/v1/auth/resend-confirmation` — a guest has no `sw_csrf` cookie, so without this every signup
403s. List each path explicitly; **do not** shorten to `/api/v1/auth`, which would exempt `/logout`.

### `apps/api/src/modules/account/` (new: `routes.ts`, mapped via the orders mappers)
Mounted `router.use('/account', accountRouter())` in `routes.ts`; whole router behind `requireAuth`.

- `GET /account/orders` → orders where `user_id = req.user.id`, newest first, reusing the existing
  order mapper. A separate module rather than a route on `ordersRouter` because that router carries
  a router-level `orderRateLimit` of 10/hour — correct for placing orders, wrong for reading them.

### `apps/api/src/modules/orders/*`
Add `optionalAuth` (currently defined but unused, `middleware/auth.ts`) to the create-order route and
stamp `user_id: req.user?.id ?? null` on insert. Guest checkout is unchanged. Add `user_id` to
`OrderRow` in `apps/api/src/types/db.ts` and `userId` to the admin order DTO only.

### `apps/api/src/modules/admin/*` — Users section
Follows the brands CRUD shape exactly (`router.use(requireAuth, requireRole('admin'))` already
covers the whole router; `idParamSchema.parse(req.params)` for params, `validate({ body })` for
bodies, `fail()` / `AppError.NotFound` in the service, a `toAdminUserListItem` mapper).

| Method | Path | Notes |
|---|---|---|
| GET | `/admin/users` | `Paginated<AdminUserListItem>`, `?q=` email/name ilike, `?role=`, `?page`, `?pageSize` |
| POST | `/admin/users` | `{ email, password (min 8), fullName?, role }` → `db.auth.admin.createUser({ email_confirm: true, user_metadata: { full_name } })`, then `update profiles set role` when `role === 'admin'`. No email sent — admin-created accounts are pre-confirmed and the admin hands over the password out of band. |
| PATCH | `/admin/users/:id` | `{ isActive }` only. Guard: `if (id === req.user.id) throw AppError.Conflict('You cannot deactivate your own account.')` |

Listing reads `profiles` only — `email_confirmed_at` lives on `auth.users` and merging a paginated
`db.auth.admin.listUsers()` isn't worth it here. Noted as a deliberate omission.

## 3. `packages/shared/src/index.ts`

Alongside the existing `ProfileDTO` / `LoginRequest`:
```ts
export interface SignupRequest { email: string; password: string; fullName?: string; }
export interface SignupResponse { status: 'confirmation_sent'; email: string; }
export interface AdminUserListItem {
  id: string; email: string; fullName: string | null;
  role: Role; isActive: boolean; createdAt: string;
}
```
Add `userId: string | null` to the admin order DTO. Shared is consumed from source — no rebuild.

## 4. Web

### `apps/web/src/lib/api.ts`
New methods in the existing banner-grouped map: `signup`, `confirmSignup`, `resendConfirmation`
(all `_noRefresh: true`, like `login`), `myOrders`, and `adminUsers` / `createUser` /
`setUserActive`. The 401→refresh→retry path and CSRF header need no changes.

### Public pages (new, under `PublicLayout` in `App.tsx`, as siblings of the existing routes so the
`*` catch-all stays last)

| Route | Page | Notes |
|---|---|---|
| `/signup` | `SignupPage.tsx` | email + password + confirm-password + optional name. On 202 swaps to a "Check your inbox" panel with a Resend button. |
| `/login` | `LoginPage.tsx` | Customer-facing sibling of `AdminLoginPage`. On `EMAIL_NOT_CONFIRMED` shows a resend link. Redirects to `/account` (or `/admin` when `role === 'admin'`). |
| `/auth/confirm` | `ConfirmEmailPage.tsx` | Reads `token`/`type` from the query, POSTs once (guard against StrictMode double-fire), `<Loader/>` → success navigates to `/account`, failure offers resend. |
| `/account` | `AccountPage.tsx` | Redirects to `/login` when signed out. Shows email/name, order history via `useAsync(() => api.myOrders())`, sign out. |

`components/Header.tsx` gets an account affordance next to the existing cart/admin links —
`useAuth()`, linking to `/login` when signed out and `/account` when signed in.
`CheckoutPage.tsx` prefills name/email from `user` when present (cheap, and the order now carries
`user_id` anyway).

### Admin
- `pages/admin/AdminUsersPage.tsx` — same shape as `AdminBrandsPage`: `useAsync` list, zebra table,
  inline `UserForm` (`'new' | AdminUserListItem | null`), `ConfirmDialog` for deactivate, shared
  `Select` (never a native `<select>`) for the role picker, `Loader` while loading. English strings,
  hardcoded, like every other admin page.
- `components/admin/AdminLayout.tsx` — **add a role gate**: it currently renders the admin shell for
  any truthy `user`. Once customers can log in, a customer session would see the chrome (every API
  call would still 403). Change to
  `if (!user) return <Navigate to="/admin/login" replace/>;` plus
  `if (user.role !== 'admin') return <Navigate to="/account" replace/>;`
  Add the "Users" `NavLink` to the sidebar.
- `App.tsx` — `users` child route under `/admin`.

### i18n — `apps/web/src/i18n/en.ts` **and** `es.ts`
New `auth.*` and `account.*` keys for the four public pages. `es.ts` is typed `Dictionary`, so a
missed key is a compile error. Admin pages stay English-hardcoded; `components/ui/*` must not gain
an `i18n/` import.

## 5. Tests — `apps/api/test/`

Extend `auth.test.ts` and add `users.test.ts`, reusing `helpers/mockSupabase.ts` and the signed-cookie
+ `vi.mock('../src/lib/jwt.js')` harness from `admin.test.ts`. `mockSupabase` needs stubs for
`db.auth.admin.generateLink` / `createUser` and `authAnon.auth.verifyOtp`; `lib/email.ts` is mocked
at the module boundary. Cases:

- signup: 400 invalid body, 400 short password, 202 sends the email and sets **no** cookies, 409 duplicate
- confirm: 200 sets `sw_at`/`sw_rt` httpOnly + readable `sw_csrf`, 400 on an invalid token
- login: 403 `EMAIL_NOT_CONFIRMED` for an unconfirmed user
- `/admin/users`: 401 anonymous, 403 as `customer`, 200 as `admin`, 403 mutation without the CSRF header
- `PATCH /admin/users/:id` self-deactivation → 409

## 6. Docs

- `ARCHITECTURE.md` §4 endpoint table (+ the new auth routes), the "First admin" note (now the Users
  page after the first one exists), §6 admin table (`/admin/users`), §10 — move "Customer accounts"
  out of Deferred; note password reset as the remaining seam.
- `CLAUDE.md` — "Latest migration: `0011_user_accounts`".
- `apps/api/.env.example` — `RESEND_API_KEY`, `EMAIL_FROM`.

---

## Verification

1. `npm run typecheck && npm run lint && npm test` — all green (the `es.ts` `Dictionary` type is the
   compile-time proof that no translation key was missed).
2. Run `0011_user_accounts.sql` in the Supabase SQL Editor; confirm `orders.user_id` exists.
3. Turn **Confirm email** ON in the Supabase dashboard.
4. `npm run dev`, then with `RESEND_API_KEY` **unset** — the signup flow logs the confirmation link
   to the API console, so the whole loop is testable before the Tools Jamaica Resend domain exists:
   - `/signup` → "Check your inbox" → paste the logged link → lands on `/account`, signed in.
   - Sign out, sign in at `/login` → `/account`.
   - Place an order while signed in → it appears under order history; `orders.user_id` is set.
   - Place an order signed out → still works, `user_id` is null.
   - Try logging in as a user created but not confirmed → the "confirm your email" message, and the
     resend button issues a fresh working link.
5. Set a real `RESEND_API_KEY` and repeat step 4 once against the Resend-account owner's address to
   confirm actual delivery.
6. Admin: `/admin/users` → create a customer and an admin; sign in as the new admin and confirm
   `/admin` renders. Deactivate that customer → their login returns "Account is disabled". Try
   deactivating yourself → 409. Sign in as a customer and hit `/admin` → redirected to `/account`.
