// Local Nest bootstrap used by the smoke-test scripts (port 4100). Run:
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
//   npx ts-node -r tsconfig-paths/register scripts/bootstrap-firestore-app.ts
import * as fs from 'fs';
import * as path from 'path';
process.env.FIREBASE_SERVICE_ACCOUNT_JSON = fs.readFileSync(
  path.join(__dirname, '../firebase-service-account-old.json'),
  'utf8',
);

import { NestFactory } from '@nestjs/core';
import { FirestoreAppModule } from '../src/firestore/firestore-app.module';

// SAFETY: a developer's backend/.env may hold the LIVE Razorpay keys, and a live Razorpay order was once
// created by a test run because of it (`payment/create-order` silently succeeded against the real account
// instead of failing with "not configured"). They are deleted here so nothing a smoke test calls can ever
// reach live payment infrastructure.
delete process.env.RAZORPAY_KEY_ID;
delete process.env.RAZORPAY_KEY_SECRET;

async function bootstrap() {
  // No cookie-parser needed - both the guard's extractToken() and the login cookie-set below work off the
  // raw Cookie header / res.cookie() directly, neither of which needs it.
  const app = await NestFactory.create(FirestoreAppModule, { logger: ['error', 'warn', 'log'] });
  app.setGlobalPrefix('api');
  await app.listen(4100);
  console.log('Local test server listening on http://localhost:4100');
}

bootstrap();
