import OpenAI from 'openai';
import { LLMInputs, Message, Role, TraceLog } from '../types';
import { pareaLogger } from '../parea_logger';
import { asyncLocalStorage, traceInsert } from './trace_utils';
import { genTraceId, toDateTimeString } from '../helpers';

function convertOAIMessage(m: any): Message {
  if (m.role === 'assistant' && !!m.tool_calls) {
    return {
      role: Role.assistant,
      content: formatToolCalls(m),
    };
  } else if (m.role === 'tool') {
    return {
      role: Role.tool,
      content: JSON.stringify({ tool_call_id: m.tool_call_id, content: m.content }),
    };
  } else {
    return {
      role: Role[m.role as keyof typeof Role],
      content: m.content,
    };
  }
}

function wrapMethod(method: Function, idxArgs: number = 0) {
  return async function (this: any, ...args: any[]) {
    const traceId = genTraceId();
    const parentStore = asyncLocalStorage.getStore();
    const parentTraceId = parentStore ? Array.from(parentStore.keys())[0] : undefined;
    const rootTraceId = parentStore ? Array.from(parentStore.values())[0].rootTraceId : traceId;

    if (parentStore && Array.from(parentStore.values())[0].isRunningEval) {
      return await method.apply(this, args);
    }

    const startTimestamp = new Date();
    let error: string | null = null;
    let status: string | undefined = 'success';
    let response: any = null;
    let endTimestamp: Date | null;

    const kwargs = args[idxArgs];
    const functions = kwargs?.functions || kwargs?.tools?.map((tool: any) => tool?.function) || [];
    const functionCallDefault = functions?.length > 0 ? 'auto' : null;

    const modelParams = {
      temp: kwargs?.temperature || 1.0,
      max_length: kwargs?.max_tokens,
      top_p: kwargs?.top_p || 1.0,
      frequency_penalty: kwargs?.frequency_penalty || 0.0,
      presence_penalty: kwargs?.presence_penalty || 0.0,
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
      parent_trace_id: parentTraceId || traceId,
      root_trace_id: rootTraceId,
      trace_name: 'LLM',
      start_timestamp: toDateTimeString(startTimestamp),
      configuration: configuration,
      children: [],
      status: status,
      experiment_uuid: process.env.PAREA_OS_ENV_EXPERIMENT_UUID || null,
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
        response = await method.apply(this, args);
        traceInsert(
          {
            output: getOutput(response),
            input_tokens: response.usage.prompt_tokens,
            output_tokens: response.usage.completion_tokens,
            total_tokens: response.usage.total_tokens,
            cost: getTotalCost(args[idxArgs].model, response.usage.prompt_tokens, response.usage.completion_tokens),
          },
          traceId,
        );
      } catch (err: unknown) {
        if (err instanceof Error) {
          error = err.message;
        } else {
          error = 'An unknown error occurred';
        }
        status = 'error';
        traceInsert({ error, status }, traceId);
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

      if (error) {
        throw new Error(error);
      }

      return response;
    });
  };
}

export function traceOpenAITriggerDev(ioOpenAIChatCompletionsCreate: Function): Function {
  return wrapMethod(ioOpenAIChatCompletionsCreate, 1);
}

export function patchOpenAI(openai: OpenAI) {
  // @ts-ignore
  openai.chat.completions.create = wrapMethod(openai.chat.completions.create);
}

