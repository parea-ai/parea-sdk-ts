import * as dotenv from 'dotenv';

import { Completion, CompletionResponse, Message, Role } from '../types';
import { Parea } from '../client';
import { getCurrentTraceId, trace } from '../utils/trace_utils';

dotenv.config();

const p = new Parea(process.env.DEV_API_KEY);

const callLLM = async (
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
};

const argumentGenerator = async (query: string, additionalDescription: string = ''): Promise<string> => {
  const response = await callLLM([
    {
      role: Role.system,
      content: `You are a debater making an argument on a topic. ${additionalDescription} The current time is ${new Date().toISOString()}`,
    },
    { role: Role.user, content: `The discussion topic is ${query}` },
  ]);
  return response.content;
};

const critic = async (argument: string): Promise<string> => {
  const response = await callLLM([
    {
      role: Role.system,
      content: `You are a critic.
        What unresolved questions or criticism do you have after reading the following argument?
        Provide a concise summary of your feedback.`,
    },
    { role: Role.system, content: argument },
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
      role: Role.system,
      content: `You are a debater making an argument on a topic. ${additionalDescription}. The current time is ${new Date().toISOString()}`,
    },
    { role: Role.user, content: `The discussion topic is ${query}` },
    { role: Role.assistant, content: currentArg },
    { role: Role.user, content: criticism },
    {
      role: Role.system,
      content: 'Please generate a new argument that incorporates the feedback from the user.',
    },
  ]);
  return response.content;
};

const argumentChain = async (query: string, additionalDescription: string = ''): Promise<string> => {
  const argument = await argumentGenerator(query, additionalDescription);
  const criticism = await critic(argument);
  return await refiner(query, additionalDescription, argument, criticism);
};

// Traced versions of the functions above
const TargumentGenerator = trace('TargumentGenerator', argumentGenerator);
const Tcritic = trace('Tcritic', critic);
const Trefiner = trace('Trefiner', refiner);

// Traced version of the parent function
const TargumentChain = trace(
  'TargumentChain',
  async (query: string, additionalDescription: string = ''): Promise<string> => {
    const argument = await TargumentGenerator(query, additionalDescription);
    const criticism = await Tcritic(argument);
    return await Trefiner(query, additionalDescription, argument, criticism);
  },
);

const TRefinedArgument = trace(
  'TrefinedArgument',
  async (query: string, refined: string, additionalDescription: string = ''): Promise<string[]> => {
    const criticism = await Tcritic(refined);
    const refined_arg = await Trefiner(query, additionalDescription, refined, criticism);
    return [refined_arg, getCurrentTraceId()];
  },
);

const NestedChain = trace(
  'NestedChain',
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
