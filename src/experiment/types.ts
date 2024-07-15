import { EvalFunctionReturn, EvaluatedLog, EvaluationResult, ExperimentStatus } from '../types';

/**
 * Represents the structure of experiment context values.
 */
export type ExperimentContextValues = {
  logs: EvaluatedLog[];
  scores: EvaluationResult[];
};

/**
 * Represents a traced function that can be used in experiments.
 * @template T - The type of the function parameters
 * @template R - The return type of the function
 */
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
 * Represents the result of a single trial in an experiment.
 * @template T - The type of the input
 * @template R - The type of the output
 */
export class TrialResult<T, R> {
  /**
   * Creates a new TrialResult instance.
   * @param input - The input of the trial
   * @param output - The output of the trial (null if error occurred)
   * @param error - The error that occurred during the trial (null if successful)
   * @param state - The status of the trial
   * @param scores - The evaluation scores of the trial (null if not available)
   * @param logs - The logs generated during the trial (null if not available)
   */
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
 * @template T - The type of the input parameters
 * @template R - The type of the output
 */
export class ExperimentResult<T extends Record<string, any>, R> {
  /**
   * Creates a new ExperimentResult instance.
   * @param name - The name of the experiment
   * @param results - An array of TrialResult instances
   * @param metadata - Additional metadata for the experiment
   */
  constructor(
    public name: string,
    public results: TrialResult<T, R>[],
    public metadata: Record<string, any> | undefined,
  ) {}

  /**
   * Calculates the success rate of the experiment.
   * @returns The percentage of successful trials
   */
  getSuccessRate(): number {
    const successfulTrials = this.results.filter((r) => r.state === ExperimentStatus.COMPLETED);
    return (successfulTrials.length / this.results.length) * 100;
  }

  /**
   * Retrieves all logs from successful trials.
   * @returns An array of EvaluatedLog objects
   */
  getLogs(): EvaluatedLog[] {
    return this.results
      .filter((r) => r.logs !== null)
      .map((r) => r.logs!)
      .flat();
  }

  /**
   * Retrieves all errors from failed trials.
   * @returns An array of Error objects
   */
  getErrors(): Error[] {
    return this.results
      .filter((r) => r.error !== null)
      .map((r) => r.error!)
      .filter((error): error is Error => error !== null);
  }

  /**
   * Retrieves error messages from all failed trials.
   * @returns A string containing all error messages, separated by commas
   */
  getErrorsString(): string {
    return this.getErrors()
      .map((e) => e.message)
      .join(', ');
  }

  /**
   * Calculates the average scores across all trials.
   * @returns An object containing average scores for each evaluation metric
   */
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
