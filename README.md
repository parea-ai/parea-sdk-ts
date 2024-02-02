# parea-sdk-ts

<div align="center">

[![License](https://img.shields.io/github/license/parea-ai/parea-sdk-ts)](https://github.com/parea-ai/parea-sdk-ts/blob/master/LICENSE)

Parea typescript sdk

</div>

## Installation

```bash
npm install parea-ai
```

[TypeScript SDK Docs](https://docs.parea.ai/api-reference/sdk/typescript)

## Getting Started

```typescript
import {Completion, CompletionResponse, Parea} from "parea-ai";

const p = new Parea('PAREA_API_KEY');

const deployedPromptCall = async (query: string): Promise<string> => {
  const completion: Completion = {
    deployment_id: 'Deployment_ID',
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

### Logging results from LLM providers & recording user feedback

```typescript
import OpenAI from 'openai';
import {patchOpenAI, Parea, getCurrentTraceId} from "parea-ai";

const openai = new OpenAI({ apiKey: 'OPENAI_API_KEY' });

// Patch OpenAI to add trace logs
patchOpenAI(openai);
const p = new Parea('PAREA_API_KEY');

async function callOpenAI(
  messages: any[],
  model: string = 'gpt-3.5-turbo-0125',
  temperature: number = 0.0,
): Promise<string> {
  const response = await openai.chat.completions.create({ model, messages, temperature });
  return response.choices[0].message.content ?? '';
}

async function main() {
   const result = await callOpenAI([{ role: 'user', content: 'Write a hello world program using Typescript and the React framework.'}]);
   // record feedback on result
   const traceId = getCurrentTraceId();
   await p.recordFeedback({
      trace_id: traceId,
      score: 0.21, // 0.0 (bad) to 1.0 (good)
   });
   return result;
}

main().then((result) => console.log(result));
```

## 🛡 License

[![License](https://img.shields.io/github/license/parea-ai/parea-sdk-ts)](https://github.com/parea-ai/parea-sdk-ts/blob/master/LICENSE)

This project is licensed under the terms of the `Apache Software License 2.0` license.
See [LICENSE](https://github.com/parea-ai/parea-sdk/blob/master/LICENSE) for more details.

## 📃 Citation

```bibtex
@misc{parea-sdk-ts,
  author = {parea-ai},
  title = {Parea typescript sdk},
  year = {2023},
  publisher = {GitHub},
  journal = {GitHub repository},
  howpublished = {\url{https://github.com/parea-ai/parea-sdk-ts}}
}
```
