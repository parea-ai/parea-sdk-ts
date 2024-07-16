import { AsyncLocalStorage } from 'async_hooks';
import { EvaluatedLog, EvaluationResult } from '../types';
import { ExperimentContextValues } from './types';

/**
 * Manages the context for experiments using the Singleton pattern.
 */
class ExperimentContext {
  private static instance: ExperimentContext;
  private context: AsyncLocalStorage<Map<string, ExperimentContextValues>>;

  private constructor() {
    this.context = new AsyncLocalStorage<Map<string, ExperimentContextValues>>();
  }

  /**
   * Gets the singleton instance of ExperimentContext.
   * @returns The ExperimentContext instance.
   */
  public static getInstance(): ExperimentContext {
    if (!ExperimentContext.instance) {
      ExperimentContext.instance = new ExperimentContext();
    }
    return ExperimentContext.instance;
  }

  /**
   * Runs a callback function within the context of an experiment.
   * @param experimentUUID - The UUID of the experiment.
   * @param callback - The function to run within the experiment context.
   * @returns The result of the callback function.
   */
  runInContext<T>(experimentUUID: string, callback: () => T): T {
    const store = new Map<string, ExperimentContextValues>();
    return this.context.run(store, () => {
      store.set(experimentUUID, { logs: [], scores: [] });
      return callback();
    });
  }

  /**
   * Adds a score to the experiment context.
   * @param experimentUUID - The UUID of the experiment.
   * @param score - The evaluation result to add.
   */
  addScore(experimentUUID: string, score: EvaluationResult): void {
    const store = this.context.getStore();
    if (store) {
      const context = store.get(experimentUUID) || { logs: [], scores: [] };
      context.scores.push(score);
      store.set(experimentUUID, context);
    } else {
      console.error(`Experiment context store not found for experiment ${experimentUUID}`);
    }
  }

  /**
   * Adds a score to the experiment context.
   * @param experimentUUID - The UUID of the experiment.
   * @param scores - The evaluation results to add.
   */
  addScores(experimentUUID: string, scores: EvaluationResult[]): void {
    const store = this.context.getStore();
    if (store) {
      const context = store.get(experimentUUID) || { logs: [], scores: [] };
      context.scores.push(...scores);
      store.set(experimentUUID, context);
    } else {
      console.error(`Experiment context store not found for experiment ${experimentUUID}`);
    }
  }

  /**
   * Adds a log to the experiment context.
   * @param experimentUUID - The UUID of the experiment.
   * @param log - The evaluated log to add.
   */
  addLog(experimentUUID: string, log: EvaluatedLog): void {
    const store = this.context.getStore();
    if (store) {
      const context = store.get(experimentUUID) || { logs: [], scores: [] };
      context.logs.push(log);
      store.set(experimentUUID, context);
    } else {
      console.error(`Experiment context store not found for experiment ${experimentUUID}`);
    }
  }

  /**
   * Retrieves the scores for a specific experiment.
   * @param experimentUUID - The UUID of the experiment.
   * @returns An array of evaluation results.
   */
  getScores(experimentUUID: string): EvaluationResult[] {
    const store = this.context.getStore();
    const context = store?.get(experimentUUID) || { logs: [], scores: [] };
    return context.scores;
  }

  /**
   * Retrieves the logs for a specific experiment.
   * @param experimentUUID - The UUID of the experiment.
   * @returns An array of evaluated logs.
   */
  getLogs(experimentUUID: string): EvaluatedLog[] {
    const store = this.context.getStore();
    const context = store?.get(experimentUUID) || { logs: [], scores: [] };
    return context.logs;
  }
}

/**
 * The singleton instance of ExperimentContext.
 */
export const experimentContext = ExperimentContext.getInstance();
