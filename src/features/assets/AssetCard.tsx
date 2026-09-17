import { memo } from 'react';
import { thumbnailUrl } from '@/api/client';
import { formatBytes, formatDate, statusLabel } from '@/lib/format';
import type { Asset } from '@/lib/types';

interface Props {
  asset: Asset;
  index: number;
  selected: boolean;
  active: boolean;
  onToggleSelect: (id: string, index: number, shiftKey: boolean) => void;
  onOpen: (id: string) => void;
}

/**
 * A single grid card, memoised.
 *
 * It receives primitive `selected`/`active` booleans rather than the whole
 * `selectedIds` Set, and the callbacks are stable (useCallback in App). So
 * toggling selection on one card changes props for that card only — the other
 * cards' props are referentially identical and `memo` skips them. That is what
 * satisfies the "must not re-render the other cards" budget (defect #14).
 */
function AssetCardImpl({ asset, index, selected, active, onToggleSelect, onOpen }: Props) {
  return (
    <div
      className={
        'card' + (selected ? ' card--selected' : '') + (active ? ' card--active' : '')
      }
      onClick={(e) => {
        // Shift-click anywhere on the card extends the selection range.
        if (e.shiftKey) {
          e.preventDefault();
          onToggleSelect(asset.id, index, true);
        } else {
          onOpen(asset.id);
        }
      }}
    >
      {asset.hasThumbnail ? (
        <img className="card__thumb" src={thumbnailUrl(asset.id)} alt="" loading="lazy" />
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
        checked={selected}
        aria-label={`Select ${asset.name}`}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) =>
          onToggleSelect(asset.id, index, (e.nativeEvent as MouseEvent).shiftKey)
        }
      />
    </div>
  );
}

export const AssetCard = memo(AssetCardImpl);
