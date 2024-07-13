import { EvaluationResult, TraceLog } from '../../../types';

export type EvalFunction = (
  log: TraceLog,
  ...args: any[]
) => Promise<EvaluationResult | EvaluationResult[] | number | boolean>;

export class EvaluationHandler {
  private evalFuncs: EvalFunction[];

  constructor(evalFuncs: EvalFunction[]) {
    this.evalFuncs = evalFuncs;
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
      } catch (e) {
        console.error(`Error occurred calling evaluation function '${func.name}', ${e}`, e);
      }
    }

    return scores;
  }
}
