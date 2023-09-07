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
const p = new Parea(process.env.DEV_API_KEY);

// Patch OpenAI to add trace logs
patchOpenAI(openai);

async function callOpenAI(
  messages: any[],
  model: string = 'gpt-3.5-turbo-0613',
  temperature: number = 0.0,
): Promise<string> {
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

// Traced versions of the functions above
const TargumentGenerator = trace('TDargumentGenerator', argumentGenerator, { source: 'parea-js-sdk-oai' });
const Tcritic = trace('TDcritic', critic, { source: 'parea-js-sdk-oai' });
const Trefiner = trace('TDrefiner', refiner, { source: 'parea-js-sdk-oai' });

// Traced version of the parent function
const TargumentChain = trace(
  'TDargumentChain',
  async (query: string, additionalDescription: string = ''): Promise<string> => {
    const argument = await TargumentGenerator(query, additionalDescription);
    const criticism = await Tcritic(argument);
    return await Trefiner(query, additionalDescription, argument, criticism);
  },
);

const TRefinedArgument = trace(
  'TDrefinedArgument',
  async (query: string, refined: string, additionalDescription: string = ''): Promise<string[]> => {
    const criticism = await Tcritic(refined);
    const refined_arg = await Trefiner(query, additionalDescription, refined, criticism);
    return [refined_arg, getCurrentTraceId()];
  },
);

const NestedChain = trace(
  'TDNestedChain',
  async (query: string, additionalDescription: string = ''): Promise<string[]> => {
    const refined = await TargumentChain(query, additionalDescription);
    return await TRefinedArgument(query, refined, additionalDescription);
  },
);

async function main() {
  return await argumentChain(
    'Whether Nitrogen is good for you.',
    'Provide a concise, few sentence argument on why Nitrogen is good for you.',
  );
}

async function main2() {
  return await TargumentChain(
    'Whether lime juice is good for you.',
    'Provide a concise, few sentence argument on why lime juice is good for you.',
  );
}

async function main3() {
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

main().then((result) => console.log(result));
main2().then((result) => console.log(result));
main3().then((result) => console.log(result));
