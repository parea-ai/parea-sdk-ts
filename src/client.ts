import {
  Completion,
  CompletionResponse,
  CreateExperimentRequest,
  CreateTestCaseCollection,
  DataItem,
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
  UseDeployedPrompt,
  UseDeployedPromptResponse,
} from './types';

import { HTTPClient } from './api-client';
import { pareaLogger } from './parea_logger';
import { genTraceId, serializeMetadataValues } from './helpers';
import { asyncLocalStorage } from './utils/trace_utils';
import { pareaProject } from './project';
import { Experiment } from './experiment/experiment';
import { createTestCases, createTestCollection } from './experiment/datasets';

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

export class Parea {
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

  public async getCollection(testCollectionIdentifier: string | number): Promise<TestCaseCollection> {
    const response = await this.client.request({
      method: 'GET',
      endpoint: GET_COLLECTION_ENDPOINT.replace('{test_collection_identifier}', String(testCollectionIdentifier)),
    });
    return response.data;
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

  /**
   * Instantiates an experiment on a dataset.
   * @param name - The name of the experiment.
   * @param data - If your dataset is defined locally it should be an iterable of k/v pairs matching the expected inputs of your function. To reference a dataset you have saved on Parea, use the dataset name as a string or the dataset id as an int.
   * @param func - The function to run. This function should accept inputs that match the keys of the data field.
   * @param options -
   *  :nTrials: The number of times to run the experiment on the same data.
   *  :metadata: Optional metadata to attach to the experiment.
   *  :datasetLevelEvalFuncs: Optional list of functions to run on the dataset level. Each function should accept a list of EvaluatedLog objects and return a float or an EvaluationResult object
   *  :nWorkers: The number of workers to use for running the experiment.
   * @returns Experiment
   */
  public experiment(
    name: string,
    data: string | Iterable<DataItem>,
    func: (...dataItem: any[]) => Promise<any>,
    options?: ExperimentOptions,
  ): Experiment {
    return new Experiment(
      name,
      data,
      func,
      this,
      options?.nTrials,
      options?.metadata,
      options?.datasetLevelEvalFuncs,
      options?.nWorkers,
    );
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

  private async updateDataAndTrace(data: Completion): Promise<Completion> {
    // @ts-ignore
    data = serializeMetadataValues(data);

    let experiment_uuid;
    const inference_id = genTraceId();
    data.inference_id = inference_id;
    data.project_uuid = await pareaProject.getProjectUUID();

    try {
      const parentStore = asyncLocalStorage.getStore();
      const parentTraceId = parentStore ? Array.from(parentStore.keys())[0] : undefined; // Assuming the last traceId is the parent

      data.parent_trace_id = parentTraceId || inference_id;
      data.root_trace_id = parentStore ? Array.from(parentStore.values())[0].rootTraceId : data.parent_trace_id;

      if (process.env.PAREA_OS_ENV_EXPERIMENT_UUID) {
        experiment_uuid = process.env.PAREA_OS_ENV_EXPERIMENT_UUID;
        data.experiment_uuid = experiment_uuid;
      }

      if (parentStore && parentTraceId) {
        const parentTraceLog = parentStore.get(parentTraceId);
        if (parentTraceLog) {
          parentTraceLog.traceLog.children.push(inference_id);
          parentTraceLog.traceLog.experiment_uuid = experiment_uuid;
          parentStore.set(parentTraceId, parentTraceLog);
        }
      }
    } catch (e) {
      console.debug(`Error updating trace ids for completion. Trace log will be absent: ${e}`);
    }

    return data;
  }
}
