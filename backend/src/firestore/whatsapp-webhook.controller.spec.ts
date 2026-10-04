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
  const otp = { handleInboundMessage: jest.fn() };
  const controller = new WhatsappWebhookController(otp as any);
  const oldEnv = { ...process.env };
  beforeEach(() => { otp.handleInboundMessage.mockReset().mockResolvedValue('ignored'); process.env.WHATSAPP_PHONE_NUMBER_ID = 'PNID'; });
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
    const statusPayload = { entry: [{ changes: [{ value: { statuses: [{ id: 'wamid.ABC', status: 'delivered', recipient_id: '919999999999' }, { id: 'wamid.DEF', status: 'failed', errors: [{ code: 131026 }] }] } }] }] };
    const messagePayload = (messages: any[], phoneId = 'PNID') => ({ entry: [{ changes: [{ value: { metadata: { phone_number_id: phoneId }, messages } }] }] });
    const text = (over: any = {}) => ({ from: '919361906840', id: 'wamid.M1', type: 'text', text: { body: 'KEYSHOPS ABCDEFGH' }, ...over });
    const req = (raw: string, sig?: string): any => ({ rawBody: Buffer.from(raw), header: (n: string) => (n === 'x-hub-signature-256' ? sig : undefined) });

    it('logs statuses (id, status, error code only - never the recipient number) and acknowledges', async () => {
      delete process.env.WHATSAPP_APP_SECRET;
      const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
      expect(await controller.receive(req('{}'), statusPayload)).toEqual({ received: true });
      const lines = log.mock.calls.map((c) => String(c[0]));
      expect(lines).toEqual(['[WhatsApp status] delivered id=wamid.ABC', '[WhatsApp status] failed id=wamid.DEF error=131026']);
      expect(lines.join(' ')).not.toContain('919999999999');
    });

    it('hands an incoming text message to the OTP service', async () => {
      delete process.env.WHATSAPP_APP_SECRET;
      await controller.receive(req('{}'), messagePayload([text()]));
      expect(otp.handleInboundMessage).toHaveBeenCalledWith({ from: '919361906840', id: 'wamid.M1', body: 'KEYSHOPS ABCDEFGH' });
    });

    it('ignores non-text messages, malformed ones, and messages for another business number', async () => {
      delete process.env.WHATSAPP_APP_SECRET;
      await controller.receive(req('{}'), messagePayload([text({ type: 'image' }), text({ from: 5 }), text({ text: {} }), null as any]));
      await controller.receive(req('{}'), messagePayload([text()], 'SOMEONE-ELSES-NUMBER'));
      expect(otp.handleInboundMessage).not.toHaveBeenCalled();
    });

    it('with an app secret set, accepts a correctly signed call', async () => {
      process.env.WHATSAPP_APP_SECRET = SECRET;
      const payload = messagePayload([text()]); const raw = JSON.stringify(payload);
      expect(await controller.receive(req(raw, sign(raw)), payload)).toEqual({ received: true });
      expect(otp.handleInboundMessage).toHaveBeenCalledTimes(1);
    });

    it('with an app secret set, an unsigned or wrongly signed call is rejected and NOTHING is processed', async () => {
      process.env.WHATSAPP_APP_SECRET = SECRET;
      jest.spyOn(console, 'warn').mockImplementation(() => undefined);
      const payload = messagePayload([text()]); const raw = JSON.stringify(payload);
      expect(await controller.receive(req(raw), payload)).toEqual({ received: false });
      expect(await controller.receive(req(raw, sign(raw, 'wrong')), payload)).toEqual({ received: false });
      expect(otp.handleInboundMessage).not.toHaveBeenCalled();
    });

    it('one failing message never stops the others or turns into an error response', async () => {
      delete process.env.WHATSAPP_APP_SECRET;
      jest.spyOn(console, 'error').mockImplementation(() => undefined);
      otp.handleInboundMessage.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce('issued');
      jest.spyOn(console, 'log').mockImplementation(() => undefined);
      expect(await controller.receive(req('{}'), messagePayload([text({ id: 'a' }), text({ id: 'b' })]))).toEqual({ received: true });
      expect(otp.handleInboundMessage).toHaveBeenCalledTimes(2);
    });

    it('never throws on a malformed payload', async () => {
      delete process.env.WHATSAPP_APP_SECRET;
      for (const bad of [null, undefined, 'x', 5, { entry: 'x' }, { entry: [null] }, { entry: [{ changes: [{ value: { statuses: [null], messages: 'x' } }] }] }]) {
        await expect(controller.receive(req('{}'), bad)).resolves.toBeDefined();
      }
    });
  });
});
