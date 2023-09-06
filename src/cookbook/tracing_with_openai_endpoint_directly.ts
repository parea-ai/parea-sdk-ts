import * as dotenv from 'dotenv';
import { trace } from '../utils/trace_utils';
import OpenAI from 'openai';
import { patchOpenAI } from '../utils/wrap_openai';
import { Parea } from '../client';

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// needed for tracing
new Parea(process.env.DEV_API_KEY);

// Patch OpenAI
patchOpenAI(openai);

async function callOpenAI(
  messages: any[],
  model: string = 'gpt-3.5-turbo-0613',
  temperature: number = 0.0,
): Promise<string | null> {
  const response = await openai.chat.completions.create({ model, messages, temperature });
  return response.choices[0].message.content;
}

const argumentGenerator = async (query: string, additionalDescription: string = ''): Promise<string | null> => {
  return await callOpenAI([
    {
      role: 'system',
      content: `You are a debater making an argument on a topic. ${additionalDescription} The current time is ${new Date().toISOString()}`,
    },
    { role: 'user', content: `The discussion topic is ${query}` },
  ]);
};
const TargumentGenerator = trace('argumentGenerator', argumentGenerator, { source: 'parea-js-sdk-oai' });

const critic = async (argument: string): Promise<string | null> => {
  return await callOpenAI([
    {
      role: 'system',
      content: `You are a critic. What unresolved questions or criticism do you have after reading the following argument? Provide a concise summary of your feedback.`,
    },
    { role: 'user', content: argument },
  ]);
};
const Tcritic = trace('critic', critic, { source: 'parea-js-sdk-oai' });

const refiner = async (
  query: string,
  additionalDescription: string,
  currentArg: string,
  criticism: string,
): Promise<string | null> => {
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
const Trefiner = trace('refiner', refiner, { source: 'parea-js-sdk-oai' });

const argumentChain = async (query: string, additionalDescription: string = ''): Promise<string> => {
  const argument = await TargumentGenerator(query, additionalDescription);
  const criticism = await Tcritic(argument);
  return await Trefiner(query, additionalDescription, argument, criticism);
};
const TargumentChain = trace('argumentChain', argumentChain, { source: 'parea-js-sdk-oai' });

(async () => {
  const result = await TargumentChain(
    'Whether sparkling water is good for you.',
    'Provide a concise, few sentence argument on why sparkling water is good for you.',
  );
  console.log(result);
})();
