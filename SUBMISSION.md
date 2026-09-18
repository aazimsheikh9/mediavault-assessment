# Submission

Keep this tight. Bullet points are fine. We read this before we read your code,
and a clear account of your reasoning carries real weight — including where you
chose not to do something.

## Video walkthrough

Paste your Loom (or equivalent) link here. 5–10 minutes.

**Link:** _(to be added)_

---

## How to run it

Nothing beyond the standard flow:

```bash
npm install
npm run dev      # app on :5173, mock API on :8787, chaos + latency ON
```

Verified from a fresh clone with chaos on. Node 20.11+ (developed on Node 22).
No environment variables or extra services needed. `npm run build` and
`npm run typecheck` both pass clean.

Nothing in `server/` or `API.md` was changed.

**Deployed link:** _(Render URL — to be added once the service is live)_

The mock API in `server/` is a stateful in-memory Node server (12,400 assets,
chaos, rate limiting, SSE), so it cannot run as a stateless serverless function.
Rather than modify it, the deploy runs it unchanged on an internal port behind a
thin front server (`server-prod.mjs`, outside `server/`) that serves the built
SPA and proxies `/api` to it — one persistent process on Render. Chaos and latency
stay **on**, so the deployed app behaves the way it will be graded. Locally,
`npm run dev` is unchanged.

## Time spent

Roughly 12 hours, split about: 1h reading the brief/API and writing the defect
inventory; 3h on search correctness and the data layer; 2.5h on virtualization;
2h on bulk actions and partial-failure handling; 1.5h on resilience; 1.5h on
keyboard/screen-reader; and the remainder on the visual system and this writeup.
Built task by task with a commit per task (history is intentionally not squashed).

---

## Baseline defects found

Read the baseline critically before touching it. Grouped by the axis the brief
scores on (correctness / performance / accessibility). All 21 were **fixed** —
the task that fixed each is noted in the disposition.

### Correctness — async & data

| # | Defect | Where | Disposition |
| --- | --- | --- | --- |
| 1 | `applyBulkStatus` sends every selected id in one request; the API rejects >50 with `400 too_many_ids`, so any selection over 50 fails outright. No chunking, no concurrency control. | `App.tsx` `applyBulkStatus` | Fixed (Task 3) |
| 2 | No stale-response guarding. A slow response from an earlier query overwrites a newer one (the `tra` race). `useAssets` just `.then`s whatever resolves last into state. | `useAssets.ts` | Fixed (Task 1) |
| 3 | No request cancellation. In-flight requests are never aborted when the query changes; they resolve and waste rate-limit budget. `client.ts` accepts no `AbortSignal`. | `useAssets.ts`, `client.ts` | Fixed (Task 1) |
| 4 | Every keystroke fires a request — no debounce/throttle. Typing a 6-char query fires ~6 requests and trips the 80/10s rate limit fast. | `App.tsx` (`onChange={setQ}`) → `useAssets` | Fixed (Task 1) |
| 5 | No de-duplication of identical concurrent requests. Two components (or StrictMode double-invoke) asking for the same page fire two network calls. | `client.ts`, `useAssets.ts` | Fixed (Task 1) |
| 6 | Query state is component state, not in the URL. Reload or share loses `q`, status and sort. Cannot restore or link a view. | `App.tsx` | Fixed (Task 1) |
| 7 | Pagination is never implemented. `limit: 24` is hardcoded, `nextCursor` is read into state but never used, so 12,376 of 12,400 assets are unreachable. Changing a filter also never drops the cursor → would surface `400 stale_cursor`. | `useAssets.ts`, `App.tsx` | Fixed (Tasks 1 & 2) |
| 8 | Edits do not propagate to the list. `handleSaved` is an empty no-op, so after editing an asset in the panel the grid keeps showing the stale row/status. | `App.tsx` `handleSaved` | Fixed (Task 3) |
| 9 | Errors are flattened to strings (`throw new Error(\`${status}: ${detail}\`)`). Callers cannot branch retryable (503/429/500) vs terminal (400/409/422) without string-matching the message — the brief explicitly forbids that. | `client.ts` `request` | Fixed (Task 4) |
| 10 | No retry, no backoff, no `Retry-After` handling anywhere. Transient `503`/`429`/network errors surface straight to the user. | `client.ts` | Fixed (Task 4) |
| 11 | No handling of `409 version_conflict` on single-asset PATCH beyond showing the raw error. A row changed underneath the user just fails. | `AssetDetail.tsx` `setStatus` | Fixed (Task 3) |
| 12 | `useEffect` dependency is `JSON.stringify(query)`. Key ordering is stable here but it is a fragile, allocation-heavy dep and re-runs on any query identity change with no cancellation of the previous run. | `useAssets.ts` | Fixed (Task 1, hook rewritten) |

### Performance

