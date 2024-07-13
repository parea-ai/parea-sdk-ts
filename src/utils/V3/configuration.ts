import { Configuration } from './types';

export class PareaConfiguration implements Configuration {
  private experimentUUID: string | null;

  constructor() {
    this.experimentUUID = process.env.PAREA_OS_ENV_EXPERIMENT_UUID || null;
  }

  getExperimentUUID(): string | null {
    return this.experimentUUID;
  }
}
