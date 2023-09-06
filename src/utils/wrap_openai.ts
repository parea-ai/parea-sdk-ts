import OpenAI from 'openai';
import { LLMInputs, Role } from '../types';
import { pareaLogger } from '../parea_logger';
import { traceContext, traceData, traceInsert } from './trace_utils';
import { genTraceId, toDateTimeString } from '../helpers';

function wrapMethod(method: Function) {
  return async function (this: any, ...args: any[]) {
    const traceId = genTraceId();
    const startTimestamp = new Date();
    let error: string | null = null;
    let status: string | undefined = 'success';
    let response: any = null;
    let endTimestamp: Date | null;

    traceData[traceId] = {
      trace_id: traceId,
      trace_name: 'llm-openai',
      start_timestamp: toDateTimeString(startTimestamp),
      configuration: {
        model: args[0].model,
        provider: 'openai',
        messages: args[0].messages.map((message: any) => ({
          role: Role[message.role as keyof typeof Role],
          content: message.content,
        })),
      } as LLMInputs,
      children: [],
      status: status,
    };

    traceContext.push(traceId);

    if (traceContext.length > 1) {
      const parentTraceId = traceContext[traceContext.length - 2];
      traceData[parentTraceId].children.push(traceId);
    }

    try {
      response = await method.apply(this, args);
      traceInsert(traceId, {
        output: getOutput(response),
        input_tokens: response.usage.prompt_tokens,
        output_tokens: response.usage.completion_tokens,
        total_tokens: response.usage.total_tokens,
        cost: getTotalCost(args[0].model, response.usage.prompt_tokens, response.usage.completion_tokens),
      });
    } catch (err: unknown) {
      if (err instanceof Error) {
        error = err.message;
      } else {
        error = 'An unknown error occurred';
      }
      status = 'error';
      traceInsert(traceId, { error, status });
    } finally {
      endTimestamp = new Date();
      traceInsert(traceId, {
        end_timestamp: toDateTimeString(endTimestamp),
        latency: (endTimestamp.getTime() - startTimestamp.getTime()) / 1000,
        status: status,
      });
      await pareaLogger.recordLog(traceData[traceId]); // log the trace data
      traceContext.pop();
    }

    if (error) {
      throw new Error(error);
    }

    return response;
  };
}

export function patchOpenAI(openai: OpenAI) {
  // @ts-ignore
  openai.chat.completions.create = wrapMethod(openai.chat.completions.create, 'openai.chat.completions.create');
}

const MODEL_COST_MAPPING: { [key: string]: number } = {
  'gpt-4': 0.03,
  'gpt-4-0314': 0.03,
  'gpt-4-0613': 0.03,
  'gpt-4-completion': 0.06,
  'gpt-4-0314-completion': 0.06,
  'gpt-4-0613-completion': 0.06,
  'gpt-4-32k': 0.06,
  'gpt-4-32k-0314': 0.06,
  'gpt-4-32k-0613': 0.06,
  'gpt-4-32k-completion': 0.12,
  'gpt-4-32k-0314-completion': 0.12,
  'gpt-4-32k-0613-completion': 0.12,
  'gpt-3.5-turbo': 0.0015,
  'gpt-3.5-turbo-0301': 0.0015,
  'gpt-3.5-turbo-0613': 0.0015,
  'gpt-3.5-turbo-16k': 0.003,
  'gpt-3.5-turbo-16k-0613': 0.003,
  'gpt-3.5-turbo-completion': 0.002,
  'gpt-3.5-turbo-0301-completion': 0.002,
  'gpt-3.5-turbo-0613-completion': 0.004,
  'gpt-3.5-turbo-16k-completion': 0.004,
  'gpt-3.5-turbo-16k-0613-completion': 0.004,
};

function getModelCost(modelName: string, isCompletion: boolean = false): number {
  modelName = modelName.toLowerCase();

  if (modelName.startsWith('gpt-4') && isCompletion) {
    modelName += '-completion';
  }

  const cost = MODEL_COST_MAPPING[modelName];
  if (cost === undefined) {
    throw new Error(
      `Unknown model: ${modelName}. Please provide a valid OpenAI model name. Known models are: ${Object.keys(
        MODEL_COST_MAPPING,
      ).join(', ')}`,
    );
  }

  return cost;
}

function getTotalCost(modelName: string, promptTokens: number, completionTokens: number): number {
  const modelRate = getModelCost(modelName);
  const modelCompletionRate = getModelCost(modelName, true);
  const completionCost = modelCompletionRate * (completionTokens / 1000);
  const promptCost = modelRate * (promptTokens / 1000);
  return promptCost + completionCost;
}

function getOutput(result: any): string {
  const responseMessage = result.choices[0]?.message;
  let completion: string = '';
  if (responseMessage.hasOwnProperty('function_call')) {
    completion = formatFunctionCall(responseMessage);
  } else {
    completion = responseMessage?.content.trim() ?? '';
  }
  return completion;
}

function formatFunctionCall(responseMessage: any): string {
  const functionName = responseMessage['function_call']['name'];
  let functionArgs: any;
  if (responseMessage['function_call']['arguments'] instanceof Object) {
    functionArgs = responseMessage['function_call']['arguments'];
  } else {
    functionArgs = JSON.parse(responseMessage['function_call']['arguments']);
  }
  return `\`\`\`${JSON.stringify({ name: functionName, arguments: functionArgs }, null, 4)}\`\`\``;
}
