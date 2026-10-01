import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import * as express from 'express';
import * as compression from 'compression';
import { FirestoreAppModule } from './firestore/firestore-app.module';
import { AllExceptionsFilter } from './common/all-exceptions.filter';

// Production entrypoint for the Firestore-rewrite backend, parallel to
// main.ts (which still boots the live Prisma-based AppModule - see its own
// comment). Not yet wired into any deployment: this exists so the Firestore
// stack can be built into its own Docker image and deployed to Cloud Run as
// an independent service for real-infrastructure testing, BEFORE the actual
// cutover decision (pointing keyshops.in's traffic at it) is made. Until
// that cutover happens, deploying this image has no effect on the live app
// or its users - it's reachable only at whatever URL Cloud Run assigns it.
//
// SAFETY: AllExceptionsFilter imports @prisma/client (for its
// PrismaClientKnownRequestError check) purely as an instanceof check that
// will never match here - but importing it at all still triggers Prisma's
// generated client to auto-load a local .env file as a side effect if one
// is present in the working directory. This image is never built with
// backend/.env copied in (see Dockerfile.firestore), so there is nothing
// for it to load in the deployed container - but the explicit deletes below
// are kept anyway as defense in depth, matching the same safety pattern
// scripts/bootstrap-firestore-app.ts already uses for local dev/testing.
delete process.env.RAZORPAY_KEY_ID;
delete process.env.RAZORPAY_KEY_SECRET;
delete process.env.DATABASE_URL;
delete process.env.DIRECT_URL;
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.SUPABASE_STORAGE_BUCKET;
delete process.env.RENDER_API_KEY;
delete process.env.JWT_SECRET;

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});

// Mirrors main.ts's production origin allowlist (see its comment on why
// `credentials: true` requires an explicit list rather than a wildcard).
// Add this service's own Cloud Run URL here temporarily if you need to hit
// it directly from a browser (Postman/curl/native app requests have no
// Origin header and are unaffected either way).
const PROD_ALLOWED_ORIGINS = [
  'https://keyshops.in',
  'https://www.keyshops.in',
  'https://keee-7d6cb.web.app',
  'https://localhost', // Capacitor's default Android WebView origin
  'capacitor://localhost',
];

async function bootstrap() {
  const app = await NestFactory.create(FirestoreAppModule, { bodyParser: false });
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

  // No local-disk static file route here (unlike main.ts's /api/uploads
  // fallback) - this backend always has Firebase Storage configured, so
  // that Supabase-era fallback path doesn't apply.

  // NOT using { whitelist: true, forbidNonWhitelisted: true } like main.ts -
  // the Firestore controllers' @Body() DTOs are plain TypeScript interfaces,
  // not class-validator classes (only the reference-list/support-config
  // controllers use class-validator so far). Whitelist mode strips any
  // property without class-validator metadata, which would silently empty
  // out the request body on every other endpoint (login, send-otp,
  // register-shop, etc.) - `transform: true` alone is safe and still
  // coerces route/query params to the right primitive types.
  app.useGlobalPipes(new ValidationPipe({ transform: true }));

  app.useGlobalFilters(new AllExceptionsFilter());

  // Cloud Run injects PORT at runtime (defaults the container to listen on
  // 8080 if unset - see Dockerfile.firestore's EXPOSE).
  const port = process.env.PORT || 8080;
  await app.listen(port);
  console.log(`Firestore backend successfully started on port ${port}`);
}
bootstrap();
