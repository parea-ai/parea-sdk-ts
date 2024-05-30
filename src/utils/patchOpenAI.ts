import { OpenAI } from 'openai';
import { PatchWrapper } from './PatchWrapper';

export function patchOpenAI(openai: OpenAI): void {
  PatchWrapper(openai.chat.completions, 'create');
}
