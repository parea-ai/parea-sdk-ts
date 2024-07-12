import { ContextObject, TraceLog, TraceOptions } from '../types';
import { genTraceId, toDateTimeString } from '../helpers';
import { AsyncLocalStorage } from 'node:async_hooks';

export type ContextObject = {
  traceLog: TraceLog;
  isRunningEval: boolean;
  rootTraceId: string;
};

export const asyncLocalStorage = new AsyncLocalStorage<Map<string, ContextObject>>();
export const rootTraces = new Map<string, TraceLog>();

export const executionOrderCounters = new Map<string, number>();

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
 * Decorator to trace a function.
 * @param functionName The name of the function.
 * @param originalMethod The original function.
 * @param options Options for the trace.
 */
export function trace<T extends (...args: any[]) => any>(
  functionName: string,
  originalMethod: T,
  options: TraceOptions | undefined = undefined,
): T {
  const wrappedMethod = function (this: any, ...args: any[]): any {
    const traceEnabled = process.env.PAREA_TRACE_ENABLED !== 'false';
    const shouldSample = Math.random() * 100 < (options?.sampleRate || 100);

    if (!traceEnabled || !shouldSample) {
      return originalMethod.apply(this, args);
    }

    const parentStore = asyncLocalStorage.getStore();

    const traceId = genTraceId();
    const parentTraceId = parentStore ? Array.from(parentStore.keys())[0] : undefined;
    const isRootTrace = !parentTraceId;
    const rootTraceId = _determineRootTraceId(isRootTrace, traceId, parentStore);
    const { depth, executionOrder } = _determineDepthAndExecutionOrder(parentStore, rootTraceId);

    const target = _determineTarget(args, originalMethod, parentStore, parentTraceId);
    const inputParams = extractFunctionParams(originalMethod, args);

    const startTimestamp = new Date();

    const parentStore = asyncLocalStorage.getStore();
    const parentTraceId = parentStore ? Array.from(parentStore.keys())[0] : undefined;
    const isRootTrace = !parentTraceId; // It's a root trace if there is no parent.
    const rootTraceId = isRootTrace ? traceId : parentStore ? Array.from(parentStore.values())[0].rootTraceId : traceId;

    const depth = parentStore ? Array.from(parentStore.values())[0].traceLog.depth + 1 : 0;

    // Get the execution order counter for the current root trace
    let executionOrder = executionOrderCounters.get(rootTraceId);
    if (executionOrder === undefined) {
      executionOrder = 0;
    }
    executionOrderCounters.set(rootTraceId, executionOrder + 1);

    let target: string | undefined;
    const numParams = extractFunctionParamNames(func)?.length || 0;
    if (args?.length > numParams && typeof args[args.length - 1] === 'string') {
      target = args.pop() as string;
    }

    const traceLog: TraceLog = {
      trace_name: functionName,
      trace_id: traceId,
      parent_trace_id: parentTraceId,
      root_trace_id: rootTraceId,
      start_timestamp: toDateTimeString(startTimestamp),
      inputs: inputParams,
      metadata: options?.metadata,
      tags: options?.tags,
      target: target,
      end_user_identifier: options?.endUserIdentifier,
      session_id: options?.sessionId,
      children: [],
      status: 'success',
      experiment_uuid: process.env.PAREA_OS_ENV_EXPERIMENT_UUID || null,
      apply_eval_frac: options?.applyEvalFrac,
      deployment_id: options?.deploymentId,
      evaluation_metric_names: options?.evalFuncNames,
      depth,
      execution_order: executionOrder,
    };

    const store = new Map<string, ContextObject>();
    store.set(traceId, { traceLog, isRunningEval: false });

    _fillParentIfNeeded(parentStore, parentTraceId, traceId);

    return asyncLocalStorage.run(store, () => {
      let outputValue: any;
      let error: Error | undefined;
      const delaySendUntilAfterEval = !!options?.evalFuncs;

      try {
        outputValue = originalMethod.apply(this, args);

        if (outputValue instanceof Promise) {
          return outputValue.then((result) => {
            const endTimestamp = new Date();
            const outputForEval = _determineOutputForEvalMetrics(result, options);
            updateTraceLog(traceLog, {
              output: _stringifyOutput(result),
              end_timestamp: toDateTimeString(endTimestamp),
              latency: (endTimestamp.getTime() - startTimestamp.getTime()) / 1000,
              output_for_eval_metrics: outputForEval,
            });
            if (!delaySendUntilAfterEval) {
              // fire and forget
              // noinspection JSIgnoredPromiseFromCall
              pareaLogger.recordLog(traceLog);
            }
            if (options?.evalFuncs) {
              // fire and forget
              // noinspection JSIgnoredPromiseFromCall
              handleRunningEvals(traceId, traceLog, options.evalFuncs, options?.applyEvalFrac);
            }
            return result;
          });
        } else {
          const endTimestamp = new Date();
          const outputForEval = _determineOutputForEvalMetrics(outputValue, options);
          updateTraceLog(traceLog, {
            output: _stringifyOutput(outputValue),
            end_timestamp: toDateTimeString(endTimestamp),
            latency: (endTimestamp.getTime() - startTimestamp.getTime()) / 1000,
          },
          traceId,
        );
        try {
          if (options?.evalFuncs && traceLog.status === 'success') {
            await handleRunningEvals(traceLog, traceId, options);
          } else {
            // fire and forget
            // noinspection ES6MissingAwait
            pareaLogger.recordLog(traceLog);
            // await pareaLogger.recordLog(traceLog);
          }
          if (options?.evalFuncs) {
            // fire and forget
            // noinspection JSIgnoredPromiseFromCall
            handleRunningEvals(traceId, traceLog, options.evalFuncs, options?.applyEvalFrac);
          }
          return outputValue;
        }
      } catch (err) {
        error = err as Error;
        const endTimestamp = new Date();
        updateTraceLog(traceLog, {
          end_timestamp: toDateTimeString(endTimestamp),
          latency: (endTimestamp.getTime() - startTimestamp.getTime()) / 1000,
          error: error.toString(),
          status: 'error',
        });
        if (!delaySendUntilAfterEval) {
          // fire and forget
          // noinspection JSIgnoredPromiseFromCall
          pareaLogger.recordLog(traceLog);
        }
        throw err;
      } finally {
        store.set(traceId, { traceLog, isRunningEval: false });
        _fillRootTracesIfNeeded(isRootTrace, rootTraceId, traceLog);
      }
    });
  };

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
    traceLog.scores = scores;
    currentTraceData.traceLog.scores = scores;
    currentTraceData.isRunningEval = false;
    store.set(traceId, currentTraceData);

    try {
      // fire and forget
      // noinspection ES6MissingAwait
      pareaLogger.recordLog(traceLog);
      // await pareaLogger.recordLog(traceLog);
    } catch (e) {
      console.error(`Error occurred updating log for trace ${traceId}, ${e}`);
    }
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
