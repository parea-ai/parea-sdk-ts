// LogDecorator.ts
import { MessageQueue } from './MessageQueue';
import { ITraceLog } from '../types';
import { genTraceId } from '../helpers';
import { TraceContext } from './TraceContext';
import { AsyncLocalStorage } from 'node:async_hooks';

const asyncLocalStorage = new AsyncLocalStorage<Map<string, TraceContext>>();

export function LogDecorator(sampleRate: number = 100) {
  return function <T extends object, R, A extends any[]>(
    target: T,
    propertyKey: string,
    descriptor: TypedPropertyDescriptor<(this: T, ...args: A) => R>,
  ): TypedPropertyDescriptor<(this: T, ...args: A) => R> {
    const originalMethod = descriptor.value;

    if (originalMethod) {
      descriptor.value = function (this: T, ...args: A): R {
        const traceEnabled = process.env.PAREA_TRACE_ENABLED !== 'false';
        const shouldSample = Math.random() * 100 < sampleRate;

        if (!traceEnabled || !shouldSample) {
          return originalMethod.apply(this, args);
        }

        const traceId = genTraceId();
        const traceContextMap = asyncLocalStorage.getStore() || new Map<string, TraceContext>();
        const parentContext = traceContextMap.get(traceContextMap.keys().next().value);
        const rootTraceId = parentContext?.rootTraceId || traceId;
        const parentTraceId = parentContext?.traceId;

        const traceContext = new TraceContext(traceId, rootTraceId, parentTraceId);
        traceContextMap.set(traceId, traceContext);

        return asyncLocalStorage.run(traceContextMap, () => {
          const startTime = Date.now();
          let outputValue: R;
          let error: Error | undefined;

          try {
            outputValue = originalMethod.apply(this, args);
            const endTime = Date.now();
            const traceLog: ITraceLog = {
              traceId,
              rootTraceId,
              parentTraceId,
              children: [],
              functionName: propertyKey,
              inputParams: args,
              outputValue,
              startTimestamp: startTime,
              endTimestamp: endTime,
            };
            MessageQueue.enqueue(traceLog);

            // Update the parent trace context's children array
            if (parentTraceId) {
              const parentContext = traceContextMap.get(parentTraceId);
              if (parentContext) {
                parentContext.children.push(traceId);
              }
            }

            return outputValue;
          } catch (err) {
            error = err as Error;
            const endTime = Date.now();
            const traceLog: ITraceLog = {
              traceId,
              rootTraceId,
              parentTraceId,
              children: [],
              functionName: propertyKey,
              inputParams: args,
              outputValue: undefined,
              startTimestamp: startTime,
              endTimestamp: endTime,
              error,
            };
            MessageQueue.enqueue(traceLog);

            // Update the parent trace context's children array
            if (parentTraceId) {
              const parentContext = traceContextMap.get(parentTraceId);
              if (parentContext) {
                parentContext.children.push(traceId);
              }
            }

            throw err;
          }
        });
      };
    }

    return descriptor;
  };
}
