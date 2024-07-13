// import { exponentialDelay } from 'retry';
// import { config } from '../core/config';
//
// export async function withRetry<T>(operation: () => Promise<T>, maxRetries: number = config.maxRetries): Promise<T> {
//   let lastError: Error | null = null;
//   for (let attempt = 0; attempt < maxRetries; attempt++) {
//     try {
//       return await operation();
//     } catch (error) {
//       lastError = error as Error;
//       const delay = exponentialDelay(attempt);
//       await new Promise((resolve) => setTimeout(resolve, delay));
//     }
//   }
//   throw lastError;
// }
