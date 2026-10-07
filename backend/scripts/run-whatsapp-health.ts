// Runs the WhatsApp health check once against the real project (same code as the daily scheduled function) and prints the result.
// The access token is read from functions-api/.env and is never printed. Notifications are NOT created (a stub just logs the title),
// so a manual run never alerts anybody; the result is still stored in systemHealth/whatsapp.
//
//   cd backend && npx ts-node -r tsconfig-paths/register scripts/run-whatsapp-health.ts
import * as fs from 'fs';
import * as path from 'path';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { WhatsappHealthService } from '../src/firestore/whatsapp-health.service';

for (const line of fs.readFileSync(path.join(__dirname, '../functions-api/.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(path.join(__dirname, '../firebase-service-account-old.json'), 'utf8'))) });

async function main() {
  const notifications: any = { createNotification: async (title: string) => console.log('(would notify the Super Admin:', title + ')') };
  const service = new WhatsappHealthService({ db: getFirestore() } as any, notifications);
  const result = await service.run();
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(2); });
