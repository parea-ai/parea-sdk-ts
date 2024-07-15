import OpenAI from 'openai';
import { Parea, patchOpenAI, trace } from '../src';
import * as dotenv from 'dotenv';

dotenv.config();
const openai = new OpenAI();

new Parea(process.env.PAREA_API_KEY);

// Patch OpenAI to add trace logs
patchOpenAI(openai);

async function toolCallExample() {
  const messages: any[] = [{ role: 'user', content: "What's the weather like in Boston today?" }];
  const functionDef = {
    name: 'get_current_weather',
    description: 'Get the current weather in a given location',
    parameters: {
      type: 'object',
      properties: {
        location: {
          type: 'string',
          description: 'The city and state, e.g. San Francisco, CA',
        },
        unit: { type: 'string', enum: ['celsius', 'fahrenheit'] },
      },
      required: ['location'],
    },
  };
  const tools: any[] = [
    {
      type: 'function',
      function: functionDef,
    },
  ];

  const completion = await openai.chat.completions.create({
    model: 'gpt-3.5-turbo',
    messages: messages,
    tools: tools,
  });
  console.log(completion.choices[0].message.tool_calls);
  messages.push(completion.choices[0].message);
  messages.push({
    role: 'tool',
    content: '5 Celcius',
    tool_call_id: completion?.choices?.[0]?.message?.tool_calls?.[0].id,
  });
  messages.push({ role: 'user', content: "What's the weather like in Boston today?" });
  const response = await openai.chat.completions.create({
    model: 'gpt-3.5-turbo',
    messages: messages,
    tools: tools,
  });

  console.log(response.choices[0].message);
}

const main = trace('main', toolCallExample);

main()
  .then(() => console.log('Done'))
  .catch((error) => console.error(error));
