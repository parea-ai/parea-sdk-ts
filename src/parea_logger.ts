import { TraceLog } from './types.js';
import { AxiosResponse } from 'axios';
import { HTTPClient } from './api-client';
import { pareaProject } from './project';

const LOG_ENDPOINT = '/trace_log';

class PareaLogger {
  private client: HTTPClient;

  constructor() {
    this.client = HTTPClient.getInstance();
  }

  public setClient(client: HTTPClient): void {
    this.client = client;
  }

  public async recordLog(data: TraceLog): Promise<AxiosResponse<any>> {
    return await this.client.request({
      method: 'POST',
      endpoint: LOG_ENDPOINT,
      data: { ...data, project_uuid: await pareaProject.getProjectUUID() },
    });
  }
}

export const pareaLogger = new PareaLogger();
