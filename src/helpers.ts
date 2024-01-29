import { v4 as uuidv4 } from 'uuid';
import moment from 'moment-timezone';

export function genTraceId(): string {
  // Generate a unique trace id for each chain of requests
  return uuidv4();
}

export function toDateTimeString(date: Date): string {
  return moment(date).format('YYYY-MM-DD HH:mm:ss z');
}

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
