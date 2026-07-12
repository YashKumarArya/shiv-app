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
  schema.sql     enhanced schema (idempotent)
  seed.ts        applies schema + seeds the admin user
```

- `crudRouter()` handles `GET /` (with `?search=`, whitelisted filters, `?limit/offset`), `GET /:id`, `POST`, `PUT`, `DELETE` — modules only declare their table, zod schemas, joins, and hooks.
- `beforeCreate` hooks handle the module-specific bits: stamping `marked_by`/`created_by`/`issued_by`, hashing passwords, and auto-ending the previous assignment on reassignment (history preserved).
- Uploads: `POST /api/uploads` (multipart) stores to local disk and returns a path; clients save that path on the record. Swap `modules/uploads.ts` for S3/Cloudinary later without touching anything else.

**Schema changes vs the root `schema.sql`** (in `server/db/schema.sql`):
- `app_users.role` (`admin` / `staff`) — the doc requires roles but the original schema had none
- `updated_at` on every table
- `UNIQUE (employee_id, attendance_date)` and `UNIQUE (employee_id, payment_month, payment_year)` — prevents double attendance/salary entries (API returns 409)
- FK indexes; everything `IF NOT EXISTS` so setup is re-runnable

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
cp .env.example .env          # set DATABASE_URL + JWT_SECRET
createdb shivapp              # or create the DB your DATABASE_URL points to
npm run db:setup              # applies schema + seeds admin@agency.com / admin123
npm run dev                   # http://localhost:4000
```

Change the seeded credentials (`ADMIN_EMAIL` / `ADMIN_PASSWORD` env vars) before real use.

**2. Mobile app**

```bash
cd mobile
npm install
npx expo install --fix        # aligns native package versions with the Expo SDK
cp .env.example .env          # EXPO_PUBLIC_API_URL=http://<your-LAN-IP>:4000/api
npx expo start                # scan the QR with Expo Go
```

A physical device can't reach `localhost` — use your machine's LAN IP in `.env`.

## API overview

`POST /api/auth/login` → `{ token, user }`; all other routes need `Authorization: Bearer <token>`.

| Resource | Routes | Notes |
|---|---|---|
| `/dashboard` | GET | counts for the dashboard cards |
| `/uploads` | POST | multipart `file` → `{ path }` |
| `/employees` | full CRUD | `?search=`, `?status=`, `?designation_id=` |
| `/designations` `/locations` | full CRUD | `?search=` |
| `/assignments` | full CRUD | creating one auto-ends the employee's active assignment |
| `/attendance` | full CRUD | `?attendance_date=`, `?employee_id=`; unique per employee/day |
| `/attendance/roster` | GET | `?date=` — active employees with assignment, day's status, month's present days |
| `/payments` | full CRUD | `?employee_id=`, `?payment_month/year=`; unique per employee/month |
| `/documents` `/uniforms` | full CRUD | `?employee_id=` |
| `/users` | full CRUD | admin-only; manage office staff logins |

## Deliberately deferred (from the doc's future list)

Forgot password, dashboard "Recent Activities" feed, per-permission staff roles (currently admin/staff), native date/time pickers (text inputs with validation for now), cloud storage (local disk uploads), and everything in section 9 of the spec.