| # | Defect | Where | Disposition |
| --- | --- | --- | --- |
| 13 | Grid renders every row it is handed with no virtualization. At 12,400 rows the DOM node count grows with scroll depth, not viewport. | `AssetGrid.tsx` | Fixed (Task 2) |
| 14 | Every card re-renders on any selection change. Cards are not memoized and receive the whole `selectedIds` Set, so toggling one selection re-renders all of them. | `AssetGrid.tsx` | Fixed (Tasks 2 & 3) |
| 15 | Thumbnails ignore `hasThumbnail` and are not lazy. ~4% return `404` and render as broken images; every card requests its thumb immediately, and there is no reserved space → layout shift as they load. | `AssetGrid.tsx`, `AssetDetail.tsx` | Fixed (Task 2) |

### Accessibility

| # | Defect | Where | Disposition |
| --- | --- | --- | --- |
| 16 | Grid is not keyboard operable. Cards are `<div onClick>` with no role, no `tabindex`, no arrow-key model. Unusable without a mouse. | `AssetGrid.tsx` | Fixed (Task 5) |
| 17 | Detail panel does no focus management: focus is not moved into it on open, not returned to the triggering card on close, and `Escape` does not close it. | `AssetDetail.tsx` | Fixed (Task 5) |
| 18 | No live region. Result counts, bulk outcomes and errors are not announced to a screen reader. | `App.tsx` | Fixed (Task 5) |
| 19 | Weak semantics: the grid has no `role`, selection state is not exposed (`aria-selected`), the card checkbox has no accessible name, and decorative thumbnails use `alt=""` correctly but the whole card click target is unlabelled. | `AssetGrid.tsx` | Fixed (Task 5) |

### Interface / copy

| # | Defect | Where | Disposition |
| --- | --- | --- | --- |
| 20 | Loading, empty and error are not visually distinguishable. "No results for this filter" and "the request failed" read the same; a raw `429:` string is shown as the error. | `App.tsx`, `AssetGrid.tsx` | Fixed (Tasks 1, 4 & 6) |
| 21 | Status colour is the only carrier of status, and `draft`/`approved`/etc. do not read as a progression. Fails for colour-blind users. | `styles.css` `.pill--*` | Fixed (Task 6) |

> Twenty-one found against a promised minimum of eight; all fixed. Nothing was
> knowingly left or ruled out of scope at the defect level — the deliberate cuts
> are feature-level and listed under **Trade-offs and cuts** below.

---

## Key decisions

For each significant choice: what you did, what you rejected, and why. Three to
six of these is about right.

**Data fetching and caching.** Chose **TanStack Query** over hand-rolling the
cache. It gives cancellation (via the `AbortSignal` it passes to `fetch`),
request de-duplication, caching, and `useInfiniteQuery` for cursor pagination —
all the things the brief tests — for about 14 kB gzipped. I rejected a fully
hand-rolled fetch layer: it is a valid answer, but re-implementing a solved
problem would spend effort I would rather put into the parts that are genuinely
mine (the error taxonomy, the retry policy, the virtualizer). What I did keep
hand-written is the HTTP client underneath (`src/api/client.ts`) so I own the
error handling and cancellation semantics, not the library.

**Stale response handling.** The core defence is **structural, not a guard flag**:
the list query key (`src/features/assets/queryKeys.ts`) includes every field that
changes the result set. A slow response for query `tra` is written into the cache
entry for `tra`, which is no longer the active key, so it can never overwrite the
results for the current query. Cancellation (aborting the superseded request) is
a bonus on top, not the mechanism. The same key design means changing a filter
starts a fresh query with no cursor, so a cursor is never reused across queries
and `400 stale_cursor` cannot reach the user.

**Virtualization approach.** Hand-rolled a **row-based virtualizer**
(`useGridVirtualizer.ts`) rather than pulling a library. The grid is a responsive
`repeat(auto-fill, minmax(220px, 1fr))`, so I measure the container, derive the
column count myself, and virtualize by row (a row = N cards). Only the rows in
the viewport plus a small overscan are rendered, inside a full-height spacer that
reserves scroll space so paging causes no layout shift. Rejected react-window /
virtua: they assume a known column count and would need wrapping to fit the
responsive grid anyway, and this is the single most "show me you can do it" piece
of the brief — worth owning. Added ~0.6 kB.

**Optimistic updates and rollback.** Bulk status writes to the cache immediately,
then reconciles against the per-id `207` result array. Successes are replaced with
the server's version-bumped asset; **only the failures roll back** to their
snapshotted prior status. Failures are split by cause: `legal_hold`/`not_found`
are permanent (no retry offered), everything else (`conflict`) is retryable and
gets a "Retry failed" action for just that subset. The whole thing is undoable.
Selection lives outside the cache so a 500-item selection does not re-render cards.

