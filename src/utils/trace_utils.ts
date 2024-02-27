import { EvaluationResult, TraceLog, TraceOptions } from '../types';
import { pareaLogger } from '../parea_logger';
import { genTraceId, toDateTimeString } from '../helpers';
import { AsyncLocalStorage } from 'node:async_hooks';

export type ContextObject = {
  traceLog: TraceLog;
  threadIdsRunningEvals: string[];
  rootTraceId: string;
};

export const asyncLocalStorage = new AsyncLocalStorage<Map<string, ContextObject>>();
export const rootTraces = new Map<string, TraceLog>();

export const getCurrentTraceId = (): string | undefined => {
  const store = asyncLocalStorage.getStore();

  if (!store) {
    return undefined;
  }

  const traceIds = Array.from(store.keys());

  return traceIds[traceIds.length - 1];
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
  const store = asyncLocalStorage.getStore();
  if (!store) {
    console.warn('No active store found for traceInsert.');
    return;
  }

  const currentTraceData = store.get(traceId);
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

export const trace = (funcName: string, func: (...args: any[]) => any, options?: TraceOptions) => {
  return async (...args: any[]) => {
    const traceId = genTraceId();
    const startTimestamp = new Date();

    const parentStore = asyncLocalStorage.getStore();
    const parentTraceId = parentStore ? Array.from(parentStore.keys())[0] : undefined;
    const isRootTrace = !parentTraceId; // It's a root trace if there is no parent.
    const rootTraceId = isRootTrace ? traceId : parentStore ? Array.from(parentStore.values())[0].rootTraceId : traceId;
    let target;
    const numParams = extractFunctionParamNames(func).length;
    if (args?.length > numParams) {
      target = args.pop();
    }

    const traceLog: TraceLog = {
      trace_name: funcName,
      trace_id: traceId,
      parent_trace_id: parentTraceId || traceId,
      root_trace_id: rootTraceId,
      start_timestamp: toDateTimeString(startTimestamp),
      inputs: extractFunctionParams(func, args),
      metadata: options?.metadata,
      tags: options?.tags,
      target: target,
      end_user_identifier: options?.endUserIdentifier,
      children: [],
      status: 'success',
      experiment_uuid: process.env.PAREA_OS_ENV_EXPERIMENT_UUID || null,
      apply_eval_frac: options?.applyEvalFrac,
    };

    return asyncLocalStorage.run(
      new Map([[traceId, { traceLog, threadIdsRunningEvals: [], rootTraceId }]]),
      async () => {
        if (parentStore && parentTraceId) {
          const parentTraceLog = parentStore.get(parentTraceId);
          if (parentTraceLog) {
            parentTraceLog.traceLog.children.push(traceId);
            parentStore.set(parentTraceId, parentTraceLog);
          }
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
          await pareaLogger.recordLog(traceLog);
          await handleRunningEvals(traceLog, traceId, options);
          if (isRootTrace) {
            const finalTraceLog = asyncLocalStorage.getStore()?.get(rootTraceId)?.traceLog || traceLog;
            rootTraces.set(rootTraceId, finalTraceLog);
          }
        }
      },
    );
  };
};

export const handleRunningEvals = async (
  traceLog: TraceLog,
  traceId: string,
  options: TraceOptions | undefined,
): Promise<void> => {
  const store = asyncLocalStorage.getStore();
  if (!store) {
    console.warn('No active store found for handleRunningEvals.');
    return;
  }

  const currentTraceData = store.get(traceId);
  if (!currentTraceData) {
    console.warn(`No trace data found for traceId ${traceId}.`);
    return;
  }

  const applyEval = !options?.applyEvalFrac || Math.random() < options.applyEvalFrac;
  if (options?.evalFuncs && traceLog.status === 'success' && applyEval) {
    currentTraceData.threadIdsRunningEvals.push(traceId);
    let outputForEvalMetrics: string | undefined;

    if (options?.accessOutputOfFunc) {
      try {
        const output = traceLog?.output ? JSON.parse(traceLog.output) : {};
        const modifiedOutput = options.accessOutputOfFunc(output);
        outputForEvalMetrics = JSON.stringify(modifiedOutput);
      } catch (e) {
        console.error(`Error accessing output of func with output: ${traceLog.output}. Error: ${e}`, e);
        return;
      }
    } else {
      outputForEvalMetrics = traceLog.output;
    }

    traceLog.output = outputForEvalMetrics;
    const scores: EvaluationResult[] = [];

    options?.evalFuncs.forEach((func) => {
      try {
        const score = func(traceLog);
        if (score !== undefined && score !== null) {
          scores.push({ name: func.name, score });
        }
      } catch (e) {
        console.error(`Error occurred calling evaluation function '${func.name}', ${e}`, e);
      }
    });

    await pareaLogger.updateLog({ trace_id: traceId, field_name_to_value_map: { scores: scores } });
    currentTraceData.traceLog.scores = scores;
    const index = currentTraceData.threadIdsRunningEvals.indexOf(traceId);
    if (index > -1) {
      currentTraceData.threadIdsRunningEvals.splice(index, 1);
      store.set(traceId, currentTraceData);
    }
  }
};

function extractFunctionParamNames(func: Function): string[] {
  const functionString = func.toString();
  const match = functionString.match(/\(([^)]*)\)/);
  if (!match) return []; // handle case of no match (shouldn't happen if function is valid)

  const paramNamesRaw = match[1]; // get the raw parameters string
  return paramNamesRaw.split(',').map((param) => {
    // use regex to match the parameter name, it should be the first word before space or colon
    const match = param.trim().match(/(\w+)/);
    return match ? match[0] : ''; // return the matched parameter name, or empty string if no match
  });
}

function extractFunctionParams(func: Function, args: any[]): { [key: string]: any } {
  const paramNames = extractFunctionParamNames(func);

  // Constructing an object of paramName: value
  return paramNames.reduce((acc, paramName, index) => {
    return {
      ...acc,
      [paramName]:
        typeof args[index] === 'string'
          ? args[index]
          : Array.isArray(args[index])
          ? args[index]
          : JSON.stringify(args[index]),
    };
  }, {});
}
