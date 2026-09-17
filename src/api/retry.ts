import { ApiError, isRetryable } from './errors';

/**
 * Retry policy: how many times, and how long to wait between attempts.
 *
 * The retry *decision* (is this error even retryable) lives in errors.ts and is
 * made from status/code, never message text. This module owns the *timing*:
 *   - exponential backoff: base * 2^attempt
 *   - full jitter: a random value in [0, computed] so many clients that failed
 *     together do not all retry on the same tick and re-collide (thundering herd)
 *   - Retry-After wins: if the server told us how long to wait (429/503), honour
 *     it as a floor rather than guessing
 *   - a hard cap on attempts so we never retry-storm the rate limiter
 */

export const MAX_RETRIES = 3;

const BASE_DELAY_MS = 400;
const MAX_DELAY_MS = 8000;

/** Delay before the retry that follows `attemptIndex` (0-based). */
export function backoffDelay(attemptIndex: number, error: unknown): number {
  const exponential = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** attemptIndex);
  const jittered = Math.random() * exponential; // full jitter

  if (error instanceof ApiError && error.retryAfterMs != null) {
    // Respect the server's instruction as a lower bound.
    return Math.max(error.retryAfterMs, jittered);
  }
  return jittered;
}

/**
 * Shared TanStack Query retry predicate. Retry only transient failures, and only
 * up to the cap. `failureCount` is 1-based on first failure.
 */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  return isRetryable(error) && failureCount <= MAX_RETRIES;
}

/** Shared TanStack Query retryDelay: backoff + jitter, honouring Retry-After. */
export function retryDelay(failureCount: number, error: unknown): number {
  return backoffDelay(failureCount - 1, error);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Imperative retry for code paths outside a TanStack query/mutation — namely the
 * bulk chunk calls. Same policy: transient-only, capped, backoff + jitter,
 * Retry-After honoured. Non-retryable errors throw immediately.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  { maxRetries = MAX_RETRIES }: { maxRetries?: number } = {},
): Promise<T> {
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return await fn();
    } catch (error) {
      if (!isRetryable(error) || attempt >= maxRetries) throw error;
      await sleep(backoffDelay(attempt, error));
      attempt += 1;
    }
  }
}
