import HTTPClient from "./api-client.js";
import {
    Completion,
    CompletionResponse,
    FeedbackRequest,
    UseDeployedPrompt,
    UseDeployedPromptResponse
} from "./types.js";
import pareaLogger from "./parea_logger.js";
import {getCurrentTraceId} from "./utils/trace_utils.js";


const COMPLETION_ENDPOINT = "/completion";
const DEPLOYED_PROMPT_ENDPOINT = "/deployed-prompt";
const RECORD_FEEDBACK_ENDPOINT = "/feedback";

class Parea {
    private apiKey: string;
    private client: HTTPClient;

    constructor(apiKey: string = "") {
        this.apiKey = apiKey;
        this.client = HTTPClient.getInstance();
        this.client.setApiKey(this.apiKey);
        pareaLogger.setClient(this.client);
    }

    public async completion(data: Completion): Promise<CompletionResponse> {
        data.inference_id = getCurrentTraceId();
        const response = await this.client.request(
            "POST",
            COMPLETION_ENDPOINT,
            data
        );
        return response.data;
    }

    public async getPrompt(data: UseDeployedPrompt): Promise<UseDeployedPromptResponse> {
        const response = await this.client.request(
            "POST",
            DEPLOYED_PROMPT_ENDPOINT,
            data
        );
        return response.data;
    }

    public async recordFeedback(data: FeedbackRequest): Promise<void> {
        await new Promise(resolve => setTimeout(resolve, 2000)); // give logs time to update
        await this.client.request(
            "POST",
            RECORD_FEEDBACK_ENDPOINT,
            data
        );
    }
}

export default Parea;