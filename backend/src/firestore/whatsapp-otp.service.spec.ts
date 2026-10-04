import * as bcrypt from 'bcrypt';
import { WhatsappOtpService } from './whatsapp-otp.service';

// A small in-memory Firestore: collection/doc, where('==') chains, limit, orderBy, batch and transactions - what the OTP service uses.
function fakeFirestore() {
  const docs = new Map<string, any>();
  let seq = 0;
  const ref = (path: string): any => ({
    id: path.split('/').pop(),
    path,
    get: async () => ({ exists: docs.has(path), data: () => docs.get(path) }),
    update: async (patch: any) => { docs.set(path, { ...docs.get(path), ...patch }); },
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
    collection: (col: string) => ({ ...query(col), doc: () => ref(`${col}/doc${++seq}`) }),
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
      };
      const out = await fn(tx);
      pending.forEach((p) => p());
      return out;
    },
  };
  return { firestore: { db } as any, docs };
}

const PHONE = '9361906840';
const FROM = '91' + PHONE;

describe('WhatsappOtpService', () => {
  const oldEnv = { ...process.env };
  let sent: any[];
  let nextOk = true;
  beforeEach(() => {
    process.env = { ...oldEnv };
    for (const k of ['WHATSAPP_OTP_TEMPLATE_NAME', 'WHATSAPP_OTP_INBOUND', 'WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_BUSINESS_NUMBER', 'WHATSAPP_APP_SECRET', 'OTP_SHOW_CODE_IN_UI']) delete process.env[k];
    sent = []; nextOk = true;
    (global as any).fetch = jest.fn(async (_url: string, init: any) => { sent.push(JSON.parse(init.body)); return { ok: nextOk, json: async () => ({}) }; });
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => { process.env = { ...oldEnv }; jest.restoreAllMocks(); });

  const inboundEnv = () => {
    process.env.WHATSAPP_ACCESS_TOKEN = 'tok'; process.env.WHATSAPP_PHONE_NUMBER_ID = '123';
    process.env.WHATSAPP_OTP_INBOUND = 'true'; process.env.WHATSAPP_BUSINESS_NUMBER = '+91 90250 88853'; process.env.WHATSAPP_APP_SECRET = 's3cret';
  };
  const codeFrom = (msg: any) => /^(\d{4}) is your Key Shops verification code/.exec(msg.text?.body || '')?.[1] as string;

  describe('delivery mode', () => {
    it('is none without credentials', () => expect(new WhatsappOtpService(fakeFirestore().firestore).deliveryMode('register')).toBe('none'));

    it('template wins whenever a template name is configured', () => {
      inboundEnv(); process.env.WHATSAPP_OTP_TEMPLATE_NAME = 'keyshops_otp';
      expect(new WhatsappOtpService(fakeFirestore().firestore).deliveryMode('reset')).toBe('template');
    });

    it('inbound needs the switch, credentials, the business number AND the app secret', () => {
      const svc = new WhatsappOtpService(fakeFirestore().firestore);
      inboundEnv();
      expect(svc.deliveryMode('register')).toBe('inbound');
      for (const k of ['WHATSAPP_OTP_INBOUND', 'WHATSAPP_BUSINESS_NUMBER', 'WHATSAPP_APP_SECRET', 'WHATSAPP_ACCESS_TOKEN']) {
        const saved = process.env[k]; delete process.env[k];
        expect(svc.deliveryMode('register')).toBe('none');
        process.env[k] = saved;
      }
      process.env.WHATSAPP_OTP_INBOUND = 'false';
      expect(svc.deliveryMode('register')).toBe('none');
    });

    it('a customer verification never uses inbound (the shop owner holds the phone, not the customer)', () => {
      inboundEnv();
      const svc = new WhatsappOtpService(fakeFirestore().firestore);
      expect(svc.deliveryMode('customer_verify')).toBe('none');
      for (const p of ['register', 'reset', 'delete-account', 'change-credentials']) expect(svc.deliveryMode(p)).toBe('inbound');
    });
  });

  describe('template and unconfigured paths (unchanged behaviour)', () => {
    it('unconfigured: nothing is sent, the code is only logged, and the on-screen fallback applies to the allowed purposes only', async () => {
      process.env.OTP_SHOW_CODE_IN_UI = 'true';
      const svc = new WhatsappOtpService(fakeFirestore().firestore);
      expect((await svc.sendOtp(PHONE, 'register') as any).devCode).toMatch(/^\d{4}$/);
      expect((await svc.sendOtp(PHONE, 'reset') as any).devCode).toBeUndefined();
      expect(sent).toHaveLength(0);
    });

    it('template mode sends the template to 91 + number', async () => {
      inboundEnv(); process.env.WHATSAPP_OTP_TEMPLATE_NAME = 'keyshops_otp';
      const out: any = await new WhatsappOtpService(fakeFirestore().firestore).sendOtp(PHONE, 'register');
      expect(out).toEqual({ success: true, delivered: true });
      expect(sent[0]).toMatchObject({ type: 'template', to: FROM });
    });
  });

  describe('inbound flow', () => {
    beforeEach(inboundEnv);

    async function start(purpose = 'register') {
      const fx = fakeFirestore();
      const svc = new WhatsappOtpService(fx.firestore);
      const out: any = await svc.sendOtp(PHONE, purpose);
      return { ...fx, svc, out };
    }

    it('send-otp creates a waiting request with a link and NO code (nothing is sent yet)', async () => {
      const { out, docs } = await start();
      expect(out).toMatchObject({ success: true, delivered: false, mode: 'inbound', expiresInSeconds: 300 });
      expect(out.ref).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
      expect(out.waLink).toBe(`https://wa.me/919025088853?text=${encodeURIComponent('KEYSHOPS ' + out.ref)}`);
      const rec = [...docs.values()][0];
      expect(rec).toMatchObject({ identifier: PHONE, purpose: 'register', state: 'WAITING', codeHash: null, consumed: false });
      expect(sent).toHaveLength(0);
    });

    it('a new request supersedes the previous one', async () => {
      const { svc, docs } = await start();
      const second: any = await svc.sendOtp(PHONE, 'register');
      const recs = [...docs.values()];
      expect(recs.filter((r) => !r.consumed)).toHaveLength(1);
      expect(recs.find((r) => !r.consumed).ref).toBe(second.ref);
    });

    it('the SAME number: the code is sent to the sender in that chat, and it verifies', async () => {
      const { svc, out } = await start();
      expect(await svc.handleInboundMessage({ from: FROM, id: 'wamid.1', body: `KEYSHOPS ${out.ref}` })).toBe('issued');
      expect(sent).toHaveLength(1);
      expect(sent[0]).toMatchObject({ type: 'text', to: FROM });
      expect(await svc.getInboundStatus(out.ref)).toEqual({ state: 'CODE_SENT' });
      await expect(svc.verifyOtp(PHONE, 'register', codeFrom(sent[0]))).resolves.toEqual({ success: true });
      expect(await svc.getInboundStatus(out.ref)).toEqual({ state: 'DONE' });
      expect(await svc.redeemVerification(PHONE, 'register')).toBe(true);
    });

    it('only the hash of the code is stored', async () => {
      const { svc, out, docs } = await start();
      await svc.handleInboundMessage({ from: FROM, id: 'wamid.1', body: `KEYSHOPS ${out.ref}` });
      const rec = [...docs.values()][0];
      expect(await bcrypt.compare(codeFrom(sent[0]), rec.codeHash)).toBe(true);
      expect(JSON.stringify(rec)).not.toContain(codeFrom(sent[0]));
    });

    it('a DIFFERENT number gets no code: it is told so, the request is marked MISMATCH and cannot be verified', async () => {
      const { svc, out } = await start();
      expect(await svc.handleInboundMessage({ from: '919876543210', id: 'wamid.2', body: `KEYSHOPS ${out.ref}` })).toBe('mismatch');
      expect(sent).toHaveLength(1);
      expect(sent[0].to).toBe('919876543210');
      expect(sent[0].text.body).toMatch(/different number/);
      expect(sent[0].text.body).not.toMatch(/\d{4} is your/);
      expect(await svc.getInboundStatus(out.ref)).toEqual({ state: 'MISMATCH' });
      await expect(svc.verifyOtp(PHONE, 'register', '1234')).rejects.toThrow(/different number/);
    });

    it.each([['a non-Indian number', '14155550123'], ['a malformed id', 'abc'], ['an empty id', '']])('%s is a mismatch', async (_l, from) => {
      const { svc, out } = await start();
      expect(await svc.handleInboundMessage({ from, id: 'x', body: `KEYSHOPS ${out.ref}` })).toBe('mismatch');
      expect(sent.every((m) => !/\d{4} is your/.test(m.text?.body || ''))).toBe(true);
    });

    it('the reference works once: a repeated or retried delivery of the message does nothing', async () => {
      const { svc, out } = await start();
      await svc.handleInboundMessage({ from: FROM, id: 'wamid.1', body: `KEYSHOPS ${out.ref}` });
      expect(await svc.handleInboundMessage({ from: FROM, id: 'wamid.1', body: `KEYSHOPS ${out.ref}` })).toBe('ignored');
      expect(await svc.handleInboundMessage({ from: FROM, id: 'wamid.9', body: `keyshops ${out.ref}` })).toBe('ignored');
      expect(sent).toHaveLength(1);
    });

    it('is case-insensitive about the wording and tolerates extra text around the reference', async () => {
      const { svc, out } = await start();
      expect(await svc.handleInboundMessage({ from: FROM, id: 'w', body: `hello keyshops:${out.ref.toLowerCase()} thanks` })).toBe('issued');
    });

    it.each([['a plain greeting', 'Hi'], ['an unknown reference', 'KEYSHOPS ZZZZZZZZ'], ['a too-short reference', 'KEYSHOPS ABC'], ['nothing', '']])('ignores %s', async (_l, body) => {
      const { svc } = await start();
      expect(await svc.handleInboundMessage({ from: FROM, id: 'w', body })).toBe('ignored');
      expect(sent).toHaveLength(0);
    });

    it('an expired request is not honoured', async () => {
      const { svc, out, docs } = await start();
      const key = [...docs.keys()][0]; docs.set(key, { ...docs.get(key), expiresAt: Date.now() - 1000 });
      expect(await svc.getInboundStatus(out.ref)).toEqual({ state: 'EXPIRED' });
      expect(await svc.handleInboundMessage({ from: FROM, id: 'w', body: `KEYSHOPS ${out.ref}` })).toBe('expired');
      expect(sent[0].text.body).toMatch(/expired/);
    });

    it('a request replaced by a newer one can no longer be used', async () => {
      const { svc, out } = await start();
      await svc.sendOtp(PHONE, 'register');
      expect(await svc.handleInboundMessage({ from: FROM, id: 'w', body: `KEYSHOPS ${out.ref}` })).toBe('ignored');
      expect(await svc.getInboundStatus(out.ref)).toEqual({ state: 'EXPIRED' });
    });

    it('does nothing at all when the inbound switch (or the app secret) is off', async () => {
      const { svc, out } = await start();
      delete process.env.WHATSAPP_APP_SECRET;
      expect(await svc.handleInboundMessage({ from: FROM, id: 'w', body: `KEYSHOPS ${out.ref}` })).toBe('ignored');
      expect(sent).toHaveLength(0);
    });

    it('verifying before the message has arrived says to send it first', async () => {
      const { svc } = await start();
      await expect(svc.verifyOtp(PHONE, 'register', '1234')).rejects.toThrow(/send the message first/);
    });

    it('a wrong code is refused and counted', async () => {
      const { svc, out } = await start();
      await svc.handleInboundMessage({ from: FROM, id: 'w', body: `KEYSHOPS ${out.ref}` });
      const real = codeFrom(sent[0]);
      await expect(svc.verifyOtp(PHONE, 'register', real === '0000' ? '1111' : '0000')).rejects.toThrow(/Incorrect/);
    });

    it('if sending the code fails the request is marked SEND_FAILED', async () => {
      const { svc, out } = await start();
      nextOk = false;
      expect(await svc.handleInboundMessage({ from: FROM, id: 'w', body: `KEYSHOPS ${out.ref}` })).toBe('issued');
      expect(await svc.getInboundStatus(out.ref)).toEqual({ state: 'SEND_FAILED' });
    });

    it('status of malformed or unknown references is UNKNOWN', async () => {
      const { svc } = await start();
      for (const ref of ['', 'short', 'toolongreference1', 'ZZZZZZZZ', undefined as any, '../x']) expect(await svc.getInboundStatus(ref)).toEqual({ state: 'UNKNOWN' });
    });
  });
});
