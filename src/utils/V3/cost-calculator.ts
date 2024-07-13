import { CostCalculator } from './types';
import { MODEL_COST_MAPPING } from '../V4/utils/constants';

export class OpenAICostCalculator implements CostCalculator {
  calculateCost(modelName: string, promptTokens: number, completionTokens: number): number {
    if (!Object.keys(MODEL_COST_MAPPING).includes(modelName)) {
      console.error(
        `Unknown model: ${modelName}. Please provide a valid OpenAI model name. Known models are: ${Object.keys(
          MODEL_COST_MAPPING,
        ).join(', ')}`,
      );
      return 0;
    }
    const modelCost = MODEL_COST_MAPPING[modelName];
    const promptCost = promptTokens * modelCost.prompt;
    const completionCost = completionTokens * modelCost.completion;
    return (promptCost + completionCost) / 1000000;
  }
}
