import { Parea } from '../src';
import * as dotenv from 'dotenv';

dotenv.config();

const p = new Parea(process.env.PAREA_API_KEY);

export async function main() {
  const dataset = await p.getCollection(123);
  console.log(dataset?.convertToFinetuneJsonl()[0]);
}

main().then(() => {
  console.log('Done!');
});
