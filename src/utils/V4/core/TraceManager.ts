import { AsyncLocalStorage } from 'node:async_hooks';
import { TraceLog, TraceOptions } from '../../../types';
import { genTraceId, toDateTimeString } from '../../../helpers';
import { EvalFunction, EvaluationHandler } from './EvaluationHandler';
import { pareaLogger } from '../../../parea_logger';

/**
 * Represents a trace in the system.
 */
export class Trace {
  public readonly id: string;
  public readonly name: string;
  public readonly startTime: Date;
  private endTime?: Date;
  private children: string[] = [];
  private log: Partial<TraceLog>;

  constructor(name: string, options?: TraceOptions) {
    this.id = genTraceId();
    this.name = name;
    this.startTime = new Date();
    this.log = {
      trace_id: this.id,
      trace_name: name,
      start_timestamp: toDateTimeString(this.startTime),
      ...options,
    };
  }

  /**
   * Adds a child trace to this trace.
   * @param childId The ID of the child trace.
   */
  addChild(childId: string): void {
    this.children.push(childId);
  }

  /**
   * Finalizes the trace by setting its end time and updating the log.
   */
  finalize(): void {
    this.endTime = new Date();
    this.log.end_timestamp = toDateTimeString(this.endTime);
    this.log.latency = (this.endTime.getTime() - this.startTime.getTime()) / 1000;
    this.log.children = this.children;
    this.sendLog();
  }

  /**
   * Gets the current trace log.
   */
  getLog(): Partial<TraceLog> {
    return this.log;
  }

  /**
   * Updates the trace log with new data.
   * @param data The data to update the log with.
   */
  updateLog(data: Partial<TraceLog>): void {
    this.log = { ...this.log, ...data };
  }

  sendLog(): void {
    try {
      pareaLogger.recordLog(this.log as TraceLog).catch((e) => {
        console.error(`Error recording log for trace ${this.log?.trace_id}: ${e}`);
      });
    } catch (e) {
      console.error(`Error initiating log recording for trace ${this.log?.trace_id}: ${e}`);
    }
  }
}

/**
 * Manages the creation, updating, and finalization of traces.
 */
export class TraceManager {
  private static instance: TraceManager;
  private context: AsyncLocalStorage<Map<string, Trace>>;
  private evaluationHandler: EvaluationHandler | null = null;

  private constructor() {
    this.context = new AsyncLocalStorage<Map<string, Trace>>();
  }

  public static getInstance(): TraceManager {
    if (!TraceManager.instance) {
      TraceManager.instance = new TraceManager();
    }
    return TraceManager.instance;
  }

  /**
   * Creates a new trace and adds it to the current context.
   * @param name The name of the trace.
   * @param options Additional options for the trace.
   * @returns The created trace.
   */
  createTrace(name: string, options?: TraceOptions): Trace {
    const parentTrace = this.getCurrentTrace();
    const trace = new Trace(name, options);

    if (parentTrace) {
      trace.updateLog({
        parent_trace_id: parentTrace.id,
        root_trace_id: parentTrace.getLog().root_trace_id || parentTrace.id,
      });
      parentTrace.addChild(trace.id);
    } else {
      trace.updateLog({ root_trace_id: trace.id });
    }

    this.context.getStore()?.set(trace.id, trace);
    return trace;
  }

  setEvalFuncs(evalFuncs: EvalFunction[]): void {
    this.evaluationHandler = new EvaluationHandler(evalFuncs);
  }

  /**
   * Finalizes a trace and removes it from the current context.
   * @param trace The trace to finalize.
   * @param skipEvals
   */
  async finalizeTrace(trace: Trace, skipEvals: boolean = false): Promise<void> {
    if (!skipEvals && this.evaluationHandler && this.shouldRunEvaluation(trace)) {
      const scores = await this.evaluationHandler.runEvaluations(trace.getLog() as TraceLog);
      trace.updateLog({ scores });
      trace.finalize();
    } else {
      trace.finalize();
    }

    this.context.getStore()?.delete(trace.id);
  }

  /**
   * Sets the output for a trace, applying the accessOutputOfFunc if provided.
   * @param trace The trace to set the output for.
   * @param value The output value.
   * @param accessOutputOfFunc Optional function to modify the output.
   */
  setTraceOutput(trace: Trace, value: any, accessOutputOfFunc?: (arg0: any) => string): void {
    let outputForEvalMetrics: string | undefined;

    if (accessOutputOfFunc) {
      try {
        outputForEvalMetrics = accessOutputOfFunc(value);
      } catch (e) {
        console.error(`Error accessing output of func with output: ${value}. Error: ${e}`, e);
      }
    }

    const _value = outputForEvalMetrics || value;
    const output = typeof _value === 'string' ? _value : JSON.stringify(_value);

    trace.updateLog({
      output,
      output_for_eval_metrics: outputForEvalMetrics,
    });
  }

  /**
   * Gets the current trace from the context.
   * @returns The current trace, or undefined if there is no current trace.
   */
  getCurrentTrace(): Trace | undefined {
    const store = this.context.getStore();
    return store ? Array.from(store.values())[store.size - 1] : undefined;
  }

  /**
   * Inserts data into the trace log for the current or specified trace.
   * @param data The data to insert into the trace log.
   * @param traceId The ID of the trace to insert data into. If not provided, uses the current trace.
   */
  insertTraceData(data: Partial<TraceLog>, traceId?: string): void {
    const store = this.context.getStore();
    if (!store) {
      console.warn('No active store found for traceInsert.');
      return;
    }

    const trace = traceId ? store.get(traceId) : this.getCurrentTrace();
    if (!trace) {
      console.warn(`No trace found for traceId ${traceId || 'current'}.`);
      return;
    }

    const currentLog = trace.getLog();
    const updatedLog = { ...currentLog };

    for (const [key, newValue] of Object.entries(data)) {
      const existingValue = currentLog[key as keyof TraceLog];
      updatedLog[key as keyof TraceLog] = existingValue ? this.merge(existingValue, newValue) : newValue;
    }

    trace.updateLog(updatedLog);
  }

  private shouldRunEvaluation(trace: Trace): boolean {
    const applyEvalFrac = trace.getLog().apply_eval_frac;
    return applyEvalFrac === undefined || Math.random() < applyEvalFrac;
  }

  private merge = (old: any, newValue: any) => {
    if (typeof old === 'object' && typeof newValue === 'object') {
      return { ...old, ...newValue };
    }
    if (Array.isArray(old) && Array.isArray(newValue)) {
      return [...old, ...newValue];
    }
    return newValue;
  };
}
