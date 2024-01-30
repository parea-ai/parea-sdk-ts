import { HTTPClient } from './api-client';
import { ProjectSchema } from './types';

const PROJECT_ENDPOINT = '/project';

class Project {
  private client: HTTPClient;
  private projectName: string;
  private project: ProjectSchema;

  constructor() {
    this.client = HTTPClient.getInstance();
  }

  public setClient(client: HTTPClient): void {
    this.client = client;
  }

  public setProjectName(projectName: string): void {
    this.projectName = projectName;
  }

  private async getOrCreateProjectIfNecessary(): Promise<void> {
    const projectName = this.projectName;
    const response = await this.client.request({
      method: 'POST',
      endpoint: PROJECT_ENDPOINT,
      data: { name: projectName },
    });
    const data = response.data;
    if (data.was_created) {
      console.log(`Created project ${projectName} with UUID ${data.uuid}`);
    }
    this.project = {
      name: projectName,
      uuid: data.uuid,
      createdAt: data.created_at,
    };
  }

  public async getProjectUUID(): Promise<string> {
    if (!this.project) {
      await this.getOrCreateProjectIfNecessary();
    }
    return this.project.uuid;
  }
}

export const pareaProject = new Project();
