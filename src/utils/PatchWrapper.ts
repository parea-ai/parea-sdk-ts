import { ContextObject, TraceLog } from '../types';
import { MessageQueue } from './MessageQueue';
import { genTraceId, toDateTimeString } from '../helpers';
import { asyncLocalStorage, executionOrderCounters, traceInsert } from './context';
import { StreamHandler } from './StreamHandler';
import {
  _determineDepthAndExecutionOrder,
  _determineOpenAIConfiguration,
  _determineRootTraceId,
  _fillParentIfNeeded,
  getOutput,
  getTotalCost,
  messageReducer,
  updateTraceLog,
} from './helpers';
import { ChatCompletionMessage } from 'openai/src/resources/chat/completions';
import { pareaLogger } from '../parea_logger';

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

      const insideEvalFuncSkipLogging = parentStore ? Array.from(parentStore.values())[0].isRunningEval : false;
      if (insideEvalFuncSkipLogging) {
        return originalMethod.apply(thisArg, args);
      }

      const traceId = genTraceId();
      const parentTraceId = parentStore ? Array.from(parentStore.keys())[0] : undefined;
      const isRootTrace = !parentTraceId;
      const rootTraceId = _determineRootTraceId(isRootTrace, traceId, parentStore);
      const { depth, executionOrder } = _determineDepthAndExecutionOrder(parentStore, rootTraceId);

      const kwargs = { ...args[idxArgs] };
      const streamEnabled = kwargs?.stream;
      const configuration = _determineOpenAIConfiguration(kwargs);

      const startTimestamp = new Date();

      const traceLog: TraceLog = {
        trace_name: configuration?.model ? `llm-${configuration.model}` : 'llm',
        trace_id: traceId,
        parent_trace_id: parentTraceId,
        root_trace_id: rootTraceId,
        start_timestamp: toDateTimeString(startTimestamp),
        configuration: configuration,
        children: [],
        status: 'success',
        experiment_uuid: process.env.PAREA_OS_ENV_EXPERIMENT_UUID || null,
        depth,
        execution_order: executionOrder,
      };

      const store = new Map<string, ContextObject>();
      store.set(traceId, { traceLog, isRunningEval: false });

      _fillParentIfNeeded(parentStore, parentTraceId, traceId);

      return asyncLocalStorage.run(store, () => {
        let outputValue: any;
        let error: Error | undefined;

        try {
          outputValue = originalMethod.apply(thisArg, args);

          if (outputValue instanceof Promise) {
            return outputValue.then((result) => {
              if (streamEnabled) {
                const streamHandler = new StreamHandler(result, traceLog, startTimestamp);
                return streamHandler.handle();
              } else {
                const endTimestamp = new Date();
                if (result?.model) {
                  configuration.model = result.model;
                }
                updateTraceLog(traceLog, {
                  output: getOutput(result),
                  input_tokens: result?.usage?.prompt_tokens ?? 0,
                  output_tokens: result?.usage?.completion_tokens ?? 0,
                  total_tokens: result?.usage?.total_tokens ?? 0,
                  cost:
                    getTotalCost(
                      configuration.model || '',
                      result.usage.prompt_tokens,
                      result.usage.completion_tokens,
                    ) ?? 0,
                  end_timestamp: toDateTimeString(endTimestamp),
                  latency: (endTimestamp.getTime() - startTimestamp.getTime()) / 1000,
                  configuration: configuration,
                });
                MessageQueue.enqueue(traceLog);
                return result;
              }
            });
          } else {
            if (streamEnabled) {
              const streamHandler = new StreamHandler(outputValue, traceLog, startTimestamp);
              return streamHandler.handle();
            } else {
              const endTimestamp = new Date();
              if (outputValue?.model) {
                configuration.model = outputValue.model;
              }
              updateTraceLog(traceLog, {
                output: getOutput(outputValue),
                input_tokens: outputValue?.usage?.prompt_tokens ?? 0,
                output_tokens: outputValue?.usage?.completion_tokens ?? 0,
                total_tokens: outputValue?.usage?.total_tokens ?? 0,
                cost:
                  getTotalCost(
                    configuration.model || '',
                    outputValue.usage.prompt_tokens,
                    outputValue.usage.completion_tokens,
                  ) ?? 0,
                end_timestamp: toDateTimeString(endTimestamp),
                latency: (endTimestamp.getTime() - startTimestamp.getTime()) / 1000,
                configuration: configuration,
              });
              MessageQueue.enqueue(traceLog);
              return outputValue;
            }
          }
        } catch (err) {
          error = err as Error;
          const endTimestamp = new Date();
          updateTraceLog(traceLog, {
            error: error.toString(),
            status: 'error',
            end_timestamp: toDateTimeString(endTimestamp),
            latency: (endTimestamp.getTime() - startTimestamp.getTime()) / 1000,
          });
          MessageQueue.enqueue(traceLog);
          throw error;
        } finally {
          store.set(traceId, { traceLog, isRunningEval: false });
        }
      });
    };
  };

  (target[methodName] as any) = wrappedMethod(originalMethod, target);
}

