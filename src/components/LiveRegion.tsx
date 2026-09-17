interface Props {
  message: string;
}

/**
 * Polite live region for status announcements (result counts, bulk outcomes,
 * errors). One shared region, updated with a debounced/summarised message from
 * the app so a screen reader is not spammed on every keystroke. Visually hidden
 * but present in the accessibility tree.
 */
export function LiveRegion({ message }: Props) {
  return (
    <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
      {message}
    </div>
  );
}
