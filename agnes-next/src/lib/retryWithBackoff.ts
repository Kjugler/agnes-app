/**
 * Retry utility with exponential backoff to prevent retry storms
 * 
 * Usage:
 *   const result = await retryWithBackoff(() => fetch('/api/endpoint'), {
 *     maxRetries: 3,
 *     baseDelayMs: 1000,
 *   });
 */

type RetryOptions = {
  maxRetries?: number;
  baseDelayMs?: number;
  shouldRetry?: (error: any) => boolean;
};

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelayMs = 1000,
    shouldRetry = (err: any) => {
      // Retry on network errors or 5xx status codes
      if (err?.message?.includes('fetch') || err?.message?.includes('network')) return true;
      if (err?.status >= 500) return true;
      return false;
    },
  } = options;

  let lastError: any;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      
      // Don't retry if we've hit max retries or error is not retryable
      if (attempt >= maxRetries || !shouldRetry(error)) {
        throw error;
      }
      
      // Exponential backoff: 1s, 2s, 4s, etc.
      const delayMs = baseDelayMs * Math.pow(2, attempt);
      console.warn(`[retryWithBackoff] Attempt ${attempt + 1} failed, retrying in ${delayMs}ms`, {
        error: error?.message,
        maxRetries,
      });
      
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  throw lastError;
}

/**
 * Create a retry limiter that prevents retries for a period after failure
 * Useful for preventing retry storms when an endpoint is consistently failing
 */
export function createRetryLimiter(cooldownMs: number = 10000) {
  const failureTimes = new Map<string, number>();
  
  return {
    canRetry(key: string): boolean {
      const lastFailure = failureTimes.get(key);
      if (!lastFailure) return true;
      
      const timeSinceFailure = Date.now() - lastFailure;
      return timeSinceFailure >= cooldownMs;
    },
    
    recordFailure(key: string): void {
      failureTimes.set(key, Date.now());
    },
    
    recordSuccess(key: string): void {
      failureTimes.delete(key);
    },
  };
}

