import { ContextObject, TraceLog, TraceOptions } from '../types';
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
  updateTraceLog,
} from './helpers';
import { handleRunningEvals } from './EvalHandler';
import { asyncLocalStorage } from './context';

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
            _maybeEnqueue(delaySendUntilAfterEval, traceLog);
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
            output_for_eval_metrics: outputForEval,
          });
          _maybeEnqueue(delaySendUntilAfterEval, traceLog);
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
        _maybeEnqueue(delaySendUntilAfterEval, traceLog);
        throw err;
      } finally {
        store.set(traceId, { traceLog, isRunningEval: false });
        _fillRootTracesIfNeeded(isRootTrace, rootTraceId, traceLog);
      }
    });
  };

  return wrappedMethod as T;
}
