import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { ApiErrorResponse } from '../interfaces/api-error.interface';
import { randomUUID } from 'crypto';
import { SafeLogger } from '../utils/logger.util';
import { NotificationService } from '../../notification/notification.service';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(
    private readonly configService: ConfigService,
    private readonly moduleRef: ModuleRef,
  ) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const isDevelopment =
      (this.configService?.get<string>('NODE_ENV') || process.env.NODE_ENV) ===
      'development';

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
    } else if (
      typeof exceptionResponse === 'object' &&
      exceptionResponse !== null
    ) {
      const resp = exceptionResponse as Record<string, unknown>;
      message = (resp.message as string) || message;
      code = (resp.error as string | number) || code;

      // Handle class-validator validation errors
      if (
        Array.isArray(resp.message) &&
        (status as HttpStatus) === HttpStatus.BAD_REQUEST
      ) {
        message = 'Validation failed';
        details = resp.message;
      }
    }

    const requestId = (request as Request & { id?: string }).id || randomUUID();

    const errorResponse: ApiErrorResponse & { stack?: string } = {
      success: false,
      error: {
        code,
        message,
        details: details as unknown,
      },
      timestamp: new Date().toISOString(),
      path: request.url,
      requestId,
    };

    // Include stack trace in development
    if (isDevelopment && exception instanceof Error) {
      errorResponse.stack = exception.stack;
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
      SafeLogger.warn('Client error occurred', logContext, {
        method: request.method,
        path: request.url,
        statusCode: status,
        errorCode: code,
      });
    }

    // Notify Slack (resolve at runtime so it works when Netlify bundle breaks constructor DI)
    try {
      const notificationService = this.moduleRef.get(NotificationService, {
        strict: false,
      });
      if (
        notificationService?.reportErrorToSlack &&
        typeof notificationService.reportErrorToSlack === 'function'
      ) {
        void notificationService
          .reportErrorToSlack(exception, request, status, requestId)
          .catch(() => {});
      }
    } catch {
      // Ignore if NotificationService cannot be resolved (e.g. in tests or broken bundle)
    }

    response.status(status).json(errorResponse);
  }
}
