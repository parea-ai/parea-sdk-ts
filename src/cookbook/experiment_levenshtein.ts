import { Parea } from '../client';
import { trace } from '../utils/trace_utils';
import * as dotenv from 'dotenv';
import { levenshtein } from '../evals/general/levenshtein';

dotenv.config();

const p = new Parea('pai-e5dac32b60360c7df2abf0d4b8058d1c01fd693d997e8d97b28a92215689853a');

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
    'greeting',
    [
      { name: 'Foo', target: 'Hi Foo' },
      { name: 'Bar', target: 'Hello Bar' },
    ], // Data to run the experiment on (list of dicts)
    greet, // Function to run (callable)
    // { nTrials: 3 }, // Optional: Number of trials to run (int) default is 1
  );
  return await e.run();
}

main().then(() => {
  console.log('Experiment complete!');
});
