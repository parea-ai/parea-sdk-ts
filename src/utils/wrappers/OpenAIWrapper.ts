import { OpenAI } from 'openai';

import { TraceManager } from '../core/TraceManager';
import { LLMInputs, Message, ModelParams, ResponseFormat } from '../../types';
import { StreamHandler } from '../core/StreamHandler';
import { OpenAIMessageConverter } from '../message-converters';
import { MODEL_COST_MAPPING } from '../model-prices';
import { Trace } from '../core/Trace';
import { toDateTimeString } from '../../helpers';

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
        if (traceDisabled) {
          return method.apply(thisArg, args);
        }

        const configuration = this.extractConfiguration(args);
        const traceName = configuration?.model ? `llm-${configuration.model}` : 'llm';

        const trace = this.traceManager.createTrace(traceName, {});

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
   * Checks if streaming is enabled in the given arguments.
   * @param args The arguments to check.
   * @returns True if streaming is enabled, false otherwise.
   */
  private static isStreamingEnabled(args: any[]): boolean {
    return args[0]?.stream === true;
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

    trace.updateLog({
      configuration,
      output,
      status,
      latency,
      end_timestamp,
      error: error?.toString(),
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
    const [options] = args;

    const functions = options?.functions || options?.tools?.map((tool: any) => tool?.function) || [];
    const functionCallDefault = functions?.length > 0 ? 'auto' : null;

    const modelParams: ModelParams = {
      temp: options.temperature ?? 1.0,
      max_length: options.max_tokens,
      top_p: options.top_p ?? 1.0,
      frequency_penalty: options.frequency_penalty ?? 0.0,
      presence_penalty: options.presence_penalty ?? 0.0,
      response_format: options.response_format as ResponseFormat | null,
    };

    const messages: Message[] = options?.messages?.map((message: any) => this.messageConverter.convert(message));

    return {
      model: options.model,
      provider: 'openai',
      messages: messages,
      functions: functions,
      function_call: options?.function_call || options?.tool_choice || functionCallDefault,
      model_params: modelParams,
    };
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
    if (!model || !Object.keys(MODEL_COST_MAPPING).includes(model)) {
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
    const modelCost = MODEL_COST_MAPPING[model];
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
    const responseMessage = result?.choices[0]?.message;
    if (responseMessage?.function_call) {
      return this.formatFunctionCall(responseMessage.function_call);
    } else if (responseMessage?.tool_calls) {
      return this.messageConverter.convert(responseMessage).content;
    } else {
      return responseMessage?.content?.trim() ?? '';
    }
  }

  /**
   * Formats a function call into a string representation.
   * @param functionCall The function call to format.
   * @returns A formatted string representation of the function call.
   */
  private static formatFunctionCall(functionCall: any): string {
    try {
      const functionName = functionCall.name;
      const functionArgs = this.parseArgs(functionCall.arguments);
      return `\`\`\`${JSON.stringify({ name: functionName, arguments: functionArgs }, null, 4)}\`\`\``;
    } catch (e) {
      console.error(`Error formatting function call: ${e}`);
      return '';
    }
  }

  /**
   * Parses function call arguments.
   * @param args The arguments to parse.
   * @returns The parsed arguments.
   */
  private static parseArgs(args: any): any {
    if (args instanceof Object) {
      return args;
    }
    try {
      return JSON.parse(args);
    } catch (e) {
      console.error(`Error parsing function call arguments as Object, storing as string instead: ${e}`);
      return typeof args === 'string' ? args : `${args}`;
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
}
