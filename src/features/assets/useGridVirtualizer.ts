import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

interface Options {
  /** Total number of items across all loaded pages. */
  itemCount: number;
  /** Target minimum card width in px; columns are derived from container width. */
  minColumnWidth: number;
  /** Fixed row height in px (card height + row gap). */
  rowHeight: number;
  /** Horizontal/vertical gap between cards in px. */
  gap: number;
  /** Extra rows rendered above/below the viewport to hide fast-scroll gaps. */
  overscanRows?: number;
}

export interface VirtualWindow {
  /** Columns per row at the current container width. */
  columns: number;
  /** Total scrollable height in px — reserves space so there is no layout shift. */
  totalHeight: number;
  /** px offset of the first rendered row, applied as a translate/paddingTop. */
  offsetTop: number;
  /** Inclusive item index range to render. */
  startIndex: number;
  endIndex: number;
  rowHeight: number;
  gap: number;
}

/**
 * Row-based virtualizer for a responsive CSS grid.
 *
 * The grid is `repeat(auto-fill, minmax(minColumnWidth, 1fr))`, so the number of
 * columns depends on the container width. We measure the container, derive the
 * column count ourselves, and virtualize by *row* (a row is `columns` cards).
 * Only the rows intersecting the viewport (plus overscan) are rendered, so the
 * DOM node count is bounded by the viewport, not by how far the user scrolled.
 *
 * A ResizeObserver keeps `columns`/height correct on window resize; a scroll
 * listener (rAF-throttled) updates the visible range.
 */
export function useGridVirtualizer({
  itemCount,
  minColumnWidth,
  rowHeight,
  gap,
  overscanRows = 3,
}: Options) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);

  // Measure the scroll container and keep measurements current on resize.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => {
      setViewportHeight(el.clientHeight);
      setContainerWidth(el.clientWidth);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // rAF-throttled scroll tracking so we do at most one state update per frame.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        setScrollTop(el.scrollTop);
      });
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  const columns = Math.max(
    1,
    Math.floor((containerWidth + gap) / (minColumnWidth + gap)) || 1,
  );

  const rowCount = Math.ceil(itemCount / columns);
  const totalHeight = rowCount * rowHeight - (rowCount > 0 ? gap : 0);

  const firstVisibleRow = Math.max(0, Math.floor(scrollTop / rowHeight) - overscanRows);
  const visibleRowCount = Math.ceil(viewportHeight / rowHeight) + overscanRows * 2;
  const lastVisibleRow = Math.min(rowCount - 1, firstVisibleRow + visibleRowCount);

  const startIndex = firstVisibleRow * columns;
  const endIndex = Math.min(itemCount - 1, (lastVisibleRow + 1) * columns - 1);
  const offsetTop = firstVisibleRow * rowHeight;

  // Imperatively read/set scroll position (used to preserve scroll across
  // panel open/close and selection changes without a re-render round-trip).
  const getScrollTop = useCallback(() => scrollRef.current?.scrollTop ?? 0, []);
  const setScrollTopImperative = useCallback((value: number) => {
    if (scrollRef.current) scrollRef.current.scrollTop = value;
  }, []);

  const virtual: VirtualWindow = {
    columns,
    totalHeight: Math.max(0, totalHeight),
    offsetTop,
    startIndex,
    endIndex: Math.max(startIndex - 1, endIndex),
    rowHeight,
    gap,
  };

  const measured = containerWidth > 0;

  return {
    scrollRef,
    virtual,
    measured,
    getScrollTop,
    setScrollTop: setScrollTopImperative,
  };
}