export function wrapMethod(method: Function, idxArgs: number = 0) {
  return async function (this: any, ...args: any[]) {
    const traceId = genTraceId();
    const parentStore = asyncLocalStorage.getStore();
    const parentTraceId = parentStore ? Array.from(parentStore.keys())[0] : undefined;
    const isRootTrace = !parentTraceId; // It's a root trace if there is no parent.
    const rootTraceId = isRootTrace
      ? traceId
      : parentStore
      ? Array.from(parentStore.values())[0].traceLog.root_trace_id
      : traceId;

    const depth = parentStore ? Array.from(parentStore.values())[0].traceLog.depth + 1 : 0;

    // Get the execution order counter for the current root trace
    let executionOrder = 0;
    if (rootTraceId) {
      executionOrder = executionOrderCounters.get(rootTraceId) || 0;
      executionOrderCounters.set(rootTraceId, executionOrder + 1);
    }

    if (parentStore && Array.from(parentStore.values())[0].isRunningEval) {
      return await method.apply(this, args);
    }

    const startTimestamp = new Date();
    let error: string | null = null;
    let status: string | undefined = 'success';
    let response: any = null;
    let endTimestamp: Date | null;

    const kwargs = args[idxArgs];
    const streamEnabled = kwargs?.stream;
    const configuration = _determineOpenAIConfiguration(kwargs);

    const traceLog: TraceLog = {
      trace_id: traceId,
      parent_trace_id: parentTraceId || traceId,
      root_trace_id: rootTraceId,
      trace_name: 'llm-openai',
      start_timestamp: toDateTimeString(startTimestamp),
      configuration: configuration,
      children: [],
      status: status,
      experiment_uuid: process.env.PAREA_OS_ENV_EXPERIMENT_UUID || null,
      depth,
      execution_order: executionOrder,
    };

    return asyncLocalStorage.run(
      new Map([
        [
          traceId,
          {
            traceLog,
            isRunningEval: false,
            rootTraceId,
            startTimestamp,
          },
        ],
      ]),
      async () => {
        if (parentStore && parentTraceId) {
          const parentTraceLog = parentStore.get(parentTraceId);
          if (parentTraceLog) {
            parentTraceLog.traceLog.children.push(traceId);
            parentStore.set(parentTraceId, parentTraceLog);
          }
        }

        try {
          const startTime = startTimestamp.getTime() / 1000;
          response = await method.apply(this, args);
          try {
            if (streamEnabled) {
              let message = {} as ChatCompletionMessage;
              let timeToFirstToken;
              const [loggingStream, originalStream] = response.tee();
              response = originalStream;

              for await (const item of loggingStream) {
                const out = messageReducer(message, item, startTime);
                message = out.output;
                if (!timeToFirstToken) {
                  timeToFirstToken = out.timeToFirstToken;
                }
              }
              traceInsert(
                {
                  output: getOutput({ choices: [{ message }] }),
                  time_to_first_token: timeToFirstToken,
                },
                traceId,
              );
            } else {
              traceInsert(
                {
                  output: getOutput(response),
                  input_tokens: response.usage.prompt_tokens,
                  output_tokens: response.usage.completion_tokens,
                  total_tokens: response.usage.total_tokens,
                  cost: getTotalCost(
                    args[idxArgs].model,
                    response.usage.prompt_tokens,
                    response.usage.completion_tokens,
                  ),
                },
                traceId,
              );
            }
          } catch (err: unknown) {
            let trace_error = 'An unknown error occurred in trace';
            if (err instanceof Error) {
              trace_error = err.message;
            }
            console.error(`Error processing response for trace ${traceId}: ${err}`);
            traceInsert({ metadata: { trace_error: trace_error } }, traceId);
          }
        } catch (err: unknown) {
          if (err instanceof Error) {
            error = err.message;
          } else {
            error = 'An unknown error occurred';
          }
          status = 'error';
          traceInsert({ error, status }, traceId);
          throw err;
        } finally {
          endTimestamp = new Date();
          traceInsert(
            {
              end_timestamp: toDateTimeString(endTimestamp),
              latency: (endTimestamp.getTime() - startTimestamp.getTime()) / 1000,
              status: status,
            },
            traceId,
          );
          try {
            await pareaLogger.recordLog(traceLog);
          } catch (e) {
            console.error(`Error recording log for trace ${traceId}: ${e}`);
          }
        }

        return response;
      },
    );
  };
}
