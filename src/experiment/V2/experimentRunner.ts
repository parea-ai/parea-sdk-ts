import { Trial } from './trial';
import { TrialResult } from './types';

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
    let currentIndex = 0;

    const runBatch = async (): Promise<void> => {
      const batch = trials.slice(currentIndex, currentIndex + this.concurrency);
      if (batch.length === 0) return;

      const batchResults = await Promise.all(batch.map((trial) => trial.run()));
      results.push(...batchResults);
      currentIndex += batch.length;

      await runBatch();
    };

    await runBatch();
    return results;
  }
}
