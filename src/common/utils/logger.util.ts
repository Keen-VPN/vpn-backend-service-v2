/**
 * Safe logging utilities that redact PII
 */

export class SafeLogger {
  /**
   * Log without exposing PII
   * @param message Log message
   * @param data Data to log (PII will be redacted)
   */
  static info(message: string, data?: Record<string, any>) {
    const sanitized = this.sanitizeData(data);
    console.log(`[INFO] ${message}`, sanitized ? JSON.stringify(sanitized) : '');
  }

  static error(message: string, error?: Error | any, data?: Record<string, any>) {
    const sanitized = this.sanitizeData(data);
    const errorDetails = error instanceof Error ? {
      name: error.name,
      message: error.message,
      // Never log stack traces with PII
    } : error;
    
    console.error(`[ERROR] ${message}`, {
      ...sanitized,
      error: errorDetails,
    });
  }

  static warn(message: string, data?: Record<string, any>) {
    const sanitized = this.sanitizeData(data);
    console.warn(`[WARN] ${message}`, sanitized ? JSON.stringify(sanitized) : '');
  }

  /**
   * Sanitize data by redacting PII fields
   */
  private static sanitizeData(data?: Record<string, any>): Record<string, any> | undefined {
    if (!data) return undefined;

    const piiFields = [
      'email',
      'idToken',
      'token',
      'blindedToken',
      'privateKey',
      'password',
      'stripeCustomerId',
      'firebaseUid',
      'appleUserId',
      'googleUserId',
    ];

    const sanitized = { ...data };
    
    for (const field of piiFields) {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    }

    // Recursively sanitize nested objects
    for (const key in sanitized) {
      if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
        sanitized[key] = this.sanitizeData(sanitized[key]);
      }
    }

    return sanitized;
  }
}

