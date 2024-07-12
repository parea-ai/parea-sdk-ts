export const MODEL_COST_MAPPING: { [key: string]: { [key: string]: number } } = {
  'gpt-3.5-turbo-0301': {
    prompt: 1.5,
    completion: 4.0,
  },
  'gpt-3.5-turbo-0613': {
    prompt: 1.5,
    completion: 4.0,
  },
  'gpt-3.5-turbo-16k': {
    prompt: 3.0,
    completion: 4.0,
  },
  'gpt-3.5-turbo-16k-0301': {
    prompt: 3.0,
    completion: 4.0,
  },
  'gpt-3.5-turbo-16k-0613': {
    prompt: 3.0,
    completion: 4.0,
  },
  'gpt-3.5-turbo-1106': {
    prompt: 1.0,
    completion: 2.0,
  },
  'gpt-3.5-turbo-0125': {
    prompt: 0.5,
    completion: 2.0,
  },
  'gpt-3.5-turbo': {
    prompt: 0.5,
    completion: 2.0,
  },
  'gpt-3.5-turbo-instruct': {
    prompt: 1.5,
    completion: 4.0,
  },
  'gpt-4': {
    prompt: 30.0,
    completion: 60.0,
  },
  'gpt-4-0314': {
    prompt: 30.0,
    completion: 60.0,
  },
  'gpt-4-0613': {
    prompt: 30.0,
    completion: 60.0,
  },
  'gpt-4-32k': {
    prompt: 60.0,
    completion: 120.0,
  },
  'gpt-4-32k-0314': {
    prompt: 60.0,
    completion: 120.0,
  },
  'gpt-4-32k-0613': {
    prompt: 60.0,
    completion: 120.0,
  },
  'gpt-4-vision-preview': {
    prompt: 30.0,
    completion: 60.0,
  },
  'gpt-4-1106-vision-preview': {
    prompt: 30.0,
    completion: 60.0,
  },
  'gpt-4-turbo-preview': {
    prompt: 10.0,
    completion: 30.0,
  },
  'gpt-4-1106-preview': {
    prompt: 10.0,
    completion: 30.0,
  },
  'gpt-4-0125-preview': {
    prompt: 10.0,
    completion: 30.0,
  },
  'gpt-4-turbo': {
    prompt: 10.0,
    completion: 30.0,
  },
  'gpt-4-turbo-2024-04-09': {
    prompt: 10.0,
    completion: 30.0,
  },
  'gpt-4o-2024-05-13': {
    prompt: 5.0,
    completion: 15.0,
  },
  'gpt-4o': {
    prompt: 5.0,
    completion: 15.0,
  },
};
