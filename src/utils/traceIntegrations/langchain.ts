import { LangchainRun, TraceIntegrations } from '../../types';
import { pareaLogger, PareaLogger } from '../../parea_logger';
import { BaseTracer } from '@langchain/core/tracers/base';
import { BaseCallbackHandlerInput } from '@langchain/core/callbacks/base';

export type LangChainTracerFields = BaseCallbackHandlerInput & {
  exampleId?: string;
  projectName?: string;
  client?: PareaLogger;
};

export class PareaAILangchainTracer extends BaseTracer implements LangChainTracerFields {
  name = 'parea_ai_langchain_tracer';

  projectName?: string;

  parentTraceId: string;

  exampleId?: string;

  client: PareaLogger;

  constructor(fields: LangChainTracerFields = {}) {
    super(fields);
    const { exampleId, projectName } = fields;

    this.projectName = projectName ?? process.env.LANGCHAIN_PROJECT ?? 'default';
    this.exampleId = exampleId;
    this.client = pareaLogger;
  }

  async getParentTraceId(): Promise<string> {
    return this.parentTraceId;
  }

  protected async persistRun(_run: LangchainRun): Promise<void> {
    this.parentTraceId = _run.id;
    try {
      // fire and forget
      // noinspection ES6MissingAwait
      this.client.recordVendorLog(_run, TraceIntegrations.LANGCHAIN);
    } catch (e) {
      console.error(`Error recording log for trace ${_run.id}: ${e}`);
    }
  }
}
