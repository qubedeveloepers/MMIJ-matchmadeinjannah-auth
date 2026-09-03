import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { PinoLogger, InjectPinoLogger } from 'nestjs-pino';
import errorCodes from '../error-codes.json';

@Injectable()
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(
    @InjectPinoLogger(HttpExceptionFilter.name)
    private readonly logger: PinoLogger,
  ) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = 500;
    let errorCode = 'mmij-00';
    let message = 'Unknown error occurred';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();

      if (typeof res === 'string') {
        errorCode = res;
      } else if (typeof res === 'object' && res['message']) {
        errorCode = res['message'];
      }

      message =
        errorCode === 'Unauthorized'
          ? 'Token is not present in the header'
          : (errorCodes as Record<string, string>)[errorCode] || message;
    }

    if (exception instanceof BadRequestException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'object') {
        errorCode = (res as any).errorCode || (res as any).message || 'mmij-01';
        message =
          (errorCodes as Record<string, string>)[errorCode] ||
          'Validation failed';

        this.logger.warn(
          {
            errorCode,
            status,
            path: request.url,
            method: request.method,
            errors: (res as any).errors || [],
          },
          `Validation error: ${message}`,
        );

        return response.status(status).json({
          errorCode: errorCode,
          message,
          errors: (res as any).errors || [],
          timestamp: new Date().toISOString(),
          path: request.url,
        });
      }
    } else if (
      typeof exception === 'object' &&
      exception !== null &&
      'code' in exception &&
      (exception as any).code === 11000
    ) {
      const keys = Object.keys(exception['errorResponse'].keyValue);
      const isOnlyMobilePhone = keys.length === 1 && keys[0] === 'mobilePhone';

      if (isOnlyMobilePhone) {
        status = 409;
        errorCode = 'mmij-22';
        message =
          (errorCodes as Record<string, string>)[errorCode] ||
          'Mobile phone is already registered';
      } else {
        status = 409;
        const key = Object.keys((exception as any).keyValue || {})[0];
        errorCode = `duplicate_${key}`;
        message = `${key} is already taken`;
      }

      this.logger.warn(
        {
          errorCode,
          status,
          path: request.url,
          method: request.method,
          duplicateKey: Object.keys((exception as any).keyValue || {})[0],
        },
        `Duplicate key error: ${message}`,
      );
    }

    // Log all errors - use error level for 5xx, warn for 4xx
    if (status >= 500) {
      this.logger.error(
        {
          errorCode,
          status,
          path: request.url,
          method: request.method,
          stack: exception instanceof Error ? exception.stack : undefined,
          error:
            exception instanceof Error ? exception.message : String(exception),
        },
        `Server error: ${message}`,
      );
    } else if (status >= 400) {
      this.logger.warn(
        {
          errorCode,
          status,
          path: request.url,
          method: request.method,
        },
        `Client error: ${message}`,
      );
    }

    response.status(status).json({
      errorCode: errorCode,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
