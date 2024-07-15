import OpenAI from 'openai';
import { Parea, patchOpenAI } from '../src';
import * as dotenv from 'dotenv';

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});
new Parea(process.env.PAREA_API_KEY);
patchOpenAI(openai);

async function main() {
  const stream = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: 'Write a haiku about flowers' }],
    stream: true,
  });
  for await (const chunk of stream) {
    process.stdout.write(chunk.choices[0]?.delta?.content || '');
  }
}

main();
