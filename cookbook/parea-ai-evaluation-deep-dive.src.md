<!-- srcbook:{"language":"javascript"} -->

# Parea AI Evaluation Deep Dive

###### package.json

```json
{
  "type": "module",
  "dependencies": {
    "jsdom": "^24.1.1",
    "node-fetch": "^3.3.2",
    "openai": "^4.56.0",
    "parea-ai": "^1.62.0"
  }
}

```

## 1: Comparing Models with Custom Evaluation

Classification Task of emotions with GPT-4o, GPT-4o-mini and GPT-4-T

### Dataset 
Use a HuggingFace Dataset [https://huggingface.co/datasets/go_emotions](https://huggingface.co/datasets/go_emotions)

### Setting up LLM call

Emotion classification task. Take in a social media comment, apply one of 27 emotion labels or neutral to it.

### Defining a custom eval

Currently, we have two pieces of data
1. The dataset social media comment
2. The dataset assigned emotion label(s)

Want to evaluate model performance on the (1)Dataset social media comment in comparison to the (2)dataset assigned emotion label.

The below function assigns a "matches_target" score of 1 if it's an exact match, 0.5 if the LLM output partially contains the expected label, or 0 if nothing is included.

Using parea.experiment() to run your evaluations
experiment() needs a few arguments, the function to evaluate, and the dataset to that will be fed into the function as input params.

Evaluating matches_target score against go_emotions dataset and GPT models
We 'attach' evaluation metrics to the function we want to evaluate using Parea's trace decorator. This will take the outputs from the traced function and pass it to the evaluation metric

###### matches-target.js

```javascript
import OpenAI from "openai";
import { Parea, patchOpenAI, trace} from "parea-ai";

const openai = new OpenAI({apiKey: process.env.OPENAI_API_KEY});
const p = new Parea(process.env.PAREA_API_KEY);
patchOpenAI(openai);

export const label_index = {
    "0": "admiration",
    "1": "amusement",
    "2": "anger",
    "3": "annoyance",
    "4": "approval",
    "5": "caring",
    "6": "confusion",
    "7": "curiosity",
    "8": "desire",
    "9": "disappointment",
    "10": "disapproval",
    "11": "disgust",
    "12": "embarrassment",
    "13": "excitement",
    "14": "fear",
    "15": "gratitude",
    "16": "grief",
    "17": "joy",
    "18": "love",
    "19": "nervousness",
    "20": "optimism",
    "21": "pride",
    "22": "realization",
    "23": "relief",
    "24": "remorse",
    "25": "sadness",
    "26": "surprise",
    "27": "neutral",
}

export const dataset = [{
    'comment': 'Omg i hope this is about [NAME]. I would LOVE to see [NAME] and [NAME] go head to head',
    'target': 'optimism'
},
    {'comment': 'Finale', 'target': 'neutral'},
    {
        'comment': 'Which suggests nothing in itself. The same mods you claim are abusive are probably as hyperbolic about the racism issue as you are.',
        'target': 'anger, annoyance'
    },
    {'comment': 'I double dog dare him.', 'target': 'neutral'},
    {
        'comment': 'Believe you me. TLJ is much, much worse.',
        'target': 'disappointment, disgust'
    },
    {'comment': "I don't really want to do anything.", 'target': 'disapproval'},
    {'comment': 'I’d buy a cheap version of it.', 'target': 'approval'},
    {
        'comment': 'Not to mention that the full video is part of the kids PR campaign according to [NAME] idiot',
        'target': 'disappointment'
    },
    {
        'comment': 'How did U quit being obsessed? It’s my goal for 2019.',
        'target': 'curiosity'
    },
    {
        'comment': "Most of them keep it on the down-low, but, yeah, they voted and support [NAME]. Only one of the brother-in-laws didn't vote for him. ",
        'target': 'neutral'
    },
    {
        'comment': 'That’s one of my favorite movies pans labyrinth.',
        'target': 'admiration, approval'
    },
    {
        'comment': 'I feel there will be a direct correlation between using expeditious retreat to charge, and the amount you fall to 0.',
        'target': 'neutral'
    },
    {'comment': 'Go to class!', 'target': 'neutral'},
    {
        'comment': "Because [NAME] doesn't have time to monitor what is going on in a couples bedroom.",
        'target': 'realization'
    },
    {
        'comment': 'Wow this is amazing. LOVE THIS!!!',
        'target': 'admiration, love'
    },
    {
        'comment': "Huh, I'd missed this one when looking for new games a few months back. Might have to give it a try.",
        'target': 'disappointment'
    },
    {
        'comment': 'Since she ate other food I would guess it is a way of getting around a digestive disorder or carbs.',
        'target': 'neutral'
    },
    {
        'comment': 'Troo, troo....worse eban dan eat pizza wif aht a ferk. ',
        'target': 'disgust'
    },
    {'comment': 'He’s soft. No heart.', 'target': 'disappointment, realization'},
    {
        'comment': 'You were at a casino. Sounds like you won.',
        'target': 'admiration, curiosity'
    },
    {'comment': 'I like [NAME] because she hates America', 'target': 'love'}
]

async function callOpenAI(comment, model = 'gpt-4o-mini') {
    const response = await openai.chat.completions.create(
        {
            model,
            messages: [{
                "role": "user",
                "content": `You are a cutting edge emotion analysis classification assistant.
                You analyze a comment, and apply one or more emotion labels to it.
                The emotion labels are detailed here:
                
                ['admiration', 'amusement', 'anger', 'annoyance', 'approval', 'caring', 'confusion',
                'curiosity', 'desire', 'disappointment', 'disapproval', 'disgust', 'embarrassment',
                'excitement', 'fear', 'gratitude', 'grief', 'joy', 'love', 'nervousness', 'optimism',
                'pride', 'realization', 'relief', 'remorse', 'sadness', 'surprise', 'neutral']
                
                Your output should simply be just the respective emotion, and if there are multiple seperated with commas.
                
                The comment is here: ${comment}`,
            }]
        });
    return response.choices[0].message.content ?? '';
}

const MODELS = ["gpt-4o", "gpt-4o-mini"]

// Parea evaluation functions expect a log param. This is the log object created when we build the trace log.
// With the log object you can access any parameter set on your traced function like output and inputs and even configuration model parameters.
// Log also stores the reserved "target" if one is set on the dataset being evaluated
function matchesTarget(log) {
    // Getting the emotions and response as a set
    const expectedAnswer = new Set(log?.target?.split(", "));
    const response = new Set(log?.output?.split(", "));

    // Check if response matches the expected answer exactly
    if (response.size === expectedAnswer.size && Array.from(response).every(value => expectedAnswer.has(value))) {
        return 1;
    }
    // Check if there is any overlap (partial match)
    else if (Array.from(response).some(value => expectedAnswer.has(value))) {
        return 0.5;
    }
    // No overlap at all
    return 0;
}

const gpt4oClassifyEmotion = trace('gpt4o_classify_emotion', async (comment) => {
        return await callOpenAI(comment, "gpt-4o");
    },
    {evalFuncs: [matchesTarget]},
);

const gptminiClassifyEmotion = trace('gptmini_classify_emotion', async (comment) => {
        return await callOpenAI(comment, "gpt-4o-mini");
    },
    {evalFuncs: [matchesTarget]},
);

async function gpt4o() {
  const e = p.experiment('Emotions_Classifier', dataset, gpt4oClassifyEmotion);
  return await e.run();
}

async function gptmini() {
  const e = p.experiment('Emotions_Classifier', dataset, gptminiClassifyEmotion);
  return await e.run();
}

await gpt4o()
console.log('Experiment gpt4o complete!');

await gptmini()
console.log('Experiment gptmini complete!');
```

## 2: Custom LLM-As-Judge Evaluator

Using custom evaluators to assess model performance, using another llm model

### Creating a new dataset of question and answer pairs

Website of interest: https://lilianweng.github.io/posts/2023-06-23-agent/

### Create LLM Judge Evals

Two LLM evals to be tested.
1. Chain of Though
2. Helpfulness Criteria

###### llmJudgeEvals.js

```javascript
import fetch from 'node-fetch';
import { JSDOM } from 'jsdom';
import {Parea, trace} from "parea-ai";

const p = new Parea(process.env.PAREA_API_KEY);

export async function getContext() {
    const url = "https://lilianweng.github.io/posts/2023-06-23-agent/";
    const response = await fetch(url);
    const text = await response.text();
    const dom = new JSDOM(text);
    const paragraphs = dom.window.document.querySelectorAll("p");
    return Array.from(paragraphs).map(p => p.textContent).join("\n");
}

const inputs = [
    "What is the primary function of LLM in autonomous agents?",
    "Can you describe the role of 'Planning' in LLM-powered autonomous agents?",
    "What types of memory are utilized by LLM-powered agents?",
    "How do autonomous agents use tool APIs?",
    "What are some challenges faced by LLM-powered autonomous agents in real-world applications?",
];

const outputs = [
    "LLM functions as the core controller or 'brain' of autonomous agents, enabling them to handle complex tasks through planning, memory, and tool use.",
    "In LLM-powered agents, 'Planning' involves breaking down complex tasks into manageable sub goals, reflecting on past actions, and refining strategies for improved outcomes.",
    "LLM-powered agents utilize short-term memory for in-context learning and long-term memory for retaining and recalling information over extended periods, often leveraging external vector stores.",
    "Autonomous agents use tool APIs to extend their capabilities beyond the model's weights, allowing access to current information, code execution, and proprietary data.",
    "Challenges include managing the complexity of task dependencies, maintaining the stability of model outputs, and ensuring efficient interaction with external models and APIs.",
];

const qaPairs = inputs.map((question, index) => ({
    question,
    target: outputs[index],
}));


const JUDGE = "gpt-4o";

// To make it easy to use any model we want as an evaluator we will use p.completion.
// p.completion is Parea's method to call any LLM provider you have enabled on Parea using the same interface.
// You could easily remove p.completion and use the provider of you choice directly.
// Notice also this time we return a EvaluationResult, which allows us to add a reason field.
async function llmJudge(name, prompt) {
    try {
        const response = await p.completion({
            llm_configuration: {
                model: JUDGE,
                model_params: {response_format: {"type": "json_object"}},
                messages: [{role: 'system', content: "Respond in JSON. JSON must have keys reason and score"},
                    {role: 'user', content: `${prompt}`}],
            },
        });
        const response_dict = JSON.parse(response.content)
        return {name, score: Number(response_dict.score), reason: response_dict.reason}
    } catch (error) {
        return {name: `error=${name}`, score: 0, reason: `Error in grading: ${error}`}
    }
}

async function cotEval(log) {
    const fullText = await getContext();
    const cotTemplate = `You are a teacher grading a quiz.
  You are given a question, the context the question is about, and the student's answer.
  You are asked to score the student's answer as either 1 for CORRECT or 0 for INCORRECT, based on the context.
  provide a reason that is a step by step reasoning about your conclusion.

  Grade the student answers based ONLY on their factual accuracy. Ignore differences in punctuation and phrasing between the student answer and true answer.
  It is OK if the student answer contains more information than the true answer, as long as it does not contain any conflicting statements.

  QUESTION: ${log.inputs.question}
  CONTEXT: ${fullText}
  STUDENT ANSWER: ${log.output}

  RESPOND IN JSON, keys are:
    reason: step by step reasoning here
    score: 1 if CORRECT, 0 if INCORRECT
  `
    return await llmJudge("cot_eval", cotTemplate)
}

async function helpfulnessEval(log) {
    const helpfulCriteriaTemplate = `You are assessing a submitted answer on a given task or input based on a set of criteria. Here is the data:
  [BEGIN DATA]
  ***
  [Input]: ${log.inputs.question}
  ***
  [Submission]: ${log.output}
  ***
  [Criteria]: "Is the submission helpful, insightful, and appropriate? If so, respond 1. If not, respond 0."
  ***
  [END DATA]
  Does the submission meet the Criteria?
  Respond in JSON with keys: reason and score.
    reason = step by step manner your reasoning about the criteria and the score given.
    score = A score of 1 or 0 corresponding to whether the submission meets all criteria or not.
  `
    return await llmJudge("helpfulness_eval", helpfulCriteriaTemplate)
}

const EVALS = {
    "cot_eval": cotEval,
    "helpfulness_eval": helpfulnessEval,
}


async function qaFactory(model, evalName) {
    const fullText = await getContext();
    return trace('qa_llm_call', async (question) => {
            const response = await p.completion({
                llm_configuration: {
                    model,
                    messages: [{
                        role: 'system',
                        content: `Answer the user's question using this context: \n\n\n ${fullText}`
                    },
                        {role: 'user', content: `Answer the question in 2-3 sentences ${question}`}],
                },
            });
            return response.content
        },
        {evalFuncs: [EVALS[evalName]]},
    )
}


async function runQAExperiments() {
    for (const evalName of Object.keys(EVALS)) {
        const experimentName = "QA_LLM_Judge_Evals";
        const runPrefix = evalName;
        const qaLLMcall = await qaFactory("gpt-4o", evalName);

        const experiment = p.experiment(
            experimentName,
            qaPairs,
            qaLLMcall,
            {metadata: {"judge-model": JUDGE}}
        );

        await experiment.run({prefix: runPrefix});
    }
}

await runQAExperiments();
```
