import { useEffect } from 'react';
import type { Asset } from '@/lib/types';
import { AssetCard } from './AssetCard';
import { useGridVirtualizer } from './useGridVirtualizer';

interface Props {
  assets: Asset[];
  selectedIds: Set<string>;
  activeId: string | null;
  onToggleSelect: (id: string, index: number, shiftKey: boolean) => void;
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
  const { scrollRef, virtual, measured } = useGridVirtualizer({
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

  // Until the container is measured we know neither columns nor row range, so
  // render none rather than flashing a wrong (1-column) layout.
  const visible = measured ? assets.slice(virtual.startIndex, virtual.endIndex + 1) : [];

  // The scroll container is ALWAYS mounted so the virtualizer's ref stays
  // attached and measured across loading/loaded transitions. Distinct states
  // render as overlays inside it — never by swapping the container out, which
  // previously reset the measurement and left the grid blank after a filter
  // change even though items had arrived.
  const overlay = isError ? (
    <div className="state state--error" role="alert">
      <p>{errorMessage ?? 'The request failed.'}</p>
      <p className="muted">This usually clears on its own. It will retry automatically.</p>
    </div>
  ) : isLoading ? (
    <div className="state state--loading" aria-busy="true">
      <p className="muted">Loading assets…</p>
    </div>
  ) : assets.length === 0 ? (
    <div className="state state--empty">
      <p>Nothing matches these filters.</p>
      <p className="muted">Clear the search box or widen the status filter.</p>
    </div>
  ) : null;

  return (
    <div className="grid-scroll" ref={scrollRef}>
      {overlay}
      {!overlay && (
        <div className="grid-sizer" style={{ height: virtual.totalHeight }}>
          <div
            className="grid"
            style={{
              transform: `translateY(${virtual.offsetTop}px)`,
              gridTemplateColumns: `repeat(${virtual.columns}, minmax(0, 1fr))`,
            }}
          >
            {visible.map((asset, i) => (
              <AssetCard
                key={asset.id}
                asset={asset}
                index={virtual.startIndex + i}
                selected={selectedIds.has(asset.id)}
                active={activeId === asset.id}
                onToggleSelect={onToggleSelect}
                onOpen={onOpen}
              />
            ))}
          </div>
        </div>
      )}
      {isFetchingNextPage && (
        <p className="grid__more muted" aria-hidden="true">
          Loading more…
        </p>
      )}
    </div>
  );
}
