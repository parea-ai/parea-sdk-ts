import axios, { AxiosInstance, AxiosResponse, AxiosError } from 'axios';
import axiosRetry from 'axios-retry';

interface RequestConfig {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  endpoint: string;
  data?: any;
  params?: any;
  apiKey?: string;
}

export class HTTPClient {
  private static instance: HTTPClient;
  private baseURL: string = 'https://optimus-prompt-backend.vercel.app/api/parea/v1'; // 'http://127.0.0.1:8000/api/parea/v1';
  private apiKey: string | null = null;
  private client: AxiosInstance;

  private constructor() {
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 60 * 3.0 * 1000,
    });

    // Apply retry mechanism with axios-retry
    axiosRetry(this.client, { retries: 3, retryDelay: axiosRetry.exponentialDelay });

    this.client.interceptors.request.use(this.requestInterceptor);
    this.client.interceptors.response.use(this.responseInterceptor, this.errorInterceptor);
  }

  private requestInterceptor(config: any) {
    // TBD: Add any request modifications here
    return config;
  }

  private responseInterceptor(response: AxiosResponse) {
    // TBD: Add any response modifications here
    return response;
  }

  private errorInterceptor(error: AxiosError) {
    // TBD: Add any error modifications here
    return Promise.reject(error);
  }

  public static getInstance(): HTTPClient {
    if (!HTTPClient.instance) {
      HTTPClient.instance = new HTTPClient();
    }
    return HTTPClient.instance;
  }

  public setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
  }

  public async request(config: RequestConfig): Promise<AxiosResponse<any>> {
    const headers = { 'x-api-key': this.apiKey || config.apiKey || '' };
    try {
      return await this.client.request({
        method: config.method,
        url: config.endpoint,
        data: config.data,
        params: config.params,
        headers,
      });
    } catch (error) {
      console.error(`Request to ${config.endpoint} failed with error ${error}`);
      throw error;
    }
  }
}
