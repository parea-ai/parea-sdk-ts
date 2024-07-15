import { TrialResult } from './types';
import { TraceManager } from '../../utils/V4/core/TraceManager';
import { experimentContext } from './experimentContext';
import { ExperimentStatus } from '../../types';

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
          // Set the experiment_uuid on the existing trace
          process.env.PAREA_OS_ENV_EXPERIMENT_UUID = this.experimentUUID;

          // Unpack the data
          const { target, ...dataInput } = this.data;
          const dataSamples = Object.values(dataInput);

          let funcResult: R;
          if (target !== undefined) {
            funcResult = await this.func(...dataSamples, target);
          } else {
            funcResult = await this.func(...dataSamples);
          }

          return funcResult;
        });

        this.state = ExperimentStatus.COMPLETED;
        // Retrieve the scores and logs from the experiment context
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
}
