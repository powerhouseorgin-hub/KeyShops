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

  // Enable CORS
  app.enableCors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
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
