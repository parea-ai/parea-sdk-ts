// PatchWrapper.ts
import { LLMInputs, TraceLog } from '../types';
import { MessageQueue } from './MessageQueue';
import { genTraceId, toDateTimeString } from '../helpers';
import { convertOAIMessage, getOutput, getTotalCost, messageReducer } from './wrap_openai';
import { ChatCompletionMessage } from 'openai/src/resources/chat/completions';

type MethodWrapper<T extends (...args: any[]) => any> = (
  originalMethod: T,
  thisArg: ThisParameterType<T>,
) => (...args: Parameters<T>) => ReturnType<T>;

export function PatchWrapper<T extends object>(target: T, methodName: keyof T): void {
  const originalMethod = target[methodName] as (...args: any[]) => any;

  const wrappedMethod: MethodWrapper<typeof originalMethod> = (originalMethod, thisArg, idxArgs: number = 0) => {
    return async function (...args: Parameters<typeof originalMethod>): Promise<ReturnType<typeof originalMethod>> {
      const traceId = genTraceId();
      const inputParams = args[idxArgs];
      const startTimestamp = new Date();

      const kwargs = { ...inputParams };
      const streamEnabled = kwargs?.stream;
      const functions = kwargs?.functions || kwargs?.tools?.map((tool: any) => tool?.function) || [];
      const functionCallDefault = functions?.length > 0 ? 'auto' : null;

      const modelParams = {
        temp: kwargs?.temperature ?? 1.0,
        max_length: kwargs?.max_tokens,
        top_p: kwargs?.top_p ?? 1.0,
        frequency_penalty: kwargs?.frequency_penalty ?? 0.0,
        presence_penalty: kwargs?.presence_penalty ?? 0.0,
        response_format: kwargs?.response_format,
      };

      const configuration: LLMInputs = {
        model: kwargs?.model,
        provider: 'openai',
        messages: kwargs?.messages?.map((message: any) => convertOAIMessage(message)),
        functions: functions,
        function_call: kwargs?.function_call || kwargs?.tool_choice || functionCallDefault,
        model_params: modelParams,
      };

      const traceLog: TraceLog = {
        trace_id: traceId,
        root_trace_id: traceId,
        trace_name: 'llm-openai',
        start_timestamp: toDateTimeString(startTimestamp),
        configuration: configuration,
        children: [],
        status: 'success',
        experiment_uuid: process.env.PAREA_OS_ENV_EXPERIMENT_UUID || null,
        depth: 0,
        execution_order: 0,
      };

      try {
        const result = await originalMethod.apply(thisArg, args);
        const endTimestamp = new Date();
        traceLog.end_timestamp = toDateTimeString(endTimestamp);
        traceLog.latency = (endTimestamp.getTime() - startTimestamp.getTime()) / 1000;

        if (isAsyncIterable(result) || streamEnabled) {
          const startTime = startTimestamp.getTime() / 1000;
          const outputStream = new TransformStream();
          const writer = outputStream.writable.getWriter();
          let message = {} as ChatCompletionMessage;
          let timeToFirstToken;

          (async () => {
            for await (const chunk of result) {
              const out = messageReducer(message, chunk, startTime);
              message = out.output;
              if (!timeToFirstToken) {
                timeToFirstToken = out.timeToFirstToken;
              }
              await writer.write(chunk);
            }
            await writer.close();
            const endTimestamp = new Date();
            traceLog.output = getOutput({ choices: [{ message }] });
            traceLog.time_to_first_token = timeToFirstToken;
            traceLog.end_timestamp = toDateTimeString(endTimestamp);
            traceLog.latency = (endTimestamp.getTime() - startTimestamp.getTime()) / 1000;
            MessageQueue.enqueue(traceLog);
          })();

          return outputStream.readable as unknown as ReturnType<typeof originalMethod>;
        } else {
          traceLog.output = getOutput(result);
          traceLog.input_tokens = result.usage.prompt_tokens;
          traceLog.output_tokens = result.usage.completion_tokens;
          traceLog.total_tokens = result.usage.total_tokens;
          traceLog.cost = getTotalCost(kwargs?.model, result.usage.prompt_tokens, result.usage.completion_tokens);
          MessageQueue.enqueue(traceLog);
          return result;
        }
      } catch (error) {
        traceLog.error = JSON.stringify(error);
        traceLog.status = 'error';
        MessageQueue.enqueue(traceLog);
        throw error;
      }
    };
  };

  (target[methodName] as any) = wrappedMethod(originalMethod, target);
}

function isAsyncIterable<T>(obj: any): obj is AsyncIterable<T> {
  return typeof obj[Symbol.asyncIterator] === 'function';
}
