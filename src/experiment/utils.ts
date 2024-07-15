import { ExperimentStatsSchema, TraceStatsSchema } from '../types';
import { ADJECTIVES, NOUNS } from '../constants';

/**
 * Generates a random name by combining an adjective and a noun.
 * @returns A string containing a randomly generated name in the format "adjective-noun".
 */
export function genRandomName(): string {
  const randomIndex = (max: number): number => Math.floor(Math.random() * Math.floor(max));
  const adjective: string = ADJECTIVES[randomIndex(ADJECTIVES.length)];
  const noun: string = NOUNS[randomIndex(NOUNS.length)];
  return `${adjective}-${noun}`;
}

/**
 * Calculates the average of an array of numbers and returns it as a string.
 * @param values - An array of numbers to calculate the average from.
 * @param isCost - A boolean indicating whether the values represent cost (defaults to false).
 * @returns A string representation of the average, with either 2 or 5 decimal places depending on isCost.
 */
export function calculateAvgAsString(values: number[] | undefined, isCost: boolean = false): string {
  const digits = isCost ? 5 : 2;
  if (!values || values.length === 0) {
    return 'N/A';
  }
  const filteredValues = values.filter((x) => x !== null);
  const avg = filteredValues.reduce((acc, curr) => acc + curr, 0) / filteredValues.length;
  return avg.toFixed(digits);
}

/**
 * Calculates average statistics for an experiment based on its trace stats.
 * @param experimentStats - An object containing experiment statistics, including trace stats.
 * @returns An object with average values for various metrics (latency, tokens, cost, and scores).
 */
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
