import { TraceLog, TraceOptions } from '../types';
import { TraceManager } from './core/TraceManager';
import { extractFunctionParamNames, extractFunctionParams } from './helpers';

/**
 * Wraps a function with tracing functionality.
 * @param name The name of the trace.
 * @param fn The function to wrap.
 * @param options Additional options for the trace.
 * @returns The wrapped function.
 */
export function trace<T extends (...args: any[]) => any>(
  name: string,
  fn: T,
  options?: TraceOptions,
): (...args: Parameters<T>) => ReturnType<T> {
  return function (this: any, ...args: Parameters<T>): ReturnType<T> {
    const traceDisabled = process.env.PAREA_TRACE_ENABLED === 'false';
    if (traceDisabled) {
      return fn.apply(this, args);
    }

    const traceManager = TraceManager.getInstance();

    return traceManager.runInContext(() => {
      let target: string | undefined;
      const opts = options || {};
      const numParams = extractFunctionParamNames(fn)?.length || 0;
      if (args?.length > numParams && typeof args[args.length - 1] === 'string') {
        target = args.pop() as string;
        opts.target = target;
      }

      const trace = traceManager.createTrace(name, opts);
      const inputs = extractFunctionParams(fn, args);
      trace.updateLog({ inputs });

      try {
        const result = fn.apply(this, args);

        if (result instanceof Promise) {
          return result.then(
            (value) => {
              traceManager.setTraceOutput(trace, value, options?.accessOutputOfFunc);
              traceManager.finalizeTrace(trace);
              return value;
            },
            (error) => {
              trace.updateLog({ error: error.toString(), status: 'error' });
              traceManager.finalizeTrace(trace);
              throw error;
            },
          ) as ReturnType<T>;
        } else {
          traceManager.setTraceOutput(trace, result, options?.accessOutputOfFunc);
          traceManager.finalizeTrace(trace);
          return result;
        }
      } catch (error) {
        const msg = `Error occurred in traced function '${name}: trace_id: ${trace.id}', ${(
          error as Error
        ).toString()}`;
        console.error(msg, error);
        trace.updateLog({ error: msg, status: 'error' });
        traceManager.finalizeTrace(trace);
        throw error;
      }
    });
  };
}

/**
 * Inserts data into the current trace log or a specified trace log.
 * @param data The data to insert into the trace log.
 * @param traceId Optional trace ID to insert data into. If not provided, uses the current trace.
 */
export function traceInsert(data: Partial<TraceLog>, traceId?: string): void {
  const traceManager = TraceManager.getInstance();
  traceManager.insertTraceData(data, traceId);
}

export function getCurrentTraceId(): string | undefined {
  const traceManager = TraceManager.getInstance();
  return traceManager.getCurrentTraceId();
}
