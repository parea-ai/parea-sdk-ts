import { v4 as uuidv4 } from 'uuid';
import { CompletionResponse, TraceLog } from '../types';
import { pareaLogger } from '../parea_logger';

const traceData: { [key: string]: TraceLog } = {};
export const traceContext: string[] = [];

export const getCurrentTraceId = (): string => {
  return traceContext[traceContext.length - 1];
};

const merge = (old: any, newValue: any) => {
  if (typeof old === 'object' && typeof newValue === 'object') {
    return { ...old, ...newValue };
  }
  if (Array.isArray(old) && Array.isArray(newValue)) {
    return [...old, ...newValue];
  }
  return newValue;
};

export const traceInsert = (traceId: string, data: { [key: string]: any }) => {
  const currentTraceData = traceData[traceId];

  for (const key in data) {
    const newValue = data[key];
    const existingValue = currentTraceData[key as keyof TraceLog];
    // @ts-ignore
    currentTraceData[key] = existingValue ? merge(existingValue, newValue) : newValue;
  }
};

export const trace = (
  funcName: string,
  func: (...args: any[]) => any,
  name?: string,
  tags?: string[],
  metadata?: any,
  target?: string,
  endUserIdentifier?: string,
) => {
  return async (...args: any[]) => {
    const traceId = uuidv4();
    const startTimestamp = new Date().toISOString();

    traceData[traceId] = {
      trace_name: name || funcName,
      trace_id: traceId,
      start_timestamp: startTimestamp,
      // TODO: figure out how to extract the function signature
      inputs: { args: JSON.stringify(args) || '' },
      metadata,
      tags,
      target,
      end_user_identifier: endUserIdentifier,
      children: [],
    };

    traceContext.push(traceId);

    if (traceContext.length > 1) {
      const parentTraceId = traceContext[traceContext.length - 2];
      traceData[parentTraceId].children.push(traceId);
    }

    try {
      const result = await func(args);
      const output = (result as CompletionResponse) ? JSON.stringify(result) : result;
      traceInsert(traceId, { output });
      return result;
    } catch (error: any) {
      console.error(`Error occurred in function ${func.name}, ${error}`);
      traceInsert(traceId, { error: error.toString(), status: 'error' });
      throw error;
    } finally {
      const endTimestamp = new Date().toISOString();
      traceInsert(traceId, { endTimestamp });
      await pareaLogger.recordLog(traceData[traceId]); // log the trace data
      traceContext.pop();
    }
  };
};
