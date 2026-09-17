import { useEffect, useRef } from 'react';
import { thumbnailUrl } from '@/api/client';
import { formatBytes, formatDate, statusLabel } from '@/lib/format';
import type { Asset } from '@/lib/types';

interface Props {
  assets: Asset[];
  selectedIds: Set<string>;
  activeId: string | null;
  onToggleSelect: (id: string) => void;
  onOpen: (id: string) => void;
  isLoading: boolean;
  isError: boolean;
  errorMessage: string | null;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
}

/**
 * Grid with distinct loading / empty / error states (defect #20) and an
 * IntersectionObserver sentinel that pages the infinite query.
 *
 * Virtualization, memoised cards and keyboard nav land in Tasks 2 and 5; this
 * step is about correctness of states and pagination wiring.
 */
export function AssetGrid({
  assets,
  selectedIds,
  activeId,
  onToggleSelect,
  onOpen,
  isLoading,
  isError,
  errorMessage,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
}: Props) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasNextPage) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage) onLoadMore();
      },
      { rootMargin: '600px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasNextPage, isFetchingNextPage, onLoadMore]);

  // Error is its own state — never conflated with "no results".
  if (isError) {
    return (
      <div className="state state--error">
        <p>{errorMessage ?? 'The request failed.'}</p>
        <p className="muted">This usually clears on its own. It will retry automatically.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="state state--loading" aria-busy="true">
        <p className="muted">Loading assets…</p>
      </div>
    );
  }

  if (assets.length === 0) {
    return (
      <div className="state state--empty">
        <p>Nothing matches these filters.</p>
        <p className="muted">Clear the search box or widen the status filter.</p>
      </div>
    );
  }

  return (
    <div className="grid-scroll">
      <div className="grid">
        {assets.map((asset) => (
          <div
            key={asset.id}
            className={
              'card' +
              (selectedIds.has(asset.id) ? ' card--selected' : '') +
              (activeId === asset.id ? ' card--active' : '')
            }
            onClick={() => onOpen(asset.id)}
          >
            {asset.hasThumbnail ? (
              <img
                className="card__thumb"
                src={thumbnailUrl(asset.id)}
                alt=""
                loading="lazy"
              />
            ) : (
              <div className="card__thumb card__thumb--placeholder" aria-hidden="true">
                {asset.kind}
              </div>
            )}
            <div className="card__body">
              <p className="card__name">{asset.name}</p>
              <p className="muted">
                {asset.kind} · {formatBytes(asset.sizeBytes)} · {formatDate(asset.updatedAt)}
              </p>
              <span className={`pill pill--${asset.status}`}>{statusLabel(asset.status)}</span>
            </div>
            <input
              type="checkbox"
              className="card__check"
              checked={selectedIds.has(asset.id)}
              aria-label={`Select ${asset.name}`}
              onClick={(e) => e.stopPropagation()}
              onChange={() => onToggleSelect(asset.id)}
            />
          </div>
        ))}
      </div>

      <div ref={sentinelRef} className="grid__sentinel">
        {isFetchingNextPage && <span className="muted">Loading more…</span>}
      </div>
    </div>
  );
}
