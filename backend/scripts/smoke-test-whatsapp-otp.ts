// One-off smoke test for WhatsappOtpService against the local Firestore
// emulator - not a permanent part of the app, just proving the send/verify
// cycle works before wiring it into any real controller. Run with:
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npx ts-node -r tsconfig-paths/register scripts/smoke-test-whatsapp-otp.ts
import * as fs from 'fs';
import * as path from 'path';
process.env.FIREBASE_SERVICE_ACCOUNT_JSON = fs.readFileSync(
  path.join(__dirname, '../firebase-service-account-old.json'),
  'utf8',
);

import { FirestoreService } from '../src/firestore/firestore.service';
import { WhatsappOtpService } from '../src/firestore/whatsapp-otp.service';

// Captures the dev-fallback console.log line (no WHATSAPP_* env vars are
// set for this test, so delivery is skipped and the code is only logged -
// same fail-soft behavior the old MSG91 integration had) to pull the real
// code out for this test only. A real caller never does this.
function captureLoggedCode(fn: () => Promise<any>): Promise<{ result: any; code: string | null }> {
  const original = console.log;
  let code: string | null = null;
  console.log = (...args: any[]) => {
    const line = args.join(' ');
    const match = line.match(/code for \d+: (\d{4})/);
    if (match) code = match[1];
    original(...args);
  };
  return fn().then((result) => {
    console.log = original;
    return { result, code };
  });
}

async function main() {
  const firestoreService = new FirestoreService();
  const otp = new WhatsappOtpService(firestoreService);

  const phone = '9876543210';
  const purpose = 'smoke_test';

  console.log('--- sendOtp ---');
  const { result: sendResult, code } = await captureLoggedCode(() => otp.sendOtp(phone, purpose));
  console.log('sendOtp result:', sendResult, '| captured code:', code);
  if (!code) throw new Error('Failed to capture the dev-fallback code - test cannot continue');

  console.log('\n--- verifyOtp with WRONG code (expect rejection) ---');
  try {
    await otp.verifyOtp(phone, purpose, '0000');
    console.log('FAIL: wrong code was accepted');
  } catch (e) {
    console.log('Correctly rejected:', e.message);
  }

  console.log('\n--- verifyOtp with CORRECT code (expect success) ---');
  const verifyResult = await otp.verifyOtp(phone, purpose, code);
  console.log('verifyOtp result:', verifyResult);

  console.log('\n--- verifyOtp again with the SAME code (expect rejection - already consumed) ---');
  try {
    await otp.verifyOtp(phone, purpose, code);
    console.log('FAIL: consumed code was accepted twice');
  } catch (e) {
    console.log('Correctly rejected:', e.message);
  }

  console.log('\nSmoke test complete.');
  process.exit(0);
}

main().catch((e) => {
  console.error('Smoke test failed:', e);
  process.exit(1);
});
