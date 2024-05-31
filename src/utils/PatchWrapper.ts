import { TraceLog } from '../types';
import { MessageQueue } from './MessageQueue';
import { genTraceId, toDateTimeString } from '../helpers';
import { asyncLocalStorage, traceInsert } from './context';
import { StreamHandler } from './StreamHandler';
import {
  _determineDepthAndExecutionOrder,
  _determineOpenAIConfiguration,
  _determineRootTraceId,
  getOutput,
  getTotalCost,
} from './helpers';

/**
 * Represents a wrapper function for patching a method.
 * @template T The type of the original method.
 * @param originalMethod The original method to be patched.
 * @param thisArg The 'this' argument for the original method.
 * @param idxArgs The index of the arguments object in the method parameters.
 * @returns The patched method.
 */
type MethodWrapper<T extends (...args: any[]) => any> = (
  originalMethod: T,
  thisArg: ThisParameterType<T>,
  idxArgs?: number,
) => (...args: Parameters<T>) => ReturnType<T>;

/**
 * Patches a method of an object to enable tracing and logging.
 * @template T The type of the target object.
 * @param target The target object containing the method to be patched.
 * @param methodName The name of the method to be patched.
 * @param sampleRate The sample rate for tracing.
 */
export function PatchWrapper<T extends object>(target: T, methodName: keyof T, sampleRate?: number): void {
  const originalMethod = target[methodName] as (...args: any[]) => any;

  const wrappedMethod: MethodWrapper<typeof originalMethod> = (originalMethod, thisArg, idxArgs: number = 0) => {
    return async function (...args: Parameters<typeof originalMethod>): Promise<ReturnType<typeof originalMethod>> {
      const traceEnabled = process.env.PAREA_TRACE_ENABLED !== 'false';
      const shouldSample = Math.random() * 100 < (sampleRate || 100);

      if (!traceEnabled || !shouldSample) {
        return originalMethod.apply(thisArg, args);
      }

      const parentStore = asyncLocalStorage.getStore();

      const traceId = genTraceId();
      const parentTraceId = parentStore ? Array.from(parentStore.keys())[0] : undefined;
      const isRootTrace = !parentTraceId;
      const rootTraceId = _determineRootTraceId(isRootTrace, traceId, parentStore);
      const { depth, executionOrder } = _determineDepthAndExecutionOrder(parentStore, rootTraceId);

      if (parentStore && Array.from(parentStore.values())[0].isRunningEval) {
        return originalMethod.apply(thisArg, args);
      }

      const kwargs = { ...args[idxArgs] };
      const streamEnabled = kwargs?.stream;
      const configuration = _determineOpenAIConfiguration(kwargs);

      const startTimestamp = new Date();

      const traceLog: TraceLog = {
        trace_id: traceId,
        root_trace_id: traceId,
        trace_name: 'llm-openai',
        start_timestamp: toDateTimeString(startTimestamp),
        configuration: configuration,
        children: [],
        status: 'success',
        experiment_uuid: process.env.PAREA_OS_ENV_EXPERIMENT_UUID || null,
        depth,
        execution_order: executionOrder,
      };

      try {
        const result = await originalMethod.apply(thisArg, args);
        const endTimestamp = new Date();
        traceInsert(
          {
            end_timestamp: toDateTimeString(endTimestamp),
            latency: (endTimestamp.getTime() - startTimestamp.getTime()) / 1000,
          },
          traceId,
        );

        if (streamEnabled) {
          const streamHandler = new StreamHandler(result, traceLog, startTimestamp);
          return streamHandler.handle();
        } else {
          traceInsert(
            {
              output: getOutput(result),
              input_tokens: result?.usage?.prompt_tokens ?? 0,
              output_tokens: result?.usage?.completion_tokens ?? 0,
              total_tokens: result?.usage?.total_tokens ?? 0,
              cost: getTotalCost(kwargs?.model, result.usage.prompt_tokens, result.usage.completion_tokens) ?? 0,
            },
            traceId,
          );
          MessageQueue.enqueue(traceLog);
          return result;
        }
      } catch (err) {
        const error = err as Error;
        traceInsert({ error: error.toString(), status: 'error' }, traceId);
        MessageQueue.enqueue(traceLog);
        throw error;
      }
    };
  };

  (target[methodName] as any) = wrappedMethod(originalMethod, target);
}
