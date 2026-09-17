import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { getAsset, thumbnailUrl, updateAsset } from '@/api/client';
import { ApiError } from '@/api/errors';
import { formatBytes, formatDate, formatDuration, statusLabel } from '@/lib/format';
import { humanError } from '@/lib/errorCopy';
import type { Asset, AssetStatus } from '@/lib/types';
import { assetKeys } from './queryKeys';
import { patchAssetInLists, replaceAsset } from './assetCache';
import { StatusBadge } from './StatusBadge';

const STATUSES: AssetStatus[] = ['draft', 'in_review', 'approved', 'archived'];

interface Props {
  id: string;
  onClose: () => void;
}

/**
 * Detail panel.
 *
 * - Loads the asset with its own cached query (dedupes with the list).
 * - Status change is optimistic: we write the new status into the detail and
 *   list caches immediately, then confirm with the server.
 * - `409 version_conflict` is handled deliberately (see below), not shown raw.
 *
 * 409 policy (justified): the API rejects a PATCH whose `version` is stale, so a
 * blind overwrite is impossible and a silent one would discard whoever edited
 * the row. We refetch the current asset, roll back the optimistic change, keep
 * the panel open, and tell the user it changed underneath them so they can
 * re-apply against the fresh version if they still want to. This preserves the
 * other person's write and the user's intent, and never loses data silently.
 *
 * Focus management (move-in / Escape / return) is added in Task 5.
 */
export function AssetDetail({ id, onClose }: Props) {
  const qc = useQueryClient();
  const [conflict, setConflict] = useState(false);
  const panelRef = useRef<HTMLElement | null>(null);

  // Move focus into the panel when it opens (focus the heading region), and
  // close on Escape. Focus return to the opener is handled by the caller.
  useEffect(() => {
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    const node = panelRef.current;
    node?.addEventListener('keydown', onKey);
    return () => node?.removeEventListener('keydown', onKey);
  }, [onClose]);

  const {
    data: asset,
    isPending,
    isError,
    error,
  } = useQuery({
    queryKey: assetKeys.detail(id),
    queryFn: ({ signal }) => getAsset(id, { signal }),
    // retry / retryDelay from the shared QueryClient policy (api/retry.ts).
  });

  const mutation = useMutation({
    mutationFn: (vars: { version: number; status: AssetStatus }) =>
      updateAsset(id, vars.version, { status: vars.status }),
    onMutate: async (vars) => {
      setConflict(false);
      await qc.cancelQueries({ queryKey: assetKeys.detail(id) });
      const prev = qc.getQueryData<Asset>(assetKeys.detail(id));
      if (prev) {
        // optimistic: update detail + every list that shows this asset
        qc.setQueryData<Asset>(assetKeys.detail(id), { ...prev, status: vars.status });
        patchAssetInLists(qc, id, { status: vars.status });
      }
      return { prev };
    },
    onError: async (err, _vars, ctx) => {
      // roll back the optimistic change
      if (ctx?.prev) {
        qc.setQueryData<Asset>(assetKeys.detail(id), ctx.prev);
        patchAssetInLists(qc, id, { status: ctx.prev.status });
      }
      if (err instanceof ApiError && err.code === 'version_conflict') {
        setConflict(true);
        // refetch the truth so the panel shows the current version/status
        await qc.invalidateQueries({ queryKey: assetKeys.detail(id) });
      }
    },
    onSuccess: (updated) => {
      // trust the server's version-bumped asset everywhere
      replaceAsset(qc, updated);
    },
  });

  const saving = mutation.isPending;
  const saveError =
    mutation.error && !(mutation.error instanceof ApiError && mutation.error.code === 'version_conflict')
      ? humanError(mutation.error)
      : null;

  return (
    <aside
      className="panel"
      ref={panelRef}
      tabIndex={-1}
      role="dialog"
      aria-label="Asset detail"
    >
      <div className="panel__head">
        <h2>Asset detail</h2>
        <button onClick={onClose}>Close</button>
      </div>

      {isError && <p className="error">{humanError(error)}</p>}
      {isPending && !isError && <p className="muted">Loading…</p>}

      {conflict && (
        <p className="notice notice--warn">
          This asset was changed by someone else. We’ve loaded the latest — re-apply
          your change if you still want it.
        </p>
      )}
      {saveError && <p className="error">{saveError}</p>}

      {asset && (
        <div className="panel__body">
          {asset.hasThumbnail ? (
            <img className="panel__thumb" src={thumbnailUrl(asset.id)} alt="" />
          ) : (
            <div className="panel__thumb panel__thumb--placeholder" aria-hidden="true">
              {asset.kind}
            </div>
          )}
          <h3>{asset.name}</h3>
          <div className="panel__status">
            <StatusBadge status={asset.status} />
          </div>
          <dl className="facts">
            <dt>Id</dt>
            <dd>{asset.id}</dd>
            <dt>Kind</dt>
            <dd>{asset.kind}</dd>
            <dt>Size</dt>
            <dd>{formatBytes(asset.sizeBytes)}</dd>
            {asset.width != null && (
              <>
                <dt>Dimensions</dt>
                <dd>
                  {asset.width}×{asset.height}
                </dd>
              </>
            )}
            {asset.durationSec != null && (
              <>
                <dt>Duration</dt>
                <dd>{formatDuration(asset.durationSec)}</dd>
              </>
            )}
            <dt>Owner</dt>
            <dd>{asset.owner.name}</dd>
            <dt>Updated</dt>
            <dd>{formatDate(asset.updatedAt)}</dd>
            <dt>Version</dt>
            <dd>{asset.version}</dd>
          </dl>

          {asset.tags.length > 0 && (
            <ul className="tags">
              {asset.tags.map((tag) => (
                <li key={tag}>{tag}</li>
              ))}
            </ul>
          )}

          <p className="muted">Status</p>
          <div className="row">
            {STATUSES.map((s) => (
              <button
                key={s}
                disabled={saving || s === asset.status}
                onClick={() => mutation.mutate({ version: asset.version, status: s })}
              >
                {statusLabel(s)}
              </button>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}
