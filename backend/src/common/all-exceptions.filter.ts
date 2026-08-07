import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response } from 'express';

// Last-resort safety net for anything that escapes a controller/service
// without being thrown as an HttpException - a raw Prisma error, a bug that
// throws a plain Error, a TypeError from a null-deref, etc. Nest already
// keeps a single bad request from crashing the whole process (each request
// runs in its own try/catch internally), but without this filter those
// exceptions surface as a bare, inconsistently-shaped 500 and, for
// PrismaClientKnownRequestError specifically, can leak raw column/constraint
// names from the schema straight to the client. This logs full detail
// server-side either way, so nothing is lost for debugging.
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      response.status(exception.getStatus()).json(exception.getResponse());
      return;
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      console.error('Unhandled Prisma error:', exception.code, exception.message);
      // P2025 (record not found) and P2002 (unique constraint) are the only
      // codes worth a specific status - every service that cares about a
      // particular constraint already catches it and throws its own
      // NotFoundException/ConflictException before this filter ever sees it,
      // so anything landing here is an unanticipated case that's still
      // reasonable to map to the closest REST status rather than a flat 500.
      const status =
        exception.code === 'P2025' ? HttpStatus.NOT_FOUND
        : exception.code === 'P2002' ? HttpStatus.CONFLICT
        : HttpStatus.INTERNAL_SERVER_ERROR;
      response.status(status).json({
        statusCode: status,
        message: status === HttpStatus.INTERNAL_SERVER_ERROR ? 'Internal server error' : 'A database constraint was violated',
      });
      return;
    }

    console.error('Unhandled exception:', exception);
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
    });
  }
}
