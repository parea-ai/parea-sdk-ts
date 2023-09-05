import * as dotenv from "dotenv";
import Parea from "../client.js";
import { Completion, CompletionResponse } from "../types.js";
import { trace } from "../utils/trace_utils";

dotenv.config();

export const p = new Parea(process.env.DEV_API_KEY);

const deployedArgumentGenerator = async (
  query: string,
  additionalDescription: string = "",
): Promise<string> => {
  const completion: Completion = {
    deployment_id: "p-Ar-Oi14-nBxHUiradyql9",
    llm_inputs: {
      additional_description: additionalDescription,
      date: new Date().toISOString(),
      query: query,
    },
    metadata: { source: "parea-js-sdk" },
  };
  const response = await p.completion(completion);
  return response.content;
};
const TdeployedArgumentGenerator = trace(
  "deployedArgumentGenerator",
  deployedArgumentGenerator,
  "TdeployedArgumentGenerator",
  ["parea-js-sdk"],
  { source: "parea-js-sdk-base" },
);

const deployedCritic = async (argument: string): Promise<string> => {
  const completion: Completion = {
    deployment_id: "p-W2yPy93tAczYrxkipjli6",
    llm_inputs: { argument: argument },
    metadata: { source: "parea-js-sdk" },
  };
  const response = await p.completion(completion);
  return response.content;
};
const TdeployedCritic = trace("deployedCritic", deployedCritic);

const deployedRefiner = async (
  query: string,
  additionalDescription: string,
  currentArg: string,
  criticism: string,
): Promise<CompletionResponse> => {
  const completion: Completion = {
    deployment_id: "p-8Er1Xo0GDGF2xtpmMOpbn",
    llm_inputs: {
      additional_description: additionalDescription,
      date: new Date().toISOString(),
      query: query,
      current_arg: currentArg,
      criticism: criticism,
    },
    metadata: { source: "parea-js-sdk" },
  };
  return await p.completion(completion);
};
const TdeployedRefiner = trace("deployedRefiner", deployedRefiner);

// export const deployedArgumentChain = async (query: string, additionalDescription: string = ""): Promise<string> => {
//     const argument = await deployedArgumentGenerator(query, additionalDescription);
//     const criticism = await deployedCritic(argument);
//     const response = await deployedRefiner(query, additionalDescription, argument, criticism);
//     return response.content;
// };
//
// export const deployedArgumentChain2 = async (query: string, additionalDescription: string = ""): Promise<string> => {
//     const argument = await deployedArgumentGenerator(query, additionalDescription);
//     const criticism = await deployedCritic(argument);
//     const response =  await deployedRefiner(query, additionalDescription, argument, criticism);
//     return response.content;
// };

// const deployedArgumentChain3 = async (query: string, additionalDescription: string = ""): Promise<CompletionResponse> => {
//     const argument = await deployedArgumentGenerator(query, additionalDescription);
//     const criticism = await deployedCritic(argument);
//     return await deployedRefiner(query, additionalDescription, argument, criticism);
// };

const deployedArgumentChain4 = async (
  query: string,
  additionalDescription: string = "",
): Promise<CompletionResponse> => {
  const argument = await TdeployedArgumentGenerator(
    query,
    additionalDescription,
  );
  const criticism = await TdeployedCritic(argument);
  return await TdeployedRefiner(
    query,
    additionalDescription,
    argument,
    criticism,
  );
};

const TdeployedArgumentChain4 = trace(
  "deployedArgumentChain3",
  deployedArgumentChain4,
);

// (async () => {
//     const result1 = await deployedArgumentChain(
//         "Whether coffee is good for you.",
//         "Provide a concise, few sentence argument on why coffee is good for you."
//     );
//     console.log(result1);
// })();
//
// (async () => {
//     const result2 = await deployedArgumentChain2(
//         "Whether wine is good for you.",
//         "Provide a concise, few sentence argument on why wine is good for you."
//     );
//     console.log(result2);
// })();
//
// (async () => {
//     const result3 = await deployedArgumentChain3(
//         "Whether coffee is good for you.",
//         "Provide a concise, few sentence argument on why coffee is good for you."
//     );
//     console.log(result3);
//     await p.recordFeedback({
//         trace_id: result3.inference_id,
//         score: 0.7,  // 0.0 (bad) to 1.0 (good)
//         target: "Coffee is wonderful. End of story."
//     });
// })();

(async () => {
  const result4 = await TdeployedArgumentChain4(
    "Whether wine is good for you.",
    "Provide a concise, few sentence argument on why wine is good for you.",
  );
  console.log(result4);
  await p.recordFeedback({
    trace_id: result4.inference_id,
    score: 0.3, // 0.0 (bad) to 1.0 (good)
    target: "wine is wonderful. End of story.",
  });
})();

// (async () => {
//     const [result3, result4] = await Promise.all([
//         deployedArgumentChain3(
//             "Whether coffee is good for you.",
//             "Provide a concise, few sentence argument on why coffee is good for you."
//         ),
//         TdeployedArgumentChain4(
//             "Whether wine is good for you.",
//             "Provide a concise, few sentence argument on why wine is good for you."
//         ),
//     ]);
//
//     console.log(result3);
//     console.log(result4);
//
//     await Promise.all([
//         p.recordFeedback({
//             trace_id: result3.inference_id,
//             score: 0.7,  // 0.0 (bad) to 1.0 (good)
//             target: "Coffee is wonderful. End of story."
//         }),
//         p.recordFeedback({
//             trace_id: result4.inference_id,
//             score: 0.3,  // 0.0 (bad) to 1.0 (good)
//             target: "wine is wonderful. End of story."
//         }),
//     ]);
// })();
