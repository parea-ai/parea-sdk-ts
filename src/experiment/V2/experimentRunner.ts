import { Trial } from './trial';
import { TrialResult } from './types';
import { asyncPool } from './asyncPool';

/**
 * Manages the execution of trials in parallel.
 */
export class ExperimentRunner {
  private concurrency: number;

  /**
   * Creates a new ExperimentRunner instance.
   * @param concurrency The number of concurrent trials to run.
   */
  constructor(concurrency: number) {
    this.concurrency = concurrency;
  }

  /**
   * Runs the given trials in parallel.
   * @param trials The trials to run.
   * @returns A promise that resolves to an array of trial results.
   */
  async runTrials(trials: Trial<any, any>[]): Promise<TrialResult<any, any>[]> {
    const results: TrialResult<any, any>[] = [];

    for await (const result of asyncPool(this.concurrency, trials, (trial) => trial.run())) {
      results.push(result);
    }

    return results;
  }
}
