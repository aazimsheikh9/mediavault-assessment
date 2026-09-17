import { useCallback, useEffect, useMemo, useState } from 'react';
import { AssetDetail } from '@/features/assets/AssetDetail';
import { AssetGrid } from '@/features/assets/AssetGrid';
import { BulkResultBar } from '@/features/assets/BulkResultBar';
import { useAssets } from '@/features/assets/useAssets';
import { useBulkStatus, type BulkReport } from '@/features/assets/useBulkStatus';
import { useSelection } from '@/features/assets/useSelection';
import { statusLabel } from '@/lib/format';
import { humanError } from '@/lib/errorCopy';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { useUrlState } from '@/lib/useUrlState';
import type { AssetStatus, AssetKind, AssetQuery } from '@/lib/types';
import type { ListFilters } from '@/features/assets/queryKeys';

const STATUSES: AssetStatus[] = ['draft', 'in_review', 'approved', 'archived'];
const KINDS: AssetKind[] = ['image', 'video', 'document'];
const SORTS: Array<{ value: NonNullable<AssetQuery['sort']>; label: string }> = [
  { value: 'updatedAt:desc', label: 'Recently updated' },
  { value: 'name:asc', label: 'Name A–Z' },
  { value: 'sizeBytes:desc', label: 'Largest first' },
  { value: 'createdAt:desc', label: 'Newest' },
];

/**
 * 250ms search debounce. Rationale: the rate limit is 80 requests / 10s and the
 * server is slowest for short prefixes, so firing on every keystroke both trips
 * the limit and maximises out-of-order responses. 250ms is short enough to feel
 * live while collapsing a burst of typing into roughly one request per pause.
 */
const SEARCH_DEBOUNCE_MS = 250;

const csv = (v: string | undefined) =>
  v ? v.split(',').map((s) => s.trim()).filter(Boolean) : [];

const DEFAULT_SORT: NonNullable<AssetQuery['sort']> = 'updatedAt:desc';

export function App() {
  const [urlParams, setUrl] = useUrlState();

  // Filters are derived from the URL — reload/share restores the exact view.
  const status = useMemo(() => csv(urlParams.status) as AssetStatus[], [urlParams.status]);
  const kind = useMemo(() => csv(urlParams.kind) as AssetKind[], [urlParams.kind]);
  const sort = (urlParams.sort as NonNullable<AssetQuery['sort']>) || DEFAULT_SORT;

  // Search text is local for responsiveness, debounced before it reaches the URL
  // and the query. `q` in the URL is the source of truth on first load.
  const [qInput, setQInput] = useState(urlParams.q ?? '');
  const debouncedQ = useDebouncedValue(qInput, SEARCH_DEBOUNCE_MS);

  // Push the debounced search into the URL with `replace` so a burst of typing
  // does not create one history entry per keystroke.
  useEffect(() => {
    if ((urlParams.q ?? '') !== debouncedQ) {
      setUrl({ q: debouncedQ }, 'replace');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQ]);

  const filters: ListFilters = useMemo(
    () => ({ q: debouncedQ || undefined, status, kind, sort }),
    [debouncedQ, status, kind, sort],
  );

  const {
    items,
    total,
    isLoading,
    isError,
    error,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useAssets(filters);

  const { selected, toggle, selectRange, selectAll, clear } = useSelection();
  const bulk = useBulkStatus();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [report, setReport] = useState<BulkReport | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const orderedIds = useMemo(() => items.map((a) => a.id), [items]);

  // Route card selection: shift extends a range, plain click toggles one.
  const onToggleSelect = useCallback(
    (id: string, index: number, shiftKey: boolean) => {
      if (shiftKey) selectRange(index, orderedIds);
      else toggle(id, index);
    },
    [selectRange, toggle, orderedIds],
  );

  // Discrete filter changes: push a history entry, and drop selection since the
  // visible set changes. Cursor reset is automatic — new filters = new query key.
  const toggleStatus = (s: AssetStatus, checked: boolean) => {
    clear();
    const next = checked ? [...status, s] : status.filter((x) => x !== s);
    setUrl({ status: next.join(',') }, 'push');
  };
  const toggleKind = (k: AssetKind, checked: boolean) => {
    clear();
    const next = checked ? [...kind, k] : kind.filter((x) => x !== k);
    setUrl({ kind: next.join(',') }, 'push');
  };
  const changeSort = (value: NonNullable<AssetQuery['sort']>) => {
    clear();
    setUrl({ sort: value === DEFAULT_SORT ? '' : value }, 'push');
  };

  const applyBulkStatus = useCallback(
    async (next: AssetStatus, ids: string[]) => {
      if (ids.length === 0) return;
      setNotice(null);
      setReport(null);
      clear();
      const result = await bulk.run(ids, next);
      setReport(result);
    },
    [bulk, clear],
  );

  return (
    <div className="app">
      <header className="topbar">
        <h1>MediaVault</h1>
        <input
          className="search"
          type="search"
          placeholder="Search assets"
          value={qInput}
          onChange={(e) => setQInput(e.target.value)}
        />
        <select value={sort} onChange={(e) => changeSort(e.target.value as typeof sort)}>
          {SORTS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </header>

      <div className="filters">
        <fieldset className="filters__group">
          <legend className="muted">Status</legend>
          {STATUSES.map((s) => (
            <label key={s}>
              <input
                type="checkbox"
                checked={status.includes(s)}
                onChange={(e) => toggleStatus(s, e.target.checked)}
              />
              {statusLabel(s)}
            </label>
          ))}
        </fieldset>
        <fieldset className="filters__group">
          <legend className="muted">Kind</legend>
          {KINDS.map((k) => (
            <label key={k}>
              <input
                type="checkbox"
                checked={kind.includes(k)}
                onChange={(e) => toggleKind(k, e.target.checked)}
              />
              {k}
            </label>
          ))}
        </fieldset>
        <span className="muted filters__count">
          {isLoading ? 'Loading…' : `${items.length} of ${total.toLocaleString()} shown`}
        </span>
      </div>

      {selected.size > 0 && (
        <div className="bulkbar">
          <span>{selected.size} selected</span>
          {STATUSES.map((s) => (
            <button
              key={s}
              disabled={bulk.pending}
              onClick={() => applyBulkStatus(s, [...selected])}
            >
              Set {statusLabel(s).toLowerCase()}
            </button>
          ))}
          <button onClick={() => selectAll(orderedIds)}>Select all loaded ({items.length})</button>
          <button onClick={clear}>Clear selection</button>
        </div>
      )}

      {report && (
        <BulkResultBar
          report={report}
          busy={bulk.pending}
          onRetryFailed={() => applyBulkStatus(report.status, report.retryableIds)}
          onUndo={() => {
            bulk.undo(report);
            setReport(null);
          }}
          onDismiss={() => setReport(null)}
        />
      )}

      {notice && <p className="notice">{notice}</p>}

      <main className="content">
        <AssetGrid
          assets={items}
          selectedIds={selected}
          activeId={activeId}
          onToggleSelect={onToggleSelect}
          onOpen={setActiveId}
          isLoading={isLoading}
          isError={isError}
          errorMessage={isError ? humanError(error) : null}
          hasNextPage={!!hasNextPage}
          isFetchingNextPage={isFetchingNextPage}
          onLoadMore={fetchNextPage}
        />
        {activeId && (
          <AssetDetail id={activeId} onClose={() => setActiveId(null)} />
        )}
      </main>
    </div>
  );
}
