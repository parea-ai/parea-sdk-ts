import { AsyncLocalStorage } from 'node:async_hooks';
import { TraceLog, TraceOptions } from '../../types';
import { EvaluationHandler } from './EvaluationHandler';
import { Trace } from './Trace';
import { experimentContext } from '../../experiment/experimentContext';

/**
 * Manages the creation, updating, and finalization of traces.
 * Implements the Singleton pattern for global access.
 */
export class TraceManager {
  private static instance: TraceManager;
  private context: AsyncLocalStorage<Map<string, Trace>>;

  private constructor() {
    this.context = new AsyncLocalStorage<Map<string, Trace>>();
  }

  /**
   * Gets the singleton instance of TraceManager.
   * @returns {TraceManager} The singleton instance of TraceManager.
   */
  public static getInstance(): TraceManager {
    if (!TraceManager.instance) {
      TraceManager.instance = new TraceManager();
    }
    return TraceManager.instance;
  }

  /**
   * Creates a new trace and adds it to the current context.
   * @param {string} name - The name of the trace.
   * @param {TraceOptions} [options] - Optional configuration for the trace.
   * @returns {Trace} The newly created trace.
   */
  createTrace(name: string, options?: TraceOptions): Trace {
    let traceMap = this.context.getStore();
    if (!traceMap) {
      traceMap = new Map();
      this.context.enterWith(traceMap);
    }
    if (!options) options = {};

    const parentTrace = this.getCurrentTrace();
    const rootId = parentTrace ? parentTrace.getLog().root_trace_id : undefined;
    const parentId = parentTrace ? parentTrace.id : undefined;
    const depth = parentTrace ? parentTrace.depth + 1 : 0;
    const executionOrder = traceMap.size;

    const parentTarget = parentTrace ? parentTrace.getLog().target : undefined;
    if (!options?.target && parentTarget) {
      options.target = parentTarget;
    }

    const trace = new Trace(name, options, parentId, rootId, depth, executionOrder);

    if (parentTrace) {
      parentTrace.addChild(trace.id);
    }

    traceMap.set(trace.id, trace);
    return trace;
  }

  /**
   * Finalizes a trace, running evaluations if necessary.
   * @param {Trace} trace - The trace to finalize.
   * @param {boolean} [skipEval=false] - Whether to skip evaluations.
   */
  finalizeTrace(trace: Trace, skipEval: boolean = false): void {
    const traceMap = this.context.getStore();
    if (!traceMap) {
      console.warn('No active context found for finalizeTrace.');
      return;
    }

    const experiment_uuid = process.env.PAREA_OS_ENV_EXPERIMENT_UUID || null;
    trace.updateLog({ experiment_uuid });

    const applyEvalFrac = trace.getLog().apply_eval_frac;
    const shouldRunEval = applyEvalFrac === undefined || Math.random() < applyEvalFrac;

    if (!skipEval && shouldRunEval && trace.getEvalFuncs().length > 0) {
      this.runEvaluationsAsync(trace);
    } else {
      trace.finalize();
    }

    if (!trace.getLog().parent_trace_id) {
      this.context.exit(() => {
        // This callback is called when exiting the context
        // We can perform any necessary cleanup here
      });
    }
  }

  /**
   * Sets the output for a trace.
   * @param {Trace} trace - The trace to set the output for.
   * @param {any} value - The output value.
   * @param {Function} [accessOutputOfFunc] - Optional function to access specific output.
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
   * Gets the current active trace.
   * @returns {Trace | undefined} The current trace or undefined if no active trace.
   */
  getCurrentTrace(): Trace | undefined {
    const traceMap = this.context.getStore();
    if (!traceMap) return undefined;
    return Array.from(traceMap.values()).pop();
  }

  /**
   * Gets the ID of the current active trace.
   * @returns {string | undefined} The ID of the current trace or undefined if no active trace.
   */
  getCurrentTraceId(): string | undefined {
    const currentTrace = this.getCurrentTrace();
    return currentTrace ? currentTrace.id : undefined;
  }

  /**
   * Inserts data into the trace log for the current or specified trace.
   * @param {Partial<TraceLog>} data - The data to insert into the trace log.
   * @param {string} [traceId] - The ID of the trace to insert data into. If not provided, uses the current trace.
   */
  insertTraceData(data: Partial<TraceLog>, traceId?: string): void {
    const currentContext = this.context.getStore();
    if (!currentContext) {
      console.warn('No active context found for traceInsert.');
      return;
    }

    const trace = traceId ? currentContext.get(traceId) : this.getCurrentTrace();
    if (!trace) {
      console.warn(`No trace found for traceId ${traceId || 'current'}.`);
      return;
    }

    const currentLog = trace.getLog();
    const updatedLog: Partial<TraceLog> = { ...currentLog };

    for (const [key, newValue] of Object.entries(data)) {
      const existingValue = currentLog[key as keyof TraceLog];
      // @ts-ignore
      updatedLog[key as keyof TraceLog] = existingValue ? this.merge(key, existingValue, newValue) : newValue;
    }

    trace.updateLog(updatedLog as TraceLog);
  }

  /**
   * Runs a callback function within the current context or a new context if none exists.
   * @param {Function} callback - The function to run within the context.
   * @returns {T} The result of the callback function.
   * @template T
   */
  runInContext<T>(callback: () => T): T {
    const existingContext = this.context.getStore();
    if (existingContext) {
      return callback();
    } else {
      return this.context.run(new Map(), callback);
    }
  }

  /**
   * Runs evaluations asynchronously for a given trace.
   * @param {Trace} trace - The trace to run evaluations for.
   * @private
   */
  private runEvaluationsAsync(trace: Trace): void {
    const experiment_uuid = trace.getLog().experiment_uuid;
    setImmediate(async () => {
      const evaluationHandler = new EvaluationHandler(trace.getEvalFuncs(), this);
      const scores = await evaluationHandler.runEvaluations(trace.getLog() as TraceLog);

      trace.updateLog({ scores });
      if (experiment_uuid) {
        experimentContext.addLog(experiment_uuid, trace.getLog());
        scores.forEach((score) => {
          experimentContext.addScore(experiment_uuid, score);
        });
      }
      trace.finalize();
    });
  }

  /**
   * Merges two values based on the provided key.
   * @param key - The key indicating the type of merge operation.
   * @param old - The old value to be merged.
   * @param newValue - The new value to be merged.
   * @returns The merged value.
   */
  private merge = <T>(key: string, old: T, newValue: T): T => {
    if (key === 'error') {
      return JSON.stringify([old, newValue], null, 2) as unknown as T;
    }
    if (typeof old === 'object' && !Array.isArray(old) && typeof newValue === 'object' && !Array.isArray(newValue)) {
      return { ...old, ...newValue } as T;
    }
    if (Array.isArray(old) && Array.isArray(newValue)) {
      return [...old, ...newValue] as T;
    }
    return newValue;
  };
}
