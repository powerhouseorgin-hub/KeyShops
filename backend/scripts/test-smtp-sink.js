// A local SMTP server for testing the email flows: accepts any login and any message, and appends every email it receives to
// $MAIL_LOG (default scripts/mails.log) as one JSON line: { at, to, subject, code, dkim }.
//   cd backend && node scripts/test-smtp-sink.js          (listens on 127.0.0.1:2525)
const fs = require('fs');
const path = require('path');
const { SMTPServer } = require('smtp-server');
const LOG = process.env.MAIL_LOG || path.join(__dirname, 'mails.log');
const server = new SMTPServer({
  authOptional: true,
  disabledCommands: ['STARTTLS'],
  allowInsecureAuth: true,
  onAuth(auth, session, cb) { cb(null, { user: auth.username }); },
  // QUOTA_USERS=one@gmail.com,two@gmail.com: those logins work but every message from them is refused like Gmail does at its daily limit
  onMailFrom(address, session, cb) {
    const quota = (process.env.QUOTA_USERS || '').split(',').filter(Boolean);
    if (session.user && quota.includes(session.user)) return cb(Object.assign(new Error('5.4.5 Daily user sending quota exceeded.'), { responseCode: 550 }));
    cb();
  },
  onData(stream, session, cb) {
    let raw = '';
    stream.on('data', (c) => { raw += c.toString('utf8'); });
    stream.on('end', () => {
      const to = session.envelope.rcptTo.map((r) => r.address).join(',');
      const subject = (/^Subject: (.*)$/m.exec(raw) || [])[1] || '';
      const code = (/\b([0-9]{4}) is your Key Shops verification code/.exec(raw) || [])[1] || '';
      const dkim = /^DKIM-Signature:/mi.test(raw);
      fs.appendFileSync(LOG, JSON.stringify({ at: new Date().toISOString(), to, subject, code, dkim }) + '\n');
      cb();
    });
  },
});
server.listen(2525, '127.0.0.1', () => console.log(`test smtp server on 127.0.0.1:2525, writing ${LOG}`));
