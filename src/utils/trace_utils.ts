import { TraceLog, TraceOptions } from '../types';
import { pareaLogger } from '../parea_logger';
import { genTraceId, toDateTimeString } from '../helpers';

export const traceData: { [key: string]: TraceLog } = {};
export const traceContext: string[] = [];

export const getCurrentTraceId = (): string | undefined => {
  return traceContext[traceContext.length - 1] || undefined;
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

export const trace = (funcName: string, func: (...args: any[]) => any, options?: TraceOptions) => {
  return async (...args: any[]) => {
    const traceId = genTraceId();
    const startTimestamp = new Date();

    traceData[traceId] = {
      trace_name: funcName,
      trace_id: traceId,
      start_timestamp: toDateTimeString(startTimestamp),
      inputs: extractFunctionParams(func, args),
      metadata: options?.metadata,
      tags: options?.tags,
      target: options?.target,
      end_user_identifier: options?.endUserIdentifier,
      children: [],
      status: 'success',
    };

    traceContext.push(traceId);

    if (traceContext.length > 1) {
      const parentTraceId = traceContext[traceContext.length - 2];
      traceData[parentTraceId].children.push(traceId);
    }

    try {
      const result = await func(...args);
      const output = typeof result === 'string' ? result : JSON.stringify(result);
      let outputForEvalMetrics = output;
      if (options?.accessOutputOfFunc) {
        outputForEvalMetrics = options?.accessOutputOfFunc(result);
      }
      traceInsert(traceId, {
        output,
        evaluation_metric_names: options?.evalFuncNames,
        output_for_eval_metrics: outputForEvalMetrics,
      });
      return result;
    } catch (error: any) {
      console.error(`Error occurred in function ${func.name}, ${error}`);
      traceInsert(traceId, { error: error.toString(), status: 'error' });
      throw error;
    } finally {
      const endTimestamp = new Date();
      traceInsert(traceId, {
        end_timestamp: toDateTimeString(endTimestamp),
        latency: (endTimestamp.getTime() - startTimestamp.getTime()) / 1000,
      });
      await pareaLogger.recordLog(traceData[traceId]); // log the trace data
      traceContext.pop();
    }
  };
};

function extractFunctionParams(func: Function, args: any[]): { [key: string]: any } {
  const functionString = func.toString();
  const match = functionString.match(/\(([^)]*)\)/);
  if (!match) return {}; // handle case of no match (shouldn't happen if function is valid)

  const paramNamesRaw = match[1]; // get the raw parameters string
  const paramNames = paramNamesRaw.split(',').map((param) => {
    // use regex to match the parameter name, it should be the first word before space or colon
    const match = param.trim().match(/(\w+)/);
    return match ? match[0] : ''; // return the matched parameter name, or empty string if no match
  });

  // Constructing an object of paramName: value
  return paramNames.reduce((acc, paramName, index) => {
    return { ...acc, [paramName]: typeof args[index] === 'string' ? args[index] : JSON.stringify(args[index]) };
  }, {});
}
