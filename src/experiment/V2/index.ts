import { Experiment } from './experiment';
import { ExperimentOptions } from './types';
import { Parea } from '../../client';

/**
 * Creates and runs an experiment.
 * @param name The name of the experiment.
 * @param dataset The dataset to be used for the experiment.
 * @param func The function to be executed for each trial.
 * @param options Additional options for the experiment.
 * @param parea The Parea client to use for the experiment.
 * @returns A promise that resolves to the experiment results.
 */
export async function experiment<T extends Record<string, any>, R>(
  name: string,
  dataset: T[],
  func: { (...args: any[]): Promise<any> },
  options: ExperimentOptions,
  parea: Parea,
): Promise<Experiment<T, R>> {
  return new Experiment(name, dataset, func, options, parea);
}

export { ExperimentOptions, ExperimentResult } from './types';
