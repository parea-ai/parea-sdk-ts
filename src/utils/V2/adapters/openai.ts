// import { wrapWithProxy } from '../utils/proxy';
// import {
//   ChatCompletionChunk,
//   ChatCompletionParams,
//   ChatCompletionResponse,
//   EmbeddingParams,
//   EmbeddingResponse,
//   OpenAILike,
// } from '../core/types';
// import { createSpan } from '../tracing/span';
// import { logger } from '../tracing/logger';
// import { withRetry } from '../utils/retry';
// import { AsyncIterableWrapper } from '../utils/streaming';
// import OpenAI from 'openai';
//
//
// export function createOpenAIWrapper(openai: OpenAI): OpenAILike {
//   return wrapWithProxy(openai, {
//     chat: {
//       completions: {
//         create: wrapChatCompletion,
//       },
//     },
//     embeddings: {
//       create: wrapEmbeddings,
//     },
//     beta: {
//       chat: {
//         completions: {
//           stream: wrapStreamingChatCompletion,
//         },
//       },
//     },
//   });
// }
//
// async function wrapChatCompletion(params: ChatCompletionParams): Promise<ChatCompletionResponse> {
//   const span = createSpan('openai.chat.completions.create');
//   try {
//     const result = await withRetry(() => this.createChatCompletion(params));
//     span.setAttributes({
//       'openai.model': params.model,
//       'openai.total_tokens': result.usage.total_tokens,
//     });
//     logger.info('Chat completion created', { model: params.model, tokens: result.usage.total_tokens });
//     return result;
//   } catch (error) {
//     span.setStatus({ code: 2, message: (error as Error).message });
//     logger.error('Error in chat completion', { error });
//     throw error;
//   } finally {
//     span.end();
//   }
// }
//
// async function wrapEmbeddings(params: EmbeddingParams): Promise<EmbeddingResponse> {
//   const span = createSpan('openai.embeddings.create');
//   try {
//     const result = await withRetry(() => this.createEmbedding(params));
//     span.setAttributes({
//       'openai.model': params.model,
//       'openai.total_tokens': result.usage.total_tokens,
//     });
//     logger.info('Embedding created', { model: params.model, tokens: result.usage.total_tokens });
//     return result;
//   } catch (error) {
//     span.setStatus({ code: 2, message: (error as Error).message });
//     logger.error('Error in embedding creation', { error });
//     throw error;
//   } finally {
//     span.end();
//   }
// }
//
// function wrapStreamingChatCompletion(params: ChatCompletionParams): AsyncIterable<ChatCompletionChunk> {
//   const span = createSpan('openai.chat.completions.stream');
//   const stream = this.createChatCompletion(params, { stream: true });
//
//   return new AsyncIterableWrapper(stream, (chunk) => {
//     span.addEvent('chunk_received', { chunk });
//     logger.debug('Streaming chunk received', { chunk });
//   });
// }
