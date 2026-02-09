export interface ApiErrorResponse {
  success: boolean;
  error: {
    code: string | number;
    message: string;
    details?: any;
  };
  timestamp: string;
  path: string;
  requestId?: string;
  stack?: string; // Development only
}
