import * as dotenv from 'dotenv';

import { Completion, CompletionResponse, Message, Role } from '../types';
import { getCurrentTraceId, trace } from '../utils/trace_utils';
import { Parea } from '../client';

dotenv.config();

const p = new Parea(process.env.PAREA_API_KEY);

const LLM_OPTIONS = [
  ['gpt-3.5-turbo-0125', 'openai'],
  ['gpt-4-0125-preview', 'openai'],
  ['claude-3-sonnet-20240229', 'anthropic'],
  ['claude-3-haiku-20240307', 'anthropic'],
];
const LIMIT = 1;

const dumpTask = (task: any[]) => {
  let d = '';
  for (const tasklet of task) {
    d += `\n${tasklet.task_name || ''}`;
  }
  return d.trim();
};

const callLLM = async (
  data: Message[],
  model: string = 'gpt-3.5-turbo',
  provider: string = 'openai',
  temperature: number = 0.0,
): Promise<CompletionResponse> => {
  const completion: Completion = {
    llm_configuration: {
      model: model,
      provider: provider,
      model_params: { temp: temperature },
      messages: data,
    },
    metadata: { source: 'parea-js-sdk' },
  };
  return await p.completion(completion);
};

const expoundTask = async (mainObjective: string, currentTask: string) => {
  const prompt: Message[] = [
    {
      role: Role.user,
      content: `You are an AI who performs one task based on the following objective: ${mainObjective}\nYour task: ${currentTask}\nResponse:`,
    },
  ];
  const response = await callLLM(prompt);
  const newTasks: string[] = response.content.includes('\n') ? response.content.split('\n') : [response.content];
  return newTasks.map((taskName) => ({ task_name: taskName }));
};

const generateTasks = async (mainObjective: string, expoundedInitialTask: any[]) => {
  const selectLLMOption = LLM_OPTIONS[Math.floor(Math.random() * LLM_OPTIONS.length)];
  const taskExpansion = dumpTask(expoundedInitialTask);
  const prompt: Message[] = [
    {
      role: Role.user,
      content: `You are an AI who creates tasks based on the following MAIN OBJECTIVE: ${mainObjective}\nCreate tasks pertaining directly to your previous research here:\n${taskExpansion}\nResponse:`,
    },
  ];
  const response = await callLLM(prompt, selectLLMOption[0], selectLLMOption[1]);
  const newTasks: string[] = response.content.includes('\n') ? response.content.split('\n') : [response.content];
  const taskList = newTasks.map((taskName) => ({ task_name: taskName }));
  const newTasksList: string[] = [];
  for (const taskItem of taskList) {
    const taskDescription = taskItem.task_name;
    if (taskDescription) {
      const taskParts = taskDescription.trim().split('.', 2);
      if (taskParts.length === 2) {
        const newTask = taskParts[1].trim();
        newTasksList.push(newTask);
      }
    }
  }
  return newTasksList;
};

const TexpoundTask = trace('expoundTask', expoundTask);
const TgenerateTasks = trace('generateTasks', generateTasks);

const runAgent = async (mainObjective: string, initialTask: string = '') => {
  const traceId = getCurrentTraceId() || '';
  const generatedTasks = [];
  const expoundedInitialTask = await TexpoundTask(mainObjective, initialTask);
  const newTasks = await TgenerateTasks(mainObjective, expoundedInitialTask);
  let taskCounter = 0;
  for (const task of newTasks) {
    taskCounter++;
    const q = await TexpoundTask(mainObjective, task);
    const exp = dumpTask(q);
    generatedTasks.push({ [`task_${taskCounter}`]: exp });
    if (taskCounter >= LIMIT) {
      break;
    }
  }
  return { generatedTasks, traceId };
};
const TrunAgent = trace('TrunAgent', runAgent);

async function main() {
  const { generatedTasks, traceId } = await TrunAgent('Become a machine learning expert.', 'Learn about tensors.');
  await p.recordFeedback({
    trace_id: traceId,
    score: 0.642,
  });
  return generatedTasks;
}

main().then((result) => console.log(result));
