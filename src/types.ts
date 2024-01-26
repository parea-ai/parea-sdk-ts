export enum Role {
  user = 'user',
  assistant = 'assistant',
  system = 'system',
  example_user = 'example_user',
  example_assistant = 'example_assistant',
  function = 'function',
}

export interface Message {
  content: string;
  role: Role | string;
}

export interface ModelParams {
  temp?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  max_length?: number;
}

export interface LLMInputs {
  model?: string;
  provider?: string;
  model_params?: ModelParams;
  messages?: Message[];
  functions?: any[];
  function_call?: string | { [key: string]: string };
}

export interface Completion {
  inference_id?: string;
  parent_trace_id?: string;
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

export interface CompletionResponse {
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
  trace_id?: string;
}

export interface UseDeployedPrompt {
  deployment_id: string;
  llm_inputs?: { [key: string]: any };
}

export interface Prompt {
  raw_messages: { [key: string]: any }[];
  messages: { [key: string]: any }[];
  inputs?: { [key: string]: any };
}

export interface UseDeployedPromptResponse {
  deployment_id: string;
  name?: string;
  functions?: { [key: string]: any };
  function_call?: string;
  prompt?: Prompt;
  model?: string;
  provider?: string;
  model_params?: { [key: string]: any };
}

export interface FeedbackRequest {
  score: number;
  trace_id?: string;
  inference_id?: string;
  name?: string;
  target?: string;
  comment?: string;
}

export interface TraceLogInputs {
  [key: string]: string;
}

export interface NamedEvaluationScore {
  name: string;
  score: number;
}

export interface TraceLog {
  trace_id: string;
  parent_trace_id?: string;
  start_timestamp: string;
  organization_id?: string;
  error?: string;
  status?: string;
  deployment_id?: string;
  output_for_eval_metrics?: string;
  cache_hit?: boolean;
  configuration?: LLMInputs;
  latency?: number;
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  cost?: number;
  evaluation_metric_names?: string[];
  scores?: NamedEvaluationScore[];
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
  experiment_uuid?: string | null;
}

export type TraceLogTreeSchema = TraceLog & {
  children_logs: TraceLogTreeSchema[];
};

export type TraceOptions = {
  metadata?: any;
  endUserIdentifier?: string;
  tags?: string[];
  target?: string;
  evalFuncNames?: string[];
  accessOutputOfFunc?: (arg0: any) => string;
};

export type UpdateLog = {
  trace_id: string;
  field_name_to_value_map: { [key: string]: any };
};
