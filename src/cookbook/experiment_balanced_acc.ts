import { Parea } from '../client';
import { trace } from '../utils/trace_utils';
import * as dotenv from 'dotenv';
import { EvaluatedLog, Log } from '../types';

dotenv.config();

const p = new Parea(process.env.PAREA_API_KEY);

function isCorrect(log: Log): number {
  return log?.output === log.target ? 1 : 0;
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

function balancedAccIsCorrect(logs: EvaluatedLog[]): number {
  const scoreName: string = isCorrect.name;

  const correct: Record<string, number> = {};
  const total: Record<string, number> = {};

  for (const log of logs) {
    const evalResult = log?.scores?.find((score) => score.name === scoreName) || null;
    const target: string = log.target || '';
    if (evalResult !== null && target !== null) {
      correct[target] = (correct[target] || 0) + (evalResult.score ? 1 : 0);
      total[target] = (total[target] || 0) + 1;
    }
  }

  const recalls: number[] = Object.keys(correct).map((key) => correct[key] / total[key]);

  if (recalls.length === 0) {
    return 0;
  }

  return recalls.reduce((acc, curr) => acc + curr, 0) / recalls.length;
}

export async function main() {
  const e = p.experiment(
    [
      { name: 'Foo', target: '1' },
      { name: 'Bar', target: '0' },
      { name: 'Far', target: '1' },
    ], // Data to run the experiment on (list of dicts)
    startsWithF, // Function to run (callable),
    {
      datasetLevelEvalFuncs: [balancedAccIsCorrect],
    },
  );
  return await e.run();
}

main().then(() => {
  console.log('Experiment complete!');
});
