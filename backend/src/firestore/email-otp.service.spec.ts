import { EmailOtpService } from './email-otp.service';
import { WhatsappOtpService } from './whatsapp-otp.service';

// A small in-memory Firestore: collection/doc (get/set/update/delete), where('==') chains, limit, orderBy, batch and transactions.
function fakeFirestore() {
  const docs = new Map<string, any>();
  let seq = 0;
  const ref = (path: string): any => ({
    id: path.split('/').pop(),
    path,
    get: async () => ({ exists: docs.has(path), data: () => docs.get(path) }),
    set: async (v: any) => { docs.set(path, v); },
    update: async (patch: any) => { docs.set(path, { ...docs.get(path), ...patch }); },
    delete: async () => { docs.delete(path); },
  });
  const query = (col: string, filters: Array<[string, any]> = [], max = Infinity, order?: string): any => ({
    where: (f: string, _op: string, v: any) => query(col, [...filters, [f, v]], max, order),
    limit: (n: number) => query(col, filters, n, order),
    orderBy: (f: string) => query(col, filters, max, f),
    get: async () => {
      let rows = [...docs.entries()].filter(([p, d]) => p.startsWith(col + '/') && filters.every(([f, v]) => d[f] === v));
      if (order) rows = rows.sort((a, b) => b[1][order] - a[1][order]);
      rows = rows.slice(0, max);
      return { empty: rows.length === 0, docs: rows.map(([p, d]) => ({ id: p.split('/').pop(), ref: ref(p), data: () => d })) };
    },
  });
  const db: any = {
    collection: (col: string) => ({ ...query(col), doc: (id?: string) => ref(`${col}/${id ?? 'doc' + (++seq)}`) }),
    batch: () => {
      const ops: Array<() => void> = [];
      return {
        update: (r: any, patch: any) => ops.push(() => docs.set(r.path, { ...docs.get(r.path), ...patch })),
        set: (r: any, data: any) => ops.push(() => docs.set(r.path, data)),
        commit: async () => ops.forEach((o) => o()),
      };
    },
    runTransaction: async (fn: any) => {
      const pending: Array<() => void> = [];
      const tx = {
        get: async (r: any) => ({ exists: docs.has(r.path), data: () => docs.get(r.path) }),
        update: (r: any, patch: any) => pending.push(() => docs.set(r.path, { ...docs.get(r.path), ...patch })),
        set: (r: any, data: any) => pending.push(() => docs.set(r.path, data)),
        delete: (r: any) => pending.push(() => docs.delete(r.path)),
      };
      const out = await fn(tx);
      pending.forEach((p) => p());
      return out;
    },
  };
  return { firestore: { db } as any, docs };
}

const EMAIL = 'owner@example.com';

