enum Role {
  user = "user",
  assistant = "assistant",
  system = "system",
  example_user = "example_user",
  example_assistant = "example_assistant",
}

interface Message {
  content: string;
  role: Role;
}

interface ModelParams {
  temp?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  max_length?: number;
}

interface LLMInputs {
  model?: string;
  provider?: string;
  model_params?: ModelParams;
  messages?: Message[];
  functions?: any[];
  function_call?: string | { [key: string]: string };
}

interface Completion {
  inference_id?: string;
  trace_name?: string;
  llm_inputs?: { [key: string]: any };
  llm_configuration?: LLMInputs;
  end_user_identifier?: string;
  deployment_id?: string;
  name?: string;
  metadata?: { [key: string]: any };
  tags?: string[];
  target?: string;
  cache?: boolean;
  log_omit_inputs?: boolean;
  log_omit_outputs?: boolean;
  log_omit?: boolean;
}

interface CompletionResponse {
  inference_id: string;
  content: string;
  latency: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cost: number;
  model: string;
  provider: string;
  cache_hit: boolean;
  status: string;
  start_timestamp: string;
  end_timestamp: string;
  error?: string;
}

interface UseDeployedPrompt {
  deployment_id: string;
  llm_inputs?: { [key: string]: any };
}

interface Prompt {
  raw_messages: { [key: string]: any }[];
  messages: { [key: string]: any }[];
  inputs?: { [key: string]: any };
}

interface UseDeployedPromptResponse {
  deployment_id: string;
  name?: string;
  functions?: { [key: string]: any };
  function_call?: string;
  prompt?: Prompt;
  model?: string;
  provider?: string;
  model_params?: { [key: string]: any };
}

interface FeedbackRequest {
  score: number;
  trace_id?: string;
  inference_id?: string;
  name?: string;
  target?: string;
}

interface TraceLogInputs {
  [key: string]: string;
}

interface TraceLog {
  trace_id: string;
  start_timestamp: string;
  organization_id?: string;
  error?: string;
  status?: string;
  deployment_id?: string;
  evaluation_metric_ids?: number[];
  cache_hit?: boolean;
  configuration?: LLMInputs;
  latency?: number;
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  cost?: number;
  feedback_score?: number;
  trace_name?: string;
  children: string[];
  end_timestamp?: string;
  end_user_identifier?: string;
  metadata?: { [key: string]: any };
  target?: string;
  tags?: string[];
  inputs?: TraceLogInputs;
  output?: string;
}

interface TraceLogTree {
  trace_id: string;
  start_timestamp: string;
  organization_id?: string;
  error?: string;
  status?: string;
  deployment_id?: string;
  evaluation_metric_ids?: number[];
  cache_hit?: boolean;
  configuration?: LLMInputs;
  latency?: number;
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  cost?: number;
  feedback_score?: number;
  trace_name?: string;
  children: TraceLog[];
  end_timestamp?: string;
  end_user_identifier?: string;
  metadata?: { [key: string]: any };
  target?: string;
  tags?: string[];
  inputs?: { [key: string]: string };
  output?: string;
}

export {
  Role,
  Message,
  ModelParams,
  LLMInputs,
  Completion,
  CompletionResponse,
  UseDeployedPrompt,
  Prompt,
  UseDeployedPromptResponse,
  FeedbackRequest,
  TraceLogInputs,
  TraceLog,
  TraceLogTree,
};
