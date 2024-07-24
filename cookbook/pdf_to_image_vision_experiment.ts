import { Parea, patchOpenAI, trace } from '../src';
import * as dotenv from 'dotenv';
import OpenAI from 'openai';
import * as fs from 'node:fs';
import { ChatCompletionContentPart } from 'openai/src/resources/chat/completions';

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});
new Parea(process.env.PAREA_API_KEY);
patchOpenAI(openai);

const imageMaker = trace('imageMaker', async (folderPath: string): Promise<Array<ChatCompletionContentPart>> => {
  const imagePaths = fs.readdirSync(folderPath);
  const imageFilePaths = imagePaths.map((path) => folderPath + '/' + path);
  return imageFilePaths.map((image): ChatCompletionContentPart => {
    const imageAsBase64 = fs.readFileSync(image, 'base64');
    return { type: 'image_url', image_url: { url: `data:image/png;base64,${imageAsBase64}` } };
  });
});

const askVision = trace('askVision', async (images: Array<ChatCompletionContentPart>): Promise<string | null> => {
  const response = await openai.chat.completions.create({
    model: 'gpt-4-vision-preview',
    messages: [
      {
        role: 'user',
        content: [{ type: 'text', text: 'What’s in this image?' }, ...images],
      },
    ],
  });
  return response.choices[0].message.content;
});

const imageChain = trace('imageChain', async (folderPath: string) => {
  const image_url = await imageMaker(folderPath);
  if (!image_url) {
    return null;
  }
  return await askVision(image_url);
});

async function main(query: string) {
  return await imageChain(query);
}

main('./cookbook/data/images').then((result) => console.log(result));
