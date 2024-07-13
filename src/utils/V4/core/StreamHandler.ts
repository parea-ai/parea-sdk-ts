import { Trace } from './TraceManager';
import { ChatCompletionMessage } from 'openai/src/resources/chat/completions';
import { LLMInputs } from '../../../types';

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
  private outputStream: TransformStream;
  private writer: WritableStreamDefaultWriter;
  private allResults: any[] = [];
  private timeToFirstToken: number | undefined;
  private startTimestamp: number;
  private responseModel: string | undefined;
  private configuration: LLMInputs | undefined;

  constructor(trace: Trace, configuration?: LLMInputs) {
    this.trace = trace;
    this.outputStream = new TransformStream();
    this.writer = this.outputStream.writable.getWriter();
    this.startTimestamp = Date.now();
    this.configuration = configuration;
  }

  async handle(result: AsyncIterable<Item>): Promise<ReadableStream> {
    try {
      for await (const chunk of result) {
        this.allResults.push(chunk);
        if (!this.timeToFirstToken) {
          this.timeToFirstToken = Date.now() - this.startTimestamp;
        }
        if (!this.responseModel && (chunk as any).model) {
          this.responseModel = (chunk as any).model;
        }
        await this.writer.write(chunk);
      }
      await this.writer.close();
      this.finalizeTrace();
    } catch (error) {
      console.error('Error processing stream:', error);
      this.trace.updateLog({ error: (error as Error).toString(), status: 'error' });
    }

    return this.outputStream.readable;
  }

  private finalizeTrace(): void {
    const endTimestamp = Date.now();
    if (this.configuration && this.responseModel) {
      this.configuration.model = this.responseModel;
    }

    const { output, metrics } = this.postprocessStreamingResults();

    this.trace.updateLog({
      output: JSON.stringify(output[0]?.message),
      time_to_first_token: this.timeToFirstToken,
      end_timestamp: new Date(endTimestamp).toISOString(),
      latency: (endTimestamp - this.startTimestamp) / 1000,
      configuration: this.configuration,
      input_tokens: metrics.prompt_tokens,
      output_tokens: metrics.completion_tokens,
      total_tokens: metrics.tokens,
    });
  }

  private postprocessStreamingResults(): StreamingResult {
    let role: string | undefined;
    let content: string | undefined;
    let tool_calls: any[] | undefined;
    let finish_reason: string | undefined;
    let metrics: Record<string, number> = {};

    for (const result of this.allResults) {
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
