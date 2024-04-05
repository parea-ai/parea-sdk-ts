import { HTTPClient } from './api-client';
import { GetProjectResponse, ProjectSchema } from './types';

const PROJECT_ENDPOINT = '/project';

export class Project {
  private client: HTTPClient | null = null;
  private projectName: string;
  private project: ProjectSchema;

  constructor() {}

  public setClient(client: HTTPClient): void {
    this.client = client;
  }

  public setProjectName(projectName: string): void {
    this.projectName = projectName;
  }

  public async getProjectUUID(): Promise<string> {
    if (!this.client) {
      console.error('Parea Client not instantiated');
      return '';
    }
    if (!this.project) {
      return await this.getOrCreateProjectIfNecessary();
    }
    return this.project.uuid;
  }

  private async getOrCreateProjectIfNecessary(): Promise<string> {
    if (!this.client) {
      console.error('Parea Client not instantiated');
      return '';
    }
    const projectName = this.projectName;
    const response = await this.client.request({
      method: 'POST',
      endpoint: PROJECT_ENDPOINT,
      data: { name: projectName },
    });
    const data: GetProjectResponse = response.data;
    if (data.was_created) {
      console.log(`Created project ${projectName} with UUID ${data.uuid}`);
    }
    this.project = {
      name: projectName,
      uuid: data.uuid,
      createdAt: data.created_at,
    };
    return data.uuid;
  }
}

export const pareaProject = new Project();
