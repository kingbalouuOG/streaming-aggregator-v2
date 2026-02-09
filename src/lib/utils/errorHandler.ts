/**
 * Error Handler Utilities
 * Centralized error handling and logging
 */

export const ErrorType = {
  NETWORK: 'NETWORK',
  API: 'API',
  CACHE: 'CACHE',
  RATE_LIMIT: 'RATE_LIMIT',
  AUTHENTICATION: 'AUTHENTICATION',
  VALIDATION: 'VALIDATION',
  UNKNOWN: 'UNKNOWN',
} as const;

export type ErrorTypeValue = (typeof ErrorType)[keyof typeof ErrorType];

interface AppError extends Error {
  status?: number;
  code?: string;
}

export const classifyError = (error: AppError | null): ErrorTypeValue => {
  if (!error) return ErrorType.UNKNOWN;

  if (error.message?.includes('Network request failed') || error.code === 'NETWORK_ERROR') {
    return ErrorType.NETWORK;
  }
  if ((error as any).status === 429 || error.code === 'RATE_LIMIT') {
    return ErrorType.RATE_LIMIT;
  }
  if ((error as any).status === 401 || (error as any).status === 403) {
    return ErrorType.AUTHENTICATION;
  }
  if ((error as any).status >= 400 && (error as any).status < 500) {
    return ErrorType.API;
  }
  if (error.message?.includes('Storage') || error.code === 'CACHE_ERROR') {
    return ErrorType.CACHE;
  }
  return ErrorType.UNKNOWN;
};

export const getUserMessage = (error: AppError) => {
  const errorType = classifyError(error);

  switch (errorType) {
    case ErrorType.NETWORK:
      return { title: 'Connection Error', message: 'Unable to connect to the internet. Please check your connection and try again.', action: 'Retry' };
    case ErrorType.RATE_LIMIT:
      return { title: 'Too Many Requests', message: "You're making too many requests. Please wait a moment and try again.", action: 'OK' };
    case ErrorType.AUTHENTICATION:
      return { title: 'Authentication Error', message: 'There was a problem with authentication. Please restart the app.', action: 'OK' };
    case ErrorType.API:
      return { title: 'Service Error', message: 'The service is temporarily unavailable. Please try again later.', action: 'Retry' };
    case ErrorType.CACHE:
      return { title: 'Storage Error', message: 'There was a problem accessing local storage. Your experience may be affected.', action: 'OK' };
    default:
      return { title: 'Something Went Wrong', message: 'An unexpected error occurred. Please try again.', action: 'Retry' };
  }
};

export const logError = (error: AppError, context = '') => {
  const errorType = classifyError(error);
  const timestamp = new Date().toISOString();
  console.error(`[${timestamp}] [${errorType}] ${context}:`, error);

  if (!__DEV__) {
    // TODO: Send to logging service (e.g., Sentry)
  }
};

export const handleApiError = async <T>(error: AppError, retryFn: () => Promise<T>, maxRetries = 2): Promise<T> => {
  const errorType = classifyError(error);

  if (errorType === ErrorType.AUTHENTICATION || errorType === ErrorType.VALIDATION) {
    throw error;
  }

  if (errorType === ErrorType.NETWORK || errorType === ErrorType.RATE_LIMIT) {
    let retries = 0;
    while (retries < maxRetries) {
      try {
        const delay = Math.pow(2, retries) * 1000;
        await new Promise((resolve) => setTimeout(resolve, delay));
        return await retryFn();
      } catch (retryError) {
        retries++;
        if (retries >= maxRetries) throw retryError;
      }
    }
  }

  throw error;
};

export const handleCacheError = <T>(error: AppError, defaultValue: T): T => {
  logError(error, 'Cache operation failed');
  return defaultValue;
};

export const isRecoverableError = (error: AppError): boolean => {
  const errorType = classifyError(error);
  return [ErrorType.NETWORK, ErrorType.RATE_LIMIT, ErrorType.API].includes(errorType);
};
