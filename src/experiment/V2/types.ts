import { EvalFunctionReturn, EvaluatedLog, EvaluationResult, ExperimentStatus } from '../../types';

export type TracedFunction<T extends Record<string, any>, R> = (
  ...args: [...Array<T[keyof T]>, T['target']]
) => R | Promise<R>;

/**
 * Options for configuring an experiment.
 */
export interface ExperimentOptions {
  nTrials?: number;
  metadata?: Record<string, any>;
  nWorkers?: number;
  datasetLevelEvalFuncs?: ((logs: EvaluatedLog[]) => EvalFunctionReturn)[];
}

/**
 * Represents the result of a single trial.
 */
export class TrialResult<T, R> {
  constructor(
    public input: T,
    public output: R | null,
    public error: Error | null,
    public state: ExperimentStatus,
    public scores: EvaluationResult[] | null,
    public logs: EvaluatedLog[] | null,
  ) {}
}

/**
 * Represents the aggregated results of an experiment.
 */
export class ExperimentResult<T extends Record<string, any>, R> {
  constructor(
    public name: string,
    public results: TrialResult<T, R>[],
    public metadata: Record<string, any> | undefined,
  ) {}

  getSuccessRate(): number {
    const successfulTrials = this.results.filter((r) => r.state === ExperimentStatus.COMPLETED);
    return (successfulTrials.length / this.results.length) * 100;
  }

  getLogs(): EvaluatedLog[] {
    return this.results
      .filter((r) => r.logs !== null)
      .map((r) => r.logs!)
      .flat();
  }

  getErrors(): Error[] {
    return this.results
      .filter((r) => r.error !== null)
      .map((r) => r.error!)
      .filter((error): error is Error => error !== null);
  }

  getErrorsString(): string {
    return this.getErrors()
      .map((e) => e.message)
      .join(', ');
  }

  getAverageScores(): Record<string, number> {
    const scoreMap: Record<string, number[]> = {};

    for (const result of this.results) {
      if (result.scores) {
        for (const score of result.scores) {
          if (!scoreMap[score.name]) {
            scoreMap[score.name] = [];
          }
          scoreMap[score.name].push(score.score);
        }
      }
    }

    const averageScores: Record<string, number> = {};
    for (const [name, scores] of Object.entries(scoreMap)) {
      averageScores[name] = scores.reduce((a, b) => a + b, 0) / scores.length;
    }

    return averageScores;
  }
}
