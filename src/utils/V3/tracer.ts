import { Configuration, TraceId } from './types';
import { EvaluationResult, TraceLog, TraceOptions } from '../../types';
import { genTraceId, toDateTimeString } from '../../helpers';
import { pareaLogger } from '../../parea_logger';
import { getOrCreateTraceContext } from './shared-context';

export class Tracer {
  private config: Configuration;
  private executionOrderCounters: Map<TraceId, number>;

  constructor(config: Configuration) {
    this.config = config;
    this.executionOrderCounters = new Map();
  }

  startTrace(initialData: Partial<TraceLog>): TraceId {
    const context = getOrCreateTraceContext();
    const traceId = genTraceId() as TraceId;
    const parentTraceId = context.getParentTraceId();
    const rootTraceId = context.getRootTraceId() || traceId;
    const depth = parentTraceId ? (context.getTraceLog(parentTraceId)?.depth ?? 0) + 1 : 0;

    const executionOrder = this.getNextExecutionOrder(rootTraceId);

    const traceLog: TraceLog = {
      ...initialData,
      trace_id: traceId,
      parent_trace_id: parentTraceId,
      root_trace_id: rootTraceId,
      start_timestamp: toDateTimeString(new Date()),
      children: [],
      status: 'success',
      experiment_uuid: this.config.getExperimentUUID(),
      depth,
      execution_order: executionOrder,
    };

    context.pushTrace(traceLog);

    if (parentTraceId) {
      const parentTraceLog = context.getTraceLog(parentTraceId);
      if (parentTraceLog) {
        parentTraceLog.children.push(traceId);
      }
    }

    return traceId;
  }

  insertTraceData(data: Partial<TraceLog>, traceId?: TraceId): void {
    const context = getOrCreateTraceContext();
    const currentTraceId = traceId || context.getCurrentTraceId();
    if (!currentTraceId) {
      console.warn('No current trace ID found for traceInsert.');
      return;
    }

    const traceLog = context.getTraceLog(currentTraceId);
    if (!traceLog) {
      console.warn(`No trace data found for traceId ${currentTraceId}.`);
      return;
    }

    context.updateTraceLog(currentTraceId, this.mergeTraceData(traceLog, data));
  }

  updateTrace(traceId: TraceId, data: Partial<TraceLog>): void {
    const context = getOrCreateTraceContext();
    const traceLog = context.getTraceLog(traceId);
    if (!traceLog) {
      console.warn(`No trace data found for traceId ${traceId}`);
      return;
    }

    context.updateTraceLog(traceId, this.mergeTraceData(traceLog, data));
  }

  getTraceLog(traceId: TraceId): TraceLog | undefined {
    const context = getOrCreateTraceContext();
    return context.getTraceLog(traceId);
  }

  endTrace(traceId: TraceId): void {
    const context = getOrCreateTraceContext();
    const traceLog = context.getTraceLog(traceId);
    if (!traceLog) {
      console.error(`No trace data found for traceId ${traceId}`);
      return;
    }

    const endTimestamp = new Date();
    this.updateTrace(traceId, {
      end_timestamp: toDateTimeString(endTimestamp),
      latency: (endTimestamp.getTime() - new Date(traceLog.start_timestamp).getTime()) / 1000,
    });

    try {
      pareaLogger.recordLog(traceLog).catch((e) => {
        console.error(`Error recording log for trace ${traceId}: ${e}`);
      });
    } catch (e) {
      console.error(`Error initiating log recording for trace ${traceId}: ${e}`);
    }

    context.popTrace();
  }

  async runEvaluations(traceId: TraceId, options: TraceOptions): Promise<void> {
    const context = getOrCreateTraceContext();
    const traceLog = context.getTraceLog(traceId);
    if (!traceLog) {
      console.warn(`No trace data found for traceId ${traceId}.`);
      return;
    }

    if (options.evalFuncs && traceLog.status === 'success' && this.shouldApplyEval(options)) {
      traceLog.output = this.prepareOutputForEvalMetrics(traceLog, options);

      const scores: EvaluationResult[] = await this.executeEvaluationFunctions(traceLog, options.evalFuncs);

      this.updateTrace(traceId, { scores });

      try {
        await pareaLogger.recordLog(traceLog);
      } catch (e) {
        console.error(`Error occurred updating log for trace ${traceId}, ${e}`);
      }
    }
  }

  private getNextExecutionOrder(rootTraceId: TraceId): number {
    let executionOrder = this.executionOrderCounters.get(rootTraceId) ?? 0;
    executionOrder++;
    this.executionOrderCounters.set(rootTraceId, executionOrder);
    return executionOrder;
  }

  private mergeTraceData(oldData: TraceLog, newData: Partial<TraceLog>): TraceLog {
    const mergedData = { ...oldData };
    for (const [key, value] of Object.entries(newData)) {
      if (Array.isArray(mergedData[key as keyof TraceLog]) && Array.isArray(value)) {
        (mergedData[key as keyof TraceLog] as any[]).push(...value);
      } else if (typeof mergedData[key as keyof TraceLog] === 'object' && typeof value === 'object') {
        // @ts-ignore
        mergedData[key as keyof TraceLog] = {
          ...(mergedData[key as keyof TraceLog] as object),
          ...(value as object),
        };
      } else {
        // @ts-ignore
        mergedData[key as keyof TraceLog] = value as any;
      }
    }
    return mergedData;
  }

  private shouldApplyEval(options: TraceOptions): boolean {
    return !options.applyEvalFrac || Math.random() < options.applyEvalFrac;
  }

  private prepareOutputForEvalMetrics(traceLog: TraceLog, options: TraceOptions): string {
    if (options.accessOutputOfFunc) {
      try {
        const output = traceLog.output ? JSON.parse(traceLog.output) : {};
        return JSON.stringify(options.accessOutputOfFunc(output));
      } catch (e) {
        console.error(`Error accessing output of func with output: ${traceLog.output}. Error: ${e}`);
        return traceLog.output || '';
      }
    }
    return traceLog.output || '';
  }

  private async executeEvaluationFunctions(traceLog: TraceLog, evalFuncs: Function[]): Promise<EvaluationResult[]> {
    const scores: EvaluationResult[] = [];
    for (const func of evalFuncs) {
      try {
        const score = await func(traceLog);
        if (score !== undefined && score !== null) {
          if (typeof score === 'number') {
            scores.push({ name: func.name, score });
          } else if (typeof score === 'boolean') {
            scores.push({ name: func.name, score: score ? 1 : 0 });
          } else if (Array.isArray(score)) {
            scores.push(...score);
          } else {
            scores.push(score);
          }
        }
      } catch (e) {
        console.error(`Error occurred calling evaluation function '${func.name}', ${e}`);
      }
    }
    return scores;
  }
}
