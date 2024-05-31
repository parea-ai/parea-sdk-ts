import { TraceLog } from '../types';

/**
 * Represents a batcher that accumulates trace logs and sends them in batches.
 */
export class LogBatcher {
  private batchSize: number;
  private batchInterval: number;
  private batchQueue: TraceLog[] = [];
  private timer: NodeJS.Timeout | null = null;
  private onBatchReady: (batch: TraceLog[]) => void;

  /**
   * Creates a new instance of the LogBatcher.
   * @param onBatchReady Callback function to be invoked when a batch is ready to be sent.
   * @param batchSize The maximum number of trace logs in a batch.
   * @param batchInterval The interval (in milliseconds) at which to send batches.
   */
  constructor(onBatchReady: (batch: TraceLog[]) => void, batchSize: number = 100, batchInterval: number = 1000) {
    this.onBatchReady = onBatchReady;
    this.batchSize = batchSize;
    this.batchInterval = batchInterval;
  }

  /**
   * Adds a trace log to the batch queue.
   * @param traceLog The trace log to add to the batch.
   */
  public addTracelog(traceLog: TraceLog): void {
    this.batchQueue.push(traceLog);

    if (this.batchQueue.length >= this.batchSize) {
      this.flush();
    } else if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), this.batchInterval);
    }
  }

  /**
   * Flushes the current batch queue and sends the batch to the callback function.
   */
  private flush(): void {
    if (this.batchQueue.length === 0) {
      return;
    }

    const batch = this.batchQueue;
    this.batchQueue = [];
    clearTimeout(this.timer!);
    this.timer = null;

    this.onBatchReady(batch);
  }
}
