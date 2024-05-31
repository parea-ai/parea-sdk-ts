import { genTraceId, toDateTimeString } from '../helpers';
import { asyncLocalStorage, executionOrderCounters, traceInsert } from './context';
import { TraceLog } from '../types';
import { ChatCompletionMessage } from 'openai/src/resources/chat/completions';
import { _determineOpenAIConfiguration, getOutput, getTotalCost, messageReducer } from './helpers';
import { pareaLogger } from '../parea_logger';

export function wrapMethod(method: Function, idxArgs: number = 0) {
  return async function (this: any, ...args: any[]) {
    const traceId = genTraceId();
    const parentStore = asyncLocalStorage.getStore();
    const parentTraceId = parentStore ? Array.from(parentStore.keys())[0] : undefined;
    const isRootTrace = !parentTraceId; // It's a root trace if there is no parent.
    // const rootTraceId = parentStore ? Array.from(parentStore.values())[0].rootTraceId : traceId;
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
