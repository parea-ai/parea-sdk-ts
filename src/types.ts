import { ChatCompletionMessage } from 'openai/src/resources/chat/completions';

export enum Role {
  user = 'user',
  assistant = 'assistant',
  system = 'system',
  example_user = 'example_user',
  example_assistant = 'example_assistant',
  function = 'function',
  tool = 'tool',
}

export type Message = {
  content: string;
  role: Role | string;
};

export type ResponseFormat = {
  type: 'text' | 'json_object';
};

export type ModelParams = {
  temp?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  max_length?: number;
  response_format?: ResponseFormat | null;
};

export type LLMInputs = {
  model?: string;
  provider?: string;
  model_params?: ModelParams;
  messages?: Message[];
  history?: Message[];
  functions?: any[];
  function_call?: string | { [key: string]: string };
};

export type Completion = {
  inference_id?: string;
  parent_trace_id?: string;
  root_trace_id?: string;
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
  experiment_uuid?: string | null;
  project_uuid?: string;
};

export type CompletionResponse = {
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
};

export type UseDeployedPrompt = {
  deployment_id: string;
  llm_inputs?: { [key: string]: any };
};

export type Prompt = {
  raw_messages: { [key: string]: any }[];
  messages: { [key: string]: any }[];
  inputs?: { [key: string]: any };
};

export type UseDeployedPromptResponse = {
  deployment_id: string;
  version_number: number;
  name?: string;
  functions?: string[];
  function_call?: string;
  prompt?: Prompt;
  model?: string;
  provider?: string;
  model_params?: { [key: string]: any };
};

export type FeedbackRequest = {
  score: number;
  trace_id?: string;
  inference_id?: string;
  name?: string;
  target?: string;
  comment?: string;
};

export type TraceLogInputs = Record<string, any>;

export type EvaluationResult = {
  name: string;
  score: number;
  reason?: string;
};

export type Log = {
  configuration?: LLMInputs;
  inputs?: TraceLogInputs;
  output?: string;
  target?: string;
  latency?: number;
  time_to_first_token?: number;
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  cost?: number;
};

export type EvaluatedLog = Log & {
  scores?: EvaluationResult[];
};

export type TraceLogImage = {
  url: string;
  caption?: string;
};

export type TraceLogCommentSchema = {
  comment: string;
  user_id: string;
  created_at: string;
};

export type TraceLogAnnotationSchema = {
  created_at: string;
  user_id: string;
  score: number;
  user_email_address?: string;
  annotation_name?: string;
  value?: string;
};

export type TraceLog = EvaluatedLog & {
  trace_id: string;
  parent_trace_id?: string;
  root_trace_id: string;
  start_timestamp: string;
  organization_id?: string;
  error?: string;
  status?: string;
  deployment_id?: string;
  output_for_eval_metrics?: string;
  apply_eval_frac?: number;
  cache_hit?: boolean;
  evaluation_metric_names?: string[];
  feedback_score?: number;
  trace_name?: string;
  children: string[];
  end_timestamp?: string;
  end_user_identifier?: string;
  session_id?: string;
  metadata?: Record<string, any>;
  tags?: string[];
  experiment_uuid?: string | null;
  images?: TraceLogImage[];
  comments?: TraceLogCommentSchema[];
  annotations?: { [key: string]: TraceLogAnnotationSchema };
  depth: number;
  execution_order: number;
};

export type TraceLogTreeSchema = TraceLog & {
  children_logs: TraceLogTreeSchema[];
};

export type TraceOptions = {
  metadata?: any;
  endUserIdentifier?: string;
  sessionId?: string;
  tags?: string[];
  evalFuncNames?: string[];
  evalFuncs?: EvalFunction[];
  accessOutputOfFunc?: (arg0: any) => string;
  applyEvalFrac?: number;
  deploymentId?: string;
  target?: string;
};

export type UpdateLog = {
  trace_id: string;
  field_name_to_value_map: { [key: string]: any };
  root_trace_id?: string;
};

export type EvalFunctionReturn =
  | Promise<EvaluationResult | EvaluationResult[] | number | boolean>
  | EvaluationResult
  | EvaluationResult[]
  | number
  | boolean
  | null;

export type EvalFunction = (...args: any[]) => EvalFunctionReturn;

export type CreateExperimentRequest = {
  name: string;
  run_name: string;
  metadata?: { [key: string]: string };
};

export type ExperimentSchema = CreateExperimentRequest & {
  uuid: string;
  created_at: string;
};

export type EvaluationScoreSchema = EvaluationResult & {
  id?: number;
};

export type TraceStatsSchema = {
  trace_id: string;
  latency?: number;
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  cost?: number;
  scores?: EvaluationScoreSchema[];
};

