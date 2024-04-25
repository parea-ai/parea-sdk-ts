import { Parea } from '../client';
import * as dotenv from 'dotenv';

dotenv.config();

const p = new Parea(process.env.PAREA_API_KEY);

async function main() {
  const experiments = await p.listExperiments();
  console.log(`found ${experiments.length} experiments`);
  const logs = await p.getExperimentLogs(experiments[0].uuid);
  console.log(`experiment ${experiments[0].name} has ${logs.length} logs`);
  console.log(logs[0]);
}

main();
