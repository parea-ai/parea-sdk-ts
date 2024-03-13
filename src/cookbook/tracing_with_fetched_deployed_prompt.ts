import * as dotenv from 'dotenv';

import { Log, UseDeployedPromptResponse } from '../types';
import { Parea } from '../client';
import { trace, traceInsert } from '../utils/trace_utils';
import OpenAI from 'openai';
import { patchOpenAI } from '../utils/wrap_openai';

dotenv.config();

const CONTEXT = `Company: Nike. 2023 
FORM 10-K 35
OPERATING SEGMENTS
As discussed in Note 15 2014 Operating Segments and Related Information in the accompanying Notes to the Consolidated Financial Statements, our operating segments are evidence of the structure of the Company's internal organization. The NIKE Brand segments are defined by geographic regions for operations participating in NIKE Brand sales activity.
The breakdown of Revenues is as follows:
\\n\\n(Dollars in millions)
\\n\\nFISCAL 2023 FISCAL 2022
\\n\\n% CHANGE\\n\\n% CHANGE EXCLUDING CURRENCY (1) CHANGES FISCAL 2021\\n\\n% CHANGE\\n\\n
North America Europe, Middle East & Africa Greater China\\n\\n$\\n\\n21,608 $ 13,418 7,248\\n\\n18,353 12,479 7,547\\n\\n18 % 8 % -4 %\\n\\n18 % $ 21 % 4 %\\n\\n17,179 11,456 8,290\\n\\n7 % 9 % -9 %\\n\\nAsia Pacific & Latin America Global Brand Divisions\\n\\n(3)\\n\\n(2)\\n\\n6,431 58\\n\\n5,955 102\\n\\n8 % -43 %\\n\\n17 % -43 %\\n\\n5,343 25\\n\\n11 % 308 %\\n\\nTOTAL NIKE BRAND Converse\\n\\n$\\n\\n48,763 $ 2,427\\n\\n44,436 2,346\\n\\n10 % 3 %\\n\\n16 % $ 8 %\\n\\n42,293 2,205\\n\\n5 % 6 %\\n\\n(4)\\n\\nCorporate TOTAL NIKE, INC. REVENUES\\n\\n$\\n\\n27\\n\\n51,217 $\\n\\n(72) 46,710\\n\\n— 10 %\\n\\n— 16 % $\\n\\n40 44,538\\n\\n— 5 %`;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const p = new Parea(process.env.PAREA_API_KEY);

patchOpenAI(openai);

async function callOpenAI(
  messages?: Record<string, any>[],
  model?: string,
  temperature?: number,
): Promise<OpenAI.Chat.Completions.ChatCompletionMessage> {
  // @ts-ignore
  const response = await openai.chat.completions.create({ model, messages, temperature });
  return response.choices[0].message;
}

const getPrompt = async (
  deployment_id: string,
  llm_inputs: Record<string, any>,
): Promise<UseDeployedPromptResponse> => {
  return await p.getPrompt({ deployment_id, llm_inputs });
};

async function llmJudgeEval(log: Log): Promise<number> {
  const question = log?.inputs?.question;
  const output = log.output;
  const target = log?.target ?? 'Global Brand Divisions';
  try {
    const response = await callOpenAI(
      [
        {
          role: 'system',
          content: 'You are CompareGPT, a machine to verify the groundedness of predictions. Answer with only yes/no.',
        },
        {
          role: 'user',
          content: `You are given a question, the corresponding ground-truth answer and a prediction from a model. Compare the "Ground-truth answer" and the "Prediction" to determine whether the prediction correctly answers the question. All information in the ground-truth answer must be present in the prediction, including numbers and dates. You must answer "no" if there are any specific details in the ground-truth answer that are not mentioned in the prediction. There should be no contradicting statements in the prediction. The prediction may contain extra information. If the prediction states something as a possibility, treat it as a definitive answer.

          Question: ${question}
          Ground-truth answer: ${target}
          Prediction: ${output}

          CompareGPT response:`,
        },
      ],
      'gpt-3.5-turbo',
      1.0,
    );
    return (response?.content || '')?.toLowerCase()?.includes('yes') ? 1.0 : 0.0;
  } catch (e) {
    return 0.0;
  }
}

const _ragTemplate = async (deployment_id: string, llm_inputs: Record<string, any>): Promise<string> => {
  const deployedPrompt: UseDeployedPromptResponse = await getPrompt(deployment_id, llm_inputs);
  const response = await callOpenAI(
    deployedPrompt.prompt?.messages,
    deployedPrompt.model,
    deployedPrompt?.model_params?.temp,
  );
  console.log('deployedPrompt', deployedPrompt);
  return response.content ?? '';
};

const ragTemplate = trace(
  'ragTemplate',
  async (context: string, question: string): Promise<string> => {
    const deployment_id = 'p-dg9vE-qCJBA84QAnW9fQc';
    const llm_inputs = { context, question };
    traceInsert({ deployment_id: deployment_id });
    return await _ragTemplate(deployment_id, llm_inputs);
  },
  {
    evalFuncs: [llmJudgeEval],
  },
);

async function main() {
  return await ragTemplate(
    CONTEXT,
    'Which operating segment contributed least to total Nike brand revenue in fiscal 2023?',
  );
}

export async function runExperiment() {
  const e = p.experiment(
    [
      {
        context: CONTEXT,
        question: 'Which operating segment contributed least to total Nike brand revenue in fiscal 2023?',
        target: 'Global Brand Divisions',
      },
      {
        context: CONTEXT,
        question: 'Which operating segment contributed most to total Nike brand revenue in fiscal 2023?',
        target: 'North America',
      },
    ],
    ragTemplate,
  );
  return await e.run();
}

main().then((result) => console.log(result));

runExperiment().then(() => {
  console.log('Experiment complete!');
});
