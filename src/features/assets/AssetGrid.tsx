import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Asset } from '@/lib/types';
import { AssetCard } from './AssetCard';
import { useGridVirtualizer } from './useGridVirtualizer';

interface Props {
  assets: Asset[];
  selectedIds: Set<string>;
  activeId: string | null;
  onToggleSelect: (id: string, index: number, shiftKey: boolean) => void;
  onOpen: (id: string) => void;
  onRangeTo: (index: number) => void;
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
 * Virtualized, keyboard-operable asset grid.
 *
 * Keyboard model (roving tabindex — one tab stop for the whole grid, never
 * 12,400):
 *   - Arrow keys move a "focused index"; Left/Right by 1, Up/Down by a full row.
 *   - Home/End jump to first/last loaded.
 *   - Enter opens the focused card; Space toggles its selection.
 *   - Shift+Arrow moves focus AND extends the selection range to the new index.
 * When focus moves to a card outside the virtual window we scroll it into view,
 * then a layout effect moves real DOM focus to it once it is rendered.
 */
export function AssetGrid({
  assets,
  selectedIds,
  activeId,
  onToggleSelect,
  onOpen,
  onRangeTo,
  isLoading,
  isError,
  errorMessage,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
}: Props) {
  const { scrollRef, virtual, measured, scrollIndexIntoView } = useGridVirtualizer({
    itemCount: assets.length,
    minColumnWidth: MIN_COL_WIDTH,
    rowHeight: ROW_HEIGHT,
    gap: GAP,
  });

  const [focusedIndex, setFocusedIndex] = useState(0);
  // When true, the next render should pull DOM focus onto the focused card
  // (i.e. the move came from the keyboard, not from a mouse click).
  const pullFocus = useRef(false);

  // Keep the focused index in range as the result set changes (e.g. filtering
  // shrinks the list) so focus is never pointing past the end.
  useEffect(() => {
    setFocusedIndex((i) => Math.min(i, Math.max(0, assets.length - 1)));
  }, [assets.length]);

  // After the virtual window updates, move real DOM focus to the focused card
  // if a keyboard action requested it.
  useLayoutEffect(() => {
    if (!pullFocus.current) return;
    const el = scrollRef.current?.querySelector<HTMLElement>(
      `[data-card-index="${focusedIndex}"]`,
    );
    if (el) {
      el.focus();
      pullFocus.current = false;
    }
  });

  const moveFocus = useCallback(
    (nextIndex: number, extendRange: boolean) => {
      const clamped = Math.max(0, Math.min(assets.length - 1, nextIndex));
      pullFocus.current = true;
      scrollIndexIntoView(clamped);
      setFocusedIndex(clamped);
      if (extendRange) onRangeTo(clamped);
    },
    [assets.length, scrollIndexIntoView, onRangeTo],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent, index: number) => {
      const cols = virtual.columns;
      switch (e.key) {
        case 'ArrowRight':
          e.preventDefault();
          moveFocus(index + 1, e.shiftKey);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          moveFocus(index - 1, e.shiftKey);
          break;
        case 'ArrowDown':
          e.preventDefault();
          moveFocus(index + cols, e.shiftKey);
          break;
        case 'ArrowUp':
          e.preventDefault();
          moveFocus(index - cols, e.shiftKey);
          break;
        case 'Home':
          e.preventDefault();
          moveFocus(0, e.shiftKey);
          break;
        case 'End':
          e.preventDefault();
          moveFocus(assets.length - 1, e.shiftKey);
          break;
        case 'Enter':
          e.preventDefault();
          onOpen(assets[index]!.id);
          break;
        case ' ':
        case 'Spacebar':
          e.preventDefault();
          onToggleSelect(assets[index]!.id, index, false);
          break;
        default:
          break;
      }
    },
    [virtual.columns, moveFocus, assets, onOpen, onToggleSelect],
  );

  const onCardFocus = useCallback((index: number) => {
    // Sync roving index when focus arrives via mouse/tab, without re-pulling.
    setFocusedIndex(index);
  }, []);

  // Page in more when the rendered window approaches the end of what we have.
  useEffect(() => {
    if (!hasNextPage || isFetchingNextPage) return;
    const remaining = assets.length - 1 - virtual.endIndex;
    if (remaining <= virtual.columns * 4) onLoadMore();
  }, [virtual.endIndex, virtual.columns, assets.length, hasNextPage, isFetchingNextPage, onLoadMore]);

  const visible = measured ? assets.slice(virtual.startIndex, virtual.endIndex + 1) : [];

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
            role="grid"
            aria-label="Assets"
            aria-rowcount={assets.length}
            className="grid"
            style={{
              transform: `translateY(${virtual.offsetTop}px)`,
              gridTemplateColumns: `repeat(${virtual.columns}, minmax(0, 1fr))`,
            }}
          >
            {visible.map((asset, i) => {
              const index = virtual.startIndex + i;
              return (
                <AssetCard
                  key={asset.id}
                  asset={asset}
                  index={index}
                  selected={selectedIds.has(asset.id)}
                  active={activeId === asset.id}
                  tabbable={index === focusedIndex}
                  onToggleSelect={onToggleSelect}
                  onOpen={onOpen}
                  onKeyDown={onKeyDown}
                  onFocus={onCardFocus}
                />
              );
            })}
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
