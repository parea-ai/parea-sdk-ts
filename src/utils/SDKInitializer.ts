import { LogWorker } from './LogWorker';

export class SDKInitializer {
  private static instance: SDKInitializer;
  private logWorker: LogWorker;

  constructor() {
    this.logWorker = new LogWorker();
    this.logWorker.start();
  }

  public static initialize(): void {
    if (!SDKInitializer.instance) {
      SDKInitializer.instance = new SDKInitializer();
    }
  }

  static async forceSendLogs() {
    SDKInitializer.getInstance().forceSendLogs();
  }

  private static getInstance() {
    if (!SDKInitializer.instance) {
      SDKInitializer.instance = new SDKInitializer();
    }
    return SDKInitializer.instance;
  }

  public forceSendLogs(): void {
    this.logWorker.batcher.flush();
  }
}
