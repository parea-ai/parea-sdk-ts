import * as dotenv from 'dotenv';
import { trace, traceInsert } from '../utils/trace_utils';
import OpenAI from 'openai';
import { patchOpenAI } from '../utils/wrap_openai';
import { Parea } from '../client';

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// needed for tracing
new Parea(process.env.PAREA_API_KEY);

// Patch OpenAI to add trace logs
patchOpenAI(openai);

const imageMaker = trace('imageMaker', async (query: string): Promise<string | undefined> => {
  const response = await openai.images.generate({ prompt: query, model: 'dall-e-3' });
  const image_url = response.data[0].url;
  const caption = { original_prompt: query, revised_prompt: response.data[0].revised_prompt };
  traceInsert({ images: [{ url: image_url, caption: JSON.stringify(caption) }] });
  return image_url;
});

const askVision = trace('askVision', async (image_url: string): Promise<string | null> => {
  const response = await openai.chat.completions.create({
    model: 'gpt-4-vision-preview',
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'What’s in this image?' },
          { type: 'image_url', image_url: { url: image_url } },
        ],
      },
    ],
  });
  return response.choices[0].message.content;
});

const imageChain = trace('imageChain', async (query: string) => {
  const image_url = await imageMaker(query);
  if (!image_url) {
    return null;
  }
  return await askVision(image_url);
});

async function main(query: string) {
  return await imageChain(query);
}

main('A dog sitting comfortably on a bed').then((result) => console.log(result));
