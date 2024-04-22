import { Parea } from '../client';
import * as dotenv from 'dotenv';

dotenv.config();

const p = new Parea(process.env.PAREA_API_KEY);

async function main() {
  const uuids = await p.listExperimentUUIDS();
  console.log(uuids.length);
}

main();
