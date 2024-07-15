import { EvalFunction, EvaluationResult, TraceLog } from '../../types';
import { TraceManager } from './TraceManager';
import { processEvaluationResult } from '../helpers';

/**
 * Handles the evaluation of trace logs using multiple evaluation functions.
 */
export class EvaluationHandler {
  private evalFuncs: EvalFunction[];
  private traceManger: TraceManager;

  /**
   * Creates an instance of EvaluationHandler.
   * @param evalFuncs - An array of evaluation functions to be executed.
   * @param traceManger - The TraceManager instance for managing trace data.
   */
  constructor(evalFuncs: EvalFunction[], traceManger: TraceManager) {
    this.evalFuncs = evalFuncs;
    this.traceManger = traceManger;
  }

  /**
   * Runs all evaluation functions on the provided trace log.
   * @param traceLog - The trace log to be evaluated.
   * @returns A promise that resolves to an array of EvaluationResult objects.
   * @throws Will log errors to the trace manager and console if an evaluation function fails.
   */
  async runEvaluations(traceLog: TraceLog): Promise<EvaluationResult[]> {
    const scores: EvaluationResult[] = [];

    for (const func of this.evalFuncs) {
      try {
        const result = await func(traceLog);
        processEvaluationResult(func.name, result, scores);
      } catch (error) {
        const msg = `Error occurred calling evaluation function '${func.name} for trace ${
          traceLog.trace_name
        }: trace_id: ${traceLog.trace_id}', ${(error as Error).toString()}`;
        this.traceManger.insertTraceData({ error: msg, status: 'error' }, traceLog.trace_id);
        console.error(msg, error);
      }
    }

    return scores;
  }
}
