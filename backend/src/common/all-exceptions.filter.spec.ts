import { ArgumentsHost, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AllExceptionsFilter } from './all-exceptions.filter';

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let statusMock: jest.Mock;
  let jsonMock: jest.Mock;
  let host: ArgumentsHost;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    filter = new AllExceptionsFilter();
    jsonMock = jest.fn();
    statusMock = jest.fn().mockReturnValue({ json: jsonMock });
    host = {
      switchToHttp: () => ({
        getResponse: () => ({ status: statusMock }),
      }),
    } as unknown as ArgumentsHost;
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('passes an HttpException straight through with its own status and body', () => {
    filter.catch(new ConflictException('A shop category with this name already exists'), host);

    expect(statusMock).toHaveBeenCalledWith(409);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'A shop category with this name already exists' }),
    );
  });

  it('preserves NotFoundException status/body unchanged', () => {
    filter.catch(new NotFoundException('Shop category not found'), host);

    expect(statusMock).toHaveBeenCalledWith(404);
    expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ message: 'Shop category not found' }));
  });

  it('maps an uncaught Prisma P2002 (unique constraint) to 409 without leaking column details', () => {
    const err = new Prisma.PrismaClientKnownRequestError('Unique constraint failed on the fields: (`name`)', {
      code: 'P2002',
      clientVersion: 'test',
    });

    filter.catch(err, host);

    expect(statusMock).toHaveBeenCalledWith(409);
    const body = jsonMock.mock.calls[0][0];
    expect(body.message).toBe('A database constraint was violated');
    expect(JSON.stringify(body)).not.toContain('name');
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it('maps an uncaught Prisma P2025 (record not found) to 404', () => {
    const err = new Prisma.PrismaClientKnownRequestError('Record not found', { code: 'P2025', clientVersion: 'test' });

    filter.catch(err, host);

    expect(statusMock).toHaveBeenCalledWith(404);
  });

  it('falls back to a generic 500 for any other Prisma error code', () => {
    const err = new Prisma.PrismaClientKnownRequestError('Something else went wrong', {
      code: 'P2003',
      clientVersion: 'test',
    });

    filter.catch(err, host);

    expect(statusMock).toHaveBeenCalledWith(500);
    expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ message: 'Internal server error' }));
  });

  it('returns a generic 500 for a plain unexpected Error and logs it server-side', () => {
    const err = new TypeError("Cannot read properties of undefined (reading 'foo')");

    filter.catch(err, host);

    expect(statusMock).toHaveBeenCalledWith(500);
    expect(jsonMock).toHaveBeenCalledWith({ statusCode: 500, message: 'Internal server error' });
    expect(consoleErrorSpy).toHaveBeenCalledWith('Unhandled exception:', err);
  });
});
