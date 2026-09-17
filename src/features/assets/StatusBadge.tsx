import { statusLabel } from '@/lib/format';
import type { AssetStatus } from '@/lib/types';

/**
 * Status shown as a labelled badge whose meaning does NOT depend on colour.
 *
 * The four statuses read as a progression, and each step is distinguishable
 * without colour via a filled-fraction glyph (like a battery/step indicator):
 *   draft      ○  empty         (not started)
 *   in_review  ◑  half          (in progress)
 *   approved   ●  full          (complete)
 *   archived   ⊘  struck        (retired)
 * Colour reinforces but never carries the meaning: the glyph + the text label
 * are always present, so it works for colour-blind users and in greyscale.
 */

const GLYPH: Record<AssetStatus, string> = {
  draft: '○',
  in_review: '◑',
  approved: '●',
  archived: '⊘',
};

const STEP: Record<AssetStatus, number> = {
  draft: 1,
  in_review: 2,
  approved: 3,
  archived: 4,
};

export function StatusBadge({ status }: { status: AssetStatus }) {
  return (
    <span className={`status status--${status}`} data-step={STEP[status]}>
      <span className="status__glyph" aria-hidden="true">
        {GLYPH[status]}
      </span>
      {statusLabel(status)}
    </span>
  );
}
