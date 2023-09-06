import { v4 as uuidv4 } from 'uuid';
import moment from 'moment-timezone';

export function genTraceId(): string {
  // Generate a unique trace id for each chain of requests
  return uuidv4();
}

export function toDateTimeString(date: Date): string {
  return moment(date).format('YYYY-MM-DD HH:mm:ss z');
}