**Retry and backoff policy.** One shared policy on the QueryClient
(`src/api/retry.ts`): retry only transient failures, decided **by status/code, not
message text** (`isRetryable` in `errors.ts`), capped at 3 attempts, with
exponential backoff (`base·2ⁿ`) and **full jitter** (`random·delay`) so clients
that failed together do not re-collide. `Retry-After` from the server is honoured
as a floor. `withRetry()` applies the identical policy to the bulk chunk calls
that run outside TanStack. 400/409/422 are never retried because `isRetryable` is
false for them structurally.

**State placement and URL sync.** Query state (`q`, status, kind, sort) lives in
the **URL** via a small hand-rolled History hook (`useUrlState.ts`) — reload or
share restores the exact view. Search typing is written with `replaceState` so a
burst of keystrokes does not create one history entry per character; discrete
filter/sort changes use `pushState` so Back works as expected. Selection and the
open panel are ephemeral UI state and stay in React. Chose not to add a router:
for a single screen it would be more to explain than it earns.

---

## Performance

Measured on Windows 11, Google Chrome, in a dev build.

| Metric | Before | After | How measured |
| --- | --- | --- | --- |
| Rendered DOM nodes at 5,000 rows loaded | ~5,000 cards | **~54 cards** | `document.querySelectorAll('.card').length` after scrolling until ~5,000 shown — flat regardless of scroll depth |
| Cards re-rendered when toggling one selection | all rendered cards | **1** | `console.count` in `AssetCard`: clearing the console then toggling one checkbox logged 2 lines, i.e. 1 real render doubled by StrictMode in dev. The other ~53 visible cards did not re-render |
| Longest task during sustained scroll | — | **< 50 ms** | A `PerformanceObserver({ entryTypes: ['longtask'] })` logged nothing during ~5 s of hard scrolling; the Long Task API only fires above 50 ms, so no task crossed the threshold |
| Requests fired while typing a 6-character query | 6 | **~1** | 250 ms debounce collapses a typing burst; counted in the Network tab typing a 6-char word at normal speed |
| Production bundle, gzipped | 48 kB | **66 kB** | `npm run build` gzip column (JS 66.3 kB + CSS 2.3 kB) |
| Cumulative Layout Shift while paging | — | **0.01** | DevTools Performance panel (CLS readout) over a scroll session — the reserved-height spacer keeps paging shift-free |

The bundle grew from 48 → 66 kB. The jump is almost entirely **TanStack Query
(~14 kB)**; the hand-rolled virtualizer added ~0.6 kB and the rest is app code.
That is a deliberate trade: the library buys cancellation, de-duplication,
caching and infinite-query pagination that would otherwise be hand-written and
harder to get right. Given the app ships a 12,400-row workspace, correctness of
the async layer is worth 14 kB.

**The actual bottleneck** was never raw render speed — it was the async layer:
out-of-order responses, un-cancelled requests, and re-rendering every card on
selection. I found the render issue with the Profiler (toggling one selection lit
up the whole grid in the baseline) and the async issues by reproducing the `tra`
race and watching the Network tab show cancelled vs landed requests. The DOM-node
count is what proves the virtualization: flat at ~54 regardless of scroll depth.

---

## Accessibility

**Keyboard model.** The grid uses a **roving tabindex** — exactly one card is
tabbable at a time, so the grid is a single tab stop rather than 12,400. Arrow
keys move a focused index (Left/Right by one, Up/Down by a full row), Home/End
jump to the first/last loaded card, Enter opens the detail panel, Space toggles
selection, and Shift+Arrow moves focus while extending the selection range. Because
the grid is virtualized, moving focus to an off-screen card scrolls it into view
first, then a layout effect moves real DOM focus onto it once it renders. Opening
the panel moves focus into it (`role="dialog"`), Escape closes it, and focus
returns to the card that opened it (guarded so it is never handed to a detached
node after virtualization). Selection state is exposed via `aria-selected`, the
grid/cards use `role="grid"`/`gridcell` with `aria-rowcount`, checkboxes have
names, and thumbnails are decorative (`alt=""`/`aria-hidden`). Result counts and
bulk outcomes are announced through one polite, debounced live region.

**How I tested it.** By keyboard, exhaustively — every interaction above was
driven from the keyboard only. I verified roles, `aria-selected`, names and the
live region in the accessibility tree via DevTools, and checked visible focus and
`prefers-reduced-motion`. **I did not run a screen reader** (NVDA/VoiceOver), so I
am not claiming a verified SR pass — the semantics are correct in the tree but
unverified aurally.

**Known gaps.** No screen-reader run (above). If the card that opened the panel
has been virtualized out by the time the panel closes, focus falls back to the
document body rather than the nearest card. The live region announces counts and
bulk outcomes but not every incremental "loading more" page.

---

## Interface decisions

