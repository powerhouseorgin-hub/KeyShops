# Key Shop — Duplicate Key Shop Management Platform

Key Shop (internal codename **Kee**) is a multi-tenant SaaS platform for duplicate-key shops.
A **Super Admin** onboards and manages every shop on the network (subscriptions, platform-wide
advertising, the cross-shop Master Key catalogue, revenue, curated taxonomy lists), while each
**Shop Admin** runs their own shop day-to-day (customer records and service invoices, vehicle
sales, machine/product listings, shop settings, documents) — all on one shared Firestore database
with tenant isolation enforced structurally (shop data lives under `shops/{shopId}/…` and every
query is scoped by the caller's token-derived `shopId`, never by client input).

The product ships as:
- A **public marketing site & directory** (`keyshops.in`, anyone, no login) — SEO landing pages,
  shop directory, machines/products directory, active ads, app download.
- A **web admin console** (Super Admin only — see [Login access model](#login-access-model)).
- A **native Android app** (Capacitor-wrapped) — the only way Shop Admins sign in, and also
  serves the same public directory/browse experience to anonymous visitors before login.

**Live:**
- Web app / marketing site: https://keyshops.in (Firebase Hosting)
- Backend API: https://api.keyshops.in (Firebase Hosting → Cloud Function `api`)

> **Full engineering reference:** [`docs/TECHNICAL_DOCUMENTATION.md`](docs/TECHNICAL_DOCUMENTATION.md) —
> architecture, security model, data model, all 109 API endpoints, third-party integrations,
> end-to-end flows, deployment and operations.

## Table of contents

- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Login access model](#login-access-model)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Available scripts](#available-scripts)
- [Android app](#android-app)
- [Deployment](#deployment)
- [Testing](#testing)
- [Documentation](#documentation)
- [SEO status](#seo-status)

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite 5, Tailwind CSS 3, lucide-react, html2canvas + jsPDF (invoices) |
| Mobile | Capacitor 8 (Android), custom WhatsApp-share and save-to-Downloads plugins |
| Backend | NestJS 10 (TypeScript), Firebase Admin SDK, `@nestjs/throttler`, `@nestjs/schedule` |
| Database | Cloud Firestore (subcollection tenancy, composite indexes in `backend/firestore.indexes.json`) |
| Auth | Firebase Authentication (email/password, synthetic email for phone logins), custom claims for roles, web session cookie / native Bearer ID token |
| File storage | Cloud Storage for Firebase (private bucket, Firebase download-token links) |
| Search | [Algolia](https://www.algolia.com/) (fed by Cloud Functions in `backend/functions`) |
| Messaging | WhatsApp Business Cloud API (OTP + invoice delivery) |
| Payments | [Razorpay](https://razorpay.com/) |
| Geocoding | [LocationIQ](https://locationiq.com/) (server-side proxy) |
| Hosting / compute | Firebase Hosting (site + API domain), Cloud Functions Gen2 (Cloud Run), Cloud Scheduler |

## Project structure

```
.
├── backend/                  NestJS API
│   ├── src/functions-main.ts   Cloud Functions entry (api + purgeExpiredProducts)
│   ├── src/main-firestore.ts   Standalone server entry (npm run start:prod)
│   ├── src/firestore/          Application module + every feature (auth, shop, customer, vehicle-sale, ...)
│   ├── functions/              Algolia sync Cloud Functions (codebase "sync")
│   ├── functions-api/          Generated deploy folder for the API function
│   ├── scripts/                Local bootstrap server, seeders, reindex, cleanup, smoke tests
│   ├── firestore.rules, storage.rules   Deny-all (the backend is the only data-access point)
│   └── firestore.indexes.json
├── frontend/                 React app + Capacitor Android project (frontend/android)
├── scripts/deploy-web.js     Safe website deploy (embeds + verifies the APK)
├── docs/                     TECHNICAL_DOCUMENTATION.md, user manual, non-technical overview
└── firebase.json, .firebaserc   Hosting targets (default, api)
```

## Login access model

Two roles, two entry points — enforced on the **backend**, not just hidden in the UI:

- **SUPER_ADMIN** — signs in through the web app. Manages shops, subscriptions, the global
  Master Key catalogue, revenue, advertisement campaigns, and curated taxonomy lists.
- **SHOP_ADMIN** — signs in through the **native Android app only**. The login endpoint rejects
  Shop Admin credentials unless the request carries `platform: "native"`, with a clear error
  pointing to the app download.

The `platform` field (`'web'` vs `'native'`) is set automatically by the frontend using
`Capacitor.isNativePlatform()`. The public landing page and the web login screen both surface a
**"Download App"** button so a Shop Admin who lands on the web login is never stuck.

## Getting started

### Prerequisites

- Node.js 22+ and npm
- Firebase CLI (`npm i -g firebase-tools`), logged in to project `keee-7d6cb` for deploys
- For the Android app: Java 17+ and the Android SDK

### Backend

```bash
cd backend
npm install
cp .env.example .env        # fill in what you need (see Environment variables)
```

Run the API locally against the Firebase emulators (no real data touched):

```bash
npx firebase emulators:start --only firestore,auth,storage
# in a second terminal:
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
  npx ts-node -r tsconfig-paths/register scripts/bootstrap-firestore-app.ts   # http://localhost:4100/api
```

### Frontend

```bash
cd frontend
npm install
npm run dev                 # http://localhost:5173 — /api is proxied to http://localhost:4100
```

Set `DEV_API_PROXY_TARGET` to proxy to a different backend.

## Environment variables

Templates: [`backend/.env.example`](backend/.env.example) and [`frontend/.env.example`](frontend/.env.example).
The full table (what each variable does and which component reads it) is in
[`docs/TECHNICAL_DOCUMENTATION.md`](docs/TECHNICAL_DOCUMENTATION.md#12-configuration-and-environment-variables).

| Variable | Purpose |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Admin SDK credential for local scripts (single-line JSON). Not needed in Cloud Functions. |
| `FIREBASE_WEB_API_KEY`, `FIREBASE_STORAGE_BUCKET` | Password sign-in REST call; Storage bucket (`GCF_*` variants in deployed functions) |
| `ENCRYPTION_KEY` | 64-hex AES-256 key for ID-proof/Aadhaar numbers — required in production |
| `ALGOLIA_APP_ID`, `ALGOLIA_SEARCH_API_KEY`, `ALGOLIA_ADMIN_API_KEY` | Search (admin key only for sync functions / reindex) |
| `LOCATIONIQ_API_KEY` | Reverse geocoding |
| `WHATSAPP_*`, `OTP_SHOW_CODE_IN_UI` | WhatsApp Cloud API delivery and the temporary on-screen OTP fallback |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | Payments |
| `VITE_API_BASE_URL` (frontend) | API origin baked into the build (`https://api.keyshops.in`) |
| `VITE_GA_MEASUREMENT_ID` (frontend) | Optional Google Analytics 4 id |

Deployed values live in the gitignored `backend/functions-api/.env` (API) and `backend/functions/.env`
(sync functions). Never commit a real `.env`.

## Available scripts

**Backend** (`cd backend`)

| Script | Purpose |
|---|---|
| `npm run build` | Compile to `dist/` |
| `npm run start:prod` | Run the compiled standalone server (`dist/src/main-firestore`) |
| `npm run start:dev` | Nest watch mode |
| `npm test` | Unit tests (Jest) |
| `npx ts-node -r tsconfig-paths/register scripts/<name>.ts` | Seeders, `reindex-algolia`, `cleanup-test-data`, `smoke-test-*` |

**Frontend** (`cd frontend`)

| Script | Purpose |
|---|---|
| `npm run dev` | Dev server (`localhost:5173`) |
| `npm run build` | Production build to `dist/` (real entry: `frontend/index.html`) |
| `npm run preview` | Preview the production build locally |

## Android app

The frontend is wrapped as a native Android app via Capacitor (`frontend/android/`), required
for Shop Admin sign-in (see [Login access model](#login-access-model)).

```bash
cd frontend
npm run build
npx cap sync android
cd android
./gradlew assembleRelease    # signed release build (assembleDebug for a debug build)
```

Bump `versionCode` / `versionName` in `frontend/android/app/build.gradle` for every release.

## Deployment

- **Website + APK download** — `node scripts/deploy-web.js` from the repo root: it builds, re-embeds
  the Android APK the landing page links to, deploys Hosting, and verifies the live download.
  **Don't** run a bare `npm run build` + `firebase deploy --only hosting` — the build empties
  `frontend/dist`, which deletes `/downloads/keyshop-app.keeapp`, and the SPA rewrite then serves
  `index.html` in its place (a broken download). Build the APK first; the script refuses a stale or
  invalid APK, and `--keep-live-apk` re-embeds the currently live one for web-only deploys.
- **API** — `cd backend && firebase deploy --only functions:api` (the predeploy step builds and
  generates `functions-api/`). Search-sync functions: `--only functions:sync`. Indexes/rules:
  `--only firestore:indexes` / `firestore:rules`.
- More (runbook, DNS, rollback notes): [`docs/TECHNICAL_DOCUMENTATION.md`](docs/TECHNICAL_DOCUMENTATION.md#13-build-test-and-deploy).

## Testing

```bash
cd backend
npm test          # unit tests (Jest)
```

HTTP smoke tests live in `backend/scripts/smoke-test-*.ts` and run against the local bootstrap
server or a deployed API (`SMOKE_TEST_BASE_URL`). There is currently no automated frontend test
suite.

## Documentation

- [`docs/TECHNICAL_DOCUMENTATION.md`](docs/TECHNICAL_DOCUMENTATION.md) — the engineering reference
  (architecture, API catalogue, integrations, flows, operations).
- [`docs/Kee_User_Manual.pdf`](docs/Kee_User_Manual.pdf) — step-by-step workflows for end users
  (note: still describes the retired SMS OTP).
- [`docs/Kee_Non_Technical_Documentation.pdf`](docs/Kee_Non_Technical_Documentation.pdf) —
  plain-language project overview for business stakeholders.

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
