import { ExperimentStatsSchema, TestCaseCollection, TraceStatsSchema } from '../types';
import { Parea } from '../client';
import { asyncPool } from '../helpers';
import { genRandomName } from './utils';

function calculateAvgAsString(values: number[] | undefined): string {
  if (!values || values.length === 0) {
    return 'N/A';
  }
  const filteredValues = values.filter((x) => x !== null);
  const avg = filteredValues.reduce((acc, curr) => acc + curr, 0) / filteredValues.length;
  return avg.toFixed(2);
}

function calculateAvgStdForExperiment(experimentStats: ExperimentStatsSchema): { [key: string]: string } {
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
    cost: calculateAvgAsString(costValues),
  };

  Object.keys(scoreNameToValues).forEach((scoreName) => {
    result[scoreName] = calculateAvgAsString(scoreNameToValues[scoreName]);
  });

  return result;
}

async function experiment(
  name: string,
  data: string | Iterable<any[]>,
  func: (...dataItem: any[]) => Promise<any>,
  p: Parea,
  maxParallelCalls: number = 10,
): Promise<ExperimentStatsSchema> {
  if (typeof data === 'string') {
    console.log(`Fetching test collection: ${data}`);
    const response = await p.getCollection(data);
    const testCollection = new TestCaseCollection(
      response.id,
      response.name,
      response.created_at,
      response.last_updated_at,
      response.column_names,
      response.test_cases,
    );
    console.log(`Fetched ${testCollection.numTestCases()} test cases from collection: ${data} \n`);
    data = testCollection.getAllTestCaseInputs();
  }

  const experimentSchema = await p.createExperiment({ name });
  const experimentUUID = experimentSchema.uuid;
  process.env.PAREA_OS_ENV_EXPERIMENT_UUID = experimentUUID;

  const tasksGenerator = asyncPool(maxParallelCalls, data, async (dataInput) => {
    return func(...dataInput);
  });

  for await (const _ of tasksGenerator) {
    // Purposely ignore. Result not needed
    void _;
  }

  const experimentStats: ExperimentStatsSchema = await p.finishExperiment(experimentUUID);
  const statNameToAvgStd = calculateAvgStdForExperiment(experimentStats);
  console.log(`Experiment ${name} stats:\n${JSON.stringify(statNameToAvgStd, null, 2)}\n\n`);
  console.log(`View experiment & its traces at: https://app.parea.ai/experiments/${experimentUUID}\n`);
  return experimentStats;
}

export class Experiment {
  name: string;
  data: string | Iterable<any[]>;
  func: (...dataItem: any[]) => Promise<any>;
  p: Parea;
  experimentStats?: ExperimentStatsSchema;

  constructor(data: string | Iterable<any[]>, func: (...dataItem: any[]) => Promise<any>, name: string, p: Parea) {
    this.name = name;
    this.data = data;
    this.func = func;
    this.p = p;
  }

  async run(name: string | undefined = undefined): Promise<void> {
    this.name = name || genRandomName();
    this.experimentStats = new ExperimentStatsSchema(
      (await experiment(this.name, this.data, this.func, this.p)).parent_trace_stats,
    );
  }
}
