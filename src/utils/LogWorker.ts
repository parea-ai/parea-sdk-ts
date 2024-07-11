import { MessageQueue } from './MessageQueue';
import { TraceLog } from '../types';
import { LogBatcher } from './LogBatcher';
import { pareaLogger } from '../parea_logger';

/**
 * Represents a worker that consumes trace logs from the message queue and sends them to the endpoint.
 */
export class LogWorker {
  batcher: LogBatcher;
  private readonly retryCount: number;
  private readonly retryDelay: number;

  /**
   * Creates a new instance of the LogWorker.
   * @param retryCount The maximum number of retries for failed requests.
   * @param retryDelay The delay (in milliseconds) between retries.
   */
  constructor(retryCount: number = 3, retryDelay: number = 1000) {
    this.retryCount = retryCount;
    this.retryDelay = retryDelay;
    this.batcher = new LogBatcher(this.sendBatch.bind(this));
  }

  /**
   * Starts the log worker to consume trace logs from the message queue.
   */
  public start(): void {
    setInterval(() => {
      const traceLog = MessageQueue.dequeue();
      if (traceLog) {
        this.batcher.addTracelog(traceLog);
      }
    }, 1000);
  }

  /**
   * Sends a batch of trace logs to the endpoint with retry logic.
   * @param batch The batch of trace logs to send.
   */
  private async sendBatch(batch: TraceLog[]): Promise<void> {
    let retries = 0;

    while (retries <= this.retryCount) {
      try {
        for (const traceLog of batch) {
          await pareaLogger.recordLog(traceLog);
        }
        break;
      } catch (error) {
        retries++;
        console.error(`Error sending batch (attempt ${retries}):`, error);

        if (retries <= this.retryCount) {
          await new Promise((resolve) => setTimeout(resolve, this.retryDelay));
        } else {
          console.error(`Failed to send batch after ${this.retryCount} retries.`);
        }
      }
    }
  }
}
