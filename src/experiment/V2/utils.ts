import { ExperimentStatsSchema, TraceStatsSchema } from '../../types';

export function calculateAvgAsString(values: number[] | undefined, isCost: boolean = false): string {
  const digits = isCost ? 5 : 2;
  if (!values || values.length === 0) {
    return 'N/A';
  }
  const filteredValues = values.filter((x) => x !== null);
  const avg = filteredValues.reduce((acc, curr) => acc + curr, 0) / filteredValues.length;
  return avg.toFixed(digits);
}

export function calculateAvgStdForExperiment(experimentStats: ExperimentStatsSchema): { [key: string]: string } {
  const traceStats: TraceStatsSchema[] = experimentStats.parent_trace_stats;
  const latencyValues = traceStats.map((traceStat) => traceStat.latency || 0);
  const inputTokensValues = traceStats.map((traceStat) => traceStat.input_tokens || 0);
  const outputTokensValues = traceStats.map((traceStat) => traceStat.output_tokens || 0);
  const totalTokensValues = traceStats.map((traceStat) => traceStat.total_tokens || 0);
  const costValues = traceStats.map((traceStat) => traceStat.cost || 0);
  const scoreNameToValues: { [key: string]: number[] } = {};

  traceStats.forEach((traceStat) => {
    traceStat.scores?.forEach((score) => {
      if (!scoreNameToValues[score.name]) {
        scoreNameToValues[score.name] = [];
      }
      scoreNameToValues[score.name].push(score.score);
    });
  });

  const result: { [key: string]: string } = {
    latency: calculateAvgAsString(latencyValues),
    input_tokens: calculateAvgAsString(inputTokensValues),
    output_tokens: calculateAvgAsString(outputTokensValues),
    total_tokens: calculateAvgAsString(totalTokensValues),
    cost: calculateAvgAsString(costValues, true),
  };

  Object.keys(scoreNameToValues).forEach((scoreName) => {
    result[scoreName] = calculateAvgAsString(scoreNameToValues[scoreName]);
  });

  return result;
}
