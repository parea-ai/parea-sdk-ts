import * as dotenv from 'dotenv';

import { Completion, CompletionResponse } from '../types';
import { Parea } from '../client';
import { trace } from '../utils/trace_utils';

dotenv.config();

const p = new Parea(process.env.DEV_API_KEY);

const deployedArgumentGenerator = async (query: string, additionalDescription: string = ''): Promise<string> => {
  const completion: Completion = {
    deployment_id: 'p-XOh3kp8B0nIE82WgioPnr',
    llm_inputs: {
      additional_description: additionalDescription,
      date: new Date().toISOString(),
      query: query,
    },
    metadata: { source: 'parea-js-sdk' },
    trace_name: 'deployedArgumentGenerator',
    end_user_identifier: 'test-user',
  };
  const response = await p.completion(completion);
  return response.content;
};

const deployedCritic = async (argument: string): Promise<string> => {
  const completion: Completion = {
    deployment_id: 'p-PSOwRyIPaQRq4xQW3MbpV',
    llm_inputs: { argument: argument },
    metadata: { source: 'parea-js-sdk' },
    trace_name: 'deployedCritic',
    end_user_identifier: 'test-user',
  };
  const response = await p.completion(completion);
  return response.content;
};

const deployedRefiner = async (
  query: string,
  additionalDescription: string,
  argument: string,
  criticism: string,
): Promise<CompletionResponse> => {
  const completion: Completion = {
    deployment_id: 'p-bJ3-UKh9-ixapZafaRBsj',
    llm_inputs: {
      additional_description: additionalDescription,
      date: new Date().toISOString(),
      query: query,
      argument: argument,
      criticism: criticism,
    },
    metadata: { source: 'parea-js-sdk' },
    trace_name: 'deployedRefiner',
    end_user_identifier: 'test-user',
  };
  return await p.completion(completion);
};

const deployedArgumentChain = async (
  query: string,
  additionalDescription: string = '',
): Promise<CompletionResponse> => {
  const argument = await deployedArgumentGenerator(query, additionalDescription);
  const criticism = await deployedCritic(argument);
  return await deployedRefiner(query, additionalDescription, argument, criticism);
};

// Traced version of the parent function
const TdeployedArgumentChain = trace(
  'TdeployedArgumentChain',
  async (query: string, additionalDescription: string = ''): Promise<CompletionResponse> => {
    const argument = await deployedArgumentGenerator(query, additionalDescription);
    const criticism = await deployedCritic(argument);
    return await deployedRefiner(query, additionalDescription, argument, criticism);
  },
);

const RefinedArgument = async (
  query: string,
  refined: string,
  additionalDescription: string = '',
): Promise<CompletionResponse> => {
  const criticism = await deployedCritic(refined);
  return await deployedRefiner(query, additionalDescription, refined, criticism);
};

const TRefinedArgument = trace('TRefinedArgument', RefinedArgument);

const NestedChain = trace(
  'NestedChain',
  async (query: string, additionalDescription: string = ''): Promise<CompletionResponse> => {
    const refined = await TdeployedArgumentChain(query, additionalDescription);
    return await TRefinedArgument(query, refined.content, additionalDescription);
  },
);

async function main() {
  return await deployedArgumentChain(
    'Whether Oxygen is good for you.',
    'Provide a concise, few sentence argument on why Oxygen is good for you.',
  );
}

async function main2() {
  const result2 = await TdeployedArgumentChain(
    'Whether lime juice is good for you.',
    'Provide a concise, few sentence argument on why lime juice is good for you.',
  );
  await p.recordFeedback({
    trace_id: result2.inference_id,
    score: 1, // 0.0 (bad) to 1.0 (good)
  });
  return result2;
}

async function main3() {
  const result2 = await NestedChain(
    'Whether apple juice is good for you.',
    'Provide a concise, few sentence argument on why apple juice is good for you.',
  );
  await p.recordFeedback({
    trace_id: result2.inference_id,
    score: 0, // 0.0 (bad) to 1.0 (good)
  });
  return result2;
}

main().then((result) => console.log(result));
main2().then((result) => console.log(result));
main3().then((result) => console.log(result));
