import { Parea } from '../client';
import { trace } from '../utils/trace_utils';
import * as dotenv from 'dotenv';
import { levenshteinDistance } from '../evals/general/levenshtein';
import { Log } from '../types';

dotenv.config();

const p = new Parea(process.env.PAREA_API_KEY);

// eval function for the subsetp chooseGreeting
const evalChooseGreeting = (log: Log): number | null => {
  if (!log?.target) {
    return null;
  }
  const targetSubstep = JSON.parse(log.target).substep;
  return levenshteinDistance(log.output || '', targetSubstep);
};

const chooseGreeting = trace(
  'chooseGreeting',
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  (name: string): string => {
    return 'Hello';
  },
  {
    evalFuncs: [evalChooseGreeting],
  },
);

// eval function for the greet function
const evalGreet = (log: Log): number | null => {
  if (!log?.target) {
    return null;
  }
  const targetOverall = JSON.parse(log.target).overall;
  return levenshteinDistance(log.output || '', targetOverall);
};

const greet = trace(
  'greetings',
  (name: string): string => {
    const greeting = chooseGreeting(name);
    return `${greeting} ${name}`;
  },
  {
    evalFuncs: [evalGreet],
  },
);

export async function main() {
  const e = p.experiment(
    'greeting',
    [
      { name: 'Foo', target: { substep: 'Hi', overall: 'Hi Foo' } },
      { name: 'Bar', target: { substep: 'Hello', overall: 'Hello Bar' } },
    ],
    greet,
  );
  return await e.run();
}

main().then(() => {
  console.log('Experiment complete!');
});
