import { levenshteinDistance, Log, Parea, trace } from '../src';
import * as dotenv from 'dotenv';

dotenv.config();

const p = new Parea(process.env.PAREA_API_KEY);

// eval function for the substep chooseGreeting
const evalChooseGreeting = (log: Log): number | null => {
  if (!log?.target) {
    return null;
  }
  const targetSubstep = JSON.parse(log.target).substep;
  return levenshteinDistance(log.output || '', targetSubstep);
};

const chooseGreeting = trace(
  'chooseGreeting',
  // @ts-ignore
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
    target: JSON.stringify({ substep: 'Hi', overall: 'Hi Foo' }),
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
