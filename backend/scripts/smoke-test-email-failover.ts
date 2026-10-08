// Backup mailboxes with the REAL sender over real SMTP: the first mailbox is refused by the test mail server the way Gmail refuses at its
// daily limit, so the message must go out through the second one, and the first must then be left alone.
//
//   cd backend && QUOTA_USERS=one@gmail.com node scripts/test-smtp-sink.js &     then:   npx ts-node scripts/smoke-test-email-failover.ts
import * as fs from 'fs';
import * as path from 'path';
import { EmailService } from '../src/firestore/email.service';

const LOG = process.env.MAIL_LOG || path.join(__dirname, 'mails.log');
process.env.SMTP_HOST = '127.0.0.1'; process.env.SMTP_PORT = '2525';
process.env.SMTP_USER = 'one@gmail.com'; process.env.SMTP_PASS = 'x'; process.env.EMAIL_FROM = 'Key Shops <one@gmail.com>';
process.env.SMTP_USER_2 = 'two@gmail.com'; process.env.SMTP_PASS_2 = 'y';

const lines = () => (fs.existsSync(LOG) ? fs.readFileSync(LOG, 'utf8').split('\n').filter(Boolean).length : 0);
let failures = 0;
const check = (name: string, ok: boolean) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); if (!ok) failures++; };

async function main() {
  const svc = new EmailService();
  const start = lines();
  check('the message is delivered although the first mailbox is at its limit', await svc.sendCode('customer@example.com', '4821', 'verify your email address', 5));
  await new Promise((r) => setTimeout(r, 400));
  check('exactly one email reached the mail server', lines() === start + 1);
  const second = await svc.sendCode('customer@example.com', '1357', 'verify your email address', 5);
  await new Promise((r) => setTimeout(r, 400));
  check('the next one also goes through (the first mailbox is now skipped)', second && lines() === start + 2);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(2); });
