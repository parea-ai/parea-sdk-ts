// import { PareaAILangchainTracer } from '../../utils/traceIntegrations/langchain';
// import * as dotenv from 'dotenv';
// import { Parea } from '../../client';
//
// dotenv.config();
//
// new Parea(process.env.DEV_API_KEY);
//
// export const run = async () => {
//   const handler = new PareaAILangchainTracer();
//   const llm = new OpenAI({ temperature: 0, callbacks: [handler] });
//   const prompt = PromptTemplate.fromTemplate('1 + {number} =');
//   const chain = new LLMChain({ prompt, llm, callbacks: [handler] });
//
//   const output = await chain.call({ number: 2 });
//   /*
//   Entering new llm_chain chain...
//   Finished chain.
//   */
//
//   console.log(output);
//   /*
//   { text: ' 3\n\n3 - 1 = 2' }
//    */
//
//   // The non-enumerable key `__run` contains the runId.
//   console.log(output.__run);
//   /*
//   { runId: '90e1f42c-7cb4-484c-bf7a-70b73ef8e64b' }
//   */
// };
