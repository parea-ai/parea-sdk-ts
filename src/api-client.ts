import axios, {AxiosInstance, AxiosResponse} from 'axios';

class HTTPClient {
    private static instance: HTTPClient;
    private baseURL: string = "http://localhost:8000/api/parea/v1" // "https://optimus-prompt-backend.vercel.app/api/parea/v1";
    private apiKey: string | null = null;
    private client: AxiosInstance;

    private constructor() {
        this.client = axios.create({
            baseURL: this.baseURL,
            timeout: 60 * 3.0 * 1000
        });
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

    public async request(
        method: 'GET' | 'POST' | 'PUT' | 'DELETE',
        endpoint: string,
        data?: any,
        params?: any,
        apiKey?: string
    ): Promise<AxiosResponse<any>> {
        const headers = {'x-api-key': this.apiKey || apiKey || ""};
        try {
            return await this.client.request({
                method,
                url: endpoint,
                data,
                params,
                headers
            });
        } catch (error) {
            console.error(error);
            throw error;
        }
    }
}

export default HTTPClient;