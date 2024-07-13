import { TraceLog, TraceOptions } from '../../../types';
import { TraceManager } from '../core/TraceManager';

/**
 * Wraps a function with tracing functionality.
 * @param name The name of the trace.
 * @param fn The function to wrap.
 * @param options Additional options for the trace.
 * @returns The wrapped function.
 */
export function trace3<T extends (...args: any[]) => any>(
  name: string,
  fn: T,
  options?: TraceOptions,
): (...args: Parameters<T>) => ReturnType<T> {
  return function (this: any, ...args: Parameters<T>): ReturnType<T> {
    const traceManager = TraceManager.getInstance();

    if (options?.evalFuncs) {
      traceManager.setEvalFuncs(options.evalFuncs);
    }

    const trace = traceManager.createTrace(name, options);

    try {
      const result = fn.apply(this, args);

      if (result instanceof Promise) {
        return result.then(
          (value) => {
            traceManager.setTraceOutput(trace, value, options?.accessOutputOfFunc);
            // fire and forget
            // noinspection JSIgnoredPromiseFromCall
            traceManager.finalizeTrace(trace);
            return value;
          },
          (error) => {
            trace.updateLog({ error: error.toString(), status: 'error' });
            // fire and forget
            // noinspection JSIgnoredPromiseFromCall
            traceManager.finalizeTrace(trace);
            throw error;
          },
        ) as ReturnType<T>;
      } else {
        traceManager.setTraceOutput(trace, result, options?.accessOutputOfFunc);
        // fire and forget
        // noinspection JSIgnoredPromiseFromCall
        traceManager.finalizeTrace(trace);
        return result;
      }
    } catch (error) {
      trace.updateLog({ error: (error as Error).toString(), status: 'error' });
      // fire and forget
      // noinspection JSIgnoredPromiseFromCall
      traceManager.finalizeTrace(trace);
      throw error;
    }
  };
}

/**
 * Inserts data into the current trace log or a specified trace log.
 * @param data The data to insert into the trace log.
 * @param traceId Optional trace ID to insert data into. If not provided, uses the current trace.
 */
export function traceInsert3(data: Partial<TraceLog>, traceId?: string): void {
  const traceManager = TraceManager.getInstance();
  traceManager.insertTraceData(data, traceId);
}
