import { useCallback, useRef, useState } from 'react';

/**
 * Selection model for the grid.
 *
 * Supports:
 *   - plain toggle (click a checkbox / press Space)
 *   - range extend (shift-click, Shift+arrow): selects from the anchor to the
 *     clicked index inclusive, using the current ordered id list
 *   - select-all-loaded / clear
 *
 * The anchor is the last index the user acted on without Shift. Range ops read
 * the live ordered ids so they work regardless of virtualization (most rows are
 * not in the DOM). Selection is a Set for O(1) membership on every card.
 */
export function useSelection() {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const anchorRef = useRef<number | null>(null);

  const toggle = useCallback((id: string, index: number) => {
    anchorRef.current = index;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectRange = useCallback((toIndex: number, orderedIds: string[]) => {
    const from = anchorRef.current ?? toIndex;
    const lo = Math.min(from, toIndex);
    const hi = Math.max(from, toIndex);
    setSelected((prev) => {
      const next = new Set(prev);
      for (let i = lo; i <= hi; i++) {
        const id = orderedIds[i];
        if (id) next.add(id);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback((orderedIds: string[]) => {
    setSelected(new Set(orderedIds));
  }, []);

  const clear = useCallback(() => {
    setSelected(new Set());
    anchorRef.current = null;
  }, []);

  return { selected, toggle, selectRange, selectAll, clear };
}
