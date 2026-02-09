/**
 * Safe logging utilities that redact PII and provide structured logging
 */

export interface LogContext {
  service?: string;
  requestId?: string;
  userId?: string;
  [key: string]: any;
}

export class SafeLogger {
  /**
   * Debug level - only logs in non-production environments
   * @param message Log message
   * @param context Optional context (service name, requestId, etc.)
   * @param data Additional data to log (PII will be redacted)
   */
  static debug(
    message: string,
    context?: LogContext,
    data?: Record<string, any>,
  ) {
    if (process.env.NODE_ENV === 'production') {
      return; // Don't log debug in production
    }

    this.log('DEBUG', message, context, data);
  }

  /**
   * Info level - standard operational messages
   * @param message Log message
   * @param context Optional context (service name, requestId, etc.)
   * @param data Additional data to log (PII will be redacted)
   */
  static info(
    message: string,
    context?: LogContext,
    data?: Record<string, any>,
  ) {
    this.log('INFO', message, context, data);
  }

  /**
   * Warning level - unexpected but recoverable conditions
   * @param message Log message
   * @param context Optional context (service name, requestId, etc.)
   * @param data Additional data to log (PII will be redacted)
   */
  static warn(
    message: string,
    context?: LogContext,
    data?: Record<string, any>,
  ) {
    this.log('WARN', message, context, data);
  }

  /**
   * Error level - failures and exceptions
   * @param message Log message
   * @param error Error object or error message
   * @param context Optional context (service name, requestId, etc.)
   * @param data Additional data to log (PII will be redacted)
   */
  static error(
    message: string,
    error?: unknown,
    context?: LogContext,
    data?: Record<string, any>,
  ) {
    const errorDetails =
      error instanceof Error
        ? {
            name: error.name,
            message: error.message,
            stack:
              process.env.NODE_ENV !== 'production' ? error.stack : undefined,
          }
        : error;

    this.log('ERROR', message, context, { ...data, error: errorDetails });
  }

  /**
   * Core logging function with structured output
   */
  private static log(
    level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR',
    message: string,
    context?: LogContext,
    data?: Record<string, any>,
  ) {
    const timestamp = new Date().toISOString();
    const sanitizedContext = this.sanitizeData(context || {});
    const sanitizedData = this.sanitizeData(data || {});

    const logEntry = {
      timestamp,
      level,
      message,
      ...(sanitizedContext &&
        Object.keys(sanitizedContext).length > 0 && {
          context: sanitizedContext,
        }),
      ...(sanitizedData &&
        Object.keys(sanitizedData).length > 0 && { data: sanitizedData }),
    };

    const logString = JSON.stringify(logEntry);

    switch (level) {
      case 'DEBUG':
      case 'INFO':
        console.log(logString);
        break;
      case 'WARN':
        console.warn(logString);
        break;
      case 'ERROR':
        console.error(logString);
        break;
    }
  }

  /**
   * Sanitize data by redacting PII fields
   */
  private static sanitizeData(
    data?: Record<string, any>,
  ): Record<string, any> | undefined {
    if (!data) return undefined;

    const piiFields = [
      'email',
      'idToken',
      'token',
      'sessionToken',
      'blindedToken',
      'privateKey',
      'password',
      'stripeCustomerId',
      'firebaseUid',
      'appleUserId',
      'googleUserId',
      'ip',
      'ipAddress',
      'userAgent',
      'deviceFingerprint',
      'identityToken',
      'authorizationCode',
    ];

    const sanitized = { ...data };

    for (const field of piiFields) {
      if (field in sanitized) {
        sanitized[field] = '[REDACTED]';
      }
    }

    // Recursively sanitize nested objects
    for (const key in sanitized) {
      if (
        typeof sanitized[key] === 'object' &&
        sanitized[key] !== null &&
        !Array.isArray(sanitized[key])
      ) {
        sanitized[key] = this.sanitizeData(
          sanitized[key] as Record<string, any>,
        );
      }
    }

    return sanitized;
  }
}
