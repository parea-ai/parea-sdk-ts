import {
  Completion,
  CompletionResponse,
  CreateExperimentRequest,
  CreateTestCaseCollection,
  defaultQueryParams,
  EvaluationResult,
  ExperimentSchema,
  ExperimentStatsSchema,
  ExperimentWithStatsSchema,
  FeedbackRequest,
  FinishExperimentRequestSchema,
  ListExperimentUUIDsFilters,
  PaginatedTraceLogsResponse,
  QueryParams,
  TestCaseCollection,
  TraceLogFilters,
  TraceLogTreeSchema,
  UpdateTestCase,
  UseDeployedPrompt,
  UseDeployedPromptResponse,
} from './types';

import { HTTPClient } from './api-client';
import { pareaLogger } from './parea_logger';
import { genTraceId, serializeMetadataValues } from './helpers';
import { pareaProject } from './project';
import { createTestCases, createTestCollection } from './experiment/datasets';
import { Experiment } from './experiment/experiment';
import { TraceManager } from './utils/core/TraceManager';
import { ExperimentOptions } from './experiment/types';

const COMPLETION_ENDPOINT = '/completion';
const DEPLOYED_PROMPT_ENDPOINT = '/deployed-prompt';
const RECORD_FEEDBACK_ENDPOINT = '/feedback';
const EXPERIMENT_ENDPOINT = '/experiment';
const EXPERIMENT_STATS_ENDPOINT = '/experiment/{experiment_uuid}/stats';
const EXPERIMENT_FINISHED_ENDPOINT = '/experiment/{experiment_uuid}/finished';
const GET_COLLECTION_ENDPOINT = '/collection/{test_collection_identifier}';
const CREATE_COLLECTION_ENDPOINT = '/collection';
const ADD_TEST_CASES_ENDPOINT = '/testcases';
const LIST_EXPERIMENTS_ENDPOINT = '/experiments';
const GET_EXP_LOGS_ENDPOINT = '/experiment/{experiment_uuid}/trace_logs';
const GET_TRACE_LOG_ENDPOINT = '/trace_log/{trace_id}';
const GET_TRACE_LOGS_ENDPOINT = '/get_trace_logs';
const UPDATE_TEST_CASE_ENDPOINT = '/update_test_case/{dataset_id}/{test_case_id}';

/**
 * Main class for interacting with the Parea API.
 */
export class Parea {
  public project_uuid: string;
  private apiKey: string;
  private client: HTTPClient;

  /**
   * Creates a new Parea instance.
   * @param apiKey - The API key for authentication.
   * @param projectName - The name of the project (default: 'default').
   */
  constructor(apiKey: string = '', projectName: string = 'default') {
    this.apiKey = apiKey;
    this.client = HTTPClient.getInstance();
    this.client.setApiKey(this.apiKey);
    this.client.setBaseURL(
      process.env.PAREA_BASE_URL || 'https://parea-ai-backend-us-9ac16cdbc7a7b006.onporter.run/api/parea/v1',
    );

    if (process.env.PAREA_TEST_MODE === 'true') {
      this.enableTestMode(true);
    }

    pareaProject.setProjectName(projectName);
    pareaProject.setClient(this.client);
    pareaLogger.setClient(this.client);
    // fire and forget
    // noinspection JSIgnoredPromiseFromCall
    this.getProjectUUID();
  }

  /**
   * Retrieves and sets the project UUID.
   */
  public async getProjectUUID(): Promise<void> {
    this.project_uuid = await pareaProject.getProjectUUID();
    pareaLogger.setProjectUUID(this.project_uuid);
  }

  /**
   * Enables or disables test mode.
   * @param enable - Whether to enable test mode.
   */
  public enableTestMode(enable: boolean): void {
    this.client.enableMockMode(enable);
  }

  /**
   * Sets a mock handler for testing.
   * @param mockMessage - The mock message to use.
   */
  public setMockHandler(mockMessage: string): void {
    this.client.setMockHandler(mockMessage);
  }

  /**
   * Sends a completion request to the API.
   * @param data - The completion request data.
   * @returns A promise resolving to the completion response.
   */
  public async completion(data: Completion): Promise<CompletionResponse> {
    const requestData = await this.updateDataAndTrace(data);

    const response = await this.client.request({
      method: 'POST',
      endpoint: COMPLETION_ENDPOINT,
      data: requestData,
    });

    return response.data;
  }

  /**
   * Retrieves a deployed prompt from the API.
   * @param data - The request data for retrieving the prompt.
   * @returns A promise resolving to the deployed prompt response.
   */
  public async getPrompt(data: UseDeployedPrompt): Promise<UseDeployedPromptResponse> {
    const response = await this.client.request({ method: 'POST', endpoint: DEPLOYED_PROMPT_ENDPOINT, data });
    return response.data;
  }

