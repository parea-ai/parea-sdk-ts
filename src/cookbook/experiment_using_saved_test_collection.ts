import { Parea } from '../client';
import { Completion, CompletionResponse, Log, Message } from '../types';
import * as dotenv from 'dotenv';
import { trace3 } from '../utils/V4/utils/trace';

dotenv.config();

const p = new Parea(process.env.PAREA_API_KEY);

function evalFunc(log: Log): number {
  if (log.inputs?.['x']?.toLowerCase() === 'python') {
    return 1.0;
  }
  return Math.random();
}

const callLLM = async (data: Message[]): Promise<CompletionResponse> => {
  const completion: Completion = {
    llm_configuration: {
      model: 'gpt-4',
      model_params: { temp: 1.0 },
      messages: data,
    },
  };
  return await p.completion(completion);
};

const helloWorld = trace3(
  'helloWorld',
  async (x: string, y: string): Promise<string> => {
    const response = await callLLM([{ role: 'user', content: `Write a hello world program in ${x} using ${y}` }]);
    return response.content;
  },
  {
    evalFuncs: [evalFunc],
  },
);

export async function main() {
  const e = p.experiment(
    'Hello World Evals',
    'Hello World Example', // this is the name of my Test Collection in Parea (TestHub page)
    helloWorld,
  );
  return await e.run();
}

main().then(() => {
  console.log('Experiment complete!');
});
