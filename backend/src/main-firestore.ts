import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import * as express from 'express';
import * as compression from 'compression';
import { FirestoreAppModule } from './firestore/firestore-app.module';
import { AllExceptionsFilter } from './common/all-exceptions.filter';

// Standalone server entrypoint (`npm run start:prod`) - the same app as functions-main.ts, but listening on a
// port instead of being invoked as a Cloud Function. Production deploys use functions-main.ts through Firebase
// Functions; this is for running the built backend locally or in any container.
//
// SAFETY: this standalone server is for local use, and a developer's backend/.env may hold the LIVE Razorpay
// keys. They are dropped here so a local run can never create a real payment order (create-order then fails
// with "not configured"). The deployed Cloud Function deliberately keeps them - there they are the payment
// backend.
delete process.env.RAZORPAY_KEY_ID;
delete process.env.RAZORPAY_KEY_SECRET;

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});

// Production origin allowlist (same list as functions-main.ts) - `credentials: true` requires an explicit
// list rather than a wildcard. Add a service URL here temporarily if you need to hit it directly from a
// browser (Postman/curl/native app requests have no Origin header and are unaffected either way).
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

  // NOT using { whitelist: true, forbidNonWhitelisted: true } -
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
  // 8080 if unset - local default).
  const port = process.env.PORT || 8080;
  await app.listen(port);
  console.log(`Firestore backend successfully started on port ${port}`);
}
bootstrap();
