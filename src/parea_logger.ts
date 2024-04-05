import { LangchainRunCreate, TraceIntegrations, TraceLog, UpdateLog } from './types.js';
import { HTTPClient } from './api-client';
import { serializeMetadataValues, serializeMetadataValuesUpdate } from './helpers';
import { pareaProject } from './project';

const LOG_ENDPOINT = '/trace_log';
const VENDOR_LOG_ENDPOINT = '/trace_log/{vendor}';

export class PareaLogger {
  private client: HTTPClient | null = null;

  constructor() {}

  public setClient(client: HTTPClient): void {
    this.client = client;
  }

  public async recordLog(data: TraceLog): Promise<void> {
    if (!this.client) {
      console.error('Parea Client not instantiated');
      return;
    }
    const log = { ...data, project_uuid: await pareaProject.getProjectUUID() };
    await this.client.request({
      method: 'POST',
      endpoint: LOG_ENDPOINT,
      data: serializeMetadataValues(log),
    });
    return;
  }

  public async recordVendorLog(data: LangchainRunCreate, vendor: TraceIntegrations): Promise<void> {
    if (!this.client) {
      console.error('Parea Client not instantiated');
      return;
    }
    await this.client.request({
      method: 'POST',
      endpoint: VENDOR_LOG_ENDPOINT.replace('{vendor}', vendor),
      data: { ...data, project_uuid: await pareaProject.getProjectUUID() },
    });
    return;
  }

  public async updateLog(data: UpdateLog): Promise<void> {
    if (!this.client) {
      console.error('Parea Client not instantiated');
      return;
    }
    await this.client.request({
      method: 'PUT',
      endpoint: LOG_ENDPOINT,
      data: serializeMetadataValuesUpdate(data),
    });
    return;
  }
}

export const pareaLogger = new PareaLogger();
