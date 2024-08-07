import * as dotenv from 'dotenv';
import { Completion, CompletionResponse, Parea, TestCase, trace, traceInsert } from '../src';

dotenv.config();

const p = new Parea(process.env.PAREA_API_KEY);

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

const callLLM = async (messages: { role: string; content: string }[]): Promise<CompletionResponse> => {
  const completion: Completion = {
    llm_configuration: {
      model: 'gpt-4o',
      model_params: { temp: 1 },
      messages: messages,
    },
  };
  return await p.completion(completion);
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
      // added date to prompt to avoid cache
      {
        role: 'user',
        content: `Your email is from: ${JSON.stringify(contact)}
    Today's date is: ${new Date().toISOString()}
    ${few_shot_examples ? few_shot_examples_prompt : ''}
    Email:
    `,
      },
    ];
    const response: CompletionResponse = await callLLM(messages);
    const trace_id = response.inference_id;
    // insert into mock_DB
    mockDB[trace_id] = { contact: contact, emailSent: response.content };
    return response.content;
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

const mimicProdFeedbackCollection = async (): Promise<void> => {
  const traceIds = Object.keys(mockDB);
  for (const traceId of traceIds) {
    const score = Math.random();
    await p.recordFeedback({ trace_id: traceId, score });
    if (score >= 0.5) {
      await addGoodEmailExampleToDataset(mockDB[traceId].contact.name, mockDB[traceId].emailSent);
    }
  }
};

const main = async (): Promise<void> => {
  await mimicProd();
  await mimicProdFeedbackCollection();
  await mimicProd();
  console.log('Done');
};

main().catch(console.error);
