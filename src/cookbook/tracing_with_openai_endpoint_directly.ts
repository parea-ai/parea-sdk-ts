import * as dotenv from 'dotenv';
import { getCurrentTraceId, trace } from '../utils/trace_utils';
import OpenAI from 'openai';
import { patchOpenAI } from '../utils/wrap_openai';
import { Parea } from '../client';

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// needed for tracing
const p = new Parea(process.env.PAREA_API_KEY);

// Patch OpenAI to add trace logs
patchOpenAI(openai);

async function callOpenAI(messages: any[], model: string = 'gpt-4-turbo', temperature: number = 0.0): Promise<string> {
  const response = await openai.chat.completions.create({ model, messages, temperature });
  return response.choices[0].message.content ?? '';
}

const argumentGenerator = async (query: string, additionalDescription: string = ''): Promise<string> => {
  return await callOpenAI([
    {
      role: 'system',
      content: `You are a debater making an argument on a topic. ${additionalDescription} The current time is ${new Date().toISOString()}`,
    },
    { role: 'user', content: `The discussion topic is ${query}` },
  ]);
};

const critic = async (argument: string): Promise<string> => {
  return await callOpenAI([
    {
      role: 'system',
      content: `You are a critic. What unresolved questions or criticism do you have after reading the following argument? Provide a concise summary of your feedback.`,
    },
    { role: 'user', content: argument },
  ]);
};

const refiner = async (
  query: string,
  additionalDescription: string,
  currentArg: string,
  criticism: string,
): Promise<string> => {
  return await callOpenAI([
    {
      role: 'system',
      content: `You are a debater making an argument on a topic. ${additionalDescription} The current time is ${new Date().toISOString()}`,
    },
    { role: 'user', content: `The discussion topic is ${query}` },
    { role: 'assistant', content: currentArg },
    { role: 'user', content: criticism },
    {
      role: 'system',
      content: 'Please generate a new argument that incorporates the feedback from the user.',
    },
  ]);
};

const argumentChain = async (query: string, additionalDescription: string = ''): Promise<string> => {
  const argument = await argumentGenerator(query, additionalDescription);
  const criticism = await critic(argument);
  return await refiner(query, additionalDescription, argument, criticism);
};

// you can add metadata and endUserIdentifier to trace for filtering in the dashboard
const TargumentChain = trace('argumentChain', argumentChain, {
  metadata: {
    purpose: 'test',
  },
  endUserIdentifier: 'user_id',
  sessionId: 'session_id',
});

const TRefinedArgument = trace(
  'TDrefinedArgument',
  async (query: string, refined: string, additionalDescription: string = ''): Promise<string[]> => {
    const traceId = getCurrentTraceId() as string;
    const criticism = await critic(refined);
    const refined_arg = await refiner(query, additionalDescription, refined, criticism);
    return [refined_arg, traceId];
  },
);

const NestedChain = trace(
  'TDNestedChain',
  async (query: string, additionalDescription: string = ''): Promise<string[]> => {
    const refined = await TargumentChain(query, additionalDescription);
    return await TRefinedArgument(query, refined, additionalDescription);
  },
  {
    evalFuncNames: ['Is equal'], // this a deployed evaluation function
    accessOutputOfFunc: (arg0: any) => arg0[0],
    applyEvalFrac: 0.5,
  },
);

export async function main() {
  return await argumentChain(
    'Whether Nitrogen is good for you.',
    'Provide a concise, few sentence argument on why Nitrogen is good for you.',
  );
}

export async function main2() {
  return await TargumentChain(
    'Whether lime juice is good for you.',
    'Provide a concise, few sentence argument on why lime juice is good for you.',
  );
}

export async function main3() {
  const [result, traceId] = await NestedChain(
    'Whether apple juice is good for you.',
    'Provide a concise, few sentence argument on why apple juice is good for you.',
  );
  await p.recordFeedback({
    trace_id: traceId,
    score: 0.21, // 0.0 (bad) to 1.0 (good)
  });
  return result;
}

async function main4() {
  const response = await openai.chat.completions.create({
    model: 'gpt-4-turbo-2024-04-09',
    messages: [
      { role: 'system', content: 'You are a helpful assistant talking in JSON.' },
      { role: 'user', content: 'What are you?' },
    ],
    response_format: { type: 'json_object' },
  });
  return response.choices[0].message.content ?? '';
}

main().then((result) => console.log(result));
main2().then((result) => console.log(result));
main3().then((result) => console.log(result));
main4().then((r) => console.log(r));
