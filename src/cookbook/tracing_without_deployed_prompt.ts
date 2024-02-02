import * as dotenv from 'dotenv';

import { Completion, CompletionResponse } from '../types';
import { Parea } from '../client';
import { getCurrentTraceId, trace } from '../utils/trace_utils';

dotenv.config();

const p = new Parea(process.env.DEV_API_KEY);

// If you want to log the inputs to the LLM call you can optionally add a trace wrappeer
const callLLM = trace(
  'callLLM',
  async (
    data: { role: string; content: string }[],
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

// Traced version of the parent function
const argumentChain = trace(
  'argumentChain',
  async (query: string, additionalDescription: string = ''): Promise<string> => {
    const argument = await argumentGenerator(query, additionalDescription);
    const criticism = await critic(argument);
    return await refiner(query, additionalDescription, argument, criticism);
  },
);

const TRefinedArgument = trace(
  'TrefinedArgument',
  async (query: string, refined: string, additionalDescription: string = ''): Promise<string[]> => {
    const traceId = getCurrentTraceId() || '';
    const criticism = await critic(refined);
    const refined_arg = await refiner(query, additionalDescription, refined, criticism);
    return [refined_arg, traceId];
  },
);

const NestedChain = trace(
  'NestedChain',
  async (query: string, additionalDescription: string = ''): Promise<string[]> => {
    const refined = await argumentChain(query, additionalDescription);
    return await TRefinedArgument(query, refined, additionalDescription);
  },
);

async function main() {
  return await argumentChain(
    'Whether eustress is good for you.',
    'Provide a concise, few sentence argument on why eustress is good for you.',
  );
}

async function main2() {
  const [result, traceId] = await NestedChain(
    'Whether apples is good for you.',
    'Provide a concise, few sentence argument on why apples is good for you.',
  );
  await p.recordFeedback({
    trace_id: traceId,
    score: 0.21, // 0.0 (bad) to 1.0 (good)
  });
  return result;
}

async function main3() {
  const completion: Completion = {
    llm_configuration: {
      model: 'gpt-4-1106-preview',
      provider: 'openai',
      model_params: { temp: 0.0, response_format: { type: 'json_object' } },
      messages: [
        { role: 'system', content: 'You are a helpful assistant talking in JSON.' },
        { role: 'user', content: 'What are you?' },
      ],
    },
    metadata: { source: 'parea-js-sdk' },
  };
  return await p.completion(completion);
}

main().then((result) => console.log(result));
main2().then((result) => console.log(result));
main3().then((result) => console.log(result));
