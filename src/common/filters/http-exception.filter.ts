import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { ApiErrorResponse } from '../interfaces/api-error.interface';
import { randomUUID } from 'crypto';
import { SafeLogger } from '../utils/logger.util';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(private configService: ConfigService) { }

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const isDevelopment =
      this.configService.get<string>('NODE_ENV') === 'development';

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse =
      exception instanceof HttpException
        ? exception.getResponse()
        : { message: 'Internal server error' };

    let code: string | number = status;
    let message = 'An error occurred';
    let details: any = null;

    if (typeof exceptionResponse === 'string') {
      message = exceptionResponse;
    } else if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
      const resp = exceptionResponse as any;
      message = resp.message || message;
      code = resp.error || code; // Use NestJS default error code name if available

      // Handle class-validator validation errors
      if (Array.isArray(resp.message) && status === HttpStatus.BAD_REQUEST) {
        message = 'Validation failed';
        details = resp.message;
      }
    }

    const requestId = (request as any).id || randomUUID();

    const errorResponse: ApiErrorResponse = {
      success: false,
      error: {
        code,
        message,
        details,
      },
      timestamp: new Date().toISOString(),
      path: request.url,
      requestId,
    };

    // Include stack trace in development
    if (isDevelopment && exception instanceof Error) {
      (errorResponse as any).stack = exception.stack;
    }

    // Log error with SafeLogger
    const logContext = {
      service: 'HttpExceptionFilter',
      requestId,
    };

    if (status >= 500) {
      SafeLogger.error(
        'Internal server error occurred',
        exception instanceof Error ? exception : new Error(String(exception)),
        logContext,
        { method: request.method, path: request.url, statusCode: status },
      );
    } else if (status >= 400) {
      SafeLogger.warn(
        'Client error occurred',
        logContext,
        { method: request.method, path: request.url, statusCode: status, errorCode: code },
      );
    }

    response.status(status).json(errorResponse);
  }
}
