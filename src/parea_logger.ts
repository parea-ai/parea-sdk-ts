import { LangchainRunCreate, TraceIntegrations, TraceLog, UpdateLog } from './types.js';
import { AxiosResponse } from 'axios';
import { HTTPClient } from './api-client';
import { pareaProject } from './project';
import { serializeMetadataValues, serializeMetadataValuesUpdate } from './helpers';

const LOG_ENDPOINT = '/trace_log';
const VENDOR_LOG_ENDPOINT = '/trace_log/{vendor}';

export class PareaLogger {
  private client: HTTPClient;

  constructor() {
    this.client = HTTPClient.getInstance();
  }

  public setClient(client: HTTPClient): void {
    this.client = client;
  }

  public async recordLog(data: TraceLog): Promise<AxiosResponse<any>> {
    const log = { ...data, project_uuid: await pareaProject.getProjectUUID() };
    return await this.client.request({
      method: 'POST',
      endpoint: LOG_ENDPOINT,
      data: serializeMetadataValues(log),
    });
  }

  public async recordVendorLog(data: LangchainRunCreate, vendor: TraceIntegrations): Promise<AxiosResponse<any>> {
    return await this.client.request({
      method: 'POST',
      endpoint: VENDOR_LOG_ENDPOINT.replace('{vendor}', vendor),
      data: { ...data, project_uuid: await pareaProject.getProjectUUID() },
    });
  }

  public async updateLog(data: UpdateLog): Promise<AxiosResponse<any>> {
    return await this.client.request({
      method: 'PUT',
      endpoint: LOG_ENDPOINT,
      data: serializeMetadataValuesUpdate(data),
    });
  }
}

export const pareaLogger = new PareaLogger();
