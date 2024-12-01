import { OpenAI } from 'openai';

import { TraceManager } from '../core/TraceManager';
import { LLMInputs, Message, ModelParams, ResponseFormat } from '../../types';
import { StreamHandler } from '../core/StreamHandler';
import { OpenAIMessageConverter } from '../message-converters';
import { MODEL_COST_MAPPING } from '../model-prices';
import { Trace } from '../core/Trace';
import { toDateTimeString } from '../../helpers';
import { ChatCompletionCreateParamsBase, ChatCompletionMessageParam } from 'openai/src/resources/chat/completions';
import { parseChatCompletion } from 'openai/lib/parser';

/**
 * Wrapper class for OpenAI API methods with tracing functionality.
 */
export class OpenAIWrapper {
  private static traceManager: TraceManager = TraceManager.getInstance();
  private static messageConverter: OpenAIMessageConverter = new OpenAIMessageConverter();

  /**
   * Wraps an OpenAI API method with tracing functionality.
   * @param method The method to wrap.
   * @param thisArg The `this` argument for the method.
   * @returns The wrapped method.
   */
  static wrapMethod<T extends (...args: any[]) => any>(method: T, thisArg: any): T {
    return ((...args: Parameters<T>): ReturnType<T> => {
      return this.traceManager.runInContext(() => {
        const traceDisabled = process.env.PAREA_TRACE_ENABLED === 'false';
        const parentTrace = this.traceManager.getCurrentTrace();
        const insideEvalFuncSkipLogging = parentTrace ? parentTrace.getIsRunningEval() : false;
        if (traceDisabled || insideEvalFuncSkipLogging || this.isBetaCall(args)) {
          return method.apply(thisArg, args);
        }

        const configuration = this.extractConfiguration(args);
        const traceName = configuration?.model ? `llm-${configuration.model}` : 'llm-openai';

        const trace = this.traceManager.createTrace(traceName, {}, true);

        const result = method.apply(thisArg, args);

        if (result instanceof Promise) {
          return result.then(
            (value) => {
              if (this.isStreamingEnabled(args)) {
                const streamHandler = new StreamHandler(trace, configuration);
                return streamHandler.handle(value);
              } else {
                this.finalizeTrace(trace, configuration, value);
                return value;
              }
            },
            (error) => {
              this.finalizeTrace(trace, configuration, undefined, error);
              throw error;
            },
          ) as ReturnType<T>;
        } else {
          this.finalizeTrace(trace, configuration, result);
          return result;
        }
      });
    }) as T;
  }

  /**
   * Wraps the `beta.chat.completions.parse` method with tracing functionality.
   * @param method The method to wrap.
   * @param thisArg The `this` argument for the method.
   * @returns The wrapped method.
   */
  static wrapBetaParse<T extends (...args: any[]) => any>(method: T, thisArg: any): T {
    return ((...args: Parameters<T>): ReturnType<T> => {
      const traceDisabled = process.env.PAREA_TRACE_ENABLED === 'false';
      const parentTrace = this.traceManager.getCurrentTrace();
      const insideEvalFuncSkipLogging = parentTrace ? parentTrace.getIsRunningEval() : false;
      if (traceDisabled || insideEvalFuncSkipLogging) {
        return method.apply(thisArg, args);
      }

      const configuration = this.extractConfiguration(args);
      const traceName = configuration?.model ? `llm-${configuration.model}` : 'llm-openai-beta-parse';

      const trace = this.traceManager.createTrace(traceName, {}, true);

      try {
        // Get the original create result
        const createResult = thisArg._client.chat.completions.create(args[0], {
          ...args[1],
          headers: {
            ...args[1]?.headers,
            'X-Stainless-Helper-Method': 'beta.chat.completions.parse',
          },
        });

        return createResult
          .then((completion: any) => {
            const parsedResult = parseChatCompletion(completion, args[0]);
            this.finalizeTrace(trace, configuration, parsedResult);
            return parsedResult;
          })
          .catch((error: any) => {
            this.finalizeTrace(trace, configuration, undefined, error);
            throw error;
          });
      } catch (error) {
        this.finalizeTrace(trace, configuration, undefined, error);
        throw error;
      }
    }) as T;
  }

  /**
   * Checks if streaming is enabled in the given arguments.
   * @param args The arguments to check.
   * @returns True if streaming is enabled, false otherwise.
   */
  private static isStreamingEnabled(args: any[]): boolean {
    return args[0]?.stream === true;
  }

  /**
   * Checks if trace was invoked from `beta.chat.completions.parse` method.
   * @param args The arguments to check.
   * @returns True if trace was invoked from `beta.chat.completions.parse` method, false otherwise.
   */
  private static isBetaCall(args: any[]): boolean {
    if (!Array.isArray(args) || args.length < 2) {
      return false;
    }
    return args[1]?.headers?.['X-Stainless-Helper-Method'] === 'beta.chat.completions.parse';
  }

