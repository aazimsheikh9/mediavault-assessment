import { statusLabel } from '@/lib/format';
import type { BulkReport } from './useBulkStatus';

interface Props {
  report: BulkReport;
  busy: boolean;
  onRetryFailed: () => void;
  onUndo: () => void;
  onDismiss: () => void;
}

/**
 * Outcome of a bulk action. Tells the user exactly what changed, what did not,
 * and why — with the two failure reasons treated differently:
 *   - permanent (legal hold, missing): stated plainly, no retry offered
 *   - retryable (write conflicts): a "Retry failed" action for just that subset
 * Successful changes can be undone.
 */
export function BulkResultBar({ report, busy, onRetryFailed, onUndo, onDismiss }: Props) {
  const applied = report.appliedIds.length;
  const permanent = report.failures.filter((f) => f.permanent);
  const retryable = report.failures.filter((f) => !f.permanent);

  return (
    <div className="resultbar" role="status">
      <div className="resultbar__summary">
        <strong>
          {applied} moved to {statusLabel(report.status).toLowerCase()}
        </strong>
        {report.failures.length > 0 && (
          <span className="resultbar__failed">
            {' · '}
            {report.failures.length} didn’t change
          </span>
        )}
      </div>

      {retryable.length > 0 && (
        <p className="muted resultbar__detail">
          {retryable.length} hit a temporary conflict.
        </p>
      )}
      {permanent.length > 0 && (
        <p className="muted resultbar__detail">
          {permanent.length} on legal hold or missing — these can’t be changed.
        </p>
      )}

      <div className="resultbar__actions">
        {retryable.length > 0 && (
          <button className="btn-primary" onClick={onRetryFailed} disabled={busy}>
            Retry {retryable.length} failed
          </button>
        )}
        {applied > 0 && (
          <button onClick={onUndo} disabled={busy}>
            Undo
          </button>
        )}
        <button onClick={onDismiss} disabled={busy}>
          Dismiss
        </button>
      </div>
    </div>
  );
}
