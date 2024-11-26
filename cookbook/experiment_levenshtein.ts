import { levenshtein, Parea, trace } from '../src';
import * as dotenv from 'dotenv';

dotenv.config();

const p = new Parea(process.env.PAREA_API_KEY);

const greet = trace(
  'greeting',
  (name: string): string => {
    return `Hello ${name}`;
  },
  {
    evalFuncs: [levenshtein],
  },
);

export async function main() {
  const e = p.experiment(
    '',
    [
      { name: 'Foo', target: 'Hi Foo' },
      { name: 'Bar', target: 'Hello Bar' },
    ], // Data to run the experiment on (list of dicts)
    greet, // Function to run (callable)
    { nTrials: 3 }, // Optional: Number of trials to run (int) default is 1
  );
  return await e.run({ prefix: 'lev' });
}

main().then(() => {
  console.log('Experiment complete!');
});