  /**
   * Finalizes the trace with the given parameters.
   * @param trace The trace to finalize.
   * @param configuration The LLM configuration.
   * @param result The result of the API call.
   * @param error Optional error if the API call failed.
   */
  private static finalizeTrace(trace: Trace, configuration: LLMInputs, result: any, error?: any): void {
    const endTime = new Date();
    const end_timestamp = toDateTimeString(endTime);
    const latency = (endTime.getTime() - trace.startTime.getTime()) / 1000;
    const output = result ? this.getOutput(result) : undefined;
    const status = error ? 'error' : 'success';
    if (result?.model) {
      configuration.model = result?.model;
    }

    trace.updateLog({
      configuration,
      output,
      status,
      latency,
      end_timestamp,
      error: typeof error === 'string' ? error : error?.toString(),
      input_tokens: result?.usage?.prompt_tokens ?? 0,
      output_tokens: result?.usage?.completion_tokens ?? 0,
      total_tokens: result?.usage?.total_tokens ?? 0,
      cost: this.calculateCost(configuration?.model, result?.usage),
    });

    this.traceManager.finalizeTrace(trace, true);
  }

  /**
   * Extracts the LLM configuration from the given arguments.
   * @param args The arguments to extract the configuration from.
   * @returns The extracted LLM configuration.
   */
  private static extractConfiguration(args: any[]): LLMInputs {
    try {
      const [options] = args;
      const inputs: ChatCompletionCreateParamsBase = options;
      const functions = inputs?.functions || inputs?.tools?.map((tool) => tool?.function) || [];
      const functionCallDefault = functions?.length > 0 ? 'auto' : null;

      const modelParams: ModelParams = {
        temp: inputs.temperature ?? 1.0,
        max_length: inputs.max_tokens || undefined,
        top_p: inputs.top_p ?? 1.0,
        frequency_penalty: inputs.frequency_penalty ?? 0.0,
        presence_penalty: inputs.presence_penalty ?? 0.0,
        response_format: inputs?.response_format as ResponseFormat | null,
      };

      return {
        model: inputs?.model,
        messages: this.getMessages(inputs),
        functions: functions,
        function_call: options?.function_call || options?.tool_choice || functionCallDefault,
        model_params: modelParams,
      };
    } catch (e) {
      console.error('Error extracting configuration:', e);
      return {};
    }
  }

  /**
   * Calculates the cost of the API call based on the model and usage.
   * @param model The model used for the API call.
   * @param usage The token usage information.
   * @returns The calculated cost.
   */
  private static calculateCost(
    model: string | undefined,
    usage?: {
      prompt_tokens: number;
      completion_tokens: number;
    },
  ): number {
    if (!model) {
      console.error(
        `Unknown model: ${model}. Please provide a valid OpenAI model name. Known models are: ${Object.keys(
          MODEL_COST_MAPPING,
        ).join(', ')}`,
      );
      return 0;
    }
    if (!usage) {
      return 0;
    }
    const modelCost = MODEL_COST_MAPPING[model] || { prompt: 0, completion: 0 };
    const promptCost = usage?.prompt_tokens * modelCost.prompt;
    const completionCost = usage?.completion_tokens * modelCost.completion;
    return (promptCost + completionCost) / 1000000;
  }

  /**
   * Extracts the output from the API result.
   * @param result The API result.
   * @returns The extracted output as a string.
   */
  private static getOutput(result: any): string {
    try {
      const responseMessage = result?.choices[0]?.message;
      if (responseMessage) {
        return this.messageConverter.convert(responseMessage).content;
      } else {
        return JSON.stringify(result);
      }
    } catch (e) {
      console.error('Error extracting output:', e);
      return `${result}`;
    }
  }

  /**
   * Extracts the messages from OpenAi args.
   * @param inputs The inputs to extract messages from.
   * @returns The extracted messages.
   */
  private static getMessages(inputs: any): Message[] {
    try {
      return inputs?.messages?.map((message: ChatCompletionMessageParam) => this.messageConverter.convert(message));
    } catch (e) {
      console.error(`Error extracting messages from: ${inputs}`, e);
      return [];
    }
  }
}

/**
 * Patches an OpenAI instance with tracing functionality.
 * @param openai The OpenAI instance to patch.
 */
export function patchOpenAI(openai: OpenAI): void {
  const originalCreate = openai.chat.completions.create;
  openai.chat.completions.create = OpenAIWrapper.wrapMethod(
    originalCreate,
    openai.chat.completions,
  ) as typeof originalCreate;

  if (openai.beta?.chat?.completions?.parse) {
    const originalParse = openai.beta.chat.completions.parse;
    openai.beta.chat.completions.parse = OpenAIWrapper.wrapBetaParse(
      originalParse,
      openai.beta.chat.completions,
    ) as typeof originalParse;
  }
}
