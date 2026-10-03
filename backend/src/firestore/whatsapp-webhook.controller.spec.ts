import { createHmac } from 'crypto';
import { WhatsappWebhookController, verifyMetaSignature } from './whatsapp-webhook.controller';

const SECRET = 'test-app-secret';
const sign = (body: string, secret = SECRET) => 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');

function fakeRes() {
  const res: any = { statusCode: 0, contentType: '', payload: undefined };
  res.status = (c: number) => { res.statusCode = c; return res; };
  res.type = (t: string) => { res.contentType = t; return res; };
  res.send = (p: any) => { res.payload = p; return res; };
  return res;
}

describe('verifyMetaSignature', () => {
  const body = '{"entry":[]}';
  it('accepts a correct signature', () => expect(verifyMetaSignature(Buffer.from(body), sign(body), SECRET)).toBe(true));
  it('rejects a signature made with another secret', () => expect(verifyMetaSignature(Buffer.from(body), sign(body, 'other'), SECRET)).toBe(false));
  it('rejects a tampered body', () => expect(verifyMetaSignature(Buffer.from(body + ' '), sign(body), SECRET)).toBe(false));
  it.each([[undefined], [''], ['sha256='], ['sha1=abc'], ['sha256=zz'], ['sha256=' + 'a'.repeat(10)]])('rejects the malformed header %p', (h) =>
    expect(verifyMetaSignature(Buffer.from(body), h as any, SECRET)).toBe(false));
  it('rejects a missing body or secret', () => {
    expect(verifyMetaSignature(undefined, sign(body), SECRET)).toBe(false);
    expect(verifyMetaSignature(Buffer.from(body), sign(body), '')).toBe(false);
  });
});

describe('WhatsappWebhookController', () => {
  const controller = new WhatsappWebhookController();
  const oldEnv = { ...process.env };
  afterEach(() => { process.env = { ...oldEnv }; jest.restoreAllMocks(); });

  describe('GET verification handshake', () => {
    it('echoes the challenge when the token matches', () => {
      process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = 'right-token';
      const res = fakeRes();
      controller.verify('subscribe', 'right-token', '12345', res);
      expect(res.statusCode).toBe(200);
      expect(res.payload).toBe('12345');
      expect(res.contentType).toBe('text/plain');
    });

    it.each([
      ['wrong token', 'subscribe', 'nope', 'c'],
      ['wrong mode', 'unsubscribe', 'right-token', 'c'],
      ['no token', 'subscribe', undefined, 'c'],
      ['no challenge', 'subscribe', 'right-token', undefined],
      ['over-long challenge', 'subscribe', 'right-token', 'x'.repeat(500)],
    ])('refuses (403) on %s', (_label, mode, token, challenge) => {
      process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = 'right-token';
      const res = fakeRes();
      controller.verify(mode as any, token as any, challenge as any, res);
      expect(res.statusCode).toBe(403);
      expect(res.payload).toBe('Forbidden');
    });

    it('refuses everything while no verify token is configured', () => {
      delete process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
      const res = fakeRes();
      controller.verify('subscribe', '', 'c', res);
      expect(res.statusCode).toBe(403);
    });
  });

  describe('POST events', () => {
    const payload = { entry: [{ changes: [{ value: { statuses: [{ id: 'wamid.ABC', status: 'delivered', recipient_id: '919999999999' }, { id: 'wamid.DEF', status: 'failed', errors: [{ code: 131026 }] }] } }] }] };
    const raw = JSON.stringify(payload);

    it('logs statuses (id, status, error code only - never the recipient number) and acknowledges', () => {
      delete process.env.WHATSAPP_APP_SECRET;
      const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
      const out = controller.receive({ header: () => undefined } as any, payload);
      expect(out).toEqual({ received: true });
      const lines = log.mock.calls.map((c) => String(c[0]));
      expect(lines).toEqual(['[WhatsApp status] delivered id=wamid.ABC', '[WhatsApp status] failed id=wamid.DEF error=131026']);
      expect(lines.join(' ')).not.toContain('919999999999');
    });

    it('with an app secret set, accepts a correctly signed call', () => {
      process.env.WHATSAPP_APP_SECRET = SECRET;
      jest.spyOn(console, 'log').mockImplementation(() => undefined);
      const req: any = { rawBody: Buffer.from(raw), header: (n: string) => (n === 'x-hub-signature-256' ? sign(raw) : undefined) };
      expect(controller.receive(req, payload)).toEqual({ received: true });
    });

    it('with an app secret set, rejects an unsigned or wrongly signed call and logs nothing', () => {
      process.env.WHATSAPP_APP_SECRET = SECRET;
      const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
      jest.spyOn(console, 'warn').mockImplementation(() => undefined);
      expect(controller.receive({ rawBody: Buffer.from(raw), header: () => undefined } as any, payload)).toEqual({ received: false });
      expect(controller.receive({ rawBody: Buffer.from(raw), header: () => sign(raw, 'wrong') } as any, payload)).toEqual({ received: false });
      expect(log).not.toHaveBeenCalled();
    });

    it('never throws on a malformed payload', () => {
      delete process.env.WHATSAPP_APP_SECRET;
      for (const bad of [null, undefined, 'x', 5, { entry: 'x' }, { entry: [null] }, { entry: [{ changes: [{ value: { statuses: [null] } }] }] }]) {
        expect(() => controller.receive({ header: () => undefined } as any, bad)).not.toThrow();
      }
    });
  });
});
