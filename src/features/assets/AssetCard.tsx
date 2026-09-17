import { memo } from 'react';
import { thumbnailUrl } from '@/api/client';
import { formatBytes, formatDate, statusLabel } from '@/lib/format';
import type { Asset } from '@/lib/types';
import { StatusBadge } from './StatusBadge';

interface Props {
  asset: Asset;
  index: number;
  selected: boolean;
  active: boolean;
  /** Roving tabindex: only the focused card is tabbable (tabIndex 0). */
  tabbable: boolean;
  onToggleSelect: (id: string, index: number, shiftKey: boolean) => void;
  onOpen: (id: string) => void;
  /** Keyboard navigation is owned by the grid; the card forwards its keydown. */
  onKeyDown: (e: React.KeyboardEvent, index: number) => void;
  /** Report focus so the grid can keep the roving index in sync. */
  onFocus: (index: number) => void;
}

/**
 * A single grid card, memoised.
 *
 * Accessibility:
 *   - role="gridcell" inside the grid's role="grid"
 *   - roving tabindex: exactly one card is tabbable; arrows move focus
 *   - aria-selected reflects selection state
 *   - the thumbnail is decorative (alt="" / aria-hidden), the name carries the
 *     accessible label, the checkbox has its own name
 *
 * It receives primitive props (`selected`/`active`/`tabbable`) and stable
 * callbacks, so toggling one card's state re-renders only that card (defect #14).
 */
function AssetCardImpl({
  asset,
  index,
  selected,
  active,
  tabbable,
  onToggleSelect,
  onOpen,
  onKeyDown,
  onFocus,
}: Props) {
  return (
    <div
      role="gridcell"
      aria-selected={selected}
      aria-label={`${asset.name}, ${statusLabel(asset.status)}`}
      tabIndex={tabbable ? 0 : -1}
      data-card-index={index}
      className={
        'card' + (selected ? ' card--selected' : '') + (active ? ' card--active' : '')
      }
      onClick={(e) => {
        if (e.shiftKey) {
          e.preventDefault();
          onToggleSelect(asset.id, index, true);
        } else {
          onOpen(asset.id);
        }
      }}
      onKeyDown={(e) => onKeyDown(e, index)}
      onFocus={() => onFocus(index)}
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
        <p className="muted card__meta">
          {asset.kind} · {formatBytes(asset.sizeBytes)} · {formatDate(asset.updatedAt)}
        </p>
        <StatusBadge status={asset.status} />
      </div>
      <input
        type="checkbox"
        className="card__check"
        checked={selected}
        tabIndex={-1}
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
