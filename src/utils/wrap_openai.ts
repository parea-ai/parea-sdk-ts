import { OpenAI } from 'openai';
import { PatchWrapper, wrapMethod } from './PatchWrapper';

export function patchOpenAI(openai: OpenAI): void {
  PatchWrapper(openai.chat.completions, 'create');
}

export function traceOpenAITriggerDev(ioOpenAIChatCompletionsCreate: Function): Function {
  return wrapMethod(ioOpenAIChatCompletionsCreate, 1);
}
