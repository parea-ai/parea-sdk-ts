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
   */
  constructor(
    private data: T,
    private func: (...args: any[]) => R | Promise<R>,
    private experimentUUID: string,
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

        this.state = ExperimentStatus.COMPLETED;

        await this.waitForLogs();

        const scores = experimentContext.getScores(this.experimentUUID);
        const logs = experimentContext.getLogs(this.experimentUUID);

        return new TrialResult(this.data, result, null, this.state, scores, logs);
      } catch (error) {
        this.state = ExperimentStatus.FAILED;
        const e = error instanceof Error ? error : new Error(String(error));
        return new TrialResult(this.data, null, e, this.state, null, null);
      }
    });
  }

  private async waitForLogs(maxRetries: number = 5): Promise<void> {
    for (let i = 0; i < maxRetries; i++) {
      const logs = experimentContext.getLogs(this.experimentUUID);
      if (logs.length > 0) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 500)); // Wait for 500ms before checking again
    }
    console.warn(`Warning: No logs were collected for trial in experiment ${this.experimentUUID}`);
  }
}
