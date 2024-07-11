import { TraceLog } from '../types';
import { MessageQueue } from './MessageQueue';
import { toDateTimeString } from '../helpers';
import { ChatCompletionMessage } from 'openai/src/resources/chat/completions';
import { getOutput, messageReducer } from './helpers';

/**
 * Represents a handler for processing stream responses.
 */
export class StreamHandler<Item> {
  private result: AsyncIterable<Item>;
  private traceLog: TraceLog;
  private outputStream: TransformStream;
  private writer: WritableStreamDefaultWriter;
  private message: ChatCompletionMessage;
  private timeToFirstToken: number | undefined;
  private startTimestamp: Date;
  private responseModel: string | undefined;

  /**
   * Creates a new instance of the StreamHandler.
   * @param result The stream result to be processed.
   * @param traceLog The trace log associated with the stream.
   * @param startTimestamp The start timestamp of the stream.
   */
  constructor(result: AsyncIterable<Item>, traceLog: TraceLog, startTimestamp: Date) {
    this.result = result;
    this.traceLog = traceLog;
    this.outputStream = new TransformStream();
    this.writer = this.outputStream.writable.getWriter();
    this.message = {} as ChatCompletionMessage;
    this.startTimestamp = startTimestamp;
  }

  /**
   * Handles the stream response and returns the readable stream.
   * @returns The readable stream.
   */
  public async handle(): Promise<ReadableStream> {
    const startTime = this.startTimestamp.getTime() / 1000;

    try {
      // fire and forget
      // noinspection ES6MissingAwait
      (async () => {
        for await (const chunk of this.result) {
          const { output, timeToFirstToken, model } = messageReducer(this.message, chunk, startTime);
          this.message = output;
          if (!this.timeToFirstToken) {
            this.timeToFirstToken = timeToFirstToken;
          }
          if (!this.responseModel && model) {
            this.responseModel = model;
          }
          await this.writer.write(chunk);
        }
        await this.writer.close();
        const endTimestamp = new Date();
        this.traceLog.output = getOutput({ choices: [{ message: this.message }] });
        this.traceLog.time_to_first_token = this.timeToFirstToken;
        this.traceLog.end_timestamp = toDateTimeString(endTimestamp);
        this.traceLog.latency = (endTimestamp.getTime() - this.startTimestamp.getTime()) / 1000;
        if (this.traceLog?.configuration) {
          this.traceLog.configuration.model = this.responseModel;
        }
        MessageQueue.enqueue(this.traceLog);
      })();
    } catch (error) {
      console.error('Error processing stream:', error);
    }

    return this.outputStream.readable;
  }
}
