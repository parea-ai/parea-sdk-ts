import {
  Completion,
  CompletionResponse,
  CreateExperimentRequest,
  CreateTestCaseCollection,
  EvaluationResult,
  ExperimentOptions,
  ExperimentSchema,
  ExperimentStatsSchema,
  ExperimentWithStatsSchema,
  FeedbackRequest,
  FinishExperimentRequestSchema,
  ListExperimentUUIDsFilters,
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
import { Experiment } from './experiment/V2/experiment';
import { TraceManager } from './utils/V4/core/TraceManager';

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
const UPDATE_TEST_CASE_ENDPOINT = '/update_test_case/{dataset_id}/{test_case_id}';

export class Parea {
  public project_uuid: string;
  private apiKey: string;
  private client: HTTPClient;

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

  public async getProjectUUID(): Promise<void> {
    this.project_uuid = await pareaProject.getProjectUUID();
    pareaLogger.setProjectUUID(this.project_uuid);
  }

  public enableTestMode(enable: boolean): void {
    this.client.enableMockMode(enable);
  }

  public setMockHandler(mockMessage: string): void {
    this.client.setMockHandler(mockMessage);
  }

  public async completion(data: Completion): Promise<CompletionResponse> {
    const requestData = await this.updateDataAndTrace(data);

    const response = await this.client.request({
      method: 'POST',
      endpoint: COMPLETION_ENDPOINT,
      data: requestData,
    });

    return response.data;
  }

  public async getPrompt(data: UseDeployedPrompt): Promise<UseDeployedPromptResponse> {
    const response = await this.client.request({ method: 'POST', endpoint: DEPLOYED_PROMPT_ENDPOINT, data });
    return response.data;
  }

  public async recordFeedback(data: FeedbackRequest): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 2000)); // give logs time to update
    await this.client.request({ method: 'POST', endpoint: RECORD_FEEDBACK_ENDPOINT, data });
  }

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

  public async getExperimentStats(experimentUUID: string): Promise<ExperimentStatsSchema> {
    const response = await this.client.request({
      method: 'GET',
      endpoint: EXPERIMENT_STATS_ENDPOINT.replace('{experiment_uuid}', experimentUUID),
    });
    return response.data;
  }

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

  public async createTestCollection(data: Record<string, any>[], name?: string | undefined): Promise<void> {
    const request: CreateTestCaseCollection = await createTestCollection(data, name);
    await this.client.request({
      method: 'POST',
      endpoint: CREATE_COLLECTION_ENDPOINT,
      data: request,
    });
  }

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
   * @param options -
   *  :nTrials: The number of times to run the experiment on the same data.
   *  :metadata: Optional metadata to attach to the experiment.
   *  :datasetLevelEvalFuncs: Optional list of functions to run on the dataset level. Each function should accept a list of EvaluatedLog objects and return a float or an EvaluationResult object
   *  :nWorkers: max number of experiment runs to process concurrently (i,e data.length=2 * nTrials=2 = 4 runs; nWorkers 2 = 2 sets of 2 concurrent runs, nWorkers 4 = 1 set of 4 concurrent runs)
   * @returns Experiment
   */
  public experiment<T extends Record<string, any>, R>(
    name: string,
    data: string | T[],
    func: { (...args: any[]): any | Promise<any> },
    options?: ExperimentOptions,
  ): Experiment<T, R> {
    return new Experiment(name, data, func, options || {}, this);
  }

  public async listExperiments(filters: ListExperimentUUIDsFilters = {}): Promise<ExperimentWithStatsSchema[]> {
    const response = await this.client.request({
      method: 'POST',
      endpoint: LIST_EXPERIMENTS_ENDPOINT,
      data: filters,
    });
    return response.data;
  }

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
      // const store = asyncLocalStorage.getStore();
      // if (store) {
      //   const currentTraceData = store.get(traceId);
      //   if (currentTraceData) {
      //     const scores = currentTraceData.traceLog?.scores || [];
      //     if (scores) {
      //       return scores;
      //     }
      //   }
      // }
    }

    const response = await this.client.request({
      method: 'GET',
      endpoint: GET_TRACE_LOG_ENDPOINT.replace('{trace_id}', traceId),
    });
    const tree: TraceLogTreeSchema = response.data;
    return extractScores(tree);
  }

  private async updateDataAndTrace(data: Completion): Promise<Completion> {
    // @ts-ignore
    data = serializeMetadataValues(data);
    const traceManager = TraceManager.getInstance();

    let experiment_uuid;
    const inference_id = genTraceId();
    data.inference_id = inference_id;
    data.project_uuid = this.project_uuid || (await pareaProject.getProjectUUID());

    try {
      // const parentStore = asyncLocalStorage.getStore();
      // const parentTraceId = parentStore ? Array.from(parentStore.keys())[0] : undefined; // Assuming the last traceId is the parent

      const parentTrace = traceManager.getCurrentTrace();
      data.root_trace_id = parentTrace ? parentTrace.getLog().root_trace_id : inference_id;
      data.parent_trace_id = parentTrace ? parentTrace.id : undefined;

      // data.parent_trace_id = parentTraceId || inference_id;
      // data.root_trace_id = parentStore ? Array.from(parentStore.values())[0].rootTraceId : data.parent_trace_id;

      if (process.env.PAREA_OS_ENV_EXPERIMENT_UUID) {
        experiment_uuid = process.env.PAREA_OS_ENV_EXPERIMENT_UUID;
        data.experiment_uuid = experiment_uuid;
      }
      if (parentTrace) {
        parentTrace.addChild(inference_id);
      }
      // if (parentStore && parentTraceId) {
      //   const parentTraceLog = parentStore.get(parentTraceId);
      //   if (parentTraceLog) {
      //     parentTraceLog.traceLog.children.push(inference_id);
      //     parentTraceLog.traceLog.experiment_uuid = experiment_uuid;
      //     parentStore.set(parentTraceId, parentTraceLog);
      //   }
      // }
    } catch (e) {
      console.debug(`Error updating trace ids for completion. Trace log will be absent: ${e}`);
    }

    return data;
  }
}

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
