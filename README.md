# Key Shop — Duplicate Key Shop Management Platform

Key Shop (internal codename **KEE**) is a multi-tenant SaaS platform for duplicate-key /
locksmith shops. A **Super Admin** onboards and manages shops across the whole network
(subscriptions, master key catalog, promotions moderation, revenue), while each **Shop Admin**
runs their own shop day-to-day (customers, keys, documents, promotions, reports) — all on a
single shared database with strict tenant isolation enforced at the data-access layer.

The product ships as:
- A **public marketing website** (anyone, no login) — shop directory, feature overview, app download.
- A **web admin console** (Super Admin only — see [Login access model](#login-access-model)).
- A **native Android app** (Capacitor-wrapped) — the only way Shop Admins sign in.

**Live:**
- Web app: https://keee-7d6cb.web.app
- Backend API: https://kee-dopg.onrender.com

---

## Table of contents

- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Login access model](#login-access-model)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Available scripts](#available-scripts)
- [Backend architecture notes](#backend-architecture-notes)
- [Android app](#android-app)
- [Deployment](#deployment)
- [Testing](#testing)
- [Documentation](#documentation)

---

## Tech stack

| Layer | Technology |
|---|---|
| Backend | [NestJS](https://nestjs.com/) (TypeScript), [Prisma ORM](https://www.prisma.io/), PostgreSQL, JWT auth (Passport) |
| Frontend | React 18 + Vite, Tailwind CSS, [lucide-react](https://lucide.dev/) icons |
| Mobile | [Capacitor](https://capacitorjs.com/) — wraps the same React app into a native Android APK |
| File storage | Local disk in dev; [Supabase Storage](https://supabase.com/storage) in production (ephemeral hosts don't persist local disk) |
| Email / SMS OTP | SMTP (Nodemailer) and Twilio; both fall back to console-logged dev codes when unset |
| Local infra | Docker Compose — PostgreSQL for local dev |
| Hosting | Firebase Hosting (frontend, static) + Render (backend API) + [Supabase](https://supabase.com/) (Postgres + Storage) |

## Project structure

```
kee/
├── backend/                     NestJS API (see backend/docs/ for deep-dive docs)
│   ├── src/
│   │   ├── auth/                 Login, OTP (email/SMS), password reset, shop self-registration
│   │   ├── tenant/                Multi-tenant Prisma scoping + soft-delete (read this before writing any query)
│   │   ├── shop/                  Shop CRUD, settings, documents, subscriptions, public shop directory
│   │   ├── customer/               Customer records & documents (shop-scoped + super-admin views)
│   │   ├── key/                    Master key catalog (global + per-shop)
│   │   ├── promotion/              Cross-shop promotions/offers marketplace, moderation
│   │   ├── ad/                     Advertisement management (super admin + shop-facing feed)
│   │   ├── notification/           In-app notifications (shop-scoped + super admin)
│   │   ├── report/                 Dashboards, revenue, support config
│   │   ├── geo/                    Reverse-geocoding proxy endpoint
│   │   ├── crypto/                 Encryption helpers (AES for sensitive PII at rest)
│   │   └── common/                 Shared guards, decorators, validators, file storage abstraction
│   ├── prisma/                    Schema & versioned migrations
│   ├── scripts/                   One-off/maintenance DB scripts (see inline usage comments in each file)
│   └── docs/                      Architecture deep-dives (tenant scoping, schema reference, migration history)
├── frontend/                     React SPA + Capacitor Android shell
│   ├── src/
│   │   ├── App.jsx                  Authenticated app shell (Shop Admin + Super Admin dashboards)
│   │   ├── components/PublicSite.jsx Public marketing site (landing page, shop directory, app download)
│   │   ├── context/AuthContext.jsx   Auth/session state, login (sends `platform: 'web' | 'native'`)
│   │   ├── apiConfig.js              API base URL resolution (dev proxy vs. production)
│   │   └── assets/                   Branding + dashboard icons
│   ├── public/downloads/            Hosted Android APK (see note in firebase.json)
│   ├── android/                    Capacitor-generated native Android project
│   └── scripts/                    One-off asset-processing scripts (image background removal, etc.)
├── firebase.json / .firebaserc     Firebase Hosting config (SPA rewrite, cache headers, APK content-type)
├── docker-compose.yml             Postgres for local dev
└── README.md
```

## Login access model

Two roles, two entry points — this is enforced on the **backend**, not just hidden in the UI:

- **SUPER_ADMIN** — signs in through the web app only. Manages shops, subscriptions, the global
  key catalog, revenue, and moderates the cross-shop promotions feed.
- **SHOP_ADMIN** — signs in through the **native Android app only**. The web login endpoint
  rejects Shop Admin credentials with a clear error and a link to download the app.

This is implemented via a `platform` field (`'web'` vs `'native'`) sent on every login request —
set automatically by the frontend using `Capacitor.isNativePlatform()` — and checked in
`backend/src/auth/auth.service.ts`. The public web landing page and the web login screen both
surface a **"Download App"** button (served from `frontend/public/downloads/`) so a Shop Admin
who lands on the web login is never stuck.

## Getting started

### Prerequisites

- Node.js 18+
- Docker & Docker Compose (for local Postgres)
- Android Studio + JDK 17 (only needed if building the Android app)
- A [Supabase](https://supabase.com/) project (production Postgres + Storage — free tier is enough for dev/staging)

### 1. Start local infrastructure

```bash
docker-compose up -d
```

Starts PostgreSQL on port `5435`. Local dev uses this local Postgres, not Supabase — Supabase is only
needed for staging/production `DATABASE_URL`/`DIRECT_URL` and file uploads.

### 2. Backend

```bash
cd backend
npm install
cp .env.example .env      # fill in real values — see Environment variables below
npm run prisma:generate
npm run prisma:migrate
npm run start:dev
```

API runs at `http://localhost:4000` (see `PORT` in `.env`).

### 3. Frontend (web)

```bash
cd frontend
npm install
npm run dev
```

Runs at `http://localhost:5173`; Vite proxies relative `/api/*` calls to the local backend — no
`VITE_API_BASE_URL` needed for local dev.

## Environment variables

Full reference with inline comments in `backend/.env.example` and `frontend/.env.example`.
Summary:

**Backend** (`backend/.env`)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string — pooled connection (port 6543) on Supabase, direct on local Docker Postgres |
| `DIRECT_URL` | Direct (non-pooled) Postgres connection, used only by `prisma migrate` — required on Supabase, same as `DATABASE_URL` locally |
| `JWT_SECRET` | Signs auth tokens — use a long random value in production |
| `ENCRYPTION_KEY` | 64-hex-char AES key for encrypting sensitive PII at rest — **losing/rotating it makes existing encrypted data unreadable** |
| `PORT`, `NODE_ENV` | Server port / environment |
| `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` + `SUPABASE_STORAGE_BUCKET` | Production file storage (Supabase Storage, private bucket + signed URLs) — required on ephemeral hosts (Render/Railway/Cloud Run); falls back to local disk if unset (dev only) |
| `SEED_SUPER_ADMIN_EMAIL/PASSWORD/NAME` | Auto-seeded on first boot if zero Super Admins exist |
| `SMTP_*` | Real email OTP delivery (Nodemailer) — falls back to console-logged dev OTP if unset |
| `TWILIO_*` | Real SMS OTP delivery — falls back to console-logged dev OTP if unset |

**Frontend** (`frontend/.env`)

| Variable | Purpose |
|---|---|
| `VITE_API_BASE_URL` | Backend base URL for production builds (Firebase Hosting and Render are on different domains, so this can't be a relative proxy in prod). Leave unset for local dev. |

## Available scripts

**Backend** (`cd backend`)

| Script | Purpose |
|---|---|
| `npm run start:dev` | Dev server with hot reload |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run start:prod` | Run the compiled build |
| `npm run prisma:migrate` | Apply Prisma migrations (dev) |
| `npm run prisma:studio` | Open Prisma Studio (DB browser) |
| `npm test` / `npm run test:cov` | Unit tests (Jest) |
| `npm run migrate:shop-documents[:dry-run]` | One-time data migration: legacy embedded documents → `ShopDocument` table |

**Frontend** (`cd frontend`)

| Script | Purpose |
|---|---|
| `npm run dev` | Dev server (`localhost:5173`) |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Preview the production build locally |

## Backend architecture notes

The single most important convention in this codebase: **always query through
`tenantService.prisma`, never `tenantService.<model>` directly** — the former applies
soft-delete filtering and multi-tenant row scoping automatically via a Prisma Client Extension;
the latter silently bypasses both. Full details, gotchas, and the checklist for adding a new
soft-deletable or tenant-scoped model live in
[`backend/docs/DEVELOPER_GUIDE.md`](backend/docs/DEVELOPER_GUIDE.md) — read it before writing
any new Prisma query.

## Android app

The frontend is wrapped as a native Android app via Capacitor (`frontend/android/`), required
for Shop Admin sign-in (see [Login access model](#login-access-model)).

```bash
cd frontend
npm run build
npx cap sync android
cd android
./gradlew assembleDebug
```

The built APK is manually copied to `frontend/public/downloads/keyshop-app.keeapp` (renamed from
`.apk` — see the comment in `firebase.json`: Firebase Hosting's free Spark plan rejects
executable file extensions at deploy time, so it's served under a disguised extension with
response headers restoring the correct MIME type and a `download="KeyShop.apk"` filename
client-side) whenever a new build should be distributed from the web landing page.

## Deployment

- **Frontend** — Firebase Hosting, static SPA (`firebase deploy --only hosting` from repo root
  after `cd frontend && npm run build`). SPA rewrite + long-lived cache headers configured in
  `firebase.json`.
- **Backend** — Render, auto-deploys on every push to `main` (Docker build via `backend/Dockerfile`,
  which runs `prisma migrate deploy` on boot).
- **Database & file storage** — [Supabase](https://supabase.com/) (managed Postgres + Storage). Render only
  hosts the NestJS API itself; it connects out to Supabase via `DATABASE_URL`/`DIRECT_URL`.

Set real production secrets (JWT, encryption key, DB URL, SMTP/Twilio, Supabase URL/service role key)
directly in the Render dashboard's environment variables — never commit a real `.env`.

## Testing

```bash
cd backend
npm test          # unit tests (Jest) — 6 suites covering tenant scoping, soft delete, shop/customer/promotion services
```

There is currently no automated frontend test suite or backend e2e suite.

## Documentation

- [`backend/docs/DEVELOPER_GUIDE.md`](backend/docs/DEVELOPER_GUIDE.md) — tenant scoping & soft-delete conventions (required reading before touching Prisma queries)
- [`backend/docs/MIGRATION_REPORT.md`](backend/docs/MIGRATION_REPORT.md) — write-up of the relational-document-storage + soft-delete refactor
- [`backend/docs/DATABASE_SCHEMA.pdf`](backend/docs/DATABASE_SCHEMA.pdf) — full schema reference (ER diagram, tables, indexes); regenerate with `npx ts-node -r tsconfig-paths/register scripts/generate-schema-doc.ts` from `backend/`

## License

Private / unlicensed — internal project.
