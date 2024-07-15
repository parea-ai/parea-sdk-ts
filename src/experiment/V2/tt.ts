import * as dotenv from 'dotenv';
import OpenAI from 'openai';
import { APIPromise } from 'openai/core';
import { Parea } from '../../client';
import { patchOpenAI3 } from '../../utils/V4/wrappers/OpenAIWrapper';
import { EvaluatedLog, EvaluationResult } from '../../types';
import { trace3 } from '../../utils/V4/utils/trace';
import ChatCompletion = OpenAI.ChatCompletion;

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const p = new Parea(process.env.PAREA_API_KEY, 'TestMethods3');

// Patch OpenAI to add trace logs
patchOpenAI3(openai);

export function isCorrect2(): EvaluationResult {
  const random = Math.random();
  if (random < 0.2) {
    throw new Error('Random Eval Function Error 2');
  }
  return { name: 'isCorrect2', score: random, reason: 'Output matches target 2' };
}

export function isCorrect(): EvaluationResult {
  const random = Math.random();
  if (random < 0.2) {
    throw new Error('Random Eval Function Error');
  }
  return { name: 'isCorrect', score: Math.random(), reason: 'Output matches target' };
}

async function callOpenAI(body: any) {
  const random = Math.random();
  if (random < 0.2) {
    throw new Error('Random OpenAI Error');
  }
  return openai.chat.completions.create(body);
}

export const autoTraceInputs = async (content: string) => {
  return callOpenAI({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: 'You are a helpful assistant talking in JSON.' },
      { role: 'user', content: content },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.0,
  });
};

const TautoTraceScore = trace3(
  'TautoTraceScore',
  async (content: string): Promise<APIPromise<ChatCompletion>> => {
    return autoTraceInputs(content);
  },
  {
    evalFuncs: [isCorrect, isCorrect2],
  },
);

function balancedAccIsCorrect(logs: EvaluatedLog[]): number {
  console.log('logs', logs.length);
  return Math.random();
}

const main = async () => {
  const e = p.experiment('ExperimentName', [{ content: 'Who are you' }, { content: 'Who am I' }], TautoTraceScore, {
    nTrials: 2,
    datasetLevelEvalFuncs: [balancedAccIsCorrect],
    // nWorkers: 10,
  });
  await e.run();
  // console.log(' ExperimentResult', result);
  // // Print scores for each trial
  // result.results.forEach((trialResult, index) => {
  //   console.log(`Trial ${index + 1} scores:`, trialResult.scores);
  // });
};

main().catch(console.error);
