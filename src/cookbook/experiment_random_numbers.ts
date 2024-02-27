import { Parea } from '../client';
import { Completion, CompletionResponse, Log, Message } from '../types';
import { trace } from '../utils/trace_utils';
import * as dotenv from 'dotenv';

dotenv.config();

const p = new Parea(process.env.PAREA_API_KEY);

function isBetween1AndN(log: Log): number {
  // Evaluates if the number is between 1 and n
  if (!log || !log?.inputs || !log?.output) {
    return 0.0;
  }
  const n = log.inputs?.['n'];
  try {
    return 1.0 <= parseFloat(log.output) && parseFloat(log.output) <= parseFloat(n) ? 1.0 : 0.0;
  } catch (e) {
    return 0.0;
  }
}

const callLLM = async (
  data: Message[],
  model: string = 'gpt-3.5-turbo',
  temperature: number = 0.0,
): Promise<CompletionResponse> => {
  const completion: Completion = {
    llm_configuration: {
      model: model,
      model_params: { temp: temperature },
      messages: data,
    },
  };
  return await p.completion(completion);
};

const generateRandomNumber = trace(
  'generateRandomNumber',
  async (n: string): Promise<string> => {
    const response = await callLLM([{ role: 'user', content: `Generate a number between 1 and ${n}.` }]);
    return response.content;
  },
  {
    evalFuncs: [isBetween1AndN],
  },
);

export async function main() {
  const e = p.experiment(
    [{ n: '10' }], // Data to run the experiment on (list of dicts)
    generateRandomNumber, // Function to run (callable)
  );
  return await e.run();
}

main().then(() => {
  console.log('Experiment complete!');
});
