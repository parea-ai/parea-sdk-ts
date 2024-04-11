import { EvaluationResult, TraceLog, TraceOptions } from '../types';
import { pareaLogger } from '../parea_logger';
import { genTraceId, toDateTimeString } from '../helpers';
import { AsyncLocalStorage } from 'node:async_hooks';

export type ContextObject = {
  traceLog: TraceLog;
  isRunningEval: boolean;
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

/**
 * Insert data into the trace log for the current or specified trace id. Data should be a dictionary with keys that correspond to the fields of the TraceLog model.
 * If the field already has an existing value that is extensible (dict, set, list, etc.), the new value will be merged with the existing value.
 *
 * @param data - Keys can be one of: trace_name, end_user_identifier, metadata, tags, deployment_id, images
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

type AsyncFunctionOrNot<TReturn, TArgs extends unknown[]> = (...args: TArgs) => Promise<TReturn> | TReturn;

export const trace = <TReturn, TArgs extends unknown[]>(
  funcName: string,
  func: AsyncFunctionOrNot<TReturn, TArgs>,
  options?: TraceOptions,
) => {
  return async (...args: TArgs) => {
    const traceId = genTraceId();
    const startTimestamp = new Date();

    const parentStore = asyncLocalStorage.getStore();
    const parentTraceId = parentStore ? Array.from(parentStore.keys())[0] : undefined;
    const isRootTrace = !parentTraceId; // It's a root trace if there is no parent.
    const rootTraceId = isRootTrace ? traceId : parentStore ? Array.from(parentStore.values())[0].rootTraceId : traceId;
    let target: string | undefined;
    const numParams = extractFunctionParamNames(func)?.length || 0;
    if (args?.length > numParams && typeof args[args.length - 1] === 'string') {
      target = args.pop() as string;
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
      deployment_id: options?.deploymentId,
    };

    return asyncLocalStorage.run(new Map([[traceId, { traceLog, isRunningEval: false, rootTraceId }]]), async () => {
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
          try {
            outputForEvalMetrics = options?.accessOutputOfFunc(result);
          } catch (e) {
            console.error(`Error accessing output of func with output: ${output}. Error: ${e}`, e);
          }
        }
        traceInsert(
          {
            output,
            evaluation_metric_names: options?.evalFuncNames,
            output_for_eval_metrics: outputForEvalMetrics,
          },
          traceId,
        );
        return result;
      } catch (error: any) {
        console.error(`Error occurred in function ${func.name}, ${error}`);
        traceInsert({ error: error.toString(), status: 'error' }, traceId);
        throw error;
      } finally {
        const endTimestamp = new Date();
        traceInsert(
          {
            end_timestamp: toDateTimeString(endTimestamp),
            latency: (endTimestamp.getTime() - startTimestamp.getTime()) / 1000,
          },
          traceId,
        );
        try {
          await pareaLogger.recordLog(traceLog);
          await handleRunningEvals(traceLog, traceId, options);
        } catch (e) {
          console.error(`Error occurred recording log for trace ${traceId}, ${e}`);
        }
        if (isRootTrace) {
          const finalTraceLog = asyncLocalStorage.getStore()?.get(rootTraceId)?.traceLog || traceLog;
          rootTraces.set(rootTraceId, finalTraceLog);
        }
      }
    });
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
    currentTraceData.isRunningEval = true;
    store.set(traceId, currentTraceData);
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
    for (const func of options?.evalFuncs) {
      try {
        const score = await func(traceLog);
        if (score !== undefined && score !== null) {
          if (typeof score === 'number') {
            scores.push({ name: func.name, score });
          } else if (typeof score === 'boolean') {
            scores.push({ name: func.name, score: score ? 1 : 0 });
          } else if (Array.isArray(score)) {
            scores.push(...score);
          } else {
            scores.push(score);
          }
        }
      } catch (e) {
        console.error(`Error occurred calling evaluation function '${func.name}', ${e}`, e);
      }
    }

    try {
      await pareaLogger.updateLog({ trace_id: traceId, field_name_to_value_map: { scores: scores } });
    } catch (e) {
      console.error(`Error occurred updating log for trace ${traceId}, ${e}`);
    }
    currentTraceData.traceLog.scores = scores;
    currentTraceData.isRunningEval = false;
    store.set(traceId, currentTraceData);
  }
};

function extractFunctionParamNames(func: Function): string[] {
  try {
    const functionString = func.toString();
    const match = functionString.match(/\(([^)]*)\)/);
    if (!match) return []; // handle case of no match (shouldn't happen if function is valid)

    const paramNamesRaw = match[1]; // get the raw parameters string
    return paramNamesRaw
      .split(',')
      .map((param) => {
        // use regex to match the parameter name, it should be the first word before space or colon
        const match = param.trim().match(/(\w+)/);
        return match ? match[0] : ''; // return the matched parameter name, or empty string if no match
      })
      .filter((param) => param !== '');
  } catch (e) {
    console.error(`Error extracting function param names: ${e}`);
    return [];
  }
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
