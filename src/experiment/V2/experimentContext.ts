import { AsyncLocalStorage } from 'async_hooks';
import { EvaluatedLog, EvaluationResult } from '../../types';

type ExperimentContextValues = {
  logs: EvaluatedLog[];
  scores: EvaluationResult[];
};

class ExperimentContext {
  private static instance: ExperimentContext;
  private context: AsyncLocalStorage<Map<string, ExperimentContextValues>>;

  private constructor() {
    this.context = new AsyncLocalStorage<Map<string, ExperimentContextValues>>();
  }

  public static getInstance(): ExperimentContext {
    if (!ExperimentContext.instance) {
      ExperimentContext.instance = new ExperimentContext();
    }
    return ExperimentContext.instance;
  }

  runInContext<T>(experimentUUID: string, callback: () => T): T {
    const store = new Map<string, ExperimentContextValues>();
    return this.context.run(store, () => {
      store.set(experimentUUID, { logs: [], scores: [] });
      return callback();
    });
  }

  addScore(experimentUUID: string, score: EvaluationResult): void {
    const store = this.context.getStore();
    if (store) {
      const context = store.get(experimentUUID) || { logs: [], scores: [] };
      context.scores.push(score);
      store.set(experimentUUID, context);
    }
  }

  addLog(experimentUUID: string, log: EvaluatedLog): void {
    const store = this.context.getStore();
    if (store) {
      const context = store.get(experimentUUID) || { logs: [], scores: [] };
      context.logs.push(log);
      store.set(experimentUUID, context);
    }
  }

  getScores(experimentUUID: string): EvaluationResult[] {
    const store = this.context.getStore();
    const context = store?.get(experimentUUID) || { logs: [], scores: [] };
    return context.scores;
  }

  getLogs(experimentUUID: string): EvaluatedLog[] {
    const store = this.context.getStore();
    const context = store?.get(experimentUUID) || { logs: [], scores: [] };
    return context.logs;
  }
}

export const experimentContext = ExperimentContext.getInstance();
