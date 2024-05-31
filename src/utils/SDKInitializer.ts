import { LogWorker } from './LogWorker';

export class SDKInitializer {
  private static instance: SDKInitializer;
  private logWorker: LogWorker;

  private constructor() {
    this.logWorker = new LogWorker();
    this.logWorker.start();
  }

  public static initialize(): void {
    if (!SDKInitializer.instance) {
      SDKInitializer.instance = new SDKInitializer();
    }
  }
}
