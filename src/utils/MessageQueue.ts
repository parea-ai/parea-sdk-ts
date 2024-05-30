import { TraceLog } from '../types';
import { pareaLogger } from '../parea_logger';

/**
 * Represents a message queue for storing and processing trace logs.
 */
export class MessageQueue {
  private static queue: TraceLog[] = [];

  /**
   * Enqueues a trace log into the message queue.
   * @param traceLog The trace log to enqueue.
   */
  public static enqueue(traceLog: TraceLog): void {
    MessageQueue.queue.push(traceLog);
  }

  /**
   * Dequeues a trace log from the message queue.
   * @returns The dequeued trace log, or undefined if the queue is empty.
   */
  public static dequeue(): TraceLog | undefined {
    return MessageQueue.queue.shift();
  }

  /**
   * Sends a trace log immediately.
   * @param traceLog The trace log to send.
   */
  public static sendImmediately(traceLog: TraceLog): void {
    pareaLogger.recordLog(traceLog);
  }
}
