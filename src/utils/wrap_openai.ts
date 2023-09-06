import OpenAI from 'openai';
import { LLMInputs, Role, TraceLog } from '../types';
import { pareaLogger } from '../parea_logger';
import { getCurrentTraceId } from './trace_utils';
import { genTraceId, toDateTimeString } from '../helpers';

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

function wrapMethod(method: Function) {
  return async function (this: any, ...args: any[]) {
    const traceId = getCurrentTraceId() || genTraceId();
    const startTimestamp = new Date();
    let error: string | null = null;
    let status: string | undefined = undefined;
    let response: any = null;
    let endTimestamp: Date | null;

    const traceData: TraceLog = {
      trace_id: traceId,
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
    };

    try {
      response = await method.apply(this, args);
      traceData.output = response.choices[0]?.message?.content ?? '';
      traceData.input_tokens = response.usage.prompt_tokens;
      traceData.output_tokens = response.usage.completion_tokens;
      traceData.total_tokens = response.usage.total_tokens;
      const modelRate = getModelCost(args[0].model);
      const modelCompletionRate = getModelCost(args[0].model, true);
      const completionCost = modelCompletionRate * (response.usage.completion_tokens / 1000);
      const promptCost = modelRate * (response.usage.prompt_tokens / 1000);
      traceData.cost = promptCost + completionCost;
      status = 'success';
    } catch (err: unknown) {
      if (err instanceof Error) {
        error = err.message;
      } else {
        error = 'An unknown error occurred';
      }
      status = 'error';
    } finally {
      endTimestamp = new Date();
      traceData.end_timestamp = toDateTimeString(endTimestamp);
      traceData.latency = (endTimestamp.getTime() - startTimestamp.getTime()) / 1000;
      traceData.status = status;
      if (error) {
        traceData.error = error;
      }
      await pareaLogger.recordLog(traceData);
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
