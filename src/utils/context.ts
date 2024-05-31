import { AsyncLocalStorage } from 'node:async_hooks';
import { ContextObject, TraceLog } from '../types';
import { merge } from './helpers';

export const asyncLocalStorage = new AsyncLocalStorage<Map<string, ContextObject>>();
export const executionOrderCounters = new Map<string, number>();
export const rootTraces = new Map<string, TraceLog>(); // for DatasetLevelEvalFuncs

/**
 * Get the current trace id.
 * @returns The current trace id.
 */
export const getCurrentTraceId = (): string | undefined => {
  const store = asyncLocalStorage.getStore();

  if (!store) {
    return undefined;
  }

  const traceIds = Array.from(store.keys());

  return traceIds[traceIds.length - 1];
};

/**
 * Insert data into the trace log for the current or specified trace id. Data should be a dictionary with keys that correspond to the fields of the TraceLog model.
 * If the field already has an existing value that is extensible (dict, set, list, etc.), the new value will be merged with the existing value.
 *
 * @param data - Keys can be one of: trace_name, end_user_identifier, metadata, tags, deployment_id, images, session_id
 * @param traceId - The trace id to insert the data into. If not provided, the current trace id will be used.
 * @returns void
 */
export const traceInsert = (data: { [key: string]: any }, traceId?: string) => {
  const store = asyncLocalStorage.getStore();
  if (!store) {
    console.warn('No active store found for traceInsert.');
    return;
  }

  let currentTraceData;
  if (!traceId) {
    traceId = getCurrentTraceId() as string;
    currentTraceData = store.get(traceId);
  } else {
    currentTraceData = store.get(traceId);
  }
  if (!currentTraceData) {
    console.warn(`No trace data found for traceId ${traceId}.`);
    return;
  }

  for (const key in data) {
    const newValue = data[key];
    const existingValue = currentTraceData.traceLog[key as keyof TraceLog];
    // @ts-ignore
    currentTraceData.traceLog[key] = existingValue ? merge(existingValue, newValue) : newValue;
  }

  store.set(traceId, currentTraceData);
};
