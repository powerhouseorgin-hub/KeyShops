# Key Shop — Duplicate Key Shop Management Platform

Key Shop (internal codename **Kee**) is a multi-tenant SaaS platform for duplicate-key shops.
A **Super Admin** onboards and manages every shop on the network (subscriptions, platform-wide
advertising, the cross-shop Master Key catalogue, revenue, curated taxonomy lists), while each
**Shop Admin** runs their own shop day-to-day (customer compliance records, machine/product
listings, shop settings, documents) — all on one shared database with tenant isolation enforced
at the service layer (every query is filtered by the caller's JWT-derived `shopId`, never by
client input).

The product ships as:
- A **public marketing site & directory** (`keyshops.in`, anyone, no login) — SEO landing pages,
  shop directory, machines/products directory, active ads, app download.
- A **web admin console** (Super Admin only — see [Login access model](#login-access-model)).
- A **native Android app** (Capacitor-wrapped) — the only way Shop Admins sign in, and also
  serves the same public directory/browse experience to anonymous visitors before login.

**Live:**
- Web app / marketing site: https://keyshops.in (Firebase Hosting)
- Backend API: https://kee-dopg.onrender.com

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
- [SEO status](#seo-status)

---

## Tech stack

| Layer | Technology |
|---|---|
| Backend | [NestJS 10](https://nestjs.com/) (TypeScript), [Prisma 5](https://www.prisma.io/), PostgreSQL, JWT auth (Passport), `@nestjs/throttler` rate limiting |
| Frontend | React 18 + Vite, [lucide-react](https://lucide.dev/) icons — one codebase serves the marketing site, the pre-login native shell, and the authenticated dashboard |
| Mobile | [Capacitor 8](https://capacitorjs.com/) — wraps the same React app into a native Android APK, plus native plugins for camera, GPS, filesystem, share, Razorpay checkout, and Firebase phone auth |
| Payments | [Razorpay](https://razorpay.com/) — order creation + server-side HMAC-SHA256 signature verification gates self-service shop registration |
| SMS / Email OTP | [MSG91](https://msg91.com/) (SMS) and SMTP via Nodemailer (email); both fall back to server-log-only dev codes when unset |
| Native phone auth | [Firebase Admin SDK](https://firebase.google.com/docs/admin/setup) — verifies ID tokens from the native app's client-side Firebase phone verification, an alternate path to MSG91 OTP |
| File storage | Local disk in dev; [Supabase Storage](https://supabase.com/storage) in production (ephemeral hosts don't persist local disk) |
| Local infra | Docker Compose — PostgreSQL for local dev |
| Hosting | Firebase Hosting (frontend, static) + Render (backend API, Docker) + [Supabase](https://supabase.com/) (Postgres + Storage) |

## Project structure

```
kee/
├── backend/                     NestJS API (see backend/docs/ for deep-dive docs)
│   ├── src/
│   │   ├── auth/                  Login, OTP send/verify, Firebase phone verification, shop self-registration, JWT strategy, guards
│   │   ├── shop/                   Shop CRUD, settings, suspension, subscriptions, referrals, public shop directory & search
│   │   ├── shop-category/          Super Admin–curated shop category list (orderable)
│   │   ├── product-type/           Super Admin–curated product-type list
│   │   ├── customer/                Compliance-record CRUD (Shop Admin + Super Admin), document/report uploads, public report download
│   │   ├── promotion/                Machines/Products/Offers listings (the `Promotion` model), public machines directory
│   │   ├── ad/                       Super Admin advertisement campaigns (banner/popup/app-poster), public ad & poster feeds
│   │   ├── key/, key-type/            Platform-wide Master Key catalogue + curated key-type list
│   │   ├── payment/                   Razorpay order creation and signature verification
│   │   ├── notification/              In-app notifications (shop-scoped + Super Admin)
│   │   ├── report/                    Dashboards, revenue log, support configuration
│   │   ├── geo/                       Reverse-geocoding proxy (Nominatim) backing every GPS "Current Location" autofill
│   │   └── common/, prisma/           Shared guards/decorators, tenant-scoped Prisma wrapper, crypto & file-storage services
│   ├── prisma/                    Schema (24 models) & versioned migrations
│   ├── scripts/                   One-off/maintenance DB scripts (see inline usage comments in each file)
│   └── docs/                      Architecture deep-dives (tenant scoping, schema reference, migration history)
├── frontend/                     React SPA + Capacitor Android shell
│   ├── src/
│   │   ├── App.jsx                   Authenticated shell: routing, six-language dictionary, every Shop Admin / Super Admin dashboard view
│   │   ├── components/PublicSite.jsx  Public marketing site (landing page, shop directory, SEO blog/location pages, app download)
│   │   ├── PublicMobileApp.jsx        Pre-login browse experience shown on the native app before sign-in
│   │   ├── context/AuthContext.jsx    Single API client — every network call in the app goes through this one module
│   │   ├── utils/                     PDF builders (customer report), SEO meta helpers, location datasets
│   │   └── assets/                    Branding + dashboard icons
│   ├── index.html                  The real Vite build entry (SEO meta tags/schema live here — NOT `public/index.html`)
│   ├── public/downloads/            Hosted Android APK (see note in firebase.json)
│   ├── android/                    Capacitor-generated native Android project
│   └── scripts/                    One-off asset-processing scripts (image background removal, etc.)
├── docs/                          Client-facing documentation (User Manual, Technical & Non-Technical PDFs — see Documentation below)
├── firebase.json / .firebaserc     Firebase Hosting config (SPA rewrite, cache headers, APK content-type)
├── docker-compose.yml             Postgres for local dev
└── README.md
```

## Login access model

Two roles, two entry points — enforced on the **backend**, not just hidden in the UI:

- **SUPER_ADMIN** — signs in through the web app only. Manages shops, subscriptions, the global
  Master Key catalogue, revenue, advertisement campaigns, and curated taxonomy lists.
- **SHOP_ADMIN** — signs in through the **native Android app only**. The web login endpoint
  rejects Shop Admin credentials (`auth.service.ts`: `if (user.role === SHOP_ADMIN && platform !== 'native')`)
  with a clear error pointing to the app download.

This is implemented via a `platform` field (`'web'` vs `'native'`) sent on every login request —
set automatically by the frontend using `Capacitor.isNativePlatform()`. The public web landing
page and the web login screen both surface a **"Download App"** button so a Shop Admin who lands
on the web login is never stuck.

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
Summary — **no real secret values are reproduced here**; every deployment holds its own values
in the hosting platform's environment configuration, never committed to source control.

**Backend** (`backend/.env`)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Pooled Postgres connection (Supavisor transaction mode) for runtime queries |
| `DIRECT_URL` | Direct Postgres connection, required for `prisma migrate` |
| `JWT_SECRET` | Signs auth tokens — use a long random value in production (currently falls back to a default if unset; see [Technical Documentation](#documentation) §7.2 for the hardening note) |
| `ENCRYPTION_KEY` | AES key for encrypting sensitive PII (ID-proof numbers, Aadhaar) at rest — **losing/rotating it makes existing encrypted data unreadable** |
| `PORT`, `NODE_ENV` | Server port / environment |
| `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` + `SUPABASE_STORAGE_BUCKET` | Production file storage — required on ephemeral hosts (Render); falls back to local disk if unset (dev only) |
| `SEED_SUPER_ADMIN_EMAIL/PASSWORD/NAME` | Auto-seeded on first boot if zero Super Admins exist |
| `SMTP_*` | Email OTP delivery (Nodemailer) — falls back to console-logged dev OTP if unset |
| `MSG91_AUTH_KEY`, `MSG91_OTP_TEMPLATE_ID` | SMS OTP delivery (India, DLT-registered template) — falls back to console-logged dev OTP if unset |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | Payment order creation and signature verification for shop registration |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Firebase Admin SDK credential (raw JSON pasted into the env var, not a file path — Render has no persistent disk) |

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

**Frontend** (`cd frontend`)

| Script | Purpose |
|---|---|
| `npm run dev` | Dev server (`localhost:5173`) |
| `npm run build` | Production build to `dist/` (real entry: `frontend/index.html`) |
| `npm run preview` | Preview the production build locally |

## Backend architecture notes

The single most important convention in this codebase: every tenant-scoped Shop Admin query is
filtered server-side by the caller's JWT-derived `shopId` — never trust a `shopId` from the
request body/params. Every read additionally excludes soft-deleted rows (`deletedAt IS NULL`)
via a shared Prisma wrapper. Full details, gotchas, and the checklist for adding a new
soft-deletable or tenant-scoped model live in
[`backend/docs/DEVELOPER_GUIDE.md`](backend/docs/DEVELOPER_GUIDE.md) — read it before writing
any new Prisma query. For the complete API surface, database schema, and integration reference,
see the [Technical Documentation PDF](#documentation).

## Android app

The frontend is wrapped as a native Android app via Capacitor (`frontend/android/`), required
for Shop Admin sign-in (see [Login access model](#login-access-model)).

```bash
cd frontend
npm run build
npx cap sync android
cd android
./gradlew assembleDebug      # or assembleRelease for a signed release build
```

The built APK is copied to `frontend/public/downloads/` for distribution from the web landing
page's download link whenever a new build should be released.

## Deployment

- **Frontend** — Firebase Hosting, static SPA (`firebase deploy --only hosting` from repo root
  after `cd frontend && npm run build`). SPA rewrite + long-lived cache headers configured in
  `firebase.json`. The real build entry is the project-root `frontend/index.html` — **not**
  anything under `frontend/public/`, which is copied verbatim as static assets only.
- **Backend** — Render, auto-deploys on every push to `main` (Docker build via `backend/Dockerfile`,
  which runs `prisma migrate deploy` on boot).
- **Database & file storage** — [Supabase](https://supabase.com/) (managed Postgres + Storage). Render only
  hosts the NestJS API itself; it connects out to Supabase via `DATABASE_URL`/`DIRECT_URL`.

Set real production secrets (JWT, encryption key, DB URL, SMTP/MSG91, Razorpay, Firebase service
account, Supabase URL/service role key) directly in the Render dashboard's environment
variables — never commit a real `.env`.

## Testing

```bash
cd backend
npm test          # unit tests (Jest) — tenant scoping, soft delete, shop/customer/promotion services
```

There is currently no automated frontend test suite or backend e2e suite.

## Documentation

Client-facing documents (Orbenyx-branded, cover page + watermark) live in [`docs/`](docs/):

- [`docs/Kee_User_Manual.pdf`](docs/Kee_User_Manual.pdf) — step-by-step workflows for login, shop
  creation, customer registration, machines, advertisements, and Super Admin screens, with
  flowcharts.
- [`docs/Kee_Technical_Documentation.pdf`](docs/Kee_Technical_Documentation.pdf) — architecture,
  full API reference, database schema, auth/authorization, integrations, deployment, and security
  considerations, for engineers.
- [`docs/Kee_Non_Technical_Documentation.pdf`](docs/Kee_Non_Technical_Documentation.pdf) —
  plain-language project overview for business stakeholders.

Engineering-only references:

- [`backend/docs/DEVELOPER_GUIDE.md`](backend/docs/DEVELOPER_GUIDE.md) — tenant scoping & soft-delete conventions (required reading before touching Prisma queries)
- [`backend/docs/MIGRATION_REPORT.md`](backend/docs/MIGRATION_REPORT.md) — write-up of the relational-document-storage + soft-delete refactor
- [`backend/docs/DATABASE_SCHEMA.pdf`](backend/docs/DATABASE_SCHEMA.pdf) — full schema reference (ER diagram, tables, indexes); regenerate with `npx ts-node -r tsconfig-paths/register scripts/generate-schema-doc.ts` from `backend/`

## SEO status

The marketing site (`keyshops.in`) has core technical SEO in place: per-page meta tags, canonical
URLs, `Organization`/`WebSite`/`LocalBusiness` JSON-LD in the real `frontend/index.html`,
`robots.txt`, and `sitemap.xml`. Every URL currently listed in `sitemap.xml` resolves to real,
distinct content — no soft-404s or duplicate-content pages:

- **All 5 `/services/*` pages exist** (`frontend/src/components/ServicePage.jsx`, one reusable
  component with unique copy per service slug — car keys, bike keys, home keys, lost-key
  replacement, office keys — each with its own FAQ + `Service`/`FAQPage` schema).
- **All 6 sitemap location pages have real, distinct content**
  (`frontend/src/components/LocationPage.jsx`'s `locationData`) — Chennai, Bangalore, Hyderabad,
  Pune, Mumbai, and a Tamil Nadu state-level page. (`locationData` still falls back to Chennai's
  content for any city typed into the URL that isn't in that list — fine for now since nothing
  else is submitted in the sitemap, but worth knowing if more cities are added later.)
- **All 5 blog articles exist** — the 2 that previously fell through to the home page
  (`/blog/how-to-find-reliable-key-shop`, `/blog/lost-car-key-recovery-guide`) and a 5th
  (`/blog/bike-key-duplication-guide`) that was in `sitemap.xml` with no route at all are now real
  components (`BlogFindReliableShop.jsx`, `BlogLostKeyRecovery.jsx`, `BlogBikeKeyGuide.jsx`).
- **Analytics loader wired, not yet activated** — `frontend/src/utils/analytics.js` loads GA4 only
  when `VITE_GA_MEASUREMENT_ID` is set (see `frontend/.env.example`); it's a safe no-op until a
  real property ID is added to the production env.
- **Google Search Console, Google Analytics 4 property, and Google Business Profile** still need
  to be set up externally (manual, no code change) — add the GA4 ID from Search Console into
  `VITE_GA_MEASUREMENT_ID` on the hosting platform once done.

## License

Private / unlicensed — internal project.
