import { AsyncLocalStorage } from 'node:async_hooks';
import { TraceLog, TraceOptions } from '../../types';
import { EvaluationHandler } from './EvaluationHandler';
import { Trace } from './Trace';
import { experimentContext } from '../../experiment/experimentContext';

/**
 * Manages the creation, updating, and finalization of traces.
 */
export class TraceManager {
  private static instance: TraceManager;
  private context: AsyncLocalStorage<Map<string, Trace>>;

  // private evaluationHandler: EvaluationHandler | null = null;

  private constructor() {
    this.context = new AsyncLocalStorage<Map<string, Trace>>();
  }

  public static getInstance(): TraceManager {
    if (!TraceManager.instance) {
      TraceManager.instance = new TraceManager();
    }
    return TraceManager.instance;
  }

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

  //
  // setEvalFuncs(evalFuncs: EvalFunction[]): void {
  //   this.evaluationHandler = new EvaluationHandler(evalFuncs, this);
  // }

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

    // let scores: EvaluationResult[] = [];
    if (!skipEval && shouldRunEval && trace.getEvalFuncs().length > 0) {
      this.runEvaluationsAsync(trace);
      // traceMap.set('isRunningEval', new Trace('', {}));
      // const evaluationHandler = new EvaluationHandler(trace.getEvalFuncs(), this);
      // scores = await evaluationHandler.runEvaluations(trace.getLog() as TraceLog);
      // trace.updateLog({ scores });
      // if (experiment_uuid) {
      //   experimentContext.addLog(experiment_uuid, trace.getLog());
      // }
      // traceMap.delete('isRunningEval');
    } else {
      trace.finalize();
    }
    // if (experiment_uuid && scores.length > 0) {
    //   scores.forEach((score) => {
    //     experimentContext.addScore(experiment_uuid, score);
    //   });
    // }
    // traceMap.delete(trace.id);

    if (!trace.getLog().parent_trace_id) {
      // If this is a root trace, exit the context
      this.context.exit(() => {
        // This callback is called when exiting the context
        // We can perform any necessary cleanup here
      });
    }
  }

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

  getCurrentTrace(): Trace | undefined {
    const traceMap = this.context.getStore();
    if (!traceMap) return undefined;
    return Array.from(traceMap.values()).pop();
  }

  getCurrentTraceId(): string | undefined {
    const currentTrace = this.getCurrentTrace();
    return currentTrace ? currentTrace.id : undefined;
  }

  /**
   * Inserts data into the trace log for the current or specified trace.
   * @param data The data to insert into the trace log.
   * @param traceId The ID of the trace to insert data into. If not provided, uses the current trace.
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
    const updatedLog = { ...currentLog };

    for (const [key, newValue] of Object.entries(data)) {
      const existingValue = currentLog[key as keyof TraceLog];
      updatedLog[key as keyof TraceLog] = existingValue ? this.merge(key, existingValue, newValue) : newValue;
    }

    trace.updateLog(updatedLog);
  }

  runInContext<T>(callback: () => T): T {
    const existingContext = this.context.getStore();
    if (existingContext) {
      return callback();
    } else {
      return this.context.run(new Map(), callback);
    }
  }

  private runEvaluationsAsync(trace: Trace): void {
    const experiment_uuid = trace.getLog().experiment_uuid;
    // Run evaluations asynchronously
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

      // Send updated log asynchronously
      trace.finalize();
    });
  }

  private merge = (key: string, old: any, newValue: any) => {
    if (key === 'error') {
      return JSON.stringify([old, newValue], null, 2);
    }
    if (typeof old === 'object' && typeof newValue === 'object') {
      return { ...old, ...newValue };
    }
    if (Array.isArray(old) && Array.isArray(newValue)) {
      return [...old, ...newValue];
    }
    return newValue;
  };
}
