/**
 * Structured API errors.
 *
 * The baseline flattened every failure into `new Error("429: message")`, which
 * forces callers to string-match to decide whether a failure is retryable. The
 * brief calls that out explicitly. Instead we carry the HTTP status and the
 * machine `code` from the API's `{ error: { code, message } }` envelope, and
 * expose a single `retryable` decision derived *structurally* from those.
 */

/** Error codes the API can return in its error envelope. Not exhaustive by design. */
export type ApiErrorCode =
  | 'stale_cursor'
  | 'bad_cursor'
  | 'bad_request'
  | 'too_many_ids'
  | 'not_found'
  | 'thumbnail_missing'
  | 'version_conflict'
  | 'invalid_name'
  | 'invalid_status'
  | 'invalid_tags'
  | 'legal_hold'
  | 'write_failed'
  | 'upstream_unavailable'
  | 'rate_limited'
  | (string & {});

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  /** Seconds the server asked us to wait, from `Retry-After`, if any. */
  readonly retryAfterMs: number | null;
  readonly requestId: string | null;

  constructor(args: {
    status: number;
    code: ApiErrorCode;
    message: string;
    retryAfterMs?: number | null;
    requestId?: string | null;
  }) {
    super(args.message);
    this.name = 'ApiError';
    this.status = args.status;
    this.code = args.code;
    this.retryAfterMs = args.retryAfterMs ?? null;
    this.requestId = args.requestId ?? null;
  }

  /**
   * Retry decision made from status/code, never from the message text.
   *
   * Retryable: transient infrastructure failures.
   *   - 503 upstream_unavailable, 429 rate_limited, 500 write_failed
   * Never retry: the request itself is wrong or the state moved under us.
   *   - 400 (incl. stale_cursor / bad_cursor), 409 version_conflict, 422 *
   */
  get retryable(): boolean {
    if (this.status === 429 || this.status === 503) return true;
    if (this.status === 500) return true; // write_failed is documented safe to retry
    return false;
  }
}

/** A network-level failure (fetch rejected: offline, DNS, connection reset). */
export class NetworkError extends Error {
  readonly cause?: unknown;
  constructor(message = 'Network request failed', cause?: unknown) {
    super(message);
    this.name = 'NetworkError';
    this.cause = cause;
  }
  // Network blips are transient.
  get retryable(): boolean {
    return true;
  }
}

/** True when the failure is a caller-initiated abort, which callers should ignore. */
export function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

/** Narrowing helper used across hooks. */
export function isRetryable(err: unknown): boolean {
  if (err instanceof ApiError) return err.retryable;
  if (err instanceof NetworkError) return err.retryable;
  return false;
}
