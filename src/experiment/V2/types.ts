import { EvalFunction, EvaluationResult, ExperimentStatus } from '../../types';

export interface ExperimentOptions {
  nTrials?: number;
  metadata?: Record<string, any>;
  nWorkers?: number;
}

export type TracedFunction<T extends Record<string, any>, R> = (
  ...args: [...Array<T[keyof T]>, T['target']]
) => Promise<R>;

export interface TracedFunctionOptions {
  evalFuncs: EvalFunction[];
}

/**
 * Options for configuring an experiment.
 */
export interface ExperimentOptions {
  nTrials?: number;
  metadata?: Record<string, any>;
  nWorkers?: number;
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
  ) {}

  /**
   * Deserializes a trial result from a worker thread.
   * @param serialized The serialized trial result data.
   * @returns A new TrialResult instance.
   */
  static deserialize<T, R>(serialized: any): TrialResult<T, R> {
    return new TrialResult(
      serialized.input,
      serialized.output,
      serialized.error ? new Error(serialized.error) : null,
      serialized.state as ExperimentStatus,
      serialized.scores,
    );
  }

  /**
   * Serializes the trial result for transfer from a worker thread.
   * @returns A serialized representation of the trial result.
   */
  serialize(): any {
    return {
      input: this.input,
      output: this.output,
      error: this.error ? this.error.message : null,
      state: this.state,
      scores: this.scores,
    };
  }
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
