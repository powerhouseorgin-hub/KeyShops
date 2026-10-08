// Direct delivery (no email provider), end to end with the REAL sender and a REAL DKIM key: finds the "mail server" through a stubbed DNS
// answer that points at the local test SMTP server (scripts/test-smtp-sink.js), delivers a message over actual SMTP and checks it arrived
// signed. Real DNS and port 25 are not involved, so this proves our code, not the network or the DNS records.
//
//   cd backend && node scripts/test-smtp-sink.js &        then:   MAIL_LOG=scripts/mails.log npx ts-node scripts/smoke-test-email-direct.ts
import { generateKeyPairSync } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { EmailService } from '../src/firestore/email.service';

const LOG = process.env.MAIL_LOG || path.join(__dirname, 'mails.log');
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'der' } });

process.env.EMAIL_DIRECT = 'true';
process.env.EMAIL_FROM = 'Key Shops <no-reply@keyshops.in>';
process.env.EMAIL_HELO_HOSTNAME = 'mail.keyshops.in';
process.env.EMAIL_DIRECT_PORT = '2525';
process.env.DKIM_DOMAIN = 'keyshops.in';
process.env.DKIM_SELECTOR = 'mail';
process.env.DKIM_PRIVATE_KEY = (privateKey as string).replace(/\n/g, '\n'); // the way it is written in an environment file

async function main() {
  const svc = new EmailService();
  svc.resolveMx = async () => [{ exchange: '127.0.0.1', priority: 10 }];
  const before = fs.existsSync(LOG) ? fs.readFileSync(LOG, 'utf8').split('\n').filter(Boolean).length : 0;
  const ok = await svc.sendCode('customer@example.com', '4821', "verify your email address", 5);
  await new Promise((r) => setTimeout(r, 500));
  const lines = fs.existsSync(LOG) ? fs.readFileSync(LOG, 'utf8').split('\n').filter(Boolean) : [];
  const got = lines.slice(before).map((l) => JSON.parse(l)).pop();
  const pass = ok && got && got.to === 'customer@example.com' && got.code === '4821' && got.dkim === true;
  console.log(pass ? 'PASS  delivered directly, with our DKIM signature' : `FAIL  sent=${ok} received=${JSON.stringify(got)}`);
  process.exit(pass ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(2); });
