import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';

// Every field name (case-insensitive, substring match for the ones marked *)
// that must never reach stdout in full - Render's log viewer is otherwise
// plain text anyone with dashboard access can read, so credentials, OTPs,
// tokens and government-ID numbers are replaced outright rather than merely
// truncated.
const REDACT_KEY_SUBSTRINGS = [
  'password', 'passwordhash', 'oldpassword', 'newpassword',
  'token', 'authorization', 'secret',
  'code', 'otp',
  'aadhaar', 'idproofnumber',
  'razorpaysignature',
];

// Large payloads (customer/document photos, base64 uploads) are neither
// useful to read in a log line nor cheap to stringify - replaced with just
// their size so a "why did this upload fail" investigation still has enough
// to go on without the log line itself becoming the performance/cost problem.
const BASE64_KEY_SUBSTRINGS = ['base64', 'photo', 'image', 'filedata'];

const MAX_STRING_LEN = 300;
const MAX_LOG_LEN = 3000;
const MAX_ARRAY_ITEMS = 20;

function shouldRedactKey(key: string): boolean {
  const lower = key.toLowerCase();
  return REDACT_KEY_SUBSTRINGS.some((s) => lower.includes(s));
}

function isBase64Key(key: string): boolean {
  const lower = key.toLowerCase();
  return BASE64_KEY_SUBSTRINGS.some((s) => lower.includes(s));
}

function redact(value: any, depth = 0): any {
  if (value === null || value === undefined) return value;
  if (depth > 6) return '[omitted: too deep]';

  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ARRAY_ITEMS).map((v) => redact(v, depth + 1));
    if (value.length > MAX_ARRAY_ITEMS) items.push(`…[+${value.length - MAX_ARRAY_ITEMS} more]`);
    return items;
  }

  if (typeof value === 'object') {
    // Buffers/Dates/etc. would otherwise expand into noisy nested objects.
    if (value instanceof Date) return value.toISOString();
    const out: Record<string, any> = {};
    for (const key of Object.keys(value)) {
      if (shouldRedactKey(key)) {
        out[key] = '[REDACTED]';
        continue;
      }
      if (isBase64Key(key) && typeof (value as any)[key] === 'string') {
        out[key] = `[omitted, ${(value as any)[key].length} chars]`;
        continue;
      }
      out[key] = redact((value as any)[key], depth + 1);
    }
    return out;
  }

  if (typeof value === 'string' && value.length > MAX_STRING_LEN) {
    return `${value.slice(0, MAX_STRING_LEN)}…[+${value.length - MAX_STRING_LEN} chars]`;
  }

  return value;
}

function safeStringify(value: any): string {
  if (value === undefined) return '';
  try {
    const json = JSON.stringify(redact(value));
    if (!json) return '';
    return json.length > MAX_LOG_LEN ? `${json.slice(0, MAX_LOG_LEN)}…[truncated]` : json;
  } catch {
    return '[unserializable]';
  }
}

// Routes deliberately not logged: static file serving is high-volume and
// carries no request/response body worth recording, and health-check pings
// (backend cold-start warmup, see AuthContext.jsx) would otherwise dominate
// the log stream.
function isExcluded(url: string): boolean {
  return url.startsWith('/api/uploads') || url === '/api/health';
}

// Global interceptor - logs every API request and response to stdout
// (visible in Render's log viewer) so an error can be diagnosed from
// production logs without reproducing it locally. Deliberately excludes
// credentials, OTP codes, tokens and government-ID numbers (see
// REDACT_KEY_SUBSTRINGS) and caps/omits large payloads (see
// BASE64_KEY_SUBSTRINGS, MAX_STRING_LEN, MAX_LOG_LEN) so this stays cheap
// per request and doesn't blow up Render's log volume/cost on file uploads.
@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, originalUrl, body, user } = request;

    if (isExcluded(originalUrl)) {
      return next.handle();
    }

    const actor = user ? `${user.role}:${user.id}` : 'anonymous';
    const start = Date.now();
    const bodyLog = body && Object.keys(body).length ? ` body=${safeStringify(body)}` : '';
    console.log(`--> ${method} ${originalUrl} [${actor}]${bodyLog}`);

    return next.handle().pipe(
      tap((responseBody) => {
        const ms = Date.now() - start;
        const response = context.switchToHttp().getResponse();
        console.log(`<-- ${method} ${originalUrl} ${response.statusCode} (${ms}ms) body=${safeStringify(responseBody)}`);
      }),
      catchError((err) => {
        const ms = Date.now() - start;
        const status = err?.status ?? (typeof err?.getStatus === 'function' ? err.getStatus() : 500);
        console.error(`<-- ${method} ${originalUrl} ${status} (${ms}ms) ERROR=${err?.message || err}`);
        throw err;
      }),
    );
  }
}
