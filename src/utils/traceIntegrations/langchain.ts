import { LangchainRun, TraceIntegrations } from '../../types';
import { pareaLogger, PareaLogger } from '../../parea_logger';
import { BaseTracer } from '@langchain/core/tracers/base';
import { BaseCallbackHandlerInput } from '@langchain/core/callbacks/base';

/**
 * Interface representing the fields for the LangChain tracer.
 * @extends BaseCallbackHandlerInput
 */
export type LangChainTracerFields = BaseCallbackHandlerInput & {
  exampleId?: string;
  projectName?: string;
  client?: PareaLogger;
};

/**
 * A tracer class for LangChain integration with Parea AI.
 * @extends BaseTracer
 * @implements LangChainTracerFields
 */
export class PareaAILangchainTracer extends BaseTracer implements LangChainTracerFields {
  name = 'parea_ai_langchain_tracer';

  projectName?: string;

  parentTraceId: string;

  exampleId?: string;

  client: PareaLogger;

  /**
   * Creates an instance of PareaAILangchainTracer.
   * @param {LangChainTracerFields} fields - The fields to initialize the tracer with.
   */
  constructor(fields: LangChainTracerFields = {}) {
    super(fields);
    const { exampleId, projectName } = fields;

    this.projectName = projectName ?? process.env.LANGCHAIN_PROJECT ?? 'default';
    this.exampleId = exampleId;
    this.client = pareaLogger;
  }

  /**
   * Retrieves the parent trace ID.
   * @returns {Promise<string>} A promise that resolves to the parent trace ID.
   */
  async getParentTraceId(): Promise<string> {
    return this.parentTraceId;
  }

  /**
   * Persists a LangChain run by recording it as a vendor log.
   * @param {LangchainRun} _run - The LangChain run to persist.
   * @returns {Promise<void>} A promise that resolves when the run is persisted.
   * @throws {Error} If there's an error recording the log.
   */
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
