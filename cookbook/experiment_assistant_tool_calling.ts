import * as dotenv from 'dotenv';
import OpenAI from 'openai';

import { Log, Parea, trace } from '../src';

dotenv.config();

const p = new Parea(process.env.PAREA_API_KEY);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function isCorrectToolCall(log: Log): boolean {
  return log?.output === log.target;
}

const toolCall = trace(
  'toolCall',
  async (userMessage: string): Promise<string> => {
    const assistant = await openai.beta.assistants.create({
      instructions: 'You are a weather bot. Use the provided functions to answer questions.',
      model: 'gpt-4-turbo-preview',
      tools: [
        {
          type: 'function',
          function: {
            name: 'getCurrentWeather',
            description: 'Get the weather in location',
            parameters: {
              type: 'object',
              properties: {
                location: { type: 'string', description: 'The city and state e.g. San Francisco, CA' },
                unit: { type: 'string', enum: ['c', 'f'] },
              },
              required: ['location'],
            },
          },
        },
        {
          type: 'function',
          function: {
            name: 'getNickname',
            description: 'Get the nickname of a city',
            parameters: {
              type: 'object',
              properties: {
                location: { type: 'string', description: 'The city and state e.g. San Francisco, CA' },
              },
              required: ['location'],
            },
          },
        },
      ],
    });
    const thread = await openai.beta.threads.create({
      messages: [
        {
          role: 'user',
          content: userMessage,
        },
      ],
    });

    let run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id: assistant.id,
    });
    while (run.status !== 'requires_action') {
      run = await openai.beta.threads.runs.retrieve(thread.id, run.id);
      // wait for 1 second before checking the status again
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    return run?.required_action?.submit_tool_outputs?.tool_calls?.[0]?.function.name || '';
  },
  {
    evalFuncs: [isCorrectToolCall],
  },
);

async function main() {
  const e = p.experiment(
    'Assistants Tool Calling',
    [
      { userMessage: "What's the weather in San Francisco?", target: 'getCurrentWeather' },
      { userMessage: "What's the nickname of San Francisco?", target: 'getNickname' },
    ],
    toolCall,
  );
  return await e.run();
}

main().then(() => {
  console.log('Experiment complete!');
});
