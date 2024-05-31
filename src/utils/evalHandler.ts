import { EvaluatedLog, EvaluationResult, TraceLog } from '../types';
import { MessageQueue } from './messageQueue';
import { asyncLocalStorage } from './context';

/**
 * Handles running evaluation functions on a trace log.
 * @param traceId The ID of the trace log.
 * @param traceLog
 * @param evalFuncs The evaluation functions to run.
 * @param applyEvalFrac The fraction of traces to apply evaluation functions to.
 */
export const handleRunningEvals = async (
  traceId: string,
  traceLog: TraceLog,
  evalFuncs: ((
    traceLog: EvaluatedLog,
  ) => Promise<EvaluationResult | EvaluationResult[] | number | boolean | undefined>)[],
  applyEvalFrac: number | undefined,
): Promise<void> => {
  const store = asyncLocalStorage.getStore();
  if (!store) {
    console.warn('No active store found for handleRunningEvals.');
    return;
  }

  const currentTraceData = store.get(traceId);
  if (!currentTraceData || !traceLog) {
    console.warn(`No trace data found for traceId ${traceId}.`);
    return;
  }

  if (traceLog.status === 'success' && (!applyEvalFrac || Math.random() < applyEvalFrac)) {
    currentTraceData.isRunningEval = true;
    store.set(traceId, currentTraceData);
    if (traceLog.output_for_eval_metrics) {
      traceLog.output = traceLog.output_for_eval_metrics;
    }
    const scores: EvaluationResult[] = [];
    for (const func of evalFuncs) {
      try {
        const score = await func(traceLog);
        if (score !== undefined && score !== null) {
          if (typeof score === 'number') {
            scores.push({ name: func.name, score });
          } else if (typeof score === 'boolean') {
            scores.push({ name: func.name, score: score ? 1 : 0 });
          } else if (Array.isArray(score)) {
            scores.push(...score);
          } else {
            scores.push(score);
          }
        }
      } catch (e) {
        console.error(`Error occurred calling evaluation function '${func.name}', ${e}`, e);
      }
    }
    traceLog.scores = scores;
    currentTraceData.isRunningEval = false;
    currentTraceData.traceLog = traceLog;
    store.set(traceId, currentTraceData);
    MessageQueue.sendImmediately(traceLog);
  }
};
