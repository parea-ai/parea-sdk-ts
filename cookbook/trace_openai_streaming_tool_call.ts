import OpenAI from 'openai';
import { ChatCompletionMessageParam } from 'openai/src/resources/chat/completions';
import * as dotenv from 'dotenv';
import { Parea, patchOpenAI } from '../src';

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});
new Parea(process.env.PAREA_API_KEY);
patchOpenAI(openai);

const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'list',
      description: 'list queries books by genre, and returns a list of names of books',
      parameters: {
        type: 'object',
        properties: {
          genre: { type: 'string', enum: ['mystery', 'nonfiction', 'memoir', 'romance', 'historical'] },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search',
      description: 'search queries books by their name and returns a list of book names and their ids',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get',
      description:
        "get returns a book's detailed information based on the id of the book. Note that this does not accept names, and only IDs, which you can get by using search.",
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
      },
    },
  },
];

async function main() {
  const messages: ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: 'Please use our book database, which you can access using functions to answer the following questions.',
    },
    {
      role: 'user',
      content:
        'I really enjoyed reading To Kill a Mockingbird, could you recommend me a book that is similar and tell me why?',
    },
  ];
  const stream = await openai.chat.completions.create({
    model: 'gpt-3.5-turbo',
    messages,
    tools: tools,
    stream: true,
  });

  for await (const chunk of stream) {
    process.stdout.write(JSON.stringify(chunk.choices[0]?.delta?.tool_calls, null, 2) || '');
  }
}

main();
