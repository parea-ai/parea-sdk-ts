import axios, { AxiosError, AxiosInstance, AxiosResponse } from 'axios';
import axiosRetry from 'axios-retry';

/**
 * Interface representing the configuration for an HTTP request.
 */
interface RequestConfig {
  /** The HTTP method to be used for the request. */
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  /** The endpoint URL for the request. */
  endpoint: string;
  /** Optional data to be sent with the request. */
  data?: any;
  /** Optional query parameters for the request. */
  params?: any;
  /** Optional API key for authentication. */
  apiKey?: string;
}

/**
 * A singleton class for making HTTP requests with configurable options and mock mode.
 */
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
    axiosRetry(this.client, { retries: 2, retryDelay: (...arg) => axiosRetry.exponentialDelay(...arg, 500) });

    this.client.interceptors.request.use(this.requestInterceptor);
    this.client.interceptors.response.use(this.responseInterceptor, this.errorInterceptor);
  }

  /**
   * Gets the singleton instance of the HTTPClient.
   * @returns The HTTPClient instance.
   */
  public static getInstance(): HTTPClient {
    if (!HTTPClient.instance) {
      HTTPClient.instance = new HTTPClient();
    }
    return HTTPClient.instance;
  }

  /**
   * Sets a custom mock response message.
   * @param mockMessage - The message to be used in the mock response.
   */
  public setMockHandler(mockMessage: string): void {
    this.defaultMockResponse = {
      ...this.defaultMockResponse,
      data: { message: mockMessage },
    };
  }

  /**
   * Enables or disables mock mode.
   * @param enable - Boolean flag to enable or disable mock mode.
   */
  public enableMockMode(enable: boolean): void {
    this.mockMode = enable;
  }

  /**
   * Sets the API key for authentication.
   * @param apiKey - The API key to be used for requests.
   */
  public setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
  }

  /**
   * Sets the base URL for all requests.
   * @param baseURL - The base URL to be used.
   */
  public setBaseURL(baseURL: string): void {
    this.baseURL = baseURL;
    this.client.defaults.baseURL = baseURL;
  }

  /**
   * Sends an HTTP request based on the provided configuration.
   * @param config - The request configuration.
   * @returns A promise that resolves to the axios response.
   * @throws Will throw an error if the request fails.
   */
  public async request(config: RequestConfig): Promise<AxiosResponse<any>> {
    if (!this.apiKey) {
      console.log(`No API key`);
      return Promise.reject();
    }

    if (this.mockMode) {
      return Promise.resolve(this.defaultMockResponse);
    } else {
      const headers = {
        'x-api-key': this.apiKey || config.apiKey || '',
        'x-sdk-language': 'typescript',
      };
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

  /**
   * Intercepts and processes the request before it is sent.
   * @param config - The request configuration.
   * @returns The processed request configuration.
   */
  private requestInterceptor(config: any) {
    return config;
  }

  /**
   * Intercepts and processes the response before it is handled.
   * @param response - The axios response object.
   * @returns The processed response.
   */
  private responseInterceptor(response: AxiosResponse) {
    return response;
  }

  /**
   * Intercepts and processes errors that occur during the request.
   * @param error - The axios error object.
   * @returns A rejected promise with the error.
   * @throws Will throw a custom error if the server is down or unavailable.
   */
  private errorInterceptor(error: AxiosError) {
    if (error?.code === 'ECONNREFUSED') {
      throw new Error('Server is down or unavailable.');
    }
    return Promise.reject(error);
  }
}
