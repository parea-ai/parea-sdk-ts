import axios, { AxiosError, AxiosInstance, AxiosResponse } from 'axios';
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
  private baseURL: string;
  private apiKey: string | null = null;
  private client: AxiosInstance;
  private mockMode: boolean = false;
  private defaultMockResponse: AxiosResponse<any> = {
    data: { message: 'mock' },
    status: 200,
    statusText: 'OK',
    config: {} as any,
    headers: {},
  };

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

  public static getInstance(): HTTPClient {
    if (!HTTPClient.instance) {
      HTTPClient.instance = new HTTPClient();
    }
    return HTTPClient.instance;
  }

  public setMockHandler(mockMessage: string): void {
    this.defaultMockResponse = {
      ...this.defaultMockResponse,
      data: { message: mockMessage },
    };
  }

  public enableMockMode(enable: boolean): void {
    this.mockMode = enable;
  }

  public setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
  }

  public setBaseURL(baseURL: string): void {
    this.baseURL = baseURL;
    this.client.defaults.baseURL = baseURL;
  }

  public async request(config: RequestConfig): Promise<AxiosResponse<any>> {
    if (this.mockMode) {
      return Promise.resolve(this.defaultMockResponse);
    } else {
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

  private requestInterceptor(config: any) {
    return config;
  }

  private responseInterceptor(response: AxiosResponse) {
    return response;
  }

  private errorInterceptor(error: AxiosError) {
    return Promise.reject(error);
  }
}
