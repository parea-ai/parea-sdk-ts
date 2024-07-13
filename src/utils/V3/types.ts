import { Message } from '../../types';

export type TraceId = string & { readonly brand: unique symbol };

export interface MessageConverter {
  convert(message: any): Message;
}

export interface CostCalculator {
  calculateCost(modelName: string, promptTokens: number, completionTokens: number): number;
}

export interface Configuration {
  getExperimentUUID(): string | null;
}
