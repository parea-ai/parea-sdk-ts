// import { KVMap, LangchainBaseRun, LangchainRunCreate, LangchainRunUpdate, TraceIntegrations } from '../../types';
// import { getRuntimeEnvironment } from '../env';
// import { pareaLogger, PareaLogger } from '../../parea_logger';
//
//
// export interface Run extends LangchainBaseRun {
//   id: string;
//   child_runs: this[];
//   child_execution_order: number;
// }
//
// export interface RunUpdate extends LangchainRunUpdate {
//   events: LangchainBaseRun['events'];
//   inputs: KVMap;
// }
//
// export interface LangChainTracerFields extends BaseCallbackHandlerInput {
//   exampleId?: string;
//   projectName?: string;
//   client?: PareaLogger;
// }
//
// export class PareaAILangchainTracer extends BaseTracer implements LangChainTracerFields {
//   name = 'parea_ai_langchain_tracer';
//
//   projectName?: string;
//
//   parentTraceId: string;
//
//   exampleId?: string;
//
//   client: PareaLogger;
//
//   constructor(fields: LangChainTracerFields = {}) {
//     super(fields);
//     const { exampleId, projectName } = fields;
//
//     this.projectName = projectName ?? process.env.LANGCHAIN_PROJECT ?? 'default';
//     this.exampleId = exampleId;
//     this.client = pareaLogger;
//   }
//
//   async onRetrieverStart(run: Run): Promise<void> {
//     await this._persistRunSingle(run);
//   }
//
//   async onRetrieverEnd(run: Run): Promise<void> {
//     await this._updateRunSingle(run);
//   }
//
//   async onRetrieverError(run: Run): Promise<void> {
//     await this._updateRunSingle(run);
//   }
//
//   async onLLMStart(run: Run): Promise<void> {
//     await this._persistRunSingle(run);
//   }
//
//   async onLLMEnd(run: Run): Promise<void> {
//     await this._updateRunSingle(run);
//   }
//
//   async onLLMError(run: Run): Promise<void> {
//     await this._updateRunSingle(run);
//   }
//
//   async onChainStart(run: Run): Promise<void> {
//     await this._persistRunSingle(run);
//   }
//
//   async onChainEnd(run: Run): Promise<void> {
//     await this._updateRunSingle(run);
//   }
//
//   async onChainError(run: Run): Promise<void> {
//     await this._updateRunSingle(run);
//   }
//
//   async onToolStart(run: Run): Promise<void> {
//     await this._persistRunSingle(run);
//   }
//
//   async onToolEnd(run: Run): Promise<void> {
//     await this._updateRunSingle(run);
//   }
//
//   async onToolError(run: Run): Promise<void> {
//     await this._updateRunSingle(run);
//   }
//
//   async getParentTraceId(): Promise<string> {
//     return this.parentTraceId;
//   }
//
//   protected async persistRun(_run: Run): Promise<void> {
//   }
//
//   protected async _persistRunSingle(run: Run): Promise<void> {
//     this.parentTraceId = run.parent_run_id || run.id;
//     const persistedRun: LangchainRunCreate = await this._convertToCreate(run, this.exampleId);
//     await this.client.recordVendorLog(persistedRun, TraceIntegrations.LANGCHAIN);
//   }
//
//   protected async _updateRunSingle(run: Run): Promise<void> {
//     const runUpdate: RunUpdate = {
//       end_time: run.end_time,
//       error: run.error,
//       outputs: run.outputs,
//       events: run.events,
//       inputs: run.inputs,
//     };
//     await this.client.updateLog({
//       trace_id: run.id,
//       field_name_to_value_map: runUpdate,
//     });
//   }
//
//   private async _convertToCreate(run: Run, example_id: string | undefined = undefined): Promise<LangchainRunCreate> {
//     return {
//       ...run,
//       extra: {
//         ...run.extra,
//         runtime: await getRuntimeEnvironment(),
//       },
//       child_runs: undefined,
//       session_name: this.projectName,
//       reference_example_id: run.parent_run_id ? undefined : example_id,
//     };
//   }
// }
