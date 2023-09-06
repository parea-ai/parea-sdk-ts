import * as dotenv from 'dotenv';

import { Completion, CompletionResponse, Message } from '../types';
import { getCurrentTraceId, trace } from '../utils/trace_utils';
import { Parea } from '../client';

dotenv.config();

const p = new Parea(process.env.DEV_API_KEY);

const callLLM = trace(
  'callLLM',
  async (
    data: Message[],
    model: string = 'gpt-3.5-turbo',
    provider: string = 'openai',
    temperature: number = 0.0,
  ): Promise<CompletionResponse> => {
    const completion: Completion = {
      llm_configuration: {
        model: model,
        provider: provider,
        model_params: { temp: temperature },
        messages: data,
      },
      metadata: { source: 'parea-js-sdk' },
    };
    return await p.completion(completion);
  },
);

const argumentGenerator = async (query: string, additionalDescription: string = ''): Promise<string> => {
  const response = await callLLM([
    {
      role: 'system',
      content: `You are a debater making an argument on a topic. ${additionalDescription} The current time is ${new Date().toISOString()}`,
    },
    { role: 'user', content: `The discussion topic is ${query}` },
  ]);
  return response.content;
};
const TargumentGenerator = trace('argumentGenerator', argumentGenerator);

const critic = async (argument: string): Promise<string> => {
  const response = await callLLM([
    {
      role: 'system',
      content: `You are a critic.
        What unresolved questions or criticism do you have after reading the following argument?
        Provide a concise summary of your feedback.`,
    },
    { role: 'system', content: argument },
  ]);
  return response.content;
};
const Tcritic = trace('critic', critic);

const refiner = async (
  query: string,
  additionalDescription: string,
  currentArg: string,
  criticism: string,
): Promise<string> => {
  const response = await callLLM([
    {
      role: 'system',
      content: `You are a debater making an argument on a topic. ${additionalDescription}. The current time is ${new Date().toISOString()}`,
    },
    { role: 'user', content: `The discussion topic is ${query}` },
    { role: 'assistant', content: currentArg },
    { role: 'user', content: criticism },
    {
      role: 'system',
      content: 'Please generate a new argument that incorporates the feedback from the user.',
    },
  ]);
  return response.content;
};
const Trefiner = trace('refiner', refiner);

const argumentChain = async (query: string, additionalDescription: string = ''): Promise<string> => {
  const argument = await TargumentGenerator(query, additionalDescription);
  const criticism = await Tcritic(argument);
  return await Trefiner(query, additionalDescription, argument, criticism);
};
const TargumentChain = trace('TargumentChain', argumentChain);

const argumentChain2 = async (query: string, additionalDescription: string = ''): Promise<[string, string]> => {
  const argument = await TargumentGenerator(query, additionalDescription);
  const criticism = await Tcritic(argument);
  const response = await Trefiner(query, additionalDescription, argument, criticism);
  return [response, getCurrentTraceId()];
};
const TargumentChain2 = trace('TargumentChain2', argumentChain2);

(async () => {
  const result1 = await TargumentChain(
    'Whether coffee is good for you.',
    'Provide a concise, few sentence argument on why coffee is good for you.',
  );
  console.log(result1);

  const [result2, traceId2] = await TargumentChain2(
    'Whether wine is good for you.',
    'Provide a concise, few sentence argument on why wine is good for you.',
  );
  console.log(result2);
  await p.recordFeedback({
    trace_id: traceId2,
    score: 0.0, // 0.0 (bad) to 1.0 (good)
    target: 'Moonshine is wonderful.',
  });
})();
