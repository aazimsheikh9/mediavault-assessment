import { useEffect } from 'react';
import type { Asset } from '@/lib/types';
import { AssetCard } from './AssetCard';
import { useGridVirtualizer } from './useGridVirtualizer';

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

// Card box (min width) and full row height incl. the gap. Kept in sync with CSS.
const MIN_COL_WIDTH = 220;
const ROW_HEIGHT = 236; // card ~= 224px tall + 12px gap
const GAP = 12;

/**
 * Virtualized asset grid.
 *
 * Row-based virtualization (see useGridVirtualizer): we render only the rows in
 * the viewport plus a small overscan, inside a spacer of the full scroll height.
 * The spacer reserves space up front so paging in more assets causes no layout
 * shift, and the rendered DOM node count is bounded by the viewport rather than
 * by how far the user has scrolled.
 *
 * Prefetch: when the last rendered row is within one screen of the end of the
 * loaded set, we ask for the next page — this replaces the DOM sentinel and
 * works even though most rows are not in the DOM.
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
  const { scrollRef, virtual } = useGridVirtualizer({
    itemCount: assets.length,
    minColumnWidth: MIN_COL_WIDTH,
    rowHeight: ROW_HEIGHT,
    gap: GAP,
  });

  // Page in more when the rendered window approaches the end of what we have.
  useEffect(() => {
    if (!hasNextPage || isFetchingNextPage) return;
    const remaining = assets.length - 1 - virtual.endIndex;
    if (remaining <= virtual.columns * 4) onLoadMore();
  }, [virtual.endIndex, virtual.columns, assets.length, hasNextPage, isFetchingNextPage, onLoadMore]);

  // Error / loading / empty are distinct states, never conflated.
  if (isError) {
    return (
      <div className="state state--error" role="alert">
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

  const visible = assets.slice(virtual.startIndex, virtual.endIndex + 1);

  return (
    <div className="grid-scroll" ref={scrollRef}>
      {/* Spacer reserves the full height so scrollbar + layout are stable. */}
      <div className="grid-sizer" style={{ height: virtual.totalHeight }}>
        <div
          className="grid"
          style={{
            transform: `translateY(${virtual.offsetTop}px)`,
            gridTemplateColumns: `repeat(${virtual.columns}, minmax(0, 1fr))`,
          }}
        >
          {visible.map((asset) => (
            <AssetCard
              key={asset.id}
              asset={asset}
              selected={selectedIds.has(asset.id)}
              active={activeId === asset.id}
              onToggleSelect={onToggleSelect}
              onOpen={onOpen}
            />
          ))}
        </div>
      </div>
      {isFetchingNextPage && (
        <p className="grid__more muted" aria-hidden="true">
          Loading more…
        </p>
      )}
    </div>
  );
}
