import * as dotenv from 'dotenv';
import { Parea, patchOpenAI } from '../src';
import OpenAI from 'openai';
import { z } from 'zod';
import { zodResponseFormat } from 'openai/helpers/zod';

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// needed for tracing
new Parea(process.env.PAREA_API_KEY);

// Patch OpenAI to add trace logs
patchOpenAI(openai);

const CalendarEvent = z.object({
  name: z.string(),
  date: z.string(),
  participants: z.array(z.string()),
});

const main = async () => {
  const completion = await openai.beta.chat.completions.parse({
    model: 'gpt-4o-2024-08-06',
    messages: [
      { role: 'system', content: 'Extract the event information.' },
      { role: 'user', content: 'Alice and Bob are going to a science fair on Friday.' },
    ],
    response_format: zodResponseFormat(CalendarEvent, 'event'),
  });

  const event = completion.choices[0].message.parsed;

  console.log(event);
};

type Step = {
  explanation: string;
  output: string;
};

type Solution = {
  steps: Step[];
  final_answer: string;
};

const main2 = async () => {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-2024-08-06',
    messages: [
      { role: 'system', content: 'You are a helpful math tutor. Guide the user through the solution step by step.' },
      { role: 'user', content: 'how can I solve 8x + 7 = -23' },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'math_response',
        schema: {
          type: 'object',
          properties: {
            steps: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  explanation: { type: 'string' },
                  output: { type: 'string' },
                },
                required: ['explanation', 'output'],
                additionalProperties: false,
              },
            },
            final_answer: { type: 'string' },
          },
          required: ['steps', 'final_answer'],
          additionalProperties: false,
        },
        strict: true,
      },
    },
  });

  // console.log(response.choices[0].message.content);
  const solution = JSON.parse(response.choices[0].message.content || '') as Solution;
  console.log(solution);
};

main();
main2();
