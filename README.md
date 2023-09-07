# parea-sdk-js

<div align="center">

[![License](https://img.shields.io/github/license/parea-ai/parea-sdk-js)](https://github.com/parea-ai/parea-sdk-js/blob/master/LICENSE)

Parea typescript sdk

</div>

## Installation

```bash
npm install parea-ai
```

## Getting Started

```typescript
import * as dotenv from 'dotenv';
import { Completion, CompletionResponse } from '../types';
import { Parea } from '../client';
import { trace } from '../utils/trace_utils';

dotenv.config();

const p = new Parea(process.env.DEV_API_KEY);

const deployedPromptCall = async (query: string): Promise<string> => {
  const completion: Completion = {
    deployment_id: 'p-XOh3kp8BdnIE82WgioPnr',
    llm_inputs: { query: query },
  };
  const response = await p.completion(completion);
  return response.content;
};

async function main() {
  return await deployedPromptCall('Write a hello world program using Typescript and the React framework.');
}

main().then((result) => console.log(result));
```

### Logging results from LLM providers

```typescript
import * as dotenv from 'dotenv';
import { getCurrentTraceId, trace } from '../utils/trace_utils';
import OpenAI from 'openai';
import { patchOpenAI } from '../utils/wrap_openai';
import { Parea } from '../client';

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Patch OpenAI to add trace logs
patchOpenAI(openai);

async function callOpenAI(
  messages: any[],
  model: string = 'gpt-3.5-turbo-0613',
  temperature: number = 0.0,
): Promise<string> {
  const response = await openai.chat.completions.create({ model, messages, temperature });
  return response.choices[0].message.content ?? '';
}

const deployedPromptCall = async (query: string): Promise<string> => {
  return await callOpenAI([{ role: 'user', content: query }]);
};

async function main() {
  return await deployedPromptCall('Write a hello world program using Typescript and the React framework.');
}

main().then((result) => console.log(result));
```

## 🛡 License

[![License](https://img.shields.io/github/license/parea-ai/parea-sdk-js)](https://github.com/parea-ai/parea-sdk-js/blob/master/LICENSE)

This project is licensed under the terms of the `Apache Software License 2.0` license.
See [LICENSE](https://github.com/parea-ai/parea-sdk/blob/master/LICENSE) for more details.

## 📃 Citation

```bibtex
@misc{parea-sdk-js,
  author = {parea-ai},
  title = {Parea typescript sdk},
  year = {2023},
  publisher = {GitHub},
  journal = {GitHub repository},
  howpublished = {\url{https://github.com/parea-ai/parea-sdk-js}}
}
```
