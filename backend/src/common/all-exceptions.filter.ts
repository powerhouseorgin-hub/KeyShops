import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { Response } from 'express';

// Last-resort safety net for anything that escapes a controller/service
// without being thrown as an HttpException - a failed Firestore/Algolia call,
// a bug that throws a plain Error, a TypeError from a null-deref, etc. Nest
// already keeps a single bad request from crashing the whole process (each
// request runs in its own try/catch internally), but without this filter those
// exceptions surface as a bare, inconsistently-shaped 500 that could carry
// internal error text. The client always gets the same generic body; the full
// detail is logged server-side, so nothing is lost for debugging.
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      response.status(exception.getStatus()).json(exception.getResponse());
      return;
    }

    console.error('Unhandled exception:', exception);
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
    });
  }
}
