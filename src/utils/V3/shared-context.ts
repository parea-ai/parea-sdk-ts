import { AsyncLocalStorage } from 'node:async_hooks';
import { TraceId } from './types';
import { TraceLog } from '../../types';

export class TraceContext {
  private traceStack: TraceId[] = [];
  private traceLogs: Map<TraceId, TraceLog> = new Map();

  pushTrace(traceLog: TraceLog): void {
    this.traceStack.push(traceLog.trace_id as TraceId);
    this.traceLogs.set(traceLog.trace_id as TraceId, traceLog);
  }

  popTrace(): TraceId | undefined {
    const traceId = this.traceStack.pop();
    if (traceId) {
      this.traceLogs.delete(traceId);
    }
    return traceId;
  }

  getCurrentTraceId(): TraceId | undefined {
    return this.traceStack[this.traceStack.length - 1];
  }

  getTraceLog(traceId: TraceId): TraceLog | undefined {
    return this.traceLogs.get(traceId);
  }

  updateTraceLog(traceId: TraceId, updates: Partial<TraceLog>): void {
    const traceLog = this.traceLogs.get(traceId);
    if (traceLog) {
      Object.assign(traceLog, updates);
    }
  }

  getRootTraceId(): TraceId | undefined {
    return this.traceStack[0];
  }

  getParentTraceId(): TraceId | undefined {
    return this.traceStack[this.traceStack.length - 2];
  }
}

export const asyncLocalStorage2 = new AsyncLocalStorage<TraceContext>();

export function getOrCreateTraceContext(): TraceContext {
  let context = asyncLocalStorage2.getStore();
  if (!context) {
    context = new TraceContext();
    asyncLocalStorage2.enterWith(context);
  }
  return context;
}
