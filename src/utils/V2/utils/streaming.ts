export class AsyncIterableWrapper<T> implements AsyncIterable<T> {
  constructor(
    private source: AsyncIterable<T>,
    private onChunk: (chunk: T) => void,
  ) {}

  async *[Symbol.asyncIterator](): AsyncIterator<T> {
    for await (const chunk of this.source) {
      this.onChunk(chunk);
      yield chunk;
    }
  }
}
