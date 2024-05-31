import { TraceLog, TraceOptions } from '../types';
import { genTraceId, toDateTimeString } from '../helpers';
import {
  _determineDepthAndExecutionOrder,
  _determineOutputForEvalMetrics,
  _determineRootTraceId,
  _determineTarget,
  _fillParentIfNeeded,
  _fillRootTracesIfNeeded,
  _maybeEnqueue,
  _stringifyOutput,
  extractFunctionParams,
} from './helpers';
import { handleRunningEvals } from './EvalHandler';
import { asyncLocalStorage, traceInsert } from './context';

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

    _fillParentIfNeeded(parentStore, parentTraceId, traceId);

    return asyncLocalStorage.run(store, () => {
      let outputValue: any;
      let error: Error | undefined;
      const delaySend = !!options?.evalFuncs;

      try {
        outputValue = originalMethod.apply(this, args);
        const endTimestamp = new Date();
        traceInsert(
          {
            evaluation_metric_names: options?.evalFuncNames,
            end_timestamp: toDateTimeString(endTimestamp),
            latency: (endTimestamp.getTime() - startTimestamp.getTime()) / 1000,
          },
          traceId,
        );

        if (outputValue instanceof Promise) {
          return outputValue
            .then((result) => {
              traceInsert({ output: _stringifyOutput(result) }, traceId);
              _determineOutputForEvalMetrics(result, options, traceId);
              _maybeEnqueue(delaySend, traceLog);
              return result;
            })
            .catch((error: Error) => {
              traceInsert({ error: error.toString(), status: 'error' }, traceId);
              _maybeEnqueue(delaySend, traceLog);
              throw error;
            });
        }

        traceInsert({ output: _stringifyOutput(outputValue) }, traceId);
        _determineOutputForEvalMetrics(outputValue, options, traceId);
        _maybeEnqueue(delaySend, traceLog);
        return outputValue;
      } catch (err) {
        error = err as Error;
        traceInsert({ error: error.toString(), status: 'error' }, traceId);
        _maybeEnqueue(delaySend, traceLog);
        throw err;
      } finally {
        store.set(traceId, { traceLog, isRunningEval: false });
        if (options?.evalFuncs) {
          // fire and forget
          // noinspection JSIgnoredPromiseFromCall
          handleRunningEvals(traceId, store, options.evalFuncs, options?.applyEvalFrac);
        }
        _fillRootTracesIfNeeded(isRootTrace, rootTraceId, traceLog);
      }
    });
  };

  return wrappedMethod as T;
}
