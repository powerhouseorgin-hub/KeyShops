import { ArgumentsHost, ConflictException, NotFoundException } from '@nestjs/common';
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

  it('returns a generic 500 for a plain unexpected Error and logs it server-side', () => {
    const err = new TypeError("Cannot read properties of undefined (reading 'foo')");

    filter.catch(err, host);

    expect(statusMock).toHaveBeenCalledWith(500);
    expect(jsonMock).toHaveBeenCalledWith({ statusCode: 500, message: 'Internal server error' });
    expect(consoleErrorSpy).toHaveBeenCalledWith('Unhandled exception:', err);
  });

  it('never leaks the text of an internal error to the client', () => {
    const err = new Error('9 FAILED_PRECONDITION: The query requires an index. https://console.firebase.google.com/project/secret-project');

    filter.catch(err, host);

    expect(statusMock).toHaveBeenCalledWith(500);
    expect(JSON.stringify(jsonMock.mock.calls[0][0])).not.toContain('FAILED_PRECONDITION');
    expect(JSON.stringify(jsonMock.mock.calls[0][0])).not.toContain('secret-project');
    expect(consoleErrorSpy).toHaveBeenCalledWith('Unhandled exception:', err);
  });
});
