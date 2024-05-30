export class TraceContext {
  constructor(
    public readonly traceId: string,
    public readonly rootTraceId: string,
    public readonly parentTraceId?: string,
    public readonly children: string[] = [],
  ) {}
}
