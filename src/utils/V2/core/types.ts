export interface OpenAILike {
  chat: ChatLike;
  embeddings: EmbeddingsLike;
  beta?: BetaLike;
}

export interface ChatLike {
  completions: CompletionsLike;
}

export interface CompletionsLike {
  create: (params: ChatCompletionParams) => Promise<ChatCompletionResponse>;
}

export interface EmbeddingsLike {
  create: (params: EmbeddingParams) => Promise<EmbeddingResponse>;
}

export interface BetaLike {
  chat: {
    completions: {
      stream: (params: ChatCompletionParams) => AsyncIterable<ChatCompletionChunk>;
    };
  };
}

export interface ChatCompletionParams {
  messages: ChatMessage[];
  model: string;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

export interface ChatCompletionResponse {
  choices: ChatCompletionChoice[];
  usage: TokenUsage;
}

export interface ChatCompletionChoice {
  message: ChatMessage;
  finish_reason: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface TokenUsage {
  total_tokens: number;
  prompt_tokens: number;
  completion_tokens: number;
}

export interface EmbeddingParams {
  input: string | string[];
  model: string;
}

export interface EmbeddingResponse {
  data: { embedding: number[] }[];
  usage: TokenUsage;
}

export interface ChatCompletionChunk {
  choices: {
    delta: Partial<ChatMessage>;
    finish_reason: string | null;
  }[];
}
