import { ITraceLog } from '../types';

/**
 * Represents a message queue for storing and processing trace logs.
 */
export class MessageQueue {
  private static queue: ITraceLog[] = [];

  /**
   * Enqueues a trace log into the message queue.
   * @param traceLog The trace log to enqueue.
   */
  public static enqueue(traceLog: ITraceLog): void {
    MessageQueue.queue.push(traceLog);
  }

  /**
   * Dequeues a trace log from the message queue.
   * @returns The dequeued trace log, or undefined if the queue is empty.
   */
  public static dequeue(): ITraceLog | undefined {
    return MessageQueue.queue.shift();
  }
}
