import * as dotenv from 'dotenv';
import { getCurrentTraceId, Log, Parea, patchOpenAI, trace } from '../src';
import OpenAI from 'openai';

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// needed for tracing
const p = new Parea(process.env.PAREA_API_KEY);

// Patch OpenAI to add trace logs
patchOpenAI(openai);

async function callOpenAI(messages: any[], model: string = 'gpt-4o', temperature: number = 0.0): Promise<string> {
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

// Example 1: Not using trace wrapper, but OpenAI calls are automatically traced with the patchOpenAI function
const argumentChain = async (query: string, additionalDescription: string = ''): Promise<string> => {
  const argument = await argumentGenerator(query, additionalDescription);
  const criticism = await critic(argument);
  return await refiner(query, additionalDescription, argument, criticism);
};

// Example 2: Using trace wrapper to also capture the inputs and outputs of the argumentChain function
const TargumentChain = trace(
  'TargumentChain',
  argumentChain,
  // you can add metadata and endUserIdentifier to trace for filtering in the dashboard
  {
    metadata: { purpose: 'test' },
    endUserIdentifier: 'user_id',
    sessionId: 'session_id',
  },
);

const TRefinedArgument = trace(
  'TDrefinedArgument',
  async (query: string, refined: string, additionalDescription: string = ''): Promise<string[]> => {
    const traceId = getCurrentTraceId() as string;
    const criticism = await critic(refined);
    const refined_arg = await refiner(query, additionalDescription, refined, criticism);
    return [refined_arg, traceId];
  },
);

function IsEqual(log: Log): number {
  console.log(log?.inputs);
  return Math.random();
}

// Example 3: Nested tracing is also supported if the sub-functions are wrapped with trace
const NestedChain = trace(
  'TDNestedChain',
  async (query: string, additionalDescription: string = ''): Promise<string[]> => {
    const refined = await TargumentChain(query, additionalDescription);
    return await TRefinedArgument(query, refined, additionalDescription);
  },
  // you can also use other options like evalFuncs to add eval scores to the trace, accessOutputOfFunc, applyEvalFrac and more
  {
    evalFuncs: [IsEqual],
    // or evalFuncNames: ["Name of eval defined in Parea"]
    accessOutputOfFunc: (arg0: any) => arg0[0], // apply a function to the output of the trace to modify it
    applyEvalFrac: 0.5, // apply evalFuncs to 50% of traces
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

// Example 4: JSON mode
async function main4() {
  const response = await openai.chat.completions.create({
    model: 'gpt-4-turbo-2024-04-09',
    messages: [
      { role: 'system', content: 'You are a helpful assistant talking in JSON.' },
      { role: 'user', content: 'What are you?' },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.0,
  });
  return response.choices[0].message.content ?? '';
}

main().then((result) => console.log(result));
main2().then((result) => console.log(result));
main3().then((result) => console.log(result));
main4().then((r) => console.log(r));
