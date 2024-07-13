import { TraceId } from './types';
import { Tracer } from './tracer';
import { OpenAIMessageConverter } from './message-converters';

export class StreamHandler {
  private tracer: Tracer;
  private messageConverter: OpenAIMessageConverter;
  private traceId: TraceId;
  private startTime: number;

  constructor(tracer: Tracer, messageConverter: OpenAIMessageConverter, traceId: TraceId) {
    this.tracer = tracer;
    this.messageConverter = messageConverter;
    this.traceId = traceId;
    this.startTime = Date.now();
  }

  async *handleStream(stream: AsyncIterable<any>): AsyncGenerator<any, void, unknown> {
    let fullMessage = '';
    let timeToFirstToken: number | undefined;
    let model: string | undefined;

    for await (const chunk of stream) {
      if (!timeToFirstToken) {
        timeToFirstToken = (Date.now() - this.startTime) / 1000;
      }

      if (chunk.model && !model) {
        model = chunk.model;
      }

      if (chunk.choices && chunk.choices[0].delta.content) {
        fullMessage += chunk.choices[0].delta.content;
      }

      yield chunk;
    }

    const traceLog = this.tracer.getTraceLog(this.traceId);
    if (traceLog) {
      const output = this.messageConverter.convert({ role: 'assistant', content: fullMessage });
      this.tracer.updateTrace(this.traceId, {
        output: output.content,
        time_to_first_token: timeToFirstToken,
        configuration: {
          ...traceLog.configuration,
          model: model || traceLog.configuration?.model,
        },
      });
    }

    this.tracer.endTrace(this.traceId);
  }
}
