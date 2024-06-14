import { ContextObject, LLMInputs, Message, ModelParams, Role, TraceLog, TraceOptions } from '../types';
import { asyncLocalStorage, executionOrderCounters, rootTraces } from './context';
import { MessageQueue } from './MessageQueue';
import { MODEL_COST_MAPPING } from './constants';
import { ChatCompletionMessage } from 'openai/src/resources/chat/completions';

/**
 * Determine the root trace id based on whether the trace is a root trace, the trace id, and the parent store.
 * @param isRootTrace Whether the trace is a root trace.
 * @param traceId The trace id.
 * @param parentStore The parent store.
 */
export function _determineRootTraceId(
  isRootTrace: boolean,
  traceId: string,
  parentStore: Map<string, ContextObject> | undefined,
): string | undefined {
  return isRootTrace ? traceId : parentStore ? Array.from(parentStore.values())[0].traceLog.root_trace_id : traceId;
}

/**
 * Determine the depth and execution order based on the parent store and root trace id.
 * @param parentStore The parent store.
 * @param rootTraceId The root trace id.
 */
export function _determineDepthAndExecutionOrder(
  parentStore: Map<string, ContextObject> | undefined,
  rootTraceId: string | undefined,
): {
  depth: number;
  executionOrder: number;
} {
  const depth = parentStore ? Array.from(parentStore.values())[0].traceLog.depth + 1 : 0;
  let executionOrder = 0;
  if (rootTraceId) {
    // Get the execution order counter for the current root trace
    executionOrder = executionOrderCounters.get(rootTraceId) || 0;
    executionOrderCounters.set(rootTraceId, executionOrder + 1);
  }
  return { depth, executionOrder };
}

/**
 * Determine the target based on the arguments, original method, parent store, and parent trace id.
 * @param args The arguments.
 * @param originalMethod The original method.
 * @param parentStore The parent store.
 * @param parentTraceId The parent trace id.
 */
export function _determineTarget(
  args: any[],
  originalMethod: (...args: any[]) => any,
  parentStore: Map<string, ContextObject> | undefined,
  parentTraceId: string | undefined,
): string | undefined {
  let target: string | undefined;
  const numParams = extractFunctionParamNames(originalMethod)?.length || 0;
  if (args?.length > numParams && typeof args[args.length - 1] === 'string') {
    target = args.pop() as string;
  } else if (parentStore && parentTraceId) {
    target = parentStore?.get(parentTraceId)?.traceLog.target;
  }
  return target;
}

/**
 * Determine the output for evaluation metrics based on the output value, options, and trace id.
 * @param outputValue The output value.
 * @param options The trace options.
 */
export function _determineOutputForEvalMetrics(
  outputValue: any,
  options: TraceOptions | undefined,
): string | undefined {
  if (options?.accessOutputOfFunc) {
    try {
      return options?.accessOutputOfFunc(outputValue);
    } catch (e) {
      console.error(`Error accessing output of func with output: ${outputValue}. Error: ${e}`, e);
    }
  }
  return undefined;
}

/**
 * Fill the parent store with the current trace id if the parent store and parent trace id are provided.
 * @param parentStore The parent store.
 * @param parentTraceId The parent trace id.
 * @param traceId The trace id.
 */
export function _fillParentIfNeeded(
  parentStore: Map<string, ContextObject> | undefined,
  parentTraceId: string | undefined,
  traceId: string,
): void {
  if (parentStore && parentTraceId) {
    const parentTraceLog = parentStore.get(parentTraceId);
    if (parentTraceLog) {
      parentTraceLog.traceLog.children.push(traceId);
      parentStore.set(parentTraceId, parentTraceLog);
    }
  }
}

/**
 * Maybe enqueue the trace log in the message queue.
 * @param delaySend Whether to delay sending the trace log.
 * @param traceLog The trace log.
 */
export function _maybeEnqueue(delaySend: boolean, traceLog: TraceLog): void {
  if (!delaySend) {
    MessageQueue.enqueue(traceLog);
  }
}

/**
 * Stringify the output value if it is not a string.
 * @param outputValue The output value.
 */
