import type { InfiniteData, QueryClient } from '@tanstack/react-query';
import type { Asset, AssetStatus, AssetPage } from '@/lib/types';
import { assetKeys } from './queryKeys';

type ListData = InfiniteData<AssetPage>;

/**
 * Cache helpers shared by optimistic mutations.
 *
 * Edits have to reach every place a copy of the asset lives: all list queries
 * (there can be several — different filters cached at once) and the single
 * detail query. We patch in place by id and leave everything else untouched so
 * React Query only re-renders the affected rows.
 */

/** Apply a partial patch to a single asset everywhere it appears in any list. */
export function patchAssetInLists(
  qc: QueryClient,
  id: string,
  patch: Partial<Asset>,
): void {
  qc.setQueriesData<ListData>({ queryKey: assetKeys.lists() }, (data) => {
    if (!data) return data;
    let changed = false;
    const pages = data.pages.map((page) => {
      let pageChanged = false;
      const items = page.items.map((a) => {
        if (a.id !== id) return a;
        pageChanged = true;
        changed = true;
        return { ...a, ...patch };
      });
      return pageChanged ? { ...page, items } : page;
    });
    return changed ? { ...data, pages } : data;
  });
}

/** Set `status` on many assets at once across all lists (one cache pass). */
export function setStatusInLists(
  qc: QueryClient,
  ids: Set<string>,
  status: AssetStatus,
): void {
  qc.setQueriesData<ListData>({ queryKey: assetKeys.lists() }, (data) => {
    if (!data) return data;
    let changed = false;
    const pages = data.pages.map((page) => {
      let pageChanged = false;
      const items = page.items.map((a) => {
        if (!ids.has(a.id) || a.status === status) return a;
        pageChanged = true;
        changed = true;
        return { ...a, status };
      });
      return pageChanged ? { ...page, items } : page;
    });
    return changed ? { ...data, pages } : data;
  });
}

/** Snapshot current status for a set of ids, so a rollback can restore exactly. */
export function snapshotStatuses(qc: QueryClient, ids: string[]): Map<string, AssetStatus> {
  const snap = new Map<string, AssetStatus>();
  const lists = qc.getQueriesData<ListData>({ queryKey: assetKeys.lists() });
  for (const [, data] of lists) {
    if (!data) continue;
    for (const page of data.pages) {
      for (const a of page.items) {
        if (!snap.has(a.id) && ids.includes(a.id)) snap.set(a.id, a.status);
      }
    }
  }
  return snap;
}

/** Restore prior statuses for the given ids (used to roll back failures). */
export function restoreStatuses(qc: QueryClient, prior: Map<string, AssetStatus>): void {
  qc.setQueriesData<ListData>({ queryKey: assetKeys.lists() }, (data) => {
    if (!data) return data;
    let changed = false;
    const pages = data.pages.map((page) => {
      let pageChanged = false;
      const items = page.items.map((a) => {
        const was = prior.get(a.id);
        if (was === undefined || a.status === was) return a;
        pageChanged = true;
        changed = true;
        return { ...a, status: was };
      });
      return pageChanged ? { ...page, items } : page;
    });
    return changed ? { ...data, pages } : data;
  });
}

/** Replace a full asset object everywhere (used when the server returns fresh data). */
export function replaceAsset(qc: QueryClient, asset: Asset): void {
  patchAssetInLists(qc, asset.id, asset);
  qc.setQueryData<Asset>(assetKeys.detail(asset.id), asset);
}
