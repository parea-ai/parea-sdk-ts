import * as dotenv from 'dotenv';
import Parea from "../client.js";
import {Completion, CompletionResponse} from "../types.js";



dotenv.config();

export const p = new Parea(process.env.DEV_API_KEY);

const deployedArgumentGenerator = async (query: string, additionalDescription: string = ""): Promise<string> => {
    const completion: Completion = {
        deployment_id: "p-Ar-Oi14-nBxHUiradyql9",
        llm_inputs: {
            "additional_description": additionalDescription,
            "date": new Date().toISOString(),
            "query": query,
        },
        metadata: {"source": "parea-js-sdk"},
    };
    const response = await p.completion(completion);
    return response.content;
};

const deployedCritic = async (argument: string): Promise<string> => {
    const completion: Completion = {
        deployment_id: "p-W2yPy93tAczYrxkipjli6",
        llm_inputs: { "argument": argument },
        metadata: {"source": "parea-js-sdk"},
    };
    const response = await p.completion(completion);
    return response.content;
};

const deployedRefiner = async (query: string, additionalDescription: string, currentArg: string, criticism: string): Promise<CompletionResponse> => {
    const completion: Completion = {
        deployment_id: "p-8Er1Xo0GDGF2xtpmMOpbn",
        llm_inputs: {
            "additional_description": additionalDescription,
            "date": new Date().toISOString(),
            "query": query,
            "current_arg": currentArg,
            "criticism": criticism,
        },
        metadata: {"source": "parea-js-sdk"},
    };
    return await p.completion(completion);
};

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

export const deployedArgumentChain3 = async (query: string, additionalDescription: string = ""): Promise<CompletionResponse> => {
    const argument = await deployedArgumentGenerator(query, additionalDescription);
    const criticism = await deployedCritic(argument);
    return await deployedRefiner(query, additionalDescription, argument, criticism);
};

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

(async () => {
    const result3 = await deployedArgumentChain3(
        "Whether coffee is good for you.",
        "Provide a concise, few sentence argument on why coffee is good for you."
    );
    console.log(result3);
    await p.recordFeedback({
        trace_id: result3.inference_id,
        score: 0.7,  // 0.0 (bad) to 1.0 (good)
        target: "Coffee is wonderful. End of story."
    });
})();
