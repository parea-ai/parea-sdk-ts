import { AsyncLocalStorage } from 'async_hooks';
import { EvaluationResult } from '../../types';

class ExperimentContext {
  private static instance: ExperimentContext;
  private context: AsyncLocalStorage<Map<string, EvaluationResult[]>>;

  private constructor() {
    this.context = new AsyncLocalStorage<Map<string, EvaluationResult[]>>();
  }

  public static getInstance(): ExperimentContext {
    if (!ExperimentContext.instance) {
      ExperimentContext.instance = new ExperimentContext();
    }
    return ExperimentContext.instance;
  }

  runInContext<T>(experimentUUID: string, callback: () => T): T {
    const store = new Map<string, EvaluationResult[]>();
    return this.context.run(store, () => {
      store.set(experimentUUID, []);
      return callback();
    });
  }

  addScore(experimentUUID: string, score: EvaluationResult): void {
    const store = this.context.getStore();
    if (store) {
      const scores = store.get(experimentUUID) || [];
      scores.push(score);
      store.set(experimentUUID, scores);
    }
  }

  getScores(experimentUUID: string): EvaluationResult[] {
    const store = this.context.getStore();
    return store ? store.get(experimentUUID) || [] : [];
  }
}

export const experimentContext = ExperimentContext.getInstance();
