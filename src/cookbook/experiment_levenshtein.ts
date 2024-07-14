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

// const e = p.experiment(
//     'ExperimentName',
//     DatasetListofObjs,
//     functionToRun,
//     { nTrials: 3 },
//   );
//   return await e.run();

main().then(() => {
  console.log('Experiment complete!');
});
