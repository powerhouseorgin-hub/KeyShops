// Creates the DKIM signing key for sending verification emails directly (no email provider) and prints the DNS record to publish.
//
//   cd backend && npx ts-node scripts/generate-dkim.ts [domain] [selector]       (defaults: keyshops.in, mail)
//
// The PRIVATE key is written to backend/dkim-private.pem (git-ignored) - it never leaves your machine and is never printed. Put it in
// the server's environment as DKIM_PRIVATE_KEY (the file's text with line breaks written as \n), together with DKIM_DOMAIN and
// DKIM_SELECTOR. The PUBLIC key is printed below as the TXT record to add at your DNS provider.
import { generateKeyPairSync } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const domain = process.argv[2] || 'keyshops.in';
const selector = process.argv[3] || 'mail';
const out = path.join(__dirname, '../dkim-private.pem');

if (fs.existsSync(out)) {
  console.error(`${out} already exists - delete it first if you really want a new key (the DNS record would have to change too).`);
  process.exit(1);
}

const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'der' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
fs.writeFileSync(out, privateKey, { mode: 0o600 });
const p = (publicKey as Buffer).toString('base64');

console.log(`Private key written to ${out} (keep it secret).\n`);
console.log('1) DKIM - add this TXT record at your DNS provider:');
console.log(`   Name : ${selector}._domainkey.${domain}`);
console.log(`   Value: v=DKIM1; k=rsa; p=${p}\n`);
console.log('2) SPF - one TXT record on the domain, listing the sending server\'s public IP:');
console.log(`   Name : ${domain}`);
console.log('   Value: v=spf1 ip4:<SERVER_PUBLIC_IP> -all\n');
console.log('3) DMARC - one TXT record (start with p=none, tighten later):');
console.log(`   Name : _dmarc.${domain}`);
console.log(`   Value: v=DMARC1; p=none; rua=mailto:postmaster@${domain}\n`);
console.log('4) Reverse DNS (PTR): ask the server\'s host to set the IP\'s reverse name to the EMAIL_HELO_HOSTNAME you will use (e.g. mail.keyshops.in),');
console.log('   and make that name resolve (A record) to the same IP.\n');
console.log('Server environment: EMAIL_DIRECT=true, EMAIL_FROM, EMAIL_HELO_HOSTNAME, DKIM_DOMAIN=' + domain + ', DKIM_SELECTOR=' + selector + ', DKIM_PRIVATE_KEY');
