// import { EvaluationResult, TraceLog, TraceOptions } from '../types';
// import { pareaLogger } from '../parea_logger';
// import { genTraceId, toDateTimeString } from '../helpers';
// import { asyncLocalStorage } from './LogDecorator';
//
// export type ContextObject = {
//   traceLog: TraceLog;
//   isRunningEval: boolean;
//   rootTraceId: string;
// };
//
// // export const asyncLocalStorage = new AsyncLocalStorage<Map<string, ContextObject>>();
// export const rootTraces = new Map<string, TraceLog>();
//
// export const executionOrderCounters = new Map<string, number>();
//
//
// type AsyncFunctionOrNot<TReturn, TArgs extends unknown[]> = (...args: TArgs) => Promise<TReturn> | TReturn;
//
// export const trace = <TReturn, TArgs extends unknown[]>(
//   funcName: string,
//   func: AsyncFunctionOrNot<TReturn, TArgs>,
//   options?: TraceOptions,
// ) => {
//   return async (...args: TArgs) => {
//     const traceId = genTraceId();
//     const startTimestamp = new Date();
//
//     const parentStore = asyncLocalStorage.getStore();
//     const parentTraceId = parentStore ? Array.from(parentStore.keys())[0] : undefined;
//     const isRootTrace = !parentTraceId; // It's a root trace if there is no parent.
//     // const rootTraceId = isRootTrace ? traceId : parentStore ? Array.from(parentStore.values())[0].rootTraceId : traceId;
//     const rootTraceId = isRootTrace
//       ? traceId
//       : parentStore
//         ? Array.from(parentStore.values())[0].traceLog.root_trace_id
//         : traceId;
//
//     const depth = parentStore ? Array.from(parentStore.values())[0].traceLog.depth + 1 : 0;
//     let executionOrder = 0;
//     if (rootTraceId) {
//       // Get the execution order counter for the current root trace
//       executionOrder = executionOrderCounters.get(rootTraceId) || 0;
//       executionOrderCounters.set(rootTraceId, executionOrder + 1);
//     }
//
//     let target: string | undefined;
//     const numParams = extractFunctionParamNames(func)?.length || 0;
//     if (args?.length > numParams && typeof args[args.length - 1] === 'string') {
//       target = args.pop() as string;
//     } else if (parentStore && parentTraceId) {
//       target = parentStore?.get(parentTraceId)?.traceLog.target;
//     }
//
//     const traceLog: TraceLog = {
//       trace_name: funcName,
//       trace_id: traceId,
//       parent_trace_id: parentTraceId || traceId,
//       root_trace_id: rootTraceId,
//       start_timestamp: toDateTimeString(startTimestamp),
//       inputs: extractFunctionParams(func, args),
//       metadata: options?.metadata,
//       tags: options?.tags,
//       target: target,
//       end_user_identifier: options?.endUserIdentifier,
//       session_id: options?.sessionId,
//       children: [],
//       status: 'success',
//       experiment_uuid: process.env.PAREA_OS_ENV_EXPERIMENT_UUID || null,
//       apply_eval_frac: options?.applyEvalFrac,
//       deployment_id: options?.deploymentId,
//       depth,
//       execution_order: executionOrder,
//     };
//
//     return asyncLocalStorage.run(new Map([[traceId, { traceLog, isRunningEval: false, rootTraceId }]]), async () => {
//       if (parentStore && parentTraceId) {
//         const parentTraceLog = parentStore.get(parentTraceId);
//         if (parentTraceLog) {
//           parentTraceLog.traceLog.children.push(traceId);
//           parentStore.set(parentTraceId, parentTraceLog);
//         }
//       }
//
//       try {
//         const result = await func(...args);
//         const output = typeof result === 'string' ? result : JSON.stringify(result);
//         let outputForEvalMetrics = output;
//         if (options?.accessOutputOfFunc) {
//           try {
//             outputForEvalMetrics = options?.accessOutputOfFunc(result);
//           } catch (e) {
//             console.error(`Error accessing output of func with output: ${output}. Error: ${e}`, e);
//           }
//         }
//         traceInsert(
//           {
//             output,
//             evaluation_metric_names: options?.evalFuncNames,
//             output_for_eval_metrics: outputForEvalMetrics,
//           },
//           traceId,
//         );
//         return result;
//       } catch (error: any) {
//         console.error(`Error occurred in function ${func.name}, ${error}`);
//         traceInsert({ error: error.toString(), status: 'error' }, traceId);
//         throw error;
//       } finally {
//         const endTimestamp = new Date();
//         traceInsert(
//           {
//             end_timestamp: toDateTimeString(endTimestamp),
//             latency: (endTimestamp.getTime() - startTimestamp.getTime()) / 1000,
//           },
//           traceId,
//         );
//         try {
//           if (options?.evalFuncs && traceLog.status === 'success') {
//             await handleRunningEvals(traceLog, traceId, options);
//           } else {
//             await pareaLogger.recordLog(traceLog);
//           }
//         } catch (e) {
//           console.error(`Error occurred recording log for trace ${traceId}, ${e}`);
//         }
//         if (isRootTrace) {
//           const finalTraceLog = asyncLocalStorage.getStore()?.get(rootTraceId)?.traceLog || traceLog;
//           rootTraces.set(rootTraceId, finalTraceLog);
//         }
//       }
//     });
//   };
// };
//
// export const handleRunningEvals = async (
//   traceLog: TraceLog,
//   traceId: string,
//   options: TraceOptions | undefined,
// ): Promise<void> => {
//   const store = asyncLocalStorage.getStore();
//   if (!store) {
//     console.warn('No active store found for handleRunningEvals.');
//     return;
//   }
//
//   const currentTraceData = store.get(traceId);
//   if (!currentTraceData) {
//     console.warn(`No trace data found for traceId ${traceId}.`);
//     return;
//   }
//
//   const applyEval = !options?.applyEvalFrac || Math.random() < options.applyEvalFrac;
//   if (options?.evalFuncs && traceLog.status === 'success' && applyEval) {
//     currentTraceData.isRunningEval = true;
//     store.set(traceId, currentTraceData);
//     let outputForEvalMetrics: string | undefined;
//
//     if (options?.accessOutputOfFunc) {
//       try {
//         const output = traceLog?.output ? JSON.parse(traceLog.output) : {};
//         const modifiedOutput = options.accessOutputOfFunc(output);
//         outputForEvalMetrics = JSON.stringify(modifiedOutput);
//       } catch (e) {
//         console.error(`Error accessing output of func with output: ${traceLog.output}. Error: ${e}`, e);
//         return;
//       }
//     } else {
//       outputForEvalMetrics = traceLog.output;
//     }
//
//     traceLog.output = outputForEvalMetrics;
//     const scores: EvaluationResult[] = [];
//     for (const func of options?.evalFuncs) {
//       try {
//         const score = await func(traceLog);
//         if (score !== undefined && score !== null) {
//           if (typeof score === 'number') {
//             scores.push({ name: func.name, score });
//           } else if (typeof score === 'boolean') {
//             scores.push({ name: func.name, score: score ? 1 : 0 });
//           } else if (Array.isArray(score)) {
//             scores.push(...score);
//           } else {
//             scores.push(score);
//           }
//         }
//       } catch (e) {
//         console.error(`Error occurred calling evaluation function '${func.name}', ${e}`, e);
//       }
//     }
//     traceLog.scores = scores;
//     currentTraceData.traceLog.scores = scores;
//     currentTraceData.isRunningEval = false;
//     store.set(traceId, currentTraceData);
//
//     try {
//       await pareaLogger.recordLog(traceLog);
//     } catch (e) {
//       console.error(`Error occurred updating log for trace ${traceId}, ${e}`);
//     }
//   }
// };
//
