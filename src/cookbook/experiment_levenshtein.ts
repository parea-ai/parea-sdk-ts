import { Parea } from '../client';
import { trace } from '../utils/trace_utils';
import * as dotenv from 'dotenv';
import { levenshtein } from '../evals/general/levenshtein';

dotenv.config();

const p = new Parea(process.env.PAREA_API_KEY);

const greet = trace(
  'greetings',
  (name: string): string => {
    return `Hello ${name}`;
  },
  {
    evalFuncs: [levenshtein],
  },
);

export async function main() {
  const e = p.experiment(
    [
      { name: 'Foo', target: 'Hi Foo' },
      { name: 'Bar', target: 'Hello Bar' },
    ], // Data to run the experiment on (list of dicts)
    greet, // Function to run (callable)
  );
  return await e.run();
}

main().then(() => {
  console.log('Experiment complete!');
});
