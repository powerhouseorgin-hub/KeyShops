import { EmailService } from './email.service';

// A service whose transports are fakes: records every (host, options) it was asked to connect to; `fail` names hosts that refuse.
class FakeTransportEmail extends EmailService {
  connections: Array<{ host: string; options: any; sent: any[] }> = [];
  fail = new Set<string>();
  protected makeTransport(options: any): any {
    const entry = { host: options.host, options, sent: [] as any[] };
    this.connections.push(entry);
    return {
      sendMail: async (message: any) => {
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
    for (const k of ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'EMAIL_FROM', 'EMAIL_DIRECT', 'EMAIL_DIRECT_PORT', 'EMAIL_HELO_HOSTNAME', 'DKIM_DOMAIN', 'DKIM_SELECTOR', 'DKIM_PRIVATE_KEY']) delete process.env[k];
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
