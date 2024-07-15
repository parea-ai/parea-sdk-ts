import { ChatCompletionMessage } from 'openai/src/resources/chat/completions';
import { LLMInputs } from '../../types';
import { Trace } from './Trace';
import { toDateTimeString } from '../../helpers';

interface StreamingResult {
  output: {
    index: number;
    message: ChatCompletionMessage;
    logprobs: null;
    finish_reason?: string;
  }[];
  metrics: Record<string, number>;
}

export class StreamHandler<Item> {
  private trace: Trace;
  private configuration: LLMInputs | undefined;

  constructor(trace: Trace, configuration?: LLMInputs) {
    this.trace = trace;
    this.configuration = configuration;
  }

  handle(result: AsyncIterable<Item>): ReadableStream {
    let timeToFirstToken: number | undefined;
    let responseModel: string | undefined;
    const allResults: any[] = [];

    return new ReadableStream({
      start: async (controller) => {
        const now = new Date();
        try {
          for await (const chunk of result) {
            if (!timeToFirstToken) {
              timeToFirstToken = (now.getTime() - this.trace.startTime.getTime()) / 1000;
            }
            if (!responseModel && (chunk as any).model) {
              responseModel = (chunk as any).model;
            }
            allResults.push(chunk);
            controller.enqueue(chunk);
          }
        } catch (error) {
          console.error('Error processing stream:', error);
          controller.error(error);
        } finally {
          controller.close();
          this.finalizeTrace(allResults, timeToFirstToken, responseModel);
        }
      },
    });
  }

  private finalizeTrace(allResults: any[], timeToFirstToken?: number, responseModel?: string): void {
    const endTimestamp = new Date();
    if (this.configuration && responseModel) {
      this.configuration.model = responseModel;
    }

    const { output, metrics } = this.postprocessStreamingResults(allResults);

    this.trace.updateLog({
      output: JSON.stringify(output[0]?.message),
      time_to_first_token: timeToFirstToken,
      end_timestamp: toDateTimeString(endTimestamp),
      latency: (endTimestamp.getTime() - this.trace.startTime.getTime()) / 1000,
      configuration: this.configuration,
      input_tokens: metrics.prompt_tokens,
      output_tokens: metrics.completion_tokens,
      total_tokens: metrics.tokens,
    });
    // fire and forget
    // noinspection JSIgnoredPromiseFromCall
    this.trace.sendLog();
  }

  private postprocessStreamingResults(results: any[]): StreamingResult {
    let role: string | undefined;
    let content: string | undefined;
    let tool_calls: any[] | undefined;
    let finish_reason: string | undefined;
    let metrics: Record<string, number> = {};

    for (const result of results) {
      if (result.usage) {
        metrics = {
          ...metrics,
          tokens: result.usage.total_tokens,
          prompt_tokens: result.usage.prompt_tokens,
          completion_tokens: result.usage.completion_tokens,
        };
      }

      const delta = result.choices?.[0]?.delta;
      if (!delta) {
        continue;
      }

      if (!role && delta.role) {
        role = delta.role;
      }

      if (delta.finish_reason) {
        finish_reason = delta.finish_reason;
      }

      if (delta.content) {
        content = (content || '') + delta.content;
      }

      if (delta.tool_calls) {
        if (!tool_calls) {
          tool_calls = [
            {
              id: delta.tool_calls[0].id,
              type: delta.tool_calls[0].type,
              function: delta.tool_calls[0].function,
            },
          ];
        } else {
          tool_calls[0].function.arguments += delta.tool_calls[0].function.arguments;
        }
      }
    }

    return {
      metrics,
      output: [
        {
          index: 0,
          message: {
            role,
            content,
            tool_calls,
          } as ChatCompletionMessage,
          logprobs: null,
          finish_reason,
        },
      ],
    };
  }
}
