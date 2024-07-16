import { ExperimentRunner } from './experimentRunner';
import { ExperimentOptions, ExperimentResult, TracedFunction, TrialResult } from './types';
import { Trial } from './trial';
import { Parea } from '../client';

import {
  EvalFunctionReturn,
  EvaluatedLog,
  EvaluationResult,
  ExperimentStatsSchema,
  ExperimentStatus,
  TestCaseCollection,
} from '../types';
import { calculateAvgStdForExperiment, genRandomName } from './utils';
import { experimentContext } from './experimentContext';
import { processEvaluationResult } from '../utils/helpers';

/**
 * Represents an experiment that can be run with multiple trials.
 * @template T - The type of the dataset elements
 * @template R - The type of the result returned by the traced function
 */
export class Experiment<T extends Record<string, any>, R> {
  public runName: string;
  private state: ExperimentStatus = ExperimentStatus.PENDING;
  private runner: ExperimentRunner;
  private p: Parea;
  private successRate: number = 0;
  private errors: string = '';
  private logs: EvaluatedLog[] = [];

  /**
   * Creates a new Experiment instance.
   * @param name The name of the experiment.
   * @param dataset The dataset to be used for the experiment.
   * @param func The function to be executed for each trial.
   * @param options Additional options for the experiment.
   * @param parea The Parea client instance.
   */
  constructor(
    private name: string,
    private dataset: string | T[],
    private func: TracedFunction<T, R>,
    private options: ExperimentOptions,
    parea: Parea,
  ) {
    this.runner = new ExperimentRunner(this.options.nWorkers || 10);
    this.p = parea;
    this.trySetDataset(dataset);
  }

  /**
   * Runs the experiment and returns the results.
   * @param runName Optional name for this specific run of the experiment.
   * @returns A promise that resolves to the experiment results.
   * @throws Error if the experiment fails to run.
   */
  async run(runName: string | undefined = undefined): Promise<ExperimentResult<T, R>> {
    this.runName = runName || genRandomName();
    this.state = ExperimentStatus.RUNNING;
    const experimentSchema = await this.p.createExperiment({
      name: this.name,
      run_name: this.runName,
      metadata: this.options.metadata,
    });
    const experimentUUID = experimentSchema.uuid;

    return experimentContext.runInContext(experimentUUID, async () => {
      try {
        this.dataset = await this.determineDataset(this.dataset);
        const maxRetries = typeof this.options?.maxRetries === 'number' ? this.options.maxRetries : 60;
        const trials = this.dataset.flatMap((data) =>
          Array(this.options.nTrials || 1)
            .fill(null)
            .map(() => new Trial(data, this.func, experimentUUID, maxRetries)),
        );

        const results = await this.runner.runTrials(trials);

        this.state = this.determineState(results);
        const er = new ExperimentResult(this.name, results, this.options.metadata);
        this.logs = er.getLogs();
        this.successRate = er.getSuccessRate();
        this.errors = er.getErrorsString();
        return er;
      } catch (error) {
        this.state = ExperimentStatus.FAILED;
        throw new Error(`Experiment failed: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        await this.logExperimentResults(experimentUUID);
        delete process.env.PAREA_OS_ENV_EXPERIMENT_UUID;
      }
    });
  }

  /**
   * Gets the current state of the experiment.
   * @returns The current experiment status.
   */
  getState(): ExperimentStatus {
    return this.state;
  }

  /**
   * Determines the overall state of the experiment based on trial results.
   * @param results An array of trial results.
   * @returns The determined experiment status.
   */
  determineState(results: TrialResult<any, any>[]): ExperimentStatus {
    if (results.some((result) => result.state !== ExperimentStatus.COMPLETED)) {
      return ExperimentStatus.FAILED;
    }
    return ExperimentStatus.COMPLETED;
  }

  /**
   * Calculates dataset-level statistics based on evaluation functions.
   * @returns A promise that resolves to an array of evaluation results or null.
   */
  async getDatasetLevelStats(): Promise<EvaluationResult[] | null> {
    const datasetLevelEvalPromises: Promise<EvalFunctionReturn | null>[] =
      (this.options.datasetLevelEvalFuncs || []).map(async (func) => {
        try {
          const score = await func(this.logs);
          const scores: EvaluationResult[] = [];
          processEvaluationResult(func.name, score, scores);
          return scores;
        } catch (e) {
          console.error(`Error occurred calling '${func.name}', ${e}`, e);
        }
        return null;
      }) || [];
    return (await Promise.all(datasetLevelEvalPromises)).flat().filter((x): x is EvaluationResult => x !== null);
  }

  /**
   * Determines the dataset to be used for the experiment.
   * @param dataset The input dataset, either as a string (collection name) or an array of data.
   * @returns A promise that resolves to the array of dataset elements.
   * @throws Error if the specified collection is not found.
   */
  async determineDataset(dataset: string | T[]): Promise<T[]> {
    if (typeof dataset === 'string') {
      console.log(`Fetching test collection: ${dataset}`);
      const response = await this.p.getCollection(dataset);
      if (!response) {
        throw new Error(`Collection ${this.dataset} not found`);
      }
      const testCollection = new TestCaseCollection(
        response.id,
        response.name,
        response.created_at,
        response.last_updated_at,
        response.column_names,
        response.test_cases,
      );
      console.log(`Fetched ${testCollection.numTestCases()} test cases from collection: ${this.dataset} \n`);
      return testCollection.getAllTestInputsAndTargets() as T[];
    }
    return dataset;
  }

  /**
   * Logs the results of the experiment.
   * @param experimentUUID The UUID of the experiment.
   */
  async logExperimentResults(experimentUUID: string): Promise<void> {
    const dls = await this.getDatasetLevelStats();
    // sleep for 4 seconds for logs to flush
    await new Promise((resolve) => setTimeout(resolve, 4000));
    const experimentStats: ExperimentStatsSchema = await this.p.finishExperiment(experimentUUID, {
      dataset_level_stats: dls || undefined,
      status: this.getState(),
    });
    const statNameToAvgStd = calculateAvgStdForExperiment(experimentStats);
    (dls || []).forEach((result) => {
      statNameToAvgStd[result.name] = result.score.toFixed(2);
    });
    console.log(
      `Experiment ${this.name} Run ${this.runName} avg. stats:\n${JSON.stringify(statNameToAvgStd, null, 2)}`,
    );
    console.log(`Success rate: ${this.successRate}%`);
    console.log(this.errors ? `Errors: ${this.errors}\n\n` : '\n\n');
    console.log(
      `View experiment & traces at: https://app.parea.ai/experiments/${encodeURIComponent(
        this.name,
      )}/${experimentUUID}\n`,
    );
  }

  /**
   * Set Dataset name as metadata is using dataset
   * @param dataset The input dataset, either as a string (collection name) or an array of data.
   */
  private trySetDataset(dataset: string | T[]): void {
    if (typeof dataset === 'string') {
      if (!this.options.metadata) {
        this.options.metadata = {};
      } else if (this.options.metadata.Dataset) {
        console.warn(
          'Metadata key "Dataset" is reserved for the dataset name. Overwriting it with the provided dataset name.',
        );
      }
      this.options.metadata = { ...this.options.metadata, Dataset: dataset };
    }
  }
}
