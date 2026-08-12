import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import * as express from 'express';
import * as path from 'path';
import * as compression from 'compression';
import { AllExceptionsFilter } from './common/all-exceptions.filter';

// Prisma returns BigInt for BigInt columns (e.g. Shop.storageUsed), which
// JSON.stringify cannot serialize natively — this makes every API response
// safe without needing to manually convert BigInt at each call site.
(BigInt.prototype as any).toJSON = function () {
  return Number(this);
};

// Node kills the entire process on an unhandled rejection or uncaught
// exception by default - that would take down every shop's in-flight
// request, not just whatever triggered it, on what is currently a single
// backend instance. Registered as early as possible (before bootstrap) so
// nothing that runs during startup is missed either. The backend has no
// in-memory session/cache state (auth is JWT, OTPs are DB-backed - see
// auth.service.ts) so continuing to run after logging is safe rather than
// risking a corrupted in-process state.
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});

async function bootstrap() {
  // bodyParser: false so we can register express.json/urlencoded ourselves
  // with a larger size limit — Nest's default bodyParser setup uses
  // express's default 100kb limit, which is too small for the base64-encoded
  // customer photo payloads sent by the customer registration form
  // (raised "PayloadTooLargeError: request entity too large").
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  // Gzip every response over Express's default 1kb threshold - JSON list
  // endpoints (customers, shops, keys) are the main beneficiaries, especially
  // over the slower mobile connections this app is mostly used on.
  app.use(compression());
  app.use(express.json({ limit: '15mb' }));
  app.use(express.urlencoded({ extended: true, limit: '15mb' }));

  // Enable CORS. Auth here is Bearer-token-only (the JWT is attached
  // manually via the Authorization header, never a cookie - see
  // AuthContext.jsx), so `credentials: true` was never actually needed and
  // combining it with a wildcard origin isn't even valid per the CORS spec
  // (browsers reject that pairing). An explicit allowlist instead of '*'
  // also means a browser can no longer be tricked into sending an
  // authenticated request to this API from an arbitrary third-party page.
  const PROD_ALLOWED_ORIGINS = [
    'https://keyshops.in',
    'https://www.keyshops.in',
    'https://keee-7d6cb.web.app',
    'https://localhost', // Capacitor's default Android WebView origin
    'capacitor://localhost',
  ];
  app.enableCors({
    origin: (origin, callback) => {
      // No Origin header at all (native app requests, curl, server-to-server
      // calls) - there's no browser here enforcing same-origin, so allow.
      if (!origin) return callback(null, true);
      if (PROD_ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
      if (process.env.NODE_ENV !== 'production' && /^https?:\/\/localhost(:\d+)?$/.test(origin)) {
        return callback(null, true);
      }
      callback(new Error('Not allowed by CORS'), false);
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
  });

  // Global prefix for API
  app.setGlobalPrefix('api');

  // Serve static files. Content-Disposition: attachment forces mobile/desktop
  // browsers to actually save the file to the device instead of navigating
  // to/previewing it in a tab (the HTML `download` attribute alone is only
  // honored for same-origin links and isn't reliable on mobile even then).
  app.use(
    '/api/uploads',
    express.static(path.join(process.cwd(), 'public', 'uploads'), {
      setHeaders: (res, filePath) => {
        const filename = path.basename(filePath).replace(/[^a-zA-Z0-9._-]/g, '_');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      },
    }),
  );

  // Global validation pipes
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
  }));

  // Safety net for anything a controller/service throws that isn't already
  // an HttpException (a raw Prisma error, a null-deref TypeError, etc.) -
  // logs full detail server-side and returns a safe, consistently-shaped
  // response instead of a bare unformatted 500.
  app.useGlobalFilters(new AllExceptionsFilter());

  const port = process.env.PORT || 4000;
  await app.listen(port);
  console.log(`KEE Backend successfully started on port ${port}`);
}
bootstrap();
