import * as dotenv from 'dotenv';
import { OpenAI } from 'openai';
import { patchOpenAI } from '../utils/wrap_openai';
import { Log, TestCase } from '../types';
import { Parea } from '../client';
import { trace } from '../utils/trace_utils';
import { getCurrentTraceId, traceInsert } from '../utils/context';

dotenv.config();

const p = new Parea(process.env.PAREA_API_KEY);
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});
patchOpenAI(openai);

const NUM_INTERACTIONS = 5;

type Person = {
  name: string;
  email: string;
};

type Email = {
  contact: Person;
  emailSent: string;
};

const mockDB: Record<string, Email> = {};

async function callOpenAI(messages: any[]): Promise<string> {
  const response = await openai.chat.completions.create({ model: 'gpt-4o', messages, temperature: 1 });
  return response.choices[0].message.content ?? '';
}

const evalFunc = (log: Log): number => {
  return Math.random();
};

// Imitate collecting few shot examples from prod based on user feedback
const emailWriter = trace(
  'emailWriter',
  async (main_objective: string, contact: Person, few_shot_examples?: string[] | null): Promise<string> => {
    traceInsert({ end_user_identifier: contact.name, metadata: { has_few_shot_examples: !!few_shot_examples } });

    const few_shot_examples_prompt = few_shot_examples
      ? '\nHere are some examples of good emails\n' + few_shot_examples.join('\n')
      : '';
    const messages = [
      {
        role: 'system',
        content: `You are a debater making an argument on a topic. ${main_objective}.`,
      },
      {
        role: 'user',
        content: `Your email is from: ${JSON.stringify(contact)}
        ${few_shot_examples ? few_shot_examples_prompt : ''}
        Email:
        `,
      },
    ];
    const response = await callOpenAI(messages);
    const trace_id = getCurrentTraceId();
    // insert into mock_DB
    mockDB[trace_id as string] = { contact: contact, emailSent: response };
    return response;
  },
  {
    evalFuncs: [evalFunc],
  },
);

const mimicProd = async (fewShotLimit: number = 3): Promise<void> => {
  const contact: Person = { name: 'John Doe', email: 'jdoe@email.com' };
  const dataset = await p.getCollection('Good_Email_Examples');
  let selectedFewShotExamples: string[] | null = null;

  if (dataset) {
    const testcases: TestCase[] = Object.values(dataset.test_cases);
    const fewShotExamples = testcases
      .filter((case_) => case_.inputs.user === contact.name)
      .map((case_) => case_.inputs.email);
    selectedFewShotExamples = fewShotExamples.slice(-fewShotLimit) || null;
  }

  for (let interaction = 0; interaction < NUM_INTERACTIONS; interaction++) {
    const email = await emailWriter(
      'Convincing email to gym to cancel membership early.',
      contact,
      selectedFewShotExamples,
    );
    console.log(email);
  }
};

const addGoodEmailExampleToDataset = async (userName: string, email: string): Promise<void> => {
  await p.addTestCases([{ user: userName, email }], 'Good_Email_Examples');
};

const mimicProdCheckingEvalScores = async (): Promise<void> => {
  const traceIds = Object.keys(mockDB);
  for (const traceId of traceIds) {
    const scores = await p.getTraceLogScores(traceId);
    for (const score of scores) {
      if (score.name === 'evalFunc' && score.score >= 0.5) {
        await addGoodEmailExampleToDataset(mockDB[traceId].contact.name, mockDB[traceId].emailSent);
        break;
      }
    }
  }
};

const main = async (): Promise<void> => {
  await mimicProd();
  await mimicProdCheckingEvalScores();
  await mimicProd();
  console.log('Done');
};

main().catch(console.error);
