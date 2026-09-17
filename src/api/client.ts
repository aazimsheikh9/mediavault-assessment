import type { Asset, AssetPage, AssetQuery, BulkResult } from '@/lib/types';
import { ApiError, NetworkError } from './errors';

/**
 * HTTP client.
 *
 * Responsibilities kept deliberately small and explainable:
 *   - build requests, pass through an AbortSignal for cancellation
 *   - parse the API's `{ error: { code, message } }` envelope into a typed
 *     `ApiError` that carries status + code + Retry-After, so callers branch
 *     structurally rather than by string-matching
 *   - translate a rejected fetch into a `NetworkError`
 *
 * Retry/backoff is intentionally NOT here — it is a policy concern layered on
 * top in Task 4 (`withRetry`), so this stays a single round-trip primitive.
 */

function toSearchParams(query: AssetQuery): string {
  const params = new URLSearchParams();
  if (query.q) params.set('q', query.q);
  if (query.status?.length) params.set('status', query.status.join(','));
  if (query.kind?.length) params.set('kind', query.kind.join(','));
  if (query.tag?.length) params.set('tag', query.tag.join(','));
  if (query.collectionId) params.set('collectionId', query.collectionId);
  if (query.owner) params.set('owner', query.owner);
  if (query.sort) params.set('sort', query.sort);
  if (query.limit) params.set('limit', String(query.limit));
  if (query.cursor) params.set('cursor', query.cursor);
  return params.toString();
}

function parseRetryAfterMs(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(header);
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  return null;
}

export interface RequestOptions {
  signal?: AbortSignal;
}

async function request<T>(
  path: string,
  init?: RequestInit & RequestOptions,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    });
  } catch (err) {
    // fetch only rejects on network-level failure or abort. Re-throw aborts
    // untouched so callers can recognise them; wrap the rest as NetworkError.
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new NetworkError('Could not reach the server.', err);
  }

  const requestId = res.headers.get('x-request-id');

  if (!res.ok) {
    let code = 'unknown';
    let message = res.statusText || 'Request failed';
    try {
      const body = await res.json();
      code = body?.error?.code ?? code;
      message = body?.error?.message ?? message;
    } catch {
      /* body was not JSON */
    }
    throw new ApiError({
      status: res.status,
      code,
      message,
      retryAfterMs: parseRetryAfterMs(res.headers.get('retry-after')),
      requestId,
    });
  }

  return res.json() as Promise<T>;
}

export function listAssets(query: AssetQuery, opts?: RequestOptions): Promise<AssetPage> {
  return request<AssetPage>(`/api/assets?${toSearchParams(query)}`, opts);
}

export function getAsset(id: string, opts?: RequestOptions): Promise<Asset> {
  return request<Asset>(`/api/assets/${id}`, opts);
}

export function getAssetsByIds(
  ids: string[],
  opts?: RequestOptions,
): Promise<{ items: Asset[]; missing: string[] }> {
  // The endpoint rejects more than 25 ids per call; chunking is the caller's job.
  return request(`/api/assets/batch?ids=${ids.join(',')}`, opts);
}

export function updateAsset(
  id: string,
  version: number,
  patch: Partial<Pick<Asset, 'name' | 'status' | 'tags'>>,
  opts?: RequestOptions,
): Promise<Asset> {
  return request<Asset>(`/api/assets/${id}`, {
    ...opts,
    method: 'PATCH',
    body: JSON.stringify({ version, patch }),
  });
}

export function bulkSetStatus(
  ids: string[],
  status: Asset['status'],
  opts?: RequestOptions,
): Promise<BulkResult> {
  // The endpoint rejects more than 50 ids per call; chunking is the caller's job.
  return request<BulkResult>('/api/assets/bulk-status', {
    ...opts,
    method: 'POST',
    body: JSON.stringify({ ids, status }),
  });
}

export const thumbnailUrl = (id: string) => `/api/thumb/${id}.svg`;
