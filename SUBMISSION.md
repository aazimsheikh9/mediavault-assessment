# Submission

Keep this tight. Bullet points are fine. We read this before we read your code,
and a clear account of your reasoning carries real weight — including where you
chose not to do something.

## Video walkthrough

Paste your Loom (or equivalent) link here. 5–10 minutes.

**Link:**

---

## How to run it

Anything we need to know beyond `npm install && npm run dev`.

## Time spent

Roughly, and how you split it.

---

## Baseline defects found

Read the baseline critically before touching it. Grouped by the axis the brief
scores on (correctness / performance / accessibility). "Planned fix" means it is
scheduled under the task noted; dispositions are updated as tasks land.

### Correctness — async & data

| # | Defect | Where | Disposition |
| --- | --- | --- | --- |
| 1 | `applyBulkStatus` sends every selected id in one request; the API rejects >50 with `400 too_many_ids`, so any selection over 50 fails outright. No chunking, no concurrency control. | `App.tsx` `applyBulkStatus` | Planned fix (Task 3) |
| 2 | No stale-response guarding. A slow response from an earlier query overwrites a newer one (the `tra` race). `useAssets` just `.then`s whatever resolves last into state. | `useAssets.ts` | Planned fix (Task 1) |
| 3 | No request cancellation. In-flight requests are never aborted when the query changes; they resolve and waste rate-limit budget. `client.ts` accepts no `AbortSignal`. | `useAssets.ts`, `client.ts` | Planned fix (Task 1) |
| 4 | Every keystroke fires a request — no debounce/throttle. Typing a 6-char query fires ~6 requests and trips the 80/10s rate limit fast. | `App.tsx` (`onChange={setQ}`) → `useAssets` | Planned fix (Task 1) |
| 5 | No de-duplication of identical concurrent requests. Two components (or StrictMode double-invoke) asking for the same page fire two network calls. | `client.ts`, `useAssets.ts` | Planned fix (Task 1) |
| 6 | Query state is component state, not in the URL. Reload or share loses `q`, status and sort. Cannot restore or link a view. | `App.tsx` | Planned fix (Task 1) |
| 7 | Pagination is never implemented. `limit: 24` is hardcoded, `nextCursor` is read into state but never used, so 12,376 of 12,400 assets are unreachable. Changing a filter also never drops the cursor → would surface `400 stale_cursor`. | `useAssets.ts`, `App.tsx` | Planned fix (Tasks 1 & 2) |
| 8 | Edits do not propagate to the list. `handleSaved` is an empty no-op, so after editing an asset in the panel the grid keeps showing the stale row/status. | `App.tsx` `handleSaved` | Planned fix (Task 3) |
| 9 | Errors are flattened to strings (`throw new Error(\`${status}: ${detail}\`)`). Callers cannot branch retryable (503/429/500) vs terminal (400/409/422) without string-matching the message — the brief explicitly forbids that. | `client.ts` `request` | Planned fix (Task 4) |
| 10 | No retry, no backoff, no `Retry-After` handling anywhere. Transient `503`/`429`/network errors surface straight to the user. | `client.ts` | Planned fix (Task 4) |
| 11 | No handling of `409 version_conflict` on single-asset PATCH beyond showing the raw error. A row changed underneath the user just fails. | `AssetDetail.tsx` `setStatus` | Planned fix (Task 3) |
| 12 | `useEffect` dependency is `JSON.stringify(query)`. Key ordering is stable here but it is a fragile, allocation-heavy dep and re-runs on any query identity change with no cancellation of the previous run. | `useAssets.ts` | Planned fix (Task 1, hook rewritten) |

### Performance

| # | Defect | Where | Disposition |
| --- | --- | --- | --- |
| 13 | Grid renders every row it is handed with no virtualization. At 12,400 rows the DOM node count grows with scroll depth, not viewport. | `AssetGrid.tsx` | Planned fix (Task 2) |
| 14 | Every card re-renders on any selection change. Cards are not memoized and receive the whole `selectedIds` Set, so toggling one selection re-renders all of them. | `AssetGrid.tsx` | Planned fix (Tasks 2 & 3) |
| 15 | Thumbnails ignore `hasThumbnail` and are not lazy. ~4% return `404` and render as broken images; every card requests its thumb immediately, and there is no reserved space → layout shift as they load. | `AssetGrid.tsx`, `AssetDetail.tsx` | Planned fix (Task 2) |

### Accessibility

| # | Defect | Where | Disposition |
| --- | --- | --- | --- |
| 16 | Grid is not keyboard operable. Cards are `<div onClick>` with no role, no `tabindex`, no arrow-key model. Unusable without a mouse. | `AssetGrid.tsx` | Planned fix (Task 5) |
| 17 | Detail panel does no focus management: focus is not moved into it on open, not returned to the triggering card on close, and `Escape` does not close it. | `AssetDetail.tsx` | Planned fix (Task 5) |
| 18 | No live region. Result counts, bulk outcomes and errors are not announced to a screen reader. | `App.tsx` | Planned fix (Task 5) |
| 19 | Weak semantics: the grid has no `role`, selection state is not exposed (`aria-selected`), the card checkbox has no accessible name, and decorative thumbnails use `alt=""` correctly but the whole card click target is unlabelled. | `AssetGrid.tsx` | Planned fix (Task 5) |

### Interface / copy

| # | Defect | Where | Disposition |
| --- | --- | --- | --- |
| 20 | Loading, empty and error are not visually distinguishable. "No results for this filter" and "the request failed" read the same; a raw `429:` string is shown as the error. | `App.tsx`, `AssetGrid.tsx` | Planned fix (Tasks 1, 4 & 6) |
| 21 | Status colour is the only carrier of status, and `draft`/`approved`/etc. do not read as a progression. Fails for colour-blind users. | `styles.css` `.pill--*` | Planned fix (Task 6) |

> Twenty-one candidates against a promised minimum of eight. This will be trimmed
> to the ones actually addressed, with the rest marked knowingly-left or
> out-of-scope, once the later tasks land.

---

## Key decisions

For each significant choice: what you did, what you rejected, and why. Three to
six of these is about right.

**Data fetching and caching**

**Stale response handling**

**Virtualization approach**

**Optimistic updates and rollback**

**Retry and backoff policy**

**State placement and URL sync**

---

## Performance

Fill in real measurements, not estimates. Say which machine and browser.

| Metric | Before | After | How measured |
| --- | --- | --- | --- |
| Rendered DOM nodes at 5,000 rows loaded | | | |
| Cards re-rendered when toggling one selection | | | |
| Longest task during sustained scroll | | | |
| Requests fired while typing a 6-character query | | | |
| Production bundle, gzipped | | | |

What was the actual bottleneck, and how did you find it?

---

## Accessibility

- Keyboard model you implemented, in one paragraph.
- How you tested it, including any screen reader.
- Known gaps.

---

## Interface decisions

Three or four sentences: what you were optimising for, and the decisions that
follow from it. Then briefly:

- **Visual system.** Your colour, spacing and type decisions, and where they live.
- **Status treatment.** How the four statuses read as a progression, and how they
  stay distinguishable without relying on colour.
- **States.** What you did with loading, empty, error, offline and partial
  failure.
- **Contrast.** What you checked against, and with what.
- **Copy.** Any user-facing message you rewrote and why.

Screenshots in the repo are welcome — link them here.

---

## Trade-offs and cuts

What you deliberately did not do, and what you would do with another day.

## Critique of the API

What you would change about the backend contract, and what it forced you to do in
the client that you would rather not have.

## Anything you would like us to look at

Code you are proud of, or a decision you are unsure about and want to discuss.
