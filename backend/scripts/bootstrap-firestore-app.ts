// Standalone Nest bootstrap for the Firestore rewrite module - separate
// from main.ts (which still boots the live Prisma-based AppModule). Run:
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

// SAFETY: importing anything from @prisma/client (even just the Role enum,
// which every Firestore RolesGuard/@Roles() usage does) triggers Prisma's
// generated client to auto-load backend/.env as a side effect - the SAME
// .env the live production app uses, containing real Razorpay, Supabase,
// and Postgres credentials. A live Razorpay order was actually created
// during this migration's own testing because of this - `payment/create-
// order` silently succeeded against the real account instead of failing
// with "not configured". Deleted here, after every import has run (so it's
// too late for dotenv's side effect to have skipped it) and before
// bootstrap() starts handling any request, so nothing in this standalone
// Firestore-only server can ever reach live payment/database
// infrastructure, no matter what a test script calls.
delete process.env.RAZORPAY_KEY_ID;
delete process.env.RAZORPAY_KEY_SECRET;
delete process.env.DATABASE_URL;
delete process.env.DIRECT_URL;
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.SUPABASE_STORAGE_BUCKET;
delete process.env.RENDER_API_KEY;
delete process.env.JWT_SECRET;

async function bootstrap() {
  // No cookie-parser needed - same as the live app's main.ts, since both
  // the guard's extractToken() and the login cookie-set below work off the
  // raw Cookie header / res.cookie() directly, neither of which needs it.
  const app = await NestFactory.create(FirestoreAppModule, { logger: ['error', 'warn', 'log'] });
  app.setGlobalPrefix('api');
  await app.listen(4100);
  console.log('Firestore-rewrite test server listening on http://localhost:4100');
}

bootstrap();
