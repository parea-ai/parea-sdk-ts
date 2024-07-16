import { TrialResult } from './types';
import { TraceManager } from '../utils/core/TraceManager';
import { experimentContext } from './experimentContext';
import { ExperimentStatus } from '../types';

/**
 * Represents a single trial in an experiment.
 */
export class Trial<T extends Record<string, any>, R> {
  private state: ExperimentStatus = ExperimentStatus.PENDING;

  /**
   * Creates a new Trial instance.
   * @param data The input data for the trial.
   * @param func The function to be executed for the trial.
   * @param experimentUUID The UUID of the experiment this trial belongs to.
   * @param maxRetries - The maximum number of retries to wait for eval to finish. Each retry waits for 1s. Default is 60.
   */
  constructor(
    private data: T,
    private func: (...args: any[]) => R | Promise<R>,
    private experimentUUID: string,
    private maxRetries: number,
  ) {}

  /**
   * Runs the trial and returns the result.
   * @returns A promise that resolves to the trial result.
   */
  async run(): Promise<TrialResult<T, R | null>> {
    this.state = ExperimentStatus.RUNNING;
    const traceManager = TraceManager.getInstance();

    return experimentContext.runInContext(this.experimentUUID, async () => {
      try {
        const result = await traceManager.runInContext(async () => {
          process.env.PAREA_OS_ENV_EXPERIMENT_UUID = this.experimentUUID;

          const { target, ...dataInput } = this.data;
          const dataSamples = Object.values(dataInput);

          let funcResult: R;
          if (target !== undefined) {
            const _target = typeof target === 'object' ? JSON.stringify(target) : target;
            funcResult = await this.func(...dataSamples, _target);
          } else {
            funcResult = await this.func(...dataSamples);
          }

          return funcResult;
        });

        const { state, error } = await this.waitForLogs();
        this.state = state;
        const scores = experimentContext.getScores(this.experimentUUID);
        const logs = experimentContext.getLogs(this.experimentUUID);

        return new TrialResult(this.data, result, error || null, state, scores, logs);
      } catch (error) {
        this.state = ExperimentStatus.FAILED;
        const e = error instanceof Error ? error : new Error(String(error));
        return new TrialResult(this.data, null, e, this.state, null, null);
      }
    });
  }

  private async waitForLogs(): Promise<{ state: ExperimentStatus; error?: Error }> {
    await new Promise((resolve) => setTimeout(resolve, 2500)); // Wait for 2.5s before checking logs
    for (let i = 1; i < this.maxRetries; i++) {
      const logs = experimentContext.getLogs(this.experimentUUID);
      if (logs.length > 0) {
        return { state: ExperimentStatus.COMPLETED };
      }
      // log every 10 retries
      if (i % 10 === 0) {
        console.debug(
          `Waiting for eval to finish for trial in experiment ${this.experimentUUID}. Retrying (${i}/${this.maxRetries})...`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait for 1s before checking again
    }
    const msg = `No logs were collected for trial in experiment ${this.experimentUUID} after ${this.maxRetries} trys. Eval function likely did not finish, try increasing maxRetries on p.experiment. e.g: p.experiment('ExperimentName', data, func, { maxRetries: 120 })`;
    console.warn(msg);
    return { state: ExperimentStatus.FAILED, error: new Error(msg) };
  }
}
