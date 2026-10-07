import { WhatsappHealthService } from './whatsapp-health.service';

// Faked Firestore (otpCodes read with a createdAt range, systemHealth/whatsapp get/set) and a faked Graph API.
function setup(otp: Array<{ state?: string; createdAt: number }>) {
  const stored: { whatsapp?: any } = {};
  const firestore: any = {
    db: {
      collection: (col: string) => {
        if (col === 'otpCodes') {
          return {
            where: (_f: string, _op: string, since: number) => ({
              get: async () => ({ docs: otp.filter((o) => o.createdAt >= since).map((o) => ({ data: () => o })) }),
            }),
          };
        }
        return {
          doc: () => ({
            get: async () => ({ exists: !!stored.whatsapp, data: () => stored.whatsapp }),
            set: async (v: any) => { stored.whatsapp = v; },
          }),
        };
      },
    },
  };
  const notes: any[] = [];
  const notifications: any = { createNotification: jest.fn(async (...args: any[]) => { notes.push(args); }) };
  return { service: new WhatsappHealthService(firestore, notifications), stored, notes, notifications };
}

const NOW = 1_800_000_000_000;
const json = (status: number, body: any) => ({ ok: status < 400, status, json: async () => body }) as any;

describe('WhatsappHealthService', () => {
  const oldEnv = { ...process.env };
  const oldFetch = global.fetch;
  let graph: { phone: any; subs: any };
  beforeEach(() => {
    process.env = { ...oldEnv, WHATSAPP_ACCESS_TOKEN: 'tok', WHATSAPP_PHONE_NUMBER_ID: 'PH', WHATSAPP_BUSINESS_ACCOUNT_ID: 'WABA', WHATSAPP_APP_ID: 'APP' };
    graph = {
      phone: json(200, { id: 'PH' }),
      subs: json(200, { data: [{ whatsapp_business_api_data: { id: 'APP' } }] }),
    };
    global.fetch = jest.fn(async (url: any) => (String(url).includes('/WABA/') ? graph.subs : graph.phone)) as any;
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => {
    process.env = oldEnv;
    global.fetch = oldFetch;
    jest.restoreAllMocks();
  });

  it('is healthy when the token reaches the account, the app is subscribed and OTPs are answered', async () => {
    const { service, stored, notifications } = setup([
      { state: 'CODE_SENT', createdAt: NOW - 1000 },
      { state: 'WAITING', createdAt: NOW - 2000 },
    ]);
    const h = await service.run(NOW);
    expect(h.ok).toBe(true);
    expect(h.problems).toEqual([]);
    expect(h.stats).toEqual({ otpRequests24h: 2, answered24h: 1, replyFailures24h: 0 });
    expect(stored.whatsapp.ok).toBe(true);
    expect(notifications.createNotification).not.toHaveBeenCalled();
  });

  it('flags a removed system-user assignment (the WhatsApp account cannot be read) and notifies the Super Admin', async () => {
    graph.subs = json(400, { error: { code: 100, message: 'Unsupported get request. Object does not exist or missing permissions' } });
    const { service, notifications } = setup([]);
    const h = await service.run(NOW);
    expect(h.ok).toBe(false);
    expect(h.problems.join(' ')).toMatch(/can no longer read the WhatsApp Business account/);
    expect(h.problems.join(' ')).toMatch(/system user/);
    expect(notifications.createNotification).toHaveBeenCalledWith('WhatsApp OTP needs attention', expect.any(String), 'WHATSAPP_HEALTH', undefined, 'SUPER_ADMIN');
  });

  it('flags a revoked token that cannot read the phone number', async () => {
    graph.phone = json(401, { error: { code: 190, message: 'Invalid OAuth access token' } });
    const { service } = setup([]);
    const h = await service.run(NOW);
    expect(h.ok).toBe(false);
    expect(h.problems[0]).toMatch(/cannot read the phone number/);
  });

  it('flags the app when it is not subscribed to the account', async () => {
    graph.subs = json(200, { data: [{ whatsapp_business_api_data: { id: 'SOMEONE_ELSE' } }] });
    const { service } = setup([]);
    const h = await service.run(NOW);
    expect(h.ok).toBe(false);
    expect(h.problems.join(' ')).toMatch(/not subscribed/);
  });

  it('flags OTP requests that nobody answered, but not a single one (people do abandon the screen)', async () => {
    const stuck = [1, 2, 3].map((i) => ({ state: 'WAITING', createdAt: NOW - i * 1000 }));
    expect((await setup(stuck).service.run(NOW)).problems.join(' ')).toMatch(/3 OTP requests.*none was ever answered/);
    expect((await setup(stuck.slice(0, 2)).service.run(NOW)).ok).toBe(true);
  });

  it('ignores OTP records older than 24 hours and template-era records without a state', async () => {
    const { service } = setup([
      { state: 'WAITING', createdAt: NOW - 25 * 3600 * 1000 },
      { state: 'WAITING', createdAt: NOW - 26 * 3600 * 1000 },
      { state: 'WAITING', createdAt: NOW - 27 * 3600 * 1000 },
      { createdAt: NOW - 1000 },
    ]);
    const h = await service.run(NOW);
    expect(h.ok).toBe(true);
    expect(h.stats.otpRequests24h).toBe(0);
  });

  it('flags repeated reply failures', async () => {
    const { service } = setup([
      { state: 'SEND_FAILED', createdAt: NOW - 1000 },
      { state: 'SEND_FAILED', createdAt: NOW - 2000 },
    ]);
    expect((await service.run(NOW)).problems.join(' ')).toMatch(/2 OTP replies failed/);
  });

  it('reports a missing account id instead of silently skipping the check', async () => {
    delete process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
    const { service } = setup([]);
    expect((await service.run(NOW)).problems.join(' ')).toMatch(/WHATSAPP_BUSINESS_ACCOUNT_ID is not set/);
  });

  it('treats a network failure as a problem, not a crash', async () => {
    global.fetch = jest.fn(async () => { throw new Error('ECONNRESET'); }) as any;
    const { service } = setup([]);
    const h = await service.run(NOW);
    expect(h.ok).toBe(false);
    expect(h.problems.join(' ')).toMatch(/ECONNRESET/);
  });

  it('announces a recovery once, after a failed check', async () => {
    const { service, notes } = setup([]);
    graph.subs = json(400, { error: { code: 100, message: 'missing permissions' } });
    await service.run(NOW);
    graph.subs = json(200, { data: [{ whatsapp_business_api_data: { id: 'APP' } }] });
    await service.run(NOW + 1);
    await service.run(NOW + 2);
    expect(notes.map((n) => n[0])).toEqual(['WhatsApp OTP needs attention', 'WhatsApp OTP is working again']);
  });
});
