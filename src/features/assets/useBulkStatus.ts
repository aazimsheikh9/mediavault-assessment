import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { bulkSetStatus } from '@/api/client';
import type { Asset, AssetStatus } from '@/lib/types';
import { withRetry } from '@/api/retry';
import { chunk, runWithConcurrency } from '@/lib/runChunked';
import { replaceAsset, restoreStatuses, setStatusInLists, snapshotStatuses } from './assetCache';

const CHUNK_SIZE = 50; // hard API cap
const CONCURRENCY = 3; // chunks in flight at once; keeps well under the rate limit

/** One asset that did not change, with the reason and whether retrying can help. */
export interface BulkFailure {
  id: string;
  code: string;
  message: string;
  /** legal_hold can never succeed on retry; conflict/others can. */
  permanent: boolean;
}

export interface BulkReport {
  status: AssetStatus;
  appliedIds: string[];
  failures: BulkFailure[];
  /** The subset of failures worth retrying (not permanent). */
  retryableIds: string[];
  /** Statuses before the change, for undo. */
  previous: Map<string, AssetStatus>;
}

function isPermanent(code: string): boolean {
  // Deterministic per the API: legal-hold never succeeds. not_found is also
  // pointless to retry. Everything else (conflict) is transient.
  return code === 'legal_hold' || code === 'not_found';
}

/**
 * Optimistic bulk status change with partial-failure handling.
 *
 * Flow:
 *   1. Snapshot current statuses (for rollback/undo) and optimistically set the
 *      new status on every selected asset in the cache — the grid updates now.
 *   2. Chunk ids to 50 and run chunks with bounded concurrency.
 *   3. Aggregate the per-id results from each 207/200 body.
 *   4. Roll back ONLY the failures to their prior status; successes stay.
 *   5. Return a report the UI turns into "N updated, these failed and why",
 *      with a retryable subset (conflicts) separated from permanent ones
 *      (legal_hold).
 *
 * A whole chunk can also hard-fail (network/429 after retries). Those ids are
 * treated as retryable failures so the user can try them again.
 */
export function useBulkStatus() {
  const qc = useQueryClient();
  const [pending, setPending] = useState(false);

  const run = useCallback(
    async (idsInput: string[], status: AssetStatus): Promise<BulkReport> => {
      const ids = [...new Set(idsInput)];
      const previous = snapshotStatuses(qc, ids);

      // 1. optimistic
      setStatusInLists(qc, new Set(ids), status);
      setPending(true);

      const appliedIds: string[] = [];
      const failures: BulkFailure[] = [];

      try {
        const chunks = chunk(ids, CHUNK_SIZE);
        const chunkResults = await runWithConcurrency(chunks, CONCURRENCY, async (part) => {
          try {
            // Transient chunk failures (503/429/network) retry with backoff+jitter
            // before we give up and mark the whole chunk as a retryable failure.
            const res = await withRetry(() => bulkSetStatus(part, status));
            return { part, res, error: null as unknown };
          } catch (error) {
            return { part, res: null, error };
          }
        });

        for (const { part, res, error } of chunkResults) {
          if (error || !res) {
            // Whole chunk failed after the client's retries — retryable.
            for (const id of part) {
              failures.push({
                id,
                code: 'chunk_failed',
                message: 'The request did not complete.',
                permanent: false,
              });
            }
            continue;
          }
          for (const r of res.results) {
            if (r.ok) {
              appliedIds.push(r.id);
              // Trust the server's returned asset (has bumped version/updatedAt).
              replaceAsset(qc, r.asset as Asset);
            } else {
              failures.push({
                id: r.id,
                code: r.code,
                message: r.message ?? 'Could not be updated.',
                permanent: isPermanent(r.code),
              });
            }
          }
        }

        // 4. roll back only the failures
        if (failures.length > 0) {
          const failedPrev = new Map<string, AssetStatus>();
          for (const f of failures) {
            const was = previous.get(f.id);
            if (was !== undefined) failedPrev.set(f.id, was);
          }
          restoreStatuses(qc, failedPrev);
        }
      } finally {
        setPending(false);
      }

      return {
        status,
        appliedIds,
        failures,
        retryableIds: failures.filter((f) => !f.permanent).map((f) => f.id),
        previous,
      };
    },
    [qc],
  );

  /** Undo a completed change: restore every id we touched to its prior status. */
  const undo = useCallback(
    (report: BulkReport) => {
      // Only successes actually changed; restore those to their previous value.
      const toRestore = new Map<string, AssetStatus>();
      for (const id of report.appliedIds) {
        const was = report.previous.get(id);
        if (was !== undefined) toRestore.set(id, was);
      }
      restoreStatuses(qc, toRestore);
      // Best-effort: also tell the server. Fire and forget; the cache is source
      // of truth for the immediate UI, and a failed undo re-broadcasts via SSE.
      const byStatus = new Map<AssetStatus, string[]>();
      for (const [id, s] of toRestore) {
        const list = byStatus.get(s) ?? [];
        list.push(id);
        byStatus.set(s, list);
      }
      for (const [s, list] of byStatus) {
        for (const part of chunk(list, CHUNK_SIZE)) void bulkSetStatus(part, s).catch(() => {});
      }
    },
    [qc],
  );

  return { run, undo, pending };
}
