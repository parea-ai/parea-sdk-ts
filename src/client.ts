import { Completion, CompletionResponse, FeedbackRequest, UseDeployedPrompt, UseDeployedPromptResponse } from './types';

import { HTTPClient } from './api-client';
import { pareaLogger } from './parea_logger';
import { genTraceId } from './helpers';
import { getCurrentTraceId, traceData } from './utils/trace_utils';
import { pareaProject } from './project';

const COMPLETION_ENDPOINT = '/completion';
const DEPLOYED_PROMPT_ENDPOINT = '/deployed-prompt';
const RECORD_FEEDBACK_ENDPOINT = '/feedback';
// const EXPERIMENT_ENDPOINT = "/experiment"
// const EXPERIMENT_STATS_ENDPOINT = "/experiment/{experiment_uuid}/stats"
// const EXPERIMENT_FINISHED_ENDPOINT = "/experiment/{experiment_uuid}/finished"

export class Parea {
  private apiKey: string;
  private client: HTTPClient;

  constructor(apiKey: string = '', projectName: string = 'default') {
    this.apiKey = apiKey;
    this.client = HTTPClient.getInstance();
    this.client.setApiKey(this.apiKey);
    pareaLogger.setClient(this.client);
    pareaProject.setProjectName(projectName);
    pareaProject.setClient(this.client);
  }

  public async completion(data: Completion): Promise<CompletionResponse> {
    const parentTraceId = getCurrentTraceId();
    const inference_id = genTraceId();
    data.inference_id = inference_id;
    data.parent_trace_id = parentTraceId || inference_id;
    const response = await this.client.request({ method: 'POST', endpoint: COMPLETION_ENDPOINT, data });
    const response = await this.client.request({
      method: 'POST',
      endpoint: COMPLETION_ENDPOINT,
      data: {
        project_uuid: await pareaProject.getProjectUUID(),
        ...data,
      },
    });

    if (parentTraceId) {
      traceData[parentTraceId].children.push(inference_id);
      await pareaLogger.recordLog(traceData[parentTraceId]);
    }

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
}
