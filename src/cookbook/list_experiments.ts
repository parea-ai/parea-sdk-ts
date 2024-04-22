import { Parea } from '../client';
import * as dotenv from 'dotenv';

dotenv.config();

const p = new Parea(process.env.PAREA_API_KEY);

async function main() {
  const uuids = await p.listExperimentUUIDS();
  console.log(`found ${uuids.length} experiments`);
  const logs = await p.getExperimentLogs(uuids[0]);
  console.log(`experiment ${uuids[0]} has ${logs.length} logs`);
  console.log(logs[0]);
}

main();
