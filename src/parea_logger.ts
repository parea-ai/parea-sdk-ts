import HTTPClient from "./api-client.js";
import {TraceLog} from "./types.js";


const LOG_ENDPOINT = "/trace_log";

class PareaLogger {
    private client: HTTPClient;

    constructor() {
        this.client = HTTPClient.getInstance();
    }

    public setClient(client: HTTPClient): void {
        this.client = client;
    }

    public async recordLog(data: TraceLog): Promise<void> {
        await this.client.request(
            "POST",
            LOG_ENDPOINT,
            data
        );
    }
}

const pareaLogger = new PareaLogger();

export default pareaLogger;