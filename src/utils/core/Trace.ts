import { EvalFunction, TraceLog, TraceOptions } from '../../types';
import { genTraceId, toDateTimeString } from '../../helpers';
import { pareaLogger } from '../../parea_logger';

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

  addChild(childId: string): void {
    this.children.push(childId);
    this.log.children = this.children;
  }

  finalize(): void {
    this.endTime = new Date();
    this.log.end_timestamp = toDateTimeString(this.endTime);
    this.log.latency = (this.endTime.getTime() - this.startTime.getTime()) / 1000;
    this.sendLog();
  }

  getLog(): Partial<TraceLog> {
    return this.log;
  }

  getEvalFuncs(): EvalFunction[] {
    return this.evalFuncs;
  }

  updateLog(data: Partial<TraceLog>): void {
    this.log = { ...this.log, ...data };
  }

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