export type DataItem = {
  [key: string]: any;
};

export class ExperimentStatsSchema {
  parent_trace_stats: TraceStatsSchema[];

  constructor(parent_trace_stats: TraceStatsSchema[]) {
    this.parent_trace_stats = parent_trace_stats;
  }

  get avgScores(): { [key: string]: number } {
    const accumulators: { [key: string]: number } = {};
    const counts: { [key: string]: number } = {};
    for (const traceStat of this.parent_trace_stats) {
      for (const score of traceStat.scores || []) {
        accumulators[score.name] = (accumulators[score.name] || 0.0) + score.score;
        counts[score.name] = (counts[score.name] || 0) + 1;
      }
    }
    return Object.fromEntries(Object.entries(accumulators).map(([name, value]) => [name, value / counts[name]]));
  }

  cumulativeAvgScore(): number {
    const scores = this.parent_trace_stats.flatMap((traceStat) => traceStat.scores?.map((score) => score.score) || []);
    return scores.length > 0 ? scores.reduce((acc, curr) => acc + curr, 0) / scores.length : 0.0;
  }

  avgScore(scoreName: string): number {
    const scores = this.parent_trace_stats.flatMap(
      (traceStat) => traceStat.scores?.filter((score) => score.name === scoreName).map((score) => score.score) || [],
    );
    return scores.length > 0 ? scores.reduce((acc, curr) => acc + curr, 0) / scores.length : 0.0;
  }
}

export interface CreateGetProjectSchema {
  name: string;
}

export type ProjectSchema = CreateGetProjectSchema & {
  uuid: string;
  createdAt: string;
};

export type GetProjectResponse = {
  name: string;
  uuid: string;
  created_at: string;
  was_created: boolean;
};

export type KVMap = Record<string, any>;

export type LangchainRunUpdate = {
  end_time?: number;
  extra?: KVMap;
  error?: string;
  inputs?: KVMap;
  outputs?: KVMap;
  parent_run_id?: string;
  reference_example_id?: string;
  events?: KVMap[];
  session_id?: string;
};

export type LangchainBaseRun = {
  /** Optionally, a unique identifier for the run. */
  id?: string;
  /** A human-readable name for the run. */
  name: string;
  /** Defines the sequence in which the run was executed. */
  execution_order?: number;
  /** The epoch time at which the run started, if available. */
  start_time?: number | string;
  /** Specifies the type of run (tool, chain, llm, etc.). */
  run_type: string;
  /** The epoch time at which the run ended, if applicable. */
  end_time?: number | string;
  /** Any additional metadata or settings for the run. */
  extra?: KVMap;
  /** Error message, captured if the run faces any issues. */
  error?: string;
  /** Serialized state of the run for potential future use. */
  serialized?: object;
  /** Events like 'start', 'end' linked to the run. */
  events?: KVMap[];
  /** Inputs that were used to initiate the run. */
  inputs: KVMap;
  /** Outputs produced by the run, if any. */
  outputs?: KVMap;
  /** ID of an example that might be related to this run. */
  reference_example_id?: string;
  /** ID of a parent run, if this run is part of a larger operation. */
  parent_run_id?: string;
  /** Tags for further categorizing or annotating the run. */
  tags?: string[];
};

export interface LangchainRunCreate extends LangchainBaseRun {
  child_runs?: this[];
  session_name?: string;
}

export enum TraceIntegrations {
  LANGCHAIN = 'langchain',
}

export interface LangchainRun extends LangchainBaseRun {
  id: string;
  child_runs: this[];
  child_execution_order: number;
}

export type TestCase = {
  id: number;
  test_case_collection_id: number;
  inputs: { [key: string]: string };
  target?: string;
  tags?: string[];
};

export type UpdateTestCase = {
  inputs?: Record<string, string>;
  target?: string;
  tags?: string[];
};

export class TestCaseCollection {
  id: number;
  name: string;
  created_at: string;
  last_updated_at: string;
  column_names: string[];
  test_cases: { [key: number]: TestCase };

  constructor(
    id: number,
    name: string,
    created_at: string,
    last_updated_at: string,
    column_names: string[],
    test_cases: { [key: number]: TestCase },
  ) {
    this.id = id;
    this.name = name;
    this.created_at = created_at;
    this.last_updated_at = last_updated_at;
    this.column_names = column_names;
    this.test_cases = test_cases;
  }

  getAllTestCaseInputs(): Iterable<any[]> {
    return Object.values(this.test_cases).map((test_case) => Object.values(test_case.inputs));
  }

  numTestCases(): number {
    return Object.keys(this.test_cases).length;
  }

