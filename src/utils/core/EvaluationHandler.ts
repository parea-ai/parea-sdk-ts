import { EvalFunction, EvaluationResult, TraceLog } from '../../types';
import { TraceManager } from './TraceManager';

export class EvaluationHandler {
  private evalFuncs: EvalFunction[];
  private traceManger: TraceManager;

  constructor(evalFuncs: EvalFunction[], traceManger: TraceManager) {
    this.evalFuncs = evalFuncs;
    this.traceManger = traceManger;
  }

  async runEvaluations(traceLog: TraceLog): Promise<EvaluationResult[]> {
    const scores: EvaluationResult[] = [];

    for (const func of this.evalFuncs) {
      try {
        const result = await func(traceLog);
        if (result !== undefined && result !== null) {
          if (typeof result === 'number') {
            scores.push({ name: func.name, score: result });
          } else if (typeof result === 'boolean') {
            scores.push({ name: func.name, score: result ? 1 : 0 });
          } else if (Array.isArray(result)) {
            scores.push(...result);
          } else {
            scores.push(result);
          }
        }
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
