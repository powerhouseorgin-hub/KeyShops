import { Readable } from 'stream';

// Cloud Functions (Gen 2) reads every request body into `req.rawBody` before our app sees the request, which
// leaves the request stream already consumed. multer (file uploads) reads the stream with `req.pipe(...)`, so on
// Cloud Functions it receives an empty body: no file arrives and every upload endpoint answers 400 "file required".
//
// For multipart requests whose body was already buffered, this replays `rawBody` through `req.pipe` so multer
// parses it exactly as it would a live stream. Requests whose stream has NOT been consumed (the standalone server,
// local runs) are left untouched, and so is every non-multipart request.
export function replayMultipartBody(req: any, _res: unknown, next: () => void) {
  const type = String(req.headers?.['content-type'] || '');
  const buffered = Buffer.isBuffer(req.rawBody) && req.rawBody.length > 0;
  const consumed = req.readableEnded === true || req.complete === true;
  if (buffered && consumed && /^multipart\/form-data/i.test(type)) {
    const body: Buffer = req.rawBody;
    req.pipe = (destination: any) => Readable.from([body]).pipe(destination);
  }
  next();
}
