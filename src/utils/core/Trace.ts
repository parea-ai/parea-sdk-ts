import { EvalFunction, TraceLog, TraceOptions } from '../../types';
import { genTraceId, toDateTimeString } from '../../helpers';
import { pareaLogger } from '../../parea_logger';

/**
 * Represents a trace for logging and tracking execution of operations.
 */
export class Trace {
  public readonly id: string;
  public readonly name: string;
  public readonly startTime: Date;
  public depth: number;
  public executionOrder: number;
  private parentId?: string;
  private rootId: string;
  private endTime?: Date;
  private children: string[] = [];
  private log: Partial<TraceLog>;
  private evalFuncs: EvalFunction[];
  private isRunningEval: boolean = false;

  /**
   * Creates a new Trace instance.
   * @param name - The name of the trace.
   * @param options - Optional configuration options for the trace.
   * @param parentId - The ID of the parent trace, if any.
   * @param rootId - The ID of the root trace, if any.
   * @param depth - The depth of the trace in the execution tree.
   * @param executionOrder - The order of execution for this trace.
   */
  constructor(
    name: string,
    options?: TraceOptions,
    parentId?: string,
    rootId?: string,
    depth: number = 0,
    executionOrder: number = 0,
  ) {
    this.evalFuncs = options?.evalFuncs || [];
    const { endUserIdentifier, sessionId, deploymentId, ...opts } = options || {};

    this.id = genTraceId();
    this.name = name;
    this.startTime = new Date();
    this.depth = depth;
    this.executionOrder = executionOrder;
    this.parentId = parentId;
    this.rootId = rootId || this.id; // If no root ID is provided, this is the root
    this.log = {
      trace_id: this.id,
      trace_name: name,
      start_timestamp: toDateTimeString(this.startTime),
      depth: this.depth,
      execution_order: this.executionOrder,
      parent_trace_id: this.parentId,
      root_trace_id: this.rootId,
      children: this.children,
      end_user_identifier: endUserIdentifier,
      session_id: sessionId,
      deployment_id: deploymentId,
      ...opts,
    };
  }

  /**
   * Adds a child trace ID to this trace.
   * @param childId - The ID of the child trace to add.
   */
  addChild(childId: string): void {
    this.children.push(childId);
    this.log.children = this.children;
  }

  /**
   * Finalizes the trace by setting the end time, calculating latency, and sending the log.
   */
  finalize(): void {
    this.endTime = new Date();
    this.log.end_timestamp = toDateTimeString(this.endTime);
    this.log.latency = (this.endTime.getTime() - this.startTime.getTime()) / 1000;
    this.sendLog();
  }

  /**
   * Returns the current log data for this trace.
   * @returns The partial TraceLog object.
   */
  getLog(): Partial<TraceLog> {
    return this.log;
  }

  /**
   * Sets the trace as currently running an evaluation function.
   * @param state - Whether the trace is running
   */
  setIsRunningEval(state: boolean): void {
    this.isRunningEval = state;
  }

  /**
   * Returns whether the trace is currently running an evaluation function.
   * @returns Boolean indicating if the trace is running eval.
   */
  getIsRunningEval(): boolean {
    return this.isRunningEval;
  }

  /**
   * Returns the evaluation functions associated with this trace.
   * @returns An array of EvalFunction objects.
   */
  getEvalFuncs(): EvalFunction[] {
    return this.evalFuncs;
  }

  /**
   * Updates the log data with new information.
   * @param data - Partial TraceLog object containing the data to update.
   */
  updateLog(data: Partial<TraceLog>): void {
    this.log = { ...this.log, ...data };
  }

  /**
   * Sends the log data to the pareaLogger for recording.
   * @throws Will log an error to the console if there's an issue recording or initiating the log.
   */
  sendLog(): void {
    try {
      pareaLogger.recordLog(this.log as TraceLog).catch((e) => {
        console.error(`Error recording log for trace ${this.log.trace_id}: ${e}`);
      });
    } catch (e) {
      console.error(`Error initiating log recording for trace ${this.log.trace_id}: ${e}`);
    }
  }
}
