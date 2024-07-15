import { HTTPClient } from './api-client';
import { GetProjectResponse, ProjectSchema } from './types';

const PROJECT_ENDPOINT = '/project';

/**
 * Represents a project and provides methods for managing project-related operations.
 */
export class Project {
  private client: HTTPClient | null = null;
  private projectName: string;
  private project: ProjectSchema;

  constructor() {}

  /**
   * Sets the HTTP client for making API requests.
   * @param client The HTTP client instance to be used for API calls.
   */
  public setClient(client: HTTPClient): void {
    this.client = client;
  }

  /**
   * Sets the name of the project.
   * @param projectName The name to be assigned to the project.
   */
  public setProjectName(projectName: string): void {
    this.projectName = projectName;
  }

  /**
   * Retrieves the UUID of the project.
   * @returns A promise that resolves to the project UUID as a string.
   * @throws Error if the Parea Client is not instantiated.
   */
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

  /**
   * Retrieves an existing project or creates a new one if necessary.
   * @returns A promise that resolves to the project UUID as a string.
   * @throws Error if the Parea Client is not instantiated.
   */
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

/**
 * A singleton instance of the Project class.
 */
export const pareaProject = new Project();
