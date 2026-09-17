import { useInfiniteQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { listAssets } from '@/api/client';
import { isRetryable } from '@/api/errors';
import type { Asset, AssetPage } from '@/lib/types';
import { assetKeys, type ListFilters } from './queryKeys';

const PAGE_SIZE = 50; // API caps limit at 50; take the max to minimise round-trips.

/**
 * Infinite list of assets for the current filters.
 *
 * What this hook gets from TanStack Query, and why it closes the baseline bugs:
 *   - Cancellation: the `signal` is passed to `fetch`, so when the query key
 *     changes the previous request is aborted, not just ignored (defect #3).
 *   - Stale-response safety: data is keyed by filters, so a late response for
 *     an old query cannot overwrite the current one (defect #2).
 *   - De-duplication: identical keys share a single in-flight request (#5).
 *   - Cursor pagination: `getNextPageParam` reads `nextCursor`; changing a
 *     filter is a new key, so the cursor is never reused across queries and
 *     `400 stale_cursor` cannot reach the user (#7).
 *
 * Retry here is a placeholder count; the real backoff+jitter policy arrives in
 * Task 4. We already refuse to retry non-transient errors structurally.
 */
export function useAssets(filters: ListFilters) {
  const query = useInfiniteQuery({
    queryKey: assetKeys.list(filters),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      listAssets({ ...filters, cursor: pageParam ?? undefined, limit: PAGE_SIZE }, { signal }),
    getNextPageParam: (lastPage: AssetPage) => lastPage.nextCursor,
    retry: (failureCount, error) => isRetryable(error) && failureCount < 3,
  });

  const items = useMemo<Asset[]>(
    () => query.data?.pages.flatMap((p) => p.items) ?? [],
    [query.data],
  );

  const total = query.data?.pages[0]?.total ?? 0;

  return {
    items,
    total,
    // status flags kept distinct so the UI can tell loading / empty / error apart
    isLoading: query.isPending,
    isError: query.isError,
    error: query.error,
    isFetchingNextPage: query.isFetchingNextPage,
    hasNextPage: query.hasNextPage,
    fetchNextPage: query.fetchNextPage,
    refetch: query.refetch,
    isFetching: query.isFetching,
  };
}
