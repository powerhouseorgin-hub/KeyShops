import { onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { FirestorePromotionService } from './firestore/promotion/firestore-promotion.service';
import * as express from 'express';
import * as compression from 'compression';
import { FirestoreAppModule } from './firestore/firestore-app.module';
import { AllExceptionsFilter } from './common/all-exceptions.filter';

// Firebase Functions entry point for the Firestore backend - deployed via
// the Firebase CLI (`firebase deploy --only functions:api`) instead of a
// raw Cloud Run container, so no gcloud CLI/Console access is needed for
// deployment. Functionally the same destination either way: Cloud
// Functions 2nd-gen runs on Cloud Run infrastructure under the hood. See
// main-firestore.ts for the (now unused for deployment, kept for local
// `node dist/src/main-firestore.js` testing) standalone-server version this
// was adapted from - same safety/CORS/pipe/filter setup, just wired to an
// Express handler Cloud Functions invokes directly instead of listening on
// a port.
//
// SAFETY: same reasoning as main-firestore.ts - AllExceptionsFilter's
// @prisma/client import can trigger Prisma's dotenv auto-load. This
// function's env vars come from backend/.env.api (see that file's own
// comment on why NOT the shared backend/.env) which never contains these
// in the first place, but the explicit deletes stay as defense in depth.
// RAZORPAY_KEY_ID/SECRET are deliberately NOT deleted here (unlike the local
// standalone server): in production this function is the payment backend, and
// its env comes from functions-api/.env, never from the shared backend/.env.
delete process.env.DATABASE_URL;
delete process.env.DIRECT_URL;
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.SUPABASE_STORAGE_BUCKET;
delete process.env.RENDER_API_KEY;
delete process.env.JWT_SECRET;

const PROD_ALLOWED_ORIGINS = [
  'https://keyshops.in',
  'https://www.keyshops.in',
  'https://keee-7d6cb.web.app',
  'https://localhost',
  'capacitor://localhost',
];

const expressServer = express();

// Cloud Functions reuses a warm instance across invocations - building the
// whole Nest app (module graph, guards, etc.) on every request would be
// needlessly slow. Built once per instance and cached; every invocation
// after the first cold start reuses it.
let appReady: Promise<INestApplication> | null = null;

async function bootstrap(): Promise<INestApplication> {
  const app = await NestFactory.create(FirestoreAppModule, new ExpressAdapter(expressServer), { bodyParser: false });
  app.use(compression());
  app.use(express.json({ limit: '15mb' }));
  app.use(express.urlencoded({ extended: true, limit: '15mb' }));

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (PROD_ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
      if (process.env.NODE_ENV !== 'production' && /^https?:\/\/localhost(:\d+)?$/.test(origin)) {
        return callback(null, true);
      }
      console.warn(`CORS: blocked request from origin "${origin}"`);
      callback(null, false);
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  app.setGlobalPrefix('api');

  // Same rationale as main-firestore.ts: no whitelist/forbidNonWhitelisted
  // (the Firestore controllers' DTOs are plain interfaces, not
  // class-validator classes) - transform: true alone is safe.
  app.useGlobalPipes(new ValidationPipe({ transform: true }));
  app.useGlobalFilters(new AllExceptionsFilter());

  // init(), not listen() - Cloud Functions owns the actual HTTP listener;
  // this just finishes wiring the Express app up to handle requests.
  await app.init();
  return app;
}

// FirestorePromotionService's @Cron(EVERY_HOUR) can't be relied on here: a
// function instance scales to zero between requests, so an in-process timer
// mostly never fires. This is the real hourly trigger (Cloud Scheduler),
// calling the exact same method.
export const purgeExpiredProducts = onSchedule({ schedule: 'every 60 minutes', region: 'us-central1' }, async () => {
  if (!appReady) appReady = bootstrap();
  const app = await appReady;
  await app.get(FirestorePromotionService).deleteExpiredProducts();
});

// invoker: 'public' is required explicitly - 2nd-gen HTTPS functions don't
// default to public access the way 1st-gen did, so without this every
// request (including genuinely public endpoints like /api/public/shops)
// gets rejected with a GCP-level 403 before ever reaching this app's own
// routing/guards.
export const api = onRequest({ region: 'us-central1', memory: '512MiB', timeoutSeconds: 60, invoker: 'public' }, async (req, res) => {
  if (!appReady) appReady = bootstrap();
  await appReady;
  expressServer(req, res);
});