export function _stringifyOutput(outputValue: any): string {
  return typeof outputValue === 'string' ? outputValue : JSON.stringify(outputValue);
}

/**
 * Fill the root traces map with the root trace log if the trace is a root trace and the root trace id is provided.
 * @param isRootTrace Whether the trace is a root trace.
 * @param rootTraceId The root trace id.
 * @param traceLog The trace log.
 */
export function _fillRootTracesIfNeeded(
  isRootTrace: boolean,
  rootTraceId: string | undefined,
  traceLog: TraceLog,
): void {
  if (isRootTrace && rootTraceId) {
    const finalTraceLog = asyncLocalStorage.getStore()?.get(rootTraceId)?.traceLog || traceLog;
    rootTraces.set(rootTraceId, finalTraceLog);
  }
}

/**
 * Merge old and new values, where the new value takes precedence.
 * @param old The old value.
 * @param newValue The new value.
 * @returns The merged value.
 */
export const merge = (old: any, newValue: any) => {
  if (typeof old === 'object' && typeof newValue === 'object') {
    return { ...old, ...newValue };
  }
  if (Array.isArray(old) && Array.isArray(newValue)) {
    return [...old, ...newValue];
  }
  return newValue;
};

/**
 * Extract the parameter names from a function.
 * @param func The function.
 * @returns The parameter names.
 */
