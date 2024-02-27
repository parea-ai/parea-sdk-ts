import { PareaAILangchainTracer } from '../../utils/traceIntegrations/langchain';
import * as dotenv from 'dotenv';
import { Parea } from '../../client';
import { PromptTemplate } from '@langchain/core/prompts';
import { OpenAI } from '@langchain/openai';
import { LLMChain } from 'langchain/chains';

dotenv.config();

new Parea(process.env.PAREA_API_KEY);
const handler = new PareaAILangchainTracer();
export const run = async () => {
  const llm = new OpenAI({ temperature: 0 });
  const prompt = PromptTemplate.fromTemplate('2 + {number} =');
  const chain = new LLMChain({ prompt, llm });

  const output = await chain.invoke({ number: 2 }, { callbacks: [handler] });
  /*
  Entering new llm_chain chain...
  Finished chain.
  */

  console.log(output);
  /*
  { text: ' 3\n\n3 - 1 = 2' }
   */
};

run();
