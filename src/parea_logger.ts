import { LangchainRunCreate, TraceIntegrations, TraceLog, UpdateLog } from './types.js';
import { HTTPClient } from './api-client';
import { serializeMetadataValues, serializeMetadataValuesUpdate } from './helpers';
import { pareaProject } from './project';

const LOG_ENDPOINT = '/trace_log';
const VENDOR_LOG_ENDPOINT = '/trace_log/{vendor}';

/**
 * PareaLogger class for handling logging operations.
 */
export class PareaLogger {
  private client: HTTPClient | null = null;
  private project_uuid: string | null = null;

  constructor() {}

  /**
   * Sets the HTTP client for the logger.
   * @param client - The HTTP client to be used for requests.
   */
  public setClient(client: HTTPClient): void {
    this.client = client;
  }

  /**
   * Sets the project UUID for the logger.
   * @param project_uuid - The project UUID to be set.
   */
  public setProjectUUID(project_uuid: string): void {
    this.project_uuid = project_uuid;
  }

  /**
   * Retrieves the project UUID.
   * @returns A promise that resolves to the project UUID.
   */
  public async getProjectUUID(): Promise<string> {
    const project_uuid = await pareaProject.getProjectUUID();
    this.project_uuid = project_uuid;
    return project_uuid;
  }

  /**
   * Records a log entry.
   * @param data - The trace log data to be recorded.
   * @throws Will throw an error if the Parea Client is not instantiated.
   */
  public async recordLog(data: TraceLog): Promise<void> {
    if (!this.client) {
      console.error('Parea Client not instantiated');
      return;
    }
    const log = { ...data, project_uuid: this.project_uuid || (await this.getProjectUUID()) };
    await this.client.request({
      method: 'POST',
      endpoint: LOG_ENDPOINT,
      data: serializeMetadataValues(log),
    });
    return;
  }

  /**
   * Records a vendor-specific log entry.
   * @param data - The Langchain run data to be recorded.
   * @param vendor - The trace integration vendor.
   * @throws Will throw an error if the Parea Client is not instantiated.
   */
  public async recordVendorLog(data: LangchainRunCreate, vendor: TraceIntegrations): Promise<void> {
    if (!this.client) {
      console.error('Parea Client not instantiated');
      return;
    }
    await this.client.request({
      method: 'POST',
      endpoint: VENDOR_LOG_ENDPOINT.replace('{vendor}', vendor),
      data: { ...data, project_uuid: this.project_uuid || (await this.getProjectUUID()) },
    });
    return;
  }

  /**
   * Updates an existing log entry.
   * @param data - The update log data.
   * @throws Will throw an error if the Parea Client is not instantiated.
   */
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

/**
 * Singleton instance of PareaLogger.
 */
export const pareaLogger = new PareaLogger();