I was optimising for a reviewer scanning hundreds of cards quickly and needing to
read status and selection at a glance, without eye strain over a full day. That
pushed me toward a calm neutral surface, one accent used sparingly for selection
and primary actions, and status shown redundantly (shape + text) so scanning
never depends on colour. Restraint over decoration throughout — no illustration,
motion or logo.

- **Visual system.** A small token set at the top of `src/styles.css`: one neutral
  ramp, one accent (`#2352c9`), semantic status hues, and spacing/radius/type
  scales. Every component rule reads from these tokens — no one-off values.
- **Status treatment.** The four statuses read as a progression via a
  filled-fraction glyph — draft `○` (empty), in review `◑` (half), approved `●`
  (full), archived `⊘` (struck) — always paired with the text label. Colour
  reinforces but never carries the meaning, so it works in greyscale and for
  colour-blind users. Archived is also struck through.
- **States.** Loading, empty, error, offline and partial-failure are each
  designed and distinct: loading and "no results" never look alike; errors are
  their own treatment; the offline banner and the bulk result bar each say what
  to do next. Missing thumbnails get a striped placeholder rather than a broken
  image or layout shift.
- **Contrast.** Checked against WCAG AA with the WebAIM formula: body text
  (`#1f2329` on white) ≈ 14.5:1, secondary text (`#5b6069`) ≈ 6:1, accent and
  status text chosen to clear 4.5:1. All pass AA (body passes AAA).
- **Copy.** Rewrote the leaked API strings into human messages: `429: Too many
  requests…` became "Too much happening at once. Pausing for a moment, then
  retrying."; the 409 became "This asset was changed by someone else…"; bulk
  actions read "Move to approved" and outcomes say exactly how many changed and
  why the rest did not.

Screenshots: _(optional — drop PNGs in the repo and link here)._

---

## Trade-offs and cuts

Deliberately not done, all of them defensible for a 12-hour budget:

- **Offline write queueing.** The brief marks this a bonus. If you go offline
  mid-edit the write fails and can be retried on reconnect; I do not queue and
  replay writes. It adds real complexity (a durable queue, conflict handling on
  replay) for a bonus, and I would rather the required paths be solid.
- **Live updates via `GET /api/events` (SSE).** Optional. The server broadcasts
  `asset.updated`; I do not consume the stream, so another client's change is not
  reflected until the next fetch/invalidate. With another day I would reconcile it
  into the cache by id, skipping ids with a pending local mutation so it never
  clobbers an optimistic edit or jumps scroll.
- **The slow `/api/stats` header.** Not built. If added, I would load it in a
  non-blocking query so its >1s latency never gates the grid.
- **Tests.** None written (optional). If I did, I would target the concurrency and
  rollback logic — chunking, bounded concurrency, partial-failure reconciliation —
  not markup snapshots.
- **Tag/owner/collection filters.** The API supports them; the UI exposes status
  and kind. The query layer already handles the rest, so wiring more controls is
  additive, not structural.

With another day: a screen-reader pass, the SSE reconciliation, and tests around
the bulk rollback.

## Critique of the API

- **Errors are well-shaped** (`{ error: { code, message } }` with a stable `code`),
  which made a structural retry decision easy. Good.
- **Cursors bound to a query fingerprint** is reasonable, but the client has to
  know to drop the cursor on any filter change or eat a `400 stale_cursor`. A
  cursor that self-described its query, or a server that ignored a stale cursor
  and restarted the page, would remove a whole class of client bug.
- **The two bulk caps (50) and batch cap (25) differ**, so chunk sizes are
  endpoint-specific — easy to get wrong. One consistent cap would be simpler.
- **Bulk status takes no version**, so bulk edits cannot detect a conflict the way
  single edits do (`409`); the `conflict` code in the 207 array is the only signal
  and it is random rather than version-based. Version-aware bulk would let the
  client reconcile properly instead of just retrying.
- **`Retry-After` is present on 429/503** — good; I honour it as a backoff floor.
- Rewriting the leaked messages (`429: Too many requests…`) was forced onto the
  client. A separate machine `code` (which exists) plus a human `message` already
  makes this easy — I just branch on the code.

## Anything you would like us to look at

- `src/features/assets/useGridVirtualizer.ts` and how it composes with the roving
  tabindex in `AssetGrid.tsx` — keeping keyboard focus correct while most rows are
  not in the DOM was the most interesting part.
- `src/features/assets/useBulkStatus.ts` — the optimistic-apply → chunked send →
  reconcile-207 → roll-back-only-failures flow, and the permanent-vs-retryable
  split.
- The **409 policy** in `AssetDetail.tsx` (refetch latest, roll back, keep the
  panel open, tell the user) — there are other defensible choices here and I would
  be happy to discuss the trade-off against auto-retrying or force-writing.
