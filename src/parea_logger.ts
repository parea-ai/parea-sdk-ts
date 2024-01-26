import { TraceLog, UpdateLog } from './types.js';
import { AxiosResponse } from 'axios';
import { HTTPClient } from './api-client';

const LOG_ENDPOINT = '/trace_log';
// const VENDOR_LOG_ENDPOINT = '/trace_log/{vendor}';

class PareaLogger {
  private client: HTTPClient;

  constructor() {
    this.client = HTTPClient.getInstance();
  }

  public setClient(client: HTTPClient): void {
    this.client = client;
  }

  public async recordLog(data: TraceLog): Promise<AxiosResponse<any>> {
    return await this.client.request({ method: 'POST', endpoint: LOG_ENDPOINT, data });
  }

  public async updateLog(data: UpdateLog): Promise<AxiosResponse<any>> {
    return await this.client.request({ method: 'PUT', endpoint: LOG_ENDPOINT, data });
  }
}

export const pareaLogger = new PareaLogger();
