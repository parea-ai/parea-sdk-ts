import { v4 as uuidv4 } from 'uuid';
import { Completion, Log, TraceLog, UpdateLog } from './types';

/**
 * Generates a unique trace ID for each chain of requests.
 * @returns {string} A unique UUID v4 string.
 */
export function genTraceId(): string {
  return uuidv4();
}

/**
 * Converts a Date object to an ISO 8601 formatted string.
 * @param {Date} date - The date to convert.
 * @returns {string} The date in ISO 8601 format.
 */
export function toDateTimeString(date: Date): string {
  return date.toISOString();
}

/**
 * Creates an async generator that limits concurrent execution of promises.
 * @param {number} concurrency - The maximum number of concurrent executions.
 * @param {Iterable<T>} iterable - The iterable of input items.
 * @param {(item: T) => Promise<R>} iteratorFn - The async function to execute for each item.
 * @returns {AsyncGenerator<R, void, unknown>} An async generator yielding results.
 * @throws {Error} When attempting to consume with no promises executing.
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

export type LogData = Completion & TraceLog & Log;

/**
 * Serializes metadata values in the log data.
 * @param {LogData} logData - The log data to serialize.
 * @returns {LogData} The log data with serialized metadata values.
 */
export function serializeMetadataValues(logData: LogData): LogData {
  if (logData?.metadata) {
    logData.metadata = serializeValues(logData?.metadata);
  }

  // Support openai vision content format
  if (logData?.configuration) {
    logData?.configuration?.messages?.forEach((message) => {
      // noinspection SuspiciousTypeOfGuard
      if (typeof message.content !== 'string') {
        message.content = JSON.stringify(message.content);
      }
    });
  }

  return logData;
}

/**
 * Serializes values in a metadata object.
 * @param {{ [key: string]: any }} metadata - The metadata object to serialize.
 * @returns {{ [key: string]: string }} An object with all values serialized to strings.
 */
export function serializeValues(metadata: { [key: string]: any }): { [key: string]: string } {
  const serialized: { [key: string]: string } = {};
  for (const [key, value] of Object.entries(metadata)) {
    serialized[key] = typeof value === 'string' ? value : JSON.stringify(value);
  }
  return serialized;
}

/**
 * Serializes metadata values in an update log.
 * @param {UpdateLog} logData - The update log data to serialize.
 * @returns {UpdateLog} The update log with serialized metadata values.
 */
export function serializeMetadataValuesUpdate(logData: UpdateLog): UpdateLog {
  if (logData?.field_name_to_value_map?.metadata) {
    logData.field_name_to_value_map.metadata = serializeValues(logData.field_name_to_value_map.metadata);
  }
  return logData;
}
