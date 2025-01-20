import * as dotenv from 'dotenv';
import { trace } from '../utils/trace_utils';
import { Parea } from '../client';
import { patchAntrhopic } from '../utils/wrap_Anthropic';
import { Anthropic } from '@anthropic-ai/sdk';

dotenv.config();

const anthropic = new Anthropic();
new Parea(process.env.PAREA_API_KEY);
patchAntrhopic(anthropic);

const calls: Anthropic.CompletionCreateParams.CompletionCreateParamsNonStreaming[] = [
  {
    max_tokens_to_sample: 1000,
    model: 'claude-2.1',
    prompt: 'write a poem on lion',
  },
  {
    max_tokens_to_sample: 1000,
    model: 'cllaude-3-sonnet-20240229',
    prompt: 'Search for books written by Stephen King.',
  },
  {
    max_tokens_to_sample: 1000,
    model: 'claude-3-haiku-20240307',
    prompt: 'Get details of a random book.',
  },
  {
    max_tokens_to_sample: 1000,
    model: 'claude-3-opus-20240229',
    prompt: 'Recommend a book based on recent trends.',
  },
];

async function callCalls(calls: Anthropic.CompletionCreateParams.CompletionCreateParamsNonStreaming[]): Promise<any[]> {
  const completions: any[] = [];

  for (const call of calls) {
    const completion = await callClaude20(call);
    completions.push(completion);
  }

  return completions;
}

async function callClaude20(calls: Anthropic.CompletionCreateParams.CompletionCreateParamsNonStreaming): Promise<any> {
  const { prompt, max_tokens_to_sample } = calls;

  const response = await anthropic.completions.create({
    model: 'claude-2.0',
    prompt,
    max_tokens_to_sample,
  });

  return response.completion;
}

const TcallCalls = trace('callCalls', callCalls, { metadata: { source: 'anthropic-call-calls' } });

async function main() {
  await TcallCalls(calls);
}

main();
