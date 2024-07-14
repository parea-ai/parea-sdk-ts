/**
 * Runs async tasks with limited concurrency.
 * @param concurrency The maximum number of tasks to run concurrently.
 * @param iterable The iterable of items to process.
 * @param iteratorFn The async function to run for each item.
 * @yields The results of each task as they complete.
 */
export async function* asyncPool<T, R>(
  concurrency: number,
  iterable: Iterable<T>,
  iteratorFn: (item: T) => Promise<R>,
): AsyncGenerator<R, void, unknown> {
  const executing = new Set<Promise<R>>();

  async function consume(): Promise<R> {
    if (executing.size === 0) {
      throw new Error('Attempted to consume with no promises executing.');
    }
    const finishedPromise = Promise.race(executing);
    executing.delete(finishedPromise);
    return finishedPromise;
  }

  for (const item of iterable) {
    while (executing.size >= concurrency) {
      yield await consume();
    }

    const taskPromise = iteratorFn(item).then(
      (result: R) => {
        executing.delete(taskPromise);
        return result;
      },
      (error: any) => {
        executing.delete(taskPromise);
        throw error;
      },
    );

    executing.add(taskPromise);
  }

  while (executing.size > 0) {
    yield await consume();
  }
}
