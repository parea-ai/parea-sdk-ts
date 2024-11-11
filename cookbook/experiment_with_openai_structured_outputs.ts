import * as dotenv from 'dotenv';
import { EvaluationResult, Log, Parea, patchOpenAI, trace } from '../src';
import OpenAI from 'openai';
import { z } from 'zod';
import { zodResponseFormat } from 'openai/helpers/zod';

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// needed for tracing
const p = new Parea(process.env.PAREA_API_KEY);

// Patch OpenAI to add trace logs
patchOpenAI(openai);

const CalendarEvent = z.object({
  name: z.string(),
  date: z.string(),
  participants: z.array(z.string()),
});

function isCorrect(log: Log): EvaluationResult {
  const po = JSON.parse(log.output || '{}');
  const pt = JSON.parse(log.target || '{}');
  if (po?.name === pt?.name && po?.date === pt?.date && po?.participants?.length === pt?.participants?.length) {
    return { name: 'matches_target', score: 1.0, reason: 'Output matches target' };
  } else {
    return { name: 'matches_target', score: 0, reason: 'Output does not match target' };
  }
}

const calendarEvent = trace(
  'calendarEvent',
  async (names: string): Promise<any> => {
    const completion = await openai.beta.chat.completions.parse({
      model: 'gpt-4o-2024-08-06',
      messages: [
        { role: 'system', content: 'Extract the event information.' },
        { role: 'user', content: `${names} are going to a science fair on Friday.` },
      ],
      response_format: zodResponseFormat(CalendarEvent, 'event'),
    });

    return completion.choices[0].message.parsed;
  },
  {
    evalFuncs: [isCorrect],
  },
);

export async function main() {
  const e = p.experiment(
    'Evals With Structured Output',
    [
      {
        name: 'Alice and Bob',
        target: {
          name: 'Science Fair',
          date: 'Friday',
          participants: ['Alice', 'Bob'],
        },
      },
      {
        name: 'Joe and Sal',
        target: {
          name: 'Science Fair',
          date: 'Friday',
          participants: ['Joe', 'Sal'],
        },
      },
    ],
    calendarEvent,
  );
  return await e.run();
}

main().then(() => {
  console.log('Experiment complete!');
});
