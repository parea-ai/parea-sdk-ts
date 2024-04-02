import { Parea } from '../client';
import { trace } from '../utils/trace_utils';
import * as dotenv from 'dotenv';
import { EvaluationResult, Log } from '../types';

dotenv.config();

const p = new Parea(process.env.PAREA_API_KEY);

function isCorrect(log: Log): EvaluationResult {
  if (log.output === log.target) {
    return { name: 'matches_target', score: 1.0, reason: 'Output matches target' };
  } else {
    return { name: 'matches_target', score: 0, reason: 'Output does not match target' };
  }
}

const startsWithF = trace(
  'startsWithF',
  (name: string): string => {
    if (name === 'Foo') {
      return '1';
    } else {
      return '0';
    }
  },
  {
    evalFuncs: [isCorrect],
  },
);

export async function main() {
  const e = p.experiment(
    'evals-with-reason',
    [
      { name: 'Foo', target: '1' },
      { name: 'Bar', target: '0' },
      { name: 'Far', target: '1' },
    ], // Data to run the experiment on (list of dicts)
    startsWithF, // Function to run (callable),
  );
  return await e.run();
}

main().then(() => {
  console.log('Experiment complete!');
});
