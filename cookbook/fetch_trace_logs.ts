import { PaginatedTraceLogsResponse, Parea } from '../src';
import * as dotenv from 'dotenv';

dotenv.config();

const p = new Parea(process.env.PAREA_API_KEY);

async function main() {
  const experiments = await p.listExperiments();
  console.log(`found ${experiments.length} experiments`);
  const response: PaginatedTraceLogsResponse = await p.getTraceLogs({
    project_name: 'default',
    filter_field: 'trace_name',
    filter_operator: 'like',
    filter_value: 'llm',
  });

  console.log(response);
}

main();
