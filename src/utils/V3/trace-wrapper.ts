import { Tracer } from './tracer';
import { PareaConfiguration } from './configuration';
import { TraceLog, TraceOptions } from '../../types';
import { TraceId } from './types';
import { getOrCreateTraceContext } from './shared-context';

type AsyncFunctionOrNot<TReturn, TArgs extends unknown[]> = (...args: TArgs) => Promise<TReturn> | TReturn;

export class TraceWrapper {
  private tracer: Tracer;

  constructor() {
    const config = new PareaConfiguration();
    this.tracer = new Tracer(config);
  }

  trace<TReturn, TArgs extends unknown[]>(
    funcName: string,
    func: AsyncFunctionOrNot<TReturn, TArgs>,
    options?: TraceOptions,
  ) {
    return async (...args: TArgs): Promise<TReturn> => {
      getOrCreateTraceContext();

      const traceId = this.tracer.startTrace({
        trace_name: funcName,
        metadata: options?.metadata,
        tags: options?.tags,
        end_user_identifier: options?.endUserIdentifier,
        session_id: options?.sessionId,
        apply_eval_frac: options?.applyEvalFrac,
        deployment_id: options?.deploymentId,
      });

      let target: string | undefined;
      const numParams = this.extractFunctionParamNames(func)?.length || 0;
      if (args?.length > numParams && typeof args[args.length - 1] === 'string') {
        target = args.pop() as string;
      }

      this.tracer.updateTrace(traceId, {
        inputs: this.extractFunctionParams(func, args),
        target,
      });

      try {
        const result = await func(...args);
        const output = typeof result === 'string' ? result : JSON.stringify(result);
        this.tracer.updateTrace(traceId, {
          output,
          evaluation_metric_names: options?.evalFuncNames,
        });
        return result;
      } catch (error: any) {
        console.error(`Error occurred in function ${func.name}, ${error}`);
        this.tracer.updateTrace(traceId, { error: error.toString(), status: 'error' });
        throw error;
      } finally {
        if (options?.evalFuncs) {
          await this.tracer.runEvaluations(traceId, options);
        }
        this.tracer.endTrace(traceId);
      }
    };
  }

  traceInsert(data: Partial<TraceLog>, traceId?: TraceId): void {
    this.tracer.insertTraceData(data, traceId);
  }

  private extractFunctionParamNames(func: Function): string[] {
    try {
      const functionString = func.toString();
      const match = functionString.match(/\(([^)]*)\)/);
      if (!match) return [];

      const paramNamesRaw = match[1];
      return paramNamesRaw
        .split(',')
        .map((param) => {
          const match = param.trim().match(/(\w+)/);
          return match ? match[0] : '';
        })
        .filter((param) => param !== '');
    } catch (e) {
      console.error(`Error extracting function param names: ${e}`);
      return [];
    }
  }

  private extractFunctionParams(func: Function, args: any[]): { [key: string]: any } {
    const paramNames = this.extractFunctionParamNames(func);
    return paramNames.reduce((acc, paramName, index) => {
      return {
        ...acc,
        [paramName]:
          typeof args[index] === 'string'
            ? args[index]
            : Array.isArray(args[index])
            ? args[index]
            : JSON.stringify(args[index]),
      };
    }, {});
  }
}

// Create a singleton instance of TraceWrapper
const traceWrapper = new TraceWrapper();

// Export the trace function and traceInsert from the singleton instance
export const trace2 = traceWrapper.trace.bind(traceWrapper);
export const traceInsert2 = traceWrapper.traceInsert.bind(traceWrapper);
