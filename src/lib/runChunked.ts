/** Split an array into chunks of at most `size`. */
export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Run async work over a list with bounded concurrency.
 *
 * A reviewer selecting 500 assets produces 10 chunks of 50. Firing all 10 at
 * once would blow the 80-request/10s rate limit (and each chunk may itself
 * retry). We instead keep at most `concurrency` chunks in flight, pulling the
 * next only as one finishes. Results are returned in input order.
 */
export async function runWithConcurrency<In, Out>(
  inputs: In[],
  concurrency: number,
  worker: (input: In, index: number) => Promise<Out>,
): Promise<Out[]> {
  const results = new Array<Out>(inputs.length);
  let next = 0;

  async function pump(): Promise<void> {
    while (next < inputs.length) {
      const current = next++;
      results[current] = await worker(inputs[current]!, current);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, inputs.length) }, pump);
  await Promise.all(workers);
  return results;
}
