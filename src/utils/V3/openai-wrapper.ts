import OpenAI from 'openai';
import { Tracer } from './tracer';
import { OpenAIMessageConverter } from './message-converters';
import { OpenAICostCalculator } from './cost-calculator';
import { PareaConfiguration } from './configuration';
import { TraceId } from './types';
import { LLMInputs } from '../../types';
import { StreamHandler } from './stream-handler';
import { getOrCreateTraceContext } from './shared-context';

export class OpenAIWrapper {
  private tracer: Tracer;
  private messageConverter: OpenAIMessageConverter;
  private costCalculator: OpenAICostCalculator;

  constructor() {
    const config = new PareaConfiguration();
    this.tracer = new Tracer(config);
    this.messageConverter = new OpenAIMessageConverter();
    this.costCalculator = new OpenAICostCalculator();
  }

  wrapMethod<T extends (...args: any[]) => any>(method: T, thisArg: any): T {
    return ((...args: Parameters<T>): ReturnType<T> => {
      getOrCreateTraceContext();
      const kwargs = args[0];
      const configuration = this.prepareConfiguration(kwargs);
      const traceName = configuration?.model ? `llm-${configuration.model}` : 'llm';

      const traceId = this.tracer.startTrace({
        trace_name: traceName,
        configuration,
      });

      const originalPromise = method.apply(thisArg, args);

      if (kwargs.stream) {
        return this.handleStreamResponse(originalPromise, traceId) as ReturnType<T>;
      } else {
        return this.handleNonStreamResponse(originalPromise, traceId, configuration) as ReturnType<T>;
      }
    }) as T;
  }

  private async handleStreamResponse(
    originalPromise: Promise<AsyncIterable<any>>,
    traceId: TraceId,
  ): Promise<AsyncIterable<any>> {
    const stream = await originalPromise;
    const streamHandler = new StreamHandler(this.tracer, this.messageConverter, traceId);
    return streamHandler.handleStream(stream);
  }

  private async handleNonStreamResponse(
    originalPromise: Promise<any>,
    traceId: TraceId,
    configuration: LLMInputs,
  ): Promise<any> {
    try {
      const response = await originalPromise;
      this.processResponse(traceId, response, configuration);
      return response;
    } catch (error) {
      this.handleError(traceId, error);
      throw error;
    } finally {
      this.tracer.endTrace(traceId);
    }
  }

  private prepareConfiguration(kwargs: any): LLMInputs {
    const functions = kwargs?.functions || kwargs?.tools?.map((tool: any) => tool?.function) || [];
    const functionCallDefault = functions?.length > 0 ? 'auto' : null;

    return {
      model: kwargs?.model,
      provider: 'openai',
      messages: kwargs?.messages?.map((message: any) => this.messageConverter.convert(message)),
      functions: functions,
      function_call: kwargs?.function_call || kwargs?.tool_choice || functionCallDefault,
      model_params: {
        temp: kwargs?.temperature ?? 1.0,
        max_length: kwargs?.max_tokens,
        top_p: kwargs?.top_p ?? 1.0,
        frequency_penalty: kwargs?.frequency_penalty ?? 0.0,
        presence_penalty: kwargs?.presence_penalty ?? 0.0,
        response_format: kwargs?.response_format,
      },
    };
  }

  private processResponse(traceId: TraceId, response: any, configuration: LLMInputs): void {
    if (response?.model) {
      configuration.model = response.model;
    }

    const output = this.getOutput(response);
    const cost = this.costCalculator.calculateCost(
      configuration.model as string,
      response.usage.prompt_tokens,
      response.usage.completion_tokens,
    );

    this.tracer.updateTrace(traceId, {
      output,
      input_tokens: response.usage.prompt_tokens,
      output_tokens: response.usage.completion_tokens,
      total_tokens: response.usage.total_tokens,
      cost,
      configuration,
    });
  }

  private handleError(traceId: TraceId, error: unknown): void {
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    this.tracer.updateTrace(traceId, { error: errorMessage, status: 'error' });
  }

  private getOutput(result: any): string {
    const responseMessage = result?.choices[0]?.message;
    if (responseMessage?.function_call) {
      return this.formatFunctionCall(responseMessage.function_call);
    } else if (responseMessage?.tool_calls) {
      return this.messageConverter.convert(responseMessage).content;
    } else {
      return responseMessage?.content?.trim() ?? '';
    }
  }

  private formatFunctionCall(functionCall: any): string {
    const functionName = functionCall.name;
    const functionArgs = this.parseArgs(functionCall.arguments);
    return `\`\`\`${JSON.stringify({ name: functionName, arguments: functionArgs }, null, 4)}\`\`\``;
  }

  private parseArgs(args: any): any {
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

export function patchOpenAI2(openai: OpenAI): void {
  const wrapper = new OpenAIWrapper();
  openai.chat.completions.create = wrapper.wrapMethod(openai.chat.completions.create, openai.chat.completions);
}
