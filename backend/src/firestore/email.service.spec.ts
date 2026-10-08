import { EmailService } from './email.service';

// A service whose transports are fakes: records every (host, options) it was asked to connect to; `fail` names hosts that refuse.
class FakeTransportEmail extends EmailService {
  connections: Array<{ host: string; options: any; sent: any[] }> = [];
  fail = new Set<string>();
  failWith = new Map<string, any>(); // SMTP user -> the error that mailbox throws
  attempts: string[] = []; // the mailbox (SMTP user, or host for direct delivery) of every send attempt, in order
  protected makeTransport(options: any): any {
    const entry = { host: options.host, options, sent: [] as any[] };
    this.connections.push(entry);
    return {
      sendMail: async (message: any) => {
        this.attempts.push(options.auth?.user || options.host);
        const custom = this.failWith.get(options.auth?.user);
        if (custom) throw custom;
        if (this.fail.has(options.host)) throw Object.assign(new Error('connection refused'), { code: 'ECONNREFUSED' });
        entry.sent.push(message);
      },
    };
  }
}

describe('EmailService', () => {
  const oldEnv = { ...process.env };
  beforeEach(() => {
    process.env = { ...oldEnv };
    for (const k of ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'EMAIL_FROM', 'SMTP_USER_2', 'SMTP_PASS_2', 'EMAIL_FROM_2', 'SMTP_HOST_2', 'SMTP_PORT_2', 'SMTP_USER_3', 'SMTP_PASS_3', 'SMTP_HOST_3', 'SMTP_PORT_3', 'EMAIL_FROM_3', 'EMAIL_DIRECT', 'EMAIL_DIRECT_PORT', 'EMAIL_HELO_HOSTNAME', 'DKIM_DOMAIN', 'DKIM_SELECTOR', 'DKIM_PRIVATE_KEY']) delete process.env[k];
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => { process.env = { ...oldEnv }; jest.restoreAllMocks(); });

  const direct = () => { process.env.EMAIL_DIRECT = 'true'; process.env.EMAIL_FROM = 'Key Shops <no-reply@keyshops.in>'; };
  const relay = () => { process.env.SMTP_HOST = 'smtp.example.com'; process.env.SMTP_USER = 'u'; process.env.SMTP_PASS = 'p'; process.env.EMAIL_FROM = 'Key Shops <no-reply@keyshops.in>'; };

  it('is not configured without any settings, and sending reports false instead of throwing', async () => {
    const svc = new EmailService();
    expect(svc.isConfigured()).toBe(false);
    expect(await svc.sendCode('a@example.com', '1234', 'verify your email address', 5)).toBe(false);
  });

  it('relay needs every SMTP setting; direct needs the switch and a sender address', () => {
    process.env.SMTP_HOST = 'smtp.example.com'; process.env.SMTP_USER = 'u'; process.env.SMTP_PASS = 'p';
    expect(new EmailService().isConfigured()).toBe(false); // no EMAIL_FROM
    process.env.EMAIL_FROM = 'Key Shops <no-reply@keyshops.in>';
    expect(new EmailService().isConfigured()).toBe(true);
    delete process.env.SMTP_HOST;
    expect(new EmailService().isConfigured()).toBe(false); // direct not switched on
    process.env.EMAIL_DIRECT = 'true';
    expect(new EmailService().isConfigured()).toBe(true);
  });

  it('an unreachable relay is reported as not sent, and the code is not written to the log', async () => {
    process.env.SMTP_HOST = '127.0.0.1'; process.env.SMTP_PORT = '1'; process.env.SMTP_USER = 'u'; process.env.SMTP_PASS = 'p';
    process.env.EMAIL_FROM = 'Key Shops <no-reply@keyshops.in>';
    expect(await new EmailService().sendCode('a@example.com', '4821', 'verify your email address', 5)).toBe(false);
    expect((console.error as jest.Mock).mock.calls.flat().join(' ')).not.toContain('4821');
  });

  describe('backup mailboxes (relay failover)', () => {
    const quota = () => Object.assign(new Error('Daily user sending quota exceeded'), { responseCode: 550, response: '550-5.4.5 Daily user sending quota exceeded. For more information on Gmail' });
    const badLogin = () => Object.assign(new Error('Invalid login'), { code: 'EAUTH', responseCode: 535, response: '535-5.7.8 Username and Password not accepted' });
    const noSuchUser = () => Object.assign(new Error('no such user'), { responseCode: 550, response: '550-5.1.1 The email account that you tried to reach does not exist' });
    const timeout = () => Object.assign(new Error('Connection timeout'), { code: 'ETIMEDOUT' });
    const two = () => {
      process.env.SMTP_HOST = 'smtp.gmail.com'; process.env.SMTP_PORT = '587';
      process.env.SMTP_USER = 'one@gmail.com'; process.env.SMTP_PASS = 'p1'; process.env.EMAIL_FROM = 'Key Shops <one@gmail.com>';
      process.env.SMTP_USER_2 = 'two@gmail.com'; process.env.SMTP_PASS_2 = 'p2'; // no EMAIL_FROM_2: defaults to the mailbox itself
    };
    const send = (svc: EmailService) => svc.sendCode('customer@example.com', '4821', 'verify your email address', 5);

    it('uses the first mailbox while it works, and sends as that mailbox', async () => {
      two();
      const svc = new FakeTransportEmail();
      expect(await send(svc)).toBe(true);
      expect(svc.attempts).toEqual(['one@gmail.com']);
      expect(svc.connections[0].sent[0].from).toBe('Key Shops <one@gmail.com>');
    });

    it('moves to the next mailbox when the first has reached its daily limit, then leaves the first alone for an hour', async () => {
      two();
      const svc = new FakeTransportEmail();
      svc.failWith.set('one@gmail.com', quota());
      expect(await send(svc)).toBe(true);
      expect(svc.attempts).toEqual(['one@gmail.com', 'two@gmail.com']);
      const second = svc.connections.find((c) => c.options.auth.user === 'two@gmail.com')!;
      expect(second.sent[0].from).toBe('Key Shops <two@gmail.com>');

      svc.attempts.length = 0;
      expect(await send(svc)).toBe(true);
      expect(svc.attempts).toEqual(['two@gmail.com']); // the first is not even tried

      // after the pause the first mailbox is tried again - and it has recovered
      svc.failWith.clear(); svc.attempts.length = 0;
      const realNow = Date.now();
      jest.spyOn(Date, 'now').mockReturnValue(realNow + 61 * 60 * 1000);
      expect(await send(svc)).toBe(true);
      expect(svc.attempts).toEqual(['one@gmail.com']);
    });

    it('a rejected login also moves on and pauses that mailbox', async () => {
      two();
      const svc = new FakeTransportEmail();
      svc.failWith.set('one@gmail.com', badLogin());
      expect(await send(svc)).toBe(true);
      svc.attempts.length = 0;
      await send(svc);
      expect(svc.attempts).toEqual(['two@gmail.com']);
    });

    it('a timeout moves on for this email but does not pause the mailbox', async () => {
      two();
      const svc = new FakeTransportEmail();
      svc.failWith.set('one@gmail.com', timeout());
      expect(await send(svc)).toBe(true);
      svc.attempts.length = 0;
      await send(svc);
      expect(svc.attempts).toEqual(['one@gmail.com', 'two@gmail.com']); // the first is still tried first
    });

    it('a recipient that does not exist stops right there: no other mailbox is tried and nothing is paused', async () => {
      two();
      const svc = new FakeTransportEmail();
      svc.failWith.set('one@gmail.com', noSuchUser());
      expect(await send(svc)).toBe(false);
      expect(svc.attempts).toEqual(['one@gmail.com']);
      svc.failWith.clear(); svc.attempts.length = 0;
      expect(await send(svc)).toBe(true);
      expect(svc.attempts).toEqual(['one@gmail.com']); // not paused by a customer typo
    });

    it('reports false when every mailbox refuses, and still retries the one that recovers first once all are paused', async () => {
      two();
      const svc = new FakeTransportEmail();
      svc.failWith.set('one@gmail.com', quota()); svc.failWith.set('two@gmail.com', quota());
      expect(await send(svc)).toBe(false);
      expect(svc.attempts).toEqual(['one@gmail.com', 'two@gmail.com']);

      // both paused: a send still probes ONE of them (the one whose pause ends first), so recovery is noticed
      svc.attempts.length = 0; svc.failWith.clear();
      expect(await send(svc)).toBe(true);
      expect(svc.attempts).toEqual(['one@gmail.com']);
    });

    it('a backup mailbox needs its own user and password, may use another provider, and a lone first mailbox still works', async () => {
      process.env.SMTP_HOST = 'smtp.gmail.com'; process.env.SMTP_USER = 'one@gmail.com'; process.env.SMTP_PASS = 'p1'; process.env.EMAIL_FROM = 'Key Shops <one@gmail.com>';
      process.env.SMTP_USER_2 = 'two@gmail.com'; // no password: ignored
      process.env.SMTP_USER_3 = 'three@example.org'; process.env.SMTP_PASS_3 = 'p3'; process.env.SMTP_HOST_3 = 'smtp.example.org'; process.env.SMTP_PORT_3 = '465'; process.env.EMAIL_FROM_3 = 'Key Shops <three@example.org>';
      const svc = new FakeTransportEmail();
      svc.failWith.set('one@gmail.com', quota());
      expect(await send(svc)).toBe(true);
      expect(svc.attempts).toEqual(['one@gmail.com', 'three@example.org']);
      const third = svc.connections.find((c) => c.options.auth.user === 'three@example.org')!;
      expect(third.options).toMatchObject({ host: 'smtp.example.org', port: 465, secure: true });
    });

    it('never writes the code or a password to the log', async () => {
      two();
      const svc = new FakeTransportEmail();
      svc.failWith.set('one@gmail.com', quota()); svc.failWith.set('two@gmail.com', quota());
      await send(svc);
      const logged = (console.error as jest.Mock).mock.calls.flat().join(' ');
      expect(logged).not.toContain('4821');
      expect(logged).not.toMatch(/\bp[12]\b/);
    });
  });

  describe('direct delivery (no provider)', () => {
    it("connects to the recipient's best mail server and delivers the message", async () => {
      direct(); process.env.EMAIL_HELO_HOSTNAME = 'mail.keyshops.in';
      const svc = new FakeTransportEmail();
      svc.resolveMx = async () => [{ exchange: 'mx-backup.example.com', priority: 20 }, { exchange: 'mx.example.com', priority: 10 }];
      expect(await svc.sendCode('owner@example.com', '4821', 'verify your email address', 5)).toBe(true);
      expect(svc.connections.map((c) => c.host)).toEqual(['mx.example.com']); // best first, and no need to try the others
      const { options, sent } = svc.connections[0];
      expect(options).toMatchObject({ port: 25, secure: false, name: 'mail.keyshops.in' });
      expect(options.auth).toBeUndefined(); // direct delivery logs in nowhere
      expect(sent[0]).toMatchObject({ from: 'Key Shops <no-reply@keyshops.in>', to: 'owner@example.com', subject: '4821 is your Key Shops verification code' });
      expect(sent[0].text).toContain('4821');
    });

    it('falls through to the next mail server when one refuses, and gives up (false) when all do', async () => {
      direct();
      const svc = new FakeTransportEmail();
      svc.resolveMx = async () => [{ exchange: 'a.example.com', priority: 10 }, { exchange: 'b.example.com', priority: 20 }, { exchange: 'c.example.com', priority: 30 }, { exchange: 'd.example.com', priority: 40 }];
      svc.fail.add('a.example.com');
      expect(await svc.sendCode('x@example.com', '1111', 'verify', 5)).toBe(true);
      expect(svc.connections.map((c) => c.host)).toEqual(['a.example.com', 'b.example.com']);

      const all = new FakeTransportEmail();
      all.resolveMx = svc.resolveMx;
      ['a.example.com', 'b.example.com', 'c.example.com', 'd.example.com'].forEach((h) => all.fail.add(h));
      expect(await all.sendCode('x@example.com', '1111', 'verify', 5)).toBe(false);
      expect(all.connections).toHaveLength(3); // at most three servers are tried
    });

    it('with no MX record the domain itself receives the mail; an unknown domain is not attempted', async () => {
      direct();
      const noMx = new FakeTransportEmail();
      noMx.resolveMx = async () => { throw Object.assign(new Error('no data'), { code: 'ENODATA' }); };
      expect(await noMx.sendCode('x@plain.example.com', '1111', 'verify', 5)).toBe(true);
      expect(noMx.connections.map((c) => c.host)).toEqual(['plain.example.com']);

      const unknown = new FakeTransportEmail();
      unknown.resolveMx = async () => { throw Object.assign(new Error('not found'), { code: 'ENOTFOUND' }); };
      expect(await unknown.sendCode('x@nowhere.invalid', '1111', 'verify', 5)).toBe(false);
      expect(unknown.connections).toHaveLength(0);
    });

    it('signs with our DKIM key when it is set up, and not otherwise', async () => {
      direct();
      const plain = new FakeTransportEmail();
      plain.resolveMx = async () => [{ exchange: 'mx.example.com', priority: 10 }];
      await plain.sendCode('x@example.com', '1111', 'verify', 5);
      expect(plain.connections[0].options.dkim).toBeUndefined();

      process.env.DKIM_DOMAIN = 'keyshops.in'; process.env.DKIM_SELECTOR = 'mail'; process.env.DKIM_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\\nABC\\n-----END PRIVATE KEY-----';
      const signed = new FakeTransportEmail();
      signed.resolveMx = plain.resolveMx;
      await signed.sendCode('x@example.com', '1111', 'verify', 5);
      expect(signed.connections[0].options.dkim).toEqual({ domainName: 'keyshops.in', keySelector: 'mail', privateKey: '-----BEGIN PRIVATE KEY-----\nABC\n-----END PRIVATE KEY-----' });
    });

    it('a relay, when configured, is used instead of direct delivery', async () => {
      direct(); relay();
      const svc = new FakeTransportEmail();
      svc.resolveMx = async () => { throw new Error('must not be asked'); };
      expect(await svc.sendCode('x@example.com', '1111', 'verify', 5)).toBe(true);
      expect(svc.connections.map((c) => c.host)).toEqual(['smtp.example.com']);
    });

    it('never writes the code to the log when delivery fails', async () => {
      direct();
      const svc = new FakeTransportEmail();
      svc.resolveMx = async () => [{ exchange: 'a.example.com', priority: 10 }];
      svc.fail.add('a.example.com');
      await svc.sendCode('x@example.com', '4821', 'verify', 5);
      expect((console.error as jest.Mock).mock.calls.flat().join(' ')).not.toContain('4821');
    });
  });
});
