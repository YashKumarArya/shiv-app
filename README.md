# Security Agency Management System

Mobile app for security agency admins and office staff to manage employees, client sites, attendance, salary payments, documents, and uniform issuance. Spec: [docx.txt](docx.txt) · Original schema: [schema.sql](schema.sql)

| Part | Stack |
|---|---|
| `mobile/` | Expo (React Native), TypeScript, Expo Router, NativeWind, TanStack Query, React Hook Form + Zod |
| `server/` | Node.js, Express, TypeScript, PostgreSQL, JWT, Zod, Multer |

## Architecture

The guiding principle is **one generic implementation, many tiny configs**.

### Server (`server/`)

```
src/
  config/        env + pg pool with query helpers
  middleware/    auth (JWT + role guard), zod validation, error handler
  lib/crud.ts    generic CRUD router factory — list (search/filter/pagination),
                 get, create, update, delete for any table
  modules/       one small file per feature; most are just a zod schema
                 + crudRouter() config (~25 lines)
  routes.ts      mounts everything under /api
db/
  migrations/    immutable, ordered PostgreSQL migrations (source of truth)
  schema.sql     current-schema reference; never used for deployment
  migrate.ts     migration status/check/apply command
  seed.ts        migrates and creates the first admin user
```

- `crudRouter()` handles `GET /` (with `?search=`, whitelisted filters, `?limit/offset`), `GET /:id`, `POST`, `PUT`, `DELETE` — modules only declare their table, zod schemas, joins, and hooks.
- CRUD mutation hooks and their writes share a database transaction. They stamp
  audit user IDs, hash passwords, serialize payment/uniform checks, and preserve
  assignment history during reassignment.
- Uploads: authenticated `POST /api/uploads` validates and stores an image under
  a UUID filename whose extension comes from the decoded image, not client MIME.
  HEIF is converted to a high-quality JPEG for Android/print compatibility. API
  records contain 15-minute HMAC-signed file paths; knowing the UUID alone no
  longer grants access. Stable unsigned paths remain internal database references.
  Historical UUID files (including extensionless names) stay protected by the
  same signatures and are served only after their raster type is verified from
  their bytes.

**Schema changes vs the original root `schema.sql`** are applied through
`server/db/migrations/`:
- `app_users.role` (`admin` / `staff`) — the doc requires roles but the original schema had none
- `updated_at` on every table
- `UNIQUE (employee_id, attendance_date)` prevents duplicate daily attendance; salary payments support multiple installments per month
- immutable per-employee payroll-period snapshots preserve the salary, designation salary,
  payroll settings, attendance basis, and earned amount used for finalized payroll
- immutable administrator approvals are separate from snapshots, so an existing
  frozen basis can be approved without rewriting its origin or timestamp
- payments are an append-only financial ledger: mistakes are corrected with an
  equal reversal entry and every ledger insert has an immutable audit event;
  optional idempotency keys safely replay a lost/retried payment response, while
  database guards reject unattributed, future-dated, or pre-employment entries
- FK and integrity indexes

Each migration is applied once in its own transaction and recorded with a SHA-256
checksum in `schema_migrations`. A PostgreSQL advisory lock serializes concurrent
migration/release commands. Applied migration files must never be edited; add the next
numbered file instead.

### Mobile (`mobile/`)

```
app/                    file-based routes (Expo Router)
  login.tsx             public
  (app)/                auth-guarded stack
    (tabs)/             Dashboard · Employees · Attendance · More
    <feature>/index     list screens (~25 lines each)
    <feature>/form      create + edit in one screen (?id= switches mode)
src/
  api/                  axios client (token interceptor), entity types
  hooks/useCrud.ts      useList / useItem / useSave / useRemove for any resource
  hooks/useResourceForm useCrud + RHF + zod + load-on-edit + save-and-go-back
  components/
    ResourceList        generic searchable, pull-to-refresh list + FAB
    form/               FormField, FormSelect, FormSwitch, PhotoPicker,
                        ResourceSelect (options fetched from the API)
    ui/                 Screen, Button, Badge, ListCard, InfoRow, …
  providers/AuthProvider  SecureStore-backed session
```

Every list screen is `ResourceList` + a render function; every form is a zod schema + fields. Adding a new module end-to-end is ~3 small files.

## Getting started

**1. Database + API**

```bash
cd server
npm install
cp .env.example .env          # set DATABASE_URL, JWT_SECRET, and first-admin credentials
createdb shivapp              # or create the DB your DATABASE_URL points to
npm run db:setup              # applies migrations + creates the configured first admin
npm run dev                   # http://localhost:4000
```

`ADMIN_EMAIL` and an `ADMIN_PASSWORD` of at least 12 characters are required only
to create the first administrator. For safety, `db:setup` never promotes,
reactivates, or resets an existing account. If all administrators were disabled,
recover one through a deliberate database/operator procedure instead of relying
on a deployment side effect.

An installation created from the original root `schema.sql` may already contain
an active office user but no role information. After migrating that legacy
database, `npm run db:admin:promote` is the explicit one-time compatibility
command to promote the active user matching `ADMIN_EMAIL` and assign the supplied
`ADMIN_PASSWORD`. It refuses inactive users and refuses to run if an active admin
already exists.

Useful migration commands:

```bash
npm run db:migrate:status     # read-only: show applied and pending versions
npm run db:migrate            # explicitly apply pending versions
npm run db:migrate:check      # read-only deployment check; non-zero if pending
npm test                      # focused upload-path, signature, MIME, and cleanup tests
```

