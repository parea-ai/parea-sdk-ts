import { v4 as uuidv4 } from 'uuid';

export function genTraceId(): string {
  // Generate a unique trace id for each chain of requests
  return uuidv4();
}

export function toDateAndTimeString(timestamp: number): string {
  // Convert a timestamp to a date and time string
  const date = new Date(timestamp * 1000);
  return date.toISOString();
}