  getAllTestCaseTargets(): Iterable<string[]> {
    return Object.values(this.test_cases).map((test_case) => [test_case.target || '']);
  }

  getAllTestInputsAndTargets(): Iterable<DataItem> {
    return Object.values(this.test_cases).map((test_case) => ({
      ...test_case.inputs,
      target: test_case.target || '',
    }));
  }

  convertToFinetuneJsonl(): any[] {
    const jsonlRows: any[] = [];

    for (const testCase of Object.values(this.test_cases)) {
      try {
        const messages = JSON.parse(testCase.inputs.messages);
        let assistantResponse: any;
        let functionCall;

        if (testCase.target) {
          try {
            functionCall = JSON.parse(testCase.target);

            if (Array.isArray(functionCall)) {
              functionCall = functionCall[0];
            }

            if (!functionCall.hasOwnProperty('arguments')) {
              // Assuming need to convert to a different format
              functionCall = functionCall['function'];
            }

            functionCall['arguments'] = JSON.stringify(functionCall['arguments']);
            assistantResponse = { role: 'assistant', function_call: functionCall };
          } catch (error) {
            assistantResponse = { role: 'assistant', content: testCase.target };
          }
          messages.push(assistantResponse);
        }

        let loadedFunctions;
        if (testCase.inputs.functions) {
          loadedFunctions = JSON.parse(testCase.inputs.functions);
        }

        jsonlRows.push({
          messages: messages,
          ...(loadedFunctions?.length > 0 && { functions: loadedFunctions }),
        });
      } catch (error) {
        console.error('Error handling test case and ignoring it: ', error);
      }
    }

    return jsonlRows;
  }
}

export enum ExperimentStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export type FinishExperimentRequestSchema = {
  dataset_level_stats?: EvaluationResult[];
  status?: ExperimentStatus;
};

export type CreateTestCase = {
  inputs: Record<string, string>;
  target?: string;
  tags: string[];
};

export type CreateTestCases = {
  id?: number;
  name?: string;
  test_cases: CreateTestCase[];
};

export type CreateTestCaseCollection = CreateTestCases & {
  column_names: string[];
};

export type ListExperimentUUIDsFilters = {
  project_name?: string;
  metadata_filter?: KVMap;
  experiment_name_filter?: string;
  run_name_filter?: string;
};

export enum FilterOperator {
  EQUALS = 'equals',
  NOT_EQUALS = 'not_equals',
  LIKE = 'like',
  GREATER_THAN_OR_EQUAL = 'greater_than_or_equal',
  LESS_THAN_OR_EQUAL = 'less_than_or_equal',
  GREATER_THAN = 'greater_than',
  LESS_THAN = 'less_than',
  IS_NULL = 'is_null',
  EXISTS = 'exists',
  IN = 'in',
}

export type TraceLogFilters = {
  filter_field?: string;
  filter_key?: string | null;
  filter_operator?: FilterOperator | string;
  filter_value?: string;
};

export type ExperimentPinnedStatistic = {
  var1: string;
  operation:
    | 'mean'
    | 'median'
    | 'variance'
    | 'standard_deviation'
    | 'min'
    | 'max'
    | 'mse'
    | 'mae'
    | 'correlation'
    | 'spearman_correlation'
    | 'accuracy'
    | 'custom';
  value: number;
  var2?: string;
};

export type ExperimentWithStatsSchema = ExperimentSchema & {
  status: ExperimentStatus;
  is_public: boolean;
  num_samples: number | null;
  pinned_stats: ExperimentPinnedStatistic[];
};

export type StreamingResult = {
  output: {
    index: number;
    message: ChatCompletionMessage;
    logprobs: null;
    finish_reason?: string;
  }[];
  metrics: Record<string, number>;
};

export interface MessageConverter {
  convert(message: any): Message;
}

export enum TimeRange {
  NA = 'na',
  LAST_1_HOUR = '1h',
  LAST_3_HOURS = '3h',
  LAST_6_HOURS = '6h',
  LAST_24_HOURS = '24h',
  LAST_7_DAYS = '7d',
  LAST_1_MONTH = '1m',
  LAST_3_MONTHS = '3m',
  LAST_6_MONTHS = '6m',
  LAST_12_MONTHS = '1y',
}

export type QueryParams = TraceLogFilters & {
  project_name: string;
  page?: number;
  page_size?: number;
  time_range?: TimeRange;
  status?: string;
};

export const defaultQueryParams: QueryParams = {
  project_name: 'default',
  page: 1,
  page_size: 10,
  time_range: TimeRange.NA,
};

export type PaginatedTraceLogsResponse = {
  total: number;
  page: number;
  total_pages: number;
  page_size: number;
  results: TraceLogTreeSchema[];
};
