import { PassThrough } from 'stream';
import * as http from 'http';
import * as express from 'express';
import * as multer from 'multer';
import { replayMultipartBody } from './replay-multipart-body';

const boundary = '----testboundary';
const multipart = (content: string) => Buffer.from(
  `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="p.jpg"\r\nContent-Type: image/jpeg\r\n\r\n${content}\r\n--${boundary}--\r\n`,
);

describe('replayMultipartBody', () => {
  const run = (req: any) => { const next = jest.fn(); replayMultipartBody(req, {}, next); expect(next).toHaveBeenCalledTimes(1); return req; };
  const multipartReq = (extra: Record<string, unknown>) => ({ headers: { 'content-type': `multipart/form-data; boundary=${boundary}` }, pipe: 'original', ...extra });

  it('replays the buffered body when the stream was already consumed', async () => {
    const req = run(multipartReq({ rawBody: multipart('PHOTO'), readableEnded: true }));
    expect(req.pipe).not.toBe('original');
    const sink = new PassThrough();
    const chunks: Buffer[] = [];
    sink.on('data', (c) => chunks.push(c));
    req.pipe(sink);
    await new Promise((r) => sink.on('end', r));
    expect(Buffer.concat(chunks).toString()).toContain('PHOTO');
  });

  it.each([
    ['the stream was not consumed (standalone server)', multipartReq({ rawBody: multipart('x'), readableEnded: false, complete: false })],
    ['there is no buffered body', multipartReq({ readableEnded: true })],
    ['the buffered body is empty', multipartReq({ rawBody: Buffer.alloc(0), readableEnded: true })],
    ['the request is JSON', { headers: { 'content-type': 'application/json' }, pipe: 'original', rawBody: Buffer.from('{}'), readableEnded: true }],
  ])('leaves the request alone when %s', (_label, req) => {
    expect(run(req).pipe).toBe('original');
  });
});

// The real thing: multer behind an app that, like Cloud Functions, has already swallowed the body into rawBody.
describe('multer behind a Cloud-Functions-style body capture', () => {
  async function post(useReplay: boolean) {
    const app = express();
    // simulates the framework: buffers the whole body, sets rawBody, and leaves the stream consumed
    app.use((req: any, _res, next) => {
      const parts: Buffer[] = [];
      req.on('data', (c: Buffer) => parts.push(c));
      req.on('end', () => { req.rawBody = Buffer.concat(parts); next(); });
    });
    if (useReplay) app.use(replayMultipartBody);
    app.post('/up', multer({ limits: { fileSize: 5 * 1024 * 1024 } }).single('file'), (req: any, res) => res.json({ got: !!req.file, size: req.file?.size ?? 0, mimetype: req.file?.mimetype }));
    const server = http.createServer(app);
    await new Promise<void>((r) => server.listen(0, r));
    const port = (server.address() as any).port;
    const res = await fetch(`http://127.0.0.1:${port}/up`, { method: 'POST', headers: { 'content-type': `multipart/form-data; boundary=${boundary}` }, body: new Uint8Array(multipart('hello-photo')) });
    const text = await res.text();
    server.close();
    try { return JSON.parse(text); } catch { return { got: false, failed: true, status: res.status }; }
  }

  it('without the fix the upload fails ("Unexpected end of form" - which Nest reports as the 400 seen in production)', async () => {
    expect(await post(false)).toEqual({ got: false, failed: true, status: 500 });
  });

  it('with the fix, multer receives the file', async () => {
    expect(await post(true)).toEqual({ got: true, size: 'hello-photo'.length, mimetype: 'image/jpeg' });
  });
});
