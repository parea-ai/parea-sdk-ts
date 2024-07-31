// checkout the associated tutorial at https://docs.parea.ai//tutorials/running-ab-tests/llm-generated-emails

import * as dotenv from 'dotenv';
import { OpenAI } from 'openai';
import { Parea, patchOpenAI, trace, getCurrentTraceId, traceInsert, pareaLogger } from '../src';

dotenv.config();
new Parea(process.env.PAREA_API_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
// wrap OpenAI client to trace LLM calls
patchOpenAI(openai);

const abTestName = 'long-vs-short-emails';

// use trace to capture inputs, outputs of your function
const generateEmail = trace(
  'generate_email',
  async (user: string): Promise<[string | null, string | undefined, string]> => {
    // randomly choose to generate a long or short email
    const variant = Math.random() < 0.5 ? 'variant_0' : 'variant_1';
    let prompt;
    if (variant === 'variant_0') {
      prompt = `Generate a long email for ${user}`;
    } else {
      prompt = `Generate a short email for ${user}`;
    }
    // tag the requests with the A/B test name & chosen variant
    traceInsert({
      metadata: {
        ab_test_name: abTestName,
        [`ab_test_${abTestName}`]: variant,
      },
    });

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });
    return [response.choices[0].message.content, getCurrentTraceId(), variant];
  },
);

const captureFeedback = async (
  feedback: number,
  traceId: string,
  abTestVariant: string,
  userCorrectEmail: string = '',
): Promise<void> => {
  await pareaLogger.updateLog({
    trace_id: traceId,
    field_name_to_value_map: {
      scores: [
        {
          name: `ab_test_${abTestVariant}`,
          score: feedback,
          reason: "any additional user feedback on why it's good/bad",
        },
      ],
      target: userCorrectEmail,
    },
  });
};

const main = async () => {
  const [email, traceId, abTestVariant] = await generateEmail('Max Mustermann');
  console.log('email:', email);
  const userFeedback =
    abTestVariant === 'variant_1' ? (Math.random() < 0.7 ? 0.0 : 1.0) : Math.random() < 0.3 ? 0.0 : 1.0;
  await captureFeedback(userFeedback, traceId || '', abTestVariant, 'Hi Max');
};

main().then(() => console.log('Done!'));
