import { ADJECTIVES, NOUNS } from '../helpers';

export function genRandomName(): string {
  const randomIndex = (max: number): number => Math.floor(Math.random() * Math.floor(max));
  const adjective: string = ADJECTIVES[randomIndex(ADJECTIVES.length)];
  const noun: string = NOUNS[randomIndex(NOUNS.length)];
  return `${adjective}-${noun}`;
}