export function extractFunctionParamNames(func: Function): string[] {
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

/**
 * Extract the parameter names and values from a function and its arguments.
 * @param func The function.
 * @param args The arguments.
 * @returns The parameter names and values.
 */
export function extractFunctionParams(func: Function, args: any[]): { [key: string]: any } {
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

/**
 * Get the current unix timestamp.
 * @returns The current unix timestamp.
 */
export function getCurrentUnixTimestamp(): number {
  return new Date().getTime() / 1000;
}

/** Determine the OpenAI configuration based on the provided arguments.
 * @param kwargs
 */
export function _determineOpenAIConfiguration(kwargs: any): LLMInputs {
  try {
    const functions = kwargs?.functions || kwargs?.tools?.map((tool: any) => tool?.function) || [];
    const functionCallDefault = functions?.length > 0 ? 'auto' : null;

    const modelParams: ModelParams = {
      temp: kwargs?.temperature ?? 1.0,
      max_length: kwargs?.max_tokens,
      top_p: kwargs?.top_p ?? 1.0,
      frequency_penalty: kwargs?.frequency_penalty ?? 0.0,
      presence_penalty: kwargs?.presence_penalty ?? 0.0,
      response_format: kwargs?.response_format,
    };

    return {
      model: kwargs?.model,
      provider: 'openai',
      messages: kwargs?.messages?.map((message: any) => convertOAIMessage(message)),
      functions: functions,
      function_call: kwargs?.function_call || kwargs?.tool_choice || functionCallDefault,
      model_params: modelParams,
    };
  } catch (e) {
    console.error(`Error determining OpenAI configuration: ${e}`);
    return {};
  }
}

/**
 * Convert an OpenAI message to a message object.
 * @param m The OpenAI message.
 * @returns The message object.
 */
function convertOAIMessage(m: any): Message {
  if (m.role === 'assistant' && !!m.tool_calls) {
    let content = `${m}`;
    try {
      content = formatToolCalls(m);
    } catch (e) {
      console.error(`Error converting assistant message with tool calls: ${e}`);
    }
    return {
      role: Role.assistant,
      content: content,
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

/**
 * Get the total cost of a model based on the prompt and completion tokens.
 * @param modelName The model name.
 * @param promptTokens The number of prompt tokens.
 * @param completionTokens The number of completion tokens.
 * @returns The total cost.
 */
export function getTotalCost(modelName: string, promptTokens: number, completionTokens: number): number {
  try {
    const modelCost = MODEL_COST_MAPPING[modelName] || { prompt: 0, completion: 0 };
    const promptCost = promptTokens * modelCost.prompt;
    const completionCost = completionTokens * modelCost.completion;
    return (promptCost + completionCost) / 1000000;
  } catch (e) {
    console.error(`Error getting total cost: ${e}`);
    return 0;
  }
}

/**
 * Get the output from the result.
 * @param result The result.
 * @returns The output.
 */
export function getOutput(result: any): string {
  try {
    const responseMessage = result?.choices[0]?.message;
    let completion: string;
    if (responseMessage.hasOwnProperty('function_call')) {
      completion = formatFunctionCall(responseMessage);
    } else if (responseMessage.hasOwnProperty('tool_calls') && responseMessage['tool_calls'].length > 0) {
      completion = formatToolCalls(responseMessage);
    } else {
      completion = responseMessage?.content?.trim() ?? '';
    }
    return completion;
  } catch (e) {
    console.error(`Error getting output: ${e}`);
    return '';
  }
}

/**
 * Format tool calls in the response message.
 * @param responseMessage
 */
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

/**
 * Format a function call in the response message.
 * @param responseMessage
 */
function formatFunctionCall(responseMessage: any): string {
  const functionName = responseMessage['function_call']['name'];
  const functionArgs: any = parseArgs(responseMessage['function_call']['arguments']);
  return `\`\`\`${JSON.stringify({ name: functionName, arguments: functionArgs }, null, 4)}\`\`\``;
}

/**
 * Try to parse the arguments of a function.
 * @param responseFunctionArgs The response function arguments.
 * @returns The parsed arguments.
 */
function parseArgs(responseFunctionArgs: any): any {
  if (responseFunctionArgs instanceof Object) {
    return responseFunctionArgs;
  } else {
    try {
      return JSON.parse(responseFunctionArgs);
    } catch (e) {
      console.error(`Error parsing tool call arguments as Object, storing as string instead: ${e}`);
      return typeof responseFunctionArgs === 'string' ? responseFunctionArgs : `${responseFunctionArgs}`;
    }
  }
}

/**
 * Reduce the OpenAI stream response to a ChatCompletionMessage. Modified from OpenAI Node SDK example.
 * Source: https://github.com/openai/openai-node/blob/master/examples/tool-calls-stream.ts#L154
 * @param previous The previous message. Updating in place.
 * @param item The current chunk.
 * @param startTime The start time.
 */
export function messageReducer(
  previous: ChatCompletionMessage,
  item: any,
  startTime: number,
): {
  output: ChatCompletionMessage;
  timeToFirstToken: number | undefined;
  model: string | undefined;
} {
  let first = true;
  let timeToFirstToken;
  let model = item?.model;
  const reduce = (acc: any, delta: any) => {
    acc = { ...acc };
    for (const [key, value] of Object.entries(delta)) {
      if (acc[key] === undefined || acc[key] === null) {
        if (first) {
          const now = getCurrentUnixTimestamp();
          timeToFirstToken = now - startTime;
          first = false;
        }
        acc[key] = Array.isArray(value) ? [...value] : value;
        if (Array.isArray(acc[key])) {
          acc[key] = acc[key].map((arr: any) => {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { index, ...rest } = arr;
            return rest;
          });
        }
      } else if (typeof acc[key] === 'string' && typeof value === 'string') {
        acc[key] += value;
      } else if (typeof acc[key] === 'number' && typeof value === 'number') {
        acc[key] = value;
      } else if (Array.isArray(acc[key]) && Array.isArray(value)) {
        const accArray = acc[key];
        for (let i = 0; i < value.length; i++) {
          const { index, ...chunkTool } = value[i];
          if (index - accArray.length > 1) {
            console.error(
              `Error: An array has an empty value when tool_calls are constructed. tool_calls: ${accArray}; tool: ${value}`,
            );
          }
          accArray[index] = reduce({ ...accArray[index] }, chunkTool);
        }
      } else if (typeof acc[key] === 'object' && typeof value === 'object') {
        acc[key] = reduce({ ...acc[key] }, value);
      }
    }
    return acc;
  };
  const output = reduce({ ...previous }, item.choices[0]!.delta) as ChatCompletionMessage;
  return { output, timeToFirstToken, model };
}

/**
 * Update the trace log with the provided data.
 * @param traceLog The trace log.
 * @param data The data to update the trace log with.
 */
export function updateTraceLog(traceLog: TraceLog, data: { [key: string]: any }): void {
  for (const key in data) {
    // @ts-ignore
    traceLog[key] = data[key];
  }
}
