import type { AssetQuery } from '@/lib/types';

/**
 * Query key factory. One place that defines identity for cached data.
 *
 * The list key includes every field that changes the result set. Two
 * consequences fall out of that, both of which we want:
 *   - A slow response for an old query can never be written into the cache
 *     entry for a new query, because the keys differ. That is the structural
 *     defence against stale search results (Task 1).
 *   - Because the key omits `cursor`, all pages of one filter live under a
 *     single infinite-query entry, and changing a filter starts a fresh entry
 *     with no cursor — so a cursor is never reused across queries, which is
 *     what would trigger `400 stale_cursor`.
 */

/** The subset of a query that defines a distinct result set (no cursor/limit). */
export type ListFilters = Omit<AssetQuery, 'cursor' | 'limit'>;

export const assetKeys = {
  all: ['assets'] as const,
  lists: () => [...assetKeys.all, 'list'] as const,
  list: (filters: ListFilters) =>
    [
      ...assetKeys.lists(),
      {
        q: filters.q ?? '',
        status: [...(filters.status ?? [])].sort(),
        kind: [...(filters.kind ?? [])].sort(),
        tag: [...(filters.tag ?? [])].sort(),
        collectionId: filters.collectionId ?? '',
        owner: filters.owner ?? '',
        sort: filters.sort ?? 'updatedAt:desc',
      },
    ] as const,
  detail: (id: string) => [...assetKeys.all, 'detail', id] as const,
};