const MODEL_COST_MAPPING: { [key: string]: { [key: string]: number } } = {
  'gpt-3.5-turbo-0301': {
    prompt: 1.5,
    completion: 4.0,
  },
  'gpt-3.5-turbo-0613': {
    prompt: 1.5,
    completion: 4.0,
  },
  'gpt-3.5-turbo-16k': {
    prompt: 3.0,
    completion: 4.0,
  },
  'gpt-3.5-turbo-16k-0301': {
    prompt: 3.0,
    completion: 4.0,
  },
  'gpt-3.5-turbo-16k-0613': {
    prompt: 3.0,
    completion: 4.0,
  },
  'gpt-3.5-turbo-1106': {
    prompt: 1.0,
    completion: 2.0,
  },
  'gpt-3.5-turbo-0125': {
    prompt: 0.5,
    completion: 2.0,
  },
  'gpt-3.5-turbo': {
    prompt: 0.5,
    completion: 2.0,
  },
  'gpt-3.5-turbo-instruct': {
    prompt: 1.5,
    completion: 4.0,
  },
  'gpt-4': {
    prompt: 30.0,
    completion: 60.0,
  },
  'gpt-4-0314': {
    prompt: 30.0,
    completion: 60.0,
  },
  'gpt-4-0613': {
    prompt: 30.0,
    completion: 60.0,
  },
  'gpt-4-32k': {
    prompt: 60.0,
    completion: 120.0,
  },
  'gpt-4-32k-0314': {
    prompt: 60.0,
    completion: 120.0,
  },
  'gpt-4-32k-0613': {
    prompt: 60.0,
    completion: 120.0,
  },
  'gpt-4-vision-preview': {
    prompt: 30.0,
    completion: 60.0,
  },
  'gpt-4-1106-vision-preview': {
    prompt: 30.0,
    completion: 60.0,
  },
  'gpt-4-turbo-preview': {
    prompt: 10.0,
    completion: 30.0,
  },
  'gpt-4-1106-preview': {
    prompt: 10.0,
    completion: 30.0,
  },
  'gpt-4-0125-preview': {
    prompt: 10.0,
    completion: 30.0,
  },
  'gpt-4-turbo': {
    prompt: 10.0,
    completion: 30.0,
  },
  'gpt-4-turbo-2024-04-09': {
    prompt: 10.0,
    completion: 30.0,
  },
};

function getTotalCost(modelName: string, promptTokens: number, completionTokens: number): number {
  if (!Object.keys(MODEL_COST_MAPPING).includes(modelName)) {
    console.error(
      `Unknown model: ${modelName}. Please provide a valid OpenAI model name. Known models are: ${Object.keys(
        MODEL_COST_MAPPING,
      ).join(', ')}`,
    );
  }
  const modelCost = MODEL_COST_MAPPING[modelName] || { prompt: 0, completion: 0 };
  const promptCost = promptTokens * modelCost.prompt;
  const completionCost = completionTokens * modelCost.completion;
  return (promptCost + completionCost) / 1000000;
}

function getOutput(result: any): string {
  const responseMessage = result?.choices[0]?.message;
  let completion: string = '';
  if (responseMessage.hasOwnProperty('function_call')) {
    completion = formatFunctionCall(responseMessage);
  } else if (responseMessage.hasOwnProperty('tool_calls')) {
    completion = formatToolCalls(responseMessage);
  } else {
    completion = responseMessage?.content?.trim() ?? '';
  }
  return completion;
}

function formatToolCalls(responseMessage: any): string {
  const formattedToolCalls: any[] = [];
  for (const toolCall of responseMessage['tool_calls']) {
    if (toolCall['type'] === 'function') {
      const functionName: string = toolCall['function']['name'];
      const functionArgs: any = parseArgs(toolCall['function']['arguments']);
      const toolCallId: string = toolCall['id'];
      formattedToolCalls.push({
        id: toolCallId,
        type: toolCall['type'],
        function: {
          name: functionName,
          arguments: functionArgs,
        },
      });
    } else {
      formattedToolCalls.push(toolCall);
    }
  }
  return JSON.stringify(formattedToolCalls, null, 4);
}

function formatFunctionCall(responseMessage: any): string {
  const functionName = responseMessage['function_call']['name'];
  const functionArgs: any = parseArgs(responseMessage['function_call']['arguments']);
  return `\`\`\`${JSON.stringify({ name: functionName, arguments: functionArgs }, null, 4)}\`\`\``;
}

function parseArgs(responseFunctionArgs: any): any {
  if (responseFunctionArgs instanceof Object) {
    return responseFunctionArgs;
  } else {
    return JSON.parse(responseFunctionArgs);
  }
}
