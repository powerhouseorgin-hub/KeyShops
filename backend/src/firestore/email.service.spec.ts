import { EmailService } from './email.service';

describe('EmailService', () => {
  const oldEnv = { ...process.env };
  beforeEach(() => {
    process.env = { ...oldEnv };
    for (const k of ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'EMAIL_FROM']) delete process.env[k];
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => { process.env = { ...oldEnv }; jest.restoreAllMocks(); });

  it('is not configured without the SMTP settings, and sending reports false instead of throwing', async () => {
    const svc = new EmailService();
    expect(svc.isConfigured()).toBe(false);
    expect(await svc.sendCode('a@example.com', '1234', 'verify your email address', 5)).toBe(false);
  });

  it('needs every setting', () => {
    process.env.SMTP_HOST = 'smtp.example.com'; process.env.SMTP_USER = 'u'; process.env.SMTP_PASS = 'p';
    expect(new EmailService().isConfigured()).toBe(false); // no EMAIL_FROM
    process.env.EMAIL_FROM = 'Key Shops <no-reply@keyshops.in>';
    expect(new EmailService().isConfigured()).toBe(true);
  });

  it('an unreachable provider is reported as not sent, and the code is not written to the log', async () => {
    process.env.SMTP_HOST = '127.0.0.1'; process.env.SMTP_PORT = '1'; process.env.SMTP_USER = 'u'; process.env.SMTP_PASS = 'p';
    process.env.EMAIL_FROM = 'Key Shops <no-reply@keyshops.in>';
    expect(await new EmailService().sendCode('a@example.com', '4821', 'verify your email address', 5)).toBe(false);
    expect((console.error as jest.Mock).mock.calls.flat().join(' ')).not.toContain('4821');
  });
});
