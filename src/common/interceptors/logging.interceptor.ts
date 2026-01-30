import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { SafeLogger } from '../utils/logger.util';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, url, ip } = request;
    const now = Date.now();

    // Log request metadata (no PII)
    SafeLogger.info(`Incoming request`, {
      method,
      url,
      ip,
      timestamp: new Date().toISOString(),
    });

    return next.handle().pipe(
      tap({
        next: () => {
          const response = context.switchToHttp().getResponse();
          const { statusCode } = response;
          const duration = Date.now() - now;

          SafeLogger.info(`Request completed`, {
            method,
            url,
            statusCode,
            duration: `${duration}ms`,
          });
        },
        error: (error) => {
          const duration = Date.now() - now;
          SafeLogger.error(`Request failed`, error, {
            method,
            url,
            duration: `${duration}ms`,
          });
        },
      }),
    );
  }
}

