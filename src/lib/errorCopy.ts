import { ApiError, NetworkError } from '@/api/errors';

/**
 * Turns an error into a message a person can act on. The API's own strings
 * (e.g. "Too many requests in the last 10 seconds.") are implementation
 * detail; we branch on the structured code, never on the raw text.
 *
 * Expanded further in Task 4/6; this is the shared entry point.
 */
export function humanError(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case 'rate_limited':
        return 'Too much happening at once. Pausing for a moment, then retrying.';
      case 'upstream_unavailable':
        return 'The library is briefly unavailable. Retrying…';
      case 'stale_cursor':
      case 'bad_cursor':
        return 'Your view refreshed. Showing the latest results.';
      case 'version_conflict':
        return 'This asset was changed by someone else. Reload it to see the latest.';
      case 'legal_hold':
        return 'This asset is on legal hold and cannot be changed.';
      case 'too_many_ids':
        return 'That is too many assets for one request.';
      case 'not_found':
        return 'That asset no longer exists.';
      default:
        return 'Something went wrong handling that request.';
    }
  }
  if (err instanceof NetworkError) {
    return 'You appear to be offline. We will reconnect automatically.';
  }
  return 'Something went wrong.';
}