describe('EmailOtpService', () => {
  const oldEnv = { ...process.env };
  let configured: boolean;
  let delivers: boolean;
  let mail: { sendCode: jest.Mock; isConfigured: () => boolean };
  beforeEach(() => {
    process.env = { ...oldEnv };
    delete process.env.OTP_SHOW_CODE_IN_UI;
    delete process.env.FIRESTORE_EMULATOR_HOST;
    configured = true; delivers = true;
    mail = { isConfigured: () => configured, sendCode: jest.fn(async () => delivers) };
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => { process.env = { ...oldEnv }; jest.restoreAllMocks(); });

  function setup() {
    const fx = fakeFirestore();
    const otp = new WhatsappOtpService(fx.firestore);
    const svc = new EmailOtpService(fx.firestore, otp, mail as any);
    return { ...fx, svc };
  }
  const codeSent = () => mail.sendCode.mock.calls[0][1] as string;
  const addAccount = (docs: Map<string, any>, over: Record<string, unknown> = {}) => {
    docs.set('users/u1', { email: EMAIL, emailVerified: true, phone: '9361906840', shopId: 's1', deletedAt: null, ...over });
    docs.set('emailIndex/' + EMAIL, { uid: 'u1' });
  };

  it('emails a code to the address typed, and the code verifies once', async () => {
    const { svc } = setup();
    const out = await svc.send('  Owner@Example.com ', 'verify-email');
    expect(out).toMatchObject({ success: true, delivered: true, mode: 'email', expiresInSeconds: 300 });
    expect(out.devCode).toBeUndefined();
    expect(mail.sendCode).toHaveBeenCalledWith(EMAIL, expect.stringMatching(/^[0-9]{4}$/), 'verify your email address', 5);

    await expect(svc.verify(EMAIL, 'verify-email', '0000' === codeSent() ? '1111' : '0000')).rejects.toThrow(/Incorrect/);
    await expect(svc.verify(EMAIL, 'verify-email', codeSent())).resolves.toEqual({ success: true });
    expect(await svc.redeem(EMAIL, 'verify-email')).toBe(true);
    expect(await svc.redeem(EMAIL, 'verify-email')).toBe(false); // one verification, one action
  });

  it('a customer email is verified with its own purpose, and nothing else can use that code', async () => {
    const { svc } = setup();
    expect(await svc.send(EMAIL, 'customer-email')).toMatchObject({ delivered: true });
    expect(mail.sendCode).toHaveBeenCalledWith(EMAIL, expect.stringMatching(/^[0-9]{4}$/), 'verify your email address', 5);
    await expect(svc.verify(EMAIL, 'reset', codeSent())).rejects.toThrow(/No pending OTP/);
    await expect(svc.verify(EMAIL, 'verify-email', codeSent())).rejects.toThrow(/No pending OTP/);
    await expect(svc.verify(EMAIL, 'customer-email', codeSent())).resolves.toEqual({ success: true });
  });

  it('rejects an invalid address and any purpose other than the email purposes', async () => {
    const { svc } = setup();
    await expect(svc.send('not-an-email', 'verify-email')).rejects.toThrow(/valid email/);
    for (const purpose of ['register', 'customer_verify', 'delete-account', 'change-credentials']) {
      await expect(svc.send(EMAIL, purpose)).rejects.toThrow(/only available/);
    }
    expect(mail.sendCode).not.toHaveBeenCalled();
  });

  it('a code from one purpose cannot be used for another', async () => {
    const { svc } = setup();
    await svc.send(EMAIL, 'verify-email');
    await expect(svc.verify(EMAIL, 'reset', codeSent())).rejects.toThrow(/No pending OTP/);
  });

  it('not set up on the server: nothing is sent, the code is never returned, and no code is left behind', async () => {
    configured = false;
    const { svc, docs } = setup();
    const out = await svc.send(EMAIL, 'verify-email');
    expect(out).toMatchObject({ success: true, delivered: false, mode: 'email' });
    expect(out.devCode).toBeUndefined();
    expect([...docs.keys()].filter((k) => k.startsWith('otpCodes/') || k.startsWith('otpCodeLocks/'))).toHaveLength(0);
  });

  it('local emulator testing hands the code back when email is not set up - never in production', async () => {
    configured = false;
    process.env.OTP_SHOW_CODE_IN_UI = 'true';
    expect((await setup().svc.send(EMAIL, 'verify-email')).devCode).toBeUndefined(); // no emulator host = deployed

    process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
    const { svc, docs } = setup();
    expect((await svc.send(EMAIL, 'verify-email')).devCode).toMatch(/^[0-9]{4}$/);
    addAccount(docs, { emailVerified: false });
    expect((await svc.send('someone.else@example.com', 'reset')).devCode).toBeUndefined(); // reset only for a verified account
  });

  it('a send the provider refuses is reported as not delivered, and the code it claimed is given back', async () => {
    delivers = false;
    const { svc, docs } = setup();
    const out = await svc.send(EMAIL, 'verify-email');
    expect(out).toMatchObject({ success: true, delivered: false });
    expect([...docs.keys()].filter((k) => k.startsWith('otpCodeLocks/'))).toHaveLength(0);
  });

  describe('password reset by email', () => {
    it('sends the code to a verified account email', async () => {
      const { svc, docs } = setup(); addAccount(docs);
      expect(await svc.send(EMAIL, 'reset')).toMatchObject({ delivered: true });
      expect(mail.sendCode).toHaveBeenCalledTimes(1);
      await svc.verify(EMAIL, 'reset', codeSent());
      expect(await svc.redeem(EMAIL, 'reset')).toBe(true);
      expect(await svc.findVerifiedAccount(EMAIL)).toEqual({ uid: 'u1', phone: '9361906840', shopId: 's1' });
    });

    it('sends nothing - but answers the same - for an unknown, unverified or deleted account, so emails cannot be probed', async () => {
      const unknown = setup();
      const ans = await unknown.svc.send('nobody@example.com', 'reset');
      expect(ans).toEqual({ success: true, delivered: true, mode: 'email', expiresInSeconds: 300 });

      for (const over of [{ emailVerified: false }, { deletedAt: 123 }, { email: 'other@example.com' }]) {
        const fx = setup(); addAccount(fx.docs, over);
        expect(await fx.svc.send(EMAIL, 'reset')).toEqual(ans);
        expect(await fx.svc.findVerifiedAccount(EMAIL)).toBeNull();
      }
      expect(mail.sendCode).not.toHaveBeenCalled();
    });
  });

  it('allows 3 codes per address in 10 minutes, then asks the user to wait', async () => {
    const { svc } = setup();
    for (let i = 0; i < 3; i++) await svc.send(EMAIL, 'verify-email');
    await expect(svc.send(EMAIL, 'verify-email')).rejects.toThrow(/Too many codes/);
    await svc.send('another@example.com', 'verify-email'); // a different address is unaffected
    expect(mail.sendCode).toHaveBeenCalledTimes(4);
  });

  it('five wrong codes lock the code', async () => {
    const { svc } = setup();
    await svc.send(EMAIL, 'verify-email');
    const wrong = codeSent() === '1234' ? '4321' : '1234';
    for (let i = 0; i < 5; i++) await expect(svc.verify(EMAIL, 'verify-email', wrong)).rejects.toThrow(/Incorrect/);
    await expect(svc.verify(EMAIL, 'verify-email', codeSent())).rejects.toThrow(/Too many incorrect/);
  });

  it('marks an account verified', async () => {
    const { svc, docs } = setup(); addAccount(docs, { emailVerified: false });
    await svc.markVerified('u1');
    expect(docs.get('users/u1')).toMatchObject({ emailVerified: true, emailVerifiedAt: expect.any(Number) });
    expect(await svc.findVerifiedAccount(EMAIL)).not.toBeNull();
  });
});