  /**
   * Records feedback for a completion.
   * @param data - The feedback request data.
   */
  public async recordFeedback(data: FeedbackRequest): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 2000)); // give logs time to update
    await this.client.request({ method: 'POST', endpoint: RECORD_FEEDBACK_ENDPOINT, data });
  }

  /**
   * Creates a new experiment.
   * @param data - The experiment creation request data.
   * @returns A promise resolving to the created experiment schema.
   */
  public async createExperiment(data: CreateExperimentRequest): Promise<ExperimentSchema> {
    const response = await this.client.request({
      method: 'POST',
      endpoint: EXPERIMENT_ENDPOINT,
      data: {
        ...data,
        project_uuid: await pareaProject.getProjectUUID(),
      },
    });
    return response.data;
  }

  /**
   * Retrieves statistics for a specific experiment.
   * @param experimentUUID - The UUID of the experiment.
   * @returns A promise resolving to the experiment statistics.
   */
  public async getExperimentStats(experimentUUID: string): Promise<ExperimentStatsSchema> {
    const response = await this.client.request({
      method: 'GET',
      endpoint: EXPERIMENT_STATS_ENDPOINT.replace('{experiment_uuid}', experimentUUID),
    });
    return response.data;
  }

  /**
   * Marks an experiment as finished and retrieves its statistics.
   * @param experimentUUID - The UUID of the experiment.
   * @param fin_req - The finish experiment request data.
   * @returns A promise resolving to the experiment statistics.
   */
  public async finishExperiment(
    experimentUUID: string,
    fin_req: FinishExperimentRequestSchema,
  ): Promise<ExperimentStatsSchema> {
    const response = await this.client.request({
      method: 'POST',
      endpoint: EXPERIMENT_FINISHED_ENDPOINT.replace('{experiment_uuid}', experimentUUID),
      data: fin_req,
    });
    return response.data;
  }

  /**
   * Retrieves a test case collection.
   * @param testCollectionIdentifier - The identifier of the test collection.
   * @returns A promise resolving to the test case collection or null if not found.
   */
  public async getCollection(testCollectionIdentifier: string | number): Promise<TestCaseCollection | null> {
    const response = await this.client.request({
      method: 'GET',
      endpoint: GET_COLLECTION_ENDPOINT.replace('{test_collection_identifier}', String(testCollectionIdentifier)),
    });
    if (!response.data) {
      console.error(`No test collection found with identifier ${testCollectionIdentifier}`);
      return null;
    }
    return new TestCaseCollection(
      response.data.id,
      response.data.name,
      response.data.created_at,
      response.data.last_updated_at,
      response.data.column_names,
      response.data.test_cases,
    );
  }

  /**
   * Creates a new test case collection.
   * @param data - The test case data.
   * @param name - Optional name for the collection.
   */
  public async createTestCollection(data: Record<string, any>[], name?: string | undefined): Promise<void> {
    const request: CreateTestCaseCollection = await createTestCollection(data, name);
    await this.client.request({
      method: 'POST',
      endpoint: CREATE_COLLECTION_ENDPOINT,
      data: request,
    });
  }

  /**
   * Adds test cases to an existing collection.
   * @param data - The test case data to add.
   * @param name - Optional name for the test cases.
   * @param datasetId - Optional dataset ID to add the test cases to.
   */
  public async addTestCases(
    data: Record<string, any>[],
    name?: string | undefined,
    datasetId?: number | undefined,
  ): Promise<void> {
    const request = {
      id: datasetId,
      name,
      test_cases: await createTestCases(data),
    };
    await this.client.request({
      method: 'POST',
      endpoint: ADD_TEST_CASES_ENDPOINT,
      data: request,
    });
  }

  /**
   * Updates a specific test case.
   * @param testCaseId - The ID of the test case to update.
   * @param datasetId - The ID of the dataset containing the test case.
   * @param updateRequest - The update request data.
   */
  public async updateTestCase(
    testCaseId: number | string,
    datasetId: number | string,
    updateRequest: UpdateTestCase,
  ): Promise<void> {
    await this.client.request({
      method: 'POST',
      endpoint: UPDATE_TEST_CASE_ENDPOINT.replace('{dataset_id}', String(datasetId)).replace(
        '{test_case_id}',
        String(testCaseId),
      ),
      data: updateRequest,
    });
  }

  /**
   * Instantiates an experiment on a dataset.
   * @param name - The name of the experiment.
   * @param data - If your dataset is defined locally it should be an iterable of k/v pairs matching the expected inputs of your function. To reference a dataset you have saved on Parea, use the dataset name as a string or the dataset id as an int.
   * @param func - The function to run. This function should accept inputs that match the keys of the data field.
   * @param options - Additional options for the experiment.
   * @returns An Experiment instance.
   */
  public experiment<T extends Record<string, any>, R>(
    name: string,
    data: string | T[],
    func: { (...args: any[]): any | Promise<any> },
    options?: ExperimentOptions,
  ): Experiment<T, R> {
    const traceDisabled = process.env.PAREA_TRACE_ENABLED === 'false';
    if (traceDisabled) {
      throw new Error('Tracing is disabled. Please enable tracing to run experiments.');
    }
    return new Experiment(name, data, func, options || {}, this);
  }

  /**
   * Lists experiments based on provided filters.
   * @param filters - Filters to apply when listing experiments.
   * @returns A promise resolving to an array of experiments with stats.
   */
  public async listExperiments(filters: ListExperimentUUIDsFilters = {}): Promise<ExperimentWithStatsSchema[]> {
    const response = await this.client.request({
      method: 'POST',
      endpoint: LIST_EXPERIMENTS_ENDPOINT,
      data: filters,
    });
    return response.data;
  }

  /**
   * Retrieves logs for a specific experiment.
   * @param experimentUUID - The UUID of the experiment.
   * @param filter - Optional filters to apply to the logs.
   * @returns A promise resolving to an array of trace log trees.
   */
  public async getExperimentLogs(experimentUUID: string, filter: TraceLogFilters = {}): Promise<TraceLogTreeSchema[]> {
    const response = await this.client.request({
      method: 'POST',
      endpoint: GET_EXP_LOGS_ENDPOINT.replace('{experiment_uuid}', experimentUUID),
      data: filter,
    });
    return response.data;
  }

  /**
   * Get the trace log tree for the given trace ID.
   * @param traceId - The trace ID to fetch the log for.
   * @returns The trace log tree.
   */
  public async getTraceLog(traceId: string): Promise<TraceLogTreeSchema> {
    const response = await this.client.request({
      method: 'GET',
      endpoint: GET_TRACE_LOG_ENDPOINT.replace('{trace_id}', traceId),
    });
    return response.data;
  }

  /**
   * Get the evaluation scores from the trace log. If the scores are not present in the trace log, fetch them from the DB.
   * @param traceId - The trace ID to get the scores for.
   * @param checkContext - If true, will check the context for the scores first before fetching from the DB.
   * @returns A list of evaluation results.
   */
  public async getTraceLogScores(traceId: string, checkContext: boolean = true): Promise<EvaluationResult[]> {
    if (checkContext) {
      const traceManager = TraceManager.getInstance();
      const currentTrace = traceManager.getCurrentTrace();
      if (currentTrace) {
        const scores = currentTrace.getLog()?.scores;
        if (scores) {
          return scores;
        }
      }
    }

    const response = await this.client.request({
      method: 'GET',
      endpoint: GET_TRACE_LOG_ENDPOINT.replace('{trace_id}', traceId),
    });
    const tree: TraceLogTreeSchema = response.data;
    return extractScores(tree);
  }

  /**
   * Updates the data and trace information for a completion request.
   * @param data - The completion request data.
   * @returns The updated completion request data.
   * @private
   */
  private async updateDataAndTrace(data: Completion): Promise<Completion> {
    // @ts-ignore
    data = serializeMetadataValues(data);
    const traceManager = TraceManager.getInstance();

    let experiment_uuid;
    const inference_id = genTraceId();
    data.inference_id = inference_id;
    data.project_uuid = this.project_uuid || (await pareaProject.getProjectUUID());

    try {
      const parentTrace = traceManager.getCurrentTrace();
      data.root_trace_id = parentTrace ? parentTrace.getLog().root_trace_id : inference_id;
      data.parent_trace_id = parentTrace ? parentTrace.id : undefined;

      if (process.env.PAREA_OS_ENV_EXPERIMENT_UUID) {
        experiment_uuid = process.env.PAREA_OS_ENV_EXPERIMENT_UUID;
        data.experiment_uuid = experiment_uuid;
      }
      if (parentTrace) {
        parentTrace.addChild(inference_id);
      }
    } catch (e) {
      console.debug(`Error updating trace ids for completion. Trace log will be absent: ${e}`);
    }

    return data;
  }

  /**
   * Fetches trace logs for a given query.
   * @param queryParams - The query parameters for the trace logs.
   * @returns A paginated response of trace logs.
   */
  public async getTraceLogs(queryParams: QueryParams = defaultQueryParams): Promise<PaginatedTraceLogsResponse> {
    const response = await this.client.request({
      method: 'POST',
      endpoint: GET_TRACE_LOGS_ENDPOINT,
      data: { ...defaultQueryParams, ...queryParams },
    });
    return response.data;
  }
}

/**
 * Extracts evaluation scores from a trace log tree.
 * @param tree - The trace log tree to extract scores from.
 * @returns An array of evaluation results.
 */
function extractScores(tree: TraceLogTreeSchema): EvaluationResult[] {
  const scores: EvaluationResult[] = [];

  function traverse(node: TraceLogTreeSchema) {
    if (node.scores) {
      scores.push(...(node.scores || []));
    }
    for (const child of node.children_logs) {
      traverse(child);
    }
  }

  traverse(tree);
  return scores;
}