API startup is intentionally read-only with respect to schema: it verifies
checksums and refuses to start while a migration is pending. DDL and potentially
large backfills therefore happen in a controlled release step, never while the
HTTP service is binding its port.

Back up the production database before a release with schema changes. Run
`db:migrate:status`, review the new SQL, then apply migrations before directing
traffic to the new API. If a migration finds incompatible legacy rows it aborts
and rolls back; correct the reported data instead of editing an applied migration.
In particular, the ledger migration refuses legacy payments dated in the future,
assigned to a future payroll period, or assigned before the employee joined;
review and correct those rows before making them immutable.

The immutable-payroll migration freezes eligible completed employee months and
existing payment periods. Salary/designation/settings history from before this
release did not exist and cannot be reconstructed automatically, so those rows are
explicitly labeled **migration estimates**: they preserve the values and attendance
visible at migration time, not independently verified historical terms. Review
historical payroll before production migration and correct source data first if the
old application had already recalculated a period incorrectly. For an employee
already marked Inactive, migration estimates are retained only for months backed
by attendance, a payment, or an overlapping ended assignment; there was no legacy
termination-date history from which additional months could be inferred safely.

**2. Mobile app**

```bash
cd mobile
npm install
npx expo install --fix        # aligns native package versions with the Expo SDK
cp .env.example .env          # EXPO_PUBLIC_API_URL=http://<your-LAN-IP>:4000/api
npx expo start                # scan the QR with Expo Go
```

A physical device can't reach `localhost` — use your machine's LAN IP in `.env`.

## Deploying the backend (Railway)

The server never changes schema at HTTP startup. It verifies migration history and
fails fast when the release step was skipped. Run `npm run db:setup` once when the
database is first created; it applies migrations and creates the configured first
admin. Recurring deployments use `npm run db:migrate` as the pre-deploy command.
`npm start` then performs only the read-only schema check before serving traffic.

1. [railway.com](https://railway.com) → New Project → **Deploy from GitHub repo** → pick this repo.
2. On the service: Settings → **Root Directory** = `server`. Railway auto-runs `npm run build` + `npm start`.
3. In the project: **+ Create → Database → PostgreSQL**.
4. Service → Variables:
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}` (reference the DB you just added)
   - `JWT_SECRET` = output of `openssl rand -hex 32`
   - `ADMIN_EMAIL` / `ADMIN_PASSWORD` = real credentials for the one-time `db:setup`
   - `UPLOAD_DIR` = `/data/uploads`
   - `BUSINESS_TIME_ZONE` = `Asia/Kolkata` (sets every PostgreSQL pooled session's business date)
5. For the first deployment, temporarily set Service → Settings → Deploy →
   **Pre-deploy Command** = `npm run db:setup`. After that deployment creates the
   initial admin, change it to `npm run db:migrate` for future releases.
6. Service → Settings → **+ Volume**, mount path `/data` — uploaded photos/documents
   survive redeploys. (Skipping this loses all uploads on every deploy.)
7. Settings → Networking → **Generate Domain** → you get `https://<name>.up.railway.app`.
   Check `https://<name>.up.railway.app/health` returns `{"ok":true}`.

Then point the mobile app at it: set `EXPO_PUBLIC_API_URL=https://<name>.up.railway.app/api`
in `mobile/.env` (and in the EAS build profile when building an APK).

## API overview

`POST /api/auth/login` → `{ token, user }`; all other routes need `Authorization: Bearer <token>`.

| Resource | Routes | Notes |
|---|---|---|
| `/dashboard` | GET | counts for the dashboard cards |
| `/uploads` | POST | authenticated multipart image upload → a short-lived signed `{ path }` |
| `/uploads/:filename` | GET | serves a file only when its `expires` and `signature` query values are valid |
| `/employees` | full CRUD | `?search=`, `?status=`, `?designation_id=` |
| `/designations` `/locations` | full CRUD | `?search=` |
| `/assignments` | full CRUD | creating one auto-ends the employee's active assignment |
| `/attendance` | full CRUD | `?attendance_date=`, `?employee_id=`; unique per employee/day |
| `/attendance/roster` | GET | `?date=` — active employees with assignment, day's status, month's worked days |
| `/attendance/employee/:employeeId/calendar` | GET | `?month=YYYY-MM` — employee identity, monthly status calendar, worked/marked totals |
| `/payments` | GET, POST | append-only installments; optional `idempotency_key` safely replays identical retries; `PUT`/`DELETE` are rejected; totals sign reversals |
| `/payments/:id/reverse` | POST (admin) | requires a reason; appends an equal opposite entry without changing the original payment |
| `/payments/:id/audit` | GET (admin) | immutable recorded/imported/reversed audit history with actor and metadata |
| `/payments/tracking` | GET | read-only `?month=&year=&employee_id=` — live estimate or immutable snapshot, signed paid total, approval state, and legacy-estimate flag |
| `/payments/tracking/finalize` | POST (admin) | explicitly creates a snapshot when absent and appends a separate approval; historical payments require approval |
| `/settings` | GET, PUT (admin) | app settings; `salary_exclude_sundays` and `salary_off_days` configure payable days |
| `/documents` `/uniforms` | full CRUD | `?employee_id=` |
| `/users` | full CRUD | admin-only; manage office staff logins |

## Deliberately deferred (from the doc's future list)

Forgot password, dashboard "Recent Activities" feed, per-permission staff roles (currently admin/staff), cloud storage (local disk uploads), and everything in section 9 of the spec.
