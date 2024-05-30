// LogDecorator.ts

import { MessageQueue } from './MessageQueue';
import { EvaluatedLog, EvaluationResult, TraceLog, TraceOptions } from '../types';
import { genTraceId, toDateTimeString } from '../helpers';
import { AsyncLocalStorage } from 'node:async_hooks';
import { extractFunctionParamNames, extractFunctionParams } from './trace_utils';

export const asyncLocalStorage = new AsyncLocalStorage<Map<string, { traceLog: TraceLog; isRunningEval: boolean }>>();

export const executionOrderCounters = new Map<string, number>();

export function LogDecorator<T extends (...args: any[]) => any>(
  functionName: string,
  originalMethod: T,
  options: TraceOptions = {},
): T {
  const wrappedMethod = function (this: any, ...args: any[]): any {
    const traceEnabled = process.env.PAREA_TRACE_ENABLED !== 'false';
    const shouldSample = Math.random() * 100 < (options?.sampleRate || 100);

    if (!traceEnabled || !shouldSample) {
      return originalMethod.apply(this, args);
    }

    const traceId = genTraceId();
    const parentStore = asyncLocalStorage.getStore();
    const parentTraceId = parentStore ? Array.from(parentStore.keys())[0] : undefined;
    const isRootTrace = !parentTraceId;
    const rootTraceId = isRootTrace
      ? traceId
      : parentStore
      ? Array.from(parentStore.values())[0].traceLog.root_trace_id
      : traceId;
    const inputParams = extractFunctionParams(originalMethod, args);
    const startTimestamp = new Date();

    const depth = parentStore ? Array.from(parentStore.values())[0].traceLog.depth + 1 : 0;
    let executionOrder = 0;
    if (rootTraceId) {
      // Get the execution order counter for the current root trace
      executionOrder = executionOrderCounters.get(rootTraceId) || 0;
      executionOrderCounters.set(rootTraceId, executionOrder + 1);
    }

    let target: string | undefined;
    const numParams = extractFunctionParamNames(originalMethod)?.length || 0;
    if (args?.length > numParams && typeof args[args.length - 1] === 'string') {
      target = args.pop() as string;
    } else if (parentStore && parentTraceId) {
      target = parentStore?.get(parentTraceId)?.traceLog.target;
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
      depth,
      execution_order: executionOrder,
    };

    const store = new Map<string, { traceLog: TraceLog; isRunningEval: boolean }>();
    store.set(traceId, { traceLog, isRunningEval: false });

    if (parentStore && parentTraceId) {
      const parentTraceLog = parentStore.get(parentTraceId);
      if (parentTraceLog) {
        parentTraceLog.traceLog.children.push(traceId);
        parentStore.set(parentTraceId, parentTraceLog);
      }
    }

    return asyncLocalStorage.run(store, () => {
      let outputValue: any;
      let error: Error | undefined;
      const delaySend = !!options?.evalFuncs;

      try {
        outputValue = originalMethod.apply(this, args);
        traceLog.evaluation_metric_names = options?.evalFuncNames;
        const endTimestamp = new Date();
        traceLog.end_timestamp = toDateTimeString(endTimestamp);
        traceLog.latency = (endTimestamp.getTime() - startTimestamp.getTime()) / 1000;

        if (outputValue instanceof Promise) {
          return outputValue
            .then((result) => {
              traceLog.output = typeof result === 'string' ? result : JSON.stringify(result);
              let outputForEvalMetrics = outputValue;
              if (options?.accessOutputOfFunc) {
                try {
                  outputForEvalMetrics = options?.accessOutputOfFunc(outputValue);
                  traceLog.output_for_eval_metrics = outputForEvalMetrics;
                } catch (e) {
                  console.error(`Error accessing output of func with output: ${outputValue}. Error: ${e}`, e);
                }
              }
              if (!delaySend) {
                MessageQueue.enqueue(traceLog);
              }
              return result;
            })
            .catch((err) => {
              error = err as Error;
              traceLog.error = error.toString();
              traceLog.status = 'error';
              if (!delaySend) {
                MessageQueue.enqueue(traceLog);
              }

              throw err;
            });
        }

        traceLog.output = typeof outputValue === 'string' ? outputValue : JSON.stringify(outputValue);
        let outputForEvalMetrics = outputValue;
        if (options?.accessOutputOfFunc) {
          try {
            outputForEvalMetrics = options?.accessOutputOfFunc(outputValue);
            traceLog.output_for_eval_metrics = outputForEvalMetrics;
          } catch (e) {
            console.error(`Error accessing output of func with output: ${outputValue}. Error: ${e}`, e);
          }
        }
        if (!delaySend) {
          MessageQueue.enqueue(traceLog);
        }

        return outputValue;
      } catch (err) {
        error = err as Error;
        traceLog.error = error.toString();
        traceLog.status = 'error';
        if (!delaySend) {
          MessageQueue.enqueue(traceLog);
        }

        throw err;
      } finally {
        store.set(traceId, { traceLog, isRunningEval: false });
        if (options?.evalFuncs) {
          handleRunningEvals(traceId, store, options.evalFuncs, options?.applyEvalFrac);
        }
      }
    });
  };

  return wrappedMethod as T;
}

export const handleRunningEvals = async (
  traceId: string,
  store: Map<string, { traceLog: TraceLog; isRunningEval: boolean }>,
  evalFuncs: ((
    traceLog: EvaluatedLog,
  ) => Promise<EvaluationResult | EvaluationResult[] | number | boolean | undefined>)[],
  applyEvalFrac: number | undefined,
): Promise<void> => {
  if (!store) {
    console.warn('No active store found for handleRunningEvals.');
    return;
  }

  const currentTraceData = store.get(traceId);
  const traceLog = currentTraceData?.traceLog;
  if (!currentTraceData || !traceLog) {
    console.warn(`No trace data found for traceId ${traceId}.`);
    return;
  }

  if (traceLog.status === 'success' && (!applyEvalFrac || Math.random() < applyEvalFrac)) {
    currentTraceData.isRunningEval = true;
    store.set(traceId, currentTraceData);
    if (traceLog.output_for_eval_metrics) {
      traceLog.output = traceLog.output_for_eval_metrics;
    }
    const scores: EvaluationResult[] = [];
    for (const func of evalFuncs) {
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
    currentTraceData.isRunningEval = false;
    currentTraceData.traceLog = traceLog;
  }
  store.set(traceId, currentTraceData);
  MessageQueue.sendImmediately(traceLog);
};
